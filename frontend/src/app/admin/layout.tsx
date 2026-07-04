'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'SUPER_ADMIN' && user.role !== 'SUPPORT_ADMIN') router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading) return <div className="empty">Loading…</div>;
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'SUPPORT_ADMIN')) return null;

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">{children}</div>
    </div>
  );
}
