'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Field, Modal, Stat, Toggle, dateStr, money, statusTone, useSubmit } from '@/components/ui';

interface SchoolDetail {
  id: string;
  name: string;
  shortName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  features: Record<string, boolean>;
  subscription?: {
    id: string;
    planType: string;
    status: string;
    renewalDate: string;
    amount: string;
    paymentStatus: string;
    transactions: Array<{ id: string; amount: string; description: string; createdAt: string }>;
  } | null;
  _count: { students: number; teachers: number; users: number; payments: number };
  recentActivity: Array<{ id: string; action: string; createdAt: string }>;
}

export default function AdminSchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole, enterSchoolContext } = useAuth();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBilling, setShowBilling] = useState(false);
  const isSuper = hasRole();

  const load = useCallback(() => {
    api<SchoolDetail>(`/api/admin/schools/${id}`)
      .then(setSchool)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="content"><p className="error-text">{error}</p></div>;
  if (!school) return <div className="empty">Loading…</div>;

  const toggleFeature = async (featureKey: string, isEnabled: boolean) => {
    await api(`/api/admin/schools/${school.id}/features`, { method: 'POST', body: { featureKey, isEnabled } });
    load();
  };

  const changePlan = async (planType: string) => {
    await api(`/api/admin/schools/${school.id}/plan`, { method: 'POST', body: { planType } });
    load();
  };

  const changeStatus = async (status: string) => {
    await api(`/api/admin/schools/${school.id}/status`, { method: 'POST', body: { status } });
    load();
  };

  return (
    <>
      <div className="topbar">
        <h1>
          {school.name} <Badge tone={statusTone(school.status)}>{school.status}</Badge>
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary small" onClick={() => router.push('/admin/schools')}>← Back</button>
          <button className="btn secondary small" onClick={() => enterSchoolContext(school.id)}>
            Open school workspace →
          </button>
          {isSuper && school.status !== 'SUSPENDED' && (
            <button className="btn danger small" onClick={() => void changeStatus('SUSPENDED')}>Suspend</button>
          )}
          {isSuper && school.status === 'SUSPENDED' && (
            <button className="btn small" onClick={() => void changeStatus('ACTIVE')}>Reactivate</button>
          )}
        </div>
      </div>
      <div className="content">
        <div className="grid grid-4">
          <Stat label="Students" value={school._count.students} />
          <Stat label="Teachers" value={school._count.teachers} />
          <Stat label="User accounts" value={school._count.users} />
          <Stat label="Payments recorded" value={school._count.payments} />
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h2>Subscription</h2>
            {school.subscription ? (
              <>
                <table className="table">
                  <tbody>
                    <tr>
                      <td className="muted">Plan</td>
                      <td>
                        {isSuper ? (
                          <select
                            value={school.subscription.planType}
                            onChange={(e) => void changePlan(e.target.value)}
                            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }}
                          >
                            <option value="STARTER">Starter</option>
                            <option value="PROFESSIONAL">Professional</option>
                            <option value="ENTERPRISE">Enterprise</option>
                          </select>
                        ) : (
                          <Badge tone="blue">{school.subscription.planType}</Badge>
                        )}
                      </td>
                    </tr>
                    <tr><td className="muted">Status</td><td><Badge tone={statusTone(school.subscription.status)}>{school.subscription.status}</Badge></td></tr>
                    <tr><td className="muted">Payment</td><td><Badge tone={statusTone(school.subscription.paymentStatus)}>{school.subscription.paymentStatus}</Badge></td></tr>
                    <tr><td className="muted">Renewal</td><td>{dateStr(school.subscription.renewalDate)}</td></tr>
                    <tr><td className="muted">Annual amount</td><td>{money(Number(school.subscription.amount))}</td></tr>
                  </tbody>
                </table>
                <p className="muted" style={{ margin: '10px 0' }}>
                  Changing the plan updates feature flags instantly — no code changes, data retained.
                </p>
                {isSuper && (
                  <button className="btn secondary small" onClick={() => setShowBilling(true)}>+ Record billing payment</button>
                )}
                {school.subscription.transactions.length > 0 && (
                  <table className="table" style={{ marginTop: 12 }}>
                    <thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
                    <tbody>
                      {school.subscription.transactions.map((t) => (
                        <tr key={t.id}>
                          <td className="muted">{dateStr(t.createdAt)}</td>
                          <td>{t.description}</td>
                          <td>{money(Number(t.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <div className="empty">No subscription record.</div>
            )}
          </div>

          <div className="card">
            <h2>Feature flags</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Toggles take effect immediately. Backend enforces on every request.
            </p>
            <table className="table">
              <tbody>
                {Object.entries(school.features).map(([key, enabled]) => (
                  <tr key={key}>
                    <td>{key.replace(/_/g, ' ')}</td>
                    <td style={{ width: 70, textAlign: 'right' }}>
                      <Toggle label={key} on={enabled} disabled={!isSuper} onChange={(next) => void toggleFeature(key, next)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          <table className="table">
            <tbody>
              {school.recentActivity.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.action.replace(/_/g, ' ')}</td>
                  <td className="muted" style={{ width: 140 }}>{dateStr(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {school.recentActivity.length === 0 && <div className="empty">No activity recorded.</div>}
        </div>
      </div>

      <BillingModal open={showBilling} onClose={() => setShowBilling(false)} schoolId={school.id} onSaved={load} />
    </>
  );
}

function BillingModal({ open, onClose, schoolId, onSaved }: { open: boolean; onClose: () => void; schoolId: string; onSaved: () => void }) {
  const [form, setForm] = useState({ amount: '', description: 'Annual subscription', reference: '' });
  const { busy, error, submit } = useSubmit(async () => {
    await api(`/api/admin/schools/${schoolId}/billing`, {
      method: 'POST',
      body: { amount: Number(form.amount), description: form.description, reference: form.reference || undefined },
    });
    onSaved(); onClose();
  });
  return (
    <Modal title="Record billing payment" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Amount (UGX)"><input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
          <Field label="Reference"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        </div>
        <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record'}</button>
        </div>
      </form>
    </Modal>
  );
}
