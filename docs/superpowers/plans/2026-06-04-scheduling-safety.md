# Scheduling Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add undo banners, per-page trash drawers, tiered delete confirmations, and date-scoped bulk edit panels to prevent accidental mass deletions across the app.

**Architecture:** Enhance existing soft-delete (`archivedAt`) with UI safety layers. New reusable components: UndoBanner (persistent 30s undo), TrashDrawer (per-page restore), DeleteConfirmModal (tiered confirmation), DateSelectionPanel (checkbox date picker for series operations). Backend adds restore and permanent-delete endpoints.

**Tech Stack:** React 19, Express.js, Prisma ORM, PostgreSQL, CSS custom properties (hsl design tokens)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `client/src/components/common/UndoBanner.jsx` | Persistent 30s undo banner with countdown |
| `client/src/components/common/TrashDrawer.jsx` | Per-page trash drawer with restore/permanent delete |
| `client/src/components/common/DeleteConfirmModal.jsx` | Tiered confirmation: simple → list → typed |
| `client/src/pages/scheduling/DateSelectionPanel.jsx` | Checkbox date list for scoped series edits |
| `client/src/index.css` | CSS for new components |
| `server/src/controllers/schedulingController.js` | New restore + permanent-delete endpoints |
| `server/src/controllers/clientController.js` | Restore + permanent-delete for clients |
| `server/src/controllers/employeeController.js` | Restore + permanent-delete for employees |
| `server/src/routes/api.js` | New route definitions |
| `client/src/api.js` | New API client functions |
| `client/src/pages/SchedulingPage.jsx` | Wire UndoBanner, TrashDrawer, DeleteConfirmModal, DateSelectionPanel |
| `client/src/pages/ClientsListPage.jsx` | Wire TrashDrawer + DeleteConfirmModal |
| `client/src/pages/EmployeesPage.jsx` | Wire TrashDrawer + DeleteConfirmModal |

---

### Task 1: UndoBanner Component

**Files:**
- Create: `client/src/components/common/UndoBanner.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Create UndoBanner component**

```jsx
// client/src/components/common/UndoBanner.jsx
import { useState, useEffect, useRef } from 'react';

