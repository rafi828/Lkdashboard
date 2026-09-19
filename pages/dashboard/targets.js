import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function pct(actual, target) {
  if (!target) return actual > 0 ? null : 0; // null = "אין יעד"
  return (actual / target) * 100;
}

function badgeStyle(p) {
  if (p === null) return { background: '#f3f4f6', color: '#6b7280' };
  if (p >= 90) return { background: '#dcfce7', color: '#16a34a' };
  if (p >= 50) return { background: '#ffedd5', color: '#d97706' };
  return { background: '#fee2e2', color: '#dc2626' };
}

function fmt(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}

export default function TargetsDashboard() {
  const now = new Date();
  const [period, setPeriod] = useState('mtd');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    fetch(`/api/dashboard/targets-summary?period=${period}&year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('שגיאה בטעינת הנתונים'));
  }, [period, year, month]);

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>דשבורד יעדים</h1>
          <p style={styles.subtext}>ביצוע בפועל מול יעד, לפי תחום ולפי סוכן</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={styles.periodToggle}>
            <button
              onClick={() => setPeriod('mtd')}
              style={period === 'mtd' ? styles.periodBtnActive : styles.periodBtn}
            >
              MTD - מתחילת החודש
            </button>
            <button
              onClick={() => setPeriod('ytd')}
              style={period === 'ytd' ? styles.periodBtnActive : styles.periodBtn}
            >
              YTD - מתחילת השנה
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: '#9ca3af' }}>חודש נבחר</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={styles.select}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx + 1}>
                  {name} {year}{idx + 1 === now.getMonth() + 1 && year === now.getFullYear() ? ' (נוכחי)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {!data && !error && <div style={styles.card}>טוען...</div>}

      {data && (
        <>
          <div style={styles.kpiGrid}>
            <div style={{ ...styles.card, ...styles.kpi, background: '#0a0a0a' }}>
              <div style={{ ...styles.kpiLabel, color: '#fff' }}>סה"כ</div>
              <div style={{ ...styles.kpiValue, color: '#fff' }}>{fmt(data.grandTotal.actual)}</div>
              <div style={styles.kpiSub}>מתוך {fmt(data.grandTotal.target)}</div>
              {(() => {
                const p = pct(data.grandTotal.actual, data.grandTotal.target);
                return (
                  <div style={{ ...styles.badge, background: '#dc2626', color: '#fff' }}>
                    {p === null ? 'אין יעד' : p.toFixed(1) + '%'}
                  </div>
                );
              })()}
            </div>

            {data.domains.map((d) => {
              const p = pct(d.actual, d.target);
              return (
                <div key={d.domain} style={{ ...styles.card, ...styles.kpi }}>
                  <div style={styles.kpiLabel}>{d.domain}</div>
                  <div style={styles.kpiValue}>{fmt(d.actual)}</div>
                  <div style={styles.kpiSub}>מתוך {fmt(d.target)}</div>
                  <div style={{ ...styles.badge, ...badgeStyle(p) }}>{p === null ? 'אין יעד' : p.toFixed(1) + '%'}</div>
                </div>
              );
            })}
          </div>

          {data.domains
            .slice()
            .sort((a, b) => b.agents.length - a.agents.length)
            .map((d, idx) => (
              <DomainChart key={d.domain} domain={d} large={idx === 0} />
            ))}
        </>
      )}
    </Layout>
  );
}

function DomainChart({ domain, large }) {
  const maxVal = Math.max(1, ...domain.agents.flatMap((a) => [a.actual, a.target]));
  const chartH = large ? 180 : 120;

  return (
    <div style={{ ...styles.card, ...styles.chartCard }}>
      <div style={styles.chartHead}>
        <div style={styles.chartTitle}>{domain.domain} - פירוט לפי סוכן</div>
        <div style={styles.legend}>
          <span><i style={{ ...styles.dot, background: '#dc2626' }} /> בפועל</span>
          <span><i style={{ ...styles.dot, background: '#111827' }} /> יעד</span>
        </div>
      </div>
      <div style={{ ...styles.barsRow, height: chartH + 40 }}>
        {domain.agents.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>אין סוכנים בתחום זה</div>}
        {domain.agents.map((a) => {
          const actualH = (a.actual / maxVal) * chartH;
          const targetH = (a.target / maxVal) * chartH;
          const p = pct(a.actual, a.target);
          return (
            <div key={a.agent_code} style={styles.barGroup}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: chartH }}>
                <div style={{ width: large ? 30 : 22, height: Math.max(0, actualH), background: '#dc2626', borderRadius: '4px 4px 0 0' }} />
                <div style={{ width: large ? 30 : 22, height: Math.max(0, targetH), background: '#111827', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={styles.agentName}>{a.agent_name || a.agent_code}</div>
              <div style={styles.agentValues}>
                {fmt(a.actual)} / {p === null ? 'אין יעד' : fmt(a.target)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  periodToggle: { display: 'flex', gap: 6, background: '#fff', border: '1px solid #e9e9ec', borderRadius: 10, padding: 4 },
  periodBtn: { border: 'none', background: 'transparent', color: '#6b7280', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  periodBtnActive: { border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  select: { fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16 },
  kpi: { display: 'flex', flexDirection: 'column', gap: 8, padding: 18 },
  kpiLabel: { fontSize: 14, fontWeight: 700, color: '#111827' },
  kpiValue: { fontSize: 21, fontWeight: 700, color: '#111827' },
  kpiSub: { fontSize: 12, color: '#9ca3af' },
  badge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },
  chartCard: { display: 'flex', flexDirection: 'column', gap: 16 },
  chartHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  chartTitle: { fontSize: 15, fontWeight: 700, color: '#111827' },
  legend: { display: 'flex', gap: 16, fontSize: 12, color: '#6b7280' },
  dot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block', marginInlineEnd: 6 },
  barsRow: { display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', padding: '0 12px', overflowX: 'auto', gap: 8 },
  barGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 60 },
  agentName: { fontSize: 12, fontWeight: 600, textAlign: 'center', color: '#374151' },
  agentValues: { fontSize: 10, color: '#9ca3af', textAlign: 'center' },
};
