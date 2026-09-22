const { getPool } = require('../../../lib/db');
const { parseSingleFile, requireRole } = require('../../../lib/api-helpers');
const { parseQuarterlyTargetsFile } = require('../../../lib/xlsx-parser');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireRole(req, res, ['admin']);
  if (!user) return;

  try {
    const { buffer, fields } = await parseSingleFile(req);
    const yearField = Array.isArray(fields.year) ? fields.year[0] : fields.year;
    const year = yearField ? parseInt(yearField, 10) : new Date().getFullYear();

    const records = parseQuarterlyTargetsFile(buffer, year);
    if (records.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות לקוחות תקינות בקובץ (בדוק את עמודת "לקוח")' });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        await client.query(
          `INSERT INTO customer_quarterly_targets
            (customer_id, customer_name, agent_name, agent_phone, target_type, target_type_simple, year,
             q1_target, q1_actual, q2_target, q2_actual, q3_target, q3_actual, q4_target, q4_actual,
             annual_target, last_year_sales, m1, m2, m3, m4, m5, m6)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
           ON CONFLICT (customer_id, year) DO UPDATE SET
             customer_name = EXCLUDED.customer_name, agent_name = EXCLUDED.agent_name,
             agent_phone = EXCLUDED.agent_phone, target_type = EXCLUDED.target_type,
             target_type_simple = EXCLUDED.target_type_simple,
             q1_target = EXCLUDED.q1_target, q1_actual = EXCLUDED.q1_actual,
             q2_target = EXCLUDED.q2_target, q2_actual = EXCLUDED.q2_actual,
             q3_target = EXCLUDED.q3_target, q3_actual = EXCLUDED.q3_actual,
             q4_target = EXCLUDED.q4_target, q4_actual = EXCLUDED.q4_actual,
             annual_target = EXCLUDED.annual_target, last_year_sales = EXCLUDED.last_year_sales,
             m1 = EXCLUDED.m1, m2 = EXCLUDED.m2, m3 = EXCLUDED.m3, m4 = EXCLUDED.m4, m5 = EXCLUDED.m5, m6 = EXCLUDED.m6`,
          [
            r.customer_id, r.customer_name, r.agent_name, r.agent_phone, r.target_type, r.target_type_simple, r.year,
            r.q1_target, r.q1_actual, r.q2_target, r.q2_actual, r.q3_target, r.q3_actual, r.q4_target, r.q4_actual,
            r.annual_target, r.last_year_sales, r.m1, r.m2, r.m3, r.m4, r.m5, r.m6,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return res.status(200).json({ ok: true, rows: records.length, year });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