export default function UndoBanner({ message, onUndo, duration = 30, onDismiss }) {
    const [remaining, setRemaining] = useState(duration);
    const intervalRef = useRef(null);

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    if (onDismiss) onDismiss();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(intervalRef.current);
    }, [onDismiss, duration]);

    const handleUndo = async () => {
        clearInterval(intervalRef.current);
        await onUndo();
        if (onDismiss) onDismiss();
    };

    if (remaining <= 0) return null;

    return (
        <div className="undo-banner">
            <div className="undo-banner__content">
                <span className="undo-banner__message">{message}</span>
                <button className="btn btn--primary btn--sm" onClick={handleUndo}>Undo</button>
                <span className="undo-banner__countdown">{remaining}s</span>
            </div>
            <button className="undo-banner__dismiss" onClick={onDismiss} title="Dismiss">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Add CSS for UndoBanner**

Add to the end of `client/src/index.css`:

```css
/* ─── Undo Banner ─── */
.undo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: hsl(var(--foreground));
  color: hsl(var(--background));
  border-radius: var(--radius);
  margin-bottom: 12px;
  animation: undo-banner-in 0.2s ease-out;
}
@keyframes undo-banner-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.undo-banner__content {
  display: flex;
  align-items: center;
  gap: 12px;
}
.undo-banner__message {
  font-size: 13px;
  font-weight: 500;
}
.undo-banner__countdown {
  font-size: 12px;
  opacity: 0.6;
  min-width: 28px;
}
.undo-banner__dismiss {
  background: none;
  border: none;
  color: hsl(var(--background));
  cursor: pointer;
  opacity: 0.6;
  padding: 4px;
}
.undo-banner__dismiss:hover {
  opacity: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/common/UndoBanner.jsx client/src/index.css
git commit -m "feat: add UndoBanner component with 30s countdown"
```

---

### Task 2: DeleteConfirmModal Component

**Files:**
- Create: `client/src/components/common/DeleteConfirmModal.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Create DeleteConfirmModal component**

```jsx
// client/src/components/common/DeleteConfirmModal.jsx
import { useState } from 'react';
import Modal from './Modal';
import Icons from './Icons';

export default function DeleteConfirmModal({
    title,
    items,
    onConfirm,
    onClose,
    confirmLabel = 'Delete',
    scopeWarning = null,
}) {
    const count = items.length;
    const needsTyped = count >= 5;
    const [typedConfirm, setTypedConfirm] = useState('');
    const [scopeAcknowledged, setScopeAcknowledged] = useState(!scopeWarning);
    const expectedText = `DELETE ${count}`;
    const canConfirm = needsTyped
        ? typedConfirm === expectedText && scopeAcknowledged
        : scopeAcknowledged;

    return (
        <Modal onClose={onClose} wide={count > 4}>
            <h2 className="modal__title">{title || `Delete ${count} item${count !== 1 ? 's' : ''}?`}</h2>
            <p className="modal__desc">
                This action will archive {count} item{count !== 1 ? 's' : ''}. You can restore them from the Trash drawer.
            </p>

            {scopeWarning && (
                <div className="dcm-scope-warning">
                    <span className="dcm-scope-warning__icon">{Icons.alertTriangle}</span>
                    <span className="dcm-scope-warning__text">{scopeWarning}</span>
                    <label className="dcm-scope-warning__ack">
                        <input
                            type="checkbox"
                            checked={scopeAcknowledged}
                            onChange={(e) => setScopeAcknowledged(e.target.checked)}
                        />
                        I understand
                    </label>
                </div>
            )}

            {count <= 10 && (
                <div className="dcm-item-list">
                    {items.map((item, i) => (
                        <div key={i} className="dcm-item-list__row">{item.label}</div>
                    ))}
                </div>
            )}
            {count > 10 && (
                <div className="dcm-item-list">
                    {items.slice(0, 8).map((item, i) => (
                        <div key={i} className="dcm-item-list__row">{item.label}</div>
                    ))}
                    <div className="dcm-item-list__row dcm-item-list__row--more">
                        ...and {count - 8} more
                    </div>
                </div>
            )}

            {needsTyped && (
                <div className="form-group" style={{ marginTop: 16 }}>
                    <label>Type <strong>{expectedText}</strong> to confirm:</label>
                    <input
                        type="text"
                        value={typedConfirm}
                        onChange={(e) => setTypedConfirm(e.target.value)}
                        placeholder={expectedText}
                        autoFocus
                    />
                </div>
            )}

            <div className="form-actions">
                <button className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button
                    className="btn btn--danger"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                >
                    {Icons.trash} {confirmLabel}
                </button>
            </div>
        </Modal>
    );
}
```

- [ ] **Step 2: Add CSS for DeleteConfirmModal**

Add to `client/src/index.css`:

```css
/* ─── Delete Confirm Modal ─── */
.dcm-scope-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: hsl(var(--warning-bg));
  border: 1px solid hsl(var(--warning));
  border-radius: var(--radius);
  margin-bottom: 16px;
  font-size: 13px;
}
.dcm-scope-warning__icon {
  color: hsl(var(--warning));
  flex-shrink: 0;
  margin-top: 1px;
}
.dcm-scope-warning__text {
  flex: 1;
  color: hsl(var(--foreground));
  font-weight: 500;
}
.dcm-scope-warning__ack {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.dcm-item-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  margin-bottom: 16px;
}
.dcm-item-list__row {
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.dcm-item-list__row:last-child {
  border-bottom: none;
}
.dcm-item-list__row--more {
  color: hsl(var(--muted-foreground));
  font-style: italic;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/common/DeleteConfirmModal.jsx client/src/index.css
git commit -m "feat: add DeleteConfirmModal with tiered confirmation"
```

---

### Task 3: TrashDrawer Component

**Files:**
- Create: `client/src/components/common/TrashDrawer.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Create TrashDrawer component**

```jsx
// client/src/components/common/TrashDrawer.jsx
import { useState } from 'react';
import Icons from './Icons';
import { useAuth } from '../../hooks/useAuth';

export default function TrashDrawer({ items, batches, onRestore, onRestoreBatch, onPermanentDelete, onClose, entityLabel = 'items' }) {
    const { isAdmin } = useAuth();
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [confirmPermanent, setConfirmPermanent] = useState(false);
    const [permanentText, setPermanentText] = useState('');
    const [search, setSearch] = useState('');

    const filteredItems = items.filter(item => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (item.label || '').toLowerCase().includes(q);
    });

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRestoreSelected = () => {
        onRestore([...selectedIds]);
        setSelectedIds(new Set());
    };

    const handlePermanentDelete = () => {
        if (permanentText !== 'PERMANENT DELETE') return;
        onPermanentDelete([...selectedIds]);
        setSelectedIds(new Set());
        setConfirmPermanent(false);
        setPermanentText('');
    };

    return (
        <div className="activity-drawer-backdrop" onClick={onClose}>
            <aside className="activity-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="activity-drawer__header">
                    <h3 className="activity-drawer__title">{Icons.trash} Deleted {entityLabel}</h3>
                    <button className="activity-drawer__close" onClick={onClose} title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div className="activity-drawer__body">
                    <input
                        type="text"
                        className="page-hero__search"
                        placeholder={`Search deleted ${entityLabel}...`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', marginBottom: 12 }}
                    />

                    {selectedIds.size > 0 && (
                        <div className="trash-drawer__actions">
                            <span className="trash-drawer__count">{selectedIds.size} selected</span>
                            <button className="btn btn--primary btn--sm" onClick={handleRestoreSelected}>
                                {Icons.rotateCcw} Restore
                            </button>
                            {isAdmin && (
                                <button className="btn btn--danger btn--sm" onClick={() => setConfirmPermanent(true)}>
                                    Permanently Delete
                                </button>
                            )}
                        </div>
                    )}

                    {confirmPermanent && (
                        <div className="trash-drawer__permanent-confirm">
                            <p style={{ fontSize: 12, color: 'hsl(var(--destructive))', fontWeight: 500, margin: '0 0 8px' }}>
                                This cannot be undone. Type PERMANENT DELETE to confirm:
                            </p>
                            <input
                                type="text"
                                value={permanentText}
                                onChange={(e) => setPermanentText(e.target.value)}
                                placeholder="PERMANENT DELETE"
                                style={{ width: '100%', marginBottom: 8 }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn--danger btn--sm" onClick={handlePermanentDelete} disabled={permanentText !== 'PERMANENT DELETE'}>
                                    Confirm
                                </button>
                                <button className="btn btn--outline btn--sm" onClick={() => { setConfirmPermanent(false); setPermanentText(''); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {batches && batches.length > 0 && (
                        <div className="trash-drawer__section">
                            <h4 className="trash-drawer__section-title">Bulk Operations</h4>
                            {batches.map(batch => (
                                <div key={batch.id} className="trash-drawer__batch">
                                    <div className="trash-drawer__batch-info">
                                        <span className="trash-drawer__batch-label">
                                            {batch.action === 'ARCHIVE' ? 'Deleted' : 'Edited'} {batch.shiftCount} shifts
                                        </span>
                                        <span className="trash-drawer__batch-meta">
                                            {batch.userName} — {new Date(batch.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <button className="btn btn--outline btn--xs" onClick={() => onRestoreBatch(batch.id)}>
                                        Restore All
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="trash-drawer__section">
                        <h4 className="trash-drawer__section-title">All Deleted ({filteredItems.length})</h4>
                        {filteredItems.length === 0 && (
                            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '16px 0' }}>
                                No deleted {entityLabel} found.
                            </p>
                        )}
                        {filteredItems.map(item => (
                            <div key={item.id} className="trash-drawer__item">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => toggleSelect(item.id)}
                                />
                                <div className="trash-drawer__item-info">
                                    <span className="trash-drawer__item-label">{item.label}</span>
                                    <span className="trash-drawer__item-meta">
                                        {item.deletedBy} — {item.deletedAt}
                                    </span>
                                </div>
                                <button className="btn btn--outline btn--xs" onClick={() => onRestore([item.id])}>
                                    Restore
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>
        </div>
    );
}
```

- [ ] **Step 2: Add CSS for TrashDrawer**

Add to `client/src/index.css`:

```css
/* ─── Trash Drawer ─── */
.trash-drawer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: hsl(var(--muted));
  border-radius: var(--radius);
  margin-bottom: 12px;
}
.trash-drawer__count {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.trash-drawer__permanent-confirm {
  padding: 12px;
  background: hsl(var(--danger-bg));
  border: 1px solid hsl(var(--destructive));
  border-radius: var(--radius);
  margin-bottom: 12px;
}
.trash-drawer__section {
  margin-top: 16px;
}
.trash-drawer__section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
  margin: 0 0 8px;
}
.trash-drawer__batch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  margin-bottom: 6px;
}
.trash-drawer__batch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.trash-drawer__batch-label {
  font-size: 13px;
  font-weight: 500;
}
.trash-drawer__batch-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.trash-drawer__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid hsl(var(--border));
}
.trash-drawer__item:last-child {
  border-bottom: none;
}
.trash-drawer__item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.trash-drawer__item-label {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-drawer__item-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/common/TrashDrawer.jsx client/src/index.css
git commit -m "feat: add TrashDrawer component with restore and permanent delete"
```

---

### Task 4: DateSelectionPanel Component

**Files:**
- Create: `client/src/pages/scheduling/DateSelectionPanel.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Create DateSelectionPanel component**

```jsx
// client/src/pages/scheduling/DateSelectionPanel.jsx
import { useState, useMemo } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShiftDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${Number(d)}`;
}

function weekKey(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const sun = new Date(date);
    sun.setDate(date.getDate() - date.getDay());
    return sun.toISOString().split('T')[0];
}

export default function DateSelectionPanel({ shifts, selectedIds, onSelectionChange, actionLabel = 'Apply' }) {
    const [selectAllState, setSelectAllState] = useState(false);

    const groupedByWeek = useMemo(() => {
        const groups = {};
        for (const shift of shifts) {
            const raw = shift.shiftDate;
            const dateStr = typeof raw === 'string' && raw.includes('T') ? raw.split('T')[0] : String(raw);
            const wk = weekKey(dateStr);
            if (!groups[wk]) groups[wk] = [];
            groups[wk].push({ ...shift, dateStr });
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [shifts]);

    const allIds = shifts.map(s => s.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));

    const toggleAll = () => {
        if (allSelected) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(allIds));
        }
        setSelectAllState(!allSelected);
    };

    const selectNextNWeeks = (n) => {
        const today = new Date();
        const cutoff = new Date(today);
        cutoff.setDate(today.getDate() + n * 7);
        const ids = shifts
            .filter(s => {
                const dateStr = typeof s.shiftDate === 'string' && s.shiftDate.includes('T') ? s.shiftDate.split('T')[0] : String(s.shiftDate);
                return new Date(dateStr + 'T00:00:00') <= cutoff;
            })
            .map(s => s.id);
        onSelectionChange(new Set(ids));
    };

    const toggleShift = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange(next);
    };

    return (
        <div className="date-selection-panel">
            <div className="date-selection-panel__header">
                <span className="date-selection-panel__count">
                    {selectedIds.size} of {shifts.length} selected
                </span>
                <div className="date-selection-panel__quick">
                    <button className="btn btn--outline btn--xs" onClick={toggleAll}>
                        {allSelected ? 'Clear All' : 'Select All'}
                    </button>
                    <button className="btn btn--outline btn--xs" onClick={() => selectNextNWeeks(4)}>
                        Next 4 Weeks
                    </button>
                    <button className="btn btn--outline btn--xs" onClick={() => onSelectionChange(new Set())}>
                        Clear
                    </button>
                </div>
            </div>
            <div className="date-selection-panel__list">
                {groupedByWeek.map(([wkStart, weekShifts]) => (
                    <div key={wkStart} className="date-selection-panel__week">
                        <div className="date-selection-panel__week-header">
                            Week of {formatShiftDate(wkStart)}
                        </div>
                        {weekShifts.map(shift => (
                            <label key={shift.id} className="date-selection-panel__row">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(shift.id)}
                                    onChange={() => toggleShift(shift.id)}
                                />
                                <span className="date-selection-panel__date">
                                    {formatShiftDate(shift.dateStr)}
                                </span>
                                <span className="date-selection-panel__detail">
                                    {shift.client?.clientName || 'Unknown'}
                                </span>
                                <span className="date-selection-panel__time">
                                    {shift.startTime || ''} – {shift.endTime || ''}
                                </span>
                            </label>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Add CSS for DateSelectionPanel**

Add to `client/src/index.css`:

```css
/* ─── Date Selection Panel ─── */
.date-selection-panel {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  margin: 12px 0;
}
.date-selection-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.5);
}
.date-selection-panel__count {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.date-selection-panel__quick {
  display: flex;
  gap: 6px;
}
.date-selection-panel__list {
  max-height: 280px;
  overflow-y: auto;
}
.date-selection-panel__week {
  border-bottom: 1px solid hsl(var(--border));
}
.date-selection-panel__week:last-child {
  border-bottom: none;
}
.date-selection-panel__week-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: hsl(var(--muted-foreground));
  padding: 8px 14px 4px;
  background: hsl(var(--muted) / 0.3);
}
.date-selection-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.1s;
}
.date-selection-panel__row:hover {
  background: hsl(var(--muted) / 0.5);
}
.date-selection-panel__date {
  font-size: 12px;
  font-weight: 500;
  min-width: 90px;
}
.date-selection-panel__detail {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.date-selection-panel__time {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/scheduling/DateSelectionPanel.jsx client/src/index.css
git commit -m "feat: add DateSelectionPanel for scoped series edits"
```

---

### Task 5: Backend — Restore and Permanent Delete Endpoints

**Files:**
- Modify: `server/src/controllers/schedulingController.js`
- Modify: `server/src/routes/api.js`
- Modify: `client/src/api.js`

- [ ] **Step 1: Add restore endpoint to schedulingController.js**

Add after the `bulkUndoBatch` function:

```javascript
// POST /api/shifts/restore
async function restoreShifts(req, res, next) {
    try {
        const { shiftIds } = req.body;
        if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
            return res.status(400).json({ error: 'shiftIds array is required' });
        }
        const result = await prisma.shift.updateMany({
            where: { id: { in: shiftIds.map(Number) }, archivedAt: { not: null } },
            data: { archivedAt: null },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'RESTORE', entityType: 'Shift', entityId: shiftIds[0],
            metadata: { bulk: true, count: result.count, shiftIds },
        });
        res.json({ restored: result.count });
    } catch (err) { next(err); }
}
```

- [ ] **Step 2: Add permanent delete endpoint to schedulingController.js**

```javascript
// DELETE /api/shifts/permanent
async function permanentDeleteShifts(req, res, next) {
    try {
        const { shiftIds } = req.body;
        if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
            return res.status(400).json({ error: 'shiftIds array is required' });
        }
        const result = await prisma.shift.deleteMany({
            where: { id: { in: shiftIds.map(Number) }, archivedAt: { not: null } },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'PERMANENT_DELETE', entityType: 'Shift', entityId: shiftIds[0],
            metadata: { bulk: true, count: result.count, shiftIds },
        });
        res.json({ deleted: result.count });
    } catch (err) { next(err); }
}
```

- [ ] **Step 3: Add list archived shifts endpoint**

```javascript
// GET /api/shifts/archived
async function listArchivedShifts(req, res, next) {
    try {
        const shifts = await prisma.shift.findMany({
            where: { archivedAt: { not: null } },
            include: { client: { select: { clientName: true } }, employee: { select: { name: true } } },
            orderBy: { archivedAt: 'desc' },
            take: 200,
        });
        res.json(shifts.map(s => ({
            id: s.id,
            label: `${s.client?.clientName || 'Unknown'} — ${s.shiftDate ? new Date(s.shiftDate).toLocaleDateString() : '?'} (${s.startTime || '?'}–${s.endTime || '?'})`,
            clientName: s.client?.clientName || '',
            employeeName: s.employee?.name || '',
            shiftDate: s.shiftDate,
            startTime: s.startTime,
            endTime: s.endTime,
            serviceCode: s.serviceCode,
            archivedAt: s.archivedAt,
            deletedBy: 'Admin',
            deletedAt: s.archivedAt ? new Date(s.archivedAt).toLocaleString() : '',
        })));
    } catch (err) { next(err); }
}
```

- [ ] **Step 4: Export new functions and add routes**

In `schedulingController.js`, add to the module.exports:
```javascript
module.exports = {
    // ... existing exports
    restoreShifts,
    permanentDeleteShifts,
    listArchivedShifts,
};
```

In `server/src/routes/api.js`, add after the existing shift bulk routes:
```javascript
router.post('/shifts/restore',              requireRole('admin', 'user', 'pca'), restoreShifts);
router.delete('/shifts/permanent',          requireRole('admin'), permanentDeleteShifts);
router.get('/shifts/archived',              requireRole('admin', 'user', 'pca'), listArchivedShifts);
```

- [ ] **Step 5: Add API client functions**

In `client/src/api.js`, add:
```javascript
export const restoreShifts = (shiftIds) =>
    request('/shifts/restore', { method: 'POST', body: JSON.stringify({ shiftIds }) });

