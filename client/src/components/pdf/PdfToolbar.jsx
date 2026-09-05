import { useId, useState, useEffect } from 'react';
import Icons from '../common/Icons';

const TOOLS = [
    { id: 'select', label: 'Select', icon: 'cursor' },
    { id: 'text', label: 'Text', icon: 'edit' },
    { id: 'draw', label: 'Draw', icon: 'pen' },
    { id: 'highlight', label: 'Highlight', icon: 'highlight' },
    { id: 'eraser', label: 'Eraser', icon: 'trash' },
];

const FONT_SIZES = [12, 16, 20, 24];
const STROKE_WIDTHS = [1, 2, 4, 8];
const HIGHLIGHT_COLORS = ['#FFFF00', '#90EE90', '#87CEEB', '#FFB6C1'];
const COLORS = ['#000000', '#FF0000', '#0000FF', '#008000', '#FF6600'];

export default function PdfToolbar({
    activeTool, setActiveTool,
    toolOptions, setToolOptions,
    canUndo, canRedo, onUndo, onRedo,
    zoom, setZoom,
    currentPage, totalPages, onPageChange,
    onSave, onSaveAs, onSaveAsFinal, onClose,
    saving,
    hasChanges,
    hasFormFields,
}) {
    // Unique per-instance ids so each toolbar caption names its button group.
    const uid = useId();
    const fid = (n) => `${uid}-${n}`;
    const [showOptions, setShowOptions] = useState(false);

    useEffect(() => {
        setShowOptions(activeTool === 'text' || activeTool === 'draw' || activeTool === 'highlight');
    }, [activeTool]);

    return (
        <div className="pdf-toolbar">
            <div className="pdf-toolbar__left">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        className={`pdf-toolbar__tool ${activeTool === t.id ? 'pdf-toolbar__tool--active' : ''}`}
                        onClick={() => setActiveTool(t.id)}
                        title={t.label}
                    >
                        {Icons[t.icon]}<span className="pdf-toolbar__tool-label">{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="pdf-toolbar__center">
                <button className="pdf-toolbar__btn" onClick={onUndo} disabled={!canUndo} title="Undo">
                    {Icons.undo}
                </button>
                <button className="pdf-toolbar__btn" onClick={onRedo} disabled={!canRedo} title="Redo">
                    {Icons.redo}
                </button>
                <span className="pdf-toolbar__separator" />
                <button className="pdf-toolbar__btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out">
                    −
                </button>
                <span className="pdf-toolbar__zoom">{Math.round(zoom * 100)}%</span>
                <button className="pdf-toolbar__btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Zoom in">
                    +
                </button>
                <span className="pdf-toolbar__separator" />
                <button className="pdf-toolbar__btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
                    ‹
                </button>
                <span className="pdf-toolbar__page">{currentPage} / {totalPages}</span>
                <button className="pdf-toolbar__btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
                    ›
                </button>
            </div>

            <div className="pdf-toolbar__right">
                <div className="pdf-toolbar__save-group">
                    <button
                        className="btn btn--primary"
                        onClick={onSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        className="btn btn--secondary"
                        onClick={onSaveAs}
                        disabled={saving || !hasChanges}
                    >
                        Save as Version
                    </button>
                    {hasFormFields && (
                        <button
                            className="btn btn--secondary"
                            onClick={onSaveAsFinal}
                            disabled={saving}
                            title="Fill and lock the form into a non-editable copy"
                        >
                            Save as Final
                        </button>
                    )}
                </div>
                <button className="pdf-toolbar__btn" onClick={onClose} title="Close">
                    ✕
                </button>
            </div>

            {showOptions && (
                <div className="pdf-toolbar__options">
                    {activeTool === 'text' && (
                        <>
                            <span className="pdf-toolbar__label" id={fid('size')}>Size:</span>
                            <div role="group" aria-labelledby={fid('size')} className="pdf-toolbar__group">
                            {FONT_SIZES.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    aria-pressed={toolOptions.fontSize === s}
                                    className={`pdf-toolbar__option ${toolOptions.fontSize === s ? 'pdf-toolbar__option--active' : ''}`}
                                    onClick={() => setToolOptions(o => ({ ...o, fontSize: s }))}
                                >
                                    {s}
                                </button>
                            ))}
                            </div>
                            <span className="pdf-toolbar__label" id={fid('color1')}>Color:</span>
                            <div role="group" aria-labelledby={fid('color1')} className="pdf-toolbar__group">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={c}
                                    aria-pressed={toolOptions.color === c}
                                    className="pdf-toolbar__color-swatch"
                                    style={{ background: c, outline: toolOptions.color === c ? '2px solid hsl(var(--primary))' : 'none' }}
                                    onClick={() => setToolOptions(o => ({ ...o, color: c }))}
                                />
                            ))}
                            </div>
                        </>
                    )}
                    {activeTool === 'draw' && (
                        <>
                            <span className="pdf-toolbar__label" id={fid('width')}>Width:</span>
                            <div role="group" aria-labelledby={fid('width')} className="pdf-toolbar__group">
                            {STROKE_WIDTHS.map(w => (
                                <button
                                    key={w}
                                    type="button"
                                    aria-pressed={toolOptions.strokeWidth === w}
                                    className={`pdf-toolbar__option ${toolOptions.strokeWidth === w ? 'pdf-toolbar__option--active' : ''}`}
                                    onClick={() => setToolOptions(o => ({ ...o, strokeWidth: w }))}
                                >
                                    {w}px
                                </button>
                            ))}
                            </div>
                            <span className="pdf-toolbar__label" id={fid('color2')}>Color:</span>
                            <div role="group" aria-labelledby={fid('color2')} className="pdf-toolbar__group">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={c}
                                    aria-pressed={toolOptions.color === c}
                                    className="pdf-toolbar__color-swatch"
                                    style={{ background: c, outline: toolOptions.color === c ? '2px solid hsl(var(--primary))' : 'none' }}
                                    onClick={() => setToolOptions(o => ({ ...o, color: c }))}
                                />
                            ))}
                            </div>
                        </>
                    )}
                    {activeTool === 'highlight' && (
                        <>
                            <span className="pdf-toolbar__label" id={fid('color3')}>Color:</span>
                            <div role="group" aria-labelledby={fid('color3')} className="pdf-toolbar__group">
                            {HIGHLIGHT_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={c}
                                    aria-pressed={toolOptions.highlightColor === c}
                                    className="pdf-toolbar__color-swatch"
                                    style={{ background: c, outline: toolOptions.highlightColor === c ? '2px solid hsl(var(--primary))' : 'none' }}
                                    onClick={() => setToolOptions(o => ({ ...o, highlightColor: c }))}
                                />
                            ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
