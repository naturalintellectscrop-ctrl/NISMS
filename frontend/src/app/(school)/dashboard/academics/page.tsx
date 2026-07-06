'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Field, Modal, dateStr, useSubmit } from '@/components/ui';

interface ClassItem {
  id: string;
  name: string;
  level: number;
  streams: Array<{ id: string; name: string }>;
  _count?: { students: number };
  teachers?: Array<{ teacher: { firstName: string; lastName: string } }>;
}
interface SubjectItem { id: string; name: string; code?: string | null; category: string }
interface TermItem { id: string; name: string; year: number; startDate: string; endDate: string; isActive: boolean }

export default function AcademicsPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<'classes' | 'subjects' | 'terms'>('classes');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [modal, setModal] = useState<'class' | 'stream' | 'subject' | 'term' | null>(null);

  const load = useCallback(() => {
    api<ClassItem[]>('/api/academics/classes').then(setClasses).catch(() => {});
    api<SubjectItem[]>('/api/academics/subjects').then(setSubjects).catch(() => {});
    api<TermItem[]>('/api/academics/terms').then(setTerms).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const canManage = hasRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

  return (
    <>
      <div className="topbar">
        <h1>Academics</h1>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'classes' && (
              <>
                <button className="btn secondary" onClick={() => setModal('stream')}>+ Stream</button>
                <button className="btn" onClick={() => setModal('class')}>+ Class</button>
              </>
            )}
            {tab === 'subjects' && <button className="btn" onClick={() => setModal('subject')}>+ Subject</button>}
            {tab === 'terms' && hasRole('SCHOOL_ADMIN') && <button className="btn" onClick={() => setModal('term')}>+ Term</button>}
          </div>
        )}
      </div>
      <div className="content">
        <div className="tabs">
          {(['classes', 'subjects', 'terms'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'classes' && (
          <div className="card">
            <table className="table">
              <thead><tr><th>Class</th><th>Level</th><th>Streams</th><th>Active students</th><th>Class teacher</th></tr></thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.level}</td>
                    <td>{c.streams.map((s) => s.name).join(', ') || '—'}</td>
                    <td>{c._count?.students ?? 0}</td>
                    <td>{c.teachers?.[0] ? `${c.teachers[0].teacher.firstName} ${c.teachers[0].teacher.lastName}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {classes.length === 0 && <div className="empty">No classes yet. Create P1, P2, S1… to get started.</div>}
          </div>
        )}

        {tab === 'subjects' && (
          <div className="card">
            <table className="table">
              <thead><tr><th>Subject</th><th>Code</th><th>Category</th></tr></thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>{s.code ?? '—'}</td>
                    <td><Badge tone="gray">{s.category}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {subjects.length === 0 && <div className="empty">No subjects yet.</div>}
          </div>
        )}

        {tab === 'terms' && (
          <div className="card">
            <table className="table">
              <thead><tr><th>Term</th><th>Year</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name.replace(/_/g, ' ')}</td>
                    <td>{t.year}</td>
                    <td>{dateStr(t.startDate)}</td>
                    <td>{dateStr(t.endDate)}</td>
                    <td>{t.isActive ? <Badge tone="green">ACTIVE</Badge> : <Badge tone="gray">—</Badge>}</td>
                    <td>
                      {!t.isActive && hasRole('SCHOOL_ADMIN') && (
                        <button
                          className="btn secondary small"
                          onClick={() => api(`/api/academics/terms/${t.id}/activate`, { method: 'POST' }).then(load)}
                        >
                          Set active
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {terms.length === 0 && <div className="empty">No terms yet.</div>}
          </div>
        )}
      </div>

      <ClassModal open={modal === 'class'} onClose={() => setModal(null)} onSaved={load} />
      <StreamModal open={modal === 'stream'} onClose={() => setModal(null)} onSaved={load} classes={classes} />
      <SubjectModal open={modal === 'subject'} onClose={() => setModal(null)} onSaved={load} />
      <TermModal open={modal === 'term'} onClose={() => setModal(null)} onSaved={load} />
    </>
  );
}

function ClassModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState(1);
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/academics/classes', { method: 'POST', body: { name, level } });
    onSaved(); onClose();
  });
  return (
    <Modal title="Create class" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Name (e.g. P1, S2)"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Level (for ordering)"><input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} min={0} /></Field>
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

function StreamModal({ open, onClose, onSaved, classes }: { open: boolean; onClose: () => void; onSaved: () => void; classes: ClassItem[] }) {
  const [classId, setClassId] = useState('');
  const [name, setName] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/academics/streams', { method: 'POST', body: { classId, name } });
    onSaved(); onClose();
  });
  return (
    <Modal title="Create stream" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Class">
            <select value={classId} onChange={(e) => setClassId(e.target.value)} required>
              <option value="">— Select —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Stream name (e.g. Blue)"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
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

function SubjectModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', category: 'OTHER' });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/academics/subjects', { method: 'POST', body: { ...form, code: form.code || null } });
    onSaved(); onClose();
  });
  return (
    <Modal title="Create subject" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MTC" /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['SCIENCE', 'ART', 'LANGUAGE', 'OTHER'].map((c) => <option key={c}>{c}</option>)}
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

function TermModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const year = new Date().getFullYear();
  const [form, setForm] = useState({ name: 'TERM_I', year, startDate: '', endDate: '', isActive: false });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/academics/terms', { method: 'POST', body: form });
    onSaved(); onClose();
  });
  return (
    <Modal title="Create term" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Term">
            <select value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}>
              <option value="TERM_I">Term I</option>
              <option value="TERM_II">Term II</option>
              <option value="TERM_III">Term III</option>
            </select>
          </Field>
          <Field label="Year"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Start date"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></Field>
          <Field label="End date"><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></Field>
        </div>
        <Field label="Set as active term?">
          <select value={form.isActive ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'yes' })}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
