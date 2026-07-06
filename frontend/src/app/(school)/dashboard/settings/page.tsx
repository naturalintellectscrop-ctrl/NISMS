'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Field, Modal, dateStr, statusTone, useSubmit } from '@/components/ui';

interface SchoolProfile {
  id: string;
  name: string;
  shortName: string;
  email: string;
  phone: string;
  address?: string | null;
  logoUrl?: string | null;
  subscription?: { planType: string; status: string; renewalDate: string } | null;
  settings?: {
    motto?: string | null;
    currency: string;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    footerText?: string | null;
  } | null;
}

interface UserRow {
  id: string; email: string; role: string; firstName: string; lastName: string;
  isActive: boolean; lastLoginAt?: string | null;
}

const SCHOOL_ROLES = ['SCHOOL_ADMIN', 'PROPRIETOR', 'HEAD_TEACHER', 'SECRETARY', 'BURSAR', 'TEACHER'];

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const [school, setSchool] = useState<SchoolProfile | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showUser, setShowUser] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<SchoolProfile>('/api/school').then(setSchool).catch(() => {});
    api<UserRow[]>('/api/auth/users').then(setUsers).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const { busy, error, submit } = useSubmit(async () => {
    if (!school) return;
    await api('/api/school', {
      method: 'PATCH',
      body: {
        name: school.name,
        email: school.email,
        phone: school.phone,
        address: school.address ?? undefined,
        logoUrl: school.logoUrl || null,
      },
    });
    await api('/api/school/settings', {
      method: 'PUT',
      body: {
        motto: school.settings?.motto ?? null,
        currency: school.settings?.currency ?? 'UGX',
        primaryColor: school.settings?.primaryColor ?? undefined,
        secondaryColor: school.settings?.secondaryColor ?? undefined,
        footerText: school.settings?.footerText ?? null,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  });

  const setSettings = (patch: Partial<NonNullable<SchoolProfile['settings']>>) =>
    setSchool((s) => (s ? { ...s, settings: { currency: 'UGX', ...s.settings, ...patch } } : s));

  if (!school) return <div className="empty">Loading…</div>;

  return (
    <>
      <div className="topbar">
        <h1>Settings</h1>
        {school.subscription && (
          <span>
            <Badge tone="blue">{school.subscription.planType} PLAN</Badge>{' '}
            <span className="muted">renews {dateStr(school.subscription.renewalDate)}</span>
          </span>
        )}
      </div>
      <div className="content">
        <div className="card">
          <h2>School profile</h2>
          <form onSubmit={submit}>
            <div className="form-row">
              <Field label="School name">
                <input value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input type="email" value={school.email} onChange={(e) => setSchool({ ...school, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input value={school.phone} onChange={(e) => setSchool({ ...school, phone: e.target.value })} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Address">
                <input value={school.address ?? ''} onChange={(e) => setSchool({ ...school, address: e.target.value })} />
              </Field>
              <Field label="Motto">
                <input value={school.settings?.motto ?? ''} onChange={(e) => setSettings({ motto: e.target.value })} />
              </Field>
              <Field label="Currency">
                <input value={school.settings?.currency ?? 'UGX'} onChange={(e) => setSettings({ currency: e.target.value })} />
              </Field>
            </div>

            <h2 style={{ marginTop: 10 }}>Branding</h2>
            <p className="muted" style={{ marginBottom: 10 }}>
              Your logo, colours and footer appear across your school&apos;s portal and website.
            </p>
            <div className="form-row">
              <Field label="Logo URL">
                <input
                  value={school.logoUrl ?? ''}
                  placeholder="https://…/logo.png"
                  onChange={(e) => setSchool({ ...school, logoUrl: e.target.value })}
                />
              </Field>
              <Field label="Primary colour">
                <input
                  type="color"
                  value={school.settings?.primaryColor ?? '#1D4ED8'}
                  onChange={(e) => setSettings({ primaryColor: e.target.value })}
                />
              </Field>
              <Field label="Secondary colour">
                <input
                  type="color"
                  value={school.settings?.secondaryColor ?? '#0F172A'}
                  onChange={(e) => setSettings({ secondaryColor: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Footer text">
              <input
                value={school.settings?.footerText ?? ''}
                placeholder="e.g. © St Mary's Secondary School — Kampala"
                onChange={(e) => setSettings({ footerText: e.target.value })}
              />
            </Field>
            {error && <p className="error-text">{error}</p>}
            {saved && <p className="success-text">Settings saved.</p>}
            {hasRole('SCHOOL_ADMIN') && <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}
          </form>
        </div>

        <div className="card">
          <h2>
            Staff accounts{' '}
            {hasRole('SCHOOL_ADMIN') && (
              <button className="btn small" style={{ float: 'right' }} onClick={() => setShowUser(true)}>
                + Create account
              </button>
            )}
          </h2>
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td><Badge tone="gray">{u.role.replace(/_/g, ' ')}</Badge></td>
                  <td><Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'ACTIVE' : 'DISABLED'}</Badge></td>
                  <td className="muted">{dateStr(u.lastLoginAt)}</td>
                  <td>
                    {hasRole('SCHOOL_ADMIN') && (
                      <button
                        className="btn secondary small"
                        onClick={() =>
                          api(`/api/auth/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }).then(load)
                        }
                      >
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreateUserModal open={showUser} onClose={() => setShowUser(false)} onSaved={load} />
    </>
  );
}

function CreateUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'TEACHER', firstName: '', lastName: '' });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/auth/users', { method: 'POST', body: form });
    onSaved(); onClose();
  });
  return (
    <Modal title="Create staff account" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="First name"><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></Field>
          <Field label="Last name"><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></Field>
        </div>
        <div className="form-row">
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {SCHOOL_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Temporary password (min 8 chars)">
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}
