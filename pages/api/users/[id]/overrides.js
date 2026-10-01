const { getPool } = require('../../../../lib/db');
const { requireAdmin } = require('../../../../lib/access');
const { ALL_PERMISSION_KEYS } = require('../../../../lib/reports');

// חריגים אישיים מעל תבנית ההרשאה של המשתמש.
// PUT { overrides: { 'quarterly.upload': true, 'targets.view': false } }
//   true = להוסיף למרות שלא בתבנית, false = להסיר למרות שבתבנית. מפתח שלא נשלח = לפי התבנית.
export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const userId = parseInt(req.query.id, 10);
  if (!userId) return res.status(400).json({ error: 'id לא תקין' });

  const { overrides } = req.body || {};
  if (!overrides || typeof overrides !== 'object') return res.status(400).json({ error: 'overrides חייב להיות אובייקט' });
  const entries = Object.entries(overrides).filter(
    ([k, v]) => ALL_PERMISSION_KEYS.includes(k) && typeof v === 'boolean'
  );

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_permission_overrides WHERE user_id = $1', [userId]);
    for (const [key, granted] of entries) {
      await client.query(
        'INSERT INTO user_permission_overrides (user_id, permission_key, granted) VALUES ($1,$2,$3)',
        [userId, key, granted]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23503') return res.status(404).json({ error: 'משתמש לא נמצא' });
    throw e;
  } finally {
    client.release();
  }
  return res.status(200).json({ ok: true });
}
