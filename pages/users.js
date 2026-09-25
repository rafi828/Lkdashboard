import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [topics, setTopics] = useState([]);
  const [userTopics, setUserTopics] = useState({}); // { [userId]: Set(topicId) }
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', manager_id: '', agent_code: '' });
  const [error, setError] = useState('');

  function load() {
    fetch('/api/users')
      .then((res) => res.json())
      .then((d) => {
        if (!d.users) return setError(d.error);
        setUsers(d.users);
        d.users.forEach((u) => {
          fetch(`/api/users/${u.id}/topics`)
            .then((res) => res.json())
            .then((td) => setUserTopics((prev) => ({ ...prev, [u.id]: new Set(td.topicIds || []) })));
        });
      });
  }

  useEffect(() => {
    fetch('/api/topics')
      .then((res) => res.json())
      .then((d) => d.topics && setTopics(d.topics));
    load();
  }, []);

  async function toggleTopic(userId, topicId) {
    const current = userTopics[userId] || new Set();
    const next = new Set(current);
    next.has(topicId) ? next.delete(topicId) : next.add(topicId);
    setUserTopics((prev) => ({ ...prev, [userId]: next }));
    await fetch(`/api/users/${userId}/topics`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicIds: Array.from(next) }),
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        agent_code: form.agent_code ? Number(form.agent_code) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setForm({ name: '', email: '', password: '', role: 'user', manager_id: '', agent_code: '' });
    load();
  }

  async function handleUpdate(id, patch) {
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function handleResetPassword(u) {
    const password = prompt(`סיסמה זמנית חדשה עבור ${u.name} (לפחות 6 תווים):`);
    if (password === null) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'שגיאה באיפוס הסיסמה');
    alert(`הסיסמה של ${u.name} עודכנה. יש למסור לו את הסיסמה הזמנית.`);
  }

  async function handleResetTotp(u) {
    if (!confirm(`לאפס את Google Authenticator של ${u.name}?\nבכניסה הבאה הוא יתבקש לסרוק קוד QR חדש.`)) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_totp: true }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'שגיאה באיפוס Authenticator');
    alert(`Google Authenticator של ${u.name} אופס.`);
  }

  async function handleDelete(id) {
    if (!confirm('למחוק את המשתמש?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <Layout>
      <div>
        <h1 style={styles.h1}>ניהול משתמשים</h1>
        <p style={styles.subtext}>
          תפקיד: Admin רואה הכל · Manager רואה את עצמו וכל מי שתחתיו (manager_id) · User רואה רק את הסוכן שלו (agent_code).
        </p>
      </div>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>שם</th>
              <th style={styles.th}>אימייל</th>
              <th style={styles.th}>תפקיד</th>
              <th style={styles.th}>מנהל (manager_id)</th>
              <th style={styles.th}>קוד סוכן</th>
              <th style={styles.th}>הרשאות נושא</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={styles.td}>{u.name}</td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>
                  <select value={u.role} onChange={(e) => handleUpdate(u.id, { role: e.target.value })} style={styles.smallSelect}>
                    <option value="admin">admin</option>
                    <option value="manager">manager</option>
                    <option value="user">user</option>
                  </select>
                </td>
                <td style={styles.td}>
                  <input
                    defaultValue={u.manager_id ?? ''}
                    onBlur={(e) => handleUpdate(u.id, { manager_id: e.target.value ? Number(e.target.value) : null })}
                    style={styles.smallInput}
                    placeholder="id"
                  />
                </td>
                <td style={styles.td}>
                  <input
                    defaultValue={u.agent_code ?? ''}
                    onBlur={(e) => handleUpdate(u.id, { agent_code: e.target.value ? Number(e.target.value) : null })}
                    style={styles.smallInput}
                    placeholder="קוד סוכן"
                  />
                </td>
                <td style={styles.td}>
                  {u.role === 'admin' ? (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>הכל (Admin)</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {topics.map((t) => (
                        <label key={t.id} style={styles.topicCheck}>
                          <input
                            type="checkbox"
                            checked={userTopics[u.id]?.has(t.id) || false}
                            onChange={() => toggleTopic(u.id, t.id)}
                          />
                          {t.name}
                        </label>
                      ))}
                    </div>
                  )}
                </td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => handleResetPassword(u)} style={styles.resetBtn}>איפוס סיסמה</button>
                    <button onClick={() => handleResetTotp(u)} style={styles.resetBtn}>איפוס Authenticator</button>
                    <button onClick={() => handleDelete(u.id)} style={styles.deleteBtn}>מחק</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>הוספת משתמש</div>
        <form onSubmit={handleCreate} style={styles.form}>
          <input placeholder="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={styles.input} required />
          <input placeholder="אימייל" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={styles.input} required />
          <input placeholder="סיסמה" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={styles.input} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={styles.input}>
            <option value="admin">admin</option>
            <option value="manager">manager</option>
            <option value="user">user</option>
          </select>
          <input placeholder="manager_id (אופציונלי)" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} style={styles.input} />
          <input placeholder="קוד סוכן (אופציונלי)" value={form.agent_code} onChange={(e) => setForm({ ...form, agent_code: e.target.value })} style={styles.input} />
          <button type="submit" style={styles.submitBtn}>הוסף</button>
        </form>
        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}
      </div>
    </Layout>
  );
}

const styles = {
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280', maxWidth: 700 },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'right', padding: '8px 10px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #eee' },
  td: { textAlign: 'right', padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f5f5f5' },
  smallSelect: { fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' },
  smallInput: { fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd', width: 70 },
  deleteBtn: { fontSize: 12, color: '#dc2626', background: 'transparent', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  resetBtn: { fontSize: 12, color: '#374151', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  topicCheck: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#374151', cursor: 'pointer' },
  form: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd' },
  submitBtn: { fontSize: 13, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' },
};
