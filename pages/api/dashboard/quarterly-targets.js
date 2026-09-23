const { getPool } = require('../../../lib/db');
const { getUserFromRequest } = require('../../../lib/auth');

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });

  // הערה: הדוח הזה מזוהה לפי agent_name (טקסט חופשי מהקובץ), לא agent_code המספרי
  // שמשמש להרשאות בשאר המערכת - אז בשלב זה הוא זמין רק ל-Admin.
  if (currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'דוח זה זמין כרגע רק למנהל מערכת' });
  }

  const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT customer_id, customer_name, agent_name, agent_email, agent_phone,
            chanoch_email, rafi_email, david_email, amir_email,
            target_type, target_type_simple,
            q1_target, q1_actual, q1_credit, q2_target, q2_actual, q2_credit,
            q3_target, q3_actual, q3_credit, q4_target, q4_actual, q4_credit,
            annual_target, last_year_sales, m1, m2, m3, m4, m5, m6
     FROM customer_quarterly_targets
     WHERE year = $1
     ORDER BY customer_name`,
    [year]
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

  return res.status(200).json({ year, rows: data });
}
