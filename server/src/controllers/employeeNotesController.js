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

const PDFDocument = require('pdfkit');
const audit = require('../services/auditService');

const PAGE_SIZE = 25;

/**
 * Build the note entries for one employee. Shared by the tab and the PDF
 * export so the exported record cannot drift from what the screen shows —
 * a compliance document that disagrees with the app is worse than none.
 *
 * @returns {Promise<{employee: object|null, entries: object[]}>}
 */
async function buildEmployeeTimeline(db, employeeId) {
    const employee = await db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, name: true, notes: true, updatedAt: true },
    });
    if (!employee) return { employee: null, entries: [] };

    const [callouts, offers, auditEntries] = await Promise.all([
            db.shiftCallout.findMany({
                where: { calloutEmployeeId: employeeId },
                include: { shift: { include: { client: { select: { clientName: true } } } } },
            }),
            db.shiftOffer.findMany({
                where: { employeeId },
                include: { shift: { include: { client: { select: { clientName: true } } } } },
            }),
            // Phone-response notes live in audit metadata rather than on the
            // offer row, so they are read back from there.
            db.auditLog.findMany({
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

    return { employee, entries };
}

/**
 * Filename for an exported notes PDF: the person's NAME plus the period, so a
 * file sitting in a compliance folder identifies itself without being opened.
 * Never the database id — that means nothing to whoever receives it.
 */
function notesFilename(subjectName, from, to) {
    const slug = String(subjectName || '')
        .replace(/[^a-z0-9]+/gi, '-')   // punctuation and spaces become separators
        .replace(/^-+|-+$/g, '')        // no leading/trailing dashes
        .toLowerCase()
        .slice(0, 40);                  // keep the name readable in a file listing

    // A name with no Latin characters strips to empty; "notes-.pdf" helps nobody.
    const base = slug || 'record';

    let period = '';
    if (from && to) period = `-${from}-to-${to}`;
    else if (from) period = `-from-${from}`;
    else if (to) period = `-to-${to}`;

    return `notes-${base}${period}.pdf`;
}

/** Inclusive date filter. `to` covers the whole closing day, not midnight. */
function filterByRange(entries, from, to) {
    if (!from && !to) return entries;
    const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
    const end = to ? new Date(`${to}T23:59:59.999Z`) : null;
    return entries.filter(e => {
        const d = new Date(e.date);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
    });
}

// GET /api/employees/:employeeId/notes-timeline
async function listEmployeeNotesTimeline(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const page = Math.max(1, Number(req.query.page) || 1);

        const { employee, entries } = await buildEmployeeTimeline(req.db, employeeId);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

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

// GET /api/employees/:employeeId/notes-timeline/export?from=&to=
//
// A compliance document. It may be handed to a state auditor or attached to a
// complaint file, so it states who it is about, the period it covers, when it
// was generated and by whom — a page of undated text proves nothing.
async function exportEmployeeNotesPdf(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const { from = '', to = '' } = req.query;

        const { employee, entries } = await buildEmployeeTimeline(req.db, employeeId);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        const notes = filterByRange(entries, from, to);

        // Disclosing an internal record is itself an auditable act — who asked
        // for it, about whom, and covering what period.
        audit.logAction({
            userId: req.user?.id ?? 0,
            userName: req.user?.name ?? 'System',
            userRole: req.user?.role ?? 'system',
            action: 'EXPORT',
            entityType: 'Employee',
            entityId: employee.id,
            entityName: employee.name,
            changes: [],
            metadata: { document: 'notes_timeline', from, to, entryCount: notes.length },
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${notesFilename(employee.name, from, to)}"`);

        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
        doc.pipe(res);
        renderNotesDocument(doc, {
            subjectLabel: 'Employee',
            subjectName: employee.name,
            notes, from, to,
            generatedBy: req.user?.name ?? 'System',
        });
        doc.end();
    } catch (err) {
        next(err);
    }
}

/** Shared PDF body — used for employee and client note exports alike. */
function renderNotesDocument(doc, { subjectLabel, subjectName, notes, from, to, generatedBy }) {
    const period = from || to
        ? `${from || 'the beginning'} to ${to || 'today'}`
        : 'All recorded history';

    doc.fontSize(16).font('Helvetica-Bold').text('Notes Record', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#444')
        .text(`${subjectLabel}: ${subjectName}`)
        .text(`Period: ${period}`)
        .text(`Generated: ${new Date().toLocaleString('en-US')} by ${generatedBy}`)
        .text(`Entries: ${notes.length}`);

    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#b45309')
        .text('CONFIDENTIAL — internal record. Contains protected information; handle per agency policy.');
    doc.fillColor('#000');

    doc.moveDown(0.8);
    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.8);

    if (notes.length === 0) {
        // An empty period is a meaningful answer, not a broken document.
        doc.fontSize(11).font('Helvetica-Oblique').fillColor('#666')
            .text('No notes recorded for this period.');
        return;
    }

    for (const note of notes) {
        if (doc.y > doc.page.height - 110) doc.addPage();

        const when = new Date(note.date).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        });

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
            .text(`${when}  ·  ${note.sourceLabel}${note.author ? `  ·  recorded by ${note.author}` : ''}`);
        doc.fontSize(10).font('Helvetica').fillColor('#222')
            .text(note.content, { width: doc.page.width - 96 });
        doc.moveDown(0.7);
    }
}

module.exports = {
    listEmployeeNotesTimeline,
    exportEmployeeNotesPdf,
    buildEmployeeTimeline,
    filterByRange,
    renderNotesDocument,
    notesFilename,
};
