'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, EmptyState, Field, Modal, TableSkeleton, dateStr, statusTone, useSubmit } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  _count?: { messages: number };
}

interface TicketDetail extends Ticket {
  messages: Array<{ id: string; body: string; sentAt: string; sender: { firstName: string; lastName: string; role: string } }>;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [openTicket, setOpenTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<Ticket[]>('/api/support/tickets').then(setTickets).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = (id: string) => {
    api<TicketDetail>(`/api/support/tickets/${id}`).then(setOpenTicket).catch(() => {});
  };

  return (
    <>
      <div className="topbar">
        <h1>Help &amp; Support</h1>
        <button className="btn icon-btn" onClick={() => setShowCreate(true)}>
          <Icon name="add" size={16} />
          New ticket
        </button>
      </div>
      <div className="content">
        <div className="card">
          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon="support"
              title="No support tickets."
              hint="Open a ticket and our support team will get back to you."
              action={{ label: 'New ticket', onClick: () => setShowCreate(true) }}
            />
          ) : (
            <table className="table">
              <thead><tr><th>Subject</th><th>Priority</th><th>Status</th><th>Messages</th><th>Opened</th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => openDetail(t.id)}>
                    <td style={{ fontWeight: 600 }}>{t.subject}</td>
                    <td><Badge tone={t.priority === 'URGENT' || t.priority === 'HIGH' ? 'red' : 'gray'}>{t.priority}</Badge></td>
                    <td><Badge tone={statusTone(t.status)}>{t.status.replace(/_/g, ' ')}</Badge></td>
                    <td>{t._count?.messages ?? 0}</td>
                    <td className="muted">{dateStr(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateTicketModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />
      {openTicket && (
        <TicketThreadModal ticket={openTicket} onClose={() => setOpenTicket(null)} onSent={() => openDetail(openTicket.id)} />
      )}
    </>
  );
}

function CreateTicketModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ subject: '', description: '', priority: 'MEDIUM' });
  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/support/tickets', { method: 'POST', body: form });
    onSaved(); onClose();
  });
  return (
    <Modal title="New support ticket" open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Subject"><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></Field>
        <Field label="Describe the issue"><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></Field>
        <Field label="Priority">
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Submit ticket'}</button>
        </div>
      </form>
    </Modal>
  );
}

function TicketThreadModal({ ticket, onClose, onSent }: { ticket: TicketDetail; onClose: () => void; onSent: () => void }) {
  const [body, setBody] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api(`/api/support/tickets/${ticket.id}/messages`, { method: 'POST', body: { body } });
    setBody('');
    onSent();
  });
  return (
    <Modal title={ticket.subject} open onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>{ticket.description}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
        {ticket.messages.map((m) => (
          <div key={m.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {m.sender.firstName} {m.sender.lastName} <span className="muted">· {m.sender.role.replace(/_/g, ' ')} · {dateStr(m.sentAt)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
          </div>
        ))}
        {ticket.messages.length === 0 && <div className="empty">No replies yet.</div>}
      </div>
      <form onSubmit={submit}>
        <Field label="Reply"><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} required /></Field>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Close</button>
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reply'}</button>
        </div>
      </form>
    </Modal>
  );
}
