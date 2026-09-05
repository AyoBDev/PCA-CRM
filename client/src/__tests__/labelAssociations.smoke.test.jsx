/**
 * Guard for the app-wide label-association work.
 *
 * 1. Every touched module must IMPORT cleanly (catches a missing `useId`
 *    import or a syntax slip the bundler tolerates).
 * 2. A representative set of modals is RENDERED, then asserted to have no
 *    dangling <label> and no unlabelled control. Rendering is what catches a
 *    `fid is not defined` ReferenceError — the bundler never will.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../hooks/useToast';

vi.mock('../api', () => new Proxy({}, {
    get: (_t, prop) => {
        if (prop === 'default') return {};
        if (prop === 'getToken') return () => 'test-token';
        return vi.fn().mockResolvedValue([]);
    },
}));

const MODULES = import.meta.glob([
    '../pages/*.jsx',
    '../pages/**/*.jsx',
    '../components/**/*.jsx',
], { eager: false });

describe('label associations — module integrity', () => {
    // Importing 30+ page modules (each pulling its own dependency tree) is slow
    // under full-suite load, so this one needs more than the 5s default.
    test('every touched module imports without error', { timeout: 60000 }, async () => {
        const targets = Object.keys(MODULES).filter(p => !p.includes('__tests__')).filter(p =>
            /AuthorizationFormModal|AutocompleteInput|ClientCreationWizard|DeleteConfirmModal|OnboardingReviewModal|SaveAsModal|LeadDetailModal|LeadIntakeWizard|MobileDayCard|MobileSummaryTab|PdfToolbar|TaskModal|ManageRolesModal|AuthorizationsPage|ClientDetailPage|ClientServicePage|EmployeesPage|FilesPage|ForgotPasswordPage|PcaFormPage|PermanentLinksPage|ReceiptsPage|ResetPasswordPage|SchedulingPage|TasksPage|TimesheetFormPage|TimesheetsListPage|UsersPage|ActivityLogTab|PayrollTab|ScheduleConfirmPage|ScheduleDelivery/.test(p));
        expect(targets.length).toBeGreaterThan(25);
        for (const p of targets) {
            const mod = await MODULES[p]();
            expect(mod, `${p} failed to import`).toBeTruthy();
        }
    });
});

// Assert the rendered DOM has no accessibility gap of the kind we just fixed.
function assertNoDanglingLabels(label) {
    for (const el of Array.from(document.querySelectorAll('label'))) {
        const htmlFor = el.getAttribute('for');
        if (htmlFor) {
            expect(document.getElementById(htmlFor), `${label}: label[for="${htmlFor}"] has no target`).toBeTruthy();
        } else {
            expect(el.querySelector('input, select, textarea'),
                `${label}: dangling <label> "${el.textContent.trim().slice(0, 40)}"`).toBeTruthy();
        }
    }
    for (const c of Array.from(document.querySelectorAll('input, select, textarea'))) {
        if (c.type === 'hidden') continue;
        const named = (c.labels && c.labels.length) || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby');
        expect(Boolean(named), `${label}: unlabelled <${c.tagName.toLowerCase()} type=${c.type}>`).toBe(true);
    }
}

describe('label associations — rendered modals', () => {
    afterEach(cleanup);

    test('TaskModal (read-only) renders with named value regions', async () => {
        const { default: TaskModal } = await import('../components/tasks/TaskModal');
        const task = { id: 1, title: 'T', description: '', status: 'open', urgency: 'high', dueDate: '2026-01-01', assignedToUser: { name: 'A' } };
        render(<ToastProvider><TaskModal task={task} users={[]} onClose={vi.fn()} onSaved={vi.fn()} readOnly /></ToastProvider>);
        assertNoDanglingLabels('TaskModal');
        expect(screen.getByRole('note', { name: /Status/i })).toBeInTheDocument();
    });

    test('DeleteConfirmModal renders and labels its control', async () => {
        const { default: M } = await import('../components/common/DeleteConfirmModal');
        render(<M open title="Delete" items={[{ id: 1, name: 'thing' }]} onConfirm={vi.fn()} onClose={vi.fn()} />);
        assertNoDanglingLabels('DeleteConfirmModal');
    });

    test('PdfToolbar exposes named option groups, not stray labels', async () => {
        const { default: PdfToolbar } = await import('../components/pdf/PdfToolbar');
        render(<PdfToolbar
            activeTool="text" setActiveTool={vi.fn()}
            toolOptions={{ fontSize: 12, color: '#000', strokeWidth: 2, highlightColor: '#ff0' }}
            setToolOptions={vi.fn()}
            canUndo canRedo onUndo={vi.fn()} onRedo={vi.fn()}
            zoom={1} setZoom={vi.fn()} currentPage={1} totalPages={1} onPageChange={vi.fn()}
            onSave={vi.fn()} onSaveAs={vi.fn()} onSaveAsFinal={vi.fn()} onClose={vi.fn()}
            saving={false} hasChanges hasFormFields={false} />);
        assertNoDanglingLabels('PdfToolbar');
    });

    test('ForgotPasswordPage labels its email field', async () => {
        const { default: P } = await import('../pages/ForgotPasswordPage');
        render(<MemoryRouter><P /></MemoryRouter>);
        assertNoDanglingLabels('ForgotPasswordPage');
    });
});
