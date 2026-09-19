import { useState } from 'react';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState('credentials'); // 'credentials' | 'setup' | 'verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState(null);
  const [pendingToken, setPendingToken] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'שגיאה בהתחברות');
        return;
      }
      setPendingToken(data.pendingToken);
      if (data.step === 'setup') {
        setQr(data.qr);
        setStep('setup');
      } else {
        setStep('verify');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/totp/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'קוד שגוי');
        return;
      }
      router.push('/dashboard/targets');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'setup' || step === 'verify') {
    return (
      <div style={styles.page}>
        <form onSubmit={handleCodeSubmit} style={styles.card}>
          <div style={styles.logoBlock}>
            <img src="/logos/lc-logo.png" alt="ל.כ כלי עבודה וציוד" style={styles.lcLogo} />
            <img src="/logos/roher-logo.png" alt="ROHER Tools" style={styles.roherLogo} />
          </div>
          <h1 style={styles.title}>אימות דו-שלבי</h1>

          {step === 'setup' ? (
            <>
              <p style={styles.text}>
                כניסה ראשונה - סרוק את הקוד עם אפליקציית <b>Google Authenticator</b> (או כל אפליקציית TOTP אחרת), ואז הקלד את הקוד בן 6 הספרות שמופיע בה.
              </p>
              {qr && <img src={qr} alt="QR code להגדרת Google Authenticator" style={styles.qr} />}
            </>
          ) : (
            <p style={styles.text}>הקלד את הקוד בן 6 הספרות מאפליקציית Google Authenticator.</p>
          )}

          <label style={styles.label}>קוד אימות</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ ...styles.input, textAlign: 'center', fontSize: 22, letterSpacing: 6 }}
            placeholder="000000"
            autoFocus
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'מאמת...' : 'אמת והתחבר'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleCredentialsSubmit} style={styles.card}>
        <div style={styles.logoBlock}>
          <img src="/logos/lc-logo.png" alt="ל.כ כלי עבודה וציוד" style={styles.lcLogo} />
          <img src="/logos/roher-logo.png" alt="ROHER Tools" style={styles.roherLogo} />
        </div>
        <h1 style={styles.title}>התחברות למערכת</h1>

        <label style={styles.label}>אימייל</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
        />

        <label style={styles.label}>סיסמה</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'מתחבר...' : 'התחבר'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f5f7',
    fontFamily: 'sans-serif',
    direction: 'rtl',
  },
  card: {
    background: '#fff',
    padding: 32,
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    width: 360,
  },
  title: { marginBottom: 16, fontSize: 20 },
  logoBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 20 },
  lcLogo: { height: 70, objectFit: 'contain' },
  roherLogo: { height: 34, objectFit: 'contain' },
  text: { fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 },
  qr: { display: 'block', margin: '0 auto 16px', width: 200, height: 200 },
  label: { display: 'block', marginTop: 12, marginBottom: 4, fontSize: 14, color: '#333' },
  input: {
    width: '100%',
    padding: 10,
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
    boxSizing: 'border-box',
  },
  button: {
    marginTop: 20,
    width: '100%',
    padding: 10,
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 15,
    cursor: 'pointer',
  },
  error: { color: '#dc2626', fontSize: 13, marginTop: 10 },
  hint: { marginTop: 16, fontSize: 12, color: '#888', lineHeight: 1.6 },
};
