const XLSX = require('xlsx');
const { getPool } = require('../../../lib/db');
const { requirePermission } = require('../../../lib/access');
const { getSkuCompareRows, DECISION_LABELS } = require('../../../lib/sku-compare');

const SOURCE_LABELS = { engine: 'מנוע ההשוואה', barcodes: 'מרובי ברקודים' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');

// POST { lkSkus: [...], compSkus: [...] } - השורות לייצוא (המסומנות, או כל מה שמוצג בטבלה כשלא סומן כלום).
// compSkus = שורות "סיגנט ללא התאמה" (פריט מתחרה בלי פריט ל.כ).
// quantities = { lk_sku | 'sig:'+comp_sku: כמות } - מ"חיפוש לפי מסמך"; אם נשלח, נוספת עמודת "כמות במסמך".
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'skucompare.view');
  if (!user) return;

  const lkSkus = Array.isArray(req.body?.lkSkus) ? req.body.lkSkus.map(String) : [];
  const compSkus = Array.isArray(req.body?.compSkus) ? req.body.compSkus.map(String) : [];
  const quantities = req.body?.quantities && typeof req.body.quantities === 'object' ? req.body.quantities : null;
  const withQty = (key, row) => (quantities ? { 'כמות במסמך': quantities[key] ?? '', ...row } : row);
  if (lkSkus.length === 0 && compSkus.length === 0) {
    return res.status(400).json({ error: 'אין שורות לייצוא' });
  }

  const rows = lkSkus.length ? await getSkuCompareRows(lkSkus) : [];
  const { rows: compRows } = compSkus.length
    ? await getPool().query(
      `SELECT comp_sku, comp_desc, comp_brand, catalog_page, comp_price::float AS comp_price
       FROM sku_compare_comp_items WHERE comp_sku = ANY($1::varchar[]) ORDER BY comp_sku`,
      [compSkus]
    )
    : { rows: [] };

  const exportRows = rows.map((r) => withQty(r.lk_sku, {
    'מק"ט ל.כ': r.lk_sku,
    'תיאור ל.כ': r.lk_desc || '',
    'מחלקה': r.lk_dept || '',
    'מק"ט מתחרה (סופי)': r.decision === 'corrected' ? r.corrected_sku : r.decision === 'rejected' ? '' : r.comp_sku || '',
    'מק"ט מתחרה (מנוע)': r.engine_comp_sku || '',
    'תיאור מתחרה': r.comp_desc || '',
    'מותג': r.comp_brand || '',
    'רמת ביטחון': r.confidence,
    'מקור': SOURCE_LABELS[r.source],
    'החלטה': r.decision ? DECISION_LABELS[r.decision] : r.import_kind === 'sure' ? 'יבוא ידני' : '',
    'הערת החלטה': r.decision_note || '',
    // החלטה ידנית -> מי החליט; "יבוא ידני" -> מי טען את קובץ מרובי הברקודים
    'הוחלט ע"י': r.decision ? r.decided_by_name || '' : r.import_kind === 'sure' ? r.imported_by_name || '' : '',
    'תאריך החלטה': fmtDate(r.decision ? r.decided_at : r.import_kind === 'sure' ? r.imported_at : null),
    'הערות': r.notes || '',
    'עמוד בקטלוג': r.catalog_page || '',
    'מחיר מחירון מתחרה (₪)': r.comp_price ?? '',
  })).concat(compRows.map((c) => withQty(`sig:${c.comp_sku}`, {
    'מק"ט ל.כ': '',
    'תיאור ל.כ': '',
    'מחלקה': '',
    'מק"ט מתחרה (סופי)': c.comp_sku,
    'מק"ט מתחרה (מנוע)': '',
    'תיאור מתחרה': c.comp_desc || '',
    'מותג': c.comp_brand || '',
    'רמת ביטחון': 'סיגנט ללא התאמה',
    'מקור': '',
    'החלטה': '',
    'הערת החלטה': '',
    'הוחלט ע"י': '',
    'תאריך החלטה': '',
    'הערות': '',
    'עמוד בקטלוג': c.catalog_page || '',
    'מחיר מחירון מתחרה (₪)': c.comp_price ?? '',
  })));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws['!cols'] = (quantities ? [10] : []).concat([12, 40, 22, 16, 16, 40, 10, 14, 14, 10, 24, 12, 12, 40, 10, 12]).map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'השוואת מק"טים');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="sku-compare-export.xlsx"');
  return res.status(200).send(Buffer.from(buffer));
}
