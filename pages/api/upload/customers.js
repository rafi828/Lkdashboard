const { getPool } = require('../../../lib/db');
const { parseSingleFile } = require('../../../lib/api-helpers');
const { requirePermission } = require('../../../lib/access');
const { parseCustomersFile } = require('../../../lib/xlsx-parser');
const { recordFileUpload } = require('../../../lib/file-uploads');

export const config = { api: { bodyParser: false } };

// קובץ לקוחות ("מכירות ללקוח"): עדכון/הוספה לפי מספר לקוח. לא מוחק לקוחות שלא בקובץ.
// פרטי לקוח: רק העמודות שבקובץ מתעדכנות (תא ריק = הערך נמחק); עמודה שלא בקובץ - הערך הקודם נשמר.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requirePermission(req, res, 'custsales.upload');
  if (!user) return;

  try {
    const { buffer, filename } = await parseSingleFile(req);
    const { customers, detailColumns, hasAgent } = parseCustomersFile(buffer);
    if (customers.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות לקוח תקינות בקובץ' });
    }
    // לקוח שמופיע פעמיים בקובץ - השורה האחרונה קובעת
    const unique = [...new Map(customers.map((c) => [c.customer_id, c])).values()];

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO customers (customer_id, customer_name, agent_name, details, updated_at)
       SELECT x.customer_id, x.customer_name, x.agent_name, jsonb_strip_nulls(COALESCE(x.details, '{}'::jsonb)), NOW()
       FROM jsonb_to_recordset($1::jsonb) AS x(customer_id BIGINT, customer_name TEXT, agent_name VARCHAR(100), details JSONB)
       ON CONFLICT (customer_id) DO UPDATE SET
         customer_name = COALESCE(EXCLUDED.customer_name, customers.customer_name),
         agent_name = CASE WHEN $2::boolean THEN EXCLUDED.agent_name ELSE customers.agent_name END,
         details = jsonb_strip_nulls(customers.details || $3::jsonb || EXCLUDED.details),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        JSON.stringify(unique),
        hasAgent,
        // עמודות שבקובץ מקבלות null קודם (כך שתא ריק מוחק ערך ישן), ואז הערך מהקובץ
        JSON.stringify(Object.fromEntries(detailColumns.map((c) => [c, null]))),
      ]
    );
    const added = rows.filter((r) => r.inserted).length;

    await recordFileUpload('customers', filename, user.id);
    return res.status(200).json({
      ok: true,
      rows: unique.length,
      summary: `${unique.length} לקוחות (${added} חדשים, ${unique.length - added} עודכנו). ` +
        `פרטי לקוח שנקראו: ${detailColumns.join(', ') || 'אין'}.`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
