'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformSidebar } from '@/components/platform/PlatformSidebar';
import { useAuth, isPlatformUser } from '@/lib/auth';

/**
 * Application A shell (Natural Intellects Control Center).
 * Platform-audience sessions only; school users are sent back to their own
 * application without learning what lives here.
 */
export default function PlatformShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/admin/login');
    else if (!isPlatformUser(user)) router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading) return <div className="empty">Loading…</div>;
  if (!user || !isPlatformUser(user)) return null;

  return (
    <div className="shell">
      <PlatformSidebar />
      <div className="main">{children}</div>
    </div>
  );
}
