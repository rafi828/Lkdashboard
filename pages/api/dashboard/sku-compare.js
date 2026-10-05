const { getPool } = require('../../../lib/db');
const { requirePermission } = require('../../../lib/access');
const { getSkuCompareRows } = require('../../../lib/sku-compare');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'skucompare.view');
  if (!user) return;

  const rows = await getSkuCompareRows();
  const { rows: up } = await getPool().query(
    `SELECT f.filename, f.uploaded_at, u.name AS uploaded_by_name
     FROM file_uploads f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.file_key = 'sku-compare'`
  );
  return res.status(200).json({ rows, lastUpload: up[0] || null });
}
