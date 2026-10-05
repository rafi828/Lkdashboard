const { getPool } = require('../../../lib/db');
const { requirePermission } = require('../../../lib/access');

const DECISIONS = ['approved', 'rejected', 'corrected'];

// POST { lkSku, decision: 'approved'|'rejected'|'corrected'|null, correctedSku?, note? }
// decision = null -> ביטול ההחלטה (חוזרים לתוצאת המנוע)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'skucompare.decide');
  if (!user) return;

  const { lkSku, decision, correctedSku, note } = req.body || {};
  if (!lkSku) return res.status(400).json({ error: 'חסר מק"ט ל.כ' });
  if (decision !== null && !DECISIONS.includes(decision)) return res.status(400).json({ error: 'החלטה לא תקינה' });
  const fixed = decision === 'corrected' ? String(correctedSku || '').trim() : null;
  if (decision === 'corrected' && !fixed) return res.status(400).json({ error: 'יש להזין את המק"ט הנכון' });

  const pool = getPool();
  const { rows: item } = await pool.query(
    `SELECT COALESCE(im.comp_sku, i.comp_sku) AS comp_sku FROM sku_compare_items i
     LEFT JOIN sku_compare_imports im ON im.lk_sku = i.lk_sku WHERE i.lk_sku = $1`,
    [lkSku]
  );
  if (!item[0]) return res.status(404).json({ error: `מק"ט ל.כ ${lkSku} לא נמצא בדוח` });
  if (decision !== null && decision !== 'corrected' && !item[0].comp_sku) {
    return res.status(400).json({ error: 'לפריט אין התאמה לאשר או לדחות - אפשר רק להזין מק"ט (תיקון)' });
  }

  if (decision === null) {
    await pool.query('DELETE FROM sku_compare_decisions WHERE lk_sku = $1', [lkSku]);
    return res.status(200).json({ ok: true, decision: null });
  }

  const noteText = note ? String(note).trim() || null : null;
  await pool.query(
    `INSERT INTO sku_compare_decisions (lk_sku, decision, corrected_sku, note, decided_by, decided_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (lk_sku) DO UPDATE SET decision = EXCLUDED.decision, corrected_sku = EXCLUDED.corrected_sku,
       note = EXCLUDED.note, decided_by = EXCLUDED.decided_by, decided_at = NOW()`,
    [lkSku, decision, fixed, noteText, user.id]
  );
  return res.status(200).json({
    ok: true, decision, corrected_sku: fixed, decision_note: noteText,
    decided_at: new Date().toISOString(), decided_by_name: user.name,
  });
}
