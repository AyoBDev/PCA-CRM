import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function TasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTasks().then(data => setTasks(data || [])).finally(() => setLoading(false));
  }, []);

  const handleComplete = async (id) => {
    await api.completeTask(id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt: new Date().toISOString() } : t));
  };

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Tasks</h2>
      </div>
      {loading ? <div className="page-loading">Loading...</div> : tasks.length === 0 ? (
        <div className="empty-state"><p className="empty-state__text">No tasks</p></div>
      ) : tasks.map(task => (
        <div key={task.id} className={`task-item ${task.completedAt ? 'task-item--done' : ''}`}>
          <button
            className={`task-check ${task.completedAt ? 'task-check--done' : ''}`}
            onClick={() => !task.completedAt && handleComplete(task.id)}
            disabled={!!task.completedAt}
          >
            {task.completedAt && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
          </button>
          <div>
            <div className="task-title">{task.title}</div>
            {task.source && <div className="task-source">{task.source}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
