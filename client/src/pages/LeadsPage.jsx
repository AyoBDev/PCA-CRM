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
import ConfirmModal from '../components/common/ConfirmModal';
import { statusToColumn, columnToStatus } from '../utils/leadConstants';

const CASE_TYPE_OPTIONS = [
    { id: 'all',      label: 'All' },
    { id: 'initial',  label: 'Initial' },
    { id: 'transfer', label: 'Transfer' },
    { id: 'private',  label: 'Private Pay' },
];

const DEFAULT_FILTERS = { year: 'all', month: 'all', caseType: 'all', search: '' };

// Shared filter predicate used by all four views so the one LeadFilterBar in the
// page behaves identically on Board, List, Dormant, and Converted.
// `dateField` is the lead property the Year/Month filters apply to.
function applyLeadFilters(leads, filters, dateField) {
    // Collapse internal whitespace so a "First Last" query matches even when
    // the stored name has stray/double spaces (e.g. "First  Last").
    const q = filters.search.trim().toLowerCase().replace(/\s+/g, ' ');
    return leads.filter((l) => {
        if (filters.caseType !== 'all' && l.caseType !== filters.caseType) return false;
        if (filters.year !== 'all' || filters.month !== 'all') {
            if (!l[dateField]) return false;
            const d = new Date(l[dateField]);
            if (filters.year !== 'all' && d.getFullYear() !== filters.year) return false;
            if (filters.month !== 'all' && d.getMonth() !== filters.month) return false;
        }
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
                .toLowerCase()
                .replace(/\s+/g, ' ');
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

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
    const [revertLeadObj, setRevertLeadObj] = useState(null);
    const [reverting, setReverting] = useState(false);

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

    // ── Client-side filter pipeline ──────────────────────────────────────────
    // Every view (Board, List, Dormant, Converted) runs the same predicate so the
    // shared LeadFilterBar behaves identically across tabs. `dateField` differs
    // per view: active leads filter on createdAt, converted leads on convertedAt.
    const filteredActive = useMemo(
        () => applyLeadFilters(activeLeads, filters, 'createdAt'),
        [activeLeads, filters],
    );
    const filteredDormant = useMemo(
        () => applyLeadFilters(dormantLeads, filters, 'createdAt'),
        [dormantLeads, filters],
    );
    const filteredConverted = useMemo(
        () => applyLeadFilters(convertedLeads, filters, 'convertedAt'),
        [convertedLeads, filters],
    );

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
            let saved;
            if (editLead) {
                const r = await api.updateLead(editLead.id, payload);
                setActiveLeads((c) => c.map((x) => (x.id === r.id ? r : x)));
                saved = r;
                showToast('Lead updated', 'success');
            } else {
                const created = await api.createLead(payload);
                setActiveLeads((c) => [created, ...c]);
                saved = created;
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
            // Return the saved lead so the wizard can upload any staged attachments.
            return saved;
        } catch (err) {
            showToast(err.message, 'error');
            throw err;
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

    // Closing the convert overlay without viewing the client: the conversion may
    // already have happened server-side, so refresh the board so a converted
    // lead doesn't linger. (Recently Converted stats also update.)
    const onConvertClosed = useCallback(() => {
        setConvertLeadObj(null);
        loadActive();
    }, [loadActive]);

    // Move an accidentally-converted lead back to the board. Deletes the
    // auto-created (empty) client server-side; not undo-able, so it's confirmed.
    const handleRevertConfirmed = useCallback(async () => {
        const lead = revertLeadObj;
        if (!lead) return;
        setReverting(true);
        try {
            await api.revertLeadConversion(lead.id);
            setConvertedLeads((c) => c.filter((x) => x.id !== lead.id));
            setRevertLeadObj(null);
            showToast('Moved back to Potential Clients', 'success');
            // Refresh active board + stats so the restored lead + KPIs are current.
            loadActive();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setReverting(false);
        }
    }, [revertLeadObj, showToast, loadActive]);

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

            {/* One shared filter bar across every view. It is fed the current
                view's dataset so the Year/Month "has data" dots stay accurate. */}
            <LeadFilterBar
                leads={
                    view === 'dormant' ? dormantLeads
                    : view === 'converted' ? convertedLeads
                    : activeLeads
                }
                year={filters.year}
                month={filters.month}
                caseType={filters.caseType}
                search={filters.search}
                onChange={handleFilterChange}
                onReset={handleFilterReset}
                caseTypeOptions={CASE_TYPE_OPTIONS}
            />

            {view === 'board' && (
                <LeadKanban
                    leads={filteredActive}
                    search=""
                    caseTypeFilter="all"
                    onMove={handleMove}
                    onView={setDetailLead}
                    onConvert={setConvertLeadObj}
                    onArchive={handleArchive}
                />
            )}

            {view === 'list' && (
                <LeadListView
                    leads={filteredActive}
                    onView={setDetailLead}
                    onArchive={handleArchive}
                    onMove={handleMove}
                />
            )}

            {view === 'dormant' && (
                <LeadDormantView
                    leads={filteredDormant}
                    onReactivate={setReactivateLeadObj}
                />
            )}

            {view === 'converted' && (
                <LeadConvertedView leads={filteredConverted} onRevert={setRevertLeadObj} />
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
                onClose={onConvertClosed}
            />

            {reactivateLeadObj && (
                <ReactivateLeadModal
                    lead={reactivateLeadObj}
                    onClose={() => setReactivateLeadObj(null)}
                    onConfirmed={handleReactivateConfirmed}
                    reactivateLead={api.reactivateLead}
                />
            )}

            {revertLeadObj && (
                <ConfirmModal
                    title="Move back to Potential Clients?"
                    message={`This will move ${`${revertLeadObj.firstName || ''} ${revertLeadObj.lastName || ''}`.trim() || 'this lead'} back to the leads board and delete the client record created when they were converted. This can't be undone. If the client already has authorizations, shifts, or timesheets, the move will be blocked.`}
                    confirmLabel={reverting ? 'Moving…' : 'Move Back'}
                    confirmVariant="danger"
                    onConfirm={handleRevertConfirmed}
                    onClose={() => setRevertLeadObj(null)}
                />
            )}
        </>
    );
}
