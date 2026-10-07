const XLSX = require('xlsx');

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function sheetToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

function toInt(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// ---- 1. סיווג_סוכנים_לתחומים.xlsx ----
// עמודות: תחום בטבלה | סוכן | שם סוכן
function parseClassificationFile(buffer) {
  const rows = sheetToRows(buffer);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const domain = row[0];
    const code = toInt(row[1]);
    const name = row[2];
    if (!domain || code === null) continue;
    out.push({ domain: String(domain).trim(), agent_code: code, agent_name: name ? String(name).trim() : null });
  }
  return out;
}

// ---- 2. יעדי_סוכנים_לפי_חודש.xlsx ----
// קובץ "מבולגן" עם כמה בלוקים; מוצאים שורת כותרת אחת ("קוד סוכן"),
// ואז אוספים כל שורה בכל מקום בגיליון שיש לה קוד סוכן מספרי בעמודה הראשונה.
// מחזיר רשומות חודשיות לכל 12 החודשים, לפי year שהועבר (השנה לא רשומה בקובץ עצמו).
function parseTargetsFile(buffer, year) {
  const rows = sheetToRows(buffer);

  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === 'קוד סוכן') { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) {
    throw new Error('לא נמצאה שורת כותרת "קוד סוכן" בקובץ היעדים');
  }

  const header = rows[headerRowIdx];
  // header[3..14] אמורות להיות ינואר..דצמבר (בסדר הזה)
  const monthColIndex = {};
  HEBREW_MONTHS.forEach((name, idx) => {
    const col = header.findIndex((h) => h === name);
    if (col !== -1) monthColIndex[idx + 1] = col; // month number (1-12) -> column index
  });

  const out = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const code = toInt(row[0]);
    if (code === null) continue;
    const name = row[1] ? String(row[1]).trim() : null;
    for (let month = 1; month <= 12; month++) {
      const col = monthColIndex[month];
      if (col === undefined) continue;
      out.push({
        agent_code: code,
        agent_name: name,
        year,
        month,
        target_amount: toNum(row[col]),
      });
    }
  }
  return out;
}

// ---- 3. מטריצת_מכירות_חודשי_לסוכן.xlsx ----
// עמודות: סוכן | שם סוכן | סה"כ | MM/YYYY | MM/YYYY | ... (בכל סדר, כל עמודה חודש משלה)
// עובד גם עם ייצוא ישיר מפריוריטי (HTML ב-UTF-16 עם סיומת xls) - ראה decodeSpreadsheetBuffer.
function parseSalesMatrixFile(buffer) {
  const rows = readSheetLoose(buffer);

  const headerRowIdx = rows.findIndex((r) => r && cellText(r[0]) === 'סוכן');
  if (headerRowIdx === -1) {
    throw new Error('לא נמצאה שורת כותרת "סוכן" בקובץ מטריצת המכירות');
  }

  const header = rows[headerRowIdx];
  const monthCols = []; // [{col, year, month}]
  header.forEach((h, col) => {
    const m = cellText(h).match(/^(\d{1,2})\/(\d{4})$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) monthCols.push({ col, month: Number(m[1]), year: Number(m[2]) });
  });
  if (monthCols.length === 0) {
    throw new Error('לא נמצאו עמודות חודשים בתבנית MM/YYYY (למשל "09/2026") בשורת הכותרת של קובץ מטריצת המכירות');
  }

  const out = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const code = toInt(row[0]);
    if (code === null) continue;
    const name = row[1] ? String(row[1]).trim() : null;
    monthCols.forEach(({ col, year, month }) => {
      const val = row[col];
      if (val === null || val === undefined || cellText(val) === '') return; // חודש שעדיין לא קרה - לא נכתב
      out.push({ agent_code: code, agent_name: name, year, month, sales_amount: toNum(val) });
    });
  }
  return out;
}

