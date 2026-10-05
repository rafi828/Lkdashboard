import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout, { IfCan, useMe, can } from '../../components/Layout';

const CATALOG_URL = 'https://peledtech.com/catalog2024-25/';
const PAGE_SIZE = 100;
const CONFIDENCES = ['ודאי', 'סביר', 'לבדיקה', 'ללא התאמה'];
const CONF_STYLE = {
  'ודאי': { background: '#dcfce7', color: '#15803d', top: '#16a34a' },
  'סביר': { background: '#dbeafe', color: '#1d4ed8', top: '#2563eb' },
  'לבדיקה': { background: '#ffedd5', color: '#c2410c', top: '#ea580c' },
  'ללא התאמה': { background: '#f3f4f6', color: '#4b5563', top: '#9ca3af' },
};
const DECISION_LABELS = { approved: 'אושר', rejected: 'נדחה', corrected: 'תוקן' };
const DECISION_STYLE = { approved: '#15803d', rejected: '#b91c1c', corrected: '#7c3aed' };
const COLUMNS = [
  ['lk_sku', 'מק"ט ל.כ'], ['lk_desc', 'תיאור ל.כ'], ['lk_dept', 'מחלקה'], ['comp_sku', 'מק"ט מתחרה'],
  ['comp_desc', 'תיאור מתחרה'], ['comp_brand', 'מותג'], ['confidence', 'רמת ביטחון'], ['notes', 'הערות'],
  ['catalog_page', 'עמוד'], ['comp_price', 'מחיר מחירון'],
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

// "ממתין להחלטה" = יש התאמה מהמנוע ועוד לא הוחלט עליה
const isPending = (r) => r.confidence !== 'ללא התאמה' && !r.decision;

export default function SkuComparePage() {
  return (
    <Layout permission="skucompare.view">
      <SkuCompare />
    </Layout>
  );
}

function SkuCompare() {
  const router = useRouter();
  const me = useMe();
  const canDecide = can(me, 'skucompare.decide');
  const [rows, setRows] = useState([]);
  const [lastUpload, setLastUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [confidence, setConfidence] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [marked, setMarked] = useState(() => new Set());
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [fixRow, setFixRow] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/sku-compare')
      .then((res) => res.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setRows(d.rows);
        setLastUpload(d.lastUpload);
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false));
  }, []);

  const deptOptions = useMemo(() => [...new Set(rows.map((r) => r.lk_dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [rows]);

  const counts = useMemo(() => {
    const c = { pending: 0 };
    CONFIDENCES.forEach((k) => { c[k] = 0; });
    rows.forEach((r) => { c[r.confidence] = (c[r.confidence] || 0) + 1; if (isPending(r)) c.pending += 1; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (onlyMarked && !marked.has(r.lk_sku)) return false;
      if (dept && r.lk_dept !== dept) return false;
      if (confidence && r.confidence !== confidence) return false;
      if (decisionFilter === 'none' && !isPending(r)) return false;
      if (decisionFilter && decisionFilter !== 'none' && r.decision !== decisionFilter) return false;
      if (q) {
        const hay = [r.lk_sku, r.lk_desc, r.comp_sku, r.corrected_sku, r.comp_desc, r.comp_brand, r.notes, r.decision_note]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'he', { numeric: true }) * dir;
      });
    }
    return out;
  }, [rows, search, dept, confidence, decisionFilter, onlyMarked, marked, sortKey, sortDir]);

  // כל שינוי בסינון/מיון מחזיר לעמוד הראשון
  useEffect(() => { setPage(0); }, [search, dept, confidence, decisionFilter, onlyMarked, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const allPageMarked = pageRows.length > 0 && pageRows.every((r) => marked.has(r.lk_sku));

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleMark(lkSku) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(lkSku)) next.delete(lkSku); else next.add(lkSku);
      return next;
    });
  }

  function togglePageMarks() {
    setMarked((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => (allPageMarked ? next.delete(r.lk_sku) : next.add(r.lk_sku)));
      return next;
    });
  }

  function clearMarks() {
    setMarked(new Set());
    setOnlyMarked(false);
  }

  function resetFilters() {
    setSearch(''); setDept(''); setConfidence(''); setDecisionFilter(''); setOnlyMarked(false); setSortKey(null);
  }

  function onKpiClick(key) {
    if (key === 'pending') { setDecisionFilter('none'); setConfidence(''); return; }
    setConfidence((cur) => (cur === key ? '' : key));
  }

  async function saveDecision(lkSku, decision, correctedSku, note) {
    const res = await fetch('/api/dashboard/sku-compare-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lkSku, decision, correctedSku, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'שגיאה בשמירה'); return false; }
    setRows((prev) => prev.map((r) => (r.lk_sku !== lkSku ? r : {
      ...r,
      decision: data.decision,
      corrected_sku: data.decision ? data.corrected_sku : null,
      decision_note: data.decision ? data.decision_note : null,
      decided_at: data.decision ? data.decided_at : null,
      decided_by_name: data.decision ? data.decided_by_name : null,
    })));
    return true;
  }

  // מסומנים -> רק הם. לא סומן כלום -> כל מה שמוצג כרגע בטבלה (בלי סינון = כל הטבלה).
  async function exportExcel() {
    const lkSkus = marked.size > 0 ? Array.from(marked) : filtered.map((r) => r.lk_sku);
    if (lkSkus.length === 0) { alert('אין שורות לייצוא'); return; }
    setExporting(true);
    try {
      const res = await fetch('/api/dashboard/sku-compare-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lkSkus }),
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
      a.download = `sku-compare-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  }

  const exportLabel = marked.size > 0 ? `ייצוא ${marked.size} מסומנים לאקסל` : `ייצוא לאקסל (${filtered.length.toLocaleString('he-IL')} שורות)`;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>השוואת מק"טים</h1>
          <p style={styles.subtext}>
            {lastUpload
              ? `קטלוג ל.כ מול קטלוג מתחרים · קובץ אחרון: ${lastUpload.filename} · הועלה ${fmtDate(lastUpload.uploaded_at)}${lastUpload.uploaded_by_name ? ` ע"י ${lastUpload.uploaded_by_name}` : ''}`
              : 'קטלוג ל.כ מול קטלוג מתחרים'}
          </p>
        </div>
        <IfCan permission="skucompare.upload">
          <button onClick={() => router.push('/dashboard/sku-compare-upload')} style={styles.uploadBtn}>
            ⬆ טעינת קבצים
          </button>
        </IfCan>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {!error && !loading && rows.length === 0 && (
        <div style={styles.card}>עדיין לא נטען קובץ תוצאות. יש לטעון את הקובץ שכלי ההשוואה מייצר דרך "טעינת קבצים".</div>
      )}

      {rows.length > 0 && (
        <>
          <div style={styles.kpiGrid}>
            {CONFIDENCES.map((k) => (
              <button key={k} onClick={() => onKpiClick(k)}
                style={{ ...styles.kpi, borderTopColor: CONF_STYLE[k].top, ...(confidence === k ? styles.kpiSel : {}) }}>
                <span style={styles.kpiLabel}>{k}</span>
                <span style={styles.kpiValue}>{counts[k].toLocaleString('he-IL')}</span>
              </button>
            ))}
            <button onClick={() => onKpiClick('pending')}
              style={{ ...styles.kpi, borderTopColor: '#111827', ...(decisionFilter === 'none' ? styles.kpiSel : {}) }}>
              <span style={styles.kpiLabel}>ממתינים להחלטה</span>
              <span style={styles.kpiValue}>{counts.pending.toLocaleString('he-IL')}</span>
            </button>
          </div>

          <div style={styles.card}>
            <div style={styles.filters}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='חיפוש חופשי: מק"ט, תיאור, הערה…' style={styles.search} />
              <select value={dept} onChange={(e) => setDept(e.target.value)} style={styles.select}>
                <option value="">כל המחלקות</option>
                {deptOptions.map((d) => <option key={d}>{d}</option>)}
              </select>
              <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={styles.select}>
                <option value="">כל רמות הביטחון</option>
                {CONFIDENCES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)} style={styles.select}>
                <option value="">כל ההחלטות</option>
                <option value="none">ממתין להחלטה</option>
                <option value="approved">אושר</option>
                <option value="rejected">נדחה</option>
                <option value="corrected">תוקן</option>
              </select>
              <button onClick={resetFilters} style={styles.resetBtn}>איפוס סינון</button>
            </div>

            <div style={styles.markBar}>
              <span style={styles.markCount}>{marked.size > 0 ? `${marked.size} מסומנים` : 'סמנו שורות בתיבה שבתחילת השורה'}</span>
              <button onClick={() => setOnlyMarked((v) => !v)} disabled={marked.size === 0 && !onlyMarked}
                style={onlyMarked ? styles.toggleOn : { ...styles.resetBtn, opacity: marked.size === 0 ? 0.5 : 1 }}>
                {onlyMarked ? '✓ מוצגים מסומנים בלבד' : 'הצג מסומנים בלבד'}
              </button>
              {marked.size > 0 && <button onClick={clearMarks} style={styles.resetBtn}>נקה סימונים</button>}
              <button onClick={exportExcel} disabled={exporting} style={styles.exportBtn}>
                {exporting ? 'מייצא…' : exportLabel}
              </button>
            </div>

            <div style={styles.tableScroll}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.thCheck}>
                      <input type="checkbox" checked={allPageMarked} onChange={togglePageMarks} title="סימון כל השורות בעמוד" />
                    </th>
                    {COLUMNS.map(([k, label]) => (
                      <th key={k} style={styles.th} onClick={() => toggleSort(k)}>
                        {label} <span style={styles.arrow}>{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </th>
                    ))}
                    <th style={{ ...styles.th, cursor: 'default' }}>החלטה</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <Row key={r.lk_sku} r={r} marked={marked.has(r.lk_sku)} onMark={() => toggleMark(r.lk_sku)}
                      canDecide={canDecide} onDecide={saveDecision} onFix={() => setFixRow(r)} />
                  ))}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + 2} style={styles.empty}>אין שורות שמתאימות לסינון</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={styles.footer}>
              <span>
                {filtered.length.toLocaleString('he-IL')} שורות
                {filtered.length > PAGE_SIZE && ` · מוצגות ${(page * PAGE_SIZE + 1).toLocaleString('he-IL')}–${Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString('he-IL')}`}
              </span>
              {pageCount > 1 && (
                <span style={styles.pager}>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={styles.resetBtn}>→ הקודם</button>
                  <span>עמוד {page + 1} מתוך {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={styles.resetBtn}>הבא ←</button>
                </span>
              )}
              <span style={{ color: '#9ca3af' }}>החלטה ידנית גוברת על תוצאת המנוע ונשמרת גם אחרי טעינת קובץ חדש</span>
            </div>
          </div>
        </>
      )}

      {fixRow && <FixModal row={fixRow} onClose={() => setFixRow(null)}
        onSave={async (sku, note) => { if (await saveDecision(fixRow.lk_sku, 'corrected', sku, note)) setFixRow(null); }} />}
    </div>
  );
}

function Row({ r, marked, onMark, canDecide, onDecide, onFix }) {
  const conf = CONF_STYLE[r.confidence] || CONF_STYLE['לבדיקה'];
  const noMatch = !r.comp_sku;
  return (
    <tr style={{ ...(r.decision === 'rejected' ? { opacity: 0.55 } : {}), ...(marked ? { background: '#fffbeb' } : {}) }}>
      <td style={styles.tdCheck}><input type="checkbox" checked={marked} onChange={onMark} /></td>
      <td style={{ ...styles.td, ...styles.sku }}>{r.lk_sku}</td>
      <td style={styles.tdWide}>{r.lk_desc}</td>
      <td style={styles.tdMid}>{r.lk_dept}</td>
      <td style={styles.td}>
        {r.decision === 'corrected' ? (
          <>
            <span style={styles.sku}>{r.corrected_sku}</span>
            {r.comp_sku && <span style={styles.orig}>{r.comp_sku} (מנוע)</span>}
          </>
        ) : <span style={styles.sku}>{r.comp_sku}</span>}
      </td>
      <td style={styles.tdWide}>{r.comp_desc}</td>
      <td style={styles.td}>{r.comp_brand}</td>
      <td style={styles.td}><span style={{ ...styles.badge, background: conf.background, color: conf.color }}>{r.confidence}</span></td>
      <td style={styles.tdNote}>{r.notes}</td>
      <td style={styles.td}>
        {r.catalog_page && <a href={`${CATALOG_URL}${r.catalog_page}/`} target="_blank" rel="noreferrer" style={styles.pageLink}>עמ' {r.catalog_page} ↗</a>}
      </td>
      <td style={styles.td}>{r.comp_price != null ? '₪' + r.comp_price.toLocaleString('he-IL') : ''}</td>
      <td style={styles.td}>
        {r.decision ? (
          <div style={styles.actions}>
            <span style={{ ...styles.badge, background: DECISION_STYLE[r.decision], color: '#fff' }}>{DECISION_LABELS[r.decision]}</span>
            {canDecide && <button onClick={() => onDecide(r.lk_sku, null)} style={{ ...styles.act, ...styles.actUndo }}>ביטול</button>}
            <span style={styles.who} title={r.decision_note || ''}>
              {[r.decided_by_name, fmtDate(r.decided_at)].filter(Boolean).join(' · ')}{r.decision_note ? ' · 💬' : ''}
            </span>
          </div>
        ) : canDecide ? (
          <div style={styles.actions}>
            {!noMatch && <button onClick={() => onDecide(r.lk_sku, 'approved')} style={{ ...styles.act, ...styles.actOk }}>✓ אישור</button>}
            {!noMatch && <button onClick={() => onDecide(r.lk_sku, 'rejected')} style={{ ...styles.act, ...styles.actRej }}>✗ דחייה</button>}
            <button onClick={onFix} style={{ ...styles.act, ...styles.actFix }}>{noMatch ? '✎ הזנת מק"ט' : '✎ תיקון'}</button>
          </div>
        ) : <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
    </tr>
  );
}

function FixModal({ row, onClose, onSave }) {
  const [sku, setSku] = useState(row.corrected_sku || '');
  const [note, setNote] = useState('');
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{row.comp_sku ? 'תיקון מק"ט מתחרה' : 'הזנת מק"ט מתחרה'}</h3>
        <div style={{ fontSize: 12.5, color: '#6b7280' }}>
          {row.lk_sku} · {row.lk_desc}{row.comp_sku ? ` (המנוע הציע: ${row.comp_sku})` : ''}
        </div>
        <label style={styles.modalLabel}>מק"ט נכון אצל המתחרה</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="למשל 012317" style={styles.modalInput} autoFocus />
        <label style={styles.modalLabel}>הערה (לא חובה)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={styles.modalInput} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => (sku.trim() ? onSave(sku.trim(), note) : alert('יש להזין מק"ט'))} style={styles.exportBtn}>שמירה</button>
          <button onClick={onClose} style={styles.resetBtn}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: -12 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  h1: { margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' },
  subtext: { margin: '2px 0 0', fontSize: 12.5, color: '#6b7280' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '14px 16px' },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderTop: '3px solid', borderRadius: 10, padding: '7px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'right', font: 'inherit', color: 'inherit' },
  kpiSel: { outline: '2px solid #111827' },
  kpiLabel: { fontSize: 12.5, color: '#6b7280', fontWeight: 600 },
  kpiValue: { fontSize: 19, fontWeight: 700 },
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  search: { flex: 1, minWidth: 220, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' },
  select: { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 150, background: '#fff' },
  resetBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#374151' },
  toggleOn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #111827', background: '#111827', cursor: 'pointer', color: '#fff', fontWeight: 600 },
  exportBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  markBar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' },
  markCount: { fontSize: 12.5, color: '#374151', fontWeight: 600, marginInlineEnd: 'auto' },
  tableScroll: { overflow: 'auto', maxHeight: 'calc(100vh - 300px)', minHeight: 320, marginTop: 10, border: '1px solid #f0f0f0', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 },
  th: { position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', textAlign: 'right', padding: '7px 8px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' },
  thCheck: { position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', padding: '7px 6px', borderBottom: '1px solid #e5e7eb', width: 28 },
  arrow: { color: '#d1d5db', fontSize: 10 },
  td: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', whiteSpace: 'nowrap' },
  tdCheck: { padding: '5px 6px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' },
  tdWide: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', minWidth: 110, maxWidth: 200 },
  tdMid: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', minWidth: 70, maxWidth: 100 },
  tdNote: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', minWidth: 100, maxWidth: 150, color: '#6b7280', fontSize: 11 },
  sku: { fontFamily: 'Consolas, monospace', fontWeight: 700 },
  orig: { display: 'block', textDecoration: 'line-through', color: '#9ca3af', fontSize: 11, fontWeight: 400 },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, whiteSpace: 'nowrap' },
  pageLink: { color: '#dc2626', fontWeight: 700, textDecoration: 'none' },
  actions: { display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },
  act: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 6px', lineHeight: '16px', cursor: 'pointer', border: '1px solid', background: '#fff' },
  actOk: { color: '#15803d', borderColor: '#86efac' },
  actRej: { color: '#b91c1c', borderColor: '#fca5a5' },
  actFix: { color: '#7c3aed', borderColor: '#c4b5fd' },
  actUndo: { color: '#6b7280', borderColor: '#d1d5db' },
  who: { fontSize: 10.5, color: '#9ca3af' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 24 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#6b7280', marginTop: 10 },
  pager: { display: 'flex', alignItems: 'center', gap: 8 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modalBox: { background: '#fff', borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw', direction: 'rtl', display: 'flex', flexDirection: 'column', gap: 10 },
  modalLabel: { fontSize: 12.5, color: '#374151', fontWeight: 600 },
  modalInput: { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'inherit', boxSizing: 'border-box' },
};
