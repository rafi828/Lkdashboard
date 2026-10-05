const { getPool } = require('../../../lib/db');
const { requirePermission, getDataScope } = require('../../../lib/access');

const DOMAIN_ORDER = ['מכירות סיטונאים', 'סניפי ל.כ', 'מוסדיים', 'משווקים', 'משרד הביטחון'];
const UNCLASSIFIED = 'לא מסווג';

// מגמות "תקציב מול ביצוע": לכל חודש בשנה שנבחרה - יעד ובפועל, ואותם נתונים לשנה הקודמת.
// סינון אופציונלי לפי תחום (domain) ולפי סוכן (agent_code). אותן הרשאות כמו בדוח עצמו.
export default async function handler(req, res) {
  const currentUser = await requirePermission(req, res, 'targets.view');
  if (!currentUser) return;

  const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
  const domainFilter = req.query.domain || null;
  const agentFilter = req.query.agent_code ? parseInt(req.query.agent_code, 10) : null;

  const pool = getPool();
  const visibility = getDataScope(currentUser);

  const { rows: yearRows } = await pool.query(
    `SELECT DISTINCT year FROM agent_sales_monthly UNION SELECT DISTINCT year FROM agent_targets ORDER BY year DESC`
  );
  const years = yearRows.map((r) => r.year);
  if (!years.includes(year)) years.unshift(year);

  const emptyMonths = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, actual: null, target: 0, prevActual: null, prevTarget: 0 }));

  // סוכנים מסווגים (לפי הרשאה)
  let classRows;
  if (visibility.all) {
    ({ rows: classRows } = await pool.query('SELECT agent_code, agent_name, domain FROM agent_classification'));
  } else if (visibility.codes.length === 0) {
    return res.status(200).json({ year, years, domains: [], agents: [], months: emptyMonths, noAgentCode: true });
  } else {
    ({ rows: classRows } = await pool.query(
      'SELECT agent_code, agent_name, domain FROM agent_classification WHERE agent_code = ANY($1::int[])',
      [visibility.codes]
    ));
  }
  const classByCode = {};
  classRows.forEach((r) => { classByCode[r.agent_code] = r; });

  // בעל הרשאת "הכל" רואה גם סוכנים לא מסווגים (כמו בדוח). אחרת - רק סוכנים מסווגים מתוך הקודים שלו.
  const codeFilter = visibility.all ? null : classRows.map((r) => r.agent_code);
  const params = [year, year - 1, codeFilter];
  const [{ rows: salesRows }, { rows: targetRows }] = await Promise.all([
    pool.query(
      `SELECT agent_code, year, month, SUM(sales_amount) AS amount, MAX(agent_name) AS agent_name
       FROM agent_sales_monthly
       WHERE year IN ($1, $2) AND ($3::int[] IS NULL OR agent_code = ANY($3::int[]))
       GROUP BY agent_code, year, month`,
      params
    ),
    pool.query(
      `SELECT agent_code, year, month, SUM(target_amount) AS amount, MAX(agent_name) AS agent_name
       FROM agent_targets
       WHERE year IN ($1, $2) AND ($3::int[] IS NULL OR agent_code = ANY($3::int[]))
       GROUP BY agent_code, year, month`,
      params
    ),
  ]);

  // רשימת הסוכנים שיש להם נתונים בשנה הזו או בקודמת
  const agentsByCode = {};
  [...salesRows, ...targetRows].forEach((r) => {
    if (agentsByCode[r.agent_code]) return;
    const c = classByCode[r.agent_code];
    agentsByCode[r.agent_code] = {
      agent_code: r.agent_code,
      agent_name: c?.agent_name || r.agent_name || null,
      domain: c?.domain || UNCLASSIFIED,
    };
  });
  const agents = Object.values(agentsByCode).sort((a, b) => (a.agent_name || '').localeCompare(b.agent_name || '', 'he'));

  const domainSet = new Set(agents.map((a) => a.domain));
  const domains = [
    ...DOMAIN_ORDER.filter((d) => domainSet.has(d)),
    ...[...domainSet].filter((d) => !DOMAIN_ORDER.includes(d) && d !== UNCLASSIFIED).sort(),
    ...(domainSet.has(UNCLASSIFIED) ? [UNCLASSIFIED] : []),
  ];

  const selected = new Set(
    agents
      .filter((a) => (!domainFilter || a.domain === domainFilter) && (!agentFilter || a.agent_code === agentFilter))
      .map((a) => a.agent_code)
  );

  // בפועל = null לחודש שאין עליו בכלל נתוני מכירות (עוד לא נטען / חודש עתידי), כדי שהקו ייקטע ולא יירד ל-0
  const months = emptyMonths.map((m) => ({ ...m }));
  salesRows.forEach((r) => {
    if (!selected.has(r.agent_code)) return;
    const m = months[r.month - 1];
    const key = r.year === year ? 'actual' : 'prevActual';
    m[key] = (m[key] || 0) + Number(r.amount);
  });
  targetRows.forEach((r) => {
    if (!selected.has(r.agent_code)) return;
    const m = months[r.month - 1];
    const key = r.year === year ? 'target' : 'prevTarget';
    m[key] += Number(r.amount);
  });

  return res.status(200).json({ year, years, domains, agents, months, noAgentCode: false });
}