// ---- 4. יעדים_רבעוניים_ללקוחות_סוכנים.xlsx ----
// גיליון בשם "עיבוד התקדמות לקוחות יעדים" (או שם שמכיל "עיבוד התקדמות"); עמודות לפי כותרת (מפת המרה קבועה למטה).
const QUARTERLY_SHEET_NAME = 'עיבוד התקדמות לקוחות יעדים';
const QUARTERLY_COLUMN_MAP = {
  'לקוח': 'customer_id',
  'שם לקוח - 5': 'customer_name',
  'סוכן מלקוח': 'agent_name',
  'קוד סוכן מלקוח - 2': 'agent_code',   // מקשר לקוח לסוכן (אותו קוד כמו בדף ניהול המשתמשים) - קובע מה סוכן רואה
  'דואר אלקטרוני סוכן': 'agent_email',
  'נייד סוכן': 'agent_phone',
  'דואר אלקטרוני חנוך': 'chanoch_email',
  'דואר אלקטרוני רפי': 'rafi_email',
  'דואר אלקטרוני דוד': 'david_email',
  'דוא"ל אמיר': 'amir_email',
  'סוג יעד - רבעוני/שנתי': 'target_type',
  'יעד רבעון 1': 'q1_target',
  'סה"כ מכירות בפועל רבעון 1': 'q1_actual',
  'סכום זיכוי רבעון 1 מעוגל': 'q1_credit',
  'יעד רבעון 2': 'q2_target',
  'סה"כ מכירות בפועל רבעון 2': 'q2_actual',
  'סכום זיכוי רבעון 2 מעוגל': 'q2_credit',
  'יעד רבעון 3': 'q3_target',
  'סה"כ מכירות בפועל רבעון 3': 'q3_actual',
  'סכום זיכוי רבעון 3 מעוגל': 'q3_credit',
  'יעד רבעון 4': 'q4_target',
  'סה"כ מכירות רבעון 4 מעוגל': 'q4_actual',
  'סכום הזיכוי רבעון 4 מעוגל': 'q4_credit',
  'סה"כ יעד שנתי': 'annual_target',
  'סה"כ מכירות שנה קודמת': 'last_year_sales',
  'חודש 1': 'm1', 'חודש 2': 'm2', 'חודש 3': 'm3', 'חודש 4': 'm4', 'חודש 5': 'm5', 'חודש 6': 'm6',
};
const QUARTERLY_NUMERIC_FIELDS = [
  'customer_id', 'q1_target', 'q1_actual', 'q1_credit', 'q2_target', 'q2_actual', 'q2_credit',
  'q3_target', 'q3_actual', 'q3_credit', 'q4_target', 'q4_actual', 'q4_credit',
  'annual_target', 'last_year_sales', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
];

function simplifyTargetType(t) {
  t = t || '';
  if (t.includes('רבעוני') && !t.includes('שנתי') && !t.includes('מייל')) return 'רבעוני';
  if (t.includes('שנתי')) return 'שנתי';
  return 'אחר / הערה';
}

function parseQuarterlyTargetsFile(buffer, year) {
  const XLSXmod = require('xlsx');
  const wb = XLSXmod.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => n === QUARTERLY_SHEET_NAME) ||
    wb.SheetNames.find((n) => n.includes('עיבוד התקדמות')) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSXmod.utils.sheet_to_json(ws, { defval: null });

  const out = [];
  rawRows.forEach((raw) => {
    const r = {};
    Object.keys(raw).forEach((k) => { r[k.trim()] = raw[k]; });
    const row = {};
    Object.entries(QUARTERLY_COLUMN_MAP).forEach(([src, dst]) => { row[dst] = r[src]; });
    QUARTERLY_NUMERIC_FIELDS.forEach((f) => { row[f] = toNum(row[f]); });
    row.customer_name = row.customer_name ? String(row.customer_name).trim() : null;
    row.agent_name = row.agent_name ? String(row.agent_name).trim() : 'לא ידוע';
    const agentCode = parseInt(row.agent_code, 10);
    row.agent_code = Number.isFinite(agentCode) ? agentCode : null; // ריק בקובץ -> רק Admin/מנהל יראו את הלקוח
    row.agent_email = row.agent_email ? String(row.agent_email).trim() : null;
    row.agent_phone = row.agent_phone ? String(row.agent_phone).trim() : null;
    row.chanoch_email = row.chanoch_email ? String(row.chanoch_email).trim() : null;
    row.rafi_email = row.rafi_email ? String(row.rafi_email).trim() : null;
    row.david_email = row.david_email ? String(row.david_email).trim() : null;
    row.amir_email = row.amir_email ? String(row.amir_email).trim() : null;
    row.target_type = row.target_type ? String(row.target_type).trim() : 'רבעוני';
    row.target_type_simple = simplifyTargetType(row.target_type);
    row.year = year;
    if (row.customer_id) out.push(row);
  });
  return out;
}

