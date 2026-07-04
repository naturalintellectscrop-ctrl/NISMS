'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Field, Modal, dateStr, useSubmit } from '@/components/ui';

interface NewsItem { id: string; title: string; slug: string; content: string; publishedAt: string | null; createdAt: string }
interface GalleryItem { id: string; title: string; imageUrl: string; description?: string | null; uploadedAt: string }

export default function CmsPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<'news' | 'gallery'>('news');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [modal, setModal] = useState<'news' | 'gallery' | null>(null);
  const canWrite = hasRole('SCHOOL_ADMIN', 'SECRETARY');

  const load = useCallback(() => {
    api<NewsItem[]>('/api/cms/news').then(setNews).catch(() => {});
    api<GalleryItem[]>('/api/cms/gallery').then(setGallery).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="topbar">
        <h1>Website (CMS)</h1>
        {canWrite && (
          <button className="btn" onClick={() => setModal(tab)}>
            {tab === 'news' ? '+ News article' : '+ Gallery image'}
          </button>
        )}
      </div>
      <div className="content">
        <div className="tabs">
          <button className={tab === 'news' ? 'active' : ''} onClick={() => setTab('news')}>News & Events</button>
          <button className={tab === 'gallery' ? 'active' : ''} onClick={() => setTab('gallery')}>Gallery</button>
        </div>

        {tab === 'news' && (
          <div className="card">
            <table className="table">
              <thead><tr><th>Title</th><th>Status</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {news.map((n) => (
                  <tr key={n.id}>
                    <td style={{ fontWeight: 600 }}>{n.title}</td>
                    <td>{n.publishedAt ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft</Badge>}</td>
                    <td className="muted">{dateStr(n.createdAt)}</td>
                    <td>
                      {canWrite && !n.publishedAt && (
                        <button className="btn secondary small" onClick={() => api(`/api/cms/news/${n.id}`, { method: 'PATCH', body: { publish: true } }).then(load)}>
                          Publish
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {news.length === 0 && <div className="empty">No news articles yet.</div>}
          </div>
        )}

        {tab === 'gallery' && (
          <div className="grid grid-4">
            {gallery.map((g) => (
              <div className="card" key={g.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.imageUrl} alt={g.title} style={{ width: '100%', borderRadius: 8, marginBottom: 8, aspectRatio: '4/3', objectFit: 'cover' }} />
                <strong>{g.title}</strong>
                <p className="muted">{g.description ?? ''}</p>
                {canWrite && (
                  <button className="btn danger small" style={{ marginTop: 8 }} onClick={() => api(`/api/cms/gallery/${g.id}`, { method: 'DELETE' }).then(load)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {gallery.length === 0 && <div className="empty" style={{ gridColumn: '1/-1' }}>No gallery images yet.</div>}
          </div>
        )}
      </div>

      <NewsModal open={modal === 'news'} onClose={() => setModal(null)} onSaved={load} />
      <GalleryModal open={modal === 'gallery'} onClose={() => setModal(null)} onSaved={load} />
    </>
  );
}

function NewsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', content: '', publish: true });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/cms/news', { method: 'POST', body: form });
    onSaved(); onClose();
  });
  return (
    <Modal title="New article" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Content"><textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required /></Field>
        <Field label="Publish now?">
          <select value={form.publish ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, publish: e.target.value === 'yes' })}>
            <option value="yes">Yes</option><option value="no">Save as draft</option>
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

function GalleryModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', imageUrl: '', description: '' });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/cms/gallery', { method: 'POST', body: { ...form, description: form.description || null } });
    onSaved(); onClose();
  });
  return (
    <Modal title="Add gallery image" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Image URL"><input type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" required /></Field>
        <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Add image'}</button>
        </div>
      </form>
    </Modal>
  );
}
