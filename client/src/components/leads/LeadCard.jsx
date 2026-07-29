import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { LEAD_CASE_TYPES } from '../../utils/leadConstants';
import { formatDate } from '../../utils/dates';
import Icons from '../common/Icons';
import LeadActionsMenu from './LeadActionsMenu';

export default function LeadCard({ lead, onView, onConvert, onMove, onArchive }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lead-${lead.id}` });
  const ct = LEAD_CASE_TYPES[lead.caseType] || LEAD_CASE_TYPES.initial;
  const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed lead';
  const [menuOpen, setMenuOpen] = useState(false);

  // Stop pointer events from reaching dnd-kit's draggable so opening the menu
  // (or clicking an item) never starts a drag.
  const stopDrag = (e) => e.stopPropagation();

  return (
    <div ref={setNodeRef} className={`lead-card${isDragging ? ' lead-card--dragging' : ''}${menuOpen ? ' lead-card--menu-open' : ''}`} {...listeners} {...attributes}>
      <LeadActionsMenu
        lead={lead}
        onView={onView}
        onMove={onMove}
        onArchive={onArchive}
        stopDrag={stopDrag}
        onOpenChange={setMenuOpen}
      />

      <div className="lead-card__name">{name}</div>
      {lead.referralSource && (
        <div className="lead-card__source">{Icons.phone} {lead.referralSource}</div>
      )}
      <div className="lead-card__date">{Icons.calendar} Added {formatDate(lead.createdAt)}</div>
      <div className="lead-card__tags"><span className={`tag ${ct.tagClass}`}>{ct.label}</span></div>
      <div className="lead-card__actions">
        <button className="btn btn--xs" onPointerDown={(e) => e.stopPropagation()} onClick={() => onView(lead)}>View Details</button>
        {lead.status !== 'archived' && (
          <button className="btn btn--xs btn--success" onPointerDown={(e) => e.stopPropagation()} onClick={() => onConvert(lead)}>Convert</button>
        )}
      </div>
    </div>
  );
}
