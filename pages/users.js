import { Fragment, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { REPORTS, ROLE_LABELS } from '../lib/reports';

const AGENT_CODE_REQUIRED_MSG = 'לא ניתן לשמור משתמש מסוג "סוכן" בלי קוד סוכן. יש להזין לפחות קוד סוכן אחד.';
const REPORTS_WITH_PERMS = REPORTS.filter((r) => r.permissions.length > 0);
const EMPTY_FORM = { name: '', email: '', password: '', role: 'user', agent_codes: '', permission_template_id: '' };

function parseCodes(text) {
  return String(text || '').split(/[,\s]+/).filter(Boolean);
}

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'שגיאה בשמירה');
    return null;
  }
  return data;
}

export default function UsersPage() {
  return (
    <Layout adminOnly>
      <UsersManager />
    </Layout>
  );
}

function UsersManager() {
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [expanded, setExpanded] = useState(null); // userId שהחריגים שלו פתוחים
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function load() {
    fetch('/api/users')
      .then((res) => res.json())
      .then((d) => (d.users ? setUsers(d.users) : setError(d.error)));
    fetch('/api/permission-templates')
      .then((res) => res.json())
      .then((d) => d.templates && setTemplates(d.templates));
  }

  useEffect(load, []);

  const templateById = Object.fromEntries(templates.map((t) => [t.id, t]));

  async function updateUser(u, patch) {
    const nextRole = patch.role ?? u.role;
    const nextCodes = patch.agent_codes ?? u.agent_codes;
    if (nextRole === 'user' && nextCodes.length === 0) {
      alert(AGENT_CODE_REQUIRED_MSG);
      load();
      return;
    }
    await api(`/api/users/${u.id}`, 'PATCH', patch);
    load();
  }

  async function saveOverrides(u, overrides) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, overrides } : x)));
    await api(`/api/users/${u.id}/overrides`, 'PUT', { overrides });
  }

  async function handleResetPassword(u) {
    const password = prompt(`סיסמה זמנית חדשה עבור ${u.name} (לפחות 6 תווים):`);
    if (password === null) return;
    if (await api(`/api/users/${u.id}`, 'PATCH', { password })) {
      alert(`הסיסמה של ${u.name} עודכנה. יש למסור לו את הסיסמה הזמנית.`);
    }
  }

  async function handleResetTotp(u) {
    if (!confirm(`לאפס את Google Authenticator של ${u.name}?\nבכניסה הבאה הוא יתבקש לסרוק קוד QR חדש.`)) return;
    if (await api(`/api/users/${u.id}`, 'PATCH', { reset_totp: true })) {
      alert(`Google Authenticator של ${u.name} אופס.`);
    }
  }

  async function handleDelete(u) {
    if (!confirm(`למחוק את המשתמש ${u.name}?`)) return;
    await api(`/api/users/${u.id}`, 'DELETE');
    load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const codes = parseCodes(form.agent_codes);
    if (form.role === 'user' && codes.length === 0) {
      alert(AGENT_CODE_REQUIRED_MSG);
      return;
    }
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        agent_codes: codes,
        permission_template_id: form.permission_template_id ? Number(form.permission_template_id) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setForm(EMPTY_FORM);
    load();
  }

  return (
    <>
      <div>
        <h1 style={styles.h1}>ניהול משתמשים</h1>
        <p style={styles.subtext}>
          <b>אדמין</b> - רואה ומנהל הכל. <b>מנהל מכירות</b> - רואה את כל הנתונים, רק בדוחות שיש לו הרשאה אליהם.{' '}
          <b>סוכן</b> - רואה רק את הנתונים והלקוחות של קודי הסוכן שלו, רק בדוחות שיש לו הרשאה אליהם.
          <br />
          ההרשאות נקבעות לפי <b>תבנית הרשאה</b> (למטה), ואפשר להוסיף/להסיר הרשאה בודדת למשתמש דרך <b>חריגים</b>.
        </p>
      </div>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>שם</th>
              <th style={styles.th}>אימייל</th>
              <th style={styles.th}>תפקיד</th>
              <th style={styles.th}>קודי סוכן</th>
              <th style={styles.th}>תבנית הרשאה</th>
              <th style={styles.th}>חריגים</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const overrideCount = Object.keys(u.overrides || {}).length;
              const missingCode = u.role === 'user' && u.agent_codes.length === 0;
              return (
                <Fragment key={u.id}>
                  <tr>
                    <td style={styles.td}>{u.name}</td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>
                      <select value={u.role} onChange={(e) => updateUser(u, { role: e.target.value })} style={styles.smallSelect}>
                        {Object.entries(ROLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <input
                        key={`${u.id}-${u.agent_codes.join(',')}`}
                        defaultValue={u.agent_codes.join(', ')}
                        onBlur={(e) => {
                          const codes = parseCodes(e.target.value);
                          if (codes.join(',') !== u.agent_codes.join(',')) updateUser(u, { agent_codes: codes });
                        }}
                        style={{ ...styles.smallInput, ...(missingCode ? styles.inputWarn : {}) }}
                        placeholder="—"
                      />
                      {missingCode && <div style={styles.warn}>⚠️ סוכן בלי קוד סוכן</div>}
                    </td>
                    <td style={styles.td}>
                      {u.role === 'admin' ? (
                        <span style={styles.muted}>הכל (אדמין)</span>
                      ) : (
                        <select
                          value={u.permission_template_id ?? ''}
                          onChange={(e) => updateUser(u, { permission_template_id: e.target.value ? Number(e.target.value) : null })}
                          style={styles.smallSelect}
                        >
                          <option value="">ללא תבנית</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={styles.td}>
                      {u.role !== 'admin' && (
                        <button onClick={() => setExpanded(expanded === u.id ? null : u.id)} style={styles.resetBtn}>
                          {overrideCount > 0 ? `חריגים (${overrideCount})` : 'חריגים'} {expanded === u.id ? '▴' : '▾'}
                        </button>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => handleResetPassword(u)} style={styles.resetBtn}>איפוס סיסמה</button>
                        <button onClick={() => handleResetTotp(u)} style={styles.resetBtn}>איפוס Authenticator</button>
                        <button onClick={() => handleDelete(u)} style={styles.deleteBtn}>מחק</button>
                      </div>
                    </td>
                  </tr>
                  {expanded === u.id && u.role !== 'admin' && (
                    <tr>
                      <td colSpan={7} style={{ ...styles.td, background: '#fafafa' }}>
                        <OverridesEditor user={u} template={templateById[u.permission_template_id]} onSave={(o) => saveOverrides(u, o)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <TemplatesManager templates={templates} onChange={load} />

      <div style={styles.card}>
        <div style={styles.cardTitle}>הוספת משתמש</div>
        <form onSubmit={handleCreate} style={styles.form}>
          <input placeholder="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={styles.input} required />
          <input placeholder="אימייל" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={styles.input} required />
          <input placeholder="סיסמה" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={styles.input} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={styles.input}>
            {Object.entries(ROLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input
            placeholder={form.role === 'user' ? 'קודי סוכן (חובה) - למשל 101, 205' : 'קודי סוכן (אופציונלי)'}
            value={form.agent_codes}
            onChange={(e) => setForm({ ...form, agent_codes: e.target.value })}
            style={{ ...styles.input, minWidth: 220 }}
          />
          {form.role !== 'admin' && (
            <select value={form.permission_template_id} onChange={(e) => setForm({ ...form, permission_template_id: e.target.value })} style={styles.input}>
              <option value="">תבנית הרשאה: ללא</option>
              {templates.map((t) => <option key={t.id} value={t.id}>תבנית: {t.name}</option>)}
            </select>
          )}
          <button type="submit" style={styles.submitBtn}>הוסף</button>
        </form>
        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}
      </div>
    </>
  );
}

// חריגים למשתמש בודד: לכל הרשאה - "לפי התבנית" / "הוסף" / "הסר"
function OverridesEditor({ user, template, onSave }) {
  const templatePerms = new Set(template?.permissions || []);
  const overrides = user.overrides || {};

  function setOverride(key, value) {
    const next = { ...overrides };
    if (value === 'template') delete next[key];
    else next[key] = value === 'grant';
    onSave(next);
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        תבנית: <b>{template ? template.name : 'ללא תבנית'}</b>. חריג גובר על התבנית, רק עבור {user.name}.
      </div>
      <div style={styles.permGrid}>
        {REPORTS_WITH_PERMS.map((r) => (
          <div key={r.key} style={styles.permGroup}>
            <div style={styles.permGroupTitle}>{r.name}</div>
            {r.permissions.map((p) => {
              const ov = overrides[p.key];
              const value = ov === undefined ? 'template' : ov ? 'grant' : 'revoke';
              const effective = ov === undefined ? templatePerms.has(p.key) : ov;
              return (
                <div key={p.key} style={styles.permRow}>
                  <span style={{ color: effective ? '#15803d' : '#9ca3af', fontWeight: 700 }}>{effective ? '✓' : '✗'}</span>
                  <span style={{ flex: 1 }}>{p.label}</span>
                  <select value={value} onChange={(e) => setOverride(p.key, e.target.value)} style={{ ...styles.smallSelect, ...(value !== 'template' ? styles.selectOverride : {}) }}>
                    <option value="template">לפי התבנית ({templatePerms.has(p.key) ? 'כן' : 'לא'})</option>
                    <option value="grant">הוסף</option>
                    <option value="revoke">הסר</option>
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatesManager({ templates, onChange }) {
  const [newName, setNewName] = useState('');

  async function togglePerm(t, key) {
    const set = new Set(t.permissions);
    set.has(key) ? set.delete(key) : set.add(key);
    await api(`/api/permission-templates/${t.id}`, 'PUT', { permissions: Array.from(set) });
    onChange();
  }

  async function rename(t, name) {
    if (!name.trim() || name.trim() === t.name) return;
    await api(`/api/permission-templates/${t.id}`, 'PUT', { name });
    onChange();
  }

  async function remove(t) {
    if (!confirm(`למחוק את התבנית "${t.name}"?`)) return;
    await api(`/api/permission-templates/${t.id}`, 'DELETE');
    onChange();
  }

  async function create(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (await api('/api/permission-templates', 'POST', { name: newName, permissions: [] })) {
      setNewName('');
      onChange();
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>תבניות הרשאה</div>
      <p style={{ ...styles.subtext, marginBottom: 14 }}>
        שינוי בתבנית חל מיד על כל המשתמשים שמשויכים אליה. דוח חדש שיתווסף למערכת יופיע כאן אוטומטית.
      </p>

      {templates.length === 0 && <div style={styles.muted}>עדיין אין תבניות. צור תבנית ראשונה למטה.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {templates.map((t) => (
          <div key={t.id} style={styles.templateBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input key={t.name} defaultValue={t.name} onBlur={(e) => rename(t, e.target.value)} style={{ ...styles.input, fontWeight: 700 }} />
              <span style={styles.muted}>{t.user_count} משתמשים</span>
              <button onClick={() => remove(t)} style={{ ...styles.deleteBtn, marginInlineStart: 'auto' }}>מחק תבנית</button>
            </div>
            <div style={styles.permGrid}>
              {REPORTS_WITH_PERMS.map((r) => (
                <div key={r.key} style={styles.permGroup}>
                  <div style={styles.permGroupTitle}>{r.name}</div>
                  {r.permissions.map((p) => (
                    <label key={p.key} style={styles.permCheck}>
                      <input type="checkbox" checked={t.permissions.includes(p.key)} onChange={() => togglePerm(t, p.key)} />
                      {p.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={create} style={{ ...styles.form, marginTop: 14 }}>
        <input placeholder="שם תבנית חדשה (למשל: סוכן שטח)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ ...styles.input, minWidth: 260 }} />
        <button type="submit" style={styles.submitBtn}>צור תבנית</button>
      </form>
    </div>
  );
}

const styles = {
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280', maxWidth: 820, lineHeight: 1.7 },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20 },
  cardTitle: { fontWeight: 700, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'right', padding: '8px 10px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #eee' },
  td: { textAlign: 'right', padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f5f5f5', verticalAlign: 'top' },
  muted: { fontSize: 11.5, color: '#9ca3af' },
  smallSelect: { fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' },
  selectOverride: { borderColor: '#f59e0b', background: '#fffbeb' },
  smallInput: { fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd', width: 110 },
  inputWarn: { borderColor: '#f59e0b', background: '#fffbeb' },
  warn: { fontSize: 10.5, color: '#b45309', marginTop: 3 },
  deleteBtn: { fontSize: 12, color: '#dc2626', background: 'transparent', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  resetBtn: { fontSize: 12, color: '#374151', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  permGrid: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  permGroup: { border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', minWidth: 240, background: '#fff' },
  permGroupTitle: { fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: 6 },
  permCheck: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer', padding: '3px 0' },
  permRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', padding: '3px 0' },
  templateBox: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, background: '#fafafa' },
  form: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd' },
  submitBtn: { fontSize: 13, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' },
};