export const permanentDeleteShifts = (shiftIds) =>
    request('/shifts/permanent', { method: 'DELETE', body: JSON.stringify({ shiftIds }) });

export const listArchivedShifts = () =>
    request('/shifts/archived');
```

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/schedulingController.js server/src/routes/api.js client/src/api.js
git commit -m "feat: add restore, permanent delete, and list archived endpoints for shifts"
```

---

### Task 6: Wire UndoBanner into SchedulingPage

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx`

- [ ] **Step 1: Add UndoBanner state and import**

At the top of `SchedulingPage.jsx`, add import:
```javascript
import UndoBanner from '../components/common/UndoBanner';
```

Add state after existing state declarations (before early returns):
```javascript
const [undoBanners, setUndoBanners] = useState([]);
```

Add helper function:
```javascript
const addUndoBanner = (message, batchId) => {
    const id = Date.now();
    setUndoBanners(prev => [...prev, { id, message, batchId }]);
};

const removeUndoBanner = (id) => {
    setUndoBanners(prev => prev.filter(b => b.id !== id));
};
```

- [ ] **Step 2: Replace showUndoToast calls with addUndoBanner**

In `handleBulkDelete`, replace the `showUndoToast(...)` call with:
```javascript
addUndoBanner(`Archived ${result.archived} shift${result.archived !== 1 ? 's' : ''}`, result.batchId);
```

Apply the same pattern to any other `showUndoToast` calls for bulk operations.

- [ ] **Step 3: Render UndoBanners in the page layout**

In the JSX, before the main content area (after the page-hero section), add:
```jsx
{undoBanners.map(banner => (
    <UndoBanner
        key={banner.id}
        message={banner.message}
        onUndo={async () => {
            await api.bulkUndoShifts(banner.batchId);
            refetchAll();
            fetchBatches();
        }}
        onDismiss={() => removeUndoBanner(banner.id)}
    />
))}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx
git commit -m "feat: wire UndoBanner into scheduling page bulk operations"
```

---

### Task 7: Wire TrashDrawer into SchedulingPage

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx`

