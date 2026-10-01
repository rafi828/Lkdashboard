const { getPool } = require('../../../lib/db');
const { requireAdmin } = require('../../../lib/access');
const { ROLES, parseAgentCodes, setAgentCodes, AGENT_CODE_REQUIRED_MSG } = require('../../../lib/user-admin');
const bcrypt = require('bcryptjs');

async function isLastAdmin(pool, id) {
  const { rows } = await pool.query(
    `SELECT (SELECT role FROM users WHERE id = $1) AS role,
            (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins`,
    [id]
  );
  return rows[0].role === 'admin' && rows[0].admins <= 1;
}

export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'id לא תקין' });

  const pool = getPool();

  if (req.method === 'PATCH') {
    const { role, agent_codes, permission_template_id, name, password, reset_totp } = req.body || {};

    // איפוס סיסמה / Google Authenticator ע"י אדמין - נפרד מעדכון הפרטים,
    // כדי לא לדרוס את שאר הפרטים.
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

    // עדכון חלקי: רק שדות שנשלחו משתנים
    const { rows: existingRows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'משתמש לא נמצא' });
    const existing = existingRows[0];

    if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'תפקיד לא תקין' });
    const newRole = role ?? existing.role;
    if (existing.role === 'admin' && newRole !== 'admin' && (await isLastAdmin(pool, id))) {
      return res.status(400).json({ error: 'זה האדמין האחרון במערכת - לא ניתן להוריד לו את תפקיד האדמין' });
    }

    let codes;
    if (agent_codes !== undefined) {
      codes = parseAgentCodes(agent_codes);
      if (codes === null) return res.status(400).json({ error: 'קוד סוכן לא תקין - יש להזין מספרים בלבד, מופרדים בפסיק' });
    } else {
      const { rows: c } = await pool.query('SELECT agent_code FROM user_agent_codes WHERE user_id = $1', [id]);
      codes = c.map((r) => r.agent_code);
    }
    if (newRole === 'user' && codes.length === 0) return res.status(400).json({ error: AGENT_CODE_REQUIRED_MSG });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (role !== undefined) await client.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
      if (name) await client.query('UPDATE users SET name = $1 WHERE id = $2', [name, id]);
      if (permission_template_id !== undefined) {
        await client.query('UPDATE users SET permission_template_id = $1 WHERE id = $2', [permission_template_id || null, id]);
      }
      if (agent_codes !== undefined) await setAgentCodes(client, id, codes);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23503') return res.status(400).json({ error: 'תבנית ההרשאה שנבחרה לא קיימת' });
      throw e;
    } finally {
      client.release();
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (await isLastAdmin(pool, id)) {
      return res.status(400).json({ error: 'זה האדמין האחרון במערכת - לא ניתן למחוק אותו' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
