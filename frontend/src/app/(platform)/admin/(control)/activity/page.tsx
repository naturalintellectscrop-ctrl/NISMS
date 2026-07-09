'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EmptyState, TableSkeleton, dateStr } from '@/components/ui';

interface LogRow {
  id: string;
  schoolId?: string | null;
  action: string;
  entityType?: string | null;
  createdAt: string;
  user?: { email: string; role: string } | null;
}

export default function AdminActivityPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<LogRow[]>('/api/admin/audit-logs', { query: { action } }).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [action]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="topbar">
        <h1>System Activity Logs</h1>
        <input
          placeholder="Filter by action (e.g. PAYMENT)…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', width: 260 }}
        />
      </div>
      <div className="content">
        <div className="card">
          {loading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="activity"
              title={action ? 'No activity matches this filter.' : 'No activity logged yet.'}
              hint={action ? 'Try a different action keyword, or clear the filter.' : 'System and school actions will be recorded here.'}
            />
          ) : (
            <table className="table">
              <thead><tr><th>Action</th><th>Entity</th><th>User</th><th>Role</th><th>When</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.action.replace(/_/g, ' ')}</td>
                    <td className="muted">{r.entityType ?? '—'}</td>
                    <td>{r.user?.email ?? 'system'}</td>
                    <td className="muted">{r.user?.role.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="muted">{dateStr(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
