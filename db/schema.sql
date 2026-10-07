-- ==========================================================
-- סכמת בסיס הנתונים - מערכת דשבורדים עם הרשאות היררכיות
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'user', -- 'admin' | 'manager' | 'user'
  manager_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  agent_code    INTEGER,       -- ישן, לא בשימוש: הוחלף בטבלת user_agent_codes (כמה קודים למשתמש)
  totp_secret   VARCHAR(64),           -- סוד ה-TOTP (Google Authenticator); NULL = עדיין לא נוצר
  totp_enabled  BOOLEAN NOT NULL DEFAULT false, -- true רק אחרי שהמשתמש אימת קוד בפעם הראשונה
  created_at    TIMESTAMP DEFAULT NOW()
);

-- טבלת דוגמה לנתוני מכירות ששייכים למשתמש מסוים (מהשלד המקורי - עדיין בשימוש להדגמה)
CREATE TABLE IF NOT EXISTS sales (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer    VARCHAR(255) NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  sale_date   DATE NOT NULL DEFAULT CURRENT_DATE
);

-- אינדקס שמאיץ את השאילתה הרקורסיבית להיררכיה
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_sales_owner_id ON sales(owner_id);

-- ==========================================================
-- דשבורד יעדים - טבלאות שמוזנות מ-3 קבצי האקסל
-- ==========================================================

-- מ"סיווג_סוכנים_לתחומים.xlsx" - לאיזה תחום כל קוד סוכן משתייך
CREATE TABLE IF NOT EXISTS agent_classification (
  agent_code  INTEGER PRIMARY KEY,
  agent_name  VARCHAR(255),
  domain      VARCHAR(100) NOT NULL   -- 'מכירות סיטונאים' | 'סניפי ל.כ' | 'מוסדיים' | 'משווקים' | 'משרד הביטחון'
);

-- מ"יעדי_סוכנים_לפי_חודש.xlsx" - יעד חודשי לכל סוכן
CREATE TABLE IF NOT EXISTS agent_targets (
  id            SERIAL PRIMARY KEY,
  agent_code    INTEGER NOT NULL,
  agent_name    VARCHAR(255),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(agent_code, year, month)
);

-- מ"מטריצת_מכירות_חודשי_לסוכן.xlsx" - מכירה בפועל, חודש בחודשו
CREATE TABLE IF NOT EXISTS agent_sales_monthly (
  id            SERIAL PRIMARY KEY,
  agent_code    INTEGER NOT NULL,
  agent_name    VARCHAR(255),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  sales_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(agent_code, year, month)
);

CREATE INDEX IF NOT EXISTS idx_targets_period ON agent_targets(year, month);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_period ON agent_sales_monthly(year, month);

-- ==========================================================
-- נושאים (לתפריט העליון) + הרשאות משתמש-נושא
-- Admin רואה הכל תמיד ולא צריך שורה ב-user_topic_access.
-- Manager/User רואים רק נושאים שסומנו להם כאן.
-- ==========================================================
CREATE TABLE IF NOT EXISTS topics (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(50) UNIQUE NOT NULL,   -- 'sales' | 'procurement' | 'warehouse' | ...
  name        VARCHAR(100) NOT NULL,          -- 'מכירות' | 'רכש' | 'פעילות מחסן' | ...
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_topic_access (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, topic_id)
);

INSERT INTO topics (key, name, sort_order) VALUES
  ('sales', 'מכירות', 1),
  ('procurement', 'רכש', 2),
  ('warehouse', 'פעילות מחסן', 3),
  ('sku-compare', 'השוואת מק"טים', 4)
ON CONFLICT (key) DO NOTHING;

