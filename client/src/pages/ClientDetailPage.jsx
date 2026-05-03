import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
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

// Color mapping for authorization service code groups
const AUTH_COLORS = {
    PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', label: 'PCA Service Authorization' },
    SDPC: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', label: 'SDPC Service Authorization' },
    S5130: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', label: 'Homemaker Service Authorization' },
    S5150: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', label: 'Respite Service Authorization' },
    S5125: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', label: 'Attendant Care Authorization' },
    S5135: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', label: 'Companion Service Authorization' },
};
const DEFAULT_AUTH_COLOR = { accent: '#64748b', bg: 'hsl(215 20% 96%)', label: 'Service Authorization' };

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

export default function ClientDetailPage() {
    const { clientId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { isAdmin } = useAuth();

    const [client, setClient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);
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

    // Group authorizations by service code category for display
    const authGroups = {};
    (client.authorizations || []).forEach(a => {
        const key = a.serviceCode || a.serviceCategory || 'Other';
        if (!authGroups[key]) authGroups[key] = [];
        authGroups[key].push(a);
    });

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
            </div>

            <div className="page-content cp-page">

                {/* ═══ TOP ROW: Client Profile Banner ═══ */}
                <div className="cp-hero">
                    {/* Profile Section */}
                    <div className="cp-hero__profile">
                        <div className="cp-hero__avatar">
                            {client.clientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="cp-hero__info">
                            <h2 className="cp-hero__name">
                                {client.clientName}
                                {client.critical && <span className="ts-badge ts-badge--critical" style={{ marginLeft: 8 }}>Critical</span>}
                            </h2>
                            <div className="cp-hero__fields">
                                {client.medicaidId && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">MRN</span>
                                        <span className="cp-hero__field-value">{client.medicaidId}</span>
                                    </div>
                                )}
                                {client.insuranceType && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">Insurance</span>
                                        <span className="cp-hero__field-value">{client.insuranceType}</span>
                                    </div>
                                )}
                                {client.phone && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">Phone</span>
                                        <span className="cp-hero__field-value">{client.phone}</span>
                                    </div>
                                )}
                                {client.address && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">Address</span>
                                        <span className="cp-hero__field-value">{client.address}</span>
                                    </div>
                                )}
                                {client.dob && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">D.O.B.</span>
                                        <span className="cp-hero__field-value">
                                            {new Date(client.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {' '}({Math.floor((Date.now() - new Date(client.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs)
                                        </span>
                                    </div>
                                )}
                                {client.paNumber && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">PA#</span>
                                        <span className="cp-hero__field-value">{client.paNumber}</span>
                                    </div>
                                )}
                                {client.doctorName && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">Doctor</span>
                                        <span className="cp-hero__field-value">
                                            {client.doctorName}{client.doctorPhone ? ` \u2022 ${client.doctorPhone}` : ''}
                                        </span>
                                    </div>
                                )}
                                {client.backupDoctorName && (
                                    <div className="cp-hero__field">
                                        <span className="cp-hero__field-label">Backup Doctor</span>
                                        <span className="cp-hero__field-value">
                                            {client.backupDoctorName}{client.backupDoctorPhone ? ` \u2022 ${client.backupDoctorPhone}` : ''}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Services */}
                    <div className="cp-hero__section">
                        <div className="cp-hero__section-title">Services</div>
                        {enabledServices.length > 0 ? (
                            <div className="cp-services-list">
                                {enabledServices.map(s => (
                                    <span key={s} className="cp-service-chip">{s}</span>
                                ))}
                            </div>
                        ) : (
                            <p className="cp-empty-text">No services enabled</p>
                        )}
                    </div>

                    {/* Care Team */}
                    <div className="cp-hero__section">
                        <div className="cp-hero__section-header">
                            <div className="cp-hero__section-title">Care Team</div>
                            <button className="btn btn--outline btn--xs" onClick={() => setShowCareTeamModal(true)}>{Icons.plus} Assign</button>
                        </div>
                        {(!client.careTeam || client.careTeam.length === 0) ? (
                            <p className="cp-empty-text">No PCA assigned yet.</p>
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

                    {/* Notes */}
                    <div className="cp-hero__section">
                        <div className="cp-hero__section-header">
                            <div className="cp-hero__section-title">Notes</div>
                            {!editingNotes ? (
                                <button className="btn btn--ghost btn--xs" onClick={() => setEditingNotes(true)}>{Icons.edit}</button>
                            ) : (
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="btn btn--outline btn--xs" onClick={() => { setEditingNotes(false); setNotesValue(client.notes || ''); }}>Cancel</button>
                                    <button className="btn btn--primary btn--xs" onClick={handleSaveNotes}>Save</button>
                                </div>
                            )}
                        </div>
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

                {/* ═══ MAIN CONTENT: Two-column layout ═══ */}
                <div className="cp-main-grid">
                    {/* ─── LEFT COLUMN ─── */}
                    <div className="cp-left-col">
                        {/* Care Plan Overview */}
                        <div className="cp-card cp-card--elevated">
                            <div className="cp-card__header">
                                <h3 className="cp-card__title">
                                    <span className="cp-card__dot cp-card__dot--green" />
                                    Care Plan Overview
                                </h3>
                                <button className="btn btn--outline btn--sm" onClick={() => navigate('/authorizations')}>{Icons.eye} View Authorizations</button>
                            </div>
                            <div className="cp-card__body">
                                {Object.keys(authGroups).length === 0 ? (
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                        <p>No authorizations on file.</p>
                                        <button className="btn btn--outline btn--sm" onClick={() => navigate('/authorizations')}>Add Authorization</button>
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

                        {/* Documents — Folder-style categories */}
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

                    {/* ─── RIGHT COLUMN ─── */}
                    <div className="cp-right-col">
                        {/* Hospital Reporting */}
                        <div className="cp-card cp-card--elevated">
                            <div className="cp-card__header cp-card__header--hospital">
                                <div>
                                    <div className="cp-card__supertitle cp-card__supertitle--red">Hospital Reporting</div>
                                    <h3 className="cp-card__title">Visit & Progress Tracking</h3>
                                </div>
                                <button className="btn btn--outline btn--sm" onClick={() => openVisitModal()}>{Icons.plus} Schedule Visit</button>
                            </div>
                            <div className="cp-card__body">
                                {(!client.hospitalVisits || client.hospitalVisits.length === 0) ? (
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.building}</div>
                                        <p>No hospital visits recorded.</p>
                                        <button className="btn btn--outline btn--sm" onClick={() => openVisitModal()}>Schedule First Visit</button>
                                    </div>
                                ) : (
                                    <div className="cp-visit-timeline">
                                        {client.hospitalVisits.map((v, i) => (
                                            <div key={v.id} className="cp-visit-entry">
                                                <div className="cp-visit-entry__track">
                                                    <span className={`cp-timeline-dot cp-timeline-dot--${v.status === 'completed' ? 'green' : v.status === 'cancelled' ? 'gray' : 'blue'}`} />
                                                    {i < client.hospitalVisits.length - 1 && <span className="cp-timeline-line" />}
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
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Incident Reporting */}
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
                                                        {inc.reportedBy && <> &bull; Reported by {inc.reportedBy}</>}
                                                        {inc.resolution && <> &bull; {inc.resolution}</>}
                                                    </div>
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

                        {/* Supervisor Review Documents */}
                        <div className="cp-card cp-card--elevated">
                            <div className="cp-card__header">
                                <h3 className="cp-card__title">
                                    <span className="cp-card__supertitle" style={{ color: '#64748b' }}>Supervisor Review Documents</span>
                                </h3>
                                <button className="btn btn--outline btn--sm" onClick={() => { setDocCategory('supervisor_review'); setShowDocUploadModal(true); }}>{Icons.upload} Upload</button>
                            </div>
                            <div className="cp-card__body">
                                {(!docsByCategory['supervisor_review'] || docsByCategory['supervisor_review'].length === 0) ? (
                                    <div className="cp-empty-state-card">
                                        <div className="cp-empty-state-card__icon">{Icons.fileText}</div>
                                        <p>No supervisor review documents.</p>
                                        <button className="btn btn--outline btn--sm" onClick={() => { setDocCategory('supervisor_review'); setShowDocUploadModal(true); }}>Upload First Document</button>
                                    </div>
                                ) : (
                                    <div className="cp-doc-folder__files">
                                        {docsByCategory['supervisor_review'].map(doc => (
                                            <div key={doc.id} className="cp-doc-file">
                                                <span className="cp-doc-file__icon">{Icons.paperclip}</span>
                                                <span className="cp-doc-file__name">{doc.fileName}</span>
                                                <span className="cp-doc-file__meta">{formatFileSize(doc.fileSize)}</span>
                                                <div className="cp-doc-file__actions" style={{ opacity: 1 }}>
                                                    <button className="btn btn--ghost btn--icon" title="Download" onClick={() => handleDownloadDoc(doc)}>{Icons.download}</button>
                                                    <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'doc', item: doc })}>{Icons.trash}</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Client Notes / Renewal History */}
                        <div className="cp-card cp-card--elevated">
                            <div className="cp-card__header">
                                <h3 className="cp-card__title">
                                    <span className="cp-card__dot" style={{ background: '#8b5cf6' }} />
                                    Renewal History
                                </h3>
                                <span className="cp-card__count">{(client.clientNotes || []).length}</span>
                            </div>
                            {(!client.clientNotes || client.clientNotes.length === 0) ? (
                                <div className="cp-empty-card">
                                    <div className="cp-empty-card__icon">{Icons.fileText}</div>
                                    <div className="cp-empty-card__text">No renewal history</div>
                                </div>
                            ) : (
                                <div className="cp-timeline">
                                    {client.clientNotes.map(note => (
                                        <div key={note.id} className="cp-visit-entry">
                                            <div className="cp-visit-entry__track">
                                                <div className="cp-timeline-dot" style={{ '--dot-color': note.type === '60_DAY_RENEWAL' ? '#f59e0b' : note.type === '30_DAY_RENEWAL' ? '#ef4444' : '#8b5cf6' }} />
                                                <div className="cp-timeline-line" />
                                            </div>
                                            <div className="cp-visit-entry__content">
                                                <div className="cp-visit-entry__header">
                                                    <span className={`ts-badge ${note.type === '60_DAY_RENEWAL' ? 'ts-badge--draft' : note.type === '30_DAY_RENEWAL' ? 'ts-badge--submitted' : 'ts-badge--upcoming'}`}>
                                                        {note.type === '60_DAY_RENEWAL' ? '60-Day Notice' : note.type === '30_DAY_RENEWAL' ? '30-Day Notice' : 'Renewal Notice'}
                                                    </span>
                                                    <span className="cp-visit-entry__date">{formatDate(note.date)}</span>
                                                </div>
                                                <div className="cp-visit-entry__details" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                                                    {note.content.substring(0, 200)}{note.content.length > 200 ? '...' : ''}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
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
