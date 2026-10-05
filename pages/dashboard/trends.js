import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { LineChart, BarChart, Legend, fmtMoney } from '../../components/TrendCharts';

// מגמות של "תקציב מול ביצוע" - נפתח מכפתור "מגמות" בדוח, עם כפתור חזרה אליו.
const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const C_ACTUAL = '#dc2626';
const C_TARGET = '#6b7280';
const C_PREV = '#93c5fd';

function fmtPct(n) {
  return n == null ? '—' : Math.round(n) + '%';
}
function pct(a, b) {
  return b ? (a / b) * 100 : null;
}

export default function TargetsTrendsPage() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [domain, setDomain] = useState('');
  const [agent, setAgent] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    const qs = new URLSearchParams({ year: String(year) });
    if (domain) qs.set('domain', domain);
    if (agent) qs.set('agent_code', agent);
    fetch(`/api/dashboard/trends?${qs.toString()}`)
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('שגיאה בטעינת הנתונים'));
  }, [year, domain, agent]);

  const agentOptions = useMemo(
    () => (data ? data.agents.filter((a) => !domain || a.domain === domain) : []),
    [data, domain]
  );

  const calc = useMemo(() => {
    if (!data) return null;
    const months = data.months;
    // חודשים שיש בהם נתוני מכירות בשנה שנבחרה - מהם מחושבים הסיכומים "מתחילת השנה"
    const withData = months.filter((m) => m.actual != null);
    const lastMonth = withData.length ? withData[withData.length - 1].month : 0;
    const upTo = months.slice(0, lastMonth);
    const ytdActual = upTo.reduce((s, m) => s + (m.actual || 0), 0);
    const ytdTarget = upTo.reduce((s, m) => s + m.target, 0);
    const prevSame = upTo.reduce((s, m) => s + (m.prevActual || 0), 0);
    const hasPrev = months.some((m) => m.prevActual != null);

    // אחוז השלמה מצטבר: בפועל מצטבר / יעד מצטבר, עד כל חודש
    let cumA = 0, cumT = 0;
    const cumPct = months.map((m) => {
      cumT += m.target;
      if (m.actual == null) return null;
      cumA += m.actual;
      return pct(cumA, cumT);
    });
    let cumPA = 0, cumPT = 0;
    const prevCumPct = months.map((m) => {
      cumPT += m.prevTarget;
      if (m.prevActual == null) return null;
      cumPA += m.prevActual;
      return pct(cumPA, cumPT);
    });
    return { lastMonth, ytdActual, ytdTarget, prevSame, hasPrev, cumPct, prevCumPct };
  }, [data]);

  function changeDomain(d) {
    setDomain(d);
    // אם הסוכן שנבחר לא שייך לתחום החדש - מאפסים אותו
    if (agent && data && !data.agents.some((a) => String(a.agent_code) === agent && (!d || a.domain === d))) setAgent('');
  }

  const isCurrentYear = year === new Date().getFullYear();

  return (
    <Layout permission="targets.view">
      <button onClick={() => router.push('/dashboard/targets')} style={styles.backBtn}>
        → חזרה לדשבורד "תקציב מול ביצוע"
      </button>

      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>מגמות – תקציב מול ביצוע</h1>
          <p style={styles.subtext}>מכירות בפועל מול יעד לאורך השנה, והשוואה לשנה הקודמת</p>
        </div>
        <div style={styles.filters}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={styles.select}>
            {(data?.years || [year]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={domain} onChange={(e) => changeDomain(e.target.value)} style={styles.select}>
            <option value="">כל התחומים</option>
            {(data?.domains || []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={agent} onChange={(e) => setAgent(e.target.value)} style={styles.select}>
            <option value="">כל הסוכנים</option>
            {agentOptions.map((a) => (
              <option key={a.agent_code} value={a.agent_code}>{a.agent_name || 'ללא שם'} ({a.agent_code})</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {data?.noAgentCode && <div style={styles.card}>לא הוגדר לך קוד סוכן, ולכן אין נתונים להצגה. פנה למנהל המערכת.</div>}
      {!data && !error && <div style={styles.card}>טוען...</div>}

      {data && calc && !data.noAgentCode && (
        <>
          <div style={styles.kpiGrid}>
            <Kpi label={`בפועל מתחילת ${year}`} value={fmtMoney(calc.ytdActual)} sub={calc.lastMonth ? `עד ${MONTH_NAMES[calc.lastMonth - 1]}` : 'אין עדיין נתוני מכירות'} />
            <Kpi label="יעד לאותה תקופה" value={fmtMoney(calc.ytdTarget)} />
            <Kpi
              label="השלמת יעד"
              value={fmtPct(pct(calc.ytdActual, calc.ytdTarget))}
              tone={calc.ytdTarget ? (calc.ytdActual >= calc.ytdTarget ? 'good' : 'bad') : null}
            />
            <Kpi
              label={`שינוי מול ${year - 1}`}
              value={calc.hasPrev && calc.prevSame ? `${calc.ytdActual >= calc.prevSame ? '+' : ''}${Math.round(((calc.ytdActual - calc.prevSame) / calc.prevSame) * 100)}%` : '—'}
              sub={calc.hasPrev ? `${year - 1} לאותם חודשים: ${fmtMoney(calc.prevSame)}` : `אין נתונים ל-${year - 1}`}
              tone={calc.hasPrev && calc.prevSame ? (calc.ytdActual >= calc.prevSame ? 'good' : 'bad') : null}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>בפועל מול יעד – לפי חודש</div>
                <div style={styles.chartSub}>מכירות בפועל בכל חודש מול היעד החודשי</div>
              </div>
              <Legend series={[{ name: 'בפועל', color: C_ACTUAL, type: 'line' }, { name: 'יעד', color: C_TARGET, type: 'line', dashed: true }]} />
            </div>
            <LineChart
              labels={MONTH_NAMES}
              series={[
                { name: 'יעד', color: C_TARGET, values: data.months.map((m) => m.target), dashed: true },
                { name: 'בפועל', color: C_ACTUAL, values: data.months.map((m) => m.actual) },
              ]}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>השוואה לשנה קודמת</div>
                <div style={styles.chartSub}>מכירות בפועל בכל חודש: {year} מול {year - 1}</div>
              </div>
              <Legend series={[{ name: String(year), color: C_ACTUAL }, { name: String(year - 1), color: C_PREV }]} />
            </div>
            {calc.hasPrev ? (
              <BarChart
                labels={MONTH_NAMES}
                series={[
                  { name: String(year), color: C_ACTUAL, values: data.months.map((m) => m.actual) },
                  { name: String(year - 1), color: C_PREV, values: data.months.map((m) => m.prevActual) },
                ]}
              />
            ) : (
              <div style={styles.empty}>אין נתוני מכירות ל-{year - 1}. כדי לראות השוואה יש לטעון את מטריצת המכירות של {year - 1}.</div>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>אחוז השלמת יעד מצטבר</div>
                <div style={styles.chartSub}>
                  בפועל מתחילת השנה מול יעד מתחילת השנה, נכון לסוף כל חודש
                  {isCurrentYear ? ' (החודש הנוכחי נספר מול יעד חודש מלא)' : ''}
                </div>
              </div>
              <Legend series={[{ name: String(year), color: C_ACTUAL, type: 'line' }, ...(calc.hasPrev ? [{ name: String(year - 1), color: C_PREV, type: 'line' }] : [])]} />
            </div>
            <LineChart
              labels={MONTH_NAMES}
              format={fmtPct}
              tickFormat={fmtPct}
              refLine={{ value: 100, label: 'יעד 100%' }}
              series={[
                ...(calc.hasPrev ? [{ name: String(year - 1), color: C_PREV, values: calc.prevCumPct }] : []),
                { name: String(year), color: C_ACTUAL, values: calc.cumPct },
              ]}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.chartTitle}>פירוט חודשי</div>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>חודש</th>
                    <th style={styles.th}>יעד</th>
                    <th style={styles.th}>בפועל</th>
                    <th style={styles.th}>השלמה</th>
                    <th style={styles.th}>השלמה מצטברת</th>
                    <th style={styles.th}>בפועל {year - 1}</th>
                    <th style={styles.th}>שינוי</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m, i) => {
                    const p = m.actual != null ? pct(m.actual, m.target) : null;
                    const ch = m.actual != null && m.prevActual ? ((m.actual - m.prevActual) / m.prevActual) * 100 : null;
                    return (
                      <tr key={m.month}>
                        <td style={styles.td}>{MONTH_NAMES[i]}</td>
                        <td style={styles.td}>{m.target ? fmtMoney(m.target) : '—'}</td>
                        <td style={styles.td}>{m.actual != null ? fmtMoney(m.actual) : '—'}</td>
                        <td style={{ ...styles.td, color: p == null ? undefined : p >= 100 ? '#15803d' : '#dc2626', fontWeight: 600 }}>{fmtPct(p)}</td>
                        <td style={styles.td}>{fmtPct(calc.cumPct[i])}</td>
                        <td style={styles.td}>{m.prevActual != null ? fmtMoney(m.prevActual) : '—'}</td>
                        <td style={{ ...styles.td, color: ch == null ? undefined : ch >= 0 ? '#15803d' : '#dc2626' }}>
                          {ch == null ? '—' : `${ch >= 0 ? '+' : ''}${Math.round(ch)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

function Kpi({ label, value, sub, tone }) {
  const color = tone === 'good' ? '#15803d' : tone === 'bad' ? '#dc2626' : '#111827';
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
      {sub && <div style={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

const styles = {
  backBtn: { alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  select: { fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  chartHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 },
  chartTitle: { fontSize: 15, fontWeight: 700, color: '#111827' },
  chartSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  empty: { fontSize: 13, color: '#6b7280', padding: '20px 0' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: '#6b7280' },
  kpiValue: { fontSize: 22, fontWeight: 700, marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'right', color: '#9ca3af', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' },
};