-- ==========================================================
-- דוח "יעדים רבעוניים ללקוח" - נתוני יעד/בפועל רבעוניים ברמת לקוח בודד.
-- הקישור לסוכן: agent_code (מעמודה "קוד סוכן מלקוח - 2" בקובץ) - אותו קוד כמו ב-user_agent_codes.
-- ==========================================================
-- ==========================================================
-- מעקב אחרי הקובץ האחרון שהועלה לכל סוג טעינה (לתצוגת "הועלה לאחרונה" במסכי הטעינה)
-- ==========================================================
CREATE TABLE IF NOT EXISTS file_uploads (
  file_key    VARCHAR(50) PRIMARY KEY,   -- 'classification' | 'targets' | 'matrix' | 'quarterly' | 'sku-compare' | 'sku-barcodes' | 'customers' | 'customer-sales' | 'bom-tree' | 'bom-sales' | 'bom-stock' | 'bom-orders'
  filename    VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_quarterly_targets (
  id                SERIAL PRIMARY KEY,
  customer_id       BIGINT NOT NULL,
  customer_name     VARCHAR(255),
  agent_code        INTEGER,               -- מעמודה "קוד סוכן מלקוח - 2" בקובץ; קובע אילו לקוחות סוכן רואה
  agent_name        VARCHAR(255),
  agent_email       VARCHAR(255),
  agent_phone       VARCHAR(50),
  chanoch_email     VARCHAR(255),
  rafi_email        VARCHAR(255),
  david_email       VARCHAR(255),
  amir_email        VARCHAR(255),
  target_type       VARCHAR(255),          -- הטקסט המקורי מהקובץ (חופשי)
  target_type_simple VARCHAR(20),          -- 'רבעוני' | 'שנתי' | 'אחר / הערה' (מחושב)
  year              INTEGER NOT NULL,
  q1_target NUMERIC(14,2) DEFAULT 0, q1_actual NUMERIC(14,2) DEFAULT 0, q1_credit NUMERIC(14,2) DEFAULT 0,
  q2_target NUMERIC(14,2) DEFAULT 0, q2_actual NUMERIC(14,2) DEFAULT 0, q2_credit NUMERIC(14,2) DEFAULT 0,
  q3_target NUMERIC(14,2) DEFAULT 0, q3_actual NUMERIC(14,2) DEFAULT 0, q3_credit NUMERIC(14,2) DEFAULT 0,
  q4_target NUMERIC(14,2) DEFAULT 0, q4_actual NUMERIC(14,2) DEFAULT 0, q4_credit NUMERIC(14,2) DEFAULT 0,
  annual_target     NUMERIC(14,2) DEFAULT 0,
  last_year_sales   NUMERIC(14,2) DEFAULT 0,
  m1 NUMERIC(14,2) DEFAULT 0, m2 NUMERIC(14,2) DEFAULT 0, m3 NUMERIC(14,2) DEFAULT 0,
  m4 NUMERIC(14,2) DEFAULT 0, m5 NUMERIC(14,2) DEFAULT 0, m6 NUMERIC(14,2) DEFAULT 0,
  UNIQUE(customer_id, year)
);

CREATE INDEX IF NOT EXISTS idx_cqt_agent_code ON customer_quarterly_targets(agent_code);

-- ==========================================================
-- הרשאות: תבנית הרשאה + חריגים אישיים (רשימת הדוחות ומפתחות ההרשאה: lib/reports.js)
-- Admin מקבל הכל אוטומטית. טבלאות topics/user_topic_access הישנות כבר לא קובעות גישה.
-- ⚠️ ב-DB קיים: להריץ את db/migrations/001-permissions.sql - רץ אוטומטית בעליית האפליקציה (db/migrate.js).
-- ==========================================================
CREATE TABLE IF NOT EXISTS permission_templates (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) UNIQUE NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permission_template_items (
  template_id    INTEGER NOT NULL REFERENCES permission_templates(id) ON DELETE CASCADE,
  permission_key VARCHAR(100) NOT NULL,          -- למשל 'targets.view' | 'quarterly.upload' | 'quarterly.email'
  PRIMARY KEY (template_id, permission_key)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_template_id INTEGER REFERENCES permission_templates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key VARCHAR(100) NOT NULL,
  granted        BOOLEAN NOT NULL,               -- true = להוסיף מעבר לתבנית, false = להסיר מהתבנית
  PRIMARY KEY (user_id, permission_key)
);

-- סוכן יכול להיות עם כמה קודי סוכן (לסיווגים שונים). מחליף את users.agent_code (שנשאר בטבלה, לא בשימוש).
CREATE TABLE IF NOT EXISTS user_agent_codes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_code INTEGER NOT NULL,
  PRIMARY KEY (user_id, agent_code)
);

