// ==========================================================
// עדכון אוטומטי של מבנה בסיס הנתונים - רץ בכל הפעלה של האפליקציה (npm start), לפני next start.
// מריץ כל קובץ ב-db/migrations/*.sql שעוד לא רץ, לפי סדר שם הקובץ (001-..., 002-...),
// ורושם בטבלת schema_migrations מה כבר רץ - כך שכל קובץ רץ פעם אחת בלבד.
//
// הוספת שינוי סכימה חדש: יוצרים קובץ חדש עם המספר הבא (למשל 002-add-x.sql), עם פקודות בטוחות
// (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS), ומעדכנים גם את schema.sql. לא לשנות קובץ שכבר רץ.
// ==========================================================
const fs = require('fs');
const path = require('path');
const { getPool } = require('../lib/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_ID = 82811001; // מונע ריצה כפולה במקביל (למשל שני מופעים שעולים יחד)

async function migrate() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('[migrate] בסיס הנתונים מעודכן - אין עדכונים חדשים');
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] מריץ ${file}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file}: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  // לא עוצרים את עליית האפליקציה: כל העדכון בקובץ שנכשל בוטל (ROLLBACK), כך ש-DB נשאר כמו שהיה.
  // השגיאה מופיעה ב-Railway -> Deploy Logs, ואפשר לתקן ולהעלות שוב.
  console.error('[migrate] ✗ עדכון בסיס הנתונים נכשל:', err.message);
});