- [ ] **Step 1: Add TrashDrawer state and import**

Add import:
```javascript
import TrashDrawer from '../components/common/TrashDrawer';
```

Add state:
```javascript
const [trashOpen, setTrashOpen] = useState(false);
const [archivedShifts, setArchivedShifts] = useState([]);
```

Add fetch function:
```javascript
const fetchArchivedShifts = useCallback(async () => {
    try {
        const data = await api.listArchivedShifts();
        setArchivedShifts(data);
    } catch {}
}, []);

useEffect(() => {
    if (trashOpen) fetchArchivedShifts();
}, [trashOpen, fetchArchivedShifts]);
```

- [ ] **Step 2: Add Trash button to page header**

In the page-hero__right section, add a Trash button:
```jsx
<button
    className="btn btn--outline btn--sm"
    onClick={() => setTrashOpen(true)}
    title="View deleted shifts"
>
    {Icons.trash}
    {archivedShifts.length > 0 && <span className="ts-badge ts-badge--draft" style={{ marginLeft: 4 }}>{archivedShifts.length}</span>}
</button>
```

- [ ] **Step 3: Render TrashDrawer**

At the bottom of the component JSX (before the closing `</div>`):
```jsx
{trashOpen && (
    <TrashDrawer
        items={archivedShifts}
        batches={bulkBatches.filter(b => b.action === 'ARCHIVE' && !b.undoneAt)}
        onRestore={async (ids) => {
            await api.restoreShifts(ids);
            refetchAll();
            fetchArchivedShifts();
            fetchBatches();
            showToast(`Restored ${ids.length} shift${ids.length !== 1 ? 's' : ''}`);
        }}
        onRestoreBatch={async (batchId) => {
            await api.bulkUndoShifts(batchId);
            refetchAll();
            fetchArchivedShifts();
            fetchBatches();
            showToast('Batch restored');
        }}
        onPermanentDelete={async (ids) => {
            await api.permanentDeleteShifts(ids);
            fetchArchivedShifts();
            showToast(`Permanently deleted ${ids.length} shift${ids.length !== 1 ? 's' : ''}`);
        }}
        onClose={() => setTrashOpen(false)}
        entityLabel="shifts"
    />
)}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx
git commit -m "feat: wire TrashDrawer into scheduling page"
```

