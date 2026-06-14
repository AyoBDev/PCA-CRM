import { useState, useRef } from 'react';

export default function UploadModal({ certType, onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError('Please select a file');
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (note) formData.append('note', note);
      await onUpload(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Upload {certType.replace(/_/g, ' ')}</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="upload-area" onClick={() => inputRef.current?.click()}>
            {file ? <span className="upload-filename">{file.name}</span> : <span className="upload-prompt">Tap to select photo or PDF</span>}
            <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
          </div>
          <label className="field-label">Note (optional)</label>
          <input className="field-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional context..." />
          <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit for Review'}</button>
          <button type="button" className="btn btn-secondary btn-full" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}