// ---- 5. השוואת מק"טים (פלט של tools/signet-matching) ----
// לפי שם גיליון + כותרות עמודה (שורה 1). לכל עמודה כמה שמות אפשריים, כדי ששינוי שם עמודה בכלי
// (למשל "סיגנט" -> "מתחרה") לא ישבור את הטעינה.
const SKU_MATCHES_SHEET = 'התאמות';
const SKU_UNMATCHED_SHEET = 'ל.כ ללא התאמה';
const SKU_MATCH_COLUMNS = {
  lk_sku: ['מק"ט ל.כ'],
  lk_desc: ['תיאור ל.כ'],
  lk_dept: ['מחלקה ל.כ', 'מחלקה'],
  comp_sku: ['מק"ט סיגנט', 'מק"ט מתחרה'],
  comp_desc: ['תיאור סיגנט', 'תיאור מתחרה'],
  confidence: ['רמת ביטחון'],
  notes: ['הערות'],
  catalog_page: ['עמוד בקטלוג סיגנט', 'עמוד בקטלוג'],
  comp_price: ['מחיר מחירון סיגנט (₪)', 'מחיר מחירון (₪)'],
  comp_brand: ['מותג בקטלוג פלד', 'מותג'],
};
const SKU_UNMATCHED_COLUMNS = {
  lk_sku: ['מק"ט ל.כ'],
  lk_desc: ['תיאור ל.כ'],
  lk_dept: ['מחלקה', 'מחלקה ל.כ'],
  reason: ['סיבה'],
  notes: ['הערות'],
};
const SKU_COMP_UNMATCHED_SHEET = 'סיגנט ללא התאמה';
const SKU_COMP_UNMATCHED_COLUMNS = {
  comp_sku: ['מק"ט סיגנט', 'מק"ט מתחרה'],
  comp_desc: ['תיאור סיגנט', 'תיאור מתחרה'],
  category: ['קטגוריה'],
  comp_brand: ['מותג בקטלוג פלד', 'מותג'],
  catalog_page: ['עמוד בקטלוג', 'עמוד בקטלוג סיגנט'],
  comp_price: ['מחיר מחירון (₪)', 'מחיר מחירון סיגנט (₪)'],
};
const SKU_CONFIDENCES = ['ודאי', 'סביר', 'לבדיקה'];

function skuText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function skuPrice(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function readSkuSheet(XLSXmod, wb, sheetName, columns, keyColumn = 'lk_sku') {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`לא נמצא גיליון בשם "${sheetName}" בקובץ`);
  const rawRows = XLSXmod.utils.sheet_to_json(ws, { defval: null });
  const headers = rawRows.length ? Object.keys(rawRows[0]).map((h) => h.trim()) : [];
  const pick = {};
  Object.entries(columns).forEach(([dst, names]) => {
    const found = names.find((n) => headers.includes(n));
    if (!found && dst === keyColumn) throw new Error(`בגיליון "${sheetName}" חסרה העמודה "${names[0]}"`);
    pick[dst] = found;
  });
  return rawRows.map((raw) => {
    const r = {};
    Object.keys(raw).forEach((k) => { r[k.trim()] = raw[k]; });
    const row = {};
    Object.entries(pick).forEach(([dst, src]) => { row[dst] = src ? r[src] : null; });
    return row;
  });
}

