'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Field, Modal, Stat, dateStr, money, useSubmit } from '@/components/ui';

interface ClassItem { id: string; name: string }
interface TermItem { id: string; name: string; year: number; isActive: boolean }
interface FeeStructure { id: string; amount: string; description?: string | null; class: ClassItem; term: TermItem }
interface PaymentRow {
  id: string; amount: string; paymentMethod: string; receiptNumber: string; referenceNumber?: string | null;
  paymentDate: string; student: { id: string; firstName: string; lastName: string; admissionNumber: string };
}
interface BalanceRow { student: { id: string; name: string; admissionNumber: string; class: string | null }; expected: number; paid: number; balance: number }

export default function FinancePage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<'payments' | 'balances' | 'fees'>('payments');
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  useEffect(() => {
    api<TermItem[]>('/api/academics/terms').then(setTerms).catch(() => {});
    api<ClassItem[]>('/api/academics/classes').then(setClasses).catch(() => {});
  }, []);

  const canWrite = hasRole('SCHOOL_ADMIN', 'BURSAR');

  return (
    <>
      <div className="topbar">
        <h1>Finance</h1>
      </div>
      <div className="content">
        <div className="tabs">
          <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>Payments</button>
          <button className={tab === 'balances' ? 'active' : ''} onClick={() => setTab('balances')}>Balances</button>
          <button className={tab === 'fees' ? 'active' : ''} onClick={() => setTab('fees')}>Fee structures</button>
        </div>
        {tab === 'payments' && <Payments canWrite={canWrite} />}
        {tab === 'balances' && <Balances terms={terms} classes={classes} />}
        {tab === 'fees' && <FeeStructures terms={terms} classes={classes} canWrite={canWrite} />}
      </div>
    </>
  );
}

