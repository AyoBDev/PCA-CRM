import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { EntityActivityButton } from '../components/common/ActivityDrawer';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

const DOC_CATEGORIES = [
    { value: 'admission_packet', label: 'Client Admission Packets', color: '#3b82f6' },
    { value: 'auth_pca', label: 'PCA Service Authorization', color: '#22c55e' },
    { value: 'auth_waiver', label: 'Waiver Service Authorization', color: '#f59e0b' },
    { value: 'auth_iso', label: 'ISO Service Authorization', color: '#06b6d4' },
    { value: 'transfer', label: 'Transfer Documents', color: '#8b5cf6' },
    { value: 'discharge', label: 'Client Discharge Documents', color: '#ef4444' },
    { value: 'supervisor_review', label: 'Supervisor Review Documents', color: '#64748b' },
    { value: 'other', label: 'Other', color: '#94a3b8' },
];

const AUTH_COLORS = {
    PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', label: 'PCA Service Authorization' },
    SDPC: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', label: 'SDPC Service Authorization' },
    S5130: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', label: 'Homemaker Service Authorization' },
    S5150: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', label: 'Respite Service Authorization' },
    S5125: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', label: 'Attendant Care Authorization' },
    S5135: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', label: 'Companion Service Authorization' },
};
const DEFAULT_AUTH_COLOR = { accent: '#64748b', bg: 'hsl(215 20% 96%)', label: 'Service Authorization' };

const TABS = [
    { key: 'summary', label: 'Summary' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'diagnoses', label: 'Diagnoses' },
    { key: 'mar', label: 'MAR' },
    { key: 'adl', label: 'ADL' },
    { key: 'assessment', label: 'Assessment' },
    { key: 'care-plan', label: 'Care Plan' },
    { key: 'encounter', label: 'Encounter' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'incidents', label: 'Incidents' },
    { key: 'schedule', label: 'Schedule' },
];

