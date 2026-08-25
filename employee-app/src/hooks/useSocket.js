import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { TOKEN_KEY } from '../authKeys';

const WS_URL = import.meta.env.VITE_WS_URL || '';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const socket = io(WS_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => { socket.disconnect(); };
  }, []);

  return { socket: socketRef.current, connected };
}
