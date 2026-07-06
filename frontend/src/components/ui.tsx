'use client';

import { useState } from 'react';

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
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit, setError };
}

export function money(amount: number | string, currency = 'UGX'): string {
  return `${currency} ${Number(amount).toLocaleString()}`;
}

export function dateStr(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
