'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SchoolSidebar } from '@/components/school/SchoolSidebar';
import { TableSkeleton } from '@/components/ui';
import { useAuth, isPlatformUser } from '@/lib/auth';
import { getSchoolContext } from '@/lib/api';

/**
 * Application B shell (School Management System).
 * Admits: school-audience sessions, or platform staff with an open School
 * Context (rendered with an explicit context banner — they are never
 * "logged into" the school). Applies the school's own branding.
 */
export default function SchoolShell({ children }: { children: React.ReactNode }) {
  const { user, school, schoolContext, loading, exitSchoolContext } = useAuth();
  const router = useRouter();

  const platform = isPlatformUser(user);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Platform staff without a selected school belong in their own application.
    if (platform && !getSchoolContext()) router.replace('/admin');
  }, [user, loading, platform, router]);

  const branding = schoolContext ?? school;

  // Tenant branding: the school owns this interface.
  useEffect(() => {
    const settings = branding?.settings;
    const root = document.documentElement;
    if (settings?.primaryColor) root.style.setProperty('--primary', settings.primaryColor);
    if (settings?.secondaryColor) root.style.setProperty('--ink', settings.secondaryColor);
    return () => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ink');
    };
  }, [branding]);

  // Hold the shell's shape while the session resolves — no blank page, no shift.
  if (loading || !user || (platform && !schoolContext)) {
    return (
      <div className="shell">
        <aside className="sidebar" aria-hidden="true" />
        <div className="main">
          <div className="topbar" />
          <div className="page-loading">
            <div className="card"><TableSkeleton rows={5} cols={4} /></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <SchoolSidebar />
      <div className="main">
        {platform && schoolContext && (
          <div className="context-banner">
            <span>
              Viewing: <strong>{schoolContext.name}</strong> — you are signed in as {user.firstName} {user.lastName} (
              {user.role.replace(/_/g, ' ')})
            </span>
            <button type="button" className="btn secondary small" onClick={exitSchoolContext}>
              Exit school workspace
            </button>
          </div>
        )}
        {children}
        {branding?.settings?.footerText && <footer className="muted shell-footer">{branding.settings.footerText}</footer>}
      </div>
    </div>
  );
}
