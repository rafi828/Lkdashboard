const { getPool } = require('../../../lib/db');
const { parseSingleFile } = require('../../../lib/api-helpers');
const { requirePermission } = require('../../../lib/access');
const { parseSkuCompareFile } = require('../../../lib/xlsx-parser');
const { recordFileUpload } = require('../../../lib/file-uploads');

export const config = { api: { bodyParser: false } };

// טעינת קובץ התוצאות של כלי השוואת המק"טים: מחליף את כל תוצאות המנוע (sku_compare_items)
// ואת רשימת מק"טי המתחרה (sku_compare_comp_items).
// ההחלטות הידניות ויבוא "מרובי ברקודים" לא נוגעים בהם - הם נשארים וגוברים על התוצאות החדשות.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requirePermission(req, res, 'skucompare.upload');
  if (!user) return;

  try {
    const { buffer, filename } = await parseSingleFile(req);
    const { items: records, compItems } = parseSkuCompareFile(buffer);
    if (records.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות תקינות בקובץ (בדוק את עמודת "מק"ט ל.כ")' });
    }

    const col = (k) => records.map((r) => r[k]);
    const compCol = (k) => compItems.map((r) => r[k]);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sku_compare_items');
      await client.query(
        `INSERT INTO sku_compare_items
           (lk_sku, lk_desc, lk_dept, comp_sku, comp_desc, comp_brand, confidence, notes, catalog_page, comp_price)
         SELECT * FROM UNNEST($1::varchar[], $2::text[], $3::varchar[], $4::varchar[], $5::text[],
                              $6::varchar[], $7::varchar[], $8::text[], $9::int[], $10::numeric[])`,
        [
          col('lk_sku'), col('lk_desc'), col('lk_dept'), col('comp_sku'), col('comp_desc'),
          col('comp_brand'), col('confidence'), col('notes'), col('catalog_page'), col('comp_price'),
        ]
      );
      await client.query('DELETE FROM sku_compare_comp_items');
      await client.query(
        `INSERT INTO sku_compare_comp_items (comp_sku, comp_desc, comp_brand, category, catalog_page, comp_price)
         SELECT * FROM UNNEST($1::varchar[], $2::text[], $3::varchar[], $4::varchar[], $5::int[], $6::numeric[])`,
        [compCol('comp_sku'), compCol('comp_desc'), compCol('comp_brand'), compCol('category'), compCol('catalog_page'), compCol('comp_price')]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await recordFileUpload('sku-compare', filename, user.id);
    return res.status(200).json({ ok: true, rows: records.length, compRows: compItems.length });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
