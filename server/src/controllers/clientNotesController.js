const prisma = require('../lib/prisma');

// Reverse-chronological, read-only aggregation of every note tied to a client.
// Notes live in their source records; this endpoint only reads and normalizes them.
// GET /clients/:clientId/notes-timeline
async function listNotesTimeline(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = 25;

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { id: true, clientName: true, notes: true, pcaNotes: true, updatedAt: true },
        });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const [
            clientNotes,
            authorizations,
            hospitalVisits,
            careTeam,
            incidents,
            documents,
            authDocuments,
            timesheets,
            shifts,
            activities,
        ] = await Promise.all([
            prisma.clientNote.findMany({ where: { clientId } }),
            prisma.authorization.findMany({ where: { clientId, archivedAt: null } }),
            prisma.hospitalVisit.findMany({ where: { clientId } }),
            prisma.clientCareTeam.findMany({ where: { clientId }, include: { employee: { select: { name: true } } } }),
            prisma.incident.findMany({ where: { clientId } }),
            prisma.clientDocument.findMany({ where: { clientId }, include: { uploader: { select: { name: true } } } }),
            prisma.authorization_documents.findMany({ where: { authorizations: { clientId } }, include: { users: { select: { name: true } } } }),
            prisma.timesheet.findMany({ where: { clientId } }),
            prisma.shift.findMany({ where: { clientId, archivedAt: null } }),
            prisma.clientActivity.findMany({ where: { clientId, type: 'note' }, include: { user: { select: { name: true } } } }),
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

        push('client', 'General', client.notes, client.updatedAt, null);
        push('client', 'General', client.pcaNotes, client.updatedAt, null);

        clientNotes.forEach(n => push('clientNote', 'Note', n.content, n.date || n.createdAt, null));
        authorizations.forEach(a => push('authorization', 'Authorization', a.notes, a.updatedAt, null));
        hospitalVisits.forEach(v => push('careplan', 'Care Plan', v.notes, v.updatedAt, null));
        careTeam.forEach(t => push('careplan', 'Care Plan', t.notes, t.updatedAt, t.employee?.name));
        incidents.forEach(i => push('incident', 'Incident', i.notes, i.updatedAt, i.reportedBy));
        documents.forEach(d => push('document', 'Document', d.notes, d.updatedAt, d.uploader?.name));
        authDocuments.forEach(d => push('authDocument', 'Auth Document', d.notes, d.created_at, d.users?.name));
        timesheets.forEach(t => push('timesheet', 'Timesheet', t.correctionNote, t.updatedAt, t.pcaName));
        shifts.forEach(s => push('schedule', 'Scheduling', s.notes, s.updatedAt, null));
        activities.forEach(a => push('activity', 'Activity', a.description || a.subject, a.occurredAt, a.user?.name));

        entries.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = entries.length;
        const skip = (page - 1) * limit;
        const notes = entries.slice(skip, skip + limit);

        res.json({ notes, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    } catch (err) {
        next(err);
    }
}

module.exports = { listNotesTimeline };
