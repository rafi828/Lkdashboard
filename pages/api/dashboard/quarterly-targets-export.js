const { getPool } = require('../../../lib/db');
const { requirePermission, getDataScope } = require('../../../lib/access');
const XLSX = require('xlsx');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const currentUser = await requirePermission(req, res, 'quarterly.email');
  if (!currentUser) return;
  // ייצוא/שליחה רק ללקוחות שהמשתמש רואה בדוח (סוכן -> רק הלקוחות שלו)
  const scope = getDataScope(currentUser);
  if (!scope.all && scope.codes.length === 0) {
    return res.status(403).json({ error: 'לא הוגדר לך קוד סוכן - פנה למנהל המערכת' });
  }

  const { customerIds, year } = req.body || {};
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ error: 'לא נבחרו לקוחות לייצוא (customerIds ריק)' });
  }
  const y = year ? parseInt(year, 10) : new Date().getFullYear();

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT customer_id, customer_name, agent_name, agent_email, agent_phone,
            chanoch_email, rafi_email, david_email, amir_email,
            q1_target, q1_actual, q1_credit, q2_target, q2_actual, q2_credit,
            q3_target, q3_actual, q3_credit, q4_target, q4_actual, q4_credit,
            annual_target, last_year_sales
     FROM customer_quarterly_targets
     WHERE year = $1 AND customer_id = ANY($2::bigint[])
       AND ($3::int[] IS NULL OR agent_code = ANY($3::int[]))
     ORDER BY customer_name`,
    [y, customerIds, scope.all ? null : scope.codes]
  );

  // שמות העמודות כאן זהים לכותרות שבקובץ המקור ("עיבוד התקדמות לקוחות יעדים") -
  // אלו בדיוק השמות ששדות המיזוג («...») בתבנית הוורד מצפים לראות.
  // עמודות המייל (סוכן/חנוך/רפי/דוד/אמיר) מתווספות בהתחלה כעמודות עזר - משתנות לפי לקוח בדיוק כמו בקובץ המקור.
  const exportRows = rows.map((r) => ({
    'מייל סוכן': r.agent_email || '',
    'טלפון סוכן': r.agent_phone || '',
    'דואר אלקטרוני חנוך': r.chanoch_email || '',
    'דואר אלקטרוני רפי': r.rafi_email || '',
    'דואר אלקטרוני דוד': r.david_email || '',
    'דוא"ל אמיר': r.amir_email || '',
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
  return res.status(200).send(Buffer.from(buffer));
}
