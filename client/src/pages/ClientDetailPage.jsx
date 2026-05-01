import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

const DOC_CATEGORIES = [
    { value: 'admission_packet', label: 'Admission Packets' },
    { value: 'transfer', label: 'Transfer Documents' },
    { value: 'discharge', label: 'Discharge Documents' },
    { value: 'auth_pca', label: 'PCA Authorization' },
    { value: 'auth_waiver', label: 'Waiver Authorization' },
    { value: 'auth_iso', label: 'ISO Authorization' },
    { value: 'supervisor_review', label: 'Supervisor Review' },
    { value: 'other', label: 'Other' },
];

function formatDate(d) {
    if (!d) return '\u2014';
    return new Date(d).toLocaleDateString();
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
    const [activeDocTab, setActiveDocTab] = useState('admission_packet');

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

    if (loading) return <div className="page-content"><div className="empty-state"><div className="empty-state__desc">Loading...</div></div></div>;
    if (!client) return <div className="page-content"><div className="empty-state"><div className="empty-state__title">Client not found</div></div></div>;

    const enabledServices = (() => { try { return JSON.parse(client.enabledServices); } catch { return []; } })();
    const docsByCategory = (client.documents || []).reduce((acc, d) => {
        if (!acc[d.category]) acc[d.category] = [];
        acc[d.category].push(d);
        return acc;
    }, {});

    return (
        <>
            {/* Header */}
            <div className="content-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn--ghost btn--icon" onClick={() => navigate('/clients')} title="Back to clients">
                        {Icons.chevronLeft}
                    </button>
                    <div>
                        <h1 className="content-header__title" style={{ margin: 0 }}>{client.clientName}</h1>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                            {client.medicaidId && <span>ID: {client.medicaidId}</span>}
                            {client.medicaidId && client.insuranceType && <span>&middot;</span>}
                            {client.insuranceType && <span>{client.insuranceType}</span>}
                            {client.phone && <><span>&middot;</span><span>{client.phone}</span></>}
                        </div>
                    </div>
                </div>
                <div className="content-header__actions">
                    {enabledServices.map(s => (
                        <span key={s} className="ts-badge ts-badge--submitted" style={{ fontSize: 11 }}>{s}</span>
                    ))}
                </div>
            </div>

            <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Care Team */}
                <div className="sheet-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{Icons.users} Care Team</h2>
                        <button className="btn btn--primary btn--sm" onClick={() => setShowCareTeamModal(true)}>{Icons.plus} Assign PCA</button>
                    </div>
                    {(!client.careTeam || client.careTeam.length === 0) ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>No PCA assigned yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {client.careTeam.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'hsl(var(--muted) / 0.3)', borderRadius: 8 }}>
                                    <div>
                                        <span style={{ fontWeight: 500 }}>{m.employee.name}</span>
                                        <span className={`ts-badge ts-badge--${m.role === 'family_pca' ? 'submitted' : 'draft'}`} style={{ marginLeft: 8, fontSize: 11 }}>
                                            {m.role === 'family_pca' ? 'Family PCA' : 'Agency PCA'}
                                        </span>
                                        {m.employee.phone && <span style={{ marginLeft: 12, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{m.employee.phone}</span>}
                                    </div>
                                    <button className="btn btn--danger-ghost btn--icon" title="Remove" onClick={() => handleRemoveCareTeam(m.id)}>{Icons.trash}</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Documents */}
                <div className="sheet-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{Icons.folder} Documents</h2>
                        <button className="btn btn--primary btn--sm" onClick={() => { setDocCategory(activeDocTab); setShowDocUploadModal(true); }}>{Icons.upload} Upload</button>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                        {DOC_CATEGORIES.map(cat => (
                            <button
                                key={cat.value}
                                className={`btn btn--sm ${activeDocTab === cat.value ? 'btn--primary' : 'btn--outline'}`}
                                onClick={() => setActiveDocTab(cat.value)}
                                style={{ fontSize: 12 }}
                            >
                                {cat.label}
                                {docsByCategory[cat.value]?.length ? ` (${docsByCategory[cat.value].length})` : ''}
                            </button>
                        ))}
                    </div>
                    {!docsByCategory[activeDocTab] || docsByCategory[activeDocTab].length === 0 ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>No documents in this category.</p>
                    ) : (
                        <table className="data-table">
                            <thead><tr><th>File</th><th>Size</th><th>Uploaded</th><th>By</th><th>Actions</th></tr></thead>
                            <tbody>
                                {docsByCategory[activeDocTab].map(doc => (
                                    <tr key={doc.id}>
                                        <td style={{ fontWeight: 500 }}>{Icons.paperclip} {doc.fileName}</td>
                                        <td>{formatFileSize(doc.fileSize)}</td>
                                        <td>{formatDate(doc.createdAt)}</td>
                                        <td>{doc.uploader?.name || '\u2014'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn--ghost btn--icon" title="Download" onClick={() => handleDownloadDoc(doc)}>{Icons.download}</button>
                                                <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'doc', item: doc })}>{Icons.trash}</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Hospital Visits */}
                <div className="sheet-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{Icons.building} Hospital Visits</h2>
                        <button className="btn btn--primary btn--sm" onClick={() => openVisitModal()}>{Icons.plus} Schedule Visit</button>
                    </div>
                    {(!client.hospitalVisits || client.hospitalVisits.length === 0) ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>No hospital visits recorded.</p>
                    ) : (
                        <table className="data-table">
                            <thead><tr><th>Date</th><th>Time</th><th>Provider</th><th>Location</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {client.hospitalVisits.map(v => (
                                    <tr key={v.id}>
                                        <td>{formatDate(v.visitDate)}</td>
                                        <td>{v.visitTime || '\u2014'}</td>
                                        <td>{v.providerName || '\u2014'}</td>
                                        <td>{v.location || '\u2014'}</td>
                                        <td>{v.purpose || '\u2014'}</td>
                                        <td>
                                            <span className={`ts-badge ts-badge--${v.status === 'completed' ? 'submitted' : v.status === 'cancelled' ? 'draft' : 'pending'}`}>
                                                {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn--ghost btn--icon" title="Edit" onClick={() => openVisitModal(v)}>{Icons.edit}</button>
                                                <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'visit', item: v })}>{Icons.trash}</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Incidents */}
                <div className="sheet-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{Icons.alertOctagon} Incidents</h2>
                        <button className="btn btn--primary btn--sm" onClick={() => openIncidentModal()}>{Icons.plus} Report Incident</button>
                    </div>
                    {(!client.incidents || client.incidents.length === 0) ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>No incidents reported.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {client.incidents.map(inc => (
                                <div key={inc.id} style={{
                                    padding: '12px 16px', borderRadius: 8, border: '1px solid hsl(var(--border))',
                                    background: inc.status === 'open' ? 'hsl(0 80% 96%)' : 'hsl(var(--muted) / 0.2)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: 500, marginBottom: 4 }}>{inc.description || 'Incident'}</div>
                                            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                                                {formatDate(inc.incidentDate)}
                                                {inc.reportedBy && <> &middot; Reported by {inc.reportedBy}</>}
                                                <span className={`ts-badge ts-badge--${inc.severity === 'severe' ? 'draft' : inc.severity === 'moderate' ? 'pending' : 'submitted'}`} style={{ marginLeft: 8, fontSize: 11 }}>
                                                    {inc.severity}
                                                </span>
                                            </div>
                                            {inc.resolution && <div style={{ fontSize: 13, marginTop: 4 }}>Resolution: {inc.resolution}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <span className={`ts-badge ts-badge--${inc.status === 'resolved' ? 'submitted' : 'draft'}`}>
                                                {inc.status === 'resolved' ? 'Resolved' : 'Open'}
                                            </span>
                                            {inc.status === 'open' && (
                                                <button className="btn btn--ghost btn--icon" title="Resolve" onClick={() => handleResolveIncident(inc)}>{Icons.checkCircle}</button>
                                            )}
                                            <button className="btn btn--ghost btn--icon" title="Edit" onClick={() => openIncidentModal(inc)}>{Icons.edit}</button>
                                            <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'incident', item: inc })}>{Icons.trash}</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Notes */}
                <div className="sheet-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{Icons.fileText} Notes</h2>
                        {!editingNotes ? (
                            <button className="btn btn--ghost btn--sm" onClick={() => setEditingNotes(true)}>{Icons.edit} Edit</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn--outline btn--sm" onClick={() => { setEditingNotes(false); setNotesValue(client.notes || ''); }}>Cancel</button>
                                <button className="btn btn--primary btn--sm" onClick={handleSaveNotes}>Save</button>
                            </div>
                        )}
                    </div>
                    {editingNotes ? (
                        <textarea
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            rows={6}
                            style={{ width: '100%', resize: 'vertical' }}
                            placeholder="Add notes about this client..."
                        />
                    ) : (
                        <p style={{ color: notesValue ? 'inherit' : 'hsl(var(--muted-foreground))', fontSize: 14, whiteSpace: 'pre-wrap' }}>
                            {notesValue || 'No notes yet.'}
                        </p>
                    )}
                </div>
            </div>

            {/* Modals */}

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