// מחזיר { items: שורה לכל פריט ל.כ, compItems: כל מק"טי המתחרה (מהתאמות + "סיגנט ללא התאמה") }
function parseSkuCompareFile(buffer) {
  const XLSXmod = require('xlsx');
  const wb = XLSXmod.read(buffer, { type: 'buffer', cellDates: false });
  const byLkSku = new Map();
  const compBySku = new Map();

  readSkuSheet(XLSXmod, wb, SKU_MATCHES_SHEET, SKU_MATCH_COLUMNS).forEach((r) => {
    const lkSku = skuText(r.lk_sku);
    if (!lkSku) return;
    const confidence = skuText(r.confidence);
    const page = toInt(r.catalog_page);
    const price = skuPrice(r.comp_price);
    const compSku = skuText(r.comp_sku);
    if (compSku && !compBySku.has(compSku)) {
      compBySku.set(compSku, {
        comp_sku: compSku, comp_desc: skuText(r.comp_desc), comp_brand: skuText(r.comp_brand),
        category: null, catalog_page: page, comp_price: price,
      });
    }
    byLkSku.set(lkSku, {
      lk_sku: lkSku,
      lk_desc: skuText(r.lk_desc),
      lk_dept: skuText(r.lk_dept),
      comp_sku: skuText(r.comp_sku),
      comp_desc: skuText(r.comp_desc),
      comp_brand: skuText(r.comp_brand),
      confidence: SKU_CONFIDENCES.includes(confidence) ? confidence : 'לבדיקה',
      notes: skuText(r.notes),
      catalog_page: page,
      comp_price: price,
    });
  });

  readSkuSheet(XLSXmod, wb, SKU_UNMATCHED_SHEET, SKU_UNMATCHED_COLUMNS).forEach((r) => {
    const lkSku = skuText(r.lk_sku);
    if (!lkSku || byLkSku.has(lkSku)) return;
    const reason = skuText(r.reason), notes = skuText(r.notes);
    byLkSku.set(lkSku, {
      lk_sku: lkSku,
      lk_desc: skuText(r.lk_desc),
      lk_dept: skuText(r.lk_dept),
      comp_sku: null, comp_desc: null, comp_brand: null,
      confidence: 'ללא התאמה',
      notes: [reason, notes].filter(Boolean).join(' – ') || null,
      catalog_page: null, comp_price: null,
    });
  });

  // גיליון "סיגנט ללא התאמה" - אופציונלי (קבצים ישנים בלי הגיליון עדיין נטענים)
  if (wb.Sheets[SKU_COMP_UNMATCHED_SHEET]) {
    readSkuSheet(XLSXmod, wb, SKU_COMP_UNMATCHED_SHEET, SKU_COMP_UNMATCHED_COLUMNS, 'comp_sku').forEach((r) => {
      const compSku = skuText(r.comp_sku);
      if (!compSku) return;
      compBySku.set(compSku, {
        comp_sku: compSku, comp_desc: skuText(r.comp_desc), comp_brand: skuText(r.comp_brand),
        category: skuText(r.category), catalog_page: toInt(r.catalog_page), comp_price: skuPrice(r.comp_price),
      });
    });
  }

  return { items: Array.from(byLkSku.values()), compItems: Array.from(compBySku.values()) };
}

// ---- 6. "מרובי ברקודים" (ייצוא פריוריטי "רשימת פריטים וברקודים") ----
// שורה לכל ברקוד: פריט (מק"ט ל.כ) | שם | ברקוד | הערה. פריוריטי שומר את הקובץ כטבלת HTML ב-UTF-16 עם סיומת xls,
// אז מזהים את הקידוד לפני הקריאה. עובד גם עם קובץ Excel רגיל באותו מבנה. מחזיר [{ lk_sku, barcode }].
function decodeSpreadsheetBuffer(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return { data: buffer.toString('utf16le').replace(/^\uFEFF/, ''), type: 'string' };
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer);
    swapped.swap16();
    return { data: swapped.toString('utf16le').replace(/^\uFEFF/, ''), type: 'string' };
  }
  const head = buffer.slice(0, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (head.startsWith('<')) return { data: buffer.toString('utf8'), type: 'string' };
  // xlsx (zip: PK) / xls (OLE: D0 CF) - קובץ בינארי. כל השאר (CSV וכו') - טקסט UTF-8, כדי שעברית תיקרא נכון
  const isBinary = (buffer[0] === 0x50 && buffer[1] === 0x4b) || (buffer[0] === 0xd0 && buffer[1] === 0xcf);
  if (!isBinary) return { data: buffer.toString('utf8').replace(/^\uFEFF/, ''), type: 'string' };
  return { data: buffer, type: 'buffer' };
}

