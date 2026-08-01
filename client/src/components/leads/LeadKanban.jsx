import { DndContext, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { LEAD_COLUMNS } from '../../utils/leadConstants';
import LeadCard from './LeadCard';

function Column({ column, leads, onView, onConvert, onMove, onArchive }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}` });
  return (
    <div className="k-col">
      <div className="k-col__head" style={{ borderTopColor: column.color }}>
        <span className="k-col__title">{column.label}</span>
        <span className="k-col__count">{leads.length}</span>
      </div>
      <div ref={setNodeRef} className={`k-col__body${isOver ? ' k-col__body--over' : ''}`}>
        {leads.length === 0 && <div className="k-empty">Drop leads here</div>}
        {leads.map((l) => (
          <LeadCard key={l.id} lead={l} onView={onView} onConvert={onConvert} onMove={onMove} onArchive={onArchive} />
        ))}
      </div>
    </div>
  );
}

export default function LeadKanban({ leads, search, caseTypeFilter, onMove, onView, onConvert, onArchive }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const q = (search || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const visible = leads.filter((l) => {
    if (caseTypeFilter && caseTypeFilter !== 'all' && l.caseType !== caseTypeFilter) return false;
    if (!q) return true;
    // Single haystack (with the full name as one token) so "First Last" matches.
    const hay = [`${l.firstName || ''} ${l.lastName || ''}`, l.phone, l.insuranceType, l.referralSource]
      .join(' ').toLowerCase().replace(/\s+/g, ' ');
    return hay.includes(q);
  });
  function handleDragEnd(e) {
    const overId = e.over?.id;
    if (!overId || !String(overId).startsWith('col-')) return;
    const columnId = String(overId).slice(4);
    const leadId = Number(String(e.active.id).slice(5));
    onMove(leadId, columnId);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="kanban-wrap"><div className="kanban">
        {LEAD_COLUMNS.map((col) => (
          <Column key={col.id} column={col}
            leads={visible.filter((l) => col.statuses.includes(l.status))}
            onView={onView} onConvert={onConvert} onMove={onMove} onArchive={onArchive} />
        ))}
      </div></div>
    </DndContext>
  );
}
