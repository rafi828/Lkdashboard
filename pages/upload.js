import { useState } from 'react';
import Layout from '../components/Layout';

const FILES = [
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

export default function UploadPage() {
  const [status, setStatus] = useState({});

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
    } catch (e) {
      setStatus((s) => ({ ...s, [fileConf.key]: { state: 'error', message: 'שגיאת רשת' } }));
    }
  }

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>טעינת קבצים</h1>
          <p style={styles.subtext}>כאן מעלים את שלושת הקבצים שמזינים את דשבורד היעדים</p>
        </div>
      </div>

      <div>
        <div style={styles.groupTitle}>קבצי דשבורד תקציב מול ביצוע</div>
        <div style={styles.grid}>
          {FILES.filter((f) => f.group === 'main').map((f) => (
            <Dropzone key={f.key} f={f} status={status[f.key]} onUpload={handleUpload} />
          ))}
        </div>
      </div>

      <div>
        <div style={styles.groupTitle}>קבצי דשבורד יעדים רבעוניים ללקוח</div>
        <div style={styles.grid}>
          {FILES.filter((f) => f.group === 'quarterly').map((f) => (
            <Dropzone key={f.key} f={f} status={status[f.key]} onUpload={handleUpload} />
          ))}
        </div>
      </div>

      <div style={styles.note}>
        אחרי טעינת קבצי "תקציב מול ביצוע", הדשבורד הזה והמגמות יתעדכנו אוטומטית. סוכנים שיופיעו במכירות בלי שיוך בקובץ הסיווג
        ייכנסו לקטגוריית "לא מסווג" עד שישויכו (בקובץ סיווג מעודכן).
      </div>

      <div style={styles.infoCard}>
        💡 <b>הבדל בין השניים:</b> קובץ הסיווג נקרא <b>לפי מיקום עמודה קבוע</b> - אם תשנה את הסדר, זה יישבר. שאר הקבצים
        נקראים <b>לפי חיפוש כותרת</b> - אפשר לשנות סדר עמודות או להוסיף עמודות, כל עוד הכותרות המדויקות עדיין קיימות.
      </div>
    </Layout>
  );
}

function Dropzone({ f, status: st, onUpload }) {
  return (
    <label style={styles.dropzone}>
      <div style={styles.title}>{f.title}</div>
      <div style={styles.hint}>{f.hint} · גרירה או לחיצה להעלאה</div>
      {st?.state === 'uploading' && <div style={styles.uploading}>מעלה...</div>}
      {st?.state === 'done' && <div style={styles.done}>✓ {st.fileName} ({st.rows} שורות)</div>}
      {st?.state === 'error' && <div style={styles.error}>{st.message}</div>}
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
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 },
  groupTitle: { fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 },
  dropzone: {
    background: '#fff', border: '2px dashed #d1d5db', borderRadius: 12, padding: '28px 18px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'center',
  },
  title: { fontSize: 14, fontWeight: 700, color: '#111827' },
  hint: { fontSize: 12, color: '#9ca3af' },
  done: { fontSize: 12, fontWeight: 600, color: '#16a34a' },
  error: { fontSize: 12, fontWeight: 600, color: '#dc2626' },
  uploading: { fontSize: 12, fontWeight: 600, color: '#d97706' },
  formatNote: {
    width: '100%', marginTop: 10, background: '#f9fafb', border: '1px solid #f0f0f0', borderRadius: 8,
    padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#4b5563', lineHeight: 1.7,
  },
  methodTagHeader: { display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '1px 8px', borderRadius: 8, marginBottom: 6, background: '#dbeafe', color: '#1d4ed8' },
  methodTagPosition: { display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '1px 8px', borderRadius: 8, marginBottom: 6, background: '#fef3c7', color: '#92400e' },
  note: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '16px 20px', fontSize: 12, color: '#6b7280', lineHeight: 1.7 },
  infoCard: { fontSize: 12, color: '#374151', lineHeight: 1.8, background: '#eef2ff', border: '1px dashed #c7d2fe', borderRadius: 10, padding: '14px 16px' },
};
