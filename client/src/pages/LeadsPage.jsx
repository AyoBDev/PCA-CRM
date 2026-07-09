import { useEffect, useState, useCallback } from 'react';
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
import { statusToColumn, columnToStatus } from '../utils/leadConstants';

const CASE_TYPE_FILTERS = ['all', 'initial', 'transfer', 'private'];

export default function LeadsPage() {
    const undoState = useUndoStack();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [leads, setLeads] = useState([]);
    const [stats, setStats] = useState(null);
    const [search, setSearch] = useState('');
    const [caseTypeFilter, setCaseTypeFilter] = useState('all');
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editLead, setEditLead] = useState(null);
    const [detailLead, setDetailLead] = useState(null);
    const [convertLeadObj, setConvertLeadObj] = useState(null);

    const load = useCallback(async () => {
        try {
            const [l, s] = await Promise.all([api.getLeads(), api.getLeadStats()]);
            setLeads(l);
            setStats(s);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [showToast]);

    useEffect(() => { load(); }, [load]);

    const handleMove = useCallback(async (leadId, columnId) => {
        const lead = leads.find((x) => x.id === leadId);
        if (!lead || statusToColumn(lead.status) === columnId) return;
        const prevStatus = lead.status;
        const newStatus = columnToStatus(columnId);
        try {
            const updated = await api.setLeadStatus(leadId, newStatus);
            setLeads((cur) => cur.map((x) => (x.id === leadId ? updated : x)));
            undoState.pushAction(
                'Move lead',
                async () => {
                    const r = await api.setLeadStatus(leadId, prevStatus);
                    setLeads((c) => c.map((x) => (x.id === leadId ? r : x)));
                },
                async () => {
                    const r = await api.setLeadStatus(leadId, newStatus);
                    setLeads((c) => c.map((x) => (x.id === leadId ? r : x)));
                }
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [leads, undoState, showToast]);

    const handleSave = useCallback(async (payload) => {
        try {
            if (editLead) {
                const r = await api.updateLead(editLead.id, payload);
                setLeads((c) => c.map((x) => (x.id === r.id ? r : x)));
                showToast('Lead updated', 'success');
            } else {
                const created = await api.createLead(payload);
                setLeads((c) => [created, ...c]);
                undoState.pushAction(
                    'Add lead',
                    async () => {
                        await api.archiveLead(created.id);
                        setLeads((c) => c.filter((x) => x.id !== created.id));
                    },
                    async () => {
                        const r = await api.restoreLead(created.id);
                        setLeads((c) => [r, ...c]);
                    }
                );
                showToast('Lead saved!', 'success');
            }
            setWizardOpen(false);
            setEditLead(null);
            load();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [editLead, undoState, showToast, load]);

    const handleArchive = useCallback(async () => {
        if (!detailLead) return;
        const leadId = detailLead.id;
        try {
            await api.archiveLead(leadId);
            setDetailLead(null);
            showToast('Lead archived', 'success');
            undoState.pushAction(
                'Archive lead',
                async () => {
                    const r = await api.restoreLead(leadId);
                    setLeads((c) => (c.some((x) => x.id === r.id) ? c.map((x) => (x.id === r.id ? r : x)) : [r, ...c]));
                },
                async () => {
                    await api.archiveLead(leadId);
                    setLeads((c) => c.filter((x) => x.id !== leadId));
                }
            );
            load();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [detailLead, undoState, showToast, load]);

    const onConverted = useCallback((result) => {
        setConvertLeadObj(null);
        setLeads((c) => c.filter((x) => x.id !== result.lead.id));
        load();
        const clientId = result?.client?.id;
        navigate(clientId ? `/clients/${clientId}` : '/clients');
    }, [navigate, load]);

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
                    {CASE_TYPE_FILTERS.map((t) => (
                        <button
                            key={t}
                            className={`chip${caseTypeFilter === t ? ' chip--on' : ''}`}
                            onClick={() => setCaseTypeFilter(t)}
                        >
                            {t === 'all' ? 'All' : t === 'private' ? 'Private Pay' : t[0].toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                    <input
                        type="text"
                        className="context-bar__search"
                        placeholder="Search by name, phone, insurance..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
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

            <LeadKanban
                leads={leads}
                search={search}
                caseTypeFilter={caseTypeFilter}
                onMove={handleMove}
                onView={setDetailLead}
                onConvert={setConvertLeadObj}
            />

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
                onArchive={handleArchive}
                onConvert={() => { setConvertLeadObj(detailLead); setDetailLead(null); }}
            />

            <ConvertLeadOverlay
                open={!!convertLeadObj}
                lead={convertLeadObj}
                onConfirmed={onConverted}
                onClose={() => setConvertLeadObj(null)}
            />
        </>
    );
}
