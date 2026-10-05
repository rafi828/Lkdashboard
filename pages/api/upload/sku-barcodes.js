const { getPool } = require('../../../lib/db');
const { parseSingleFile } = require('../../../lib/api-helpers');
const { requirePermission } = require('../../../lib/access');
const { parseSkuBarcodesFile } = require('../../../lib/xlsx-parser');
const { getCompItemsMap, matchBarcodes } = require('../../../lib/sku-compare');
const { recordFileUpload } = require('../../../lib/file-uploads');

export const config = { api: { bodyParser: false } };

// טעינת "מרובי ברקודים" (ייצוא פריוריטי): מחליף את כל שיוכי היבוא (sku_compare_imports).
// פריט ל.כ שאחד הברקודים שלו הוא מק"ט מתחרה -> ודאי ("יבוא ידני"); כמה מק"טים -> לבדיקה עם רשימת אפשרויות.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requirePermission(req, res, 'skucompare.upload');
  if (!user) return;

  try {
    const { buffer, filename } = await parseSingleFile(req);
    const barcodeRows = parseSkuBarcodesFile(buffer);
    if (barcodeRows.length === 0) return res.status(400).json({ error: 'לא נמצאו שורות פריט/ברקוד בקובץ' });

    const pool = getPool();
    const compMap = await getCompItemsMap(pool);
    if (compMap.size === 0) {
      return res.status(400).json({ error: 'אין עדיין רשימת מק"טי מתחרה - יש לטעון קודם (מחדש) את קובץ תוצאות ההשוואה' });
    }
    const { rows: items } = await pool.query('SELECT lk_sku, comp_sku FROM sku_compare_items');
    const { imports, stats } = matchBarcodes(barcodeRows, items, compMap);

    const col = (k) => imports.map((r) => r[k]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sku_compare_imports');
      await client.query(
        `INSERT INTO sku_compare_imports (lk_sku, kind, comp_sku, options, imported_by)
         SELECT lk, kind, comp, opts, $5 FROM UNNEST($1::varchar[], $2::varchar[], $3::varchar[], $4::text[]) AS t(lk, kind, comp, opts)`,
        [col('lk_sku'), col('kind'), col('comp_sku'), imports.map((r) => r.options.join(',')), user.id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await recordFileUpload('sku-barcodes', filename, user.id);
    const n = (x) => x.toLocaleString('he-IL');
    return res.status(200).json({
      ok: true,
      rows: imports.length,
      stats,
      summary: `${n(stats.sure)} סומנו ודאי (יבוא ידני) · ${n(stats.multi)} לבדיקה (כמה מק"טים אפשריים) · `
        + `${n(stats.notInReport)} פריטים בקובץ לא קיימים בדוח ודולגו · ${n(stats.noMatch)} ללא ברקוד שתואם למתחרה`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
