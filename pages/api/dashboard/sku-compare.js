const { getPool } = require('../../../lib/db');
const { requirePermission } = require('../../../lib/access');
const { getSkuCompareRows } = require('../../../lib/sku-compare');

// שורות הדוח + כל מק"טי המתחרה (המסך מחשב מהם את "סיגנט ללא התאמה" - מה שלא משויך לאף פריט ל.כ)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'skucompare.view');
  if (!user) return;

  const pool = getPool();
  const rows = await getSkuCompareRows();
  const { rows: compItems } = await pool.query(
    'SELECT comp_sku, comp_desc, comp_brand, category, catalog_page, comp_price::float AS comp_price FROM sku_compare_comp_items'
  );
  const { rows: up } = await pool.query(
    `SELECT f.file_key, f.filename, f.uploaded_at, u.name AS uploaded_by_name
     FROM file_uploads f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.file_key IN ('sku-compare', 'sku-barcodes')`
  );
  const byKey = Object.fromEntries(up.map((u) => [u.file_key, u]));
  return res.status(200).json({ rows, compItems, lastUpload: byKey['sku-compare'] || null, lastBarcodes: byKey['sku-barcodes'] || null });
}
