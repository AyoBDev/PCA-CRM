// Employee notes timeline — ADMIN-ONLY internal record.
//
// Mirrors clientNotesController: a read-only aggregation over source records
// rather than a table of copied notes, so entries cannot drift out of sync with
// the callouts and offers they describe.
//
// PRIVACY: this is never exposed through the employee portal. It exists so an
// agency can see the pattern behind complaints and attendance — who called out,
// how often, what they said when contacted. A caregiver who knew their callouts
// were being tallied would report them differently, which is precisely the
// signal the record is meant to capture.

const prisma = require('../lib/prisma');

const PAGE_SIZE = 25;

// GET /api/employees/:employeeId/notes-timeline
async function listEmployeeNotesTimeline(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const page = Math.max(1, Number(req.query.page) || 1);

        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, name: true, notes: true, updatedAt: true },
        });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        const [callouts, offers, auditEntries] = await Promise.all([
            prisma.shiftCallout.findMany({
                where: { calloutEmployeeId: employeeId },
                include: { shift: { include: { client: { select: { clientName: true } } } } },
            }),
            prisma.shiftOffer.findMany({
                where: { employeeId },
                include: { shift: { include: { client: { select: { clientName: true } } } } },
            }),
            // Phone-response notes live in audit metadata rather than on the
            // offer row, so they are read back from there.
            prisma.auditLog.findMany({
                where: { entityType: 'ShiftOffer' },
                orderBy: { createdAt: 'desc' },
                take: 500,
            }),
        ]);

        const entries = [];
        const push = (source, sourceLabel, content, date, author) => {
            if (!content || !String(content).trim()) return;
            entries.push({
                source,
                sourceLabel,
                content: String(content).trim(),
                author: author || null,
                date: (date instanceof Date ? date : new Date(date)).toISOString(),
            });
        };

        push('employee', 'General', employee.notes, employee.updatedAt, null);

        callouts.forEach(c => push(
            'callout',
            'Callout',
            `Called out of ${c.shift?.client?.clientName || 'a shift'}`
                + (c.reason ? ` — ${c.reason}` : '')
                + (c.resolution === 'no_coverage' ? ' (no cover found)' : c.resolution === 'filled' ? ' (cover found)' : ''),
            c.createdAt,
            null,
        ));

        // Only answered offers are worth recording; an untouched offer says
        // nothing about the caregiver.
        const offerById = new Map(offers.map(o => [o.id, o]));
        offers.filter(o => o.response).forEach(o => push(
            'offer',
            'Shift offer',
            `Offered ${o.shift?.client?.clientName || 'a shift'} — ${o.response}`
                + (o.channel ? ` (via ${o.channel})` : ''),
            o.respondedAt || o.offeredAt,
            null,
        ));

        auditEntries.forEach(a => {
            if (!offerById.has(a.entityId)) return;
            let meta = {};
            try { meta = JSON.parse(a.metadata || '{}'); } catch { return; }
            if (!meta.note) return;
            push('phoneNote', 'Phone note', meta.note, a.createdAt, a.userName);
        });

        entries.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = entries.length;
        const skip = (page - 1) * PAGE_SIZE;

        res.json({
            notes: entries.slice(skip, skip + PAGE_SIZE),
            total,
            page,
            pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { listEmployeeNotesTimeline };
