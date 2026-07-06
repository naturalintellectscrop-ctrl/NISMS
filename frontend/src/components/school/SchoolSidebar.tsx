'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, Role } from '@/lib/auth';

/**
 * Application B navigation. School staff only see their school's modules —
 * no platform terminology, ever. Feature flags hide locked modules; the
 * backend independently enforces access.
 */
interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: string;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/dashboard/students', label: 'Students', icon: '🎓', feature: 'STUDENTS' },
  { href: '/dashboard/teachers', label: 'Teachers', icon: '👤', feature: 'TEACHERS' },
  { href: '/dashboard/academics', label: 'Academics', icon: '📚', feature: 'ACADEMICS' },
  { href: '/dashboard/attendance', label: 'Attendance', icon: '✓', feature: 'ATTENDANCE' },
  { href: '/dashboard/exams', label: 'Exams & Reports', icon: '📝', feature: 'ACADEMICS' },
  {
    href: '/dashboard/finance',
    label: 'Finance',
    icon: '💰',
    feature: 'FEES',
    roles: ['SCHOOL_ADMIN', 'PROPRIETOR', 'BURSAR', 'SECRETARY'],
  },
  { href: '/dashboard/announcements', label: 'Announcements', icon: '📢', feature: 'ANNOUNCEMENTS' },
  {
    href: '/dashboard/cms',
    label: 'Website',
    icon: '🌐',
    feature: 'WEBSITE',
    roles: ['SCHOOL_ADMIN', 'SECRETARY', 'PROPRIETOR', 'HEAD_TEACHER'],
  },
  { href: '/dashboard/support', label: 'Help & Support', icon: '🎧' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙', roles: ['SCHOOL_ADMIN', 'PROPRIETOR'] },
];

export function SchoolSidebar() {
  const pathname = usePathname();
  const { user, school, schoolContext, hasFeature, hasRole, logout } = useAuth();
  if (!user) return null;

  const branding = schoolContext ?? school;

  const visible = (item: NavItem): boolean => {
    if (item.feature && !hasFeature(item.feature)) return false;
    if (item.roles && !hasRole(...item.roles)) return false;
    return true;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" style={{ maxHeight: 34, marginBottom: 6, display: 'block' }} />
        ) : null}
        {branding?.name ?? 'School Portal'}
        {branding?.settings?.motto && <small>{branding.settings.motto}</small>}
      </div>
      <nav>
        {NAV.filter(visible).map((item) => {
          const active = item.href === pathname || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
              {item.icon} <span>{item.label}</span>
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
