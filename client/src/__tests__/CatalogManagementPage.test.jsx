import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CatalogManagementPage from '../pages/CatalogManagementPage';
import { ToastProvider } from '../hooks/useToast';
import * as api from '../api';

vi.mock('../api');

beforeEach(() => {
    vi.clearAllMocks();
    api.getCatalogDocuments.mockResolvedValue({
        documentTypes: [{ id: 1, key: 'w4', label: 'W-4', requiresExpiry: false, active: true, sortOrder: 0 }],
    });
    api.getCatalogCertTypes.mockResolvedValue({
        certTypes: [{ id: 2, key: 'cpr', label: 'CPR', renewalYears: 2, requiresExpiry: true, active: true, sortOrder: 0 }],
    });
    api.getCatalogPolicies.mockResolvedValue({
        policyDocuments: [{ id: 3, key: 'coc', title: 'Code of Conduct', version: 1, active: true, sortOrder: 0 }],
    });
    api.updateCatalog.mockResolvedValue({});
    api.setCatalogActive.mockResolvedValue({});
    api.createCatalog.mockResolvedValue({});
});

function renderPage() {
    return render(
        <MemoryRouter>
            <ToastProvider>
                <CatalogManagementPage />
            </ToastProvider>
        </MemoryRouter>
    );
}

test('loads and shows the documents tab by default', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('W-4')).toBeInTheDocument());
    expect(api.getCatalogDocuments).toHaveBeenCalled();
});

test('switching to Certifications shows cert rows', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('W-4')).toBeInTheDocument());
    screen.getByRole('tab', { name: /certifications/i }).click();
    await waitFor(() => expect(screen.getByText('CPR')).toBeInTheDocument());
    expect(api.getCatalogCertTypes).toHaveBeenCalled();
});

test('switching to Policies shows policy rows', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('W-4')).toBeInTheDocument());
    screen.getByRole('tab', { name: /policies/i }).click();
    await waitFor(() => expect(screen.getByText('Code of Conduct')).toBeInTheDocument());
    expect(api.getCatalogPolicies).toHaveBeenCalled();
});

test('renders tabs with accessible names', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('W-4')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /^documents$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^certifications$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^policies$/i })).toBeInTheDocument();
});
