'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, EmptyState, Field, Modal, TableSkeleton, statusTone, useSubmit } from '@/components/ui';
import { Icon } from '@/components/icons';

interface TeacherRow {
  id: string;
  staffNumber: string;
  firstName: string;
  lastName: string;
  gender: string;
  phoneNumber: string;
  email?: string | null;
  employmentType: string;
  status: string;
  subjects: Array<{ subject: { id: string; name: string } }>;
  classes: Array<{ id: string; isClassTeacher: boolean; class: { id: string; name: string }; subject?: { id: string; name: string } | null }>;
}

interface SubjectItem { id: string; name: string }
interface ClassItem { id: string; name: string }

export default function TeachersPage() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<TeacherRow | null>(null);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<{ items: TeacherRow[]; total: number }>('/api/teachers', { query: { search, pageSize: 50 } })
      .then((d) => { setRows(d.items); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<SubjectItem[]>('/api/academics/subjects').then(setSubjects).catch(() => {});
    api<ClassItem[]>('/api/academics/classes').then(setClasses).catch(() => {});
  }, []);

  const canWrite = hasRole('SCHOOL_ADMIN', 'SECRETARY');
  const canAssign = hasRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

  return (
    <>
      <div className="topbar">
        <h1>Teachers</h1>
        {canWrite && (
          <button className="btn icon-btn" onClick={() => setShowCreate(true)}>
            <Icon name="add" size={16} />
            Register teacher
          </button>
        )}
      </div>
      <div className="content">
        <div className="toolbar">
          <input placeholder="Search name or staff number…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 280 }} />
          <div className="spacer" />
          <span className="muted">{total} teachers</span>
        </div>
        <div className="card">
          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="teachers"
              title={search ? 'No teachers match your search.' : 'No teachers have been registered yet.'}
              hint={
                search
                  ? 'Try a different name or staff number.'
                  : canWrite
                    ? 'Register your teaching staff to assign them to subjects and classes.'
                    : undefined
              }
              action={canWrite && !search ? { label: 'Register teacher', onClick: () => setShowCreate(true) } : undefined}
            />
          ) : (
          <table className="table">
            <thead>
              <tr><th>Staff No</th><th>Name</th><th>Phone</th><th>Subjects</th><th>Classes</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.staffNumber}</td>
                  <td style={{ fontWeight: 600 }}>{t.firstName} {t.lastName}</td>
                  <td>{t.phoneNumber}</td>
                  <td>{t.subjects.map((s) => s.subject.name).join(', ') || '—'}</td>
                  <td>
                    {t.classes.map((c) => (
                      <span key={c.id} className="class-chip">
                        {c.class.name}
                        {c.isClassTeacher && (
                          <span className="class-teacher-mark" title="Class teacher">
                            <Icon name="classTeacher" size={12} strokeWidth={2.5} />
                          </span>
                        )}
                      </span>
                    ))}
                    {t.classes.length === 0 && '—'}
                  </td>
                  <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                  <td>
                    {canAssign && (
                      <button className="btn secondary small" onClick={() => setSelected(t)}>Assign</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <CreateTeacherModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
      {selected && (
        <AssignModal
          teacher={selected}
          subjects={subjects}
          classes={classes}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}

function CreateTeacherModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    staffNumber: '', firstName: '', lastName: '', gender: 'MALE',
    phoneNumber: '', email: '', employmentType: 'FULL_TIME',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/teachers', { method: 'POST', body: { ...form, email: form.email || null } });
    onCreated();
    onClose();
  });
  return (
    <Modal title="Register teacher" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Staff number"><input value={form.staffNumber} onChange={(e) => set('staffNumber', e.target.value)} required /></Field>
          <Field label="Gender">
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="MALE">Male</option><option value="FEMALE">Female</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="First name"><input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required /></Field>
          <Field label="Last name"><input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required /></Field>
        </div>
        <div className="form-row">
          <Field label="Phone"><input value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} required /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Employment">
            <select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Register'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({
  teacher, subjects, classes, onClose, onSaved,
}: {
  teacher: TeacherRow;
  subjects: SubjectItem[];
  classes: ClassItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subjectIds, setSubjectIds] = useState<string[]>(teacher.subjects.map((s) => s.subject.id));
  const [classId, setClassId] = useState('');
  const [classSubjectId, setClassSubjectId] = useState('');
  const [isClassTeacher, setIsClassTeacher] = useState(false);

  const { busy, error, submit } = useSubmit(async () => {
    await api(`/api/teachers/${teacher.id}/subjects`, { method: 'PUT', body: { subjectIds } });
    if (classId) {
      await api(`/api/teachers/${teacher.id}/classes`, {
        method: 'POST',
        body: { classId, subjectId: classSubjectId || null, isClassTeacher },
      });
    }
    onSaved();
  });

  return (
    <Modal title={`Assignments — ${teacher.firstName} ${teacher.lastName}`} open onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Subjects taught">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {subjects.map((s) => (
              <label key={s.id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={subjectIds.includes(s.id)}
                  onChange={(e) =>
                    setSubjectIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((i) => i !== s.id)))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        </Field>
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
        <p className="muted" style={{ marginBottom: 8 }}>Add a class assignment (optional):</p>
        <div className="form-row">
          <Field label="Class">
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">— Select —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Subject in class">
            <select value={classSubjectId} onChange={(e) => setClassSubjectId(e.target.value)}>
              <option value="">— Any —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Class teacher?">
            <select value={isClassTeacher ? 'yes' : 'no'} onChange={(e) => setIsClassTeacher(e.target.value === 'yes')}>
              <option value="no">No</option><option value="yes">Yes — class teacher</option>
            </select>
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save assignments'}</button>
        </div>
      </form>
    </Modal>
  );
}
