import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import InlineEditable from '../components/common/InlineEditable';
import ToggleSwitch from '../components/common/ToggleSwitch';
import { useToast } from '../hooks/useToast';
import { useUndoStack } from '../hooks/useUndoStack';

const TABS = [
    { id: 'documents', label: 'Documents' },
    { id: 'cert-types', label: 'Certifications' },
    { id: 'policies', label: 'Policies' },
];

// Per-kind config: how to load rows, which field carries the row's primary
// display label, and which entity name to use in undo descriptions.
const KIND_CONFIG = {
    documents: {
        load: async () => (await api.getCatalogDocuments()).documentTypes || [],
        labelField: 'label',
        entityName: 'document type',
    },
    'cert-types': {
        load: async () => (await api.getCatalogCertTypes()).certTypes || [],
        labelField: 'label',
        entityName: 'certification type',
    },
    policies: {
        load: async () => (await api.getCatalogPolicies()).policyDocuments || [],
        labelField: 'title',
        entityName: 'policy',
    },
};

export default function CatalogManagementPage() {
    const { showToast } = useToast();
    const undoState = useUndoStack();
    const [tab, setTab] = useState('documents');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchRows = useCallback(async (kind) => {
        setLoading(true);
        try {
            const list = await KIND_CONFIG[kind].load();
            setRows(list);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchRows(tab); }, [tab, fetchRows]);

    // Patch a single field on a single row in local state.
    const patchRow = (id, patch) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    // Generic field save: calls updateCatalog, pushes undo, patches local state.
    const saveField = async (row, field, nextValue) => {
        const prevValue = row[field];
        await api.updateCatalog(tab, row.id, { [field]: nextValue });
        patchRow(row.id, { [field]: nextValue });
        const label = row[KIND_CONFIG[tab].labelField];
        undoState.pushAction(
            `Updated ${label}`,
            async () => { await api.updateCatalog(tab, row.id, { [field]: prevValue }); patchRow(row.id, { [field]: prevValue }); },
            async () => { await api.updateCatalog(tab, row.id, { [field]: nextValue }); patchRow(row.id, { [field]: nextValue }); }
        );
    };

    const handleToggleActive = async (row) => {
        const prevActive = row.active;
        const nextActive = !prevActive;
        try {
            await api.setCatalogActive(tab, row.id, nextActive);
            patchRow(row.id, { active: nextActive });
            const label = row[KIND_CONFIG[tab].labelField];
            showToast(nextActive ? `${label} activated` : `${label} deactivated`);
            undoState.pushAction(
                `${nextActive ? 'Activated' : 'Deactivated'} ${label}`,
                async () => { await api.setCatalogActive(tab, row.id, prevActive); patchRow(row.id, { active: prevActive }); },
                async () => { await api.setCatalogActive(tab, row.id, nextActive); patchRow(row.id, { active: nextActive }); }
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleToggleRequiresExpiry = async (row) => {
        const prevValue = row.requiresExpiry;
        const nextValue = !prevValue;
        try {
            await saveField(row, 'requiresExpiry', nextValue);
            showToast('Updated requires expiry');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const labelField = KIND_CONFIG[tab].labelField;

    return (
        <>
            <GlobalToolbar
                title="Onboarding Catalogs"
                subtitle="Documents, certifications & policies"
                icon={Icons.clipboard}
                undoState={undoState}
                activityEntity="CertType"
            />
            <ContextBar>
                <ContextBar.Left>
                    <div className="sched-view-switcher" role="tablist" aria-label="Catalog kind">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === t.id}
                                className={`sched-view-switcher__btn${tab === t.id ? ' sched-view-switcher__btn--active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </ContextBar.Left>
            </ContextBar>
            <div className="page-content">
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th scope="col">{tab === 'policies' ? 'Title' : 'Label'}</th>
                                {tab === 'cert-types' && <th scope="col">Renewal (years)</th>}
                                {tab === 'cert-types' && <th scope="col">Requires Expiry</th>}
                                <th scope="col">Active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={tab === 'cert-types' ? 4 : 2} className="text-muted">
                                        No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet.
                                    </td>
                                </tr>
                            )}
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <InlineEditable
                                            value={row[labelField]}
                                            placeholder={tab === 'policies' ? 'Title' : 'Label'}
                                            onSave={async (next) => { await saveField(row, labelField, next); }}
                                            undoLabel={KIND_CONFIG[tab].entityName}
                                            width={220}
                                        />
                                    </td>
                                    {tab === 'cert-types' && (
                                        <td>
                                            <InlineEditable
                                                value={String(row.renewalYears ?? '')}
                                                type="number"
                                                min={0}
                                                allowEmpty
                                                placeholder="—"
                                                onSave={async (next) => {
                                                    await saveField(row, 'renewalYears', next === '' ? null : Number(next));
                                                }}
                                                undoLabel="renewal years"
                                                width={90}
                                            />
                                        </td>
                                    )}
                                    {tab === 'cert-types' && (
                                        <td>
                                            <ToggleSwitch
                                                checked={!!row.requiresExpiry}
                                                onChange={() => handleToggleRequiresExpiry(row)}
                                                id={`req-expiry-${row.id}`}
                                            />
                                        </td>
                                    )}
                                    <td>
                                        <ToggleSwitch
                                            checked={!!row.active}
                                            onChange={() => handleToggleActive(row)}
                                            id={`active-${row.id}`}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
