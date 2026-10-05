-- ==========================================================
-- דוח "השוואת מק"טים" (קטלוג ל.כ מול קטלוג מתחרים, מכלי tools/signet-matching)
-- רץ אוטומטית פעם אחת בעליית האפליקציה (db/migrate.js). בטוח גם להרצה חוזרת.
-- ==========================================================

-- 1. נושא חדש בתפריט
INSERT INTO topics (key, name, sort_order) VALUES ('sku-compare', 'השוואת מק"טים', 4)
ON CONFLICT (key) DO NOTHING;

-- 2. תוצאות המנוע - מוחלפות במלואן בכל טעינת קובץ (שורה לכל פריט ל.כ)
CREATE TABLE IF NOT EXISTS sku_compare_items (
  lk_sku       VARCHAR(50) PRIMARY KEY,
  lk_desc      TEXT,
  lk_dept      VARCHAR(255),
  comp_sku     VARCHAR(50),             -- מק"ט מתחרה שהמנוע הציע (ריק = ללא התאמה)
  comp_desc    TEXT,
  comp_brand   VARCHAR(100),
  confidence   VARCHAR(20) NOT NULL,    -- 'ודאי' | 'סביר' | 'לבדיקה' | 'ללא התאמה'
  notes        TEXT,
  catalog_page INTEGER,
  comp_price   NUMERIC(14,2)
);

-- 3. החלטות ידניות - לא נמחקות בטעינת קובץ חדש, וגוברות על תוצאת המנוע
CREATE TABLE IF NOT EXISTS sku_compare_decisions (
  lk_sku        VARCHAR(50) PRIMARY KEY,
  decision      VARCHAR(20) NOT NULL,   -- 'approved' | 'rejected' | 'corrected'
  corrected_sku VARCHAR(50),            -- רק כש-decision = 'corrected'
  note          TEXT,
  decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
