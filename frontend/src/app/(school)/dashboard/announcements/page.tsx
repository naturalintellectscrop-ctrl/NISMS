'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, EmptyState, Field, Modal, TableSkeleton, dateStr, useSubmit } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  publishedAt: string | null;
  createdAt: string;
}

export default function AnnouncementsPage() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const canManage = hasRole('SCHOOL_ADMIN', 'HEAD_TEACHER', 'SECRETARY');

  const load = useCallback(() => {
    setLoading(true);
    api<Announcement[]>('/api/announcements', { query: canManage ? { includeDrafts: 'true' } : {} })
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canManage]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="topbar">
        <h1>Announcements</h1>
        {canManage && (
          <button className="btn icon-btn" onClick={() => setShowCreate(true)}>
            <Icon name="add" size={16} />
            New announcement
          </button>
        )}
      </div>
      <div className="content">
        {loading && <div className="card"><TableSkeleton rows={4} cols={1} /></div>}
        {!loading && rows.length === 0 && (
          <div className="card">
            <EmptyState
              icon="announcements"
              title="No announcements yet."
              hint={canManage ? 'Post an announcement to keep staff, students and parents informed.' : 'Announcements from your school will appear here.'}
              action={canManage ? { label: 'New announcement', onClick: () => setShowCreate(true) } : undefined}
            />
          </div>
        )}
        {!loading && rows.map((a) => (
          <div className="card" key={a.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <strong>{a.title}</strong>
              <Badge tone="blue">{a.audience}</Badge>
              {a.publishedAt ? (
                <Badge tone="green">Published {dateStr(a.publishedAt)}</Badge>
              ) : (
                <Badge tone="amber">DRAFT</Badge>
              )}
              <div style={{ flex: 1 }} />
              {canManage && !a.publishedAt && (
                <button className="btn small" onClick={() => api(`/api/announcements/${a.id}/publish`, { method: 'POST' }).then(load)}>
                  Publish
                </button>
              )}
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
          </div>
        ))}
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />
    </>
  );
}

function CreateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL', publish: true });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/announcements', { method: 'POST', body: form });
    onSaved(); onClose();
  });
  return (
    <Modal title="New announcement" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Message"><textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></Field>
        <div className="form-row">
          <Field label="Audience">
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              {['ALL', 'TEACHERS', 'STUDENTS', 'PARENTS', 'STAFF'].map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Publish now?">
            <select value={form.publish ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, publish: e.target.value === 'yes' })}>
              <option value="yes">Yes</option><option value="no">Save as draft</option>
            </select>
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
