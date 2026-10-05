import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import FileUploadGrid from '../../components/FileUploadGrid';

export default function SkuCompareUploadPage() {
  const router = useRouter();
  return (
    <Layout permission="skucompare.upload">
      <button onClick={() => router.push('/dashboard/sku-compare')} style={styles.backBtn}>
        → חזרה לדשבורד "השוואת מק"טים"
      </button>

      <div>
        <h1 style={styles.h1}>טעינת קבצים - השוואת מק"טים</h1>
        <p style={styles.subtext}>קובץ התוצאות של כלי ההשוואה מזין את הדשבורד הזה</p>
      </div>

      <div style={{ maxWidth: 420 }}>
        <FileUploadGrid fileKeys={['sku-compare']} columns={1} />
      </div>
    </Layout>
  );
}

const styles = {
  backBtn: { alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
};
