'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Skeleton, dateStr, money, termLabel } from '@/components/ui';
import { Icon, IconName } from '@/components/icons';

/**
 * The school's home screen. This is deliberately not a statistics dashboard:
 * it answers "what needs to be done today?" first, and only then reports the
 * roll figures. Every item below is derived from the school's real records —
 * nothing is shown unless it is true.
 */

interface Term { id: string; name: string; year: number; startDate: string; endDate: string; isActive: boolean }
interface ClassItem { id: string; name: string; _count?: { students: number } }
interface PendingAttendance { pending: Array<{ id: string; name: string; students: number }>; totalClasses: number }
interface Balances { totals: { expected: number; paid: number; outstanding: number }; balances: Array<{ balance: number }> }
interface Announcement { id: string; title: string; body: string; publishedAt: string | null; audience: string }

interface Task {
  id: string;
  icon: IconName;
  text: string;
  actionLabel: string;
  href: string;
  urgent?: boolean;
}

export default function SchoolHomePage() {
  const { user, school, schoolContext, hasFeature, hasRole } = useAuth();
  const [term, setTerm] = useState<Term | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roll, setRoll] = useState<{ students: number | null; teachers: number | null; classes: number | null }>({
    students: null,
    teachers: null,
    classes: null,
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const canSeeFees = hasRole('SCHOOL_ADMIN', 'PROPRIETOR', 'BURSAR', 'SECRETARY');
  const canTakeRegister = hasRole('SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER');
  const canSetUpAcademics = hasRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

  const build = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const found: Task[] = [];

    // Term is the spine of every school workflow — resolve it first.
    let activeTerm: Term | null = null;
    if (hasFeature('ACADEMICS')) {
      const terms = await api<Term[]>('/api/academics/terms').catch(() => [] as Term[]);
      activeTerm = terms.find((t) => t.isActive) ?? null;
      setTerm(activeTerm);
      if (!activeTerm && canSetUpAcademics) {
        found.push({
          id: 'no-term',
          icon: 'academics',
          text: 'No term is currently running. Fees, exams and reports are all recorded against a term.',
          actionLabel: 'Set up the term',
          href: '/dashboard/academics',
          urgent: true,
        });
      }
    }

    let classes: ClassItem[] = [];
    if (hasFeature('ACADEMICS')) {
      classes = await api<ClassItem[]>('/api/academics/classes').catch(() => [] as ClassItem[]);
      setRoll((r) => ({ ...r, classes: classes.length }));
      if (classes.length === 0 && canSetUpAcademics) {
        found.push({
          id: 'no-classes',
          icon: 'academics',
          text: 'No classes have been created yet. Students are admitted into a class.',
          actionLabel: 'Add classes',
          href: '/dashboard/academics',
          urgent: true,
        });
      }
    }

    if (hasFeature('STUDENTS')) {
      const students = await api<{ total: number }>('/api/students', { query: { pageSize: 1, status: 'ACTIVE' } }).catch(() => null);
      setRoll((r) => ({ ...r, students: students?.total ?? null }));
      if (students && students.total === 0 && classes.length > 0 && hasRole('SCHOOL_ADMIN', 'SECRETARY')) {
        found.push({
          id: 'no-students',
          icon: 'students',
          text: 'No students are on the roll yet.',
          actionLabel: 'Register a student',
          href: '/dashboard/students',
        });
      }
    }

    if (hasFeature('TEACHERS')) {
      const teachers = await api<{ total: number }>('/api/teachers', { query: { pageSize: 1, status: 'ACTIVE' } }).catch(() => null);
      setRoll((r) => ({ ...r, teachers: teachers?.total ?? null }));
    }

    // Today's registers — the daily rhythm of the school.
    if (hasFeature('ATTENDANCE') && canTakeRegister && classes.length > 0) {
      const att = await api<PendingAttendance>('/api/attendance/pending').catch(() => null);
      if (att && att.pending.length > 0) {
        found.push({
          id: 'attendance',
          icon: 'attendance',
          text:
            att.pending.length === att.totalClasses
              ? `Today's register has not been taken for any class.`
              : `Today's register is outstanding for ${att.pending.length} ${att.pending.length === 1 ? 'class' : 'classes'}: ${att.pending.map((c) => c.name).join(', ')}.`,
          actionLabel: 'Take the register',
          href: '/dashboard/attendance',
          urgent: true,
        });
      }
    }

    // Fees — only meaningful once a term exists.
    if (hasFeature('FEES') && canSeeFees && activeTerm) {
      const fees = await api<unknown[]>('/api/finance/fee-structures', { query: { termId: activeTerm.id } }).catch(() => [] as unknown[]);
      if (fees.length === 0 && classes.length > 0) {
        found.push({
          id: 'no-fees',
          icon: 'finance',
          text: `School fees have not been set for ${termLabel(activeTerm.name)} ${activeTerm.year}. Balances cannot be tracked until they are.`,
          actionLabel: 'Set school fees',
          href: '/dashboard/finance',
          urgent: true,
        });
      } else if (fees.length > 0) {
        const bal = await api<Balances>('/api/finance/balances', { query: { termId: activeTerm.id } }).catch(() => null);
        if (bal) {
          const owing = bal.balances.filter((b) => b.balance > 0).length;
          if (owing > 0) {
            found.push({
              id: 'balances',
              icon: 'finance',
              text: `${owing} ${owing === 1 ? 'student has' : 'students have'} unpaid fees for ${termLabel(activeTerm.name)}, totalling ${money(bal.totals.outstanding)}.`,
              actionLabel: 'Review balances',
              href: '/dashboard/finance',
            });
          }
        }
      }
    }

    setTasks(found);

    if (hasFeature('ANNOUNCEMENTS')) {
      const posts = await api<Announcement[]>('/api/announcements').catch(() => [] as Announcement[]);
      setAnnouncements(posts.filter((a) => a.publishedAt).slice(0, 4));
    }

    setLoading(false);
  }, [user, hasFeature, hasRole, canSeeFees, canTakeRegister, canSetUpAcademics]);

  useEffect(() => {
    void build();
  }, [build]);

  const branding = schoolContext ?? school;

  return (
    <>
      <div className="topbar">
        <h1>{branding?.name ?? 'School'}</h1>
        {term ? (
          <span className="muted">
            {termLabel(term.name)} {term.year} · ends {dateStr(term.endDate)}
          </span>
        ) : (
          !loading && <span className="muted">No term running</span>
        )}
      </div>

      <div className="content">
        <section>
          <h2 className="section-heading">Needs attention</h2>
          {loading ? (
            <div className="card task-list">
              {[0, 1].map((i) => (
                <div className="task" key={i}>
                  <Skeleton />
                </div>
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="card">
              <p className="muted">Nothing needs attention right now.</p>
            </div>
          ) : (
            <div className="card task-list">
              {tasks.map((t) => (
                <div className={`task${t.urgent ? ' task-urgent' : ''}`} key={t.id}>
                  <span className="task-icon">
                    <Icon name={t.icon} size={17} />
                  </span>
                  <p className="task-text">{t.text}</p>
                  <Link href={t.href} className="btn secondary small">
                    {t.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="section-heading">On the roll</h2>
          <div className="card roll">
            {hasFeature('STUDENTS') && (
              <div className="roll-item">
                <span className="roll-value">{loading ? <Skeleton className="skeleton-inline" /> : (roll.students ?? '—')}</span>
                <span className="roll-label">Students</span>
              </div>
            )}
            {hasFeature('TEACHERS') && (
              <div className="roll-item">
                <span className="roll-value">{loading ? <Skeleton className="skeleton-inline" /> : (roll.teachers ?? '—')}</span>
                <span className="roll-label">Teachers</span>
              </div>
            )}
            {hasFeature('ACADEMICS') && (
              <div className="roll-item">
                <span className="roll-value">{loading ? <Skeleton className="skeleton-inline" /> : (roll.classes ?? '—')}</span>
                <span className="roll-label">Classes</span>
              </div>
            )}
          </div>
        </section>

        {hasFeature('ANNOUNCEMENTS') && announcements.length > 0 && (
          <section>
            <h2 className="section-heading">Recent announcements</h2>
            <div className="card">
              <table className="table">
                <tbody>
                  {announcements.map((a) => (
                    <tr key={a.id}>
                      <td className="announcement-title">{a.title}</td>
                      <td className="muted">{a.body.length > 110 ? `${a.body.slice(0, 110)}…` : a.body}</td>
                      <td className="muted announcement-date">{dateStr(a.publishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
