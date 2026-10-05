import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout, { IfCan, useMe, can } from '../../components/Layout';

const CATALOG_URL = 'https://peledtech.com/catalog2024-25/';
const PAGE_SIZE = 100;
const SIG = 'סיגנט ללא התאמה';
const CONFIDENCES = ['ודאי', 'סביר', 'לבדיקה', 'ללא התאמה', SIG];
const CONF_STYLE = {
  'ודאי': { background: '#dcfce7', color: '#15803d' },
  'סביר': { background: '#dbeafe', color: '#1d4ed8' },
  'לבדיקה': { background: '#ffedd5', color: '#c2410c' },
  'ללא התאמה': { background: '#f3f4f6', color: '#4b5563' },
  [SIG]: { background: '#e5e7eb', color: '#374151' },
};
// ריבועי הסיכום: כל ריבוע = רמת ביטחון (+ מקור). לחיצה מסננת את הטבלה לפיו.
const KPIS = [
  { label: 'ודאי', confidence: 'ודאי', source: '', top: '#16a34a' },
  { label: 'סביר', confidence: 'סביר', source: '', top: '#2563eb' },
  { label: 'לבדיקה – מנוע', confidence: 'לבדיקה', source: 'engine', top: '#ea580c' },
  { label: 'לבדיקה – מרובי ברקודים', confidence: 'לבדיקה', source: 'barcodes', top: '#0d9488' },
  { label: 'ללא התאמה', confidence: 'ללא התאמה', source: '', top: '#9ca3af' },
  { label: SIG, confidence: SIG, source: '', top: '#6b7280' },
];
const SOURCE_LABELS = { engine: 'מנוע ההשוואה', barcodes: 'מרובי ברקודים' };
const DECISION_LABELS = { approved: 'אושר', rejected: 'נדחה', corrected: 'תוקן' };
const DECISION_STYLE = { approved: '#15803d', rejected: '#b91c1c', corrected: '#7c3aed' };
const IMPORT_STYLE = '#0d9488';
const COLUMNS = [
  ['lk_sku', 'מק"ט ל.כ'], ['lk_desc', 'תיאור ל.כ'], ['lk_dept', 'מחלקה'], ['comp_sku', 'מק"ט מתחרה'],
  ['comp_desc', 'תיאור מתחרה'], ['comp_brand', 'מותג'], ['confidence', 'רמת ביטחון'], ['notes', 'הערות'],
  ['catalog_page', 'עמוד'], ['comp_price', 'מחיר מחירון'],
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

// השוואת מק"טים בלי תלות באפסים בהתחלה (030210 = 30210) - כמו normSku ב-lib/sku-compare.js
const normSku = (sku) => String(sku ?? '').trim().replace(/^0+(?=.)/, '');

// המק"ט הסופי של שורת ל.כ אחרי ההחלטה הידנית (null = אין התאמה / נדחה)
const effectiveSku = (r) => (r.decision === 'corrected' ? r.corrected_sku : r.decision === 'rejected' ? null : r.comp_sku);

// "ממתין להחלטה" = יש התאמה (מהמנוע, או "לבדיקה" מהברקודים) ועוד לא הוחלט עליה. "יבוא ידני" ודאי לא ממתין.
const isPending = (r) => !r.isSig && r.confidence !== 'ללא התאמה' && !r.decision && r.import_kind !== 'sure';

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
  const [compItems, setCompItems] = useState([]);
  const [lastUpload, setLastUpload] = useState(null);
  const [lastBarcodes, setLastBarcodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [confidence, setConfidence] = useState('');
  const [source, setSource] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [marked, setMarked] = useState(() => new Set());
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [fixRow, setFixRow] = useState(null);
  const [assignRow, setAssignRow] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/sku-compare')
      .then((res) => res.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setRows(d.rows);
        setCompItems(d.compItems || []);
        setLastUpload(d.lastUpload);
        setLastBarcodes(d.lastBarcodes);
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false));
  }, []);

  const deptOptions = useMemo(() => [...new Set(rows.map((r) => r.lk_dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [rows]);

  const compMap = useMemo(() => new Map(compItems.map((c) => [normSku(c.comp_sku), c])), [compItems]);

  // שורות ל.כ (מק"ט מתוקן -> פרטי המתחרה של המק"ט המתוקן) + שורות "סיגנט ללא התאמה":
  // כל מק"ט מתחרה שלא משויך כרגע לאף פריט ל.כ. מחושב כאן, כך ששיוך מוריד את השורה מיד.
  const allRows = useMemo(() => {
    const lkRows = rows.map((r) => {
      const row = { ...r, key: r.lk_sku };
      if (r.decision === 'corrected') {
        const c = compMap.get(normSku(r.corrected_sku));
        Object.assign(row, {
          comp_desc: c?.comp_desc || null, comp_brand: c?.comp_brand || null,
          catalog_page: c?.catalog_page || null, comp_price: c?.comp_price ?? null,
        });
      }
      return row;
    });
    const used = new Set(rows.map(effectiveSku).filter(Boolean).map(normSku));
    const sigRows = compItems.filter((c) => !used.has(normSku(c.comp_sku))).map((c) => ({
      ...c, key: `sig:${c.comp_sku}`, isSig: true, confidence: SIG, source: null,
    }));
    return lkRows.concat(sigRows);
  }, [rows, compItems, compMap]);

  const counts = useMemo(() => {
    const kpi = KPIS.map((k) => allRows.filter((r) => r.confidence === k.confidence && (!k.source || r.source === k.source)).length);
    return { kpi, pending: allRows.filter(isPending).length };
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = allRows.filter((r) => {
      if (onlyMarked && !marked.has(r.key)) return false;
      if (dept && r.lk_dept !== dept) return false;
      if (confidence && r.confidence !== confidence) return false;
      if (source && r.source !== source) return false;
      if (decisionFilter === 'none' && !isPending(r)) return false;
      if (decisionFilter === 'import' && !(r.import_kind === 'sure' && !r.decision)) return false;
      if (decisionFilter && !['none', 'import'].includes(decisionFilter) && r.decision !== decisionFilter) return false;
      if (q) {
        const hay = [r.lk_sku, r.lk_desc, r.comp_sku, r.engine_comp_sku, r.corrected_sku, r.comp_desc, r.comp_brand, r.notes, r.decision_note]
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
  }, [allRows, search, dept, confidence, source, decisionFilter, onlyMarked, marked, sortKey, sortDir]);

  // כל שינוי בסינון/מיון מחזיר לעמוד הראשון
  useEffect(() => { setPage(0); }, [search, dept, confidence, source, decisionFilter, onlyMarked, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const allPageMarked = pageRows.length > 0 && pageRows.every((r) => marked.has(r.key));

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleMark(key) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function togglePageMarks() {
    setMarked((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => (allPageMarked ? next.delete(r.key) : next.add(r.key)));
      return next;
    });
  }

  function clearMarks() {
    setMarked(new Set());
    setOnlyMarked(false);
  }

  function resetFilters() {
    setSearch(''); setDept(''); setConfidence(''); setSource(''); setDecisionFilter(''); setOnlyMarked(false); setSortKey(null);
  }

  const kpiSelected = (k) => confidence === k.confidence && source === k.source;

  function onKpiClick(k) {
    if (k === 'pending') { setDecisionFilter('none'); setConfidence(''); setSource(''); return; }
    if (kpiSelected(k)) { setConfidence(''); setSource(''); return; }
    setConfidence(k.confidence); setSource(k.source); setDecisionFilter('');
  }

  // שיוך משורת "סיגנט ללא התאמה": נשמר כהחלטה "תוקן" על פריט ל.כ
  async function assignLk(sigRow, lkSkuInput, note) {
    const lkSku = lkSkuInput.trim();
    const lkRow = rows.find((r) => r.lk_sku === lkSku) || rows.find((r) => normSku(r.lk_sku) === normSku(lkSku));
    if (!lkRow) { alert(`מק"ט ל.כ ${lkSku} לא נמצא בדוח`); return false; }
    const current = effectiveSku(lkRow);
    if (current && !window.confirm(`לפריט ${lkRow.lk_sku} כבר משויך מק"ט ${current}. להחליף ל-${sigRow.comp_sku}?`)) return false;
    return saveDecision(lkRow.lk_sku, 'corrected', sigRow.comp_sku, note || 'שיוך משורת מתחרה ללא התאמה');
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
    const keys = marked.size > 0 ? Array.from(marked) : filtered.map((r) => r.key);
    if (keys.length === 0) { alert('אין שורות לייצוא'); return; }
    const lkSkus = keys.filter((k) => !k.startsWith('sig:'));
    const compSkus = keys.filter((k) => k.startsWith('sig:')).map((k) => k.slice(4));
    setExporting(true);
    try {
      const res = await fetch('/api/dashboard/sku-compare-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lkSkus, compSkus }),
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
            {lastBarcodes && ` · מרובי ברקודים: ${lastBarcodes.filename} (${fmtDate(lastBarcodes.uploaded_at)})`}
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
            {KPIS.map((k, i) => (
              <button key={k.label} onClick={() => onKpiClick(k)}
                style={{ ...styles.kpi, borderTopColor: k.top, ...(kpiSelected(k) ? styles.kpiSel : {}) }}>
                <span style={styles.kpiLabel}>{k.label}</span>
                <span style={styles.kpiValue}>{counts.kpi[i].toLocaleString('he-IL')}</span>
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
              <select value={source} onChange={(e) => setSource(e.target.value)} style={styles.select}>
                <option value="">כל המקורות</option>
                {Object.entries(SOURCE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)} style={styles.select}>
                <option value="">כל ההחלטות</option>
                <option value="none">ממתין להחלטה</option>
                <option value="import">יבוא ידני</option>
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
                  {pageRows.map((r) => (r.isSig ? (
                    <SigRow key={r.key} r={r} marked={marked.has(r.key)} onMark={() => toggleMark(r.key)}
                      canDecide={canDecide} onAssign={() => setAssignRow(r)} />
                  ) : (
                    <Row key={r.key} r={r} marked={marked.has(r.key)} onMark={() => toggleMark(r.key)}
                      canDecide={canDecide} onDecide={saveDecision} onFix={() => setFixRow(r)} />
                  )))}
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
              <span style={{ color: '#9ca3af' }}>החלטה ידנית גוברת על "מרובי ברקודים" ועל תוצאת המנוע, ונשמרת גם אחרי טעינת קובץ חדש</span>
            </div>
          </div>
        </>
      )}

      {fixRow && <FixModal row={fixRow} onClose={() => setFixRow(null)}
        onSave={async (sku, note) => { if (await saveDecision(fixRow.lk_sku, 'corrected', sku, note)) setFixRow(null); }} />}
      {assignRow && <AssignModal row={assignRow} onClose={() => setAssignRow(null)}
        onSave={async (lkSku, note) => { if (await assignLk(assignRow, lkSku, note)) setAssignRow(null); }} />}
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
            {r.comp_sku && <span style={styles.orig}>{r.comp_sku} ({r.source === 'barcodes' ? 'ברקודים' : 'מנוע'})</span>}
          </>
        ) : (
          <>
            <span style={styles.sku}>{r.comp_sku}</span>
            {r.source === 'barcodes' && r.engine_comp_sku && normSku(r.engine_comp_sku) !== normSku(r.comp_sku)
              && <span style={styles.orig}>{r.engine_comp_sku} (מנוע)</span>}
          </>
        )}
      </td>
      <td style={styles.tdWide}>{r.comp_desc}</td>
      <td style={styles.td}>{r.comp_brand}</td>
      <td style={styles.td}>
        <span style={{ ...styles.badge, background: conf.background, color: conf.color }}>{r.confidence}</span>
        {r.source === 'barcodes' && <span style={styles.chip}>מרובי ברקודים</span>}
      </td>
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
        ) : r.import_kind === 'sure' ? (
          <div style={styles.actions}>
            <span style={{ ...styles.badge, background: IMPORT_STYLE, color: '#fff' }}>יבוא ידני</span>
            {canDecide && <button onClick={() => onDecide(r.lk_sku, 'rejected')} style={{ ...styles.act, ...styles.actRej }}>✗ דחייה</button>}
            {canDecide && <button onClick={onFix} style={{ ...styles.act, ...styles.actFix }}>✎ תיקון</button>}
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

// שורת "סיגנט ללא התאמה": פריט מתחרה שאין לו פריט ל.כ משויך
function SigRow({ r, marked, onMark, canDecide, onAssign }) {
  const conf = CONF_STYLE[SIG];
  return (
    <tr style={{ background: marked ? '#fffbeb' : '#fafafa' }}>
      <td style={styles.tdCheck}><input type="checkbox" checked={marked} onChange={onMark} /></td>
      <td style={{ ...styles.td, color: '#9ca3af' }}>—</td>
      <td style={styles.tdWide} />
      <td style={styles.tdMid}>{r.category}</td>
      <td style={styles.td}><span style={styles.sku}>{r.comp_sku}</span></td>
      <td style={styles.tdWide}>{r.comp_desc}</td>
      <td style={styles.td}>{r.comp_brand}</td>
      <td style={styles.td}><span style={{ ...styles.badge, background: conf.background, color: conf.color }}>{SIG}</span></td>
      <td style={styles.tdNote} />
      <td style={styles.td}>
        {r.catalog_page && <a href={`${CATALOG_URL}${r.catalog_page}/`} target="_blank" rel="noreferrer" style={styles.pageLink}>עמ' {r.catalog_page} ↗</a>}
      </td>
      <td style={styles.td}>{r.comp_price != null ? '₪' + r.comp_price.toLocaleString('he-IL') : ''}</td>
      <td style={styles.td}>
        {canDecide ? <button onClick={onAssign} style={{ ...styles.act, ...styles.actLink }}>🔗 שיוך מק"ט ל.כ</button>
          : <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
    </tr>
  );
}

function AssignModal({ row, onClose, onSave }) {
  const [lkSku, setLkSku] = useState('');
  const [note, setNote] = useState('');
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16 }}>שיוך מק"ט ל.כ לפריט מתחרה</h3>
        <div style={{ fontSize: 12.5, color: '#6b7280' }}>{row.comp_sku} · {row.comp_desc}{row.comp_brand ? ` (${row.comp_brand})` : ''}</div>
        <label style={styles.modalLabel}>מק"ט ל.כ</label>
        <input value={lkSku} onChange={(e) => setLkSku(e.target.value)} placeholder="למשל 1021022" style={styles.modalInput} autoFocus />
        <label style={styles.modalLabel}>הערה (לא חובה)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={styles.modalInput} />
        <div style={{ fontSize: 11.5, color: '#6b7280' }}>יישמר כהחלטה "תוקן" על פריט ל.כ (גובר על המנוע ועל מרובי ברקודים), והשורה תצא מרשימת "{SIG}".</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => (lkSku.trim() ? onSave(lkSku, note) : alert('יש להזין מק"ט ל.כ'))} style={styles.exportBtn}>שמירה</button>
          <button onClick={onClose} style={styles.resetBtn}>ביטול</button>
        </div>
      </div>
    </div>
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
          {row.lk_sku} · {row.lk_desc}{row.comp_sku ? ` (${row.source === 'barcodes' ? 'מרובי ברקודים' : 'המנוע'}: ${row.comp_sku})` : ''}
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
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 8 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderTop: '3px solid', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'right', font: 'inherit', color: 'inherit' },
  kpiSel: { outline: '2px solid #111827' },
  kpiLabel: { fontSize: 11.5, color: '#6b7280', fontWeight: 600, lineHeight: 1.25 },
  kpiValue: { fontSize: 18, fontWeight: 700 },
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
  actLink: { color: '#0f766e', borderColor: '#5eead4' },
  chip: { display: 'block', width: 'fit-content', marginTop: 3, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#ccfbf1', color: '#0f766e' },
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
