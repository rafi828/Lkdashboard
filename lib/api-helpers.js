const formidable = require('formidable');
const fs = require('fs');
const { getUserFromRequest } = require('./auth');

function parseSingleFile(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm({ multiples: false });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const fileField = files.file;
      const file = Array.isArray(fileField) ? fileField[0] : fileField;
      if (!file) return reject(new Error('לא צורף קובץ (שדה "file")'));
      const filepath = file.filepath || file.path;
      const buffer = fs.readFileSync(filepath);
      const filename = file.originalFilename || file.name || 'קובץ.xlsx';
      resolve({ buffer, fields, filename });
    });
  });
}

// מאמת שהמשתמש מחובר ושתפקידו אחד מהתפקידים המורשים; מחזיר את המשתמש או null (ואז שולח 401/403)
function requireRole(req, res, allowedRoles) {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'לא מחובר' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
    return null;
  }
  return user;
}

module.exports = { parseSingleFile, requireRole };
