const XLSX = require('xlsx');
const { requirePermission } = require('../../../lib/access');
const { getSkuCompareRows, DECISION_LABELS } = require('../../../lib/sku-compare');

// POST { lkSkus: [...] } - השורות לייצוא (המסומנות, או כל מה שמוצג בטבלה כשלא סומן כלום)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'skucompare.view');
  if (!user) return;

  const { lkSkus } = req.body || {};
  if (!Array.isArray(lkSkus) || lkSkus.length === 0) {
    return res.status(400).json({ error: 'אין שורות לייצוא' });
  }

  const rows = await getSkuCompareRows(lkSkus.map(String));
  const exportRows = rows.map((r) => ({
    'מק"ט ל.כ': r.lk_sku,
    'תיאור ל.כ': r.lk_desc || '',
    'מחלקה': r.lk_dept || '',
    'מק"ט מתחרה (סופי)': r.decision === 'corrected' ? r.corrected_sku : r.decision === 'rejected' ? '' : r.comp_sku || '',
    'מק"ט מתחרה (מנוע)': r.comp_sku || '',
    'תיאור מתחרה': r.comp_desc || '',
    'מותג': r.comp_brand || '',
    'רמת ביטחון': r.confidence,
    'החלטה': r.decision ? DECISION_LABELS[r.decision] : '',
    'הערת החלטה': r.decision_note || '',
    'הוחלט ע"י': r.decided_by_name || '',
    'הערות המנוע': r.notes || '',
    'עמוד בקטלוג': r.catalog_page || '',
    'מחיר מחירון מתחרה (₪)': r.comp_price ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws['!cols'] = [12, 40, 22, 16, 16, 40, 10, 10, 8, 24, 12, 40, 10, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'השוואת מק"טים');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="sku-compare-export.xlsx"');
  return res.status(200).send(Buffer.from(buffer));
}
