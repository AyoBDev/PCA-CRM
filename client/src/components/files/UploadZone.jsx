import { useState, useRef, useCallback } from 'react';

export default function UploadZone({ onUpload }) {
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef(null);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragging(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onUpload(files);
    }, [onUpload]);

    const handleClick = useCallback(() => {
        inputRef.current?.click();
    }, []);

    const handleChange = useCallback((e) => {
        const files = Array.from(e.target.files);
        if (files.length) onUpload(files);
        e.target.value = '';
    }, [onUpload]);

    return (
        <div
            className={`upload-zone ${dragging ? 'upload-zone--active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <svg className="upload-zone__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4"/>
                <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/>
            </svg>
            <p className="upload-zone__text">
                Drag & drop or <span className="upload-zone__link">click to upload</span>
            </p>
            <input ref={inputRef} type="file" multiple hidden onChange={handleChange} />
        </div>
    );
}
