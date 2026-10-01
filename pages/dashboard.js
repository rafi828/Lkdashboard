import { useEffect } from 'react';
import { useRouter } from 'next/router';

// דף legacy - מפנה לדף הבית (שמעביר לדוח הראשון שיש למשתמש הרשאה אליו) (השלד המקורי עם "sales" table נשאר ב-API כדוגמה בלבד)
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/home');
  }, [router]);
  return null;
}
