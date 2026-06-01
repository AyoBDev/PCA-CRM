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
        <Modal title={isEdit ? 'Edit Task' : 'New Task'} onClose={onClose}>
            <form onSubmit={handleSubmit} className="modal-form">
                <label className="form-field">
                    <span>Title *</span>
                    <input type="text" value={form.title} onChange={(e) => handleChange('title', e.target.value)} autoFocus />
                </label>

                <label className="form-field">
                    <span>Description</span>
                    <textarea rows={2} value={form.description} onChange={(e) => handleChange('description', e.target.value)} />
                </label>

                <div className="form-row">
                    <label className="form-field">
                        <span>Urgency</span>
                        <select value={form.urgency} onChange={(e) => handleChange('urgency', e.target.value)}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </label>

                    <label className="form-field">
                        <span>Due Date</span>
                        <input type="date" value={form.dueDate} onChange={(e) => handleChange('dueDate', e.target.value)} />
                    </label>
                </div>

                <div className="form-row">
                    <label className="form-field">
                        <span>Assign to User</span>
                        <select value={form.assignedToUserId} onChange={(e) => handleChange('assignedToUserId', e.target.value)}>
                            <option value="">— None —</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </label>

                    <label className="form-field">
                        <span>Or Assign to Role</span>
                        <select value={form.assignedToRole} onChange={(e) => handleChange('assignedToRole', e.target.value)}>
                            <option value="">— None —</option>
                            <option value="admin">Admin</option>
                            <option value="pca">PCA</option>
                        </select>
                    </label>
                </div>

                <label className="form-field">
                    <span>Notes</span>
                    <textarea rows={2} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
                </label>

                <div className="modal-actions">
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>
                        {saving ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
