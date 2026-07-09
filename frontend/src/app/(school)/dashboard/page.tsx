'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Stat, StatSkeleton, dateStr, statusTone } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Paged<T> {
  items: T[];
  total: number;
}

export default function DashboardPage() {
  const { user, school, features, hasFeature } = useAuth();
  const [students, setStudents] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<number | null>(null);
  const [classes, setClasses] = useState<number | null>(null);
  const [outstanding, setOutstanding] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; body: string; publishedAt: string | null; audience: string }>>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const jobs: Promise<unknown>[] = [];
    if (hasFeature('STUDENTS')) {
      jobs.push(
        api<Paged<unknown>>('/api/students', { query: { pageSize: 1, status: 'ACTIVE' } })
          .then((d) => setStudents(d.total))
          .catch(() => setStudents(null))
      );
    }
    if (hasFeature('TEACHERS')) {
      jobs.push(
        api<Paged<unknown>>('/api/teachers', { query: { pageSize: 1, status: 'ACTIVE' } })
          .then((d) => setTeachers(d.total))
          .catch(() => setTeachers(null))
      );
    }
    if (hasFeature('ACADEMICS')) {
      jobs.push(
        api<unknown[]>('/api/academics/classes')
          .then((d) => setClasses(d.length))
          .catch(() => setClasses(null))
      );
    }
    if (hasFeature('FEES') && ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PROPRIETOR', 'BURSAR', 'SECRETARY'].includes(user.role)) {
      jobs.push(
        api<{ totals: { outstanding: number } }>('/api/finance/balances')
          .then((d) => setOutstanding(`UGX ${d.totals.outstanding.toLocaleString()}`))
          .catch(() => setOutstanding(null))
      );
    }
    if (hasFeature('ANNOUNCEMENTS')) {
      api<Array<{ id: string; title: string; body: string; publishedAt: string | null; audience: string }>>('/api/announcements')
        .then(setAnnouncements)
        .catch(() => setAnnouncements([]));
    }
    Promise.allSettled(jobs).then(() => setStatsLoading(false));
  }, [user, hasFeature]);

  return (
    <>
      <div className="topbar">
        <h1>Dashboard</h1>
        <span className="muted">{school?.name}</span>
      </div>
      <div className="content">
        {statsLoading ? (
          <StatSkeleton count={4} />
        ) : (
          <div className="grid grid-4">
            {hasFeature('STUDENTS') && <Stat label="Active Students" value={students ?? '—'} />}
            {hasFeature('TEACHERS') && <Stat label="Active Teachers" value={teachers ?? '—'} />}
            {hasFeature('ACADEMICS') && <Stat label="Classes" value={classes ?? '—'} />}
            {outstanding !== null && <Stat label="Outstanding Fees" value={outstanding} />}
          </div>
        )}

        {hasFeature('ANNOUNCEMENTS') && (
          <div className="card">
            <h2>Latest announcements</h2>
            {announcements.length === 0 ? (
              <div className="empty">No announcements yet.</div>
            ) : (
              <table className="table">
                <tbody>
                  {announcements.slice(0, 6).map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, width: '30%' }}>{a.title}</td>
                      <td className="muted">{a.body.length > 120 ? `${a.body.slice(0, 120)}…` : a.body}</td>
                      <td style={{ width: 120 }}>
                        <Badge tone={statusTone('OPEN')}>{a.audience}</Badge>
                      </td>
                      <td className="muted" style={{ width: 110 }}>
                        {dateStr(a.publishedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {features && (
          <div className="card">
            <h2>Your plan features</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(features).map(([key, enabled]) => (
                <Badge key={key} tone={enabled ? 'green' : 'gray'}>
                  <span className="badge-icon">
                    <Icon name={enabled ? 'check' : 'lock'} size={12} strokeWidth={2.5} />
                    {key.replace(/_/g, ' ')}
                  </span>
                </Badge>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              Locked modules aren&apos;t included in your school&apos;s current plan. Contact support to enable them.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
