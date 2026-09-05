import { render, screen, fireEvent } from '@testing-library/react';

// ServicesProvider fetches on mount; the modal only needs the constant
// fallbacks, so stub the API out.
vi.mock('../api', () => ({ getServices: vi.fn().mockResolvedValue([]) }));

import { ServicesProvider } from '../hooks/useServices';
import AuthorizationFormModal from '../components/common/AuthorizationFormModal';

const EXISTING_AUTH = {
    id: 7,
    clientId: 3,
    serviceCategory: 'PCS',
    serviceCode: 'PCS',
    serviceName: 'Personal Care Services',
    authorizationNumber: 'A-2025-0119',
    authorizedUnits: 40,
    accountNumber: '4000',
    sandataClientId: '1234567',
    authorizationStartDate: '2025-01-01T00:00:00.000Z',
    authorizationEndDate: '2025-12-31T00:00:00.000Z',
    notes: 'original note',
    manualStatus: 'active',
};

function renderModal(props = {}) {
    const onSave = props.onSave ?? vi.fn();
    const onRenewal = props.onRenewal ?? vi.fn();
    const onInactivate = props.onInactivate ?? vi.fn();
    const utils = render(
        <ServicesProvider>
            <AuthorizationFormModal
                auth={EXISTING_AUTH}
                clientId={3}
                onSave={onSave}
                onRenewal={onRenewal}
                onInactivate={onInactivate}
                onClose={vi.fn()}
                {...props}
            />
        </ServicesProvider>
    );
    return { ...utils, onSave, onRenewal, onInactivate };
}


const pickCorrection = () => fireEvent.click(screen.getByRole('radio', { name: /Correction/i }));

