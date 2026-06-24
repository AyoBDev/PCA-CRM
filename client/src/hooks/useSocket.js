import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

export function useSocket() {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        const s = io(WS_URL, { auth: { token }, transports: ['websocket', 'polling'] });
        setSocket(s);

        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));

        return () => {
            s.disconnect();
            setSocket(null);
            setConnected(false);
        };
    }, []);

    return { socket, connected };
}
