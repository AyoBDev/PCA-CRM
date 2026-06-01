import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTaskSummary } from '../../api';
import Icons from '../common/Icons';

export default function TasksWidget() {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        getTaskSummary().then(setSummary).catch(() => {});
    }, []);

    if (!summary || summary.openTotal === 0) return null;

    return (
        <div className="attention-section">
            <div className="attention-section__header">
                {Icons.checkSquare}
                <span>Tasks</span>
            </div>
            <div className="attention-section__items">
                {summary.overdue > 0 && (
                    <button className="attention-item attention-item--destructive" onClick={() => navigate('/tasks')}>
                        <span className="attention-item__icon">{Icons.alertCircle}</span>
                        <span className="attention-item__label">{summary.overdue} overdue task{summary.overdue > 1 ? 's' : ''}</span>
                        <span className="attention-item__arrow">{Icons.chevronRight}</span>
                    </button>
                )}
                {summary.dueToday > 0 && (
                    <button className="attention-item attention-item--warning" onClick={() => navigate('/tasks')}>
                        <span className="attention-item__icon">{Icons.clock}</span>
                        <span className="attention-item__label">{summary.dueToday} task{summary.dueToday > 1 ? 's' : ''} due today</span>
                        <span className="attention-item__arrow">{Icons.chevronRight}</span>
                    </button>
                )}
                {summary.dueThisWeek > 0 && (
                    <button className="attention-item" onClick={() => navigate('/tasks')}>
                        <span className="attention-item__icon">{Icons.calendar}</span>
                        <span className="attention-item__label">{summary.dueThisWeek} task{summary.dueThisWeek > 1 ? 's' : ''} due this week</span>
                        <span className="attention-item__arrow">{Icons.chevronRight}</span>
                    </button>
                )}
                <button className="attention-item" onClick={() => navigate('/tasks')}>
                    <span className="attention-item__icon">{Icons.checkSquare}</span>
                    <span className="attention-item__label">{summary.openTotal} open task{summary.openTotal > 1 ? 's' : ''} total</span>
                    <span className="attention-item__arrow">{Icons.chevronRight}</span>
                </button>
            </div>
        </div>
    );
}
