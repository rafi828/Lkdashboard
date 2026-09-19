const { Pool } = require('pg');

// Pool אחד גלובלי - נשמר בין קריאות (חשוב ב-Next.js API routes)
let pool;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL || '';
    // חיבור פנימי בין Services באותו פרויקט Railway (host מסתיים ב-railway.internal) לא דורש/לא תומך ב-SSL.
    // רק חיבור חיצוני (למשל דרך ה-proxy הציבורי, או ספק DB אחר) צריך SSL.
    const isInternal = url.includes('.railway.internal');
    pool = new Pool({
      connectionString: url,
      ssl: isInternal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

module.exports = { getPool };
