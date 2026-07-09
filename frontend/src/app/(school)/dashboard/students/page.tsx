'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, EmptyState, Field, Modal, Pagination, TableSkeleton, statusTone, useSubmit } from '@/components/ui';

interface ClassItem {
  id: string;
  name: string;
  streams: Array<{ id: string; name: string }>;
}

interface StudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  status: string;
  class?: { id: string; name: string } | null;
  stream?: { id: string; name: string } | null;
}

export default function StudentsPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<{ items: StudentRow[]; total: number }>('/api/students', {
      query: { search, classId, status, page, pageSize: 20 },
    })
      .then((d) => {
        setRows(d.items);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, classId, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<ClassItem[]>('/api/academics/classes').then(setClasses).catch(() => {});
  }, []);

  const canWrite = hasRole('SCHOOL_ADMIN', 'SECRETARY');

  return (
    <>
      <div className="topbar">
        <h1>Students</h1>
        {canWrite && (
          <button className="btn" onClick={() => setShowCreate(true)}>
            + Register student
          </button>
        )}
      </div>
      <div className="content">
        <div className="toolbar">
          <input placeholder="Search name, admission no, guardian…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ width: 280 }} />
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'ARCHIVED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="spacer" />
          <span className="muted">{total} students</span>
        </div>

        <div className="card">
          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="students"
              title={search || classId || status !== 'ACTIVE' ? 'No students match these filters.' : 'No students have been registered yet.'}
              hint={
                search || classId || status !== 'ACTIVE'
                  ? 'Try adjusting or clearing the filters above.'
                  : canWrite
                    ? 'Register your first student to begin building your school records.'
                    : undefined
              }
              action={canWrite && !(search || classId || status !== 'ACTIVE') ? { label: 'Register student', onClick: () => setShowCreate(true) } : undefined}
            />
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Admission No</th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>Class</th>
                    <th>Stream</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => router.push(`/dashboard/students/${s.id}`)}>
                      <td>{s.admissionNumber}</td>
                      <td style={{ fontWeight: 600 }}>
                        {s.firstName} {s.middleName ?? ''} {s.lastName}
                      </td>
                      <td>{s.gender}</td>
                      <td>{s.class?.name ?? '—'}</td>
                      <td>{s.stream?.name ?? '—'}</td>
                      <td>
                        <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} totalPages={Math.ceil(total / 20)} onPage={setPage} />
            </>
          )}
        </div>
      </div>

      <CreateStudentModal open={showCreate} onClose={() => setShowCreate(false)} classes={classes} onCreated={load} />
    </>
  );
}

function CreateStudentModal({
  open,
  onClose,
  classes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassItem[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    admissionNumber: '',
    firstName: '',
    middleName: '',
    lastName: '',
    gender: 'MALE',
    dateOfBirth: '',
    classId: '',
    streamId: '',
  });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const streams = classes.find((c) => c.id === form.classId)?.streams ?? [];

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/students', {
      method: 'POST',
      body: {
        ...form,
        middleName: form.middleName || null,
        classId: form.classId || null,
        streamId: form.streamId || null,
      },
    });
    onCreated();
    onClose();
  });

  return (
    <Modal title="Register student" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Admission number">
            <input value={form.admissionNumber} onChange={(e) => set('admissionNumber', e.target.value)} required />
          </Field>
          <Field label="Gender">
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="First name">
            <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
          </Field>
          <Field label="Middle name">
            <input value={form.middleName} onChange={(e) => set('middleName', e.target.value)} />
          </Field>
          <Field label="Last name">
            <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Date of birth">
            <input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} required />
          </Field>
          <Field label="Class">
            <select value={form.classId} onChange={(e) => { set('classId', e.target.value); set('streamId', ''); }}>
              <option value="">— None —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Stream">
            <select value={form.streamId} onChange={(e) => set('streamId', e.target.value)} disabled={streams.length === 0}>
              <option value="">— None —</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Register'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
