'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, statusTone, useSubmit } from '@/components/ui';

interface ClassItem { id: string; name: string }
interface StudentRow { id: string; firstName: string; lastName: string; admissionNumber: string }

const STATUSES = ['PRESENT', 'ABSENT', 'SICK', 'EXCUSED'] as const;
type Status = (typeof STATUSES)[number];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { hasRole } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api<ClassItem[]>('/api/academics/classes').then(setClasses).catch(() => {});
  }, []);

  const loadRegister = useCallback(async () => {
    if (!classId) return;
    const [studentData, existing] = await Promise.all([
      api<{ items: StudentRow[] }>('/api/students', { query: { classId, status: 'ACTIVE', pageSize: 100 } }),
      api<Array<{ status: Status; student: { id: string } }>>('/api/attendance', { query: { classId, date } }).catch(() => []),
    ]);
    setStudents(studentData.items);
    const existingMap: Record<string, Status> = {};
    for (const record of existing) existingMap[record.student.id] = record.status;
    setMarks(
      Object.fromEntries(studentData.items.map((s) => [s.id, existingMap[s.id] ?? 'PRESENT']))
    );
    setSaved(null);
  }, [classId, date]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/attendance', {
      method: 'POST',
      body: {
        classId,
        date,
        records: students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'PRESENT' })),
      },
    });
    setSaved(`Attendance saved for ${students.length} students.`);
  });

  const canMark = hasRole('TEACHER', 'SCHOOL_ADMIN', 'HEAD_TEACHER');
  const counts = STATUSES.map((s) => [s, Object.values(marks).filter((m) => m === s).length] as const);

  return (
    <>
      <div className="topbar">
        <h1>Attendance</h1>
        <span className="muted">One record per student per day</span>
      </div>
      <div className="content">
        <div className="toolbar">
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">— Select class —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          <div className="spacer" />
          {counts.map(([s, n]) => (
            <Badge key={s} tone={statusTone(s)}>{s}: {n}</Badge>
          ))}
        </div>

        {!classId ? (
          <div className="empty">Select a class to open its register.</div>
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr><th>Admission No</th><th>Student</th><th>Status</th></tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.admissionNumber}</td>
                    <td style={{ fontWeight: 600 }}>{s.firstName} {s.lastName}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`btn small ${marks[s.id] === status ? '' : 'secondary'}`}
                            disabled={!canMark}
                            onClick={() => setMarks((m) => ({ ...m, [s.id]: status }))}
                          >
                            {status[0] + status.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length === 0 && <div className="empty">No active students in this class.</div>}
            {error && <p className="error-text">{error}</p>}
            {saved && <p className="success-text">{saved}</p>}
            {canMark && students.length > 0 && (
              <div className="toolbar" style={{ marginTop: 14 }}>
                <button className="btn" disabled={busy} onClick={() => void submit()}>
                  {busy ? 'Saving…' : 'Submit attendance'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
