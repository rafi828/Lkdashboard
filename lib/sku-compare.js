const { getPool } = require('./db');

// השוואת מק"טים בלי תלות באפסים בהתחלה (030210 = 30210)
function normSku(sku) {
  const s = String(sku ?? '').trim();
  return s.replace(/^0+(?=.)/, '');
}

// כל מק"טי המתחרה, לפי מק"ט מנורמל
async function getCompItemsMap(pool = getPool()) {
  const { rows } = await pool.query(
    'SELECT comp_sku, comp_desc, comp_brand, category, catalog_page, comp_price::float AS comp_price FROM sku_compare_comp_items'
  );
  return new Map(rows.map((r) => [normSku(r.comp_sku), r]));
}

// כל שורות דוח "השוואת מק"טים", אחרי שכבות העדיפות: החלטה ידנית > יבוא "מרובי ברקודים" > תוצאת המנוע.
// ההחלטה עצמה מוחזרת בשדות decision/corrected_sku והמסך/הייצוא מחילים אותה; כאן נבנית השורה לפני ההחלטה:
//   source: 'engine' | 'barcodes'; import_kind: 'sure' (ודאי, "יבוא ידני") | 'multi' (לבדיקה) | null
//   engine_comp_sku: מה שהמנוע הציע במקור (מוצג מחוק כשהיבוא בחר מק"ט אחר)
// lkSkus = סינון אופציונלי.
async function getSkuCompareRows(lkSkus = null) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.lk_sku, i.lk_desc, i.lk_dept, i.comp_sku, i.comp_desc, i.comp_brand, i.confidence, i.notes,
            i.catalog_page, i.comp_price::float AS comp_price,
            im.kind AS import_kind, im.comp_sku AS import_comp_sku, im.options AS import_options,
            im.imported_at, iu.name AS imported_by_name,
            d.decision, d.corrected_sku, d.note AS decision_note, d.decided_at, u.name AS decided_by_name
     FROM sku_compare_items i
     LEFT JOIN sku_compare_imports im ON im.lk_sku = i.lk_sku
     LEFT JOIN users iu ON iu.id = im.imported_by
     LEFT JOIN sku_compare_decisions d ON d.lk_sku = i.lk_sku
     LEFT JOIN users u ON u.id = d.decided_by
     WHERE $1::varchar[] IS NULL OR i.lk_sku = ANY($1::varchar[])
     ORDER BY CASE i.confidence WHEN 'ודאי' THEN 1 WHEN 'סביר' THEN 2 WHEN 'לבדיקה' THEN 3 ELSE 4 END, i.lk_sku`,
    [lkSkus]
  );
  const comp = rows.some((r) => r.import_kind) ? await getCompItemsMap(pool) : new Map();

  return rows.map(({ import_comp_sku, import_options, ...r }) => {
    const out = { ...r, source: 'engine', engine_comp_sku: r.comp_sku };
    if (!r.import_kind) return out;

    const c = comp.get(normSku(import_comp_sku)) || {};
    out.source = 'barcodes';
    out.comp_sku = c.comp_sku || import_comp_sku;
    // אין תיאור מתחרה -> שם הפריט של ל.כ עם "(ל.כ)"
    out.comp_desc = c.comp_desc || (r.lk_desc ? `${r.lk_desc} (ל.כ)` : null);
    out.comp_brand = c.comp_brand || null;
    out.catalog_page = c.catalog_page || null;
    out.comp_price = c.comp_price ?? null;
    if (r.import_kind === 'sure') {
      out.confidence = 'ודאי';
      out.notes = null;
    } else {
      out.confidence = 'לבדיקה';
      out.notes = `מרובי ברקודים – כמה מק"טים אפשריים: ${(import_options || '').split(',').join(', ')}`;
    }
    return out;
  });
}

// התאמת ברקודים: לכל פריט ל.כ שבדוח, אילו מק"טי מתחרה מופיעים בברקודים שלו.
// barcodeRows = [{ lk_sku, barcode }], items = [{ lk_sku, comp_sku }] (תוצאת המנוע), compMap = getCompItemsMap().
// מחזיר { imports: [{ lk_sku, kind, comp_sku, options }], stats }.
function matchBarcodes(barcodeRows, items, compMap) {
  const engineByLk = new Map(items.map((i) => [i.lk_sku, i.comp_sku]));
  const optionsByLk = new Map();
  const fileLks = new Set();

  barcodeRows.forEach(({ lk_sku, barcode }) => {
    fileLks.add(lk_sku);
    if (!engineByLk.has(lk_sku)) return;          // רק פריטים שקיימים בקובץ התוצאות
    if (normSku(barcode) === normSku(lk_sku)) return; // הברקוד של הפריט הוא המק"ט שלו עצמו - לא שיוך
    const c = compMap.get(normSku(barcode));
    if (!c) return;
    const list = optionsByLk.get(lk_sku) || [];
    if (!list.includes(c.comp_sku)) list.push(c.comp_sku);
    optionsByLk.set(lk_sku, list);
  });

  const imports = [];
  optionsByLk.forEach((options, lk) => {
    const engine = engineByLk.get(lk);
    const engineOption = engine && options.find((o) => normSku(o) === normSku(engine));
    if (options.length === 1) imports.push({ lk_sku: lk, kind: 'sure', comp_sku: options[0], options });
    // כמה אפשרויות ואחת מהן היא מה שהמנוע הציע -> הברקוד מאשר את המנוע
    else if (engineOption) imports.push({ lk_sku: lk, kind: 'sure', comp_sku: engineOption, options });
    else imports.push({ lk_sku: lk, kind: 'multi', comp_sku: options[0], options });
  });

  const inReport = [...fileLks].filter((lk) => engineByLk.has(lk)).length;
  const stats = {
    sure: imports.filter((i) => i.kind === 'sure').length,
    multi: imports.filter((i) => i.kind === 'multi').length,
    notInReport: fileLks.size - inReport,
    noMatch: inReport - imports.length,
  };
  return { imports, stats };
}

const DECISION_LABELS = { approved: 'אושר', rejected: 'נדחה', corrected: 'תוקן' };

module.exports = { normSku, getCompItemsMap, getSkuCompareRows, matchBarcodes, DECISION_LABELS };
