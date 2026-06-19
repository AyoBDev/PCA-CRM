export function getFileTypeInfo(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();

    const types = {
        pdf: { color: 'hsl(0 55% 42%)', label: 'PDF', icon: 'pdf' },
        xlsx: { color: 'hsl(140 60% 35%)', label: 'XLSX', icon: 'spreadsheet' },
        xls: { color: 'hsl(140 60% 35%)', label: 'XLS', icon: 'spreadsheet' },
        csv: { color: 'hsl(140 60% 35%)', label: 'CSV', icon: 'spreadsheet' },
        doc: { color: 'hsl(215 70% 50%)', label: 'DOC', icon: 'document' },
        docx: { color: 'hsl(215 70% 50%)', label: 'DOCX', icon: 'document' },
        jpg: { color: 'hsl(270 50% 50%)', label: 'JPG', icon: 'image' },
        jpeg: { color: 'hsl(270 50% 50%)', label: 'JPEG', icon: 'image' },
        png: { color: 'hsl(270 50% 50%)', label: 'PNG', icon: 'image' },
        gif: { color: 'hsl(270 50% 50%)', label: 'GIF', icon: 'image' },
        webp: { color: 'hsl(270 50% 50%)', label: 'WEBP', icon: 'image' },
    };

    return types[ext] || { color: 'hsl(215 15% 55%)', label: ext.toUpperCase() || 'FILE', icon: 'file' };
}

export function FileTypeIcon({ fileName, size = 24 }) {
    const { color, icon } = getFileTypeInfo(fileName);

    const icons = {
        pdf: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6" strokeWidth="2"/></svg>,
        spreadsheet: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
        document: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>,
        image: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
        file: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>,
    };

    return icons[icon] || icons.file;
}

export function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}
