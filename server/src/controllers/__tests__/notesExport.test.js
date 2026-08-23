// Tests for the compliance PDF export of notes timelines.
//
// This document may be handed to a state auditor or attached to a complaint
// file, so it has to be self-describing: who it is about, what period it
// covers, when it was generated, and by whom. A page of undated text proves
// nothing.

jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
    employee: { findUnique: jest.fn() },
    client: { findUnique: jest.fn() },
    shiftCallout: { findMany: jest.fn(() => []) },
    shiftOffer: { findMany: jest.fn(() => []) },
    auditLog: { findMany: jest.fn(() => []) },
};

const audit = require('../../services/auditService');
const {
    exportEmployeeNotesPdf,
    filterByRange,
    renderNotesDocument,
} = require('../employeeNotesController');

// PDF byte output is compressed, so asserting on the response buffer proves
// nothing about the text. Capture what the document is ASKED to render instead
// by driving a stub doc through the same render function the export uses.
function captureRenderedText(opts) {
    const written = [];
    const chain = {
        fontSize: () => chain, font: () => chain, fillColor: () => chain,
        strokeColor: () => chain, stroke: () => chain,
        moveDown: () => chain, moveTo: () => chain, lineTo: () => chain,
        addPage: () => chain,
        text: (t) => { written.push(String(t)); return chain; },
        x: 48, y: 100,
        page: { width: 612, height: 792 },
    };
    renderNotesDocument(chain, opts);
    return written.join('\n');
}

function mockRes() {
    const chunks = [];
    return {
        chunks,
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        // pdfkit pipes into the response; collect what it writes.
        write: jest.fn(c => { chunks.push(c); return true; }),
        end: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
        removeListener: jest.fn(),
    };
}

function mockReq(overrides = {}) {
    return {
        params: { employeeId: '5' },
        query: {},
        user: { id: 2, name: 'Admin User', role: 'admin', agencyId: 1 },
        db: prisma,
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    prisma.employee.findUnique.mockResolvedValue({ id: 5, name: 'Sam Carer', notes: '', updatedAt: new Date('2026-07-01') });
    prisma.shiftCallout.findMany.mockResolvedValue([]);
    prisma.shiftOffer.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
});

describe('exportEmployeeNotesPdf', () => {
    test('404s for a missing employee', async () => {
        prisma.employee.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await exportEmployeeNotesPdf(mockReq(), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('sends a PDF as a named attachment', async () => {
        const res = mockRes();

        await exportEmployeeNotesPdf(mockReq(), res, jest.fn());

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
        const disposition = res.setHeader.mock.calls.find(c => c[0] === 'Content-Disposition')?.[1];
        // attachment, not inline: this is a document to file, not to skim.
        expect(disposition).toMatch(/^attachment/);
        expect(disposition).toMatch(/Sam.*Carer|sam-carer/i);
    });

    test('records who exported the record and for what period', async () => {
        const res = mockRes();

        await exportEmployeeNotesPdf(mockReq({ query: { from: '2026-07-01', to: '2026-07-31' } }), res, jest.fn());

        // Disclosing an internal record is itself an auditable act.
        expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'EXPORT',
            entityType: 'Employee',
            entityId: 5,
            userId: 2,
            metadata: expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
        }));
    });

    test('produces a valid document even with no notes in range', async () => {
        const res = mockRes();

        const next = jest.fn();
        await exportEmployeeNotesPdf(mockReq({ query: { from: '2030-01-01', to: '2030-01-31' } }), res, next);

        // An empty period is a meaningful answer — "no incidents recorded" —
        // not an error. (The rendered wording is asserted separately; pdfkit
        // pipes asynchronously, so this checks the response was set up, not the
        // bytes.)
        expect(res.status).not.toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    });
});

