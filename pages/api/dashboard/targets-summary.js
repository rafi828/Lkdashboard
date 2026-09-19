const { getPool } = require('../../../lib/db');
const { getUserFromRequest } = require('../../../lib/auth');
const { getVisibleAgentCodes } = require('../../../lib/agent-permissions');
const { getPeriodDefinition, computeAgentTotals } = require('../../../lib/calculations');

const DOMAIN_ORDER = ['מכירות סיטונאים', 'סניפי ל.כ', 'מוסדיים', 'משווקים', 'משרד הביטחון'];

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });

  const period = req.query.period === 'ytd' ? 'ytd' : 'mtd';
  const now = new Date();
  const year = req.query.year ? parseInt(req.query.year, 10) : now.getFullYear();
  const month = req.query.month ? parseInt(req.query.month, 10) : now.getMonth() + 1;

  const pool = getPool();
  const visibility = await getVisibleAgentCodes(currentUser);

  // כל הסוכנים המסווגים (מסוננים לפי הרשאה)
  let classRows;
  if (visibility.all) {
    ({ rows: classRows } = await pool.query('SELECT agent_code, agent_name, domain FROM agent_classification'));
  } else {
    if (visibility.codes.length === 0) {
      classRows = [];
    } else {
      ({ rows: classRows } = await pool.query(
        'SELECT agent_code, agent_name, domain FROM agent_classification WHERE agent_code = ANY($1::int[])',
        [visibility.codes]
      ));
    }
  }

  const allCodes = classRows.map((r) => r.agent_code);
  const periodDef = getPeriodDefinition(period, year, month);
  const totalsByCode = await computeAgentTotals(allCodes, periodDef);

  // קיבוץ לפי תחום
  const domains = {};
  DOMAIN_ORDER.forEach((d) => (domains[d] = { domain: d, actual: 0, target: 0, agents: [] }));

  classRows.forEach((r) => {
    if (!domains[r.domain]) domains[r.domain] = { domain: r.domain, actual: 0, target: 0, agents: [] };
    const t = totalsByCode[r.agent_code] || { actual: 0, target: 0 };
    domains[r.domain].actual += t.actual;
    domains[r.domain].target += t.target;
    domains[r.domain].agents.push({
      agent_code: r.agent_code,
      agent_name: r.agent_name,
      actual: t.actual,
      target: t.target,
    });
  });

  // "לא מסווג" - סוכנים עם נתוני מכירה/יעד בתקופה, בלי שיוך בקובץ הסיווג (רק כשיש הרשאת "הכל")
  if (visibility.all) {
    const { rows: allAgentCodesInData } = await pool.query(
      `SELECT DISTINCT agent_code FROM agent_sales_monthly WHERE year = $1
       UNION SELECT DISTINCT agent_code FROM agent_targets WHERE year = $1`,
      [year]
    );
    const classifiedSet = new Set(allCodes);
    const unclassifiedCodes = allAgentCodesInData
      .map((r) => r.agent_code)
      .filter((c) => !classifiedSet.has(c));

    if (unclassifiedCodes.length > 0) {
      const unclassifiedTotals = await computeAgentTotals(unclassifiedCodes, periodDef);
      const { rows: names } = await pool.query(
        `SELECT DISTINCT agent_code, agent_name FROM agent_sales_monthly WHERE agent_code = ANY($1::int[])`,
        [unclassifiedCodes]
      );
      const nameMap = {};
      names.forEach((n) => { nameMap[n.agent_code] = n.agent_name; });

      domains['לא מסווג'] = { domain: 'לא מסווג', actual: 0, target: 0, agents: [] };
      unclassifiedCodes.forEach((code) => {
        const t = unclassifiedTotals[code] || { actual: 0, target: 0 };
        domains['לא מסווג'].actual += t.actual;
        domains['לא מסווג'].target += t.target;
        domains['לא מסווג'].agents.push({ agent_code: code, agent_name: nameMap[code] || null, actual: t.actual, target: t.target });
      });
    }
  }

  const domainList = Object.values(domains).filter((d) => d.agents.length > 0 || DOMAIN_ORDER.includes(d.domain));
  const grandTotal = domainList.reduce(
    (acc, d) => ({ actual: acc.actual + d.actual, target: acc.target + d.target }),
    { actual: 0, target: 0 }
  );

  return res.status(200).json({
    period,
    year,
    month,
    currentUser: { id: currentUser.id, name: currentUser.name, role: currentUser.role },
    grandTotal,
    domains: domainList,
  });
}
