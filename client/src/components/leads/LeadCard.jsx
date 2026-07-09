import { useDraggable } from '@dnd-kit/core';
import { LEAD_CASE_TYPES } from '../../utils/leadConstants';
import { formatDate } from '../../utils/dates';
import * as Icons from '../common/Icons';

export default function LeadCard({ lead, onView, onConvert }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lead-${lead.id}` });
  const ct = LEAD_CASE_TYPES[lead.caseType] || LEAD_CASE_TYPES.initial;
  const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed lead';
  return (
    <div ref={setNodeRef} className={`lead-card${isDragging ? ' lead-card--dragging' : ''}`} {...listeners} {...attributes}>
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
