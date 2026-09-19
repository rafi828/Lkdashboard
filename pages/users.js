import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', manager_id: '', agent_code: '' });
  const [error, setError] = useState('');

  function load() {
    fetch('/api/users')
      .then((res) => res.json())
      .then((d) => (d.users ? setUsers(d.users) : setError(d.error)));
  }

  useEffect(load, []);

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
                  <button onClick={() => handleDelete(u.id)} style={styles.deleteBtn}>מחק</button>
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
  form: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd' },
  submitBtn: { fontSize: 13, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' },
};
