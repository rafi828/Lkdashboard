const LOGO_URL_ENV = 'PUBLIC_APP_URL'; // אם מוגדר, נבנה כתובת לוגו מלאה; אחרת ננסה נתיב יחסי (רוב לקוחות דוא"ל דורשים כתובת מלאה)

function fmt(n) {
  return '₪' + Math.round(n || 0).toLocaleString('he-IL');
}

function logoUrl() {
  const base = process.env[LOGO_URL_ENV] || '';
  return base ? `${base.replace(/\/$/, '')}/logos/lc-logo.png` : '/logos/lc-logo.png';
}

// row: שורת לקוח מלאה (מ-customer_quarterly_targets), quarter: 1|2|3|4
function buildQuarterEmailHtml(row, quarter) {
  const target = row[`q${quarter}_target`] || 0;
  const actual = row[`q${quarter}_actual`] || 0;
  const credit = row[`q${quarter}_credit`] || 0;
  const achieved = credit > 0;
  const shortfall = Math.max(0, target - actual);
  const logo = logoUrl();

  // זיכויים שניתנו עד כה השנה (מרבעון 1 עד הרבעון הנבחר, כולל)
  const priorCredits = [];
  for (let q = 1; q <= quarter; q++) {
    const c = row[`q${q}_credit`] || 0;
    priorCredits.push({ q, credit: c });
  }
  const priorCreditsRows = priorCredits
    .map((p) => `<tr><td style="padding:4px 8px;">רבעון ${p.q}</td><td style="padding:4px 8px;font-weight:700;">${fmt(p.credit)}</td></tr>`)
    .join('');

  const statusBlock = achieved
    ? `
      <p style="text-decoration:underline;font-size:15px;">שמחים לבשר שחשבונך יזוכה בגין הגעה ליעד רבעון ${quarter}.</p>
      <p style="font-weight:700;text-decoration:underline;font-size:16px;">סכום זיכוי בגין יעד רבעון ${quarter}: ${fmt(credit)}</p>
    `
    : `
      <p style="font-size:15px;">נותרו <b>${fmt(shortfall)}</b> להשלמת היעד ברבעון ${quarter}. בהצלחה בהמשך הדרך!</p>
    `;

  return `
  <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="text-align:center;padding:12px 0;">
      <img src="${logo}" alt="ל.כ כלי עבודה וציוד" style="max-height:60px;" />
    </div>

    <h2 style="text-decoration:underline;margin-bottom:4px;">${row.customer_name || ''}</h2>
    <p style="margin:2px 0;">סוכן: <b>${row.agent_name || ''}</b>${row.agent_phone ? ` · נייד: ${row.agent_phone}` : ''}</p>

    <h3 style="text-decoration:underline;margin-bottom:6px;">הדרך ליעד רבעון ${quarter}:</h3>
    <p style="font-weight:700;margin:2px 0;">יעד רבעון ${quarter}: ${fmt(target)}</p>
    <p style="font-weight:700;margin:2px 0;">קניות רבעון ${quarter}: ${fmt(actual)}</p>

    ${statusBlock}

    <h4 style="margin:20px 0 6px;">זיכויים שניתנו עד כה השנה:</h4>
    <table style="border-collapse:collapse;font-size:13px;">
      ${priorCreditsRows}
    </table>

    <div style="text-align:center;padding:20px 0 8px;">
      <img src="${logo}" alt="ל.כ כלי עבודה וציוד" style="max-height:50px;" />
    </div>
  </div>`;
}

module.exports = { buildQuarterEmailHtml };
