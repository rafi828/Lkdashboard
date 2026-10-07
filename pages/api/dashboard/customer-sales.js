const { getPool } = require('../../../lib/db');
const { requirePermission, getDataScope } = require('../../../lib/access');

// סדר עמודות "פרטי לקוח" בדוח: המוכרות קודם, השאר אחריהן לפי א"ב
const DETAIL_ORDER = [/^קבוצה$/, /^קוד קבוצה$/, /טלפון/, /נייד/, /פקס/, /מייל|דוא"?ל|email/i, /כתובת/, /עיר|ישוב/, /ח\.?פ|עוסק/];
function detailRank(name) {
  const i = DETAIL_ORDER.findIndex((re) => re.test(name));
  return i === -1 ? DETAIL_ORDER.length : i;
}

// GET נתוני "מכירות ללקוח". כל החישובים (תקופות, השוואות, סינונים) נעשים במסך.
// סוכן: רק שורות מכירה עם קוד הסוכן שלו, ורק לקוחות שיש להם מכירה אצלו או שהוא הסוכן בכרטיס הלקוח.
export default async function handler(req, res) {
  const currentUser = await requirePermission(req, res, 'custsales.view');
  if (!currentUser) return;

  const scope = getDataScope(currentUser);
  if (!scope.all && scope.codes.length === 0) {
    return res.status(200).json({ customers: [], sales: [], agents: [], detailColumns: [], loaded: [], noAgentCode: true });
  }
  const codes = scope.all ? null : scope.codes;

  const pool = getPool();
  const { rows: sales } = await pool.query(
    `SELECT customer_id::text AS customer_id, agent_code, agent_name, year, month, amount::float AS amount
     FROM customer_sales_monthly
     WHERE ($1::int[] IS NULL OR agent_code = ANY($1::int[]))
     ORDER BY year, month`,
    [codes]
  );

  // שמות הסוכן (לזיהוי לקוחות בלי מכירות שבכרטיס שלהם רשום הסוכן הזה - בכרטיס יש רק שם)
  let agentNames = null;
  if (codes) {
    const { rows } = await pool.query(
      `SELECT DISTINCT agent_name FROM customer_sales_monthly WHERE agent_code = ANY($1::int[]) AND agent_name IS NOT NULL
       UNION SELECT agent_name FROM agent_classification WHERE agent_code = ANY($1::int[]) AND agent_name IS NOT NULL`,
      [codes]
    );
    agentNames = rows.map((r) => r.agent_name);
  }

  const { rows: customers } = await pool.query(
    `SELECT customer_id::text AS id, customer_name AS name, agent_name, details
     FROM customers c
     WHERE $1::boolean
        OR c.agent_name = ANY($2::varchar[])
        OR EXISTS (SELECT 1 FROM customer_sales_monthly s WHERE s.customer_id = c.customer_id AND s.agent_code = ANY($3::int[]))
     ORDER BY customer_name`,
    [!codes, agentNames || [], codes || []]
  );

  // שם הסוכן העדכני לכל קוד (מהחודש האחרון שבו הופיע)
  const agentMap = new Map();
  sales.forEach((s) => agentMap.set(s.agent_code, s.agent_name || agentMap.get(s.agent_code) || ''));
  const agents = [...agentMap.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code - b.code);

  const detailSet = new Set();
  customers.forEach((c) => Object.keys(c.details || {}).forEach((k) => detailSet.add(k)));
  const detailColumns = [...detailSet].sort((a, b) => detailRank(a) - detailRank(b) || a.localeCompare(b, 'he'));

  // החודשים שנטענו (כלל המערכת - לא תלוי בסוכן)
  const { rows: loadedRows } = await pool.query(
    'SELECT DISTINCT year, month FROM customer_sales_monthly ORDER BY year, month'
  );
  const loaded = [];
  loadedRows.forEach((r) => {
    let y = loaded.find((l) => l.year === r.year);
    if (!y) loaded.push((y = { year: r.year, months: [] }));
    y.months.push(r.month);
  });

  return res.status(200).json({
    customers,
    // דחוס: [מספר לקוח, קוד סוכן, שנה, חודש, סכום]
    sales: sales.map((s) => [s.customer_id, s.agent_code, s.year, s.month, s.amount]),
    agents,
    detailColumns,
    loaded,
  });
}
