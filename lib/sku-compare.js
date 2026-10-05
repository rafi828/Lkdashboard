const { getPool } = require('./db');

// כל שורות דוח "השוואת מק"טים": תוצאת המנוע + ההחלטה הידנית (אם יש). lkSkus = סינון אופציונלי.
async function getSkuCompareRows(lkSkus = null) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.lk_sku, i.lk_desc, i.lk_dept, i.comp_sku, i.comp_desc, i.comp_brand, i.confidence, i.notes,
            i.catalog_page, i.comp_price::float AS comp_price,
            d.decision, d.corrected_sku, d.note AS decision_note, d.decided_at, u.name AS decided_by_name
     FROM sku_compare_items i
     LEFT JOIN sku_compare_decisions d ON d.lk_sku = i.lk_sku
     LEFT JOIN users u ON u.id = d.decided_by
     WHERE $1::varchar[] IS NULL OR i.lk_sku = ANY($1::varchar[])
     ORDER BY CASE i.confidence WHEN 'ודאי' THEN 1 WHEN 'סביר' THEN 2 WHEN 'לבדיקה' THEN 3 ELSE 4 END, i.lk_sku`,
    [lkSkus]
  );
  return rows;
}

const DECISION_LABELS = { approved: 'אושר', rejected: 'נדחה', corrected: 'תוקן' };

module.exports = { getSkuCompareRows, DECISION_LABELS };
