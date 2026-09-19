const { Pool } = require('pg');

// Pool אחד גלובלי - נשמר בין קריאות (חשוב ב-Next.js API routes)
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Railway Postgres דורש SSL בפרודקשן; בפיתוח מקומי אפשר בלי
      ssl: process.env.DATABASE_URL?.includes('railway')
        ? { rejectUnauthorized: false }
        : false,
    });
  }
  return pool;
}

module.exports = { getPool };
