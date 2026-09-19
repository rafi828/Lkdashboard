import { useEffect } from 'react';
import { useRouter } from 'next/router';

// דף legacy - מפנה לדשבורד היעדים החדש (השלד המקורי עם "sales" table נשאר ב-API כדוגמה בלבד)
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/targets');
  }, [router]);
  return null;
}
