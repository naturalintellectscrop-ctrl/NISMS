'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Icon, IconName } from '@/components/icons';

/**
 * Application A navigation — the Natural Intellects Control Center.
 * Permanently Natural Intellects branded; never rendered to school users.
 */
const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/admin', label: 'Overview', icon: 'dashboard' },
  { href: '/admin/schools', label: 'Schools', icon: 'schools' },
  { href: '/admin/tickets', label: 'Support Tickets', icon: 'tickets' },
  { href: '/admin/activity', label: 'Activity Logs', icon: 'activity' },
];

export function PlatformSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Natural Intellects
        <small>Control Center</small>
      </div>
      <nav>
        {NAV.map((item) => {
          const active = item.href === pathname || (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div style={{ color: '#fff', fontWeight: 600 }}>
          {user.firstName} {user.lastName}
        </div>
        <div style={{ fontSize: 11, marginBottom: 8 }}>{user.role.replace(/_/g, ' ')}</div>
        <button className="btn secondary small" onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
