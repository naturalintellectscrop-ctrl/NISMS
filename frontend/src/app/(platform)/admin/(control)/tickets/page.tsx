'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, EmptyState, Field, Modal, TableSkeleton, dateStr, openableRow, statusTone, useSubmit } from '@/components/ui';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  school: { id: string; name: string };
  createdBy: { email: string; firstName: string; lastName: string };
  _count?: { messages: number };
}

interface TicketDetail extends Ticket {
  messages: Array<{ id: string; body: string; sentAt: string; sender: { firstName: string; lastName: string; role: string } }>;
}

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<Ticket[]>('/api/support/tickets', { query: { status: statusFilter } }).then(setTickets).catch(() => {}).finally(() => setLoading(false));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const openDetail = (id: string) => {
    api<TicketDetail>(`/api/support/tickets/${id}`).then(setOpen).catch(() => {});
  };

  return (
    <>
      <div className="topbar">
        <h1>Support Tickets</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>
          <option value="">All statuses</option>
          {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div className="content">
        <div className="card">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon="tickets"
              title={statusFilter ? 'No tickets with this status.' : 'No support tickets yet.'}
              hint={statusFilter ? 'Clear the filter to see all tickets.' : 'Tickets raised by schools will appear here for triage.'}
            />
          ) : (
            <table className="table">
              <thead><tr><th>School</th><th>Subject</th><th>From</th><th>Priority</th><th>Status</th><th>Opened</th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} {...openableRow(() => openDetail(t.id), `Open ticket from ${t.school.name}: ${t.subject}`)}>
                    <td style={{ fontWeight: 600 }}>{t.school.name}</td>
                    <td>{t.subject}</td>
                    <td className="muted">{t.createdBy.firstName} {t.createdBy.lastName}</td>
                    <td><Badge tone={t.priority === 'URGENT' || t.priority === 'HIGH' ? 'red' : 'gray'}>{t.priority}</Badge></td>
                    <td><Badge tone={statusTone(t.status)}>{t.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="muted">{dateStr(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {open && <TriageModal ticket={open} onClose={() => setOpen(null)} onChanged={() => { openDetail(open.id); load(); }} />}
    </>
  );
}

function TriageModal({ ticket, onClose, onChanged }: { ticket: TicketDetail; onClose: () => void; onChanged: () => void }) {
  const [body, setBody] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api(`/api/support/tickets/${ticket.id}/messages`, { method: 'POST', body: { body } });
    setBody('');
    onChanged();
  });

  const setStatus = async (status: string) => {
    await api(`/api/support/tickets/${ticket.id}`, { method: 'PATCH', body: { status } });
    onChanged();
  };

  return (
    <Modal title={`${ticket.school.name} — ${ticket.subject}`} open onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
          <button key={s} className={`btn small ${ticket.status === s ? '' : 'secondary'}`} onClick={() => void setStatus(s)}>
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>{ticket.description}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 12 }}>
        {ticket.messages.map((m) => (
          <div key={m.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {m.sender.firstName} {m.sender.lastName} <span className="muted">· {m.sender.role.replace(/_/g, ' ')} · {dateStr(m.sentAt)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
          </div>
        ))}
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
