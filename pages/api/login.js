const { getPool } = require('../../lib/db');
const { checkPassword, signPendingToken } = require('../../lib/auth');
const { generateSecret, buildQrDataUrl } = require('../../lib/totp');

// שלב 1: בדיקת אימייל+סיסמה בלבד. לא מתחברים session מלא כאן -
// מחזירים "pendingToken" והצעד הבא (הגדרת TOTP בפעם הראשונה, או הקלדת קוד בפעמים הבאות).
// ה-session האמיתי (cookie) נקבע רק ב-/api/totp/confirm אחרי קוד תקין.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'חובה למלא אימייל וסיסמה' });
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  if (!user || !(await checkPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
  }

  const pendingToken = signPendingToken(user.id);

  // כניסה ראשונה - עדיין לא הוגדר TOTP (או שהוגדר אבל לא אושר) -> מציגים QR להגדרה
  if (!user.totp_enabled) {
    let secret = user.totp_secret;
    if (!secret) {
      secret = generateSecret();
      await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, user.id]);
    }
    const qr = await buildQrDataUrl(user.email, secret);
    return res.status(200).json({ step: 'setup', pendingToken, qr });
  }

  // TOTP כבר מוגדר ומאושר - רק מבקשים קוד
  return res.status(200).json({ step: 'verify', pendingToken });
}
