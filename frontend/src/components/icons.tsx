/**
 * Central icon registry. Every icon in NISMS resolves through this map so the
 * product uses one consistent set (Lucide) — screens reference icons by
 * semantic name, never by importing glyphs ad hoc.
 */
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Globe,
  GraduationCap,
  Headset,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  Megaphone,
  Plus,
  Search,
  Settings,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'academics'
  | 'attendance'
  | 'exams'
  | 'finance'
  | 'announcements'
  | 'website'
  | 'support'
  | 'settings'
  | 'schools'
  | 'tickets'
  | 'activity'
  | 'check'
  | 'lock'
  | 'classTeacher'
  | 'back'
  | 'prev'
  | 'next'
  | 'add'
  | 'search'
  | 'empty';

const REGISTRY: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  students: GraduationCap,
  teachers: Users,
  academics: BookOpen,
  attendance: CalendarCheck,
  exams: ClipboardList,
  finance: Wallet,
  announcements: Megaphone,
  website: Globe,
  support: Headset,
  settings: Settings,
  schools: Building2,
  tickets: LifeBuoy,
  activity: Activity,
  check: Check,
  lock: Lock,
  classTeacher: Star,
  back: ArrowLeft,
  prev: ChevronLeft,
  next: ChevronRight,
  add: Plus,
  search: Search,
  empty: Inbox,
};

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Glyph = REGISTRY[name];
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
