import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';

const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'];
const STATUS_COLORS = { above: '#16a34a', warn: '#d97706', below: '#dc2626' };
const STATUS_LABELS = { above: 'מעל יעד', warn: 'קרוב ליעד (80-99%)', below: 'מתחת ליעד (<80%)' };

function fmt(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}
function fmtPct(n) {
  return (n * 100).toFixed(0) + '%';
}
function statusOf(pct) {
  if (pct >= 1) return 'above';
  if (pct >= 0.8) return 'warn';
  return 'below';
}

function currentQuarter() {
  const m = new Date().getMonth() + 1;
  return Math.ceil(m / 3);
}

function deriveRow(r, quarter) {
  let target, actual;
  if (quarter === 'q1') {
    target = r.q1_target; actual = r.q1_actual;
  } else if (quarter === 'q2') {
    target = r.q2_target; actual = r.q2_actual;
  } else if (quarter === 'q3') {
    target = r.q3_target; actual = r.q3_actual;
  } else if (quarter === 'q4') {
    target = r.q4_target; actual = r.q4_actual;
  } else {
    // מצטבר: סכום כל 4 הרבעונים. רבעונים שעוד לא התחילו פשוט תורמים 0 לבפועל (כמו שהם בקובץ),
    // כך שהאחוז משקף התקדמות אמיתית מול היעד השנתי המלא.
    target = r.q1_target + r.q2_target + r.q3_target + r.q4_target;
    actual = r.q1_actual + r.q2_actual + r.q3_actual + r.q4_actual;
  }
  const pct = target > 0 ? actual / target : 0;
  return { ...r, target, actual, pct, status: statusOf(pct) };
}