---

### Task 8: Wire DeleteConfirmModal into SchedulingPage

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx`

- [ ] **Step 1: Add DeleteConfirmModal import and state**

Add import:
```javascript
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
```

Add state:
```javascript
const [deleteConfirm, setDeleteConfirm] = useState(null);
```

- [ ] **Step 2: Replace inline confirm flows with DeleteConfirmModal**

In the existing `BulkEditInline` delete flow, instead of the inline "Are you sure?" pattern, call a function that opens the modal:

Replace the direct `handleBulkDelete()` invocation with:
```javascript
const showDeleteConfirm = (shiftIds, shifts) => {
    const items = shifts.map(s => ({
        id: s.id,
        label: `${s.client?.clientName || 'Unknown'} — ${s.shiftDate ? new Date(s.shiftDate).toLocaleDateString() : '?'} (${s.startTime}–${s.endTime})`,
    }));
    const uniqueClients = [...new Set(shifts.map(s => s.client?.clientName).filter(Boolean))];
    const uniqueEmployees = [...new Set(shifts.map(s => s.displayEmployeeName || s.employee?.name).filter(Boolean))];
    const scopeWarning = (uniqueClients.length > 1 || uniqueEmployees.length > 1)
        ? `This affects ${uniqueClients.length} client${uniqueClients.length !== 1 ? 's' : ''} and ${uniqueEmployees.length} employee${uniqueEmployees.length !== 1 ? 's' : ''}`
        : null;
    setDeleteConfirm({ shiftIds, items, scopeWarning });
};
```

- [ ] **Step 3: Render DeleteConfirmModal**

```jsx
{deleteConfirm && (
    <DeleteConfirmModal
        title={`Delete ${deleteConfirm.items.length} shift${deleteConfirm.items.length !== 1 ? 's' : ''}?`}
        items={deleteConfirm.items}
        scopeWarning={deleteConfirm.scopeWarning}
        onConfirm={async () => {
            setDeleteConfirm(null);
            await handleBulkDeleteByIds(deleteConfirm.shiftIds);
        }}
        onClose={() => setDeleteConfirm(null)}
    />
)}
```

- [ ] **Step 4: Add handleBulkDeleteByIds helper**

```javascript
const handleBulkDeleteByIds = async (shiftIds) => {
    try {
        setBulkSaving(true);
        const result = await api.bulkDeleteShifts(shiftIds);
        setSelectedShiftIds(new Set());
        setBulkEditMode(false);
        setModal(null);
        refetchAll();
        fetchBatches();
        addUndoBanner(`Archived ${result.archived} shift${result.archived !== 1 ? 's' : ''}`, result.batchId);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setBulkSaving(false);
    }
};
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx
git commit -m "feat: wire DeleteConfirmModal with tiered confirmation into scheduling"
```

---

### Task 9: Wire DateSelectionPanel into BulkEditModal

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx`

