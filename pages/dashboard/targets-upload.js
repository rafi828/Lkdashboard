import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import FileUploadGrid from '../../components/FileUploadGrid';

export default function TargetsUploadPage() {
  const router = useRouter();
  return (
    <Layout>
      <button onClick={() => router.push('/dashboard/targets')} style={styles.backBtn}>
        → חזרה לדשבורד "תקציב מול ביצוע"
      </button>

      <div>
        <h1 style={styles.h1}>טעינת קבצים - תקציב מול ביצוע</h1>
        <p style={styles.subtext}>3 קבצים מזינים את הדשבורד הזה</p>
      </div>

      <FileUploadGrid fileKeys={['classification', 'targets', 'matrix']} columns={3} />

      <div style={styles.note}>
        אחרי טעינת שלושת הקבצים, הדשבורד והמגמות יתעדכנו אוטומטית. סוכנים שיופיעו במכירות בלי שיוך בקובץ הסיווג
        ייכנסו לקטגוריית "לא מסווג" עד שישויכו (בקובץ סיווג מעודכן).
      </div>

      <div style={styles.infoCard}>
        💡 <b>הבדל בין השניים:</b> קובץ הסיווג נקרא <b>לפי מיקום עמודה קבוע</b> - אם תשנה את הסדר, זה יישבר. שאר הקבצים
        נקראים <b>לפי חיפוש כותרת</b> - אפשר לשנות סדר עמודות או להוסיף עמודות, כל עוד הכותרות המדויקות עדיין קיימות.
      </div>
    </Layout>
  );
}

const styles = {
  backBtn: { alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  note: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '16px 20px', fontSize: 12, color: '#6b7280', lineHeight: 1.7 },
  infoCard: { fontSize: 12, color: '#374151', lineHeight: 1.8, background: '#eef2ff', border: '1px dashed #c7d2fe', borderRadius: 10, padding: '14px 16px' },
};