function parseSkuBarcodesFile(buffer) {
  const XLSXmod = require('xlsx');
  const { data, type } = decodeSpreadsheetBuffer(buffer);
  const wb = XLSXmod.read(data, { type, raw: true, cellDates: false });
  const rows = XLSXmod.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });

  const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const headerIdx = rows.findIndex((r) => r.some((c) => clean(c) === 'פריט') && r.some((c) => clean(c) === 'ברקוד'));
  if (headerIdx === -1) throw new Error('לא נמצאה שורת כותרת עם העמודות "פריט" ו"ברקוד"');
  const header = rows[headerIdx].map(clean);
  const lkCol = header.indexOf('פריט');
  const barcodeCol = header.indexOf('ברקוד');

  const out = [];
  rows.slice(headerIdx + 1).forEach((r) => {
    const lk = clean(r[lkCol]);
    const barcode = clean(r[barcodeCol]);
    if (lk && barcode) out.push({ lk_sku: lk, barcode });
  });
  return out;
}

// ---- 7. "חיפוש לפי מסמך" (קובץ חופשי: בקשה להצעת מחיר וכו') ----
// אם יש שורת כותרות עם עמודת מק"ט ("מק"ט" / "קוד" / "פריט") - נקראות שורות: מק"ט, תיאור, כמות (mode: 'columns').
// אחרת - כל תא שנראה כמו מק"ט (4-13 ספרות) נאסף (mode: 'scan'). מחזיר { mode, lines: [{ code, desc, qty }] }.
const LOOKUP_CODE_HEADERS = [/מק["״'׳]?ט/, /קוד/, /^פריט$/, /^מספר פריט$/, /^(sku|item|part|code|cat\.? ?no)/i];
const LOOKUP_DESC_HEADER = /תיאור|^שם|description|^desc/i;
const LOOKUP_QTY_HEADER = /כמות|^qty|quantity/i;
const LOOKUP_CODE_VALUE = /^\d{4,13}$/;

function parseSkuLookupFile(buffer) {
  const XLSXmod = require('xlsx');
  const { data, type } = decodeSpreadsheetBuffer(buffer);
  const wb = XLSXmod.read(data, { type, raw: true, cellDates: false });
  const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const toCode = (v) => clean(v).replace(/[\s-]/g, '');

  const columnLines = [];
  const scanCodes = [];
  wb.SheetNames.forEach((name) => {
    const rows = XLSXmod.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
    let header = null;
    for (let i = 0; i < Math.min(rows.length, 30) && !header; i += 1) {
      const cells = rows[i].map(clean);
      for (const re of LOOKUP_CODE_HEADERS) {
        const codeCol = cells.findIndex((c) => c && re.test(c) && !LOOKUP_DESC_HEADER.test(c));
        if (codeCol !== -1) {
          header = {
            row: i, codeCol,
            descCol: cells.findIndex((c, j) => j !== codeCol && c && LOOKUP_DESC_HEADER.test(c)),
            qtyCol: cells.findIndex((c, j) => j !== codeCol && c && LOOKUP_QTY_HEADER.test(c)),
          };
          break;
        }
      }
    }
    if (header) {
      rows.slice(header.row + 1).forEach((r) => {
        const code = toCode(r[header.codeCol]);
        const desc = header.descCol >= 0 ? clean(r[header.descCol]) : '';
        const qtyNum = header.qtyCol >= 0 ? Number(clean(r[header.qtyCol]).replace(/,/g, '')) : NaN;
        if (code || desc) columnLines.push({ code: code || null, desc: desc || null, qty: Number.isFinite(qtyNum) && qtyNum !== 0 ? qtyNum : null });
      });
    } else {
      rows.forEach((r) => r.forEach((c) => {
        const code = toCode(c);
        if (LOOKUP_CODE_VALUE.test(code)) scanCodes.push({ code, desc: null, qty: null });
      }));
    }
  });
  if (columnLines.length) return { mode: 'columns', lines: columnLines };
  return { mode: 'scan', lines: scanCodes };
}


// ---- 8. קובץ לקוחות ("מכירות ללקוח") - ייצוא פריוריטי ----
// שורת הכותרת = השורה שיש בה "לקוח" ו"שם לקוח". קבועים: לקוח (מספר), שם לקוח, סוכן (שם).
// כל שאר העמודות נשמרות כ"פרטי לקוח" לפי שם הכותרת (טלפון, נייד, פקס, כתובת, קבוצה, מייל, ח.פ...) - כך שעמודה
// חדשה בקובץ מופיעה בדוח בלי שינוי קוד. כותרת כפולה: עמודה מספרית מקבלת "קוד " לפני השם (למשל "קוד קבוצה"),
// ועמודה שזהה לגמרי לעמודה קודמת באותו שם - מדולגת.
// מחזיר { customers: [{ customer_id, customer_name, agent_name, details: {כותרת: ערך|null} }], detailColumns: [...] }
const CUSTOMER_FIXED_HEADERS = { 'לקוח': 'customer_id', 'שם לקוח': 'customer_name', 'סוכן': 'agent_name', 'שם סוכן': 'agent_name' };

function readSheetLoose(buffer) {
  const { data, type } = decodeSpreadsheetBuffer(buffer);
  const wb = XLSX.read(data, { type, raw: true, cellDates: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
}

const cellText = (v) => (v === null || v === undefined ? '' : String(v).trim());

function parseCustomersFile(buffer) {
  const rows = readSheetLoose(buffer);
  const headerIdx = rows.findIndex((r) => r && r.some((c) => cellText(c) === 'לקוח') && r.some((c) => cellText(c) === 'שם לקוח'));
  if (headerIdx === -1) throw new Error('לא נמצאה שורת כותרת עם העמודות "לקוח" ו"שם לקוח"');
  const header = rows[headerIdx].map(cellText);
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r && toInt(r[header.indexOf('לקוח')]) !== null);

  const fixed = {};
  const byName = {}; // כותרת -> [אינדקסי עמודות] (לעמודות הפרטים)
  header.forEach((h, col) => {
    if (!h) return;
    const f = CUSTOMER_FIXED_HEADERS[h];
    if (f && fixed[f] === undefined) { fixed[f] = col; return; }
    if (f) return; // כפילות של עמודה קבועה
    (byName[h] = byName[h] || []).push(col);
  });

  const isNumericCol = (col) => dataRows.every((r) => r[col] === null || r[col] === '' || Number.isFinite(Number(r[col])));
  const sameCol = (a, b) => dataRows.every((r) => cellText(r[a]) === cellText(r[b]));
  const detailCols = []; // [{ col, name }]
  Object.entries(byName).forEach(([name, cols]) => {
    const kept = [];
    cols.forEach((col) => { if (!kept.some((k) => sameCol(k, col))) kept.push(col); });
    const hasText = kept.some((c) => !isNumericCol(c));
    kept.forEach((col, i) => {
      let label = name;
      if (kept.length > 1 && hasText && isNumericCol(col)) label = 'קוד ' + name;
      else if (i > 0 && detailCols.some((d) => d.name === label)) label = `${name} (${i + 1})`;
      detailCols.push({ col, name: label });
    });
  });
  detailCols.sort((a, b) => a.col - b.col);

  const customers = dataRows.map((r) => {
    const details = {};
    detailCols.forEach(({ col, name }) => { details[name] = cellText(r[col]) || null; });
    return {
      customer_id: toInt(r[fixed.customer_id]),
      customer_name: fixed.customer_name !== undefined ? cellText(r[fixed.customer_name]) || null : null,
      agent_name: fixed.agent_name !== undefined ? cellText(r[fixed.agent_name]) || null : null,
      details,
    };
  });
  return { customers, detailColumns: detailCols.map((d) => d.name), hasAgent: fixed.agent_name !== undefined };
}

// ---- 9. מכירות לפי חודשים ללקוח ("מכירות ללקוח") - ייצוא פריוריטי ----
// שורת הכותרת = השורה שיש בה "לקוח" ולפחות עמודה אחת בתבנית MM/YYYY. "סוכן" מופיע פעמיים: קוד ואז שם
// (העמודה המספרית = קוד). "סה"כ" ושאר העמודות - לא נקראות.
// חודש שהעמודה שלו ריקה לגמרי (חודש עתידי) - מדולג ולא נחשב "חודש שבקובץ".
// מחזיר { months: [{year, month}], emptyMonths: [...], records: [{ customer_id, customer_name, agent_code, agent_name, year, month, amount }] }
function parseCustomerSalesFile(buffer) {
  const rows = readSheetLoose(buffer);
  const monthOf = (h) => {
    const m = cellText(h).match(/^(\d{1,2})\/(\d{4})$/);
    return m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? { month: Number(m[1]), year: Number(m[2]) } : null;
  };
  const headerIdx = rows.findIndex((r) => r && r.some((c) => cellText(c) === 'לקוח') && r.some((c) => monthOf(c)));
  if (headerIdx === -1) throw new Error('לא נמצאה שורת כותרת עם עמודה "לקוח" ועמודות חודשים בתבנית MM/YYYY');
  const header = rows[headerIdx].map(cellText);
  const custCol = header.indexOf('לקוח');
  const nameCol = header.indexOf('שם לקוח');
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r && toInt(r[custCol]) !== null);

  const agentCols = header.map((h, i) => (h === 'סוכן' || h === 'קוד סוכן' ? i : -1)).filter((i) => i !== -1);
  const isNumericCol = (col) => dataRows.every((r) => r[col] === null || r[col] === '' || Number.isFinite(Number(r[col])));
  const codeCol = agentCols.find(isNumericCol);
  const agentNameCol = header.indexOf('שם סוכן') !== -1 ? header.indexOf('שם סוכן') : agentCols.find((c) => c !== codeCol);

  const monthCols = [];
  const emptyMonths = [];
  header.forEach((h, col) => {
    const m = monthOf(h);
    if (!m) return;
    const hasData = dataRows.some((r) => r[col] !== null && r[col] !== '');
    (hasData ? monthCols : emptyMonths).push({ col, ...m });
  });

  const agg = new Map();
  dataRows.forEach((r) => {
    const customer_id = toInt(r[custCol]);
    const agent_code = codeCol !== undefined ? toInt(r[codeCol]) ?? 0 : 0;
    const agent_name = agentNameCol !== undefined ? cellText(r[agentNameCol]) || null : null;
    const customer_name = nameCol !== -1 ? cellText(r[nameCol]) || null : null;
    monthCols.forEach(({ col, year, month }) => {
      const amount = toNum(r[col]);
      if (!amount) return;
      const key = `${customer_id}|${agent_code}|${year}|${month}`;
      const prev = agg.get(key);
      if (prev) prev.amount += amount;
      else agg.set(key, { customer_id, customer_name, agent_code, agent_name, year, month, amount });
    });
  });

  const strip = ({ col, ...m }) => m;
  return { months: monthCols.map(strip), emptyMonths: emptyMonths.map(strip), records: [...agg.values()] };
}

// ---- 10. "הזמנות רכש לפי עצי מוצר" - ארבעה קבצים מפריוריטי, נקראים לפי מיקום עמודה (כמו הכלי המקורי) ----
// קוד פריט: מספר -> מחרוזת בלי ".0" (למשל 100110), טקסט -> כמו שהוא.
function bomCode(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v)) : null;
  const s = String(v).replace(/\u00a0/g, ' ').trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s)));
  return s.slice(0, 50);
}
const bomName = (v) => cellText(v).replace(/\u00a0/g, ' ');
const bomNum = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? 0 : n;
};