- [ ] **Step 1: Import DateSelectionPanel**

```javascript
import DateSelectionPanel from './scheduling/DateSelectionPanel';
```

- [ ] **Step 2: Add date selection state to BulkEditModal**

Inside the `BulkEditModal` function component, add:
```javascript
const [showDateSelect, setShowDateSelect] = useState(false);
const [dateSelectedIds, setDateSelectedIds] = useState(new Set());
const [futureSeriesShifts, setFutureSeriesShifts] = useState([]);
```

- [ ] **Step 3: Modify "Apply to future" toggle behavior**

When user enables "Apply to future", instead of the current radio button that sends `applyToFuture: true`, fetch the future shifts and show the date panel:

```javascript
const handleApplyToFutureToggle = async (enabled) => {
    if (!enabled) {
        setShowDateSelect(false);
        setFutureSeriesShifts([]);
        setDateSelectedIds(new Set());
        return;
    }
    // Gather recurringGroupIds from selected shifts
    const groupIds = [...new Set(
        selectedShifts.filter(s => s.recurringGroupId).map(s => s.recurringGroupId)
    )];
    if (groupIds.length === 0) {
        showToast('No recurring group found for selected shifts', 'error');
        return;
    }
    // Fetch future shifts in those groups
    const today = new Date().toISOString().split('T')[0];
    const future = allShifts.filter(s =>
        groupIds.includes(s.recurringGroupId) &&
        s.shiftDate && String(s.shiftDate).split('T')[0] > today &&
        !selectedIds.has(s.id)
    );
    setFutureSeriesShifts(future);
    setDateSelectedIds(new Set());
    setShowDateSelect(true);
};
```

