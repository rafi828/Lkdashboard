import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import FileUploadGrid from '../../components/FileUploadGrid';

export default function CustomerSalesUploadPage() {
  const router = useRouter();
  return (
    <Layout permission="custsales.upload">
      <button onClick={() => router.push('/dashboard/customer-sales')} style={styles.backBtn}>
        → חזרה לדשבורד "מכירות ללקוח"
      </button>

      <div>
        <h1 style={styles.h1}>טעינת קבצים - מכירות ללקוח</h1>
        <p style={styles.subtext}>שני קבצים מזינים את הדשבורד הזה - כל אחד נטען בנפרד</p>
      </div>

      <div style={{ maxWidth: 860 }}>
        <FileUploadGrid fileKeys={['customers', 'customer-sales']} columns={2} />
      </div>
    </Layout>
  );
}

const styles = {
  backBtn: { alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
};