// עצי מוצר: שורות 1-2 כותרות. A קוד אב | B שם אב | C קוד בן | D שם בן | F כמות ליחידה (ריק/0 = 1).
// אותו זוג אב-בן פעמיים בקובץ -> הכמויות מתחברות. מחזיר { edges: [{parent, child, qty}], names: {code: name} }
function parseBomTreeFile(buffer) {
  const rows = readSheetLoose(buffer);
  const byPair = new Map();
  const names = {};
  rows.slice(2).forEach((r) => {
    if (!r) return;
    const parent = bomCode(r[0]);
    const child = bomCode(r[2]);
    if (!parent || !child) return;
    const qty = bomNum(r[5]) || 1;
    const key = parent + '\u0000' + child;
    const cur = byPair.get(key);
    if (cur) cur.qty += qty;
    else byPair.set(key, { parent, child, qty });
    if (bomName(r[1])) names[parent] = bomName(r[1]);
    if (bomName(r[3])) names[child] = bomName(r[3]);
  });
  if (byPair.size === 0) throw new Error('לא נמצאו שורות תקינות בקובץ עצי המוצר (קוד אב בעמודה A, קוד בן בעמודה C, החל משורה 3)');
  return { edges: Array.from(byPair.values()), names };
}

// מכירות תקופתי: שורה 1 - טווח תאריכים "dd/mm/yyyy ... dd/mm/yyyy" (ממנו מחושבת התקופה). מהשורה 3:
// A קוד | B שם | C כמות | E סכום. מחזיר { rows: [{code, name, qty, has_qty, amount}], period: {from, to, days} | null }
function parseBomSalesFile(buffer) {
  const rows = readSheetLoose(buffer);
  const headText = rows.slice(0, 2).flat().map(cellText).join(' ');
  const dates = headText.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
  let period = null;
  if (dates && dates.length >= 2) {
    const toDate = (t) => { const [d, m, y] = t.split('/').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const d1 = toDate(dates[0]);
    const d2 = toDate(dates[1]);
    if (!isNaN(d1) && !isNaN(d2)) period = { from: dates[0], to: dates[1], days: Math.round(Math.abs(d2 - d1) / 86400000) };
  }
  const byCode = new Map();
  rows.slice(2).forEach((r) => {
    if (!r) return;
    const code = bomCode(r[0]);
    if (!code) return;
    const q = r[2];
    const hasQty = q !== null && q !== undefined && q !== '' && Number.isFinite(Number(q));
    byCode.set(code, { code, name: bomName(r[1]), qty: hasQty ? Number(q) : 0, has_qty: hasQty, amount: bomNum(r[4]) });
  });
  if (byCode.size === 0) throw new Error('לא נמצאו שורות תקינות בקובץ המכירות (קוד פריט בעמודה A, החל משורה 3)');
  return { rows: Array.from(byCode.values()), period };
}

// יתרות פריטים - מטריצת מחסנים: שורה 2 - שמות המחסנים (עמודת "סה\"כ" ועמודת "ייצור" מזוהות לפי השם).
// מהשורה 4: A קוד | B שם. מחזיר { rows: [{code, name, total, production}], totalFound, productionFound }
function parseBomStockFile(buffer) {
  const rows = readSheetLoose(buffer);
  const whRow = rows[1] || [];
  let totalIdx = -1;
  let prodIdx = -1;
  for (let i = 2; i < whRow.length; i++) {
    const t = cellText(whRow[i]).replace(/['"׳״]/g, '');
    if (totalIdx < 0 && /סה.?כ/.test(t)) totalIdx = i;
    if (prodIdx < 0 && /^ייצור$/.test(t)) prodIdx = i;
  }
  const totalFound = totalIdx >= 0;
  if (!totalFound) totalIdx = 2;
  const byCode = new Map();
  rows.slice(3).forEach((r) => {
    if (!r) return;
    const code = bomCode(r[0]);
    if (!code) return;
    byCode.set(code, { code, name: bomName(r[1]), total: bomNum(r[totalIdx]), production: prodIdx >= 0 ? bomNum(r[prodIdx]) : 0 });
  });
  if (byCode.size === 0) throw new Error('לא נמצאו שורות תקינות בקובץ היתרות (קוד פריט בעמודה A, החל משורה 4)');
  return { rows: Array.from(byCode.values()), totalFound, productionFound: prodIdx >= 0 };
}

// הזמנות ספקים: מהשורה 3: A קוד | B שם | C מלאי | D מוזמן ע"י לקוחות | E מוזמן מספקים | F עתידי
function parseBomOrdersFile(buffer) {
  const rows = readSheetLoose(buffer);
  const byCode = new Map();
  rows.slice(2).forEach((r) => {
    if (!r) return;
    const code = bomCode(r[0]);
    if (!code) return;
    byCode.set(code, {
      code, name: bomName(r[1]), stock: bomNum(r[2]), by_customers: bomNum(r[3]), by_suppliers: bomNum(r[4]), future: bomNum(r[5]),
    });
  });
  if (byCode.size === 0) throw new Error('לא נמצאו שורות תקינות בקובץ הזמנות הספקים (קוד פריט בעמודה A, החל משורה 3)');
  return { rows: Array.from(byCode.values()) };
}

module.exports = { parseBomTreeFile, parseBomSalesFile, parseBomStockFile, parseBomOrdersFile, parseCustomersFile, parseCustomerSalesFile, parseSkuLookupFile, parseClassificationFile, parseTargetsFile, parseSalesMatrixFile, parseQuarterlyTargetsFile, parseSkuCompareFile, parseSkuBarcodesFile };
