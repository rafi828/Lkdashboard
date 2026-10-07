// ==========================================================
// רשימת הדוחות המרכזית של המערכת - המקום היחיד שמגדירים בו דוח והרשאותיו.
// דוח חדש? מוסיפים אותו כאן בלבד: הוא יופיע אוטומטית בתפריט, במסך התבניות/חריגים,
// ובבדיקת ההרשאה בשרת (לפי מפתח ההרשאה, למשל 'targets.view').
// הקובץ הזה הוא נתונים בלבד (בלי גישה ל-DB), כדי שאפשר יהיה לייבא אותו גם בדפדפן.
// ==========================================================

const TOPICS = [
  { key: 'sales', name: 'מכירות' },
  { key: 'procurement', name: 'רכש' },
  { key: 'warehouse', name: 'פעילות מחסן' },
  { key: 'sku-compare', name: 'השוואת מק"טים' },
];

const REPORTS = [
  {
    key: 'targets',
    topic: 'sales',
    name: 'תקציב מול ביצוע',
    desc: 'יעדים מול בפועל, לפי תחום ולפי סוכן',
    href: '/dashboard/targets',
    permissions: [
      { key: 'targets.view', label: 'צפייה בדוח' },
      { key: 'targets.upload', label: 'טעינת קבצים' },
    ],
  },
  {
    key: 'quarterly',
    topic: 'sales',
    name: 'יעדים רבעוניים ללקוח',
    desc: 'מעקב יעדי רבעון לפי לקוח',
    href: '/dashboard/quarterly-targets',
    permissions: [
      { key: 'quarterly.view', label: 'צפייה בדוח' },
      { key: 'quarterly.upload', label: 'טעינת קבצים' },
      { key: 'quarterly.email', label: 'ייצוא ושליחת מייל' },
    ],
  },
  {
    key: 'custsales',
    topic: 'sales',
    name: 'מכירות ללקוח',
    desc: 'מכירות לפי לקוח, סוכן וחודש - מול שנה קודמת',
    href: '/dashboard/customer-sales',
    permissions: [
      { key: 'custsales.view', label: 'צפייה בדוח וייצוא' },
      { key: 'custsales.upload', label: 'טעינת קבצים' },
    ],
  },
  {
    key: 'skucompare',
    topic: 'sku-compare',
    name: 'השוואת מק"טים',
    desc: 'התאמת קטלוג ל.כ מול קטלוג מתחרים',
    href: '/dashboard/sku-compare',
    permissions: [
      { key: 'skucompare.view', label: 'צפייה בדוח וייצוא' },
      { key: 'skucompare.upload', label: 'טעינת קבצים' },
      { key: 'skucompare.decide', label: 'אישור / דחייה / תיקון' },
    ],
  },
  {
    key: 'bomorders',
    topic: 'procurement',
    name: 'הזמנות רכש לפי עצי מוצר',
    desc: 'מלאי, מכירות והזמנות ספקים - לפריטי בנים של עצי מוצר',
    href: '/dashboard/bom-orders',
    permissions: [
      { key: 'bomorders.view', label: 'צפייה בדוח וייצוא' },
      { key: 'bomorders.upload', label: 'טעינת קבצים' },
    ],
  },
  // דוחות עתידיים - מוצגים בתפריט כ"בקרוב" (בלי href ובלי הרשאות עד שייבנו)
  { key: 'warehouse', topic: 'warehouse', name: 'דוחות מחסן', desc: 'ייבנה בהמשך', href: null, permissions: [] },
];

const ALL_PERMISSION_KEYS = REPORTS.flatMap((r) => r.permissions.map((p) => p.key));

// מפתח הרשאת הצפייה של דוח (הראשונה ברשימה, לפי המוסכמה '<report>.view')
function viewPermissionOf(report) {
  return report.permissions.find((p) => p.key.endsWith('.view'))?.key || null;
}

// הדוח הראשון (לפי סדר הרשימה) שהמשתמש מורשה לצפות בו - לשם נכנסים אחרי התחברות. null = אין לו אף דוח.
// me = המשתמש כפי שמוחזר מ-/api/me ({ role, permissions: [...] })
function firstAllowedReport(me) {
  return REPORTS.find((r) => r.href && (me.role === 'admin' || me.permissions.includes(viewPermissionOf(r)))) || null;
}

const ROLE_LABELS = { admin: 'אדמין', manager: 'מנהל מכירות', user: 'סוכן' };

module.exports = { TOPICS, REPORTS, ALL_PERMISSION_KEYS, viewPermissionOf, firstAllowedReport, ROLE_LABELS };