describe('notesFilename', () => {
    const { notesFilename } = require('../employeeNotesController');

    test('uses the person\'s name, not their id', () => {
        expect(notesFilename('Demo Ben Ortiz', '', '')).toBe('notes-demo-ben-ortiz.pdf');
    });

    test('includes the period when one is given', () => {
        // A compliance file sitting in a folder should say what it covers.
        expect(notesFilename('Jane Doe', '2026-07-01', '2026-07-31'))
            .toBe('notes-jane-doe-2026-07-01-to-2026-07-31.pdf');
    });

    test('handles an open-ended range', () => {
        expect(notesFilename('Jane Doe', '2026-07-01', '')).toBe('notes-jane-doe-from-2026-07-01.pdf');
        expect(notesFilename('Jane Doe', '', '2026-07-31')).toBe('notes-jane-doe-to-2026-07-31.pdf');
    });

    test('strips punctuation without leaving stray separators', () => {
        expect(notesFilename("Demo — O'Brien, Mary-Jane", '', '')).toBe('notes-demo-o-brien-mary-jane.pdf');
    });

    test('falls back when a name has no usable characters', () => {
        // Non-Latin names would otherwise strip to an empty string, producing
        // a file called "notes-.pdf".
        expect(notesFilename('陳大文', '', '')).toBe('notes-record.pdf');
        expect(notesFilename('', '', '')).toBe('notes-record.pdf');
    });

    test('does not produce an unwieldy filename for a long name', () => {
        const long = 'Bartholomew Montgomery Fitzgerald Wellington the Third of Somewhere';
        expect(notesFilename(long, '', '').length).toBeLessThanOrEqual(70);
    });
});

describe('filterByRange', () => {
    const at = iso => ({ date: new Date(iso).toISOString(), content: iso });

    test('keeps only entries inside the range', () => {
        const kept = filterByRange(
            [at('2026-07-15T12:00:00Z'), at('2026-01-05T12:00:00Z')],
            '2026-07-01', '2026-07-31',
        );

        // Handing an auditor months of unrelated history when they asked about
        // one period is its own problem.
        expect(kept.map(e => e.content)).toEqual(['2026-07-15T12:00:00Z']);
    });

    test('treats the end date as inclusive of the whole day', () => {
        const kept = filterByRange([at('2026-07-31T18:00:00Z')], '2026-07-01', '2026-07-31');

        // A note written at 6pm on the closing day is inside the range a human
        // means by "to 31 July".
        expect(kept).toHaveLength(1);
    });

    test('returns everything when no range is given', () => {
        const all = [at('2020-01-01T00:00:00Z'), at('2030-01-01T00:00:00Z')];

        expect(filterByRange(all, '', '')).toHaveLength(2);
    });

    test('supports an open-ended range', () => {
        const all = [at('2026-01-01T00:00:00Z'), at('2026-12-01T00:00:00Z')];

        expect(filterByRange(all, '2026-06-01', '')).toHaveLength(1);
        expect(filterByRange(all, '', '2026-06-01')).toHaveLength(1);
    });
});

describe('rendered document content', () => {
    const NOTES = [
        { date: '2026-07-15T12:00:00Z', sourceLabel: 'Callout', content: 'Car trouble', author: null },
        { date: '2026-07-16T12:00:00Z', sourceLabel: 'Phone note', content: 'Called back at 8:55', author: 'Admin User' },
    ];

    test('states plainly that the document is confidential', () => {
        const text = captureRenderedText({
            subjectLabel: 'Employee', subjectName: 'Sam Carer',
            notes: NOTES, from: '', to: '', generatedBy: 'Admin User',
        });

        expect(text).toMatch(/confidential/i);
    });

    test('identifies the subject, period, and who generated it', () => {
        const text = captureRenderedText({
            subjectLabel: 'Employee', subjectName: 'Sam Carer',
            notes: NOTES, from: '2026-07-01', to: '2026-07-31', generatedBy: 'Admin User',
        });

        // Without these four facts the document proves nothing about anybody.
        expect(text).toContain('Sam Carer');
        expect(text).toContain('2026-07-01');
        expect(text).toContain('2026-07-31');
        expect(text).toContain('Admin User');
        expect(text).toMatch(/Entries: 2/);
    });

    test('renders each note with its date, type and author', () => {
        const text = captureRenderedText({
            subjectLabel: 'Employee', subjectName: 'Sam Carer',
            notes: NOTES, from: '', to: '', generatedBy: 'Admin User',
        });

        expect(text).toContain('Car trouble');
        expect(text).toContain('Called back at 8:55');
        expect(text).toContain('Phone note');
        expect(text).toMatch(/recorded by Admin User/);
    });

    test('says so explicitly when a period has no notes', () => {
        const text = captureRenderedText({
            subjectLabel: 'Employee', subjectName: 'Sam Carer',
            notes: [], from: '2030-01-01', to: '2030-01-31', generatedBy: 'Admin User',
        });

        // "No notes recorded" is a finding an auditor can rely on; a blank page
        // is ambiguous between "nothing happened" and "export broken".
        expect(text).toMatch(/no notes recorded/i);
    });
});
