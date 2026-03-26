import { useRef, useEffect } from 'react';

export default function SignaturePad({ label, value, onChange, disabled }) {
    const canvasRef = useRef(null);
    const drawing = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (value) {
            const img = new Image();
            img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
            img.src = value;
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [value]);

    const getPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const start = (e) => { if (disabled) return; e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext('2d'); const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const draw = (e) => { if (!drawing.current || disabled) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const { x, y } = getPos(e); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#18181b'; ctx.lineTo(x, y); ctx.stroke(); };
    const end = () => { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current.toDataURL()); };
    const clear = () => { if (disabled) return; const ctx = canvasRef.current.getContext('2d'); ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); onChange(''); };

    return (
        <div className="signature-pad-wrap">
            <div className="signature-pad__label">{label}</div>
            <canvas ref={canvasRef} width={400} height={120}
                className={`signature-pad__canvas ${disabled ? 'signature-pad__canvas--disabled' : ''}`}
                onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={draw} onTouchEnd={end} />
            {!disabled && <button type="button" className="btn btn--outline btn--xs" onClick={clear}>Clear</button>}
        </div>
    );
}