function formatDate(d) {
    if (!d) return '\u2014';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d, t) {
    const date = formatDate(d);
    if (!t) return date;
    const [h, m] = t.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 || 12;
    return `${date} at ${hr12}:${m} ${ampm}`;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function computeAge(dob) {
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function ClientDetailPage() {
    const { clientId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { isAdmin } = useAuth();

    const [client, setClient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);
    const [activeTab, setActiveTab] = useState('summary');
    const [expandedFolders, setExpandedFolders] = useState({});

    // Modal states
    const [showCareTeamModal, setShowCareTeamModal] = useState(false);
    const [careTeamForm, setCareTeamForm] = useState({ employeeId: '', role: 'agency_pca' });
    const [showDocUploadModal, setShowDocUploadModal] = useState(false);
    const [docFile, setDocFile] = useState(null);
    const [docCategory, setDocCategory] = useState('admission_packet');
    const [docNotes, setDocNotes] = useState('');
    const [showVisitModal, setShowVisitModal] = useState(false);
    const [editingVisit, setEditingVisit] = useState(null);
    const [visitForm, setVisitForm] = useState({ visitDate: '', visitTime: '', providerName: '', location: '', purpose: '', status: 'upcoming', notes: '' });
    const [showIncidentModal, setShowIncidentModal] = useState(false);
    const [editingIncident, setEditingIncident] = useState(null);
    const [incidentForm, setIncidentForm] = useState({ incidentDate: '', description: '', severity: 'minor', reportedBy: '', notes: '' });
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [saving, setSaving] = useState(false);
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState('');

    const fetchClient = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getClient(Number(clientId));
            setClient(data);
            setNotesValue(data.notes || '');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [clientId, showToast]);

    const fetchEmployees = useCallback(async () => {
        try {
            setEmployees(await api.getEmployees());
        } catch (err) { /* ignore */ }
    }, []);

    useEffect(() => { fetchClient(); fetchEmployees(); }, [fetchClient, fetchEmployees]);

    // Care Team handlers
    const handleAddCareTeam = async (e) => {
        e.preventDefault();
        if (!careTeamForm.employeeId) return;
        setSaving(true);
        try {
            await api.addCareTeamMember(client.id, careTeamForm);
            showToast('PCA assigned');
            setShowCareTeamModal(false);
            setCareTeamForm({ employeeId: '', role: 'agency_pca' });
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleRemoveCareTeam = async (memberId) => {
        try {
            await api.removeCareTeamMember(client.id, memberId);
            showToast('PCA removed');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Document handlers
    const handleUploadDoc = async (e) => {
        e.preventDefault();
        if (!docFile) return;
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('file', docFile);
            formData.append('category', docCategory);
            formData.append('notes', docNotes);
            await api.uploadDocument(client.id, formData);
            showToast('Document uploaded');
            setShowDocUploadModal(false);
            setDocFile(null);
            setDocNotes('');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleDownloadDoc = async (doc) => {
        try {
            const blob = await api.downloadDocument(doc.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteDoc = async (doc) => {
        try {
            await api.deleteDocument(doc.id);
            showToast('Document deleted');
            setConfirmDelete(null);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Hospital Visit handlers
    const openVisitModal = (visit = null) => {
        if (visit) {
            setEditingVisit(visit);
            setVisitForm({
                visitDate: visit.visitDate ? new Date(visit.visitDate).toISOString().split('T')[0] : '',
                visitTime: visit.visitTime || '',
                providerName: visit.providerName || '',
                location: visit.location || '',
                purpose: visit.purpose || '',
                status: visit.status || 'upcoming',
                notes: visit.notes || '',
            });
        } else {
            setEditingVisit(null);
            setVisitForm({ visitDate: '', visitTime: '', providerName: '', location: '', purpose: '', status: 'upcoming', notes: '' });
        }
        setShowVisitModal(true);
    };

    const handleSaveVisit = async (e) => {
        e.preventDefault();
        if (!visitForm.visitDate) return;
        setSaving(true);
        try {
            if (editingVisit) {
                await api.updateHospitalVisit(editingVisit.id, visitForm);
                showToast('Visit updated');
            } else {
                await api.createHospitalVisit(client.id, visitForm);
                showToast('Visit scheduled');
            }
            setShowVisitModal(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleDeleteVisit = async (visit) => {
        try {
            await api.deleteHospitalVisit(visit.id);
            showToast('Visit deleted');
            setConfirmDelete(null);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Incident handlers
    const openIncidentModal = (incident = null) => {
        if (incident) {
            setEditingIncident(incident);
            setIncidentForm({
                incidentDate: incident.incidentDate ? new Date(incident.incidentDate).toISOString().split('T')[0] : '',
                description: incident.description || '',
                severity: incident.severity || 'minor',
                reportedBy: incident.reportedBy || '',
                notes: incident.notes || '',
            });
        } else {
            setEditingIncident(null);
            setIncidentForm({ incidentDate: '', description: '', severity: 'minor', reportedBy: '', notes: '' });
        }
        setShowIncidentModal(true);
    };

    const handleSaveIncident = async (e) => {
        e.preventDefault();
        if (!incidentForm.incidentDate) return;
        setSaving(true);
        try {
            if (editingIncident) {
                await api.updateIncident(editingIncident.id, incidentForm);
                showToast('Incident updated');
            } else {
                await api.createIncident(client.id, incidentForm);
                showToast('Incident reported');
            }
            setShowIncidentModal(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleResolveIncident = async (incident) => {
        try {
            await api.updateIncident(incident.id, { status: 'resolved', resolvedAt: new Date().toISOString() });
            showToast('Incident resolved');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteIncident = async (incident) => {
        try {
            await api.deleteIncident(incident.id);
            showToast('Incident deleted');
            setConfirmDelete(null);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Notes handler
    const handleSaveNotes = async () => {
        try {
            await api.patchClient(client.id, { notes: notesValue });
            showToast('Notes saved');
            setEditingNotes(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const toggleFolder = (key) => {
        setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading) {
        return (
            <div className="page-content">
                <div className="cp-loading">
                    <div className="cp-loading__spinner" />
                    <div>Loading care plan...</div>
                </div>
            </div>
        );
    }
    if (!client) return <div className="page-content"><div className="empty-state"><div className="empty-state__title">Client not found</div></div></div>;

    const enabledServices = (() => { try { return JSON.parse(client.enabledServices); } catch { return []; } })();
    const docsByCategory = (client.documents || []).reduce((acc, d) => {
        if (!acc[d.category]) acc[d.category] = [];
        acc[d.category].push(d);
        return acc;
    }, {});
    const totalDocs = (client.documents || []).length;

    const authGroups = {};
    (client.authorizations || []).forEach(a => {
        const key = a.serviceCode || a.serviceCategory || 'Other';
        if (!authGroups[key]) authGroups[key] = [];
        authGroups[key].push(a);
    });

    const openIncidents = (client.incidents || []).filter(i => i.status === 'open').length;

    // Build timeline: merge hospital visits + renewal notes, sorted by date descending
    const timelineItems = [
        ...(client.hospitalVisits || []).map(v => ({
            type: 'visit',
            date: v.visitDate,
            data: v,
        })),
        ...(client.clientNotes || []).map(n => ({
            type: 'renewal',
            date: n.date,
            data: n,
        })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <>
            {/* Page Header */}
            <div className="content-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn--ghost btn--icon" onClick={() => navigate('/clients')} title="Back to clients">
                        {Icons.chevronLeft}
                    </button>
                    <div>
                        <h1 className="content-header__title" style={{ margin: 0 }}>Care Plans</h1>
                        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            Client Profile & Care Management
                        </div>
                    </div>
                </div>
                <div className="content-header__actions">
                    <EntityActivityButton entityType="Client" entityId={client.id} />
                    <button className="btn btn--outline btn--sm" onClick={() => navigate(`/clients/${client.id}/edit`)}>
                        {Icons.edit} Edit Client
                    </button>
                </div>
            </div>

            <div className="page-content cp-page">

                {/* ═══ BIO DATA CARD ═══ */}
                <div className="cp-bio">
                    <div className="cp-bio__main">
                        <div className="cp-bio__avatar">
                            {client.clientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="cp-bio__info">
                            <div className="cp-bio__name-row">
                                <h2 className="cp-bio__name">{client.clientName}</h2>
                                {client.critical && <span className="ts-badge ts-badge--critical">Critical</span>}
                            </div>
                            <div className="cp-bio__chips">
                                {client.insuranceType && (
                                    <span className="cp-chip cp-chip--program">{client.insuranceType}</span>
                                )}
                                {client.critical && (
                                    <span className="cp-chip cp-chip--risk">Fall Risk</span>
                                )}
                                {openIncidents > 0 && (
                                    <span className="cp-chip cp-chip--complaint">
                                        {openIncidents} Open Incident{openIncidents > 1 ? 's' : ''}
                                    </span>
                                )}
                                {enabledServices.map(s => (
                                    <span key={s} className="cp-service-chip cp-service-chip--sm">{s}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="cp-bio__fields">
                        {client.medicaidId && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">MRN</span>
                                <span className="cp-bio__field-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{client.medicaidId}</span>
                            </div>
                        )}
                        {client.dob && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">D.O.B.</span>
                                <span className="cp-bio__field-value">
                                    {new Date(client.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {' '}({computeAge(client.dob)} yrs)
                                </span>
                            </div>
                        )}
                        {client.insuranceType && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Insurance</span>
                                <span className="cp-bio__field-value">{client.insuranceType}</span>
                            </div>
                        )}
                        {client.phone && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Phone</span>
                                <span className="cp-bio__field-value">{client.phone}</span>
                            </div>
                        )}
                        {client.address && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Address</span>
                                <span className="cp-bio__field-value">{client.address}</span>
                            </div>
                        )}
                        {client.paNumber && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">PA#</span>
                                <span className="cp-bio__field-value">{client.paNumber}</span>
                            </div>
                        )}
                        {client.doctorName && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Doctor</span>
                                <span className="cp-bio__field-value">
                                    {client.doctorName}{client.doctorPhone ? ` \u2022 ${client.doctorPhone}` : ''}
                                </span>
                            </div>
                        )}
                        {client.backupDoctorName && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Backup Doctor</span>
                                <span className="cp-bio__field-value">
                                    {client.backupDoctorName}{client.backupDoctorPhone ? ` \u2022 ${client.backupDoctorPhone}` : ''}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ TAB NAVIGATION ═══ */}
                <div className="cp-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`cp-tab ${activeTab === tab.key ? 'cp-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                            {tab.key === 'incidents' && openIncidents > 0 && (
                                <span className="cp-tab__badge cp-tab__badge--danger">{openIncidents}</span>
                            )}
                            {tab.key === 'timeline' && timelineItems.length > 0 && (
                                <span className="cp-tab__badge">{timelineItems.length}</span>
                            )}
                            {tab.key === 'care-plan' && totalDocs > 0 && (
                                <span className="cp-tab__badge">{totalDocs}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ═══ TAB CONTENT ═══ */}
                <div className="cp-tab-content">

                    {/* ── SUMMARY TAB ── */}
                    {activeTab === 'summary' && (
                        <div className="cp-tab-panel">
                            <div className="cp-summary-grid">
                                {/* Care Plan Overview */}
                                <div className="cp-card cp-card--elevated">
                                    <div className="cp-card__header">
                                        <h3 className="cp-card__title">
                                            <span className="cp-card__dot cp-card__dot--green" />
                                            Care Plan Overview
                                        </h3>
                                    </div>
                                    <div className="cp-card__body">
                                        {Object.keys(authGroups).length === 0 ? (
                                            <div className="cp-empty-state-card">
                                                <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                                <p>No authorizations on file.</p>
                                            </div>
                                        ) : (
                                            <div className="cp-auth-sections">
                                                {Object.entries(authGroups).map(([code, auths]) => {
                                                    const colors = AUTH_COLORS[code] || DEFAULT_AUTH_COLOR;
                                                    return (
                                                        <div key={code} className="cp-auth-group" style={{ '--auth-accent': colors.accent, '--auth-bg': colors.bg }}>
                                                            <div className="cp-auth-group__bar" />
                                                            <div className="cp-auth-group__content">
                                                                <h4 className="cp-auth-group__title">{colors.label || `${code} Service Authorization`}</h4>
                                                                {auths.map(a => (
                                                                    <div key={a.id} className="cp-auth-item">
                                                                        <div className="cp-auth-item__row">
                                                                            <span className="cp-auth-item__dot" style={{ background: colors.accent }} />
                                                                            <span className="cp-auth-item__name">{a.serviceName || a.serviceCategory || code}</span>
                                                                            {a.authorizedUnits > 0 && (
                                                                                <span className="cp-auth-item__units">{a.authorizedUnits} units</span>
                                                                            )}
                                                                        </div>
                                                                        {(a.authorizationStartDate || a.authorizationEndDate) && (
                                                                            <div className="cp-auth-item__dates">
                                                                                {a.authorizationStartDate && formatDate(a.authorizationStartDate)}
                                                                                {a.authorizationStartDate && a.authorizationEndDate && ' \u2013 '}
                                                                                {a.authorizationEndDate && formatDate(a.authorizationEndDate)}
                                                                            </div>
                                                                        )}
                                                                        {a.daysToExpire !== null && (
                                                                            <div className="cp-auth-item__status">
                                                                                <span className={`ts-badge ts-badge--${a.status === 'Expired' ? 'critical' : a.status === 'Renewal Reminder' ? 'draft' : 'submitted'}`}>
                                                                                    {a.status} {a.daysToExpire >= 0 ? `(${a.daysToExpire}d)` : `(${Math.abs(a.daysToExpire)}d ago)`}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Care Team */}
                                <div className="cp-card cp-card--elevated">
                                    <div className="cp-card__header">
                                        <h3 className="cp-card__title">Care Team</h3>
                                        <button className="btn btn--outline btn--xs" onClick={() => setShowCareTeamModal(true)}>{Icons.plus} Assign</button>
                                    </div>
                                    <div className="cp-card__body">
                                        {(!client.careTeam || client.careTeam.length === 0) ? (
                                            <div className="cp-empty-state-card">
                                                <div className="cp-empty-state-card__icon">{Icons.users}</div>
                                                <p>No PCA assigned yet.</p>
                                            </div>
                                        ) : (
                                            <ol className="cp-care-team-list">
                                                {client.careTeam.map(m => (
                                                    <li key={m.id} className="cp-care-team-item">
                                                        <span className="cp-care-team-name">{m.employee.name}</span>
                                                        <span className="cp-care-team-role">
                                                            ({m.role === 'family_pca' ? 'Family' : 'Agency'})
                                                        </span>
                                                        <button className="btn btn--danger-ghost btn--icon cp-inline-action" title="Remove" onClick={() => handleRemoveCareTeam(m.id)}>
                                                            {Icons.trash}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="cp-card cp-card--elevated">
                                    <div className="cp-card__header">
                                        <h3 className="cp-card__title">Notes</h3>
                                        {!editingNotes ? (
                                            <button className="btn btn--ghost btn--xs" onClick={() => setEditingNotes(true)}>{Icons.edit}</button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn--outline btn--xs" onClick={() => { setEditingNotes(false); setNotesValue(client.notes || ''); }}>Cancel</button>
                                                <button className="btn btn--primary btn--xs" onClick={handleSaveNotes}>Save</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="cp-card__body">
                                        {editingNotes ? (
                                            <textarea
                                                value={notesValue}
                                                onChange={(e) => setNotesValue(e.target.value)}
                                                rows={4}
                                                className="cp-notes-textarea"
                                                placeholder="Add notes about this client..."
                                            />
                                        ) : (
                                            <div className="cp-notes-content">
                                                {notesValue ? notesValue.split('\n').filter(l => l.trim()).map((line, i) => (
                                                    <div key={i} className="cp-notes-line">
                                                        <span className="cp-notes-bullet" />
                                                        {line.replace(/^[-\u2022]\s*/, '')}
                                                    </div>
                                                )) : <span className="cp-empty-text">No notes yet.</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Quick Stats */}
                                <div className="cp-card cp-card--elevated">
                                    <div className="cp-card__header">
                                        <h3 className="cp-card__title">Quick Stats</h3>
                                    </div>
                                    <div className="cp-card__body">
                                        <div className="cp-stats-grid">
                                            <div className="cp-stat">
                                                <div className="cp-stat__value">{(client.authorizations || []).length}</div>
                                                <div className="cp-stat__label">Authorizations</div>
                                            </div>
                                            <div className="cp-stat">
                                                <div className="cp-stat__value">{(client.careTeam || []).length}</div>
                                                <div className="cp-stat__label">Care Team</div>
                                            </div>
                                            <div className="cp-stat">
                                                <div className="cp-stat__value">{totalDocs}</div>
                                                <div className="cp-stat__label">Documents</div>
                                            </div>
                                            <div className="cp-stat">
                                                <div className="cp-stat__value">{(client.hospitalVisits || []).length}</div>
                                                <div className="cp-stat__label">Visits</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── TIMELINE TAB ── */}
                    {activeTab === 'timeline' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Activity Timeline</h3>
                                    <button className="btn btn--outline btn--sm" onClick={() => openVisitModal()}>{Icons.plus} Schedule Visit</button>
                                </div>
                                <div className="cp-card__body">
                                    {timelineItems.length === 0 ? (
                                        <div className="cp-empty-state-card">
                                            <div className="cp-empty-state-card__icon">{Icons.clock}</div>
                                            <p>No timeline events yet.</p>
                                            <button className="btn btn--outline btn--sm" onClick={() => openVisitModal()}>Schedule First Visit</button>
                                        </div>
                                    ) : (
                                        <div className="cp-visit-timeline">
                                            {timelineItems.map((item, i) => {
                                                if (item.type === 'visit') {
                                                    const v = item.data;
                                                    return (
                                                        <div key={`v-${v.id}`} className="cp-visit-entry">
                                                            <div className="cp-visit-entry__track">
                                                                <span className={`cp-timeline-dot cp-timeline-dot--${v.status === 'completed' ? 'green' : v.status === 'cancelled' ? 'gray' : 'blue'}`} />
                                                                {i < timelineItems.length - 1 && <span className="cp-timeline-line" />}
                                                            </div>
                                                            <div className="cp-visit-entry__card">
                                                                <div className="cp-visit-entry__top">
                                                                    <div className="cp-visit-entry__title">{v.purpose || 'Hospital Visit'}</div>
                                                                    <span className={`ts-badge ts-badge--${v.status === 'completed' ? 'submitted' : v.status === 'cancelled' ? 'draft' : 'upcoming'}`}>
                                                                        {v.status.toUpperCase()}
                                                                    </span>
                                                                </div>
                                                                <div className="cp-visit-entry__meta">
                                                                    {formatDateTime(v.visitDate, v.visitTime)}
                                                                    {v.providerName && <> &bull; {v.providerName}</>}
                                                                    {v.location && <> &bull; {v.location}</>}
                                                                </div>
                                                                <div className="cp-visit-entry__actions">
                                                                    <button className="btn btn--ghost btn--icon" title="Edit" onClick={() => openVisitModal(v)}>{Icons.edit}</button>
                                                                    <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'visit', item: v })}>{Icons.trash}</button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                // Renewal note
                                                const note = item.data;
                                                return (
                                                    <div key={`n-${note.id}`} className="cp-visit-entry">
                                                        <div className="cp-visit-entry__track">
                                                            <span className="cp-timeline-dot" style={{ background: note.type === '60_DAY_RENEWAL' ? '#f59e0b' : note.type === '30_DAY_RENEWAL' ? '#ef4444' : '#8b5cf6' }} />
                                                            {i < timelineItems.length - 1 && <span className="cp-timeline-line" />}
                                                        </div>
                                                        <div className="cp-visit-entry__card">
                                                            <div className="cp-visit-entry__top">
                                                                <span className={`ts-badge ${note.type === '60_DAY_RENEWAL' ? 'ts-badge--draft' : note.type === '30_DAY_RENEWAL' ? 'ts-badge--critical' : 'ts-badge--upcoming'}`}>
                                                                    {note.type === '60_DAY_RENEWAL' ? '60-Day Renewal' : note.type === '30_DAY_RENEWAL' ? '30-Day Renewal' : 'Renewal Notice'}
                                                                </span>
                                                                <span className="cp-visit-entry__date">{formatDate(note.date)}</span>
                                                            </div>
                                                            <div className="cp-visit-entry__meta" style={{ whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
                                                                {note.content.substring(0, 300)}{note.content.length > 300 ? '...' : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── DIAGNOSES TAB (placeholder) ── */}
                    {activeTab === 'diagnoses' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Diagnoses</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                        <p>Diagnoses tracking coming soon.</p>
                                        <span className="cp-empty-text">This section will include ICD-10 codes and diagnosis history.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── MAR TAB (placeholder) ── */}
                    {activeTab === 'mar' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Medication Administration Record</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                        <p>MAR tracking coming soon.</p>
                                        <span className="cp-empty-text">This section will include medication schedules and administration logs.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ADL TAB (placeholder) ── */}
                    {activeTab === 'adl' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Activities of Daily Living</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                        <p>ADL tracking coming soon.</p>
                                        <span className="cp-empty-text">This section will include ADL assessment scores and progress tracking.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ASSESSMENT TAB (placeholder) ── */}
                    {activeTab === 'assessment' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Assessments</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                        <p>Assessment tracking coming soon.</p>
                                        <span className="cp-empty-text">This section will include care assessments and evaluations.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── CARE PLAN TAB (Documents) ── */}
                    {activeTab === 'care-plan' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">
                                        {Icons.folder} Documents
                                        {totalDocs > 0 && <span className="cp-card__count">{totalDocs}</span>}
                                    </h3>
                                    <button className="btn btn--primary btn--sm" onClick={() => { setDocCategory('admission_packet'); setShowDocUploadModal(true); }}>{Icons.upload} Upload</button>
                                </div>
                                <div className="cp-card__body cp-doc-folders">
                                    {DOC_CATEGORIES.map(cat => {
                                        const docs = docsByCategory[cat.value] || [];
                                        const isExpanded = expandedFolders[cat.value] !== false && docs.length > 0;
                                        return (
                                            <div key={cat.value} className={`cp-doc-folder ${docs.length > 0 ? 'cp-doc-folder--has-files' : ''}`}>
                                                <button
                                                    className="cp-doc-folder__header"
                                                    onClick={() => docs.length > 0 && toggleFolder(cat.value)}
                                                    style={{ '--folder-color': cat.color }}
                                                >
                                                    <span className="cp-doc-folder__chevron" style={{ opacity: docs.length > 0 ? 1 : 0, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                        {Icons.chevronRight}
                                                    </span>
                                                    <span className="cp-doc-folder__icon">{Icons.folder}</span>
                                                    <span className="cp-doc-folder__name">{cat.label}</span>
                                                    {docs.length > 0 && <span className="cp-doc-folder__count">{docs.length}</span>}
                                                    <button
                                                        className="btn btn--ghost btn--icon cp-doc-folder__upload"
                                                        title={`Upload to ${cat.label}`}
                                                        onClick={(e) => { e.stopPropagation(); setDocCategory(cat.value); setShowDocUploadModal(true); }}
                                                    >
                                                        {Icons.upload}
                                                    </button>
                                                </button>
                                                {isExpanded && docs.length > 0 && (
                                                    <div className="cp-doc-folder__files">
                                                        {docs.map(doc => (
                                                            <div key={doc.id} className="cp-doc-file">
                                                                <span className="cp-doc-file__icon">{Icons.paperclip}</span>
                                                                <span className="cp-doc-file__name">{doc.fileName}</span>
                                                                <span className="cp-doc-file__meta">{formatFileSize(doc.fileSize)}</span>
                                                                <span className="cp-doc-file__meta">{formatDate(doc.createdAt)}</span>
                                                                <div className="cp-doc-file__actions">
                                                                    <button className="btn btn--ghost btn--icon" title="Download" onClick={() => handleDownloadDoc(doc)}>{Icons.download}</button>
                                                                    <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'doc', item: doc })}>{Icons.trash}</button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ENCOUNTER TAB (placeholder) ── */}
                    {activeTab === 'encounter' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Encounters</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                        <p>Encounter tracking coming soon.</p>
                                        <span className="cp-empty-text">This section will include encounter notes and visit documentation.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── INSURANCE TAB ── */}
                    {activeTab === 'insurance' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Insurance & Authorizations</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-insurance-detail">
                                        <div className="cp-insurance-row">
                                            <span className="cp-insurance-label">Insurance Type</span>
                                            <span className="cp-insurance-value">{client.insuranceType || '\u2014'}</span>
                                        </div>
                                        <div className="cp-insurance-row">
                                            <span className="cp-insurance-label">Medicaid ID</span>
                                            <span className="cp-insurance-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{client.medicaidId || '\u2014'}</span>
                                        </div>
                                        <div className="cp-insurance-row">
                                            <span className="cp-insurance-label">PA Number</span>
                                            <span className="cp-insurance-value">{client.paNumber || '\u2014'}</span>
                                        </div>
                                    </div>
                                    <h4 style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 12px', color: 'hsl(var(--foreground))' }}>Authorization Details</h4>
                                    {Object.keys(authGroups).length === 0 ? (
                                        <div className="cp-empty-state-card">
                                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                            <p>No authorizations on file.</p>
                                        </div>
                                    ) : (
                                        <table className="data-table" style={{ fontSize: 12 }}>
                                            <thead>
                                                <tr>
                                                    <th>Service</th>
                                                    <th>Code</th>
                                                    <th>Units</th>
                                                    <th>Start</th>
                                                    <th>End</th>
                                                    <th>Status</th>
                                                    <th>Days</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(client.authorizations || []).map(a => (
                                                    <tr key={a.id}>
                                                        <td>{a.serviceName || a.serviceCategory || '\u2014'}</td>
                                                        <td><code>{a.serviceCode}</code></td>
                                                        <td>{a.authorizedUnits || '\u2014'}</td>
                                                        <td>{formatDate(a.authorizationStartDate)}</td>
                                                        <td>{formatDate(a.authorizationEndDate)}</td>
                                                        <td>
                                                            <span className={`ts-badge ts-badge--${a.status === 'Expired' ? 'critical' : a.status === 'Renewal Reminder' ? 'draft' : 'submitted'}`}>
                                                                {a.status}
                                                            </span>
                                                        </td>
                                                        <td>{a.daysToExpire !== null ? a.daysToExpire : '\u2014'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── INCIDENTS TAB ── */}
                    {activeTab === 'incidents' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Incident Reporting</h3>
                                    <button className="btn btn--primary btn--sm" onClick={() => openIncidentModal()}>{Icons.plus} Report Incident</button>
                                </div>
                                <div className="cp-card__body">
                                    {(!client.incidents || client.incidents.length === 0) ? (
                                        <div className="cp-empty-state-card">
                                            <div className="cp-empty-state-card__icon">{Icons.checkCircle}</div>
                                            <p>No incidents reported.</p>
                                        </div>
                                    ) : (
                                        <div className="cp-incident-list">
                                            {client.incidents.map(inc => (
                                                <div key={inc.id} className={`cp-incident-entry ${inc.status === 'open' ? 'cp-incident-entry--open' : 'cp-incident-entry--resolved'}`}>
                                                    <div className="cp-incident-entry__icon">
                                                        {inc.status === 'open' ? Icons.alertCircle : Icons.checkCircle}
                                                    </div>
                                                    <div className="cp-incident-entry__content">
                                                        <div className="cp-incident-entry__top">
                                                            <div className="cp-incident-entry__title">{inc.description || 'Incident'}</div>
                                                            <span className={`ts-badge ts-badge--${inc.status === 'resolved' ? 'submitted' : 'draft'}`}>
                                                                {inc.status === 'resolved' ? 'RESOLVED' : 'OPEN'}
                                                            </span>
                                                        </div>
                                                        <div className="cp-incident-entry__meta">
                                                            {formatDate(inc.incidentDate)}
                                                            {inc.severity && <> &bull; <span style={{ textTransform: 'capitalize' }}>{inc.severity}</span></>}
                                                            {inc.reportedBy && <> &bull; Reported by {inc.reportedBy}</>}
                                                        </div>
                                                        {inc.notes && (
                                                            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{inc.notes}</div>
                                                        )}
                                                    </div>
                                                    <div className="cp-incident-entry__actions">
                                                        {inc.status === 'open' && (
                                                            <button className="btn btn--success btn--xs" title="Resolve" onClick={() => handleResolveIncident(inc)}>{Icons.checkCircle} Resolve</button>
                                                        )}
                                                        <button className="btn btn--ghost btn--icon" title="Edit" onClick={() => openIncidentModal(inc)}>{Icons.edit}</button>
                                                        <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'incident', item: inc })}>{Icons.trash}</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── SCHEDULE TAB ── */}
                    {activeTab === 'schedule' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Client Schedule</h3>
                                    <button className="btn btn--outline btn--sm" onClick={() => navigate('/scheduling')}>
                                        {Icons.calendar} View Full Schedule
                                    </button>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.calendar}</div>
                                        <p>View this client's shifts on the Scheduling page.</p>
                                        <button className="btn btn--primary btn--sm" onClick={() => navigate('/scheduling')}>Go to Scheduling</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ MODALS ═══ */}

            {showCareTeamModal && (
                <Modal onClose={() => setShowCareTeamModal(false)}>
                    <h2 className="modal__title">Assign PCA</h2>
                    <p className="modal__desc">Select an employee to assign as this client's PCA.</p>
                    <form onSubmit={handleAddCareTeam}>
                        <div className="form-group">
                            <label>Employee</label>
                            <select value={careTeamForm.employeeId} onChange={(e) => setCareTeamForm({ ...careTeamForm, employeeId: e.target.value })} required>
                                <option value="">Select employee...</option>
                                {employees.filter(e => e.active !== false).map(e => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Role</label>
                            <select value={careTeamForm.role} onChange={(e) => setCareTeamForm({ ...careTeamForm, role: e.target.value })}>
                                <option value="agency_pca">Agency PCA</option>
                                <option value="family_pca">Family PCA</option>
                            </select>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowCareTeamModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !careTeamForm.employeeId}>{saving ? 'Assigning...' : 'Assign PCA'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {showDocUploadModal && (
                <Modal onClose={() => setShowDocUploadModal(false)}>
                    <h2 className="modal__title">Upload Document</h2>
                    <form onSubmit={handleUploadDoc}>
                        <div className="form-group">
                            <label>Category</label>
                            <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                                {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>File</label>
                            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setDocFile(e.target.files[0])} required />
                        </div>
                        <div className="form-group">
                            <label>Notes (optional)</label>
                            <input type="text" value={docNotes} onChange={(e) => setDocNotes(e.target.value)} placeholder="Description" />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowDocUploadModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !docFile}>{saving ? 'Uploading...' : 'Upload'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {showVisitModal && (
                <Modal onClose={() => setShowVisitModal(false)}>
                    <h2 className="modal__title">{editingVisit ? 'Edit Visit' : 'Schedule Visit'}</h2>
                    <form onSubmit={handleSaveVisit}>
                        <div className="form-group">
                            <label>Date</label>
                            <input type="date" value={visitForm.visitDate} onChange={(e) => setVisitForm({ ...visitForm, visitDate: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Time</label>
                            <input type="time" value={visitForm.visitTime} onChange={(e) => setVisitForm({ ...visitForm, visitTime: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Provider</label>
                            <input type="text" value={visitForm.providerName} onChange={(e) => setVisitForm({ ...visitForm, providerName: e.target.value })} placeholder="Dr. name" />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input type="text" value={visitForm.location} onChange={(e) => setVisitForm({ ...visitForm, location: e.target.value })} placeholder="Room / facility" />
                        </div>
                        <div className="form-group">
                            <label>Purpose</label>
                            <input type="text" value={visitForm.purpose} onChange={(e) => setVisitForm({ ...visitForm, purpose: e.target.value })} placeholder="e.g. Cardiology Follow-up" />
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select value={visitForm.status} onChange={(e) => setVisitForm({ ...visitForm, status: e.target.value })}>
                                <option value="upcoming">Upcoming</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} rows={3} placeholder="Additional notes" />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowVisitModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !visitForm.visitDate}>{saving ? 'Saving...' : editingVisit ? 'Update Visit' : 'Schedule Visit'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {showIncidentModal && (
                <Modal onClose={() => setShowIncidentModal(false)}>
                    <h2 className="modal__title">{editingIncident ? 'Edit Incident' : 'Report Incident'}</h2>
                    <form onSubmit={handleSaveIncident}>
                        <div className="form-group">
                            <label>Date</label>
                            <input type="date" value={incidentForm.incidentDate} onChange={(e) => setIncidentForm({ ...incidentForm, incidentDate: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} rows={3} placeholder="What happened?" />
                        </div>
                        <div className="form-group">
                            <label>Severity</label>
                            <select value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
                                <option value="minor">Minor</option>
                                <option value="moderate">Moderate</option>
                                <option value="severe">Severe</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Reported By</label>
                            <input type="text" value={incidentForm.reportedBy} onChange={(e) => setIncidentForm({ ...incidentForm, reportedBy: e.target.value })} placeholder="Name of reporter" />
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea value={incidentForm.notes} onChange={(e) => setIncidentForm({ ...incidentForm, notes: e.target.value })} rows={2} placeholder="Additional notes" />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowIncidentModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !incidentForm.incidentDate}>{saving ? 'Saving...' : editingIncident ? 'Update' : 'Report Incident'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {confirmDelete && (
                <ConfirmModal
                    title={`Delete ${confirmDelete.type === 'doc' ? 'Document' : confirmDelete.type === 'visit' ? 'Hospital Visit' : 'Incident'}`}
                    message={`Are you sure you want to delete this ${confirmDelete.type === 'doc' ? `document "${confirmDelete.item.fileName}"` : confirmDelete.type === 'visit' ? 'hospital visit' : 'incident'}? This cannot be undone.`}
                    confirmLabel="Delete"
                    confirmVariant="danger"
                    onConfirm={() => {
                        if (confirmDelete.type === 'doc') handleDeleteDoc(confirmDelete.item);
                        else if (confirmDelete.type === 'visit') handleDeleteVisit(confirmDelete.item);
                        else handleDeleteIncident(confirmDelete.item);
                    }}
                    onClose={() => setConfirmDelete(null)}
                />
            )}
        </>
    );
}
