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

    if (!summary || summary.totalOpen === 0) return null;

    return (
        <div className="dashboard-card tasks-widget">
            <div className="dashboard-card__header">
                <h3>{Icons.checkSquare} Tasks</h3>
                <button className="link-btn" onClick={() => navigate('/tasks')}>View All</button>
            </div>
            <div className="tasks-widget__counts">
                {summary.overdue > 0 && (
                    <button className="tasks-widget__count tasks-widget__count--danger" onClick={() => navigate('/tasks?status=open&overdue=true')}>
                        <span className="tasks-widget__number">{summary.overdue}</span>
                        <span className="tasks-widget__label">Overdue</span>
                    </button>
                )}
                {summary.dueToday > 0 && (
                    <button className="tasks-widget__count tasks-widget__count--warning" onClick={() => navigate('/tasks?status=open')}>
                        <span className="tasks-widget__number">{summary.dueToday}</span>
                        <span className="tasks-widget__label">Due Today</span>
                    </button>
                )}
                <button className="tasks-widget__count" onClick={() => navigate('/tasks')}>
                    <span className="tasks-widget__number">{summary.totalOpen}</span>
                    <span className="tasks-widget__label">Total Open</span>
                </button>
            </div>
        </div>
    );
}