-- ==========================================================
-- שאילתת עזר (לא חובה כ-VIEW, אפשר גם ישירות בקוד):
-- מחזירה את כל ה-IDs שמשתמש נתון (viewerId) מורשה לראות,
-- כולל את עצמו וכל מי שנמצא תחתיו בהיררכיה בכל עומק.
-- ==========================================================
-- WITH RECURSIVE subordinates AS (
--   SELECT id FROM users WHERE id = $1          -- המשתמש עצמו
--   UNION ALL
--   SELECT u.id FROM users u
--   INNER JOIN subordinates s ON u.manager_id = s.id
-- )
-- SELECT id FROM subordinates;

-- ==========================================================
-- דוח "השוואת מק"טים" (ב-DB קיים: db/migrations/002-sku-compare.sql, רץ אוטומטית)
-- ==========================================================
-- תוצאות המנוע - מוחלפות במלואן בכל טעינת קובץ (שורה לכל פריט ל.כ)
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

-- החלטות ידניות - לא נמחקות בטעינת קובץ חדש, וגוברות על תוצאת המנוע
CREATE TABLE IF NOT EXISTS sku_compare_decisions (
  lk_sku        VARCHAR(50) PRIMARY KEY,
  decision      VARCHAR(20) NOT NULL,   -- 'approved' | 'rejected' | 'corrected'
  corrected_sku VARCHAR(50),            -- רק כש-decision = 'corrected'
  note          TEXT,
  decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- (ב-DB קיים: db/migrations/003-sku-compare-imports.sql, רץ אוטומטית)
-- כל מק"טי המתחרה מקובץ התוצאות (גיליונות "התאמות" + "סיגנט ללא התאמה") - מוחלף בכל טעינת קובץ התוצאות.
--    משמש להתאמת ברקודים ולתצוגת "סיגנט ללא התאמה".
CREATE TABLE IF NOT EXISTS sku_compare_comp_items (
  comp_sku     VARCHAR(50) PRIMARY KEY,
  comp_desc    TEXT,
  comp_brand   VARCHAR(100),
  category     VARCHAR(255),
  catalog_page INTEGER,
  comp_price   NUMERIC(14,2)
);

-- שיוכים מקובץ "מרובי ברקודים" (ייצוא פריוריטי) - מוחלף במלואו בכל טעינה של הקובץ הזה.
--    לא נמחק בטעינת קובץ התוצאות. החלטה ידנית (sku_compare_decisions) גוברת עליו.
CREATE TABLE IF NOT EXISTS sku_compare_imports (
  lk_sku      VARCHAR(50) PRIMARY KEY,
  kind        VARCHAR(10) NOT NULL,     -- 'sure' (מק"ט אחד / מאשר את המנוע) | 'multi' (כמה אפשרויות - לבדיקה)
  comp_sku    VARCHAR(50) NOT NULL,     -- המק"ט שנבחר (ב-multi: הראשון ברשימה)
  options     TEXT,                     -- כל המק"טים שהברקודים הצביעו עליהם, מופרדים בפסיק
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================================
-- דוח "מכירות ללקוח" (ב-DB קיים: db/migrations/004-customer-sales.sql, רץ אוטומטית)
-- ==========================================================
-- לקוחות (מקובץ הלקוחות של פריוריטי). טעינה = עדכון/הוספה, לא מוחקת לקוחות שלא בקובץ.
-- details = כל שאר העמודות שבקובץ (קבוצה, טלפון, נייד, פקס, כתובת, מייל, ח.פ ...) לפי שם הכותרת.
-- עמודה שלא הופיעה בקובץ שנטען - הערך הקודם שלה נשמר.
CREATE TABLE IF NOT EXISTS customers (
  customer_id   BIGINT PRIMARY KEY,
  customer_name TEXT,
  agent_name    VARCHAR(100),             -- הסוכן בכרטיס הלקוח (שם בלבד - הקוד מגיע מקובץ המכירות)
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- מכירות חודשיות ללקוח. טעינת קובץ מחליפה רק את החודשים שמופיעים בו (שאר החודשים/השנים נשמרים).
-- agent_code = הסוכן בשורת המכירה (היסטורי - לקוח שעבר סוכן נשאר אצל הסוכן הקודם בחודשים הקודמים).
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

-- ==========================================================
-- דוח "הזמנות רכש לפי עצי מוצר" (ב-DB קיים: db/migrations/005-bom-orders.sql, רץ אוטומטית)
-- ==========================================================
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