describe('AuthorizationFormModal — Correction flow', () => {
    test('Correction is a top-level status card, not buried inside Renewal', () => {
        renderModal();
        expect(screen.getByRole('radio', { name: /Correction/i })).toBeInTheDocument();
        // The old "Correct current authorization instead" escape hatch is gone.
        expect(screen.queryByText(/Correct current authorization instead/i)).not.toBeInTheDocument();
    });

    test('no status is preselected on an edit, and submit stays disabled', () => {
        renderModal();
        expect(screen.getByRole('radio', { name: /Correction/i })).not.toBeChecked();
        expect(screen.getByRole('radio', { name: /Renewal/i })).not.toBeChecked();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    test('Correction reveals the full field set, same as adding a new authorization', () => {
        renderModal();
        // Hidden until Correction is chosen.
        expect(screen.queryByLabelText('Service Category')).not.toBeInTheDocument();
        pickCorrection();
        for (const label of [
            'Service Category', 'Service Code', 'Service Name', 'Account Number',
            'Sandata Client ID', 'Authorization Number',
            'Auth Units', 'Auth Start', 'Auth End',
        ]) {
            expect(screen.getByLabelText(label)).toBeInTheDocument();
        }
        // Authorization Type is a derived, read-only badge rather than an input,
        // so it is exposed as a labelled status region instead of a field.
        expect(screen.getByRole('status', { name: 'Authorization Type' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Correction' })).toBeEnabled();
    });

    test('correction fields are seeded from the existing authorization', () => {
        renderModal();
        pickCorrection();
        expect(screen.getByLabelText('Service Category')).toHaveValue('PCS');
        expect(screen.getByLabelText('Authorization Number')).toHaveValue('A-2025-0119');
        expect(screen.getByLabelText('Sandata Client ID')).toHaveValue('1234567');
        expect(screen.getByLabelText('Auth Units')).toHaveValue(40);
        expect(screen.getByLabelText('Auth Start')).toHaveValue('2025-01-01');
        expect(screen.getByLabelText('Auth End')).toHaveValue('2025-12-31');
    });

    test('saving a correction sends every edited field via onSave, not onRenewal', () => {
        const { onSave, onRenewal } = renderModal();
        pickCorrection();
        fireEvent.change(screen.getByLabelText('Service Name'), { target: { value: 'Corrected Name' } });
        fireEvent.change(screen.getByLabelText('Sandata Client ID'), { target: { value: '7654321' } });
        fireEvent.change(screen.getByLabelText('Auth Units'), { target: { value: '48' } });
        fireEvent.change(screen.getByLabelText('Auth End'), { target: { value: '2026-06-30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Correction' }));

        expect(onRenewal).not.toHaveBeenCalled();
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0][0]).toMatchObject({
            serviceName: 'Corrected Name',
            sandataClientId: '7654321',
            authorizedUnits: 48,
            authorizationEndDate: '2026-06-30',
        });
    });

    test('a correction preserves the authorization\'s existing status', () => {
        const { onSave } = renderModal({ auth: { ...EXISTING_AUTH, manualStatus: 'inactive' } });
        pickCorrection();
        fireEvent.click(screen.getByRole('button', { name: 'Save Correction' }));
        // Fixing a typo must not silently reactivate an inactive authorization.
        expect(onSave.mock.calls[0][0].manualStatus).toBe('inactive');
    });

    test('Renewal still fires onRenewal and creates a new authorization', () => {
        const { onSave, onRenewal } = renderModal();
        fireEvent.click(screen.getByRole('radio', { name: /Renewal/i }));
        fireEvent.change(screen.getByLabelText('Auth End'), { target: { value: '2026-12-31' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Renewal' }));
        expect(onSave).not.toHaveBeenCalled();
        expect(onRenewal).toHaveBeenCalledTimes(1);
        expect(onRenewal.mock.calls[0][0]).toMatchObject({ oldAuthId: 7, clientId: 3 });
    });

    test('creating a new authorization shows the fields with no status cards', () => {
        renderModal({ auth: null });
        expect(screen.queryByRole('radio', { name: /Correction/i })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Service Category')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add Authorization' })).toBeEnabled();
    });
});

describe('AuthorizationFormModal — label associations', () => {
    // Every visible control must have an accessible name, or screen-reader users
    // hear an unlabelled field. getByLabelText only resolves via htmlFor/nesting
    // /aria-*, so these assertions fail if a label is left dangling.
    function assertAllControlsLabelled() {
        const controls = Array.from(
            document.querySelectorAll('.form-group input, .form-group select, .form-group textarea')
        );
        expect(controls.length).toBeGreaterThan(0);
        for (const el of controls) {
            const byFor = el.id && document.querySelector(`label[for="${el.id}"]`);
            const byWrap = el.closest('label');
            const byAria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
            expect(
                Boolean(byFor || byWrap || byAria),
                `unlabelled control: <${el.tagName.toLowerCase()} id="${el.id}">`
            ).toBe(true);
        }
    }

    test('every control in the create flow is labelled', () => {
        renderModal({ auth: null });
        assertAllControlsLabelled();
    });

    test('every control in the Correction flow is labelled', () => {
        renderModal();
        pickCorrection();
        assertAllControlsLabelled();
    });

    test('every control in the Renewal flow is labelled', () => {
        renderModal();
        fireEvent.click(screen.getByRole('radio', { name: /Renewal/i }));
        assertAllControlsLabelled();
    });

    test('every control in the Inactive flow is labelled', () => {
        renderModal();
        fireEvent.click(screen.getByRole('radio', { name: /Inactive/i }));
        assertAllControlsLabelled();
    });

    test('no <label> is left pointing at nothing', () => {
        renderModal();
        pickCorrection();
        for (const label of Array.from(document.querySelectorAll('label'))) {
            const htmlFor = label.getAttribute('for');
            if (htmlFor) {
                expect(document.getElementById(htmlFor), `label[for="${htmlFor}"] has no target`).toBeTruthy();
            } else {
                // No `for` is only acceptable when the label wraps its control.
                expect(
                    label.querySelector('input, select, textarea'),
                    `dangling <label>: "${label.textContent.trim()}"`
                ).toBeTruthy();
            }
        }
    });

    test('the status radio group is exposed as a named group', () => {
        renderModal();
        // A <label> cannot name a radio group; a fieldset/legend can.
        expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument();
    });
});
