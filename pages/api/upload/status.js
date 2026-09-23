const { getPool } = require('../../../lib/db');
const { getUserFromRequest } = require('../../../lib/auth');

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });

  const pool = getPool();
  const { rows } = await pool.query('SELECT file_key, filename, uploaded_at FROM file_uploads');

  const byKey = {};
  rows.forEach((r) => {
    byKey[r.file_key] = { filename: r.filename, uploadedAt: r.uploaded_at };
  });

  return res.status(200).json({ uploads: byKey });
}
