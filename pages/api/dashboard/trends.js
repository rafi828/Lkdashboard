const { getPool } = require('../../../lib/db');
const { getUserFromRequest } = require('../../../lib/auth');
const { getVisibleAgentCodes } = require('../../../lib/agent-permissions');

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });

  const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
  const domainFilter = req.query.domain || null; // אופציונלי: לצייר מגמה לתחום אחד בלבד
  const agentFilter = req.query.agent_code ? parseInt(req.query.agent_code, 10) : null;

  const pool = getPool();
  const visibility = await getVisibleAgentCodes(currentUser);

  let classRows;
  if (visibility.all) {
    ({ rows: classRows } = await pool.query('SELECT agent_code, domain FROM agent_classification'));
  } else if (visibility.codes.length === 0) {
    classRows = [];
  } else {
    ({ rows: classRows } = await pool.query(
      'SELECT agent_code, domain FROM agent_classification WHERE agent_code = ANY($1::int[])',
      [visibility.codes]
    ));
  }

  let codes = classRows.map((r) => r.agent_code);
  if (domainFilter) codes = classRows.filter((r) => r.domain === domainFilter).map((r) => r.agent_code);
  if (agentFilter) codes = codes.filter((c) => c === agentFilter);

  if (codes.length === 0) {
    return res.status(200).json({ year, months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, actual: 0 })) });
  }

  const { rows } = await pool.query(
    `SELECT month, COALESCE(SUM(sales_amount),0) AS actual
     FROM agent_sales_monthly
     WHERE agent_code = ANY($1::int[]) AND year = $2
     GROUP BY month`,
    [codes, year]
  );

  const byMonth = {};
  rows.forEach((r) => { byMonth[r.month] = Number(r.actual); });
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, actual: byMonth[i + 1] || 0 }));

  return res.status(200).json({ year, months });
}
