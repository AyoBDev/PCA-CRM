import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSocket } from './useSocket';
import { useAuth } from './useAuth';
import { api } from '../api';

const MessagingContext = createContext(null);

export function MessagingProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const onMessagesPageRef = useRef(false);

  useEffect(() => {
    onMessagesPageRef.current = location.pathname === '/messages';
  }, [location.pathname]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getMessageUnreadCount();
      setUnreadCount(data?.unreadCount || 0);
    } catch {
      /* silent */
    }
  }, []);

  const clear = useCallback(() => {
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!socket || !user) return;

    function onMessage(payload) {
      if (!payload) return;
      if (payload.senderId === user.id) return;
      if (onMessagesPageRef.current) return;
      setUnreadCount((n) => n + 1);
    }

    function onConnect() {
      refresh();
    }

    socket.on('chat:message', onMessage);
    socket.on('connect', onConnect);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('connect', onConnect);
    };
  }, [socket, user, refresh]);

  return (
    <MessagingContext.Provider value={{ unreadCount, refresh, clear }}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used within MessagingProvider');
  return ctx;
}
