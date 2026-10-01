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
      router.push('/home');
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
          {step === 'setup' ? (
            <>
              <h1 style={styles.title}>ברוך הבא! הגדרת כניסה מאובטחת</h1>
              <p style={styles.text}>
                זו הכניסה הראשונה שלך. כדי להגן על המידע, בכל כניסה תצטרך גם קוד מהטלפון.
                ההגדרה לוקחת כ-2 דקות ונעשית פעם אחת בלבד.
              </p>
              <ol style={styles.steps}>
                <SetupStep num={1} title="מתקינים את האפליקציה בטלפון">
                  פותחים בטלפון את <b>Google Play</b> (אנדרואיד) או <b>App Store</b> (אייפון), מחפשים{' '}
                  <b>Google Authenticator</b> ומתקינים. האפליקציה חינמית.
                </SetupStep>
                <SetupStep num={2} title="פותחים את האפליקציה ומוסיפים חשבון">
                  לוחצים על כפתור ה-<b>+</b> (בפינה למטה), ובוחרים <b>"סריקת קוד QR"</b>.
                  אם האפליקציה מבקשת גישה למצלמה - מאשרים.
                </SetupStep>
                <SetupStep num={3} title="סורקים את הברקוד שכאן">
                  מכוונים את מצלמת הטלפון לברקוד:
                  {qr && <img src={qr} alt="QR code להגדרת Google Authenticator" style={styles.qr} />}
                  באפליקציה תופיע שורה חדשה בשם <b>דשבורד ל.כ</b> עם <b>קוד בן 6 ספרות</b>, שמתחלף כל 30 שניות.
                </SetupStep>
                <SetupStep num={4} title='מקלידים את הקוד ולוחצים "אמת והתחבר"'>
                  מקלידים למטה את 6 הספרות שמופיעות כרגע באפליקציה. אם הקוד התחלף בזמן ההקלדה - פשוט מקלידים את החדש.
                </SetupStep>
              </ol>
            </>
          ) : (
            <>
              <h1 style={styles.title}>אימות דו-שלבי</h1>
              <p style={styles.text}>
                פתח בטלפון את אפליקציית <b>Google Authenticator</b> והקלד את הקוד בן 6 הספרות שמופיע תחת <b>דשבורד ל.כ</b>.
              </p>
            </>
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

          {step === 'setup' && (
            <>
              <div style={styles.note}>
                <b style={styles.noteTitle}>איך מתחברים מעכשיו והלאה?</b>
                1. נכנסים לאתר ומקלידים אימייל וסיסמה, כרגיל.<br />
                2. פותחים בטלפון את Google Authenticator ומקלידים את הקוד בן 6 הספרות שמופיע תחת "דשבורד ל.כ".<br />
                אין צורך לסרוק שוב - הסריקה היא פעם אחת בלבד.
              </div>
              <div style={{ ...styles.note, background: '#f9fafb', borderColor: '#e5e7eb' }}>
                <b style={styles.noteTitle}>אם משהו לא עובד</b>
                • "קוד שגוי" - בדוק שהשעה בטלפון מוגדרת אוטומטית, ונסה את הקוד הבא.<br />
                • "נגמר הזמן" - יש 5 דקות להשלים את ההגדרה. אם עבר יותר - מתחברים שוב עם אימייל וסיסמה, והברקוד יופיע מחדש.<br />
                • החלפת טלפון או מחקת את האפליקציה - פנה למנהל המערכת לאיפוס.
              </div>
            </>
          )}
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

        <p style={styles.forgot}>שכחת סיסמה או החלפת טלפון? פנה למנהל המערכת לאיפוס.</p>
      </form>
    </div>
  );
}

function SetupStep({ num, title, children }) {
  return (
    <li style={styles.step}>
      <span style={styles.stepNum}>{num}</span>
      <div style={{ flex: 1 }}>
        <div style={styles.stepTitle}>{title}</div>
        <div style={styles.stepBody}>{children}</div>
      </div>
    </li>
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
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  card: {
    background: '#fff',
    padding: 32,
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
  },
  title: { marginBottom: 16, fontSize: 20 },
  logoBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 20 },
  lcLogo: { height: 70, objectFit: 'contain' },
  roherLogo: { height: 34, objectFit: 'contain' },
  text: { fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 },
  forgot: { marginTop: 14, marginBottom: 0, fontSize: 12, color: '#6b7280', textAlign: 'center' },
  qr: { display: 'block', margin: '8px auto', width: 180, height: 180 },
  steps: { listStyle: 'none', padding: 0, margin: '0 0 6px', display: 'flex', flexDirection: 'column', gap: 10 },
  step: { display: 'flex', gap: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' },
  stepNum: { flex: '0 0 24px', height: 24, borderRadius: '50%', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 3 },
  stepBody: { fontSize: 12.5, color: '#555', lineHeight: 1.65 },
  note: { marginTop: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.7, color: '#374151' },
  noteTitle: { display: 'block', marginBottom: 2, color: '#111827' },
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
