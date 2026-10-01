import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout, { useMe } from '../components/Layout';
import { firstAllowedReport } from '../lib/reports';

// דף הפתיחה אחרי התחברות: מעביר לדוח הראשון שיש למשתמש הרשאה אליו (לפי הסדר ב-lib/reports.js).
// משתמש בלי אף דוח - רואה הודעה במקום מסך ריק.
export default function HomePage() {
  return (
    <Layout>
      <RedirectToFirstReport />
    </Layout>
  );
}

function RedirectToFirstReport() {
  const router = useRouter();
  const me = useMe();
  const report = firstAllowedReport(me);

  useEffect(() => {
    if (report) router.replace(report.href);
  }, [report, router]);

  if (report) return null;

  return (
    <div style={styles.card}>
      <div style={styles.title}>שלום {me.name}, ההתחברות הצליחה 👋</div>
      <div style={styles.text}>עדיין לא הוגדרו לך דוחות במערכת. פנה למנהל המערכת כדי לקבל הרשאה.</div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 24 },
  title: { fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 },
  text: { fontSize: 14, color: '#374151', lineHeight: 1.7 },
};