export default function QuarterlyTargetsPage() {
  const [rawRows, setRawRows] = useState([]);
  const [error, setError] = useState('');
  const [agent, setAgent] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [quarter, setQuarter] = useState('combined');
  const [sortKey, setSortKey] = useState('pct');
  const [sortDir, setSortDir] = useState('asc');
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [recipientField, setRecipientField] = useState('agent_email');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    fetch('/api/dashboard/quarterly-targets')
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setRawRows(d.rows)));
  }, []);

  const agentOptions = useMemo(() => [...new Set(rawRows.map((r) => r.agent_name))].sort(), [rawRows]);

  const rows = useMemo(() => {
    let out = rawRows.map((r) => deriveRow(r, quarter));
    if (agent) out = out.filter((r) => r.agent_name === agent);
    if (type) out = out.filter((r) => r.target_type_simple === type);
    if (status) out = out.filter((r) => r.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => (r.customer_name || '').toLowerCase().includes(q) || String(r.customer_id).includes(q));
    }
    return out;
  }, [rawRows, agent, status, type, search, quarter]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') return (va || '').localeCompare(vb || '', 'he') * dir;
      return ((va || 0) - (vb || 0)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function resetFilters() {
    setAgent(''); setStatus(''); setType(''); setSearch(''); setQuarter('combined');
  }

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const overallPct = totalTarget > 0 ? totalActual / totalTarget : 0;
  const aboveCount = rows.filter((r) => r.status === 'above').length;
  const belowCount = rows.filter((r) => r.status === 'below').length;

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>יעדים רבעוניים ללקוח</h1>
          <p style={styles.subtext}>
            {rawRows.length > 0
              ? `${rawRows.length} לקוחות · ${agentOptions.length} סוכנים`
              : 'טרם הועלה קובץ יעדים רבעוניים'}
          </p>
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}

      {rawRows.length === 0 && !error && (
        <div style={styles.card}>
          עדיין אין נתונים. העלה קובץ יעדים רבעוניים דרך <b>מערכת ← טעינת קבצים</b>.
        </div>
      )}

      {rawRows.length > 0 && (
        <>
          {/* פילטרים */}
          <div style={{ ...styles.card, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <FilterField label="סוכן">
              <select value={agent} onChange={(e) => setAgent(e.target.value)} style={styles.select}>
                <option value="">כל הסוכנים</option>
                {agentOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </FilterField>
            <FilterField label="סטטוס עמידה ביעד">
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.select}>
                <option value="">הכל</option>
                <option value="above">מעל יעד</option>
                <option value="warn">קרוב ליעד (80%-99%)</option>
                <option value="below">מתחת ליעד (&lt;80%)</option>
              </select>
            </FilterField>
            <FilterField label="סוג יעד">
              <select value={type} onChange={(e) => setType(e.target.value)} style={styles.select}>
                <option value="">הכל</option>
                <option value="רבעוני">רבעוני</option>
                <option value="שנתי">שנתי</option>
                <option value="אחר / הערה">אחר / הערה</option>
              </select>
            </FilterField>
            <FilterField label="חיפוש לקוח">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם או מספר לקוח..." style={styles.select} />
            </FilterField>
            <FilterField label="טווח תצוגה">
              <div style={styles.periodToggle}>
                <button onClick={() => setQuarter('combined')} style={quarter === 'combined' ? styles.periodBtnActive : styles.periodBtn}>מצטבר (שנתי)</button>
                <button onClick={() => setQuarter('q1')} style={quarter === 'q1' ? styles.periodBtnActive : styles.periodBtn}>רבעון 1</button>
                <button onClick={() => setQuarter('q2')} style={quarter === 'q2' ? styles.periodBtnActive : styles.periodBtn}>רבעון 2</button>
                <button onClick={() => setQuarter('q3')} style={quarter === 'q3' ? styles.periodBtnActive : styles.periodBtn}>רבעון 3</button>
                <button onClick={() => setQuarter('q4')} style={quarter === 'q4' ? styles.periodBtnActive : styles.periodBtn}>רבעון 4</button>
              </div>
            </FilterField>
            <button onClick={resetFilters} style={styles.resetBtn}>איפוס סינונים</button>
            <button onClick={() => handleExport(sortedRows.map((r) => r.customer_id))} style={styles.exportBtn}>ייצוא לשליחת מייל (Word Mail Merge)</button>
            <button onClick={() => openSendModalGuard(quarter, setSendModalOpen)} style={styles.sendBtn}>שליחת מייל</button>
          </div>

          {/* KPI */}
          <div style={styles.kpiGrid}>
            <Kpi label="מספר לקוחות בסינון" value={rows.length} sub={`מתוך ${rawRows.length} סה"כ`} />
            <Kpi label="יעד מצטבר (לטווח שנבחר)" value={fmt(totalTarget)} />
            <Kpi label="מכירות בפועל (לטווח שנבחר)" value={fmt(totalActual)} tone={totalActual >= totalTarget ? 'good' : 'bad'} />
            <Kpi label="אחוז עמידה כולל" value={fmtPct(overallPct)} sub={overallPct >= 1 ? 'מעל היעד הכולל' : 'מתחת ליעד הכולל'} tone={overallPct >= 1 ? 'good' : 'bad'} />
            <Kpi label="לקוחות מעל יעד" value={aboveCount} sub={rows.length ? Math.round(aboveCount / rows.length * 100) + '% מהלקוחות' : ''} tone="good" />
            <Kpi label="לקוחות מתחת ל-80%" value={belowCount} sub={rows.length ? Math.round(belowCount / rows.length * 100) + '% מהלקוחות' : ''} tone="bad" />
          </div>

          {/* גרפים */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
            <AgentChart rows={rows} />
            <StatusDonut rows={rows} />
          </div>
          <MonthTrendChart rows={rows} />

          {/* טבלה */}
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>פירוט לקוחות</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>מציג {sortedRows.length} לקוחות</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <SortTh label="לקוח" k="customer_name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="סוכן" k="agent_name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="סוג יעד" k="target_type_simple" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="יעד (לפי טווח)" k="target" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="בפועל (לפי טווח)" k="actual" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="% עמידה" k="pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="יעד שנתי" k="annual_target" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="מכירות שנה קודמת" k="last_year_sales" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <tr key={r.customer_id}>
                      <td style={styles.td}>{r.customer_name || '(ללא שם)'} <span style={{ color: '#9ca3af', fontSize: 11 }}>#{r.customer_id}</span></td>
                      <td style={styles.td}>{r.agent_name}</td>
                      <td style={styles.td}>{r.target_type_simple}</td>
                      <td style={styles.td}>{fmt(r.target)}</td>
                      <td style={styles.td}>{fmt(r.actual)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...badgeColor(r.status) }}>{fmtPct(r.pct)}</span>
                      </td>
                      <td style={styles.td}>{fmt(r.annual_target)}</td>
                      <td style={styles.td}>{fmt(r.last_year_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {sendModalOpen && (
        <SendModal
          quarter={quarter}
          quarterNum={parseInt(quarter.replace('q', ''), 10)}
          rows={sortedRows}
          recipientField={recipientField}
          setRecipientField={setRecipientField}
          sending={sending}
          sendResult={sendResult}
          onClose={() => { setSendModalOpen(false); setSendResult(null); }}
          onSend={() =>
            performSend({
              quarter,
              customerIds: sortedRows.filter((r) => r.target_type_simple === 'רבעוני').map((r) => r.customer_id),
              recipientField,
              setSending,
              setSendResult,
              setSendModalOpen,
            })
          }
        />
      )}
    </Layout>
  );
}

const RECIPIENT_OPTIONS = [
  { field: 'agent_email', label: 'מייל סוכן' },
  { field: 'rafi_email', label: 'רפי' },
  { field: 'chanoch_email', label: 'חנוך' },
  { field: 'david_email', label: 'דוד' },
  { field: 'amir_email', label: 'אמיר' },
];

function SendModal({ quarter, quarterNum, rows, recipientField, setRecipientField, sending, sendResult, onClose, onSend }) {
  const quarterlyRows = rows.filter((r) => r.target_type_simple === 'רבעוני');
  const skippedNotQuarterly = rows.length - quarterlyRows.length;
  const missingEmail = quarterlyRows.filter((r) => !r[recipientField]).length;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>שליחת מייל - רבעון {quarterNum}</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          נשלח לפי הסינון הנוכחי במסך ({rows.length} לקוחות)
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>שלח לפי עמודת:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {RECIPIENT_OPTIONS.map((opt) => (
            <label key={opt.field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="recipientField"
                checked={recipientField === opt.field}
                onChange={() => setRecipientField(opt.field)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div style={styles.modalNote}>
          {skippedNotQuarterly > 0 && <div>⚠ {skippedNotQuarterly} לקוחות ידולגו (סוג יעד אינו "רבעוני").</div>}
          {missingEmail > 0 && <div>⚠ {missingEmail} לקוחות ידולגו (אין כתובת מייל בעמודה שנבחרה).</div>}
          <div>ישלח בפועל ל-{quarterlyRows.length - missingEmail} לקוחות.</div>
        </div>

        {sendResult && !sendResult.error && (
          <div style={{ ...styles.modalNote, background: '#f0fdf4', color: '#15803d' }}>
            נשלחו {sendResult.sent} מיילים בהצלחה.
            {sendResult.skippedNotQuarterly > 0 && ` דולגו ${sendResult.skippedNotQuarterly} (לא רבעוני).`}
            {sendResult.skippedNoEmail > 0 && ` דולגו ${sendResult.skippedNoEmail} (אין מייל).`}
            {sendResult.errors?.length > 0 && ` נכשלו ${sendResult.errors.length}.`}
          </div>
        )}
        {sendResult?.errors?.length > 0 && (
          <div style={{ ...styles.modalNote, background: '#fef2f2', color: '#dc2626' }}>
            {sendResult.errors.map((e, i) => (
              <div key={i}>לקוח #{e.customer_id}: {e.message}</div>
            ))}
          </div>
        )}
        {sendResult?.error && <div style={{ ...styles.modalNote, background: '#fef2f2', color: '#dc2626' }}>{sendResult.error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={styles.resetBtn}>סגור</button>
          <button onClick={onSend} disabled={sending} style={styles.sendBtn}>
            {sending ? 'שולח...' : 'שלח'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function handleExport(customerIds) {
  if (customerIds.length === 0) {
    alert('אין לקוחות לייצוא עם הסינון הנוכחי');
    return;
  }
  const res = await fetch('/api/dashboard/quarterly-targets-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'שגיאה בייצוא');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mailmerge-export.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openSendModalGuard(quarter, setSendModalOpen) {
  if (quarter === 'combined') {
    alert('לא ניתן לשלוח מייל במצב "מצטבר (שנתי)" - יש לבחור רבעון ספציפי (1-4) למעלה קודם.');
    return;
  }
  setSendModalOpen(true);
}

async function performSend({ quarter, customerIds, recipientField, setSending, setSendResult, setSendModalOpen }) {
  const qNum = parseInt(quarter.replace('q', ''), 10);
  if (qNum !== currentQuarter()) {
    const ok = window.confirm(
      `שים לב: הרבעון הנבחר (רבעון ${qNum}) אינו הרבעון הנוכחי (רבעון ${currentQuarter()}). האם אתה בטוח שברצונך לשלוח נתונים מרבעון אחר?`
    );
    if (!ok) return;
  }
  setSending(true);
  setSendResult(null);
  try {
    const res = await fetch('/api/dashboard/quarterly-targets-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerIds, quarter: qNum, recipientField }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSendResult({ error: data.error || 'שגיאה בשליחה' });
    } else {
      setSendResult(data);
    }
  } catch (e) {
    setSendResult({ error: 'שגיאת רשת בשליחה' });
  } finally {
    setSending(false);
  }
}

function FilterField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  const color = tone === 'good' ? '#16a34a' : tone === 'bad' ? '#dc2626' : '#111827';
  return (
    <div style={styles.kpi}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function SortTh({ label, k, sortKey, sortDir, onClick }) {
  const active = sortKey === k;
  return (
    <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => onClick(k)}>
      {label} {active && (sortDir === 'asc' ? '▲' : '▼')}
    </th>
  );
}

function badgeColor(status) {
  if (status === 'above') return { background: '#dcfce7', color: '#16a34a' };
  if (status === 'warn') return { background: '#ffedd5', color: '#d97706' };
  return { background: '#fee2e2', color: '#dc2626' };
}

// ==================== גרף עמודות: יעד מול בפועל לפי סוכן ====================
function AgentChart({ rows }) {
  const byAgent = {};
  rows.forEach((r) => {
    if (!byAgent[r.agent_name]) byAgent[r.agent_name] = { target: 0, actual: 0 };
    byAgent[r.agent_name].target += r.target;
    byAgent[r.agent_name].actual += r.actual;
  });
  const agents = Object.keys(byAgent).sort();
  const maxVal = Math.max(1, ...agents.flatMap((a) => [byAgent[a].target, byAgent[a].actual]));

  return (
    <div style={styles.card}>
      <div style={styles.chartTitle}>יעד מול ביצוע בפועל לפי סוכן</div>
      <div style={styles.chartSub}>סכום יעדים וסכום מכירות בפועל, בהתאם לסינון הפעיל</div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', height: 170, overflowX: 'auto', paddingTop: 6 }}>
        {agents.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>אין נתונים</div>}
        {agents.map((a) => (
          <div key={a} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 130 }}>
              <div style={{ width: 22, height: (byAgent[a].target / maxVal) * 130, background: '#111827', borderRadius: '4px 4px 0 0' }} title="יעד" />
              <div style={{ width: 22, height: (byAgent[a].actual / maxVal) * 130, background: '#dc2626', borderRadius: '4px 4px 0 0' }} title="בפועל" />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, maxWidth: 70, textAlign: 'center' }}>{a}</div>
          </div>
        ))}
      </div>
      <div style={styles.legendNote}>
        <span><i style={{ ...styles.dot, background: '#111827' }} /> יעד</span>
        <span><i style={{ ...styles.dot, background: '#dc2626' }} /> בפועל</span>
      </div>
    </div>
  );
}

// ==================== עוגה: פילוח לקוחות לפי סטטוס ====================
function StatusDonut({ rows }) {
  const counts = { above: 0, warn: 0, below: 0 };
  rows.forEach((r) => counts[r.status]++);
  const total = rows.length || 1;
  let cum = 0;
  const stops = ['above', 'warn', 'below'].map((k) => {
    const start = (cum / total) * 360;
    cum += counts[k];
    const end = (cum / total) * 360;
    return `${STATUS_COLORS[k]} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });

  return (
    <div style={styles.card}>
      <div style={styles.chartTitle}>פילוח לקוחות לפי סטטוס עמידה ביעד</div>
      <div style={styles.chartSub}>מספר הלקוחות בכל קטגוריית עמידה ביעד</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 140, height: 140, borderRadius: '50%', background: `conic-gradient(${stops.join(',')})`, flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {['above', 'warn', 'below'].map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: STATUS_COLORS[k], display: 'inline-block' }} />
              {STATUS_LABELS[k]} — <b>{counts[k]}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== קו: מגמת מכירות חודשית ====================
function MonthTrendChart({ rows }) {
  const months = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
  const sums = months.map((m) => rows.reduce((s, r) => s + (r[m] || 0), 0));
  const maxVal = Math.max(1, ...sums);
  const w = 760, h = 160, pad = 10;
  const step = w / (sums.length - 1);
  const points = sums.map((v, i) => ({ x: i * step, y: h - pad - (v / maxVal) * (h - pad * 2) }));
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div style={styles.card}>
      <div style={styles.chartTitle}>מגמת מכירות חודשית (ינואר–יוני)</div>
      <div style={styles.chartSub}>סכום מכירות בפועל בכל חודש, בהתאם לסינון הפעיל</div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ overflow: 'visible' }}>
        <polyline points={linePoints} fill="none" stroke="#dc2626" strokeWidth="2.5" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#dc2626" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
        {MONTH_LABELS.map((m) => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20 },
  select: { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 150 },
  periodToggle: { display: 'flex', gap: 4, background: '#f9fafb', border: '1px solid #e9e9ec', borderRadius: 8, padding: 3 },
  periodBtn: { border: 'none', background: 'transparent', color: '#6b7280', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  periodBtnActive: { border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  resetBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#374151' },
  exportBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  sendBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modalBox: { background: '#fff', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw', direction: 'rtl' },
  modalNote: { fontSize: 12, color: '#6b7280', background: '#f9fafb', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 14 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 },
  chartTitle: { fontSize: 15, fontWeight: 700 },
  chartSub: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  legendNote: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block', marginInlineEnd: 5 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'right', padding: '8px 10px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 },
};
