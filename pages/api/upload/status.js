const { getPool } = require('../../../lib/db');
const { requireUser, hasPermission } = require('../../../lib/access');

export default async function handler(req, res) {
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;
  if (!hasPermission(currentUser, 'targets.upload') && !hasPermission(currentUser, 'quarterly.upload') &&
      !hasPermission(currentUser, 'skucompare.upload') && !hasPermission(currentUser, 'custsales.upload') &&
      !hasPermission(currentUser, 'bomorders.upload')) {
    return res.status(403).json({ error: 'אין לך הרשאה לטעינת קבצים' });
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT file_key, filename, uploaded_at FROM file_uploads');

  const byKey = {};
  rows.forEach((r) => {
    byKey[r.file_key] = { filename: r.filename, uploadedAt: r.uploaded_at };
  });

  // "הזמנות רכש לפי עצי מוצר": פרטים נוספים לתיבת "הועלה לאחרונה" (טווח המכירות, מספר הקשרים בעצים,
  // ואזהרה על קובץ "תמונת מצב" שישן ביומיים+ מהעדכני מבין מכירות/מלאי/הזמנות ספקים)
  const { rows: bomInfo } = await pool.query('SELECT file_key, info FROM bom_file_info').catch(() => ({ rows: [] }));
  const info = Object.fromEntries(bomInfo.map((r) => [r.file_key, r.info || {}]));
  const n = (x) => Number(x).toLocaleString('he-IL');
  const details = {};
  if (byKey['bom-tree'] && info['bom-tree']?.edges != null) {
    details['bom-tree'] = [`${n(info['bom-tree'].edges)} קשרי אב-בן · ${n(info['bom-tree'].parents)} פריטי אב`];
  }
  if (byKey['bom-sales'] && info['bom-sales']?.from) {
    details['bom-sales'] = [`טווח: ${info['bom-sales'].from} – ${info['bom-sales'].to} (${n(info['bom-sales'].days)} ימים)`];
  }
  const snapKeys = ['bom-sales', 'bom-stock', 'bom-orders'].filter((k) => byKey[k]);
  const newest = Math.max(0, ...snapKeys.map((k) => new Date(byKey[k].uploadedAt).getTime()));
  snapKeys.forEach((k) => {
    const lag = Math.floor((newest - new Date(byKey[k].uploadedAt).getTime()) / 86400000);
    if (lag >= 2) (details[k] = details[k] || []).push(`⚠ ישן ב-${lag} ימים מהקובץ העדכני`);
  });
  Object.entries(details).forEach(([k, lines]) => { byKey[k].details = lines; });

  return res.status(200).json({ uploads: byKey });
}
