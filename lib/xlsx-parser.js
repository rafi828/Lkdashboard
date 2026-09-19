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

module.exports = { parseClassificationFile, parseTargetsFile, parseSalesMatrixFile };
