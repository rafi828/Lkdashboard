-- ==========================================================
-- דוח "מכירות ללקוח": כרטיס לקוח + מכירות חודשיות ללקוח
-- רץ אוטומטית פעם אחת בעליית האפליקציה (db/migrate.js). בטוח גם להרצה חוזרת.
-- ==========================================================

-- 1. לקוחות (מקובץ הלקוחות של פריוריטי). טעינה = עדכון/הוספה, לא מוחקת לקוחות שלא בקובץ.
--    details = כל שאר העמודות שבקובץ (קבוצה, טלפון, נייד, פקס, כתובת, מייל, ח.פ ...) לפי שם הכותרת.
--    עמודה שלא הופיעה בקובץ שנטען - הערך הקודם שלה נשמר.
CREATE TABLE IF NOT EXISTS customers (
  customer_id   BIGINT PRIMARY KEY,
  customer_name TEXT,
  agent_name    VARCHAR(100),             -- הסוכן בכרטיס הלקוח (שם בלבד - הקוד מגיע מקובץ המכירות)
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. מכירות חודשיות ללקוח. טעינת קובץ מחליפה רק את החודשים שמופיעים בו (שאר החודשים/השנים נשמרים).
--    agent_code = הסוכן בשורת המכירה (היסטורי - לקוח שעבר סוכן נשאר אצל הסוכן הקודם בחודשים הקודמים).
CREATE TABLE IF NOT EXISTS customer_sales_monthly (
  customer_id BIGINT NOT NULL,
  agent_code  INTEGER NOT NULL DEFAULT 0, -- 0 = ללא סוכן
  agent_name  VARCHAR(100),
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, agent_code, year, month)
);
CREATE INDEX IF NOT EXISTS customer_sales_monthly_ym ON customer_sales_monthly (year, month);
