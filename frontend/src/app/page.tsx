'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT_ADMIN') router.replace('/admin');
    else router.replace('/dashboard');
  }, [user, loading, router]);

  return <div className="empty">Loading NISMS…</div>;
}
