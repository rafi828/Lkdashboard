const { getPool } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/api-helpers');

export default async function handler(req, res) {
  const user = requireRole(req, res, ['admin']);
  if (!user) return;

  const userId = parseInt(req.query.id, 10);
  if (!userId) return res.status(400).json({ error: 'id לא תקין' });

  const pool = getPool();

  if (req.method === 'GET') {
    const { rows } = await pool.query('SELECT topic_id FROM user_topic_access WHERE user_id = $1', [userId]);
    return res.status(200).json({ topicIds: rows.map((r) => r.topic_id) });
  }

  if (req.method === 'PUT') {
    const { topicIds } = req.body || {};
    if (!Array.isArray(topicIds)) return res.status(400).json({ error: 'topicIds חייב להיות מערך' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_topic_access WHERE user_id = $1', [userId]);
      for (const topicId of topicIds) {
        await client.query(
          'INSERT INTO user_topic_access (user_id, topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [userId, topicId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
