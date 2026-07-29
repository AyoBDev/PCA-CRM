import { useState, useRef, useEffect } from 'react';
import { LEAD_COLUMNS, statusToColumn } from '../../utils/leadConstants';
import Icons from '../common/Icons';

// Shared 3-dot actions menu used by both the Kanban card (LeadCard) and the
// List view (LeadListView) so the two stay identical. Items: View Lead,
// Move to stage (flyout submenu of pipeline stages), Delete Lead.
//
// Props:
//   lead        : the lead object
//   onView      : (lead) => void
//   onMove      : (leadId, columnId) => void
//   onArchive   : (lead) => void
//   stopDrag    : optional (e) => void — passed by LeadCard to keep dnd-kit from
//                 starting a drag when interacting with the menu. Omitted in List.
//   onOpenChange: optional (open: boolean) => void — lets the parent lift its own
//                 stacking (e.g. the card) while the menu is open.
export default function LeadActionsMenu({ lead, onView, onMove, onArchive, stopDrag, onOpenChange, fixedPanel = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [panelPos, setPanelPos] = useState(null); // {top,left} for fixed panels
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const currentCol = statusToColumn(lead.status);

  const noop = () => {};
  const halt = stopDrag || noop;
  const PANEL_W = 200; // matches min-width in CSS

  // When using a fixed panel (inside a scroll container, e.g. the List table),
  // position it under the trigger and right-align it, keeping it on-screen.
  function computePanelPos() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8));
    setPanelPos({ top: Math.round(r.bottom + 4), left: Math.round(left) });
  }

  function openMenu() {
    if (fixedPanel) computePanelPos();
    setMenuOpen(true);
    setSubmenuOpen(false);
  }

  useEffect(() => {
    onOpenChange?.(menuOpen);
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
    }
    function handleEscape(e) {
      if (e.key === 'Escape') closeMenu();
    }
    // Close on scroll/resize so the fixed panel never detaches from its row.
    function handleReflow() { if (fixedPanel) closeMenu(); }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleReflow, true);
    window.addEventListener('resize', handleReflow);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleReflow, true);
      window.removeEventListener('resize', handleReflow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setSubmenuOpen(false);
  }

  return (
    <div className="lead-card__menu" ref={menuRef} onPointerDown={halt}>
      <button
        ref={triggerRef}
        type="button"
        className="lead-card__menu-trigger"
        aria-label="Lead actions"
        onPointerDown={halt}
        onClick={(e) => { e.stopPropagation(); menuOpen ? closeMenu() : openMenu(); }}
      >
        {Icons.moreVertical}
      </button>
      {menuOpen && (
        <div
          className={`lead-card__menu-panel${fixedPanel ? ' lead-card__menu-panel--fixed' : ''}`}
          style={fixedPanel && panelPos ? { top: panelPos.top, left: panelPos.left } : undefined}
          onPointerDown={halt}
        >
          <button
            type="button"
            className="dropdown-menu__item"
            onClick={(e) => { e.stopPropagation(); closeMenu(); onView?.(lead); }}
          >
            <span className="dropdown-menu__item-icon">{Icons.eye}</span>
            View Lead
          </button>

          <div
            className="lead-card__submenu-wrap"
            onMouseEnter={() => setSubmenuOpen(true)}
            onMouseLeave={() => setSubmenuOpen(false)}
          >
            <button
              type="button"
              className="dropdown-menu__item lead-card__submenu-trigger"
              onClick={(e) => { e.stopPropagation(); setSubmenuOpen((o) => !o); }}
            >
              <span className="dropdown-menu__item-icon">{Icons.repeat}</span>
              Move to stage
              <span className="lead-card__submenu-caret">{Icons.chevronRight}</span>
            </button>
            {submenuOpen && (
              <div className="lead-card__submenu-panel">
                {LEAD_COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    className="dropdown-menu__item"
                    disabled={col.id === currentCol}
                    onClick={(e) => { e.stopPropagation(); closeMenu(); onMove?.(lead.id, col.id); }}
                  >
                    <span className="lead-card__stage-dot" style={{ background: col.color }} aria-hidden="true" />
                    {col.label}
                    {col.id === currentCol && <span className="lead-card__stage-current">Current</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="dropdown-menu__item dropdown-menu__item--danger"
            onClick={(e) => { e.stopPropagation(); closeMenu(); onArchive?.(lead); }}
          >
            <span className="dropdown-menu__item-icon">{Icons.trash}</span>
            Delete Lead
          </button>
        </div>
      )}
    </div>
  );
}
