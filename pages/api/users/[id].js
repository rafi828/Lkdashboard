const { getPool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/api-helpers');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
  const user = requireRole(req, res, ['admin']);
  if (!user) return;

  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'id לא תקין' });

  const pool = getPool();

  if (req.method === 'PATCH') {
    const { role, manager_id, agent_code, name, password, reset_totp } = req.body || {};

    // איפוס סיסמה / Google Authenticator ע"י אדמין - נפרד מעדכון הפרטים,
    // כדי לא לדרוס manager_id / agent_code.
    if (password !== undefined || reset_totp) {
      if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 6) {
          return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, id]);
        if (rowCount === 0) return res.status(404).json({ error: 'משתמש לא נמצא' });
      }
      if (reset_totp) {
        // בכניסה הבאה המשתמש יקבל QR חדש לסריקה (ראה pages/api/login.js)
        const { rowCount } = await pool.query(
          'UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1',
          [id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'משתמש לא נמצא' });
      }
      return res.status(200).json({ ok: true });
    }
    const { rows } = await pool.query(
      `UPDATE users SET
         role = COALESCE($1, role),
         manager_id = $2,
         agent_code = $3,
         name = COALESCE($4, name)
       WHERE id = $5
       RETURNING id, name, email, role, manager_id, agent_code`,
      [role || null, manager_id ?? null, agent_code ?? null, name || null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'משתמש לא נמצא' });
    return res.status(200).json({ user: rows[0] });
  }

  if (req.method === 'DELETE') {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
