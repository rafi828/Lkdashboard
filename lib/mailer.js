const nodemailer = require('nodemailer');

let transporter = null;

function getTransport() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('הגדרות SMTP חסרות (SMTP_HOST / SMTP_USER / SMTP_PASS) - יש להוסיף אותן כמשתני סביבה ב-Railway');
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user, pass },
    connectionTimeout: 15000, // לא לתקוע לנצח - נכשל תוך 15 שניות אם אין חיבור
    greetingTimeout: 15000,
  });
  return transporter;
}

let verified = false;

async function sendMail({ to, subject, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const t = getTransport();
  if (!verified) {
    console.log('[mailer] מאמת חיבור SMTP...');
    await t.verify();
    verified = true;
    console.log('[mailer] חיבור SMTP תקין.');
  }
  console.log(`[mailer] שולח מייל אל: ${to}`);
  const info = await t.sendMail({ from, to, subject, html });
  console.log(`[mailer] נשלח בהצלחה אל: ${to} (messageId: ${info.messageId})`);
  return info;
}

module.exports = { sendMail };
