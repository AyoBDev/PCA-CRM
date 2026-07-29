import { useState } from 'react';
import Icons from './Icons';
import { useToast } from '../../hooks/useToast';

/**
 * Compliance PDF export — a single inline row: From · To · Export.
 *
 * Always visible rather than hidden behind a popover or a disclosure: there
 * are only three controls, and an export people reach for during a complaint
 * or audit should not require discovering it first. Blank dates export all
 * history, so the row is usable without touching the pickers at all.
 */
export default function NotesExportButton({ onExport, disabled }) {
    const { showToast } = useToast();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [busy, setBusy] = useState(false);

    const rangeInvalid = !!(from && to && from > to);

    const handleExport = async () => {
        if (rangeInvalid) return;
        setBusy(true);
        try {
            await onExport({ from, to });
            showToast('Notes exported', 'success');
        } catch (err) {
            showToast(err.message || 'Export failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    const fieldStyle = {
        fontSize: 12,
        padding: '4px 6px',
        height: 28,
        width: 130,
    };

    const labelStyle = {
        fontSize: 11,
        fontWeight: 500,
        color: 'hsl(var(--muted-foreground))',
        whiteSpace: 'nowrap',
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="notesFrom" style={labelStyle}>From</label>
            <input
                id="notesFrom"
                type="date"
                value={from}
                max={to || undefined}
                onChange={e => setFrom(e.target.value)}
                style={fieldStyle}
                aria-invalid={rangeInvalid}
            />

            <label htmlFor="notesTo" style={labelStyle}>To</label>
            <input
                id="notesTo"
                type="date"
                value={to}
                min={from || undefined}
                onChange={e => setTo(e.target.value)}
                style={fieldStyle}
                aria-invalid={rangeInvalid}
            />

            <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleExport}
                disabled={disabled || busy || rangeInvalid}
                title={rangeInvalid ? 'From date is after To date' : 'Blank dates export all history'}
            >
                {Icons.download} {busy ? 'Generating…' : 'Export PDF'}
            </button>

            {rangeInvalid && (
                <span style={{ fontSize: 11, color: 'hsl(var(--danger))', whiteSpace: 'nowrap' }}>
                    From is after To
                </span>
            )}
        </div>
    );
}
