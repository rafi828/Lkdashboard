import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const DOMAINS = ['מכירות סיטונאים', 'סניפי ל.כ', 'מוסדיים', 'משווקים', 'משרד הביטחון'];

function fmt(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}

export default function TrendsPage() {
  const year = new Date().getFullYear();
  const [domain, setDomain] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({ year: String(year) });
    if (domain) qs.set('domain', domain);
    fetch(`/api/dashboard/trends?${qs.toString()}`)
      .then((res) => res.json())
      .then(setData);
  }, [domain, year]);

  const points = data ? buildPoints(data.months) : null;

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>מגמות והיסטוריה</h1>
          <p style={styles.subtext}>מגמה חודשית לפי תחום ({year})</p>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.chartHead}>
          <div style={styles.chartTitle}>סה"כ מכירות לפי חודש</div>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} style={styles.select}>
            <option value="">תחום: כל התחומים</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {!data && <div style={{ color: '#9ca3af' }}>טוען...</div>}

        {points && (
          <>
            <svg viewBox="0 0 760 190" width="100%" height={190} style={{ overflow: 'visible' }}>
              <polyline points={points.linePoints} fill="none" stroke="#dc2626" strokeWidth="2.5" />
              {points.dots.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#dc2626" />
              ))}
            </svg>
            <div style={styles.monthLabels}>
              {MONTH_NAMES.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function buildPoints(months) {
  const w = 760, h = 190, pad = 10;
  const vals = months.map((m) => m.actual);
  const max = Math.max(1, ...vals);
  const step = w / (months.length - 1);
  const dots = vals.map((v, i) => ({
    x: i * step,
    y: h - pad - (v / max) * (h - pad * 2),
  }));
  const linePoints = dots.map((d) => `${d.x},${d.y}`).join(' ');
  return { linePoints, dots };
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  chartHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  chartTitle: { fontSize: 15, fontWeight: 700, color: '#111827' },
  select: { fontSize: 12, color: '#111827', background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 8, padding: '5px 10px' },
  monthLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', padding: '0 2px' },
};
