const { getPool } = require('../../../lib/db');
const { requireAdmin } = require('../../../lib/access');
const { ROLES, parseAgentCodes, setAgentCodes, AGENT_CODE_REQUIRED_MSG } = require('../../../lib/user-admin');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const pool = getPool();

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.permission_template_id,
              COALESCE((SELECT array_agg(c.agent_code ORDER BY c.agent_code) FROM user_agent_codes c WHERE c.user_id = u.id), '{}') AS agent_codes,
              COALESCE((SELECT json_object_agg(o.permission_key, o.granted) FROM user_permission_overrides o WHERE o.user_id = u.id), '{}') AS overrides
       FROM users u
       ORDER BY u.id`
    );
    return res.status(200).json({ users: rows });
  }

  if (req.method === 'POST') {
    const { name, email, password, role, agent_codes, permission_template_id } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'חובה למלא שם, אימייל, סיסמה ותפקיד' });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'תפקיד לא תקין' });
    if (password.length < 6) return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
    const codes = parseAgentCodes(agent_codes);
    if (codes === null) return res.status(400).json({ error: 'קוד סוכן לא תקין - יש להזין מספרים בלבד, מופרדים בפסיק' });
    if (role === 'user' && codes.length === 0) return res.status(400).json({ error: AGENT_CODE_REQUIRED_MSG });

    const password_hash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, permission_template_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, permission_template_id`,
        [name, email, password_hash, role, role === 'admin' ? null : permission_template_id || null]
      );
      await setAgentCodes(client, rows[0].id, codes);
      await client.query('COMMIT');
      return res.status(201).json({ user: rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: 'כתובת האימייל הזו כבר קיימת' });
      if (e.code === '23503') return res.status(400).json({ error: 'תבנית ההרשאה שנבחרה לא קיימת' });
      throw e;
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
