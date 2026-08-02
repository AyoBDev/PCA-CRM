import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import LogContactForm from './LogContactForm';
import { LEAD_CASE_TYPES, LEAD_STATUSES, LEAD_CONTACT_OUTCOMES } from '../../utils/leadConstants';
import { formatDate } from '../../utils/dates';
import * as api from '../../api';

const OUTCOME_BY_ID = Object.fromEntries(LEAD_CONTACT_OUTCOMES.map((o) => [o.id, o]));

function safeArr(v) {
    try {
        const parsed = JSON.parse(v || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function DetRow({ label, value }) {
    return (
        <div className="det-row">
            <span className="det-row__label">{label}</span>
            <span className="det-row__value">{value || value === 0 ? value : '—'}</span>
        </div>
    );
}

/* Card-style section with bold dark-blue header banner */
function DetSection({ title, children }) {
    return (
        <div className="det-section">
            <div className="det-section__title">{title}</div>
            <div className="det-section__body">{children}</div>
        </div>
    );
}

export default function LeadDetailModal({ lead, onClose, onEdit, onArchive, onConvert, onContactLogged }) {
    const [contacts, setContacts] = useState([]);
    const [logging, setLogging] = useState(false);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        if (!lead?.id) return;
        let alive = true;
        api.listLeadContacts(lead.id).then((rows) => { if (alive) setContacts(rows); }).catch(() => {});
        return () => { alive = false; };
    }, [lead?.id]);

    if (!lead) return null;

    const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed lead';
    const caseType = LEAD_CASE_TYPES[lead.caseType] || LEAD_CASE_TYPES.initial;
    const statusInfo = LEAD_STATUSES.find((s) => s.id === lead.status);
    const servicesRequested = safeArr(lead.servicesRequested);
    const shiftPreferences = safeArr(lead.shiftPreferences);
    const isArchived = lead.status === 'archived';

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{name}</h2>
            <div className="det-tags">
                <span className={`tag ${caseType.tagClass}`}>{caseType.label}</span>
                {statusInfo && (
                    <span className="tag" style={{ background: statusInfo.dot }}>{statusInfo.label}</span>
                )}
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                {lead.createdBy && (
                    <DetSection title="Staff Attribution">
                        <DetRow label="Entered By" value={lead.createdBy} />
                    </DetSection>
                )}

                <DetSection title="Basic Information">
                    <DetRow label="Phone" value={lead.phone} />
                    <DetRow label="Alternate Phone" value={lead.alternatePhone} />
                    <DetRow label="Address" value={lead.address} />
                    <DetRow label="Date of Birth" value={lead.dob ? formatDate(lead.dob) : ''} />
                    <DetRow label="Gender" value={lead.gender} />
                    <DetRow label="Medicaid ID" value={lead.medicaidId} />
                    <DetRow label="Insurance Number" value={lead.insuranceNumber} />
                    <DetRow label="Insurance Type" value={lead.insuranceType} />
                    <DetRow label="Referral Source" value={lead.referralSource} />
                </DetSection>

                <DetSection title="Doctor / Caseworker">
                    <DetRow label="Doctor" value={lead.doctorName} />
                    <DetRow label="Doctor Phone" value={lead.doctorPhone} />
                    <DetRow label="Caseworker" value={lead.caseworkerName} />
                    <DetRow label="Caseworker Phone" value={lead.caseworkerPhone} />
                </DetSection>

                <DetSection title="Emergency Contact">
                    <DetRow label="Name" value={lead.emergencyContactName} />
                    <DetRow label="Relation" value={lead.emergencyContactRelation} />
                    <DetRow label="Phone" value={lead.emergencyContactPhone} />
                    <DetRow label="Email" value={lead.emergencyContactEmail} />
                </DetSection>

                <DetSection title="Services Requested">
                    {servicesRequested.length ? (
                        <div className="det-chips">
                            {servicesRequested.map((s) => (
                                <span key={s} className="tag">{s}</span>
                            ))}
                        </div>
                    ) : (
                        <div className="det-empty">No services specified</div>
                    )}
                    <DetRow label="Days per Week" value={lead.daysPerWeek} />
                    <DetRow label="Hours per Day" value={lead.hoursPerDay} />
                    <DetRow label="Start Date Needed" value={lead.startDateNeeded} />
                </DetSection>

                <DetSection title="Preferences">
                    <DetRow label="Gender Preference" value={lead.genderPreference} />
                    <DetRow label="Age Preference" value={lead.agePreference} />
                    <DetRow label="Language Preference" value={lead.languagePreference} />
                    <DetRow
                        label="Shift Preferences"
                        value={shiftPreferences.length ? shiftPreferences.join(', ') : ''}
                    />
                    <DetRow label="Schedule Notes" value={lead.scheduleNotes} />
                </DetSection>

                <DetSection title="Call Notes">
                    <div className="det-notes">{lead.callNotes || 'No call notes recorded.'}</div>
                </DetSection>

                <section className="lead-history">
                    <div className="lead-history__head">
                        <h4>Follow-up history</h4>
                        <button type="button" className="btn btn--sm" onClick={() => setShowForm((s) => !s)}>
                            {showForm ? 'Close' : '+ Log follow-up'}
                        </button>
                    </div>

                    {showForm && (
                        <LogContactForm
                            busy={logging}
                            onCancel={() => setShowForm(false)}
                            onSubmit={async (values) => {
                                setLogging(true);
                                try {
                                    const contact = await api.createLeadContact(lead.id, values);
                                    setContacts((prev) => [contact, ...prev]);
                                    setShowForm(false);
                                    onContactLogged?.(lead.id, contact);
                                } finally {
                                    setLogging(false);
                                }
                            }}
                        />
                    )}

                    {lead.callNotes ? (
                        <p className="lead-history__intake"><strong>Intake note:</strong> {lead.callNotes}</p>
                    ) : null}

                    {contacts.length === 0 ? (
                        <p className="lead-history__empty">No follow-ups logged yet.</p>
                    ) : (
                        <ul className="lead-history__list">
                            {contacts.map((c) => {
                                const meta = OUTCOME_BY_ID[c.outcome] || { label: c.outcome || 'Unknown', color: '#94a3b8' };
                                return (
                                    <li key={c.id} className="lead-history__item">
                                        <span className="lead-history__badge" style={{ background: meta.color }}>{meta.label}</span>
                                        <span className="lead-history__method">{c.method}</span>
                                        {c.note && <p className="lead-history__note">{c.note}</p>}
                                        <div className="lead-history__foot">
                                            <span>{c.createdBy}</span>
                                            <span>{new Date(c.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                            {c.followUpDate && <span>next: {formatDate(c.followUpDate)}</span>}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

            <div className="wizard-nav" style={{ marginTop: 16 }}>
                <div />
                <div className="wizard-nav__right">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Close</button>
                    <button type="button" className="btn btn--outline" onClick={() => onEdit && onEdit(lead)}>Edit Intake</button>
                    {!isArchived && (
                        <button type="button" className="btn btn--outline" onClick={() => onArchive && onArchive(lead)}>Archive</button>
                    )}
                    {!isArchived && (
                        <button type="button" className="btn btn--success" onClick={() => onConvert && onConvert(lead)}>Convert to Active Client</button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