- [ ] **Step 4: Render DateSelectionPanel in BulkEditModal**

After the "Apply to future" toggle area, conditionally render:
```jsx
{showDateSelect && futureSeriesShifts.length > 0 && (
    <DateSelectionPanel
        shifts={futureSeriesShifts}
        selectedIds={dateSelectedIds}
        onSelectionChange={setDateSelectedIds}
    />
)}
```

- [ ] **Step 5: Update save handler to use explicit IDs**

In the BulkEditModal save handler, instead of passing `applyToFuture: true`, combine the currently selected shift IDs with `dateSelectedIds`:

```javascript
const allTargetIds = [...selectedIds, ...(showDateSelect ? dateSelectedIds : [])];
```

Pass `allTargetIds` as the shift IDs to the bulk update API instead of using `applyToFuture`.

- [ ] **Step 6: Apply same pattern for series delete**

When user clicks "Delete" in a context where shifts have a `recurringGroupId`, show the DateSelectionPanel with all shifts in that group. User selects which dates to delete, then proceeds through DeleteConfirmModal.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx
git commit -m "feat: wire DateSelectionPanel into BulkEditModal for scoped series operations"
```

---

### Task 10: Wire TrashDrawer into Clients and Employees Pages

**Files:**
- Modify: `client/src/pages/ClientsListPage.jsx`
- Modify: `client/src/pages/EmployeesPage.jsx`
- Modify: `server/src/controllers/clientController.js`
- Modify: `server/src/controllers/employeeController.js`
- Modify: `server/src/routes/api.js`
- Modify: `client/src/api.js`

- [ ] **Step 1: Add backend endpoints for clients**

In `clientController.js`, add:
```javascript
async function listArchivedClients(req, res, next) {
    try {
        const clients = await prisma.client.findMany({
            where: { archivedAt: { not: null } },
            orderBy: { archivedAt: 'desc' },
            take: 200,
        });
        res.json(clients.map(c => ({
            id: c.id,
            label: `${c.clientName} (${c.medicaidId || 'No ID'})`,
            clientName: c.clientName,
            archivedAt: c.archivedAt,
            deletedBy: 'Admin',
            deletedAt: c.archivedAt ? new Date(c.archivedAt).toLocaleString() : '',
        })));
    } catch (err) { next(err); }
}

