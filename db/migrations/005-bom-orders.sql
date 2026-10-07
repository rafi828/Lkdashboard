-- ==========================================================
-- דוח "הזמנות רכש לפי עצי מוצר" (נושא: רכש)
-- רץ אוטומטית פעם אחת בעליית האפליקציה (db/migrate.js). בטוח גם להרצה חוזרת.
-- ==========================================================

-- 1. עצי מוצר: קשר אב -> בן + כמות ליחידה. נשמר קבוע.
--    טעינת קובץ מחליפה רק את ההרכב של פריטי האב שמופיעים בקובץ; פריטי אב אחרים נשמרים.
CREATE TABLE IF NOT EXISTS bom_edges (
  parent_code VARCHAR(50) NOT NULL,
  child_code  VARCHAR(50) NOT NULL,
  qty         NUMERIC(14,4) NOT NULL DEFAULT 1,
  PRIMARY KEY (parent_code, child_code)
);
CREATE INDEX IF NOT EXISTS bom_edges_child ON bom_edges (child_code);

-- שמות הפריטים מקובץ עצי המוצר (מתעדכן בכל טעינה של עצים, לא נמחק)
CREATE TABLE IF NOT EXISTS bom_items (
  code VARCHAR(50) PRIMARY KEY,
  name TEXT
);

-- 2. מכירות תקופתי (למשל 180 יום). כל טעינה מחליפה את כל הטבלה.
--    has_qty = false: יש שורה בדוח עם סכום בלבד, בלי כמות (זיכוי/תיקון).
CREATE TABLE IF NOT EXISTS bom_sales (
  code    VARCHAR(50) PRIMARY KEY,
  name    TEXT,
  qty     NUMERIC(14,2) NOT NULL DEFAULT 0,
  has_qty BOOLEAN NOT NULL DEFAULT TRUE,
  amount  NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- 3. יתרות פריטים - מטריצת מחסנים: סה"כ + מחסן ייצור. כל טעינה מחליפה את כל הטבלה.
CREATE TABLE IF NOT EXISTS bom_stock (
  code       VARCHAR(50) PRIMARY KEY,
  name       TEXT,
  total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  production NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- 4. הזמנות ספקים. כל טעינה מחליפה את כל הטבלה.
CREATE TABLE IF NOT EXISTS bom_supplier_orders (
  code          VARCHAR(50) PRIMARY KEY,
  name          TEXT,
  stock         NUMERIC(14,2) NOT NULL DEFAULT 0,
  by_customers  NUMERIC(14,2) NOT NULL DEFAULT 0,
  by_suppliers  NUMERIC(14,2) NOT NULL DEFAULT 0,
  future        NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- 5. פרטים נוספים על כל טעינה (למשל טווח התאריכים של קובץ המכירות)
CREATE TABLE IF NOT EXISTS bom_file_info (
  file_key VARCHAR(50) PRIMARY KEY,         -- 'bom-tree' | 'bom-sales' | 'bom-stock' | 'bom-orders'
  info     JSONB NOT NULL DEFAULT '{}'::jsonb
);
