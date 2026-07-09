'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, EmptyState, Field, Modal, TableSkeleton, dateStr, useSubmit } from '@/components/ui';
import { Icon } from '@/components/icons';

interface ClassItem { id: string; name: string }
interface SubjectItem { id: string; name: string }
interface TermItem { id: string; name: string; year: number; isActive: boolean }
interface ExamItem { id: string; name: string; totalMarks: number; term: TermItem; class: ClassItem; _count?: { marks: number } }
interface StudentRow { id: string; firstName: string; lastName: string; admissionNumber: string }
interface ReportItem {
  id: string;
  isFinalized: boolean;
  generatedAt: string;
  student: { id: string; firstName: string; lastName: string; admissionNumber: string };
  term: { name: string; year: number };
  data?: { average?: number; overallGrade?: string } | null;
}

export default function ExamsPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<'exams' | 'marks' | 'reports'>('exams');
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<ExamItem[]>('/api/exams').then(setExams).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api<ClassItem[]>('/api/academics/classes').then(setClasses).catch(() => {});
    api<SubjectItem[]>('/api/academics/subjects').then(setSubjects).catch(() => {});
    api<TermItem[]>('/api/academics/terms').then(setTerms).catch(() => {});
  }, [load]);

  const canManage = hasRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

  return (
    <>
      <div className="topbar">
        <h1>Exams & Reports</h1>
        {canManage && tab === 'exams' && (
          <button className="btn icon-btn" onClick={() => setShowCreate(true)}>
            <Icon name="add" size={16} />
            Exam
          </button>
        )}
      </div>
      <div className="content">
        <div className="tabs">
          <button className={tab === 'exams' ? 'active' : ''} onClick={() => setTab('exams')}>Exams</button>
          <button className={tab === 'marks' ? 'active' : ''} onClick={() => setTab('marks')}>Marks entry</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Report cards</button>
        </div>

        {tab === 'exams' && (
          <div className="card">
            {loading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : exams.length === 0 ? (
              <EmptyState
                icon="exams"
                title="No exams yet."
                hint={canManage ? 'Create an exam to record marks and generate report cards.' : undefined}
                action={canManage ? { label: 'Add exam', onClick: () => setShowCreate(true) } : undefined}
              />
            ) : (
              <table className="table">
                <thead><tr><th>Exam</th><th>Class</th><th>Term</th><th>Total marks</th><th>Entries</th></tr></thead>
                <tbody>
                  {exams.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.name}</td>
                      <td>{e.class.name}</td>
                      <td>{e.term.name.replace(/_/g, ' ')} {e.term.year}</td>
                      <td>{e.totalMarks}</td>
                      <td>{e._count?.marks ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'marks' && <MarksEntry exams={exams} subjects={subjects} />}
        {tab === 'reports' && <Reports terms={terms} classes={classes} canManage={canManage} />}
      </div>

      <CreateExamModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} classes={classes} terms={terms} />
    </>
  );
}

function CreateExamModal({
  open, onClose, onSaved, classes, terms,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; classes: ClassItem[]; terms: TermItem[];
}) {
  const [form, setForm] = useState({ name: 'Mid-Term', termId: '', classId: '', totalMarks: 100 });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/exams', { method: 'POST', body: form });
    onSaved(); onClose();
  });
  return (
    <Modal title="Create exam" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Total marks"><input type="number" min={1} value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: Number(e.target.value) })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Term">
            <select value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })} required>
              <option value="">— Select —</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name.replace(/_/g, ' ')} {t.year}</option>)}
            </select>
          </Field>
          <Field label="Class">
            <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} required>
              <option value="">— Select —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>Create</button>
        </div>
      </form>
    </Modal>
  );
}

