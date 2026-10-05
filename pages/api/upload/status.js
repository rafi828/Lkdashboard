const { getPool } = require('../../../lib/db');
const { requireUser, hasPermission } = require('../../../lib/access');

export default async function handler(req, res) {
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;
  if (!hasPermission(currentUser, 'targets.upload') && !hasPermission(currentUser, 'quarterly.upload') &&
      !hasPermission(currentUser, 'skucompare.upload')) {
    return res.status(403).json({ error: 'אין לך הרשאה לטעינת קבצים' });
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT file_key, filename, uploaded_at FROM file_uploads');

  const byKey = {};
  rows.forEach((r) => {
    byKey[r.file_key] = { filename: r.filename, uploadedAt: r.uploaded_at };
  });

  return res.status(200).json({ uploads: byKey });
}
