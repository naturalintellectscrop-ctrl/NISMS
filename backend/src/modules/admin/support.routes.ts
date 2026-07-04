import { Router } from 'express';
import { z } from 'zod';
import { Role, TicketPriority, TicketStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { authenticate, requireRoles, PLATFORM_ROLES } from '../../middleware/auth';
import { asyncHandler, badRequest, forbidden, notFound } from '../../middleware/error';

/**
 * Support ticket system: school staff open tickets; Natural Intellects
 * support admins triage and respond.
 */
const router = Router();
router.use(authenticate);

const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
  schoolId: z.string().uuid().optional(), // platform users opening on behalf of a school
});

/** POST /api/support/tickets */
router.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const body = createTicketSchema.parse(req.body);
    const actor = req.user!;
    const schoolId = actor.schoolId ?? body.schoolId;
    if (!schoolId) throw badRequest('schoolId is required');

    const ticket = await prisma.supportTicket.create({
      data: {
        schoolId,
        subject: body.subject,
        description: body.description,
        priority: body.priority,
        createdById: actor.id,
      },
    });
    audit({ schoolId, userId: actor.id, action: 'TICKET_CREATED', entityType: 'SupportTicket', entityId: ticket.id, newValues: { subject: body.subject } });
    res.status(201).json(ticket);
  })
);

/** GET /api/support/tickets — own school's tickets, or all for platform admins. */
router.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const actor = req.user!;
    const { status } = req.query as Record<string, string | undefined>;
    const isPlatform = PLATFORM_ROLES.includes(actor.role);
    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...(isPlatform ? {} : { schoolId: actor.schoolId! }),
        ...(status ? { status: status as TicketStatus } : {}),
      },
      include: {
        school: { select: { id: true, name: true, shortName: true } },
        createdBy: { select: { email: true, firstName: true, lastName: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    res.json(tickets);
  })
);

/** GET /api/support/tickets/:id — full thread. */
router.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const actor = req.user!;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        school: { select: { id: true, name: true } },
        createdBy: { select: { email: true, firstName: true, lastName: true } },
        messages: { include: { sender: { select: { email: true, firstName: true, lastName: true, role: true } } }, orderBy: { sentAt: 'asc' } },
      },
    });
    if (!ticket) throw notFound('Ticket not found');
    if (!PLATFORM_ROLES.includes(actor.role) && ticket.schoolId !== actor.schoolId) throw forbidden();
    res.json(ticket);
  })
);

const messageSchema = z.object({ body: z.string().min(1) });

/** POST /api/support/tickets/:id/messages */
router.post(
  '/tickets/:id/messages',
  asyncHandler(async (req, res) => {
    const { body } = messageSchema.parse(req.body);
    const actor = req.user!;
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw notFound('Ticket not found');
    if (!PLATFORM_ROLES.includes(actor.role) && ticket.schoolId !== actor.schoolId) throw forbidden();

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, senderId: actor.id, body } }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: PLATFORM_ROLES.includes(actor.role) ? TicketStatus.IN_PROGRESS : ticket.status },
      }),
    ]);
    res.status(201).json(message);
  })
);

const updateTicketSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

/** PATCH /api/support/tickets/:id — triage (platform admins only). */
router.patch(
  '/tickets/:id',
  requireRoles(Role.SUPPORT_ADMIN),
  asyncHandler(async (req, res) => {
    const body = updateTicketSchema.parse(req.body);
    const ticket = await prisma.supportTicket.update({ where: { id: req.params.id }, data: body });
    audit({ schoolId: ticket.schoolId, userId: req.user!.id, action: 'TICKET_UPDATED', entityType: 'SupportTicket', entityId: ticket.id, newValues: body });
    res.json(ticket);
  })
);

export default router;
