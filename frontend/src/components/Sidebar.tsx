'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, Role } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: string; // feature flag key controlling visibility
  roles?: Role[]; // roles allowed to see it (besides SUPER_ADMIN)
}

const SCHOOL_NAV: NavItem[] = [
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
  { href: '/dashboard/support', label: 'Support', icon: '🎧' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙', roles: ['SCHOOL_ADMIN', 'PROPRIETOR'] },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: '▦' },
  { href: '/admin/schools', label: 'Schools', icon: '🏫' },
  { href: '/admin/tickets', label: 'Support Tickets', icon: '🎧' },
  { href: '/admin/activity', label: 'Activity Logs', icon: '🗒' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, school, hasFeature, logout } = useAuth();
  if (!user) return null;

  const isPlatform = user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT_ADMIN';

  const visible = (item: NavItem): boolean => {
    if (item.feature && !hasFeature(item.feature)) return false;
    if (item.roles && user.role !== 'SUPER_ADMIN' && !item.roles.includes(user.role)) return false;
    return true;
  };

  const renderLinks = (items: NavItem[]) =>
    items.filter(visible).map((item) => {
      const active = item.href === pathname || (item.href !== '/dashboard' && item.href !== '/admin' && pathname.startsWith(item.href));
      return (
        <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
          {item.icon} <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        NISMS
        <small>{isPlatform ? 'Natural Intellects Control Center' : (school?.name ?? 'School Portal')}</small>
      </div>
      <nav>
        {isPlatform && (
          <>
            <div className="nav-section">Control Center</div>
            {renderLinks(ADMIN_NAV)}
            <div className="nav-section">School View</div>
          </>
        )}
        {renderLinks(SCHOOL_NAV)}
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
