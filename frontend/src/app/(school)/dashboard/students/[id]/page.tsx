'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Field, Modal, Stat, StatSkeleton, TableSkeleton, dateStr, money, statusTone, useSubmit } from '@/components/ui';
import { Icon } from '@/components/icons';

interface StudentProfile {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  nationality?: string | null;
  religion?: string | null;
  admissionDate: string;
  status: string;
  archiveReason?: string | null;
  class?: { name: string } | null;
  stream?: { name: string } | null;
  guardians: Array<{ isPrimaryContact: boolean; guardian: { id: string; fullName: string; phoneNumber: string; relationship: string } }>;
  attendanceSummary: Record<string, number>;
  recentPayments: Array<{ id: string; amount: string; paymentMethod: string; receiptNumber: string; paymentDate: string }>;
  totalPaid: string | number;
  recentMarks: Array<{ id: string; score: string; grade?: string | null; subject: { name: string }; exam: { name: string; totalMarks: number } }>;
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuardian, setShowGuardian] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const load = useCallback(() => {
    api<StudentProfile>(`/api/students/${id}`)
      .then(setStudent)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="content"><p className="error-text">{error}</p></div>;
  if (!student) {
    return (
      <>
        <div className="topbar"><h1>Student</h1></div>
        <div className="page-loading">
          <StatSkeleton count={4} />
          <div className="card"><TableSkeleton rows={5} cols={2} /></div>
        </div>
      </>
    );
  }

  const name = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
  const canWrite = hasRole('SCHOOL_ADMIN', 'SECRETARY');

  return (
    <>
      <div className="topbar">
        <h1>
          {name} <Badge tone={statusTone(student.status)}>{student.status}</Badge>
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary small icon-btn" onClick={() => router.push('/dashboard/students')}>
            <Icon name="back" size={15} />
            Back
          </button>
          {canWrite && student.status === 'ACTIVE' && (
            <button className="btn danger small" onClick={() => setShowArchive(true)}>
              Archive / Transfer
            </button>
          )}
        </div>
      </div>
      <div className="content">
        <div className="grid grid-4">
          <Stat label="Admission No" value={student.admissionNumber} />
          <Stat label="Class" value={`${student.class?.name ?? '—'} ${student.stream?.name ?? ''}`} />
          <Stat label="Total Paid" value={money(Number(student.totalPaid))} />
          <Stat
            label="Attendance"
            value={`${student.attendanceSummary.PRESENT ?? 0}P / ${student.attendanceSummary.ABSENT ?? 0}A`}
          />
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h2>Personal information</h2>
            <table className="table">
              <tbody>
                <tr><td className="muted">Gender</td><td>{student.gender}</td></tr>
                <tr><td className="muted">Date of birth</td><td>{dateStr(student.dateOfBirth)}</td></tr>
                <tr><td className="muted">Nationality</td><td>{student.nationality ?? '—'}</td></tr>
                <tr><td className="muted">Religion</td><td>{student.religion ?? '—'}</td></tr>
                <tr><td className="muted">Admitted</td><td>{dateStr(student.admissionDate)}</td></tr>
                {student.archiveReason && (
                  <tr><td className="muted">Archive reason</td><td>{student.archiveReason}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>
              Guardians{' '}
              {canWrite && (
                <button className="btn secondary small" style={{ float: 'right' }} onClick={() => setShowGuardian(true)}>
                  + Add
                </button>
              )}
            </h2>
            {student.guardians.length === 0 ? (
              <div className="empty">No guardians recorded.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Relationship</th><th>Phone</th><th></th></tr>
                </thead>
                <tbody>
                  {student.guardians.map((g) => (
                    <tr key={g.guardian.id}>
                      <td style={{ fontWeight: 600 }}>{g.guardian.fullName}</td>
                      <td>{g.guardian.relationship}</td>
                      <td>{g.guardian.phoneNumber}</td>
                      <td>{g.isPrimaryContact && <Badge tone="blue">Primary</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h2>Recent payments</h2>
            {student.recentPayments.length === 0 ? (
              <div className="empty">No payments recorded.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {student.recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.receiptNumber}</td>
                      <td>{money(Number(p.amount))}</td>
                      <td>{p.paymentMethod.replace(/_/g, ' ')}</td>
                      <td className="muted">{dateStr(p.paymentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Recent marks</h2>
            {student.recentMarks.length === 0 ? (
              <div className="empty">No marks recorded.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Subject</th><th>Exam</th><th>Score</th><th>Grade</th></tr>
                </thead>
                <tbody>
                  {student.recentMarks.map((m) => (
                    <tr key={m.id}>
                      <td>{m.subject.name}</td>
                      <td>{m.exam.name}</td>
                      <td>{Number(m.score)} / {m.exam.totalMarks}</td>
                      <td>{m.grade ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <AddGuardianModal open={showGuardian} onClose={() => setShowGuardian(false)} studentId={student.id} onSaved={load} />
      <ArchiveModal open={showArchive} onClose={() => setShowArchive(false)} studentId={student.id} onSaved={load} />
    </>
  );
}

function AddGuardianModal({ open, onClose, studentId, onSaved }: { open: boolean; onClose: () => void; studentId: string; onSaved: () => void }) {
  const [form, setForm] = useState({ fullName: '', phoneNumber: '', relationship: 'Father', isPrimaryContact: false });
  const { busy, error, submit } = useSubmit(async () => {
    await api(`/api/students/${studentId}/guardians`, { method: 'POST', body: form });
    onSaved();
    onClose();
  });
  return (
    <Modal title="Add guardian" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Full name">
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        </Field>
        <div className="form-row">
          <Field label="Phone number">
            <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="070xxxxxxx" required />
          </Field>
          <Field label="Relationship">
            <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
              {['Father', 'Mother', 'Sponsor', 'Relative', 'Other'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Primary contact?">
          <select value={form.isPrimaryContact ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isPrimaryContact: e.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ArchiveModal({ open, onClose, studentId, onSaved }: { open: boolean; onClose: () => void; studentId: string; onSaved: () => void }) {
  const [status, setStatus] = useState('ARCHIVED');
  const [reason, setReason] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api(`/api/students/${studentId}/archive`, { method: 'POST', body: { status, reason } });
    onSaved();
    onClose();
  });
  return (
    <Modal title="Archive student" open={open} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>
        Students are never deleted — records remain for history.
      </p>
      <form onSubmit={submit}>
        <Field label="New status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ARCHIVED">Archived</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="GRADUATED">Graduated</option>
          </select>
        </Field>
        <Field label="Reason">
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn danger" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button>
        </div>
      </form>
    </Modal>
  );
}
