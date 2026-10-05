import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { LineChart, BarChart, Legend, fmtMoney } from '../../components/TrendCharts';

// מגמות של "יעדים רבעוניים ללקוח" - נפתח מכפתור "מגמות" בדוח, עם כפתור חזרה אליו.
// משתמש באותם נתונים כמו הדוח (/api/dashboard/quarterly-targets), כולל אותה הגבלת הרשאות.
const QUARTERS = [1, 2, 3, 4];
const Q_LABELS = ['רבעון 1', 'רבעון 2', 'רבעון 3', 'רבעון 4'];
const MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'];
// אותם ספים וצבעים כמו בדוח עצמו
const STATUS_COLORS = { above: '#16a34a', warn: '#d97706', below: '#dc2626' };
const STATUS_LABELS = { above: 'מעל יעד', warn: 'קרוב ליעד (80-99%)', below: 'מתחת ליעד (<80%)' };
const C_ACTUAL = '#dc2626';
const C_TARGET = '#6b7280';
const C_PREV = '#93c5fd';

function fmtPct(n) {
  return n == null ? '—' : Math.round(n) + '%';
}
function statusOf(ratio) {
  if (ratio >= 1) return 'above';
  if (ratio >= 0.8) return 'warn';
  return 'below';
}
function fmtCount(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function QuarterlyTrendsPage() {
  const router = useRouter();
  const [rawRows, setRawRows] = useState(null);
  const [year, setYear] = useState(null);
  const [error, setError] = useState('');
  const [noAgentCode, setNoAgentCode] = useState(false);
  const [agent, setAgent] = useState('');
  const [customer, setCustomer] = useState('');

  useEffect(() => {
    fetch('/api/dashboard/quarterly-targets')
      .then((res) => res.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setRawRows(d.rows);
        setYear(d.year);
        setNoAgentCode(!!d.noAgentCode);
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'));
  }, []);

  const agentOptions = useMemo(() => [...new Set((rawRows || []).map((r) => r.agent_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [rawRows]);
  const customerOptions = useMemo(
    () => (rawRows || []).filter((r) => !agent || r.agent_name === agent).map((r) => r.customer_name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he')),
    [rawRows, agent]
  );

  const rows = useMemo(() => {
    let out = rawRows || [];
    if (agent) out = out.filter((r) => r.agent_name === agent);
    if (customer.trim()) {
      const q = customer.trim().toLowerCase();
      out = out.filter((r) => (r.customer_name || '').toLowerCase().includes(q) || String(r.customer_id).includes(q));
    }
    return out;
  }, [rawRows, agent, customer]);

  // רבעונים/חודשים שעוד לא התחילו (בשנה הנוכחית) מוצגים ריקים ולא כ-0
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const curQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const quarterStarted = (q) => !isCurrentYear || q <= curQuarter;
  const monthStarted = (i) => !isCurrentYear || i + 1 <= now.getMonth() + 1;

  const quarters = useMemo(() => QUARTERS.map((q) => {
    const target = rows.reduce((s, r) => s + (r[`q${q}_target`] || 0), 0);
    const actual = rows.reduce((s, r) => s + (r[`q${q}_actual`] || 0), 0);
    const counts = { above: 0, warn: 0, below: 0 };
    rows.forEach((r) => {
      const t = r[`q${q}_target`] || 0;
      if (t <= 0) return; // לקוח בלי יעד ברבעון הזה - לא נספר
      counts[statusOf((r[`q${q}_actual`] || 0) / t)]++;
    });
    const started = quarterStarted(q);
    return { q, target, actual: started ? actual : null, pct: started && target ? (actual / target) * 100 : null, counts: started ? counts : null };
  }), [rows, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthly = useMemo(() => MONTHS.map((m, i) => (monthStarted(i) ? rows.reduce((s, r) => s + (r[m] || 0), 0) : null)), [rows, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastYearTotal = rows.reduce((s, r) => s + (r.last_year_sales || 0), 0);
  const lastYearMonthlyAvg = lastYearTotal / 12;

  const annualTarget = quarters.reduce((s, q) => s + q.target, 0);
  const actualSoFar = quarters.reduce((s, q) => s + (q.actual || 0), 0);
  const targetSoFar = quarters.filter((q) => q.actual != null).reduce((s, q) => s + q.target, 0);

  return (
    <Layout permission="quarterly.view">
      <button onClick={() => router.push('/dashboard/quarterly-targets')} style={styles.backBtn}>
        → חזרה לדשבורד "יעדים רבעוניים ללקוח"
      </button>

      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>מגמות – יעדים רבעוניים ללקוח</h1>
          <p style={styles.subtext}>
            {rawRows ? `${year} · ${rows.length} לקוחות${agent || customer ? ' (מסונן)' : ''}` : 'טוען...'}
          </p>
        </div>
        <div style={styles.filters}>
          <select value={agent} onChange={(e) => { setAgent(e.target.value); setCustomer(''); }} style={styles.select}>
            <option value="">כל הסוכנים</option>
            {agentOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            list="qt-customers"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="לקוח (שם או מספר)"
            style={{ ...styles.select, fontWeight: 400, minWidth: 200 }}
          />
          <datalist id="qt-customers">
            {customerOptions.map((c, i) => <option key={`${c}-${i}`} value={c} />)}
          </datalist>
          {(agent || customer) && (
            <button onClick={() => { setAgent(''); setCustomer(''); }} style={styles.clearBtn}>נקה סינון</button>
          )}
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {noAgentCode && <div style={styles.card}>לא הוגדר לך קוד סוכן, ולכן אין נתונים להצגה. פנה למנהל המערכת.</div>}
      {rawRows && rawRows.length === 0 && !noAgentCode && <div style={styles.card}>אין עדיין נתונים. יש לטעון קובץ יעדים רבעוניים בדוח עצמו.</div>}
      {rawRows && rawRows.length > 0 && rows.length === 0 && <div style={styles.card}>אין לקוחות שמתאימים לסינון.</div>}

      {rows.length > 0 && (
        <>
          <div style={styles.kpiGrid}>
            <Kpi label="יעד שנתי" value={fmtMoney(annualTarget)} />
            <Kpi label="בפועל עד כה" value={fmtMoney(actualSoFar)} sub={`מתוך יעד ${fmtMoney(targetSoFar)} לרבעונים שהתחילו`} />
            <Kpi
              label="השלמה ברבעונים שהתחילו"
              value={fmtPct(targetSoFar ? (actualSoFar / targetSoFar) * 100 : null)}
              tone={targetSoFar ? (actualSoFar >= targetSoFar ? 'good' : 'bad') : null}
            />
            <Kpi label="מכירות שנה קודמת" value={fmtMoney(lastYearTotal)} sub={`ממוצע חודשי: ${fmtMoney(lastYearMonthlyAvg)}`} />
          </div>

          <div style={styles.card}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>יעד מול בפועל – לפי רבעון</div>
                <div style={styles.chartSub}>סכום כל הלקוחות בסינון הנוכחי{isCurrentYear ? ` · רבעון ${curQuarter} הוא הרבעון הנוכחי (חלקי)` : ''}</div>
              </div>
              <Legend series={[{ name: 'יעד', color: C_TARGET }, { name: 'בפועל', color: C_ACTUAL }]} />
            </div>
            <BarChart
              labels={Q_LABELS}
              series={[
                { name: 'יעד', color: C_TARGET, values: quarters.map((q) => q.target) },
                { name: 'בפועל', color: C_ACTUAL, values: quarters.map((q) => q.actual) },
              ]}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>כמה לקוחות עמדו ביעד – כל רבעון</div>
                <div style={styles.chartSub}>מספר לקוחות לפי סטטוס (רק לקוחות שיש להם יעד באותו רבעון)</div>
              </div>
              <Legend series={['above', 'warn', 'below'].map((k) => ({ name: STATUS_LABELS[k], color: STATUS_COLORS[k] }))} />
            </div>
            <BarChart
              labels={Q_LABELS}
              format={fmtCount}
              tickFormat={fmtCount}
              series={['above', 'warn', 'below'].map((k) => ({
                name: STATUS_LABELS[k],
                color: STATUS_COLORS[k],
                values: quarters.map((q) => (q.counts ? q.counts[k] : null)),
              }))}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>מכירות חודשיות מול שנה קודמת</div>
                <div style={styles.chartSub}>מכירות בפועל בכל חודש (ינואר–יוני, לפי הקובץ) מול הממוצע החודשי של השנה הקודמת</div>
              </div>
              <Legend series={[{ name: `מכירות ${year}`, color: C_ACTUAL, type: 'line' }, { name: 'ממוצע חודשי שנה קודמת', color: C_PREV, type: 'line', dashed: true }]} />
            </div>
            <LineChart
              labels={MONTH_LABELS}
              series={[
                { name: 'ממוצע חודשי שנה קודמת', color: C_PREV, values: MONTHS.map(() => lastYearMonthlyAvg), dashed: true },
                { name: `מכירות ${year}`, color: C_ACTUAL, values: monthly },
              ]}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.chartTitle}>פירוט לפי רבעון</div>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>רבעון</th>
                    <th style={styles.th}>יעד</th>
                    <th style={styles.th}>בפועל</th>
                    <th style={styles.th}>השלמה</th>
                    <th style={styles.th}>{STATUS_LABELS.above}</th>
                    <th style={styles.th}>{STATUS_LABELS.warn}</th>
                    <th style={styles.th}>{STATUS_LABELS.below}</th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((q, i) => (
                    <tr key={q.q}>
                      <td style={styles.td}>{Q_LABELS[i]}{q.actual == null ? ' (טרם התחיל)' : isCurrentYear && q.q === curQuarter ? ' (נוכחי)' : ''}</td>
                      <td style={styles.td}>{fmtMoney(q.target)}</td>
                      <td style={styles.td}>{q.actual != null ? fmtMoney(q.actual) : '—'}</td>
                      <td style={{ ...styles.td, fontWeight: 600, color: q.pct == null ? undefined : q.pct >= 100 ? '#15803d' : '#dc2626' }}>{fmtPct(q.pct)}</td>
                      <td style={{ ...styles.td, color: STATUS_COLORS.above }}>{q.counts ? q.counts.above : '—'}</td>
                      <td style={{ ...styles.td, color: STATUS_COLORS.warn }}>{q.counts ? q.counts.warn : '—'}</td>
                      <td style={{ ...styles.td, color: STATUS_COLORS.below }}>{q.counts ? q.counts.below : '—'}</td>
                    </tr>
                  ))}
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
  clearBtn: { fontSize: 12, color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  chartHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 },
  chartTitle: { fontSize: 15, fontWeight: 700, color: '#111827' },
  chartSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: '#6b7280' },
  kpiValue: { fontSize: 22, fontWeight: 700, marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'right', color: '#9ca3af', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' },
};
