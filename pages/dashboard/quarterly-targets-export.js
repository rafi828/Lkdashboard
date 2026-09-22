const { getPool } = require('../../../lib/db');
const { getUserFromRequest } = require('../../../lib/auth');
const XLSX = require('xlsx');

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });
  if (currentUser.role !== 'admin') return res.status(403).json({ error: 'זמין כרגע רק למנהל מערכת' });

  const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
  const agent = req.query.agent || null;

  const pool = getPool();
  const params = [year];
  let where = 'WHERE year = $1';
  if (agent) {
    params.push(agent);
    where += ` AND agent_name = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT customer_id, customer_name, agent_name,
            q1_target, q1_actual, q1_credit, q2_target, q2_actual, q2_credit,
            q3_target, q3_actual, q3_credit, q4_target, q4_actual, q4_credit,
            annual_target, last_year_sales
     FROM customer_quarterly_targets
     ${where}
     ORDER BY customer_name`,
    params
  );

  // שמות העמודות כאן זהים לכותרות שבקובץ המקור ("עיבוד התקדמות לקוחות יעדים") -
  // אלו בדיוק השמות ששדות המיזוג («...») בתבנית הוורד מצפים לראות.
  const exportRows = rows.map((r) => ({
    'לקוח': r.customer_id,
    'שם לקוח - 5': r.customer_name,
    'סוכן מלקוח': r.agent_name,
    'יעד רבעון 1 מעוגל': Math.round(r.q1_target),
    'סה"כ מכירות בפועל רבעון 1 - מעוגל': Math.round(r.q1_actual),
    'סכום זיכוי רבעון 1 מעוגל': Math.round(r.q1_credit),
    'יעד רבעון 2 מעוגל': Math.round(r.q2_target),
    'סה"כ מכירות בפועל רבעון 2 מעוגל': Math.round(r.q2_actual),
    'סכום זיכוי רבעון 2 מעוגל': Math.round(r.q2_credit),
    'יעד רבעון 3 מעוגל': Math.round(r.q3_target),
    'סה"כ מכירות רבעון 3 מעוגל': Math.round(r.q3_actual),
    'סכום זיכוי רבעון 3 מעוגל': Math.round(r.q3_credit),
    'יעד רבעון 4 מעוגל': Math.round(r.q4_target),
    'סה"כ מכירות רבעון 4 מעוגל': Math.round(r.q4_actual),
    'סכום הזיכוי רבעון 4 מעוגל': Math.round(r.q4_credit),
    'סה"כ יעד שנתי': Math.round(r.annual_target),
    'סה"כ מכירות שנה קודמת': Math.round(r.last_year_sales),
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'מיזוג');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mailmerge-export.xlsx"');
  return res.status(200).send(buffer);
}
