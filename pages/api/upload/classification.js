const { getPool } = require('../../../lib/db');
const { parseSingleFile, requireRole } = require('../../../lib/api-helpers');
const { parseClassificationFile } = require('../../../lib/xlsx-parser');
const { recordFileUpload } = require('../../../lib/file-uploads');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireRole(req, res, ['admin']);
  if (!user) return; // requireRole already sent the response

  try {
    const { buffer, filename } = await parseSingleFile(req);
    const records = parseClassificationFile(buffer);
    if (records.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות תקינות בקובץ הסיווג' });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE agent_classification');
      for (const r of records) {
        await client.query(
          `INSERT INTO agent_classification (agent_code, agent_name, domain) VALUES ($1,$2,$3)
           ON CONFLICT (agent_code) DO UPDATE SET agent_name = EXCLUDED.agent_name, domain = EXCLUDED.domain`,
          [r.agent_code, r.agent_name, r.domain]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await recordFileUpload('classification', filename, user.id);
    return res.status(200).json({ ok: true, rows: records.length });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}
