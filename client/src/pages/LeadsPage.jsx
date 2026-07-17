import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import { useUndoStack } from '../hooks/useUndoStack';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import LeadKanban from '../components/leads/LeadKanban';
import LeadIntakeWizard from '../components/leads/LeadIntakeWizard';
import LeadDetailModal from '../components/leads/LeadDetailModal';
import ConvertLeadOverlay from '../components/leads/ConvertLeadOverlay';
import LeadFilterBar from '../components/leads/LeadFilterBar';
import LeadListView from '../components/leads/LeadListView';
import LeadDormantView from '../components/leads/LeadDormantView';
import LeadConvertedView from '../components/leads/LeadConvertedView';
import LeadViewSwitcher from '../components/leads/LeadViewSwitcher';
import ReactivateLeadModal from '../components/leads/ReactivateLeadModal';
import { statusToColumn, columnToStatus } from '../utils/leadConstants';

const CASE_TYPE_OPTIONS = [
    { id: 'all',      label: 'All' },
    { id: 'initial',  label: 'Initial' },
    { id: 'transfer', label: 'Transfer' },
    { id: 'private',  label: 'Private Pay' },
];

const DEFAULT_FILTERS = { year: 'all', month: 'all', caseType: 'all', search: '' };

export default function LeadsPage() {
    const undoState = useUndoStack();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // View + per-view fetch caches. Board and List share the "active" fetch;
    // Dormant is fetched separately since it's a different dataset.
    const [view, setView] = useState('board');
    const [activeLeads, setActiveLeads] = useState([]);
    const [dormantLeads, setDormantLeads] = useState([]);
    const [convertedLeads, setConvertedLeads] = useState([]);
    const [stats, setStats] = useState(null);

    // Filters apply uniformly to Board + List. Dormant view has its own search.
    const [filters, setFilters] = useState(DEFAULT_FILTERS);

    // Modal + wizard state
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editLead, setEditLead] = useState(null);
    const [detailLead, setDetailLead] = useState(null);
    const [convertLeadObj, setConvertLeadObj] = useState(null);
    const [reactivateLeadObj, setReactivateLeadObj] = useState(null);

    // ── Data loading ──────────────────────────────────────────────────────────
    const loadActive = useCallback(async () => {
        try {
            const [l, s] = await Promise.all([api.getLeads({ view: 'board' }), api.getLeadStats()]);
            setActiveLeads(l);
            setStats(s);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [showToast]);

    const loadDormant = useCallback(async () => {
        try {
            const l = await api.getLeads({ view: 'dormant' });
            setDormantLeads(l);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [showToast]);

    const loadConverted = useCallback(async () => {
        try {
            const l = await api.getLeads({ view: 'converted' });
            setConvertedLeads(l);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [showToast]);

    // Initial mount: fetch active leads + stats regardless of view (needed for
    // KPI cards + filter-bar month/year derivation). Dormant is fetched lazily.
    useEffect(() => { loadActive(); }, [loadActive]);
    useEffect(() => {
        if (view === 'dormant') loadDormant();
        if (view === 'converted') loadConverted();
    }, [view, loadDormant, loadConverted]);

    // ── Client-side filter pipeline (Board + List share this) ────────────────
    const filteredActive = useMemo(() => {
        const q = filters.search.trim().toLowerCase();
        return activeLeads.filter((l) => {
            // Case type
            if (filters.caseType !== 'all' && l.caseType !== filters.caseType) return false;
            // Year / Month (against createdAt)
            if (filters.year !== 'all' || filters.month !== 'all') {
                if (!l.createdAt) return false;
                const d = new Date(l.createdAt);
                if (filters.year !== 'all' && d.getFullYear() !== filters.year) return false;
                if (filters.month !== 'all' && d.getMonth() !== filters.month) return false;
            }
            // Search
            if (q) {
                const hay = [
                    `${l.firstName || ''} ${l.lastName || ''}`,
                    l.phone,
                    l.alternatePhone,
                    l.insuranceType,
                    l.medicaidId,
                    l.referralSource,
                ]
                    .join(' ')
                    .toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [activeLeads, filters]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleFilterChange = useCallback((patch) => {
        setFilters((f) => ({ ...f, ...patch }));
    }, []);

    const handleFilterReset = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    const handleMove = useCallback(async (leadId, columnId) => {
        const lead = activeLeads.find((x) => x.id === leadId);
        if (!lead || statusToColumn(lead.status) === columnId) return;
        const prevStatus = lead.status;
        const newStatus = columnToStatus(columnId);
        try {
            const updated = await api.setLeadStatus(leadId, newStatus);
            setActiveLeads((cur) => cur.map((x) => (x.id === leadId ? updated : x)));
            undoState.pushAction(
                'Move lead',
                async () => {
                    const r = await api.setLeadStatus(leadId, prevStatus);
                    setActiveLeads((c) => c.map((x) => (x.id === leadId ? r : x)));
                },
                async () => {
                    const r = await api.setLeadStatus(leadId, newStatus);
                    setActiveLeads((c) => c.map((x) => (x.id === leadId ? r : x)));
                }
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [activeLeads, undoState, showToast]);

    const handleSave = useCallback(async (payload) => {
        try {
            if (editLead) {
                const r = await api.updateLead(editLead.id, payload);
                setActiveLeads((c) => c.map((x) => (x.id === r.id ? r : x)));
                showToast('Lead updated', 'success');
            } else {
                const created = await api.createLead(payload);
                setActiveLeads((c) => [created, ...c]);
                undoState.pushAction(
                    'Add lead',
                    async () => {
                        await api.archiveLead(created.id);
                        setActiveLeads((c) => c.filter((x) => x.id !== created.id));
                    },
                    async () => {
                        const r = await api.restoreLead(created.id);
                        setActiveLeads((c) => [r, ...c]);
                    }
                );
                showToast('Lead saved!', 'success');
            }
            setWizardOpen(false);
            setEditLead(null);
            loadActive();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [editLead, undoState, showToast, loadActive]);

    const handleArchive = useCallback(async (leadArg) => {
        // Called from either the detail modal (no arg → use detailLead) or the
        // list view (lead arg passed).
        const lead = leadArg || detailLead;
        if (!lead) return;
        const leadId = lead.id;
        try {
            await api.archiveLead(leadId);
            setActiveLeads((c) => c.filter((x) => x.id !== leadId));
            if (detailLead && detailLead.id === leadId) setDetailLead(null);
            showToast('Lead archived', 'success');
            undoState.pushAction(
                'Archive lead',
                async () => {
                    const r = await api.restoreLead(leadId);
                    setActiveLeads((c) => (c.some((x) => x.id === r.id) ? c.map((x) => (x.id === r.id ? r : x)) : [r, ...c]));
                },
                async () => {
                    await api.archiveLead(leadId);
                    setActiveLeads((c) => c.filter((x) => x.id !== leadId));
                }
            );
            loadActive();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [detailLead, undoState, showToast, loadActive]);

    const handleReactivateConfirmed = useCallback((updated) => {
        // updated: lead with archivedAt=null, dormantAt=null, status=<primary>
        setReactivateLeadObj(null);
        setDormantLeads((c) => c.filter((x) => x.id !== updated.id));
        setActiveLeads((c) => [updated, ...c]);
        showToast('Lead reactivated', 'success');
        loadActive();
    }, [showToast, loadActive]);

    const onConverted = useCallback((result) => {
        setConvertLeadObj(null);
        setActiveLeads((c) => c.filter((x) => x.id !== result.lead.id));
        loadActive();
        const clientId = result?.client?.id;
        navigate(clientId ? `/clients/${clientId}` : '/clients');
    }, [navigate, loadActive]);

    // Detail view actions common between Board and List
    const openEdit = useCallback((lead) => {
        setEditLead(lead);
        setDetailLead(null);
        setWizardOpen(true);
    }, []);

    const openConvert = useCallback((lead) => {
        setConvertLeadObj(lead);
        setDetailLead(null);
    }, []);

    return (
        <>
            <GlobalToolbar
                title="Lead & Referral Management"
                subtitle="Track every inquiry from first call to active client"
                icon={Icons.users}
                undoState={undoState}
                activityEntity="Lead"
            />
            <ContextBar>
                <ContextBar.Left>
                    <LeadViewSwitcher
                        view={view}
                        counts={{
                            dormant: stats?.dormant,
                            converted: stats?.convertedThisMonth,
                        }}
                        onChange={setView}
                    />
                </ContextBar.Left>
                <ContextBar.Right>
                    <button className="btn btn--primary" onClick={() => { setEditLead(null); setWizardOpen(true); }}>
                        {Icons.plus} Add New Referral
                    </button>
                </ContextBar.Right>
            </ContextBar>

            {stats && (
                <div className="leads-stats">
                    <div className="stats-grid">
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Total Active Leads</span>
                                <span className="card__icon">{Icons.users}</span>
                            </div>
                            <div className="card__value">{stats.total}</div>
                            <div className="card__description">Currently in the pipeline</div>
                        </div>
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Follow-up Overdue</span>
                                <span className="card__icon">{Icons.alertTriangle}</span>
                            </div>
                            <div className="card__value">{stats.followUpOverdue}</div>
                            <div className="card__description">Past their follow-up date</div>
                        </div>
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Waiting for Insurance</span>
                                <span className="card__icon">{Icons.clock}</span>
                            </div>
                            <div className="card__value">{stats.waitingInsurance}</div>
                            <div className="card__description">Auth / eligibility pending</div>
                        </div>
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Converted This Month</span>
                                <span className="card__icon">{Icons.checkCircle}</span>
                            </div>
                            <div className="card__value">{stats.convertedThisMonth}</div>
                            <div className="card__description">Became active clients</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter bar for Board + List views only. Dormant has its own search. */}
            {(view === 'board' || view === 'list') && (
                <LeadFilterBar
                    leads={activeLeads}
                    year={filters.year}
                    month={filters.month}
                    caseType={filters.caseType}
                    search={filters.search}
                    onChange={handleFilterChange}
                    onReset={handleFilterReset}
                    caseTypeOptions={CASE_TYPE_OPTIONS}
                />
            )}

            {view === 'board' && (
                <LeadKanban
                    leads={filteredActive}
                    search=""
                    caseTypeFilter="all"
                    onMove={handleMove}
                    onView={setDetailLead}
                    onConvert={setConvertLeadObj}
                />
            )}

            {view === 'list' && (
                <LeadListView
                    leads={filteredActive}
                    onView={setDetailLead}
                    onEdit={openEdit}
                    onArchive={handleArchive}
                    onConvert={openConvert}
                />
            )}

            {view === 'dormant' && (
                <LeadDormantView
                    leads={dormantLeads}
                    onReactivate={setReactivateLeadObj}
                />
            )}

            {view === 'converted' && (
                <LeadConvertedView leads={convertedLeads} />
            )}

            {wizardOpen && (
                <LeadIntakeWizard
                    initialLead={editLead}
                    onClose={() => { setWizardOpen(false); setEditLead(null); }}
                    onSave={handleSave}
                />
            )}

            <LeadDetailModal
                lead={detailLead}
                onClose={() => setDetailLead(null)}
                onEdit={() => { setEditLead(detailLead); setDetailLead(null); setWizardOpen(true); }}
                onArchive={() => handleArchive()}
                onConvert={() => { setConvertLeadObj(detailLead); setDetailLead(null); }}
            />

            <ConvertLeadOverlay
                open={!!convertLeadObj}
                lead={convertLeadObj}
                onConfirmed={onConverted}
                onClose={() => setConvertLeadObj(null)}
            />

            {reactivateLeadObj && (
                <ReactivateLeadModal
                    lead={reactivateLeadObj}
                    onClose={() => setReactivateLeadObj(null)}
                    onConfirmed={handleReactivateConfirmed}
                    reactivateLead={api.reactivateLead}
                />
            )}
        </>
    );
}
