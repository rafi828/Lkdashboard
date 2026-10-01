const { getPool } = require('../../../lib/db');
const { requireAdmin } = require('../../../lib/access');
const { cleanPermissionKeys } = require('../../../lib/user-admin');

// PUT { name?, permissions? } - עדכון תבנית (משפיע מיד על כל המשתמשים המשויכים אליה)
// DELETE - רק אם אין משתמשים משויכים, כדי שאף אחד לא יישאר פתאום בלי הרשאות
export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'id לא תקין' });
  const pool = getPool();

  if (req.method === 'PUT') {
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    if (name === '') return res.status(400).json({ error: 'שם התבנית לא יכול להיות ריק' });
    const permissions = req.body?.permissions !== undefined ? cleanPermissionKeys(req.body.permissions) : undefined;
    if (permissions === null) return res.status(400).json({ error: 'permissions חייב להיות מערך' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query('SELECT 1 FROM permission_templates WHERE id = $1', [id]);
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'תבנית לא נמצאה' });
      }
      if (name !== undefined) await client.query('UPDATE permission_templates SET name = $1 WHERE id = $2', [name, id]);
      if (permissions !== undefined) {
        await client.query('DELETE FROM permission_template_items WHERE template_id = $1', [id]);
        for (const key of permissions) {
          await client.query('INSERT INTO permission_template_items (template_id, permission_key) VALUES ($1,$2)', [id, key]);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: 'כבר קיימת תבנית בשם הזה' });
      throw e;
    } finally {
      client.release();
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE permission_template_id = $1', [id]);
    if (rows[0].n > 0) {
      return res.status(400).json({ error: `לא ניתן למחוק - ${rows[0].n} משתמשים משויכים לתבנית הזו. העבר אותם לתבנית אחרת קודם.` });
    }
    await pool.query('DELETE FROM permission_templates WHERE id = $1', [id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