function MarksEntry({ exams, subjects }: { exams: ExamItem[]; subjects: SubjectItem[] }) {
  const [examId, setExamId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const exam = exams.find((e) => e.id === examId);

  useEffect(() => {
    if (!exam) { setStudents([]); return; }
    api<{ items: StudentRow[] }>('/api/students', { query: { classId: exam.class.id, status: 'ACTIVE', pageSize: 100 } })
      .then(async (d) => {
        setStudents(d.items);
        // Preload existing marks for this exam+subject
        if (subjectId) {
          const existing = await api<{ marks: Array<{ score: string; student: { id: string } }> }>(`/api/exams/${exam.id}/marks`, { query: { subjectId } }).catch(() => ({ marks: [] }));
          setScores(Object.fromEntries(existing.marks.map((m) => [m.student.id, String(Number(m.score))])));
        } else {
          setScores({});
        }
        setSaved(null);
      })
      .catch(() => {});
  }, [exam, subjectId]);

  const { busy, error, submit } = useSubmit(async () => {
    const marks = students
      .filter((s) => scores[s.id] !== undefined && scores[s.id] !== '')
      .map((s) => ({ studentId: s.id, score: Number(scores[s.id]) }));
    await api('/api/exams/marks', { method: 'POST', body: { examId, subjectId, marks } });
    setSaved(`Saved ${marks.length} marks.`);
  });

  return (
    <div className="card">
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <select value={examId} onChange={(e) => setExamId(e.target.value)}>
          <option value="">— Select exam —</option>
          {exams.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.class.name}</option>)}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">— Select subject —</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {exam && <span className="muted">Out of {exam.totalMarks}</span>}
      </div>

      {examId && subjectId ? (
        <>
          <table className="table">
            <thead><tr><th>Admission No</th><th>Student</th><th style={{ width: 140 }}>Score</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.admissionNumber}</td>
                  <td style={{ fontWeight: 600 }}>{s.firstName} {s.lastName}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={exam?.totalMarks}
                      value={scores[s.id] ?? ''}
                      onChange={(e) => setScores((sc) => ({ ...sc, [s.id]: e.target.value }))}
                      style={{ width: 100, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && <div className="empty">No active students in this exam&apos;s class.</div>}
          {error && <p className="error-text">{error}</p>}
          {saved && <p className="success-text">{saved}</p>}
          {students.length > 0 && (
            <div className="toolbar" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Saving…' : 'Save marks'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty">Select an exam and subject to enter marks.</div>
      )}
    </div>
  );
}

function Reports({ terms, classes, canManage }: { terms: TermItem[]; classes: ClassItem[]; canManage: boolean }) {
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyGen, setBusyGen] = useState(false);

  const load = useCallback(() => {
    if (!termId) return;
    api<ReportItem[]>('/api/exams/reports/list', { query: { termId } }).then(setReports).catch(() => {});
  }, [termId]);

  useEffect(() => { load(); }, [load]);

  const generateForClass = async () => {
    if (!termId || !classId) return;
    setBusyGen(true);
    setMessage(null);
    try {
      const studentData = await api<{ items: StudentRow[] }>('/api/students', { query: { classId, status: 'ACTIVE', pageSize: 100 } });
      let generated = 0;
      let skipped = 0;
      for (const s of studentData.items) {
        try {
          await api('/api/exams/reports', { method: 'POST', body: { studentId: s.id, termId } });
          generated += 1;
        } catch {
          skipped += 1;
        }
      }
      setMessage(`Generated ${generated} report cards${skipped ? ` (${skipped} skipped — already finalized)` : ''}.`);
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setBusyGen(false);
    }
  };

  return (
    <div className="card">
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <select value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">— Select term —</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name.replace(/_/g, ' ')} {t.year}</option>)}
        </select>
        {canManage && (
          <>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">— Class —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn" disabled={!termId || !classId || busyGen} onClick={() => void generateForClass()}>
              {busyGen ? 'Generating…' : 'Generate for class'}
            </button>
          </>
        )}
      </div>
      {message && <p className="success-text">{message}</p>}

      {!termId ? (
        <div className="empty">Select a term to view report cards.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Student</th><th>Term</th><th>Average</th><th>Grade</th><th>Generated</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.student.firstName} {r.student.lastName} <span className="muted">({r.student.admissionNumber})</span></td>
                <td>{r.term.name.replace(/_/g, ' ')} {r.term.year}</td>
                <td>{r.data?.average ?? '—'}%</td>
                <td>{r.data?.overallGrade ?? '—'}</td>
                <td className="muted">{dateStr(r.generatedAt)}</td>
                <td>{r.isFinalized ? <Badge tone="green">FINALIZED</Badge> : <Badge tone="amber">DRAFT</Badge>}</td>
                <td>
                  {canManage && !r.isFinalized && (
                    <button
                      className="btn secondary small"
                      onClick={() => api(`/api/exams/reports/${r.id}/finalize`, { method: 'POST' }).then(load)}
                    >
                      Finalize
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {termId && reports.length === 0 && <div className="empty">No report cards for this term yet.</div>}
    </div>
  );
}
