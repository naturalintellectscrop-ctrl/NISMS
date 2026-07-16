'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, isPlatformUser } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (isPlatformUser(user)) router.replace('/admin');
    else router.replace('/dashboard');
  }, [user, loading, router]);

  // Routing decision only — nothing to show, and no flash of placeholder text.
  return null;
}
