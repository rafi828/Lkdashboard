const { getPool } = require('./db');

const HEBREW_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

// ==========================================================
// ימי עסקים בישראל: יום עבודה = ראשון-חמישי (JS getDay: 0=Sun ... 6=Sat)
// שישי (5) ושבת (6) הם סוף שבוע. (חגים אינם מטופלים בגרסה זו.)
// ==========================================================
function isBusinessDay(date) {
  const d = date.getDay();
  return d !== 5 && d !== 6;
}

function businessDaysInMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isBusinessDay(new Date(year, month - 1, d))) count++;
  }
  return count;
}

function businessDaysElapsed(year, month, uptoDate) {
  const upto = uptoDate.getDate();
  let count = 0;
  for (let d = 1; d <= upto; d++) {
    if (isBusinessDay(new Date(year, month - 1, d))) count++;
  }
  return count;
}

/**
 * מגדיר את טווח החודשים לתקופה שנבחרה.
 * refYear/refMonth = החודש שנבחר בבורר החודש (ברירת מחדל: החודש הנוכחי).
 * אם החודש שנבחר הוא בפועל החודש הנוכחי (לפי תאריך המערכת האמיתי) - הוא נחשב "חלקי"
 * ומחושב לפי ימי עסקים שחלפו. אחרת (חודש עבר) הוא נחשב חודש שלם.
 */
function getPeriodDefinition(period, refYear, refMonth) {
  const now = new Date();
  const isRefCurrentMonth = refYear === now.getFullYear() && refMonth === now.getMonth() + 1;
  const asOfDate = isRefCurrentMonth ? now : new Date(refYear, refMonth - 1, businessDaysInMonthCalendarDays(refYear, refMonth));

  if (period === 'mtd') {
    return { year: refYear, fullMonths: [], partialMonth: refMonth, isPartial: isRefCurrentMonth, asOfDate };
  }
  if (period === 'ytd') {
    const fullMonths = [];
    for (let m = 1; m < refMonth; m++) fullMonths.push(m);
    return { year: refYear, fullMonths, partialMonth: refMonth, isPartial: isRefCurrentMonth, asOfDate };
  }
  throw new Error('period must be "mtd" or "ytd"');
}

function businessDaysInMonthCalendarDays(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * מחשב actual + target (מחושב יחסית לימי עסקים אם החודש חלקי) לרשימת קודי סוכן, לתקופה נתונה.
 * מחזיר map: agent_code -> { actual, target }
 */
async function computeAgentTotals(agentCodes, periodDef) {
  const pool = getPool();
  const { year, fullMonths, partialMonth, isPartial, asOfDate } = periodDef;
  const result = {};
  agentCodes.forEach((c) => (result[c] = { actual: 0, target: 0 }));
  if (agentCodes.length === 0) return result;

  // חודשים שלמים: מכירה בפועל + יעד מלא
  if (fullMonths.length > 0) {
    const { rows: salesRows } = await pool.query(
      `SELECT agent_code, COALESCE(SUM(sales_amount),0) AS s FROM agent_sales_monthly
       WHERE agent_code = ANY($1::int[]) AND year = $2 AND month = ANY($3::int[])
       GROUP BY agent_code`,
      [agentCodes, year, fullMonths]
    );
    salesRows.forEach((r) => { result[r.agent_code].actual += Number(r.s); });

    const { rows: targetRows } = await pool.query(
      `SELECT agent_code, COALESCE(SUM(target_amount),0) AS t FROM agent_targets
       WHERE agent_code = ANY($1::int[]) AND year = $2 AND month = ANY($3::int[])
       GROUP BY agent_code`,
      [agentCodes, year, fullMonths]
    );
    targetRows.forEach((r) => { result[r.agent_code].target += Number(r.t); });
  }

  // החודש הנבחר עצמו (חלקי אם זה החודש הנוכחי בפועל, אחרת מלא)
  if (partialMonth) {
    const { rows: salesRows } = await pool.query(
      `SELECT agent_code, COALESCE(sales_amount,0) AS s FROM agent_sales_monthly
       WHERE agent_code = ANY($1::int[]) AND year = $2 AND month = $3`,
      [agentCodes, year, partialMonth]
    );
    salesRows.forEach((r) => { result[r.agent_code].actual += Number(r.s); });

    const { rows: targetRows } = await pool.query(
      `SELECT agent_code, COALESCE(target_amount,0) AS t FROM agent_targets
       WHERE agent_code = ANY($1::int[]) AND year = $2 AND month = $3`,
      [agentCodes, year, partialMonth]
    );
    const bdInMonth = businessDaysInMonth(year, partialMonth);
    const bdElapsed = isPartial ? businessDaysElapsed(year, partialMonth, asOfDate) : bdInMonth;
    const proration = bdInMonth > 0 ? bdElapsed / bdInMonth : 0;

    targetRows.forEach((r) => {
      result[r.agent_code].target += Number(r.t) * proration;
    });
  }

  return result;
}

module.exports = {
  HEBREW_MONTHS,
  isBusinessDay,
  businessDaysInMonth,
  businessDaysElapsed,
  getPeriodDefinition,
  computeAgentTotals,
};
