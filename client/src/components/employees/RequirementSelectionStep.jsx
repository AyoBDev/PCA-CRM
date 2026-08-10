import { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import LoadingState from '../common/LoadingState';

const STANDARD_CERT_KEYS = ['cpr', 'tb_test', 'annual_training', 'background_check'];

function isEmptySelection(value) {
    return (
        (!value?.documentTypeIds || value.documentTypeIds.length === 0) &&
        (!value?.certTypeIds || value.certTypeIds.length === 0) &&
        (!value?.policyDocumentIds || value.policyDocumentIds.length === 0)
    );
}

function toggleId(list, id) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function RequirementSelectionStep({ value, onChange }) {
    const [documentTypes, setDocumentTypes] = useState([]);
    const [certTypes, setCertTypes] = useState([]);
    const [policyDocuments, setPolicyDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const didPrecheck = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [docsRes, certsRes, policiesRes] = await Promise.all([
                    api.getCatalogDocuments(),
                    api.getCatalogCertTypes(),
                    api.getCatalogPolicies(),
                ]);
                if (cancelled) return;
                const docs = docsRes?.documentTypes || [];
                const certs = certsRes?.certTypes || [];
                const policies = policiesRes?.policyDocuments || [];
                setDocumentTypes(docs);
                setCertTypes(certs);
                setPolicyDocuments(policies);

                if (!didPrecheck.current && isEmptySelection(value)) {
                    didPrecheck.current = true;
                    const standardCertIds = certs
                        .filter((c) => STANDARD_CERT_KEYS.includes(c.key))
                        .map((c) => c.id);
                    if (standardCertIds.length > 0) {
                        onChange({
                            documentTypeIds: value?.documentTypeIds || [],
                            certTypeIds: standardCertIds,
                            policyDocumentIds: value?.policyDocumentIds || [],
                        });
                    }
                }
            } catch (err) {
                if (!cancelled) setError(err.message || 'Failed to load onboarding catalogs');
            } finally {
                if (!cancelled) setLoading(false);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <LoadingState rows={4} />;
    if (error) return <div className="form-warning">{error}</div>;

    const documentTypeIds = value?.documentTypeIds || [];
    const certTypeIds = value?.certTypeIds || [];
    const policyDocumentIds = value?.policyDocumentIds || [];

    const toggleDocument = (id) => {
        onChange({ ...value, documentTypeIds: toggleId(documentTypeIds, id) });
    };
    const toggleCert = (id) => {
        onChange({ ...value, certTypeIds: toggleId(certTypeIds, id) });
    };
    const togglePolicy = (id) => {
        onChange({ ...value, policyDocumentIds: toggleId(policyDocumentIds, id) });
    };

    return (
        <div>
            <p className="form-hint" style={{ margin: '0 0 16px' }}>
                Select the onboarding requirements this employee must complete. Standard certifications are pre-selected.
            </p>

            <h3 className="modal__section-title">Required Documents</h3>
            <div className="form-group">
                {documentTypes.length === 0 && <p className="form-hint">No document types configured.</p>}
                {documentTypes.map((doc) => (
                    <label key={doc.id} className="checkbox-field">
                        <input
                            type="checkbox"
                            checked={documentTypeIds.includes(doc.id)}
                            onChange={() => toggleDocument(doc.id)}
                        />
                        <span>{doc.label}</span>
                    </label>
                ))}
            </div>

            <hr className="form-divider" />

            <h3 className="modal__section-title">Certifications</h3>
            <div className="form-group">
                {certTypes.length === 0 && <p className="form-hint">No certification types configured.</p>}
                {certTypes.map((cert) => (
                    <label key={cert.id} className="checkbox-field">
                        <input
                            type="checkbox"
                            checked={certTypeIds.includes(cert.id)}
                            onChange={() => toggleCert(cert.id)}
                        />
                        <span>{cert.label}</span>
                    </label>
                ))}
            </div>

            <hr className="form-divider" />

            <h3 className="modal__section-title">Policy Acknowledgments</h3>
            <div className="form-group">
                {policyDocuments.length === 0 && <p className="form-hint">No policy documents configured.</p>}
                {policyDocuments.map((policy) => (
                    <label key={policy.id} className="checkbox-field">
                        <input
                            type="checkbox"
                            checked={policyDocumentIds.includes(policy.id)}
                            onChange={() => togglePolicy(policy.id)}
                        />
                        <span>{policy.title}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}
