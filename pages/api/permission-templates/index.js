const { getPool } = require('../../../lib/db');
const { requireAdmin } = require('../../../lib/access');
const { cleanPermissionKeys } = require('../../../lib/user-admin');

// תבניות הרשאה: GET רשימה (כולל ההרשאות וכמה משתמשים משויכים), POST יצירה { name, permissions: [...] }
export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const pool = getPool();

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT t.id, t.name,
              COALESCE((SELECT array_agg(i.permission_key) FROM permission_template_items i WHERE i.template_id = t.id), '{}') AS permissions,
              (SELECT COUNT(*)::int FROM users u WHERE u.permission_template_id = t.id) AS user_count
       FROM permission_templates t
       ORDER BY t.name`
    );
    return res.status(200).json({ templates: rows });
  }

  if (req.method === 'POST') {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'חובה לתת שם לתבנית' });
    const permissions = cleanPermissionKeys(req.body?.permissions || []);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('INSERT INTO permission_templates (name) VALUES ($1) RETURNING id, name', [name]);
      for (const key of permissions) {
        await client.query('INSERT INTO permission_template_items (template_id, permission_key) VALUES ($1,$2)', [rows[0].id, key]);
      }
      await client.query('COMMIT');
      return res.status(201).json({ template: rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: 'כבר קיימת תבנית בשם הזה' });
      throw e;
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
