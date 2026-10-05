-- ==========================================================
-- "השוואת מק"טים": רשימת מק"טי המתחרה + יבוא "מרובי ברקודים"
-- רץ אוטומטית פעם אחת בעליית האפליקציה (db/migrate.js). בטוח גם להרצה חוזרת.
-- ==========================================================

-- 1. כל מק"טי המתחרה מקובץ התוצאות (גיליונות "התאמות" + "סיגנט ללא התאמה") - מוחלף בכל טעינת קובץ התוצאות.
--    משמש להתאמת ברקודים ולתצוגת "סיגנט ללא התאמה".
CREATE TABLE IF NOT EXISTS sku_compare_comp_items (
  comp_sku     VARCHAR(50) PRIMARY KEY,
  comp_desc    TEXT,
  comp_brand   VARCHAR(100),
  category     VARCHAR(255),
  catalog_page INTEGER,
  comp_price   NUMERIC(14,2)
);

-- 2. שיוכים מקובץ "מרובי ברקודים" (ייצוא פריוריטי) - מוחלף במלואו בכל טעינה של הקובץ הזה.
--    לא נמחק בטעינת קובץ התוצאות. החלטה ידנית (sku_compare_decisions) גוברת עליו.
CREATE TABLE IF NOT EXISTS sku_compare_imports (
  lk_sku      VARCHAR(50) PRIMARY KEY,
  kind        VARCHAR(10) NOT NULL,     -- 'sure' (מק"ט אחד / מאשר את המנוע) | 'multi' (כמה אפשרויות - לבדיקה)
  comp_sku    VARCHAR(50) NOT NULL,     -- המק"ט שנבחר (ב-multi: הראשון ברשימה)
  options     TEXT,                     -- כל המק"טים שהברקודים הצביעו עליהם, מופרדים בפסיק
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