function Payments({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showRecord, setShowRecord] = useState(false);

  const load = useCallback(() => {
    api<{ items: PaymentRow[]; total: number; totalAmount: string | number }>('/api/finance/payments', { query: { search, pageSize: 50 } })
      .then((d) => { setRows(d.items); setTotal(d.total); setTotalAmount(Number(d.totalAmount)); })
      .catch(() => {});
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar">
        <input placeholder="Search receipt, reference or student…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300 }} />
        <div className="spacer" />
        <span className="muted">{total} payments · {money(totalAmount)}</span>
        {canWrite && <button className="btn" onClick={() => setShowRecord(true)}>+ Record payment</button>}
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Receipt</th><th>Student</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.receiptNumber}</td>
                <td>{p.student.firstName} {p.student.lastName} <span className="muted">({p.student.admissionNumber})</span></td>
                <td>{money(Number(p.amount))}</td>
                <td><Badge tone="blue">{p.paymentMethod.replace(/_/g, ' ')}</Badge></td>
                <td className="muted">{p.referenceNumber ?? '—'}</td>
                <td className="muted">{dateStr(p.paymentDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No payments recorded yet.</div>}
        <p className="muted" style={{ marginTop: 10 }}>
          Payments are immutable — corrections are made via adjustments, never edits or deletions.
        </p>
      </div>
      <RecordPaymentModal open={showRecord} onClose={() => setShowRecord(false)} onSaved={load} />
    </>
  );
}

function RecordPaymentModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState<Array<{ id: string; firstName: string; lastName: string; admissionNumber: string }>>([]);
  const [form, setForm] = useState({ studentId: '', amount: '', paymentMethod: 'CASH', referenceNumber: '' });

  useEffect(() => {
    if (studentQuery.length < 2) { setStudents([]); return; }
    const t = setTimeout(() => {
      api<{ items: typeof students }>('/api/students', { query: { search: studentQuery, status: 'ACTIVE', pageSize: 8 } })
        .then((d) => setStudents(d.items))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [studentQuery]);

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/finance/payments', {
      method: 'POST',
      body: { ...form, amount: Number(form.amount), referenceNumber: form.referenceNumber || null },
    });
    onSaved(); onClose();
  });

  const selected = students.find((s) => s.id === form.studentId);

  return (
    <Modal title="Record payment" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Student (search by name or admission no)">
          <input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Type at least 2 characters…" />
        </Field>
        {students.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`btn small ${form.studentId === s.id ? '' : 'secondary'}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setForm({ ...form, studentId: s.id })}
              >
                {s.firstName} {s.lastName} — {s.admissionNumber}
              </button>
            ))}
          </div>
        )}
        {selected && <p className="success-text">Selected: {selected.firstName} {selected.lastName}</p>}
        <div className="form-row">
          <Field label="Amount (UGX)">
            <input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Field>
          <Field label="Method">
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="BANK">Bank</option>
            </select>
          </Field>
          <Field label="Reference (MM/bank)">
            <input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !form.studentId}>{busy ? 'Recording…' : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Balances({ terms, classes }: { terms: TermItem[]; classes: ClassItem[] }) {
  const active = terms.find((t) => t.isActive);
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<{ term: { name: string; year: number }; totals: { expected: number; paid: number; outstanding: number }; balances: BalanceRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const effectiveTerm = termId || active?.id;
    if (!effectiveTerm) return;
    api<typeof data>('/api/finance/balances', { query: { termId: effectiveTerm, classId } })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message));
  }, [termId, classId, active?.id]);

  return (
    <>
      <div className="toolbar">
        <select value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">{active ? `Active: ${active.name.replace(/_/g, ' ')} ${active.year}` : '— Select term —'}</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name.replace(/_/g, ' ')} {t.year}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {error && <p className="error-text">{error}</p>}
      {data && (
        <>
          <div className="grid grid-4">
            <Stat label="Expected" value={money(data.totals.expected)} />
            <Stat label="Collected" value={money(data.totals.paid)} />
            <Stat label="Outstanding" value={money(data.totals.outstanding)} />
          </div>
          <div className="card">
            <table className="table">
              <thead><tr><th>Student</th><th>Class</th><th>Expected</th><th>Paid</th><th>Balance</th></tr></thead>
              <tbody>
                {data.balances.map((b) => (
                  <tr key={b.student.id}>
                    <td style={{ fontWeight: 600 }}>{b.student.name} <span className="muted">({b.student.admissionNumber})</span></td>
                    <td>{b.student.class ?? '—'}</td>
                    <td>{money(b.expected)}</td>
                    <td>{money(b.paid)}</td>
                    <td style={{ color: b.balance > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {money(b.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.balances.length === 0 && <div className="empty">No active students found.</div>}
          </div>
        </>
      )}
    </>
  );
}

function FeeStructures({ terms, classes, canWrite }: { terms: TermItem[]; classes: ClassItem[]; canWrite: boolean }) {
  const [rows, setRows] = useState<FeeStructure[]>([]);
  const [showSet, setShowSet] = useState(false);

  const load = useCallback(() => {
    api<FeeStructure[]>('/api/finance/fee-structures').then(setRows).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar">
        <div className="spacer" />
        {canWrite && <button className="btn" onClick={() => setShowSet(true)}>+ Set fee structure</button>}
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Class</th><th>Term</th><th>Amount</th><th>Description</th></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600 }}>{f.class.name}</td>
                <td>{f.term.name.replace(/_/g, ' ')} {f.term.year}</td>
                <td>{money(Number(f.amount))}</td>
                <td className="muted">{f.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No fee structures set.</div>}
      </div>
      <SetFeeModal open={showSet} onClose={() => setShowSet(false)} onSaved={load} terms={terms} classes={classes} />
    </>
  );
}

function SetFeeModal({
  open, onClose, onSaved, terms, classes,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; terms: TermItem[]; classes: ClassItem[];
}) {
  const [form, setForm] = useState({ classId: '', termId: '', amount: '', description: '' });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/finance/fee-structures', {
      method: 'POST',
      body: { ...form, amount: Number(form.amount), description: form.description || null },
    });
    onSaved(); onClose();
  });
  return (
    <Modal title="Set fee structure" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Class">
            <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} required>
              <option value="">— Select —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Term">
            <select value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })} required>
              <option value="">— Select —</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name.replace(/_/g, ' ')} {t.year}</option>)}
            </select>
          </Field>
          <Field label="Amount (UGX)">
            <input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Field>
        </div>
        <Field label="Description">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. P4 tuition" />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
