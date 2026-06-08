import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import Breadcrumbs from '../components/common/Breadcrumbs';
import { EntityActivityButton } from '../components/common/ActivityDrawer';
import ActionBar from '../components/common/ActionBar';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import ProfileInsuranceTab from './client-tabs/ProfileInsuranceTab';
import ProgramsAuthTab from './client-tabs/ProgramsAuthTab';
import DocumentsTab from './client-tabs/DocumentsTab';
import CarePlanTab from './client-tabs/CarePlanTab';
import ScheduleTab from './client-tabs/ScheduleTab';
import ActivityLogTab from './client-tabs/ActivityLogTab';
import IncidentReportsTab from './client-tabs/IncidentReportsTab';
import TimesheetsTab from './client-tabs/TimesheetsTab';

const DOC_CATEGORIES = [
    { value: 'admission_packet', label: 'Client Admission Packets', color: '#3b82f6' },
    { value: 'auth_pca', label: 'PCA Service Authorization', color: '#22c55e' },
    { value: 'auth_waiver', label: 'Waiver Service Authorization', color: '#f59e0b' },
    { value: 'auth_iso', label: 'ISO Service Authorization', color: '#06b6d4' },
    { value: 'iso_admission', label: 'ISO Admission Packets', color: '#0891b2' },
    { value: 'transfer', label: 'Transfer Documents', color: '#8b5cf6' },
    { value: 'hipaa', label: 'HIPAA', color: '#dc2626' },
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
    { key: 'profile', label: 'Profile', icon: 'user' },
    { key: 'programs', label: 'Programs', icon: 'shieldCheck' },
    { key: 'documents', label: 'Documents', icon: 'folder' },
    { key: 'timesheets', label: 'Timesheets', icon: 'clock' },
    { key: 'care-plan', label: 'Care Plan', icon: 'heart' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
    { key: 'supervisory-review', label: 'Review', icon: 'checkSquare' },
    { key: 'billing', label: 'Billing', icon: 'dollarSign' },
    { key: 'activity', label: 'Activity', icon: 'clipboard' },
    { key: 'incidents', label: 'Incidents', icon: 'alertOctagon' },
];

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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

function unitsToHours(units) {
    if (!units) return '—';
    return (units / 4).toFixed(1);
}

export default function ClientDetailPage() {
    const { clientId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { isAdmin } = useAuth();

    const [client, setClient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);
    const [activeTab, setActiveTab] = useState('profile');
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
    const [confirmArchiveClient, setConfirmArchiveClient] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState('');

    // Edit Client modal
    const [showEditClientModal, setShowEditClientModal] = useState(false);
    const [editClientForm, setEditClientForm] = useState({});

    // PCA Notes / Caregiver Requirements / Main Services
    const [editingPcaNotes, setEditingPcaNotes] = useState(false);
    const [pcaNotesValue, setPcaNotesValue] = useState('');
    const [editingCaregiverReqs, setEditingCaregiverReqs] = useState(false);
    const [caregiverReqsValue, setCaregiverReqsValue] = useState('');
    const [editingMainServices, setEditingMainServices] = useState(false);
    const [mainServicesValue, setMainServicesValue] = useState('');

    // Insurance tab - authorization modals
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [editingAuth, setEditingAuth] = useState(null);
    const [authForm, setAuthForm] = useState({ serviceCode: '', authorizationNumber: '', authorizedUnits: '', authorizedHours: '', authorizationStartDate: '', authorizationEndDate: '', notes: '' });
    const [authServiceGroup, setAuthServiceGroup] = useState('');
    const [expandedAuthHistory, setExpandedAuthHistory] = useState({});
    const [expandedServiceCode, setExpandedServiceCode] = useState(null);
    const [summaryExpandedService, setSummaryExpandedService] = useState(null);
    const [authFilterStatus, setAuthFilterStatus] = useState('active');
    const [expandedAuthAttachments, setExpandedAuthAttachments] = useState({});

    const fetchClient = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getClient(Number(clientId));
            setClient(data);
            setNotesValue(data.notes || '');
            setPcaNotesValue(data.pcaNotes || '');
            setCaregiverReqsValue(data.caregiverRequirements || '');
            setMainServicesValue(data.mainServices || '');
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
            if (doc.mimeType === 'application/pdf' || doc.fileName?.toLowerCase().endsWith('.pdf')) {
                window.open(url, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = doc.fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
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

    const handleSavePcaNotes = async () => {
        try {
            await api.patchClient(client.id, { pcaNotes: pcaNotesValue });
            showToast('PCA notes saved');
            setEditingPcaNotes(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleSaveCaregiverReqs = async () => {
        try {
            await api.patchClient(client.id, { caregiverRequirements: caregiverReqsValue });
            showToast('Caregiver requirements saved');
            setEditingCaregiverReqs(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleSaveMainServices = async () => {
        try {
            await api.patchClient(client.id, { mainServices: mainServicesValue });
            showToast('Main services saved');
            setEditingMainServices(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const toggleFolder = (key) => {
        setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Edit Client modal handlers
    const openEditClientModal = () => {
        setEditClientForm({
            clientName: client.clientName || '',
            medicaidId: client.medicaidId || '',
            insuranceType: client.insuranceType || '',
            address: client.address || '',
            secondaryAddress: client.secondaryAddress || '',
            phone: client.phone || '',
            secondaryPhone: client.secondaryPhone || '',
            email: client.email || '',
            gender: client.gender || '',
            dob: client.dob ? new Date(client.dob).toISOString().split('T')[0] : '',
            gateCode: client.gateCode || '',
            doctorName: client.doctorName || '',
            doctorPhone: client.doctorPhone || '',
            backupDoctorName: client.backupDoctorName || '',
            backupDoctorPhone: client.backupDoctorPhone || '',
            critical: client.critical || false,
            emergencyContactName: client.emergencyContactName || '',
            emergencyContactPhone: client.emergencyContactPhone || '',
            emergencyContactRelation: client.emergencyContactRelation || '',
            secondaryEmergencyName: client.secondaryEmergencyName || '',
            secondaryEmergencyPhone: client.secondaryEmergencyPhone || '',
            secondaryEmergencyRelation: client.secondaryEmergencyRelation || '',
        });
        setShowEditClientModal(true);
    };

    const handleSaveEditClient = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { clientName, ...rest } = editClientForm;
            await api.updateClient(client.id, clientName, rest);
            showToast('Client updated');
            setShowEditClientModal(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    // Authorization handlers
    const openAuthModal = (auth = null, serviceCode = '') => {
        if (auth) {
            setEditingAuth(auth);
            setAuthForm({
                serviceCode: auth.serviceCode || '',
                authorizationNumber: auth.authorizationNumber || '',
                authorizedUnits: auth.authorizedUnits || '',
                authorizedHours: auth.authorizedHours || '',
                authorizationStartDate: auth.authorizationStartDate ? new Date(auth.authorizationStartDate).toISOString().split('T')[0] : '',
                authorizationEndDate: auth.authorizationEndDate ? new Date(auth.authorizationEndDate).toISOString().split('T')[0] : '',
                notes: auth.notes || '',
            });
        } else {
            setEditingAuth(null);
            setAuthForm({
                serviceCode: serviceCode,
                authorizationNumber: '',
                authorizedUnits: '',
                authorizedHours: '',
                authorizationStartDate: '',
                authorizationEndDate: '',
                notes: '',
            });
        }
        setAuthServiceGroup(serviceCode);
        setShowAuthModal(true);
    };

    // Parse pasted date text into YYYY-MM-DD for date inputs
    const handleAuthDatePaste = (field) => (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        }
        if (!parsed) {
            m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
            if (m) {
                const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                if (!isNaN(d)) parsed = d.toISOString().split('T')[0];
            }
        }
        if (parsed && !isNaN(new Date(parsed + 'T00:00:00'))) {
            e.preventDefault();
            setAuthForm(prev => ({ ...prev, [field]: parsed }));
        }
    };

    const handleClientDatePaste = (field) => (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        }
        if (!parsed) {
            m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
            if (m) {
                const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                if (!isNaN(d)) parsed = d.toISOString().split('T')[0];
            }
        }
        if (parsed && !isNaN(new Date(parsed + 'T00:00:00'))) {
            e.preventDefault();
            setEditClientForm(prev => ({ ...prev, [field]: parsed }));
        }
    };

    const handleSaveAuth = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { files, ...rest } = authForm;
            const data = {
                ...rest,
                authorizedUnits: rest.authorizedUnits ? Number(rest.authorizedUnits) : null,
                authorizedHours: rest.authorizedHours ? Number(rest.authorizedHours) : null,
            };
            let savedAuth;
            if (editingAuth) {
                savedAuth = await api.updateAuthorization(editingAuth.id, data);
                showToast('Authorization updated');
            } else {
                savedAuth = await api.createAuthorization(client.id, data);
                showToast('Authorization created');
            }
            if (files && files.length > 0) {
                for (const file of files) {
                    const formData = new FormData();
                    formData.append('file', file);
                    await api.uploadAuthDocument(savedAuth.id, formData);
                }
                showToast(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
            }
            setShowAuthModal(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleArchiveAuth = async (authId) => {
        try {
            await api.archiveAuthorization(authId);
            showToast('Authorization archived');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestoreAuth = async (authId) => {
        try {
            await api.restoreAuthorization(authId);
            showToast('Authorization restored');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleArchiveClient = async () => {
        try {
            await api.deleteClient(client.id);
            setConfirmArchiveClient(false);
            navigate('/clients');
            showToast(`"${client.clientName}" archived`);
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleUploadAuthDoc = async (authId, file) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            await api.uploadAuthDocument(authId, formData);
            showToast('Document uploaded');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDownloadAuthDoc = async (doc) => {
        try {
            const blob = await api.downloadAuthDocument(doc.id);
            const url = URL.createObjectURL(blob);
            if (doc.mimeType === 'application/pdf' || doc.fileName?.toLowerCase().endsWith('.pdf')) {
                window.open(url, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = doc.fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAuthDoc = async (doc) => {
        try {
            await api.deleteAuthDocument(doc.id);
            showToast('Document deleted');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
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

    const activeServiceCodes = [...new Set(
        (client.authorizations || []).filter(a => !a.archivedAt).map(a => a.serviceCode)
    )];
    const docsByCategory = (client.documents || []).reduce((acc, d) => {
        if (!acc[d.category]) acc[d.category] = [];
        acc[d.category].push(d);
        return acc;
    }, {});
    const activeAuthDocs = (client.authorizations || [])
        .filter(a => !a.archivedAt && (a.manualStatus || 'active') === 'active')
        .reduce((sum, a) => sum + (a.documents || []).length, 0);
    const clientDocs = (client.documents || []).filter(d => !d.category || !d.category.startsWith('auth_')).length;
    const totalDocs = activeAuthDocs + clientDocs;

    const authGroups = {};
    (client.authorizations || []).forEach(a => {
        let key = a.serviceCode || a.serviceCategory || 'Other';
        if (key === 'TIMESHEETS') key = 'TIMESHEET_PCS';
        if (!authGroups[key]) authGroups[key] = [];
        authGroups[key].push(a);
    });

    const filterAuths = (auths) => {
        if (authFilterStatus === 'all') return auths;
        if (authFilterStatus === 'active') return auths.filter(a => !a.archivedAt && a.status !== 'Expired');
        if (authFilterStatus === 'expired') return auths.filter(a => a.status === 'Expired');
        if (authFilterStatus === 'archived') return auths.filter(a => a.archivedAt);
        return auths;
    };

    const openIncidents = (client.incidents || []).filter(i => i.status === 'open').length;

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

    // For insurance tab: split auths into current vs archived per service group
    const authGroupsForInsurance = {};
    (client.authorizations || []).forEach(a => {
        let key = a.serviceCode || a.serviceCategory || 'Other';
        if (key === 'TIMESHEETS') key = 'TIMESHEET_PCS';
        if (!authGroupsForInsurance[key]) authGroupsForInsurance[key] = { current: [], archived: [] };
        if (a.archivedAt) {
            authGroupsForInsurance[key].archived.push(a);
        } else {
            authGroupsForInsurance[key].current.push(a);
        }
    });

    return (
        <>
            {/* Page Header */}
            <ActionBar
                title={client.clientName || 'Client'}
                subtitle="Care Plans"
                icon={Icons.users}
                hideUndo
                activityEntity="Client"
            >
                <EntityActivityButton entityType="Client" entityId={client.id} />
                <button className="btn btn--outline btn--sm" onClick={openEditClientModal}>
                    {Icons.edit} Edit Client
                </button>
                <button className="btn btn--danger-ghost btn--sm" onClick={() => setConfirmArchiveClient(true)}>
                    {Icons.trash} Archive
                </button>
            </ActionBar>

            <div className="page-content cp-page">

                {/* BIO DATA CARD */}
                <div className="cp-bio">
                    <div className="cp-bio__main">
                        <div className="cp-bio__avatar">
                            {client.clientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="cp-bio__info">
                            <div className="cp-bio__name-row">
                                <h2 className="cp-bio__name">{client.clientName}</h2>
                                <select
                                    className={`cp-bio__status-select cp-bio__status-select--${client.clientStatus || 'active'}`}
                                    value={client.clientStatus || 'active'}
                                    onChange={async (e) => {
                                        const val = e.target.value;
                                        try {
                                            await api.patchClient(client.id, { clientStatus: val });
                                            setClient(prev => ({ ...prev, clientStatus: val }));
                                            showToast('Status updated');
                                        } catch (err) { showToast(err.message, 'error'); }
                                    }}
                                >
                                    <option value="active">Active</option>
                                    <option value="pending">Pending</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                            <div className="cp-bio__chips">
                                {client.insuranceType && (
                                    <span className="cp-chip cp-chip--program">{client.insuranceType}</span>
                                )}
                                {openIncidents > 0 && (
                                    <span className="cp-chip cp-chip--complaint">
                                        {openIncidents} Open Incident{openIncidents > 1 ? 's' : ''}
                                    </span>
                                )}
                                {activeServiceCodes.map(code => {
                                    const colors = AUTH_COLORS[code] || DEFAULT_AUTH_COLOR;
                                    return (
                                        <span key={code} className="cp-service-chip cp-service-chip--sm" style={{ background: colors.bg, color: colors.accent, borderColor: colors.accent }}>
                                            {colors.label?.replace(' Authorization', '').replace(' Service', '') || code}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="cp-bio__fields">
                        {client.medicaidId && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Client ID #</span>
                                <span className="cp-bio__field-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{client.medicaidId}</span>
                            </div>
                        )}
                        {client.dob && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">D.O.B.</span>
                                <span className="cp-bio__field-value">
                                    {new Date(client.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                                    {' '}({computeAge(client.dob)} yrs)
                                </span>
                            </div>
                        )}
                        {client.gender && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Gender</span>
                                <span className="cp-bio__field-value">{client.gender}</span>
                            </div>
                        )}
                        {client.insuranceType && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Insurance</span>
                                <span className="cp-bio__field-value">{client.insuranceType}</span>
                            </div>
                        )}
                        {client.email && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Email</span>
                                <span className="cp-bio__field-value">{client.email}</span>
                            </div>
                        )}
                        {client.phone && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Phone</span>
                                <span className="cp-bio__field-value">{client.phone}</span>
                            </div>
                        )}
                        {client.secondaryPhone && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Secondary Phone</span>
                                <span className="cp-bio__field-value">{client.secondaryPhone}</span>
                            </div>
                        )}
                        {client.address && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Address</span>
                                <span className="cp-bio__field-value">{client.address}</span>
                            </div>
                        )}
                        {client.secondaryAddress && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Secondary Address</span>
                                <span className="cp-bio__field-value">{client.secondaryAddress}</span>
                            </div>
                        )}
                        {client.doctorName && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Doctor</span>
                                <span className="cp-bio__field-value">
                                    {client.doctorName}{client.doctorPhone ? ` • ${client.doctorPhone}` : ''}
                                </span>
                            </div>
                        )}
                        {client.backupDoctorName && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Backup Doctor</span>
                                <span className="cp-bio__field-value">
                                    {client.backupDoctorName}{client.backupDoctorPhone ? ` • ${client.backupDoctorPhone}` : ''}
                                </span>
                            </div>
                        )}
                    </div>

                </div>

                {/* TAB NAVIGATION */}
                <div className="cp-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`cp-tab ${activeTab === tab.key ? 'cp-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.icon && <span className="cp-tab__icon">{Icons[tab.icon]}</span>}
                            {tab.label}
                            {tab.key === 'incidents' && openIncidents > 0 && (
                                <span className="cp-tab__badge cp-tab__badge--danger">{openIncidents}</span>
                            )}
                            {tab.key === 'documents' && totalDocs > 0 && (
                                <span className="cp-tab__badge">{totalDocs}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* TAB CONTENT */}
                <div className="cp-tab-content">
                    {activeTab === 'profile' && (
                        <ProfileInsuranceTab
                            client={client}
                            clientId={clientId}
                            employees={employees}
                            isAdmin={isAdmin}
                            navigate={navigate}
                            showToast={showToast}
                            fetchClient={fetchClient}
                            openAuthModal={openAuthModal}
                            openEditClientModal={openEditClientModal}
                            handleArchiveAuth={handleArchiveAuth}
                            handleRestoreAuth={handleRestoreAuth}
                            handleUploadAuthDoc={handleUploadAuthDoc}
                            handleDownloadAuthDoc={handleDownloadAuthDoc}
                            handleDeleteAuthDoc={handleDeleteAuthDoc}
                            setShowCareTeamModal={setShowCareTeamModal}
                            handleRemoveCareTeam={handleRemoveCareTeam}
                            editingNotes={editingNotes}
                            setEditingNotes={setEditingNotes}
                            notesValue={notesValue}
                            setNotesValue={setNotesValue}
                            handleSaveNotes={handleSaveNotes}
                            editingPcaNotes={editingPcaNotes}
                            setEditingPcaNotes={setEditingPcaNotes}
                            pcaNotesValue={pcaNotesValue}
                            setPcaNotesValue={setPcaNotesValue}
                            handleSavePcaNotes={handleSavePcaNotes}
                            editingCaregiverReqs={editingCaregiverReqs}
                            setEditingCaregiverReqs={setEditingCaregiverReqs}
                            caregiverReqsValue={caregiverReqsValue}
                            setCaregiverReqsValue={setCaregiverReqsValue}
                            handleSaveCaregiverReqs={handleSaveCaregiverReqs}
                            editingMainServices={editingMainServices}
                            setEditingMainServices={setEditingMainServices}
                            mainServicesValue={mainServicesValue}
                            setMainServicesValue={setMainServicesValue}
                            handleSaveMainServices={handleSaveMainServices}
                            expandedAuthAttachments={expandedAuthAttachments}
                            setExpandedAuthAttachments={setExpandedAuthAttachments}
                            summaryExpandedService={summaryExpandedService}
                            setSummaryExpandedService={setSummaryExpandedService}
                            authGroups={authGroups}
                            formatDate={formatDate}
                            unitsToHours={unitsToHours}
                            totalDocs={totalDocs}
                        />
                    )}
                    {activeTab === 'programs' && (
                        <ProgramsAuthTab
                            client={client}
                            clientId={clientId}
                            navigate={navigate}
                            isAdmin={isAdmin}
                            openAuthModal={openAuthModal}
                            handleArchiveAuth={handleArchiveAuth}
                            handleRestoreAuth={handleRestoreAuth}
                            handleUploadAuthDoc={handleUploadAuthDoc}
                            handleDownloadAuthDoc={handleDownloadAuthDoc}
                            handleDeleteAuthDoc={handleDeleteAuthDoc}
                            expandedServiceCode={expandedServiceCode}
                            setExpandedServiceCode={setExpandedServiceCode}
                            authFilterStatus={authFilterStatus}
                            setAuthFilterStatus={setAuthFilterStatus}
                            expandedAuthAttachments={expandedAuthAttachments}
                            setExpandedAuthAttachments={setExpandedAuthAttachments}
                            authGroupsForInsurance={authGroupsForInsurance}
                            formatDate={formatDate}
                            unitsToHours={unitsToHours}
                            fetchClient={fetchClient}
                            showToast={showToast}
                            totalDocs={totalDocs}
                        />
                    )}
                    {activeTab === 'documents' && (
                        <DocumentsTab
                            client={client}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            setDocCategory={setDocCategory}
                            setShowDocUploadModal={setShowDocUploadModal}
                            handleDownloadDoc={handleDownloadDoc}
                            handleDownloadAuthDoc={handleDownloadAuthDoc}
                            setConfirmDelete={setConfirmDelete}
                        />
                    )}
                    {activeTab === 'timesheets' && (
                        <TimesheetsTab client={client} navigate={navigate} />
                    )}
                    {activeTab === 'care-plan' && (
                        <CarePlanTab
                            client={client}
                            timelineItems={timelineItems}
                            openVisitModal={openVisitModal}
                            setConfirmDelete={setConfirmDelete}
                            formatDate={formatDate}
                            formatDateTime={formatDateTime}
                        />
                    )}
                    {activeTab === 'schedule' && (
                        <ScheduleTab navigate={navigate} clientId={clientId} />
                    )}
                    {activeTab === 'supervisory-review' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Supervisory Review</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <p>No supervisory reviews yet.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'billing' && (
                        <div className="cp-tab-panel">
                            <div className="cp-card cp-card--elevated">
                                <div className="cp-card__header">
                                    <h3 className="cp-card__title">Billing / Invoices</h3>
                                </div>
                                <div className="cp-card__body">
                                    <div className="cp-empty-state-card">
                                        <p>No billing records yet.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'activity' && (
                        <ActivityLogTab clientId={Number(clientId)} isAdmin={isAdmin} />
                    )}
                    {activeTab === 'incidents' && (
                        <IncidentReportsTab
                            client={client}
                            openIncidentModal={openIncidentModal}
                            handleResolveIncident={handleResolveIncident}
                            setConfirmDelete={setConfirmDelete}
                            formatDate={formatDate}
                        />
                    )}
                </div>
            </div>

            {/* MODALS */}

            {/* Care Team Modal */}
            {showCareTeamModal && (
                <Modal onClose={() => setShowCareTeamModal(false)}>
                    <h2 className="modal__title">Assign PCA</h2>
                    <form onSubmit={handleAddCareTeam}>
                        <div className="form-group">
                            <label>PCA</label>
                            <select
                                value={careTeamForm.employeeId}
                                onChange={(e) => setCareTeamForm({ ...careTeamForm, employeeId: e.target.value })}
                                required
                            >
                                <option value="">Select PCA...</option>
                                {employees.filter(e => e.active).map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Role</label>
                            <select
                                value={careTeamForm.role}
                                onChange={(e) => setCareTeamForm({ ...careTeamForm, role: e.target.value })}
                                required
                            >
                                <option value="agency_pca">Agency PCA</option>
                                <option value="self_directed_pca">Self Directed PCA</option>
                            </select>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowCareTeamModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !careTeamForm.employeeId}>
                                {saving ? 'Assigning...' : 'Assign'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Document Upload Modal */}
            {showDocUploadModal && (
                <Modal onClose={() => setShowDocUploadModal(false)}>
                    <h2 className="modal__title">Upload Document</h2>
                    <form onSubmit={handleUploadDoc}>
                        <div className="form-group">
                            <label>Category</label>
                            <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} required>
                                {DOC_CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>File</label>
                            <input type="file" onChange={(e) => setDocFile(e.target.files[0])} required />
                        </div>
                        <div className="form-group">
                            <label>Notes (optional)</label>
                            <textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)} rows={2} placeholder="Optional notes" />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowDocUploadModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !docFile}>{saving ? 'Uploading...' : 'Upload'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Hospital Visit Modal */}
            {showVisitModal && (
                <Modal onClose={() => setShowVisitModal(false)}>
                    <h2 className="modal__title">{editingVisit ? 'Edit Hospital Visit' : 'Schedule Hospital Visit'}</h2>
                    <form onSubmit={handleSaveVisit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Visit Date</label>
                                <input type="date" value={visitForm.visitDate} onChange={(e) => setVisitForm({ ...visitForm, visitDate: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Visit Time</label>
                                <input type="time" value={visitForm.visitTime} onChange={(e) => setVisitForm({ ...visitForm, visitTime: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Provider Name</label>
                            <input type="text" value={visitForm.providerName} onChange={(e) => setVisitForm({ ...visitForm, providerName: e.target.value })} placeholder="Doctor or hospital name" />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input type="text" value={visitForm.location} onChange={(e) => setVisitForm({ ...visitForm, location: e.target.value })} placeholder="Hospital or clinic address" />
                        </div>
                        <div className="form-group">
                            <label>Purpose</label>
                            <input type="text" value={visitForm.purpose} onChange={(e) => setVisitForm({ ...visitForm, purpose: e.target.value })} placeholder="Reason for visit" />
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
                            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving...' : editingVisit ? 'Update' : 'Schedule'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Incident Modal */}
            {showIncidentModal && (
                <Modal onClose={() => setShowIncidentModal(false)}>
                    <h2 className="modal__title">{editingIncident ? 'Edit Incident' : 'Report Incident'}</h2>
                    <form onSubmit={handleSaveIncident}>
                        <div className="form-group">
                            <label>Incident Date</label>
                            <input type="date" value={incidentForm.incidentDate} onChange={(e) => setIncidentForm({ ...incidentForm, incidentDate: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} rows={3} placeholder="What happened?" required />
                        </div>
                        <div className="form-group">
                            <label>Severity</label>
                            <select value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
                                <option value="minor">Minor</option>
                                <option value="moderate">Moderate</option>
                                <option value="serious">Serious</option>
                                <option value="critical">Critical</option>
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
                            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving...' : editingIncident ? 'Update' : 'Report'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Edit Client Modal */}
            {showEditClientModal && (
                <Modal onClose={() => setShowEditClientModal(false)}>
                    <h2 className="modal__title">Edit Client Information</h2>
                    <form onSubmit={handleSaveEditClient}>
                        <div className="form-group">
                            <label>Client Name</label>
                            <input type="text" value={editClientForm.clientName} onChange={(e) => setEditClientForm({ ...editClientForm, clientName: e.target.value })} required />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Medicaid ID</label>
                                <input type="text" value={editClientForm.medicaidId} onChange={(e) => setEditClientForm({ ...editClientForm, medicaidId: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Insurance Type</label>
                                <input type="text" value={editClientForm.insuranceType} onChange={(e) => setEditClientForm({ ...editClientForm, insuranceType: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Primary Address</label>
                            <input type="text" value={editClientForm.address} onChange={(e) => setEditClientForm({ ...editClientForm, address: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Secondary Address</label>
                            <input type="text" value={editClientForm.secondaryAddress} onChange={(e) => setEditClientForm({ ...editClientForm, secondaryAddress: e.target.value })} placeholder="Optional alternate location" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Phone</label>
                                <input type="tel" value={editClientForm.phone} onChange={(e) => setEditClientForm({ ...editClientForm, phone: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Secondary Phone</label>
                                <input type="tel" value={editClientForm.secondaryPhone} onChange={(e) => setEditClientForm({ ...editClientForm, secondaryPhone: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" value={editClientForm.email} onChange={(e) => setEditClientForm({ ...editClientForm, email: e.target.value })} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Gender</label>
                                <select value={editClientForm.gender} onChange={(e) => setEditClientForm({ ...editClientForm, gender: e.target.value })}>
                                    <option value="">Select...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Date of Birth</label>
                                <input type="date" value={editClientForm.dob} onChange={(e) => setEditClientForm({ ...editClientForm, dob: e.target.value })} onPaste={handleClientDatePaste('dob')} />
                            </div>
                            <div className="form-group">
                                <label>Gate Code</label>
                                <input type="text" value={editClientForm.gateCode} onChange={(e) => setEditClientForm({ ...editClientForm, gateCode: e.target.value })} placeholder="Optional" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Primary Doctor</label>
                                <input type="text" value={editClientForm.doctorName} onChange={(e) => setEditClientForm({ ...editClientForm, doctorName: e.target.value })} placeholder="Doctor name" />
                            </div>
                            <div className="form-group">
                                <label>Doctor Phone</label>
                                <input type="tel" value={editClientForm.doctorPhone} onChange={(e) => setEditClientForm({ ...editClientForm, doctorPhone: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Backup Doctor</label>
                                <input type="text" value={editClientForm.backupDoctorName} onChange={(e) => setEditClientForm({ ...editClientForm, backupDoctorName: e.target.value })} placeholder="Optional" />
                            </div>
                            <div className="form-group">
                                <label>Backup Doctor Phone</label>
                                <input type="tel" value={editClientForm.backupDoctorPhone} onChange={(e) => setEditClientForm({ ...editClientForm, backupDoctorPhone: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Emergency Contact</label>
                                <input type="text" value={editClientForm.emergencyContactName} onChange={(e) => setEditClientForm({ ...editClientForm, emergencyContactName: e.target.value })} placeholder="Name" />
                            </div>
                            <div className="form-group">
                                <label>Relationship</label>
                                <input type="text" value={editClientForm.emergencyContactRelation} onChange={(e) => setEditClientForm({ ...editClientForm, emergencyContactRelation: e.target.value })} placeholder="e.g. Spouse" />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input type="tel" value={editClientForm.emergencyContactPhone} onChange={(e) => setEditClientForm({ ...editClientForm, emergencyContactPhone: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Secondary Emergency</label>
                                <input type="text" value={editClientForm.secondaryEmergencyName} onChange={(e) => setEditClientForm({ ...editClientForm, secondaryEmergencyName: e.target.value })} placeholder="Name" />
                            </div>
                            <div className="form-group">
                                <label>Relationship</label>
                                <input type="text" value={editClientForm.secondaryEmergencyRelation} onChange={(e) => setEditClientForm({ ...editClientForm, secondaryEmergencyRelation: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input type="tel" value={editClientForm.secondaryEmergencyPhone} onChange={(e) => setEditClientForm({ ...editClientForm, secondaryEmergencyPhone: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowEditClientModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Authorization Modal */}
            {showAuthModal && (
                <Modal onClose={() => setShowAuthModal(false)}>
                    <h2 className="modal__title">{editingAuth ? 'Edit Authorization' : 'Add Authorization'}</h2>
                    <form onSubmit={handleSaveAuth}>
                        <div className="form-group">
                            <label>Service Code</label>
                            <select
                                value={authForm.serviceCode}
                                onChange={(e) => setAuthForm({ ...authForm, serviceCode: e.target.value })}
                                disabled={!!editingAuth}
                                required
                            >
                                <option value="">Select service code...</option>
                                <option value="PCS">PCS - Personal Care</option>
                                <option value="SDPC">SDPC - Self Directed</option>
                                <option value="S5125">S5125 - Attendant Care</option>
                                <option value="S5130">S5130 - Homemaker</option>
                                <option value="S5150">S5150 - Respite</option>
                                <option value="S5135">S5135 - Companion</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Authorization Number</label>
                            <input type="text" value={authForm.authorizationNumber} onChange={(e) => setAuthForm({ ...authForm, authorizationNumber: e.target.value })} placeholder="Auth number" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Authorized Units (15-min)</label>
                                <input type="number" value={authForm.authorizedUnits} onChange={(e) => setAuthForm({ ...authForm, authorizedUnits: e.target.value })} placeholder="e.g. 120" />
                            </div>
                            <div className="form-group">
                                <label>Authorized Hours</label>
                                <input type="number" step="0.5" value={authForm.authorizedHours} onChange={(e) => setAuthForm({ ...authForm, authorizedHours: e.target.value })} placeholder="e.g. 30" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Start Date</label>
                                <input type="date" value={authForm.authorizationStartDate} onChange={(e) => setAuthForm({ ...authForm, authorizationStartDate: e.target.value })} onPaste={handleAuthDatePaste('authorizationStartDate')} />
                            </div>
                            <div className="form-group">
                                <label>End Date</label>
                                <input type="date" value={authForm.authorizationEndDate} onChange={(e) => setAuthForm({ ...authForm, authorizationEndDate: e.target.value })} onPaste={handleAuthDatePaste('authorizationEndDate')} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Account Number</label>
                            <select value={authForm.accountNumber || ''} onChange={(e) => setAuthForm({ ...authForm, accountNumber: e.target.value })}>
                                <option value="">— Select —</option>
                                <option value="71040">71040</option>
                                <option value="71120">71120</option>
                                <option value="71119">71119</option>
                                <option value="71635">71635</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea value={authForm.notes} onChange={(e) => setAuthForm({ ...authForm, notes: e.target.value })} rows={2} placeholder="Optional notes" />
                        </div>
                        <div className="form-group">
                            <label>Upload PA / Care Plan Documents</label>
                            <input
                                type="file"
                                multiple
                                onChange={(e) => setAuthForm({ ...authForm, files: Array.from(e.target.files) })}
                                style={{ fontSize: 13 }}
                            />
                            {authForm.files && authForm.files.length > 0 && (
                                <div style={{ marginTop: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                    {authForm.files.length} file{authForm.files.length !== 1 ? 's' : ''} selected
                                </div>
                            )}
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowAuthModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !authForm.serviceCode}>{saving ? 'Saving...' : editingAuth ? 'Update' : 'Create'}</button>
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
            {confirmArchiveClient && (
                <ConfirmModal
                    title="Archive Client"
                    message={`Archive "${client.clientName}"? This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.`}
                    confirmLabel="Archive"
                    confirmVariant="danger"
                    onConfirm={handleArchiveClient}
                    onClose={() => setConfirmArchiveClient(false)}
                />
            )}
        </>
    );
}
