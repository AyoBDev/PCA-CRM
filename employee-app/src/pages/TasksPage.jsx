import { useState, useEffect } from 'react';
import { api } from '../api';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getTasks().then(setTasks).finally(() => setLoading(false)); }, []);

  async function handleComplete(id) { await api.completeTask(id); setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt: new Date().toISOString() } : t)); }

  if (loading) return <div className="page-loading">Loading...</div>;
  const incomplete = tasks.filter(t => !t.completedAt);
  const completed = tasks.filter(t => t.completedAt);

  return (
    <div className="tasks-page">
      <h1 className="page-title">Tasks</h1>
      {incomplete.length === 0 && completed.length === 0 && <p className="text-muted">No tasks</p>}
      <ul className="task-list">
        {incomplete.map(t => (
          <li key={t.id} className="task-item"><button className={`task-check ${t.source === 'compliance' ? 'task-check--disabled' : ''}`} onClick={() => t.source !== 'compliance' && handleComplete(t.id)} disabled={t.source === 'compliance'} /><div className="task-content"><span className="task-title">{t.title}</span>{t.source === 'compliance' && <span className="task-source">Auto-resolves on cert approval</span>}</div></li>
        ))}
        {completed.map(t => (<li key={t.id} className="task-item task-item--done"><span className="task-check task-check--done">✓</span><span className="task-title">{t.title}</span></li>))}
      </ul>
    </div>
  );
}
