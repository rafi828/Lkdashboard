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
  });
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const t = getTransport();
  return t.sendMail({ from, to, subject, html });
}

module.exports = { sendMail };
