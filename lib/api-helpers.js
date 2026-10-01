const formidable = require('formidable');
const fs = require('fs');

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

// בדיקות הרשאה: ראה lib/access.js (requireUser / requirePermission / requireAdmin)
module.exports = { parseSingleFile };
