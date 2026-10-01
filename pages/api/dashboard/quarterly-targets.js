const { getPool } = require('../../../lib/db');
const { requirePermission, getDataScope } = require('../../../lib/access');

export default async function handler(req, res) {
  const currentUser = await requirePermission(req, res, 'quarterly.view');
  if (!currentUser) return;

  const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();

  // סוכן רואה רק לקוחות שקוד הסוכן שלהם (עמודה "קוד סוכן מלקוח - 2" בקובץ) הוא אחד מהקודים שלו
  const scope = getDataScope(currentUser);
  if (!scope.all && scope.codes.length === 0) {
    return res.status(200).json({ year, rows: [], noAgentCode: true });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT customer_id, customer_name, agent_code, agent_name, agent_email, agent_phone,
            chanoch_email, rafi_email, david_email, amir_email,
            target_type, target_type_simple,
            q1_target, q1_actual, q1_credit, q2_target, q2_actual, q2_credit,
            q3_target, q3_actual, q3_credit, q4_target, q4_actual, q4_credit,
            annual_target, last_year_sales, m1, m2, m3, m4, m5, m6
     FROM customer_quarterly_targets
     WHERE year = $1 AND ($2::int[] IS NULL OR agent_code = ANY($2::int[]))
     ORDER BY customer_name`,
    [year, scope.all ? null : scope.codes]
  );

  const data = rows.map((r) => ({
    ...r,
    q1_target: Number(r.q1_target), q1_actual: Number(r.q1_actual), q1_credit: Number(r.q1_credit),
    q2_target: Number(r.q2_target), q2_actual: Number(r.q2_actual), q2_credit: Number(r.q2_credit),
    q3_target: Number(r.q3_target), q3_actual: Number(r.q3_actual), q3_credit: Number(r.q3_credit),
    q4_target: Number(r.q4_target), q4_actual: Number(r.q4_actual), q4_credit: Number(r.q4_credit),
    annual_target: Number(r.annual_target), last_year_sales: Number(r.last_year_sales),
    m1: Number(r.m1), m2: Number(r.m2), m3: Number(r.m3), m4: Number(r.m4), m5: Number(r.m5), m6: Number(r.m6),
  }));

  return res.status(200).json({ year, rows: data, canEmail: currentUser.permissions.has('quarterly.email') });
}
