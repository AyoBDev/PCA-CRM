import { useState } from 'react';
import { createTask, updateTask } from '../../api';
import { useToast } from '../../hooks/useToast';
import Modal from '../common/Modal';

export default function TaskModal({ task, users, onClose, onSaved }) {
    const { showToast } = useToast();
    const isEdit = !!task;

    const [form, setForm] = useState({
        title: task?.title || '',
        description: task?.description || '',
        notes: task?.notes || '',
        urgency: task?.urgency || 'medium',
        dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        assignedToUserId: task?.assignedToUserId || '',
        assignedToRole: task?.assignedToRole || '',
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (field, value) => {
        setForm((f) => ({ ...f, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }
        setSaving(true);
        try {
            const data = {
                title: form.title.trim(),
                description: form.description.trim(),
                notes: form.notes.trim(),
                urgency: form.urgency,
                dueDate: form.dueDate || null,
                assignedToUserId: form.assignedToUserId ? Number(form.assignedToUserId) : null,
                assignedToRole: form.assignedToRole || null,
            };
            if (isEdit) {
                await updateTask(task.id, data);
                showToast('Task updated');
            } else {
                await createTask(data);
                showToast('Task created');
            }
            onSaved();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Task' : 'New Task'}</h2>
            <p className="modal__desc">{isEdit ? 'Update task details and assignment.' : 'Create a new task with assignment and due date.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Title *</label>
                    <input type="text" value={form.title} onChange={(e) => handleChange('title', e.target.value)} placeholder="Enter task title" autoFocus />
                </div>

                <div className="form-group">
                    <label>Description</label>
                    <textarea rows={2} value={form.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Optional description" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Urgency</label>
                        <select value={form.urgency} onChange={(e) => handleChange('urgency', e.target.value)}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Due Date</label>
                        <input type="date" value={form.dueDate} onChange={(e) => handleChange('dueDate', e.target.value)} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Assign to User</label>
                        <select value={form.assignedToUserId} onChange={(e) => handleChange('assignedToUserId', e.target.value)}>
                            <option value="">— None —</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Or Assign to Role</label>
                        <select value={form.assignedToRole} onChange={(e) => handleChange('assignedToRole', e.target.value)}>
                            <option value="">— None —</option>
                            <option value="admin">Admin</option>
                            <option value="pca">PCA</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label>Notes</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Internal notes" />
                </div>

                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>
                        {saving ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
