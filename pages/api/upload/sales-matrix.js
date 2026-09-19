const { getPool } = require('../../../lib/db');
const { parseSingleFile, requireRole } = require('../../../lib/api-helpers');
const { parseSalesMatrixFile } = require('../../../lib/xlsx-parser');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireRole(req, res, ['admin']);
  if (!user) return;

  try {
    const { buffer } = await parseSingleFile(req);
    const records = parseSalesMatrixFile(buffer);
    if (records.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות תקינות בקובץ המכירות' });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        await client.query(
          `INSERT INTO agent_sales_monthly (agent_code, agent_name, year, month, sales_amount)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (agent_code, year, month)
           DO UPDATE SET sales_amount = EXCLUDED.sales_amount, agent_name = EXCLUDED.agent_name`,
          [r.agent_code, r.agent_name, r.year, r.month, r.sales_amount]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return res.status(200).json({ ok: true, rows: records.length });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
