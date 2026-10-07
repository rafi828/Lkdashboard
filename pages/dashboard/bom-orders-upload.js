import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import FileUploadGrid from '../../components/FileUploadGrid';

export default function BomOrdersUploadPage() {
  const router = useRouter();
  return (
    <Layout permission="bomorders.upload">
      <button onClick={() => router.push('/dashboard/bom-orders')} style={styles.backBtn}>
        → חזרה לדוח "הזמנות רכש לפי עצי מוצר"
      </button>

      <div>
        <h1 style={styles.h1}>טעינת קבצים - הזמנות רכש לפי עצי מוצר</h1>
        <p style={styles.subtext}>ארבעה קבצים מזינים את הדוח. עצי המוצר נשמרים קבוע - לא צריך לטעון אותם כל פעם.</p>
      </div>

      <div style={styles.explain}>
        <b>מה נשמר ומה מתחלף?</b><br />
        🔵 <b>עצי מוצר</b> - נשמרים במערכת. טעינה חדשה מעדכנת רק את פריטי האב שמופיעים בקובץ (ההרכב שלהם מוחלף);
        פריטי אב שלא בקובץ - נשארים כמו שהם.<br />
        ⚪ <b>מכירות, מלאי, הזמנות ספקים</b> - תמונת מצב: כל טעינה מחליפה את הקודמת.
      </div>

      <div style={{ maxWidth: 900 }}>
        <FileUploadGrid fileKeys={['bom-tree', 'bom-sales', 'bom-stock', 'bom-orders']} columns={2} />
      </div>
    </Layout>
  );
}

const styles = {
  backBtn: { alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  explain: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 16px', fontSize: 12.5, lineHeight: 1.8, color: '#1e3a8a', maxWidth: 900, boxSizing: 'border-box' },
};
