import { useState } from 'react';
import Layout from '../components/Layout';

const FILES = [
  { key: 'classification', title: 'סיווג סוכנים לתחומים', hint: 'שיוך קוד סוכן לתחום', endpoint: '/api/upload/classification' },
  { key: 'targets', title: 'קובץ יעדים', hint: 'יעדי סוכנים לפי חודש', endpoint: '/api/upload/targets' },
  { key: 'matrix', title: 'מטריצת מכירות חודשית', hint: 'מכירות לפי סוכן וחודש', endpoint: '/api/upload/sales-matrix' },
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

      <div style={styles.grid}>
        {FILES.map((f) => {
          const st = status[f.key];
          return (
            <label key={f.key} style={styles.dropzone}>
              <div style={styles.title}>{f.title}</div>
              <div style={styles.hint}>{f.hint} · גרירה או לחיצה להעלאה</div>
              {st?.state === 'uploading' && <div style={styles.uploading}>מעלה...</div>}
              {st?.state === 'done' && <div style={styles.done}>✓ {st.fileName} ({st.rows} שורות)</div>}
              {st?.state === 'error' && <div style={styles.error}>{st.message}</div>}
              <input
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && handleUpload(f, e.target.files[0])}
              />
            </label>
          );
        })}
      </div>

      <div style={styles.note}>
        אחרי טעינת שלושת הקבצים, דשבורד היעדים והמגמות יתעדכנו אוטומטית. סוכנים שיופיעו במכירות בלי שיוך בקובץ הסיווג
        ייכנסו לקטגוריית "לא מסווג" עד שישויכו (בקובץ סיווג מעודכן).
      </div>
    </Layout>
  );
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 },
  dropzone: {
    background: '#fff', border: '2px dashed #d1d5db', borderRadius: 12, padding: '28px 18px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'center',
  },
  title: { fontSize: 14, fontWeight: 700, color: '#111827' },
  hint: { fontSize: 12, color: '#9ca3af' },
  done: { fontSize: 12, fontWeight: 600, color: '#16a34a' },
  error: { fontSize: 12, fontWeight: 600, color: '#dc2626' },
  uploading: { fontSize: 12, fontWeight: 600, color: '#d97706' },
  note: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '16px 20px', fontSize: 12, color: '#6b7280', lineHeight: 1.7 },
};
