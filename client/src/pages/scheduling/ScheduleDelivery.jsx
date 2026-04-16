import { useState, useMemo, useRef } from 'react';
import { useToast } from '../../hooks/useToast';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hhmm12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const hr = h % 12 || 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function toDateStr(d) {
    if (typeof d === 'string') {
        const idx = d.indexOf('T');
        if (idx === 10) return d.slice(0, 10);
    }
    return new Date(d).toISOString().slice(0, 10);
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function formatEmployeeScheduleText(empName, shifts, weekLabel) {
    let text = `Hi ${empName},\n\n`;
    text += `Here is your schedule for the week of ${weekLabel}:\n\n`;

    // Group shifts by date
    const byDate = new Map();
    for (const s of shifts) {
        const dateStr = toDateStr(s.shiftDate);
        if (!byDate.has(dateStr)) byDate.set(dateStr, []);
        byDate.get(dateStr).push(s);
    }

    for (const [dateStr, dayShifts] of byDate) {
        const d = new Date(dateStr + 'T12:00:00Z');
        const dayName = DAY_NAMES[d.getUTCDay()];
        text += `${dayName} ${formatDate(dateStr)}\n`;

        for (const shift of dayShifts) {
            const clientName = shift.client?.clientName || 'N/A';
            text += `  ${hhmm12(shift.startTime)} - ${hhmm12(shift.endTime)} — ${clientName}\n`;
            if (shift.client?.address) text += `  Address: ${shift.client.address}\n`;
            if (shift.client?.phone) text += `  Phone: ${shift.client.phone}\n`;
            if (shift.client?.gateCode) text += `  Gate Code: ${shift.client.gateCode}\n`;
        }
        text += '\n';
    }

    text += 'Thank you,\nNV Best PCA';
    return text;
}

export default function ScheduleDelivery({ weekStart, shifts }) {
    const [selectedEmpId, setSelectedEmpId] = useState('all');
    const [copied, setCopied] = useState(false);
    const { showToast } = useToast();
    const textRef = useRef(null);

    const weekEnd = useMemo(() => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + 6);
        return toDateStr(d);
    }, [weekStart]);

    const weekLabel = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

    // Group shifts by employee
    const byEmployee = useMemo(() => {
        const map = new Map();
        const activeShifts = (shifts || []).filter(s => s.status !== 'cancelled');
        for (const s of activeShifts) {
            if (!s.employeeId || !s.employee) continue;
            const key = s.employeeId;
            if (!map.has(key)) {
                map.set(key, { name: s.employee.name || s.displayEmployeeName || '', shifts: [] });
            }
            map.get(key).shifts.push(s);
        }
        for (const [, entry] of map) {
            entry.shifts.sort((a, b) => {
                const da = toDateStr(a.shiftDate), db = toDateStr(b.shiftDate);
                if (da !== db) return da < db ? -1 : 1;
                return (a.startTime || '') < (b.startTime || '') ? -1 : 1;
            });
        }
        return map;
    }, [shifts]);

    const employees = useMemo(() =>
        [...byEmployee.entries()].map(([id, { name }]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        [byEmployee]
    );

    const generatedText = useMemo(() => {
        if (byEmployee.size === 0) return '';

        if (selectedEmpId === 'all') {
            return [...byEmployee.entries()]
                .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                .map(([, { name, shifts: empShifts }]) => formatEmployeeScheduleText(name, empShifts, weekLabel))
                .join('\n---\n\n');
        }

        const entry = byEmployee.get(Number(selectedEmpId));
        if (!entry) return '';
        return formatEmployeeScheduleText(entry.name, entry.shifts, weekLabel);
    }, [byEmployee, selectedEmpId, weekLabel]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(generatedText);
            setCopied(true);
            showToast('Copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            if (textRef.current) {
                textRef.current.select();
                document.execCommand('copy');
                setCopied(true);
                showToast('Copied to clipboard');
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };

    return (
        <div className="sched-card" style={{ marginTop: 16 }}>
            <div className="sched-card__header">
                <div className="sched-card__header-left">
                    <div className="sched-card__header-title">Send Schedule</div>
                </div>
                <div className="sched-card__header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                        className="sched-card__select"
                        value={selectedEmpId}
                        onChange={e => setSelectedEmpId(e.target.value)}
                        style={{ minWidth: 160 }}
                    >
                        <option value="all">All Employees</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                    </select>
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handleCopy}
                        disabled={!generatedText}
                    >
                        {copied ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                </div>
            </div>
            <div className="sched-card__body">
                {byEmployee.size === 0 ? (
                    <p style={{ color: '#71717a' }}>No shifts scheduled for this week.</p>
                ) : (
                    <textarea
                        ref={textRef}
                        className="sched-delivery-text"
                        value={generatedText}
                        readOnly
                        rows={Math.min(Math.max(generatedText.split('\n').length, 6), 20)}
                    />
                )}
            </div>
        </div>
    );
}
