const { getPool } = require('./db');

async function recordFileUpload(fileKey, filename, userId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO file_uploads (file_key, filename, uploaded_at, uploaded_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (file_key) DO UPDATE SET
       filename = EXCLUDED.filename, uploaded_at = NOW(), uploaded_by = EXCLUDED.uploaded_by`,
    [fileKey, filename, userId || null]
  );
}

module.exports = { recordFileUpload };
