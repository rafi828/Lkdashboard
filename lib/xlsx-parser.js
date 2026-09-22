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
function parseSalesMatrixFile(buffer) {
  const rows = sheetToRows(buffer);

  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === 'סוכן') { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) {
    throw new Error('לא נמצאה שורת כותרת "סוכן" בקובץ מטריצת המכירות');
  }

  const header = rows[headerRowIdx];
  const monthCols = []; // [{col, year, month}]
  header.forEach((h, col) => {
    if (typeof h !== 'string') return;
    const m = h.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) monthCols.push({ col, month: Number(m[1]), year: Number(m[2]) });
  });

  const out = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const code = toInt(row[0]);
    if (code === null) continue;
    const name = row[1] ? String(row[1]).trim() : null;
    monthCols.forEach(({ col, year, month }) => {
      const val = row[col];
      if (val === null || val === undefined) return; // חודש שעדיין לא קרה - לא נכתב
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
  'נייד סוכן': 'agent_phone',
  'סוג יעד - רבעוני/שנתי': 'target_type',
  'יעד רבעון 1': 'q1_target',
  'סה"כ מכירות בפועל רבעון 1': 'q1_actual',
  'יעד רבעון 2': 'q2_target',
  'סה"כ מכירות בפועל רבעון 2': 'q2_actual',
  'יעד רבעון 3': 'q3_target',
  'סה"כ מכירות בפועל רבעון 3': 'q3_actual',
  'יעד רבעון 4': 'q4_target',
  'סה"כ מכירות רבעון 4 מעוגל': 'q4_actual',
  'סה"כ יעד שנתי': 'annual_target',
  'סה"כ מכירות שנה קודמת': 'last_year_sales',
  'חודש 1': 'm1', 'חודש 2': 'm2', 'חודש 3': 'm3', 'חודש 4': 'm4', 'חודש 5': 'm5', 'חודש 6': 'm6',
};
const QUARTERLY_NUMERIC_FIELDS = [
  'customer_id', 'q1_target', 'q1_actual', 'q2_target', 'q2_actual', 'q3_target', 'q3_actual',
  'q4_target', 'q4_actual', 'annual_target', 'last_year_sales', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
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
    row.agent_phone = row.agent_phone ? String(row.agent_phone).trim() : null;
    row.target_type = row.target_type ? String(row.target_type).trim() : 'רבעוני';
    row.target_type_simple = simplifyTargetType(row.target_type);
    row.year = year;
    if (row.customer_id) out.push(row);
  });
  return out;
}

module.exports = { parseClassificationFile, parseTargetsFile, parseSalesMatrixFile, parseQuarterlyTargetsFile };
