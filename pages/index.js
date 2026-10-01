import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/home'); // לא מחובר -> Layout בדף הבית מעביר ל-login
  }, [router]);
  return null;
}
