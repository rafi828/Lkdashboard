const XLSX = require('xlsx');
const { requirePermission } = require('../../../lib/access');

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

// POST { sheetName, columns: [כותרת...], rows: [[ערך...]] } - ייצוא בדיוק של הטבלה שמוצגת במסך
// (הנתונים עצמם הגיעו מ-/api/dashboard/customer-sales, שכבר מסונן לפי הרשאת המשתמש).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'custsales.view');
  if (!user) return;

  const { sheetName, columns, rows } = req.body || {};
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'אין שורות לייצוא' });
  }

  const clean = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : '') : v == null ? '' : String(v));
  const ws = XLSX.utils.aoa_to_sheet([columns.map(String), ...rows.map((r) => (Array.isArray(r) ? r.map(clean) : []))]);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(10, Math.min(40, String(c).length + 4)) }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName || 'מכירות ללקוח').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="customer-sales-export.xlsx"');
  return res.status(200).send(Buffer.from(buffer));
}