async function restoreClients(req, res, next) {
    try {
        const { clientIds } = req.body;
        if (!Array.isArray(clientIds) || clientIds.length === 0) {
            return res.status(400).json({ error: 'clientIds array is required' });
        }
        const result = await prisma.client.updateMany({
            where: { id: { in: clientIds.map(Number) }, archivedAt: { not: null } },
            data: { archivedAt: null },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'RESTORE', entityType: 'Client', entityId: clientIds[0],
            metadata: { bulk: true, count: result.count, clientIds },
        });
        res.json({ restored: result.count });
    } catch (err) { next(err); }
}

async function permanentDeleteClients(req, res, next) {
    try {
        const { clientIds } = req.body;
        if (!Array.isArray(clientIds) || clientIds.length === 0) {
            return res.status(400).json({ error: 'clientIds array is required' });
        }
        const result = await prisma.client.deleteMany({
            where: { id: { in: clientIds.map(Number) }, archivedAt: { not: null } },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'PERMANENT_DELETE', entityType: 'Client', entityId: clientIds[0],
            metadata: { bulk: true, count: result.count, clientIds },
        });
        res.json({ deleted: result.count });
    } catch (err) { next(err); }
}
```

- [ ] **Step 2: Add backend endpoints for employees**

In `employeeController.js`, add the same three functions (`listArchivedEmployees`, `restoreEmployees`, `permanentDeleteEmployees`) following the identical pattern but using the `employee` model and `employeeIds`.

- [ ] **Step 3: Add routes**

In `server/src/routes/api.js`:
```javascript
router.get('/clients/archived',             requireRole('admin', 'user', 'pca'), listArchivedClients);
router.post('/clients/restore',             requireRole('admin', 'user', 'pca'), restoreClients);
router.delete('/clients/permanent',         requireRole('admin'), permanentDeleteClients);

router.get('/employees/archived',           requireRole('admin', 'user', 'pca'), listArchivedEmployees);
router.post('/employees/restore',           requireRole('admin', 'user', 'pca'), restoreEmployees);
router.delete('/employees/permanent',       requireRole('admin'), permanentDeleteEmployees);
```

- [ ] **Step 4: Add API client functions**

In `client/src/api.js`:
```javascript
export const listArchivedClients = () => request('/clients/archived');
export const restoreClients = (clientIds) => request('/clients/restore', { method: 'POST', body: JSON.stringify({ clientIds }) });
export const permanentDeleteClients = (clientIds) => request('/clients/permanent', { method: 'DELETE', body: JSON.stringify({ clientIds }) });

export const listArchivedEmployees = () => request('/employees/archived');
export const restoreEmployees = (employeeIds) => request('/employees/restore', { method: 'POST', body: JSON.stringify({ employeeIds }) });
export const permanentDeleteEmployees = (employeeIds) => request('/employees/permanent', { method: 'DELETE', body: JSON.stringify({ employeeIds }) });
```

- [ ] **Step 5: Wire TrashDrawer into ClientsListPage**

Add imports, state, fetch, Trash button and `<TrashDrawer>` rendering following the same pattern as Task 7 (SchedulingPage), but using `api.listArchivedClients`, `api.restoreClients`, `api.permanentDeleteClients`.

- [ ] **Step 6: Wire TrashDrawer into EmployeesPage**

Same pattern using `api.listArchivedEmployees`, `api.restoreEmployees`, `api.permanentDeleteEmployees`.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/clientController.js server/src/controllers/employeeController.js server/src/routes/api.js client/src/api.js client/src/pages/ClientsListPage.jsx client/src/pages/EmployeesPage.jsx
git commit -m "feat: wire TrashDrawer into clients and employees pages with restore endpoints"
```

---
