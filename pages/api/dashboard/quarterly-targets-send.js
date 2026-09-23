const { getPool } = require('../../../lib/db');
const { getUserFromRequest } = require('../../../lib/auth');
const { sendMail } = require('../../../lib/mailer');
const { buildQuarterEmailHtml } = require('../../../lib/quarterly-email-template');

const RECIPIENT_FIELDS = ['agent_email', 'rafi_email', 'chanoch_email', 'david_email', 'amir_email'];

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });
  if (currentUser.role !== 'admin') return res.status(403).json({ error: 'זמין כרגע רק למנהל מערכת' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { customerIds, quarter, recipientField, year } = req.body || {};

  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ error: 'לא נבחרו לקוחות לשליחה' });
  }
  const q = parseInt(quarter, 10);
  if (![1, 2, 3, 4].includes(q)) {
    return res.status(400).json({ error: 'יש לבחור רבעון ספציפי (1-4) - לא ניתן לשלוח במצב "מצטבר"' });
  }
  if (!RECIPIENT_FIELDS.includes(recipientField)) {
    return res.status(400).json({ error: 'עמודת נמען לא תקינה' });
  }

  const y = year ? parseInt(year, 10) : new Date().getFullYear();
  console.log(`[quarterly-send] בקשת שליחה: רבעון ${q}, ${customerIds.length} לקוחות, עמודה: ${recipientField}`);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT customer_id, customer_name, agent_name, agent_phone, agent_email,
            chanoch_email, rafi_email, david_email, amir_email,
            target_type_simple,
            q1_target, q1_actual, q1_credit, q2_target, q2_actual, q2_credit,
            q3_target, q3_actual, q3_credit, q4_target, q4_actual, q4_credit
     FROM customer_quarterly_targets
     WHERE year = $1 AND customer_id = ANY($2::bigint[])`,
    [y, customerIds]
  );

  let sent = 0;
  let skippedNotQuarterly = 0;
  let skippedNoEmail = 0;
  const errors = [];

  for (const row of rows) {
    // בטיחות: לעולם לא שולחים למי שסוג היעד שלו אינו "רבעוני", גם אם המסך היה מסונן אחרת.
    if (row.target_type_simple !== 'רבעוני') {
      skippedNotQuarterly++;
      continue;
    }
    const to = row[recipientField];
    if (!to) {
      skippedNoEmail++;
      continue;
    }
    try {
      const html = buildQuarterEmailHtml(row, q);
      await sendMail({
        to,
        subject: `סטטוס יעד רבעון ${q} - ל.כ כלי עבודה וציוד בע"מ`,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`[quarterly-send] נכשל עבור לקוח #${row.customer_id}:`, err.message);
      errors.push({ customer_id: row.customer_id, message: err.message });
    }
  }

  console.log(`[quarterly-send] סיכום: נשלחו ${sent}, דולגו ${skippedNotQuarterly} (לא רבעוני), דולגו ${skippedNoEmail} (אין מייל), נכשלו ${errors.length}`);

  return res.status(200).json({ sent, skippedNotQuarterly, skippedNoEmail, errors });
}
