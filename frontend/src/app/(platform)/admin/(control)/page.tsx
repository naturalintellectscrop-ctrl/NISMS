'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Stat, dateStr, money, statusTone } from '@/components/ui';

interface Analytics {
  schools: { byStatus: Record<string, number>; byPlan: Record<string, number> };
  revenue: { total: string | number; byMonth: Array<{ month: string; total: number }> };
  featureUsage: Record<string, number>;
  totals: { students: number; teachers: number; users: number; payments: number };
  recentActivity: Array<{ id: string; action: string; createdAt: string; user?: { email: string; role: string } | null }>;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Analytics>('/api/admin/analytics').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="content"><p className="error-text">{error}</p></div>;
  if (!data) return <div className="empty">Loading analytics…</div>;

  const totalSchools = Object.values(data.schools.byStatus).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="topbar">
        <h1>Natural Intellects — Platform Overview</h1>
      </div>
      <div className="content">
        <div className="grid grid-4">
          <Stat label="Schools" value={totalSchools} />
          <Stat label="Total Students" value={data.totals.students.toLocaleString()} />
          <Stat label="Total Teachers" value={data.totals.teachers.toLocaleString()} />
          <Stat label="Subscription Revenue" value={money(Number(data.revenue.total))} />
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h2>Schools by status</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(data.schools.byStatus).map(([status, count]) => (
                <Badge key={status} tone={statusTone(status)}>{status}: {count}</Badge>
              ))}
              {totalSchools === 0 && <span className="muted">No schools onboarded yet.</span>}
            </div>
            <h2 style={{ marginTop: 18 }}>Schools by plan</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(data.schools.byPlan).map(([plan, count]) => (
                <Badge key={plan} tone="blue">{plan}: {count}</Badge>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Feature adoption (enabled schools)</h2>
            <table className="table">
              <tbody>
                {Object.entries(data.featureUsage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([feature, count]) => (
                    <tr key={feature}>
                      <td>{feature.replace(/_/g, ' ')}</td>
                      <td style={{ width: 60, fontWeight: 600 }}>{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {Object.keys(data.featureUsage).length === 0 && <div className="empty">No feature data yet.</div>}
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h2>Revenue by month</h2>
            <table className="table">
              <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
              <tbody>
                {data.revenue.byMonth.map((r) => (
                  <tr key={r.month}>
                    <td>{r.month}</td>
                    <td>{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.revenue.byMonth.length === 0 && <div className="empty">No billing transactions yet.</div>}
          </div>

          <div className="card">
            <h2>Recent system activity</h2>
            <table className="table">
              <tbody>
                {data.recentActivity.slice(0, 12).map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.action.replace(/_/g, ' ')}</td>
                    <td className="muted">{a.user?.email ?? 'system'}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateStr(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.recentActivity.length === 0 && <div className="empty">No activity yet.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
