'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, EmptyState, Field, Modal, TableSkeleton, dateStr, statusTone, useSubmit } from '@/components/ui';
import { Icon } from '@/components/icons';

interface SchoolRow {
  id: string;
  name: string;
  shortName: string;
  email: string;
  status: string;
  createdAt: string;
  subscription?: { planType: string; status: string; renewalDate: string; paymentStatus: string } | null;
  _count: { students: number; teachers: number; users: number };
}

export default function AdminSchoolsPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<SchoolRow[]>('/api/admin/schools').then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="topbar">
        <h1>Schools</h1>
        {hasRole() && (
          <button className="btn icon-btn" onClick={() => setShowCreate(true)}>
            <Icon name="add" size={16} />
            Onboard school
          </button>
        )}
      </div>
      <div className="content">
        <div className="card">
          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="schools"
              title="No schools onboarded yet."
              hint={hasRole() ? 'Onboard your first school to create its workspace and administrator account.' : undefined}
              action={hasRole() ? { label: 'Onboard school', onClick: () => setShowCreate(true) } : undefined}
            />
          ) : (
            <table className="table">
              <thead>
                <tr><th>School</th><th>Plan</th><th>Students</th><th>Teachers</th><th>Users</th><th>Status</th><th>Renewal</th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => router.push(`/admin/schools/${s.id}`)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div className="muted">{s.shortName} · {s.email}</div>
                    </td>
                    <td><Badge tone="blue">{s.subscription?.planType ?? '—'}</Badge></td>
                    <td>{s._count.students}</td>
                    <td>{s._count.teachers}</td>
                    <td>{s._count.users}</td>
                    <td><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                    <td className="muted">{dateStr(s.subscription?.renewalDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <OnboardModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />
    </>
  );
}

function OnboardModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', shortName: '', email: '', phone: '', address: '', planType: 'STARTER',
    adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/admin/schools', {
      method: 'POST',
      body: {
        name: form.name,
        shortName: form.shortName,
        email: form.email,
        phone: form.phone,
        address: form.address || undefined,
        planType: form.planType,
        admin: {
          email: form.adminEmail,
          password: form.adminPassword,
          firstName: form.adminFirstName,
          lastName: form.adminLastName,
        },
      },
    });
    onSaved(); onClose();
  });

  return (
    <Modal title="Onboard a new school" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="School name"><input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
          <Field label="Short name (URL slug)"><input value={form.shortName} onChange={(e) => set('shortName', e.target.value.toLowerCase())} placeholder="st-marys" required /></Field>
        </div>
        <div className="form-row">
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
          <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></Field>
          <Field label="Plan">
            <select value={form.planType} onChange={(e) => set('planType', e.target.value)}>
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </Field>
        </div>
        <Field label="Address"><input value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
        <p className="muted" style={{ marginBottom: 8 }}>First school administrator account:</p>
        <div className="form-row">
          <Field label="First name"><input value={form.adminFirstName} onChange={(e) => set('adminFirstName', e.target.value)} required /></Field>
          <Field label="Last name"><input value={form.adminLastName} onChange={(e) => set('adminLastName', e.target.value)} required /></Field>
        </div>
        <div className="form-row">
          <Field label="Admin email"><input type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} required /></Field>
          <Field label="Admin password"><input type="password" value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} minLength={8} required /></Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Onboarding…' : 'Onboard school'}</button>
        </div>
      </form>
    </Modal>
  );
}
