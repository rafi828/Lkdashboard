const { getPool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/api-helpers');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
  const user = requireRole(req, res, ['admin']);
  if (!user) return;

  const pool = getPool();

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, manager_id, agent_code FROM users ORDER BY id`
    );
    return res.status(200).json({ users: rows });
  }

  if (req.method === 'POST') {
    const { name, email, password, role, manager_id, agent_code } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'חובה למלא שם, אימייל, סיסמה ותפקיד' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, manager_id, agent_code)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role, manager_id, agent_code`,
        [name, email, password_hash, role, manager_id || null, agent_code || null]
      );
      return res.status(201).json({ user: rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'כתובת האימייל הזו כבר קיימת' });
      throw e;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
