const { getPool } = require('../../../lib/db');
const { parseSingleFile } = require('../../../lib/api-helpers');
const { requirePermission } = require('../../../lib/access');
const { parseCustomerSalesFile } = require('../../../lib/xlsx-parser');
const { recordFileUpload } = require('../../../lib/file-uploads');

export const config = { api: { bodyParser: false } };

const ym = (m) => `${String(m.month).padStart(2, '0')}/${m.year}`;
const sortMonths = (list) => [...list].sort((a, b) => a.year - b.year || a.month - b.month);

// מכירות לפי חודשים ללקוח: מחליף רק את החודשים שבקובץ (כל החודש - כל הלקוחות), שאר החודשים והשנים נשמרים.
// חודש שהעמודה שלו ריקה לגמרי בקובץ - לא נוגעים בו.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requirePermission(req, res, 'custsales.upload');
  if (!user) return;

  try {
    const { buffer, filename } = await parseSingleFile(req);
    const { months, emptyMonths, records } = parseCustomerSalesFile(buffer);
    if (months.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו בקובץ חודשים עם נתונים' });
    }

    const pool = getPool();
    const client = await pool.connect();
    let addedCustomers = 0;
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM customer_sales_monthly s
         USING jsonb_to_recordset($1::jsonb) AS m(year INTEGER, month INTEGER)
         WHERE s.year = m.year AND s.month = m.month`,
        [JSON.stringify(months)]
      );
      await client.query(
        `INSERT INTO customer_sales_monthly (customer_id, agent_code, agent_name, year, month, amount)
         SELECT customer_id, agent_code, agent_name, year, month, amount
         FROM jsonb_to_recordset($1::jsonb)
           AS x(customer_id BIGINT, agent_code INTEGER, agent_name VARCHAR(100), year INTEGER, month INTEGER, amount NUMERIC)`,
        [JSON.stringify(records)]
      );
      // לקוח שיש לו מכירות ועוד לא קיים בכרטיסי הלקוחות - נוסף עם השם מקובץ המכירות
      const added = await client.query(
        `INSERT INTO customers (customer_id, customer_name)
         SELECT DISTINCT ON (customer_id) customer_id, customer_name
         FROM jsonb_to_recordset($1::jsonb) AS x(customer_id BIGINT, customer_name TEXT)
         ON CONFLICT (customer_id) DO NOTHING`,
        [JSON.stringify(records.map((r) => ({ customer_id: r.customer_id, customer_name: r.customer_name })))]
      );
      addedCustomers = added.rowCount;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const customerCount = new Set(records.map((r) => r.customer_id)).size;
    const sorted = sortMonths(months);
    const parts = [
      `עודכנו ${months.length} חודשים: ${ym(sorted[0])} – ${ym(sorted[sorted.length - 1])}.`,
      `${customerCount} לקוחות עם מכירות.`,
      'חודשים ושנים אחרים לא השתנו.',
    ];
    if (emptyMonths.length) parts.push(`חודשים ריקים בקובץ שדולגו: ${sortMonths(emptyMonths).map(ym).join(', ')}.`);
    if (addedCustomers) parts.push(`${addedCustomers} לקוחות לא היו בקובץ הלקוחות ונוספו לפי השם שבקובץ המכירות.`);

    await recordFileUpload('customer-sales', filename, user.id);
    return res.status(200).json({ ok: true, rows: customerCount, summary: parts.join(' ') });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
