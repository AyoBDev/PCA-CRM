import { useState } from 'react';
import Icons from './Icons';
import { useToast } from '../../hooks/useToast';

/**
 * Compliance PDF export with a date range.
 *
 * Shared by the client and employee Notes tabs so the two behave identically.
 * The range defaults to empty (= all history); a complaint usually concerns a
 * specific period, and handing an auditor years of unrelated history when they
 * asked about one month is its own problem.
 */
export default function NotesExportButton({ onExport, disabled }) {
    const { showToast } = useToast();
    const [open, setOpen] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [busy, setBusy] = useState(false);

    const rangeInvalid = from && to && from > to;

    const handleExport = async () => {
        if (rangeInvalid) return;
        setBusy(true);
        try {
            await onExport({ from, to });
            showToast('Notes exported', 'success');
            setOpen(false);
        } catch (err) {
            showToast(err.message || 'Export failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setOpen(true)}
                disabled={disabled}
            >
                {Icons.download} Export PDF
            </button>
        );
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap',
            padding: 12, borderRadius: 'var(--radius)',
            background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))',
        }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="notesFrom" style={{ fontSize: 11 }}>From</label>
                <input id="notesFrom" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="notesTo" style={{ fontSize: 11 }}>To</label>
                <input id="notesTo" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            <button type="button" className="btn btn--primary btn--sm" onClick={handleExport} disabled={busy || rangeInvalid}>
                {busy ? 'Generating…' : 'Download'}
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
            </button>
            <span style={{ fontSize: 11, color: rangeInvalid ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))', alignSelf: 'center' }}>
                {rangeInvalid ? 'From date is after To date' : 'Leave blank for all history'}
            </span>
        </div>
    );
}
