'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { Icon, IconName } from '@/components/icons';

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue' | 'gray'; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function statusTone(status: string): 'green' | 'red' | 'amber' | 'blue' | 'gray' {
  const map: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'gray'> = {
    ACTIVE: 'green',
    PRESENT: 'green',
    PAID: 'green',
    RESOLVED: 'green',
    OPEN: 'blue',
    TRIAL: 'blue',
    IN_PROGRESS: 'amber',
    ON_LEAVE: 'amber',
    PENDING: 'amber',
    PAST_DUE: 'amber',
    SICK: 'amber',
    EXCUSED: 'gray',
    ABSENT: 'red',
    SUSPENDED: 'red',
    EXPIRED: 'red',
    OVERDUE: 'red',
    ARCHIVED: 'gray',
    CLOSED: 'gray',
    ENDED: 'gray',
    TRANSFERRED: 'gray',
    GRADUATED: 'blue',
  };
  return map[status] ?? 'gray';
}

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  // Children render inside the <label> so inputs are implicitly associated (a11y).
  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        {children}
      </label>
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  disabled,
  label = 'Toggle',
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${on ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-pressed={on ? 'true' : 'false'}
      aria-label={label}
      title={label}
    />
  );
}

/** Standard async submit wrapper: tracks busy + error state for small forms. */
export function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      // Surface field-level validation details, e.g. "email: Invalid email".
      if (err instanceof ApiError && Array.isArray(err.details) && err.details.length > 0) {
        const first = err.details[0] as { path?: string; message?: string };
        setError(first.message ? `${first.path ? `${first.path}: ` : ''}${first.message}` : err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit, setError };
}

/**
 * Empty state: explains why nothing is shown and offers the next action
 * (design standard — every empty page provides a clear action).
 */
export function EmptyState({
  title,
  hint,
  icon = 'empty',
  action,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name={icon} size={26} strokeWidth={1.75} />
      </span>
      <p className="empty-state-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {action && (
        <button type="button" className="btn" onClick={action.onClick}>
          <Icon name="add" size={16} />
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Skeleton placeholder rows for tables while data loads (no blank pages). */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table className="table" aria-hidden="true">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((__, c) => (
              <td key={c}>
                <span className="skeleton" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Skeleton grid for the stat row on dashboards. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat">
          <span className="skeleton skeleton-sm" />
          <span className="skeleton skeleton-lg" />
        </div>
      ))}
    </div>
  );
}

/** Consistent pagination control used across list screens. */
export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" className="btn secondary small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="prev" size={15} />
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="btn secondary small" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
        <Icon name="next" size={15} />
      </button>
    </div>
  );
}

export function money(amount: number | string, currency = 'UGX'): string {
  return `${currency} ${Number(amount).toLocaleString()}`;
}

export function dateStr(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
