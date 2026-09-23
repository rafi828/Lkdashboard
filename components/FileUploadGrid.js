import { useEffect, useState } from 'react';

export const FILES = [
  {
    key: 'classification', group: 'main', title: 'סיווג סוכנים לתחומים', hint: 'שיוך קוד סוכן לתחום', endpoint: '/api/upload/classification',
    method: 'position',
    format: (
      <>
        <b>עמודה A</b> - תחום (למשל "מכירות סיטונאים")<br />
        <b>עמודה B</b> - קוד סוכן (מספר)<br />
        <b>עמודה C</b> - שם סוכן<br />
        שינוי סדר העמודות יגרום לקריאה שגויה - הסדר חייב להישאר כפי שהוא.
      </>
    ),
  },
  {
    key: 'targets', group: 'main', title: 'קובץ יעדים', hint: 'יעדי סוכנים לפי חודש', endpoint: '/api/upload/targets',
    method: 'header',
    format: (
      <>
        חייב להכיל תא שכתוב בו בדיוק <b>"קוד סוכן"</b> - זו שורת הכותרת.<br />
        בשורה הזו חייבות להופיע גם <b>12 עמודות בשמות החודשים בעברית</b> (ינואר, פברואר... דצמבר) - בכל סדר.<br />
        עמודת שם הסוכן יכולה להיות בכל מקום.
      </>
    ),
  },
  {
    key: 'matrix', group: 'main', title: 'מטריצת מכירות חודשית', hint: 'מכירות לפי סוכן וחודש', endpoint: '/api/upload/sales-matrix',
    method: 'header',
    format: (
      <>
        חייב להכיל תא שכתוב בו בדיוק <b>"סוכן"</b> - זו שורת הכותרת.<br />
        עמודות החודשים חייבות להיות בתבנית <b>MM/YYYY</b> (למשל "09/2026") - בכל סדר, אין הגבלה על כמות החודשים.
      </>
    ),
  },
  {
    key: 'quarterly', group: 'quarterly', title: 'יעדים רבעוניים ללקוח', hint: 'יעד ובפועל רבעוני לפי לקוח', endpoint: '/api/upload/quarterly-targets',
    method: 'header',
    format: (
      <>
        גיליון בשם <b>"עיבוד התקדמות לקוחות יעדים"</b> (או שם שמכיל "עיבוד התקדמות").<br />
        חייב עמודה <b>"לקוח"</b> (מספר לקוח) ועמודות היעד/בפועל לכל רבעון בשמות המדויקים מהקובץ המקורי.
      </>
    ),
  },
];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL') + ', ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function FileUploadGrid({ fileKeys, columns = 3 }) {
  const [status, setStatus] = useState({});
  const [lastUploads, setLastUploads] = useState({});

  useEffect(() => {
    fetch('/api/upload/status')
      .then((res) => res.json())
      .then((d) => d.uploads && setLastUploads(d.uploads));
  }, []);

  async function handleUpload(fileConf, file) {
    setStatus((s) => ({ ...s, [fileConf.key]: { state: 'uploading' } }));
    const formData = new FormData();
    formData.append('file', file);
    if (fileConf.key === 'targets') {
      formData.append('year', String(new Date().getFullYear()));
    }
    try {
      const res = await fetch(fileConf.endpoint, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setStatus((s) => ({ ...s, [fileConf.key]: { state: 'error', message: data.error } }));
        return;
      }
      setStatus((s) => ({ ...s, [fileConf.key]: { state: 'done', fileName: file.name, rows: data.rows } }));
      setLastUploads((prev) => ({ ...prev, [fileConf.key]: { filename: file.name, uploadedAt: new Date().toISOString() } }));
    } catch (e) {
      setStatus((s) => ({ ...s, [fileConf.key]: { state: 'error', message: 'שגיאת רשת' } }));
    }
  }

  const files = FILES.filter((f) => fileKeys.includes(f.key));

  return (
    <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {files.map((f) => (
        <Dropzone key={f.key} f={f} status={status[f.key]} lastUpload={lastUploads[f.key]} onUpload={handleUpload} />
      ))}
    </div>
  );
}

function Dropzone({ f, status: st, lastUpload, onUpload }) {
  return (
    <label style={styles.dropzone}>
      <div style={styles.title}>{f.title}</div>
      <div style={styles.hint}>{f.hint} · גרירה או לחיצה להעלאה</div>

      {st?.state === 'uploading' && <div style={styles.uploading}>מעלה...</div>}
      {st?.state === 'error' && <div style={styles.error}>{st.message}</div>}
      {st?.state === 'done' && <div style={styles.done}>✓ {st.fileName} ({st.rows} שורות)</div>}

      {!st && lastUpload && (
        <div style={styles.lastUpload}>
          <span>הועלה לאחרונה:</span>
          <span style={styles.lastUploadFname}>{lastUpload.filename}</span>
          <span>{fmtDate(lastUpload.uploadedAt)}</span>
        </div>
      )}
      {!st && !lastUpload && <div style={styles.lastUploadEmpty}>עדיין לא הועלה קובץ</div>}

      <input
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onUpload(f, e.target.files[0])}
      />
      <div style={styles.formatNote}>
        <span style={f.method === 'header' ? styles.methodTagHeader : styles.methodTagPosition}>
          {f.method === 'header' ? 'לפי כותרת (גמיש)' : 'לפי מיקום עמודה'}
        </span>
        <br />
        {f.format}
      </div>
    </label>
  );
}

const styles = {
  grid: { display: 'grid', gap: 16 },
  dropzone: {
    background: '#fff', border: '2px dashed #d1d5db', borderRadius: 12, padding: '22px 16px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'center',
  },
  title: { fontSize: 14, fontWeight: 700, color: '#111827' },
  hint: { fontSize: 12, color: '#9ca3af' },
  done: { fontSize: 12, fontWeight: 600, color: '#16a34a' },
  error: { fontSize: 12, fontWeight: 600, color: '#dc2626' },
  uploading: { fontSize: 12, fontWeight: 600, color: '#d97706' },
  lastUpload: {
    width: '100%', marginTop: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
    padding: '9px 12px', fontSize: 12, color: '#15803d', display: 'flex', flexDirection: 'column', gap: 2,
  },
  lastUploadFname: { fontWeight: 700, color: '#111827', wordBreak: 'break-all' },
  lastUploadEmpty: {
    width: '100%', marginTop: 6, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '9px 12px', fontSize: 12, color: '#9ca3af',
  },
  formatNote: {
    width: '100%', marginTop: 10, background: '#f9fafb', border: '1px solid #f0f0f0', borderRadius: 8,
    padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#4b5563', lineHeight: 1.7,
  },
  methodTagHeader: { display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '1px 8px', borderRadius: 8, marginBottom: 6, background: '#dbeafe', color: '#1d4ed8' },
  methodTagPosition: { display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '1px 8px', borderRadius: 8, marginBottom: 6, background: '#fef3c7', color: '#92400e' },
};
