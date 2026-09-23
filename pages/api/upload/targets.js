const { getPool } = require('../../../lib/db');
const { parseSingleFile, requireRole } = require('../../../lib/api-helpers');
const { parseTargetsFile } = require('../../../lib/xlsx-parser');
const { recordFileUpload } = require('../../../lib/file-uploads');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireRole(req, res, ['admin']);
  if (!user) return;

  try {
    const { buffer, fields, filename } = await parseSingleFile(req);
    // שדה "year" בטופס ההעלאה - לאיזו שנה שייכים היעדים בקובץ (ברירת מחדל: השנה הנוכחית)
    const yearField = Array.isArray(fields.year) ? fields.year[0] : fields.year;
    const year = yearField ? parseInt(yearField, 10) : new Date().getFullYear();

    const records = parseTargetsFile(buffer, year);
    if (records.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות תקינות בקובץ היעדים' });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        await client.query(
          `INSERT INTO agent_targets (agent_code, agent_name, year, month, target_amount)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (agent_code, year, month)
           DO UPDATE SET target_amount = EXCLUDED.target_amount, agent_name = EXCLUDED.agent_name`,
          [r.agent_code, r.agent_name, r.year, r.month, r.target_amount]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await recordFileUpload('targets', filename, user.id);
    return res.status(200).json({ ok: true, rows: records.length, year });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
