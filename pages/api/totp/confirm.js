const { getPool } = require('../../../lib/db');
const { verifyPendingToken, signToken, buildSessionCookie } = require('../../../lib/auth');
const { verifyCode } = require('../../../lib/totp');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pendingToken, code } = req.body || {};
  if (!pendingToken || !code) {
    return res.status(400).json({ error: 'חובה לשלוח pendingToken וקוד' });
  }

  const pending = verifyPendingToken(pendingToken);
  if (!pending) {
    return res.status(401).json({ error: 'הפעולה נגמר לה הזמן - התחבר מחדש' });
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [pending.id]);
  const user = rows[0];
  if (!user || !user.totp_secret) {
    return res.status(401).json({ error: 'משתמש לא נמצא' });
  }

  if (!verifyCode(code, user.totp_secret)) {
    return res.status(401).json({ error: 'קוד שגוי - נסה שוב' });
  }

  if (!user.totp_enabled) {
    await pool.query('UPDATE users SET totp_enabled = true WHERE id = $1', [user.id]);
  }

  const sessionToken = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  res.setHeader('Set-Cookie', buildSessionCookie(sessionToken));
  return res.status(200).json({ id: user.id, email: user.email, role: user.role, name: user.name });
}
