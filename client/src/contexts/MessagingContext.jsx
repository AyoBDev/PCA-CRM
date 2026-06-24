import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { getConversations, markConversationRead as apiMarkRead, getUnreadSummary } from '../api';

const MessagingContext = createContext(null);

export function MessagingProvider({ children }) {
    const { socket, connected } = useSocket();
    const [conversations, setConversations] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const activeIdRef = useRef(null);
    const [summary, setSummary] = useState({ unreadConversations: 0, unreadMessages: 0 });

    useEffect(() => {
        activeIdRef.current = activeConversationId;
    }, [activeConversationId]);

    const refresh = useCallback(async () => {
        try {
            const data = await getConversations();
            setConversations(data);
        } catch {
            /* silent — sidebar badge tolerates failure */
        }
    }, []);

    useEffect(() => {
        refresh();
        getUnreadSummary().then(setSummary).catch(() => {});
    }, [refresh]);

    const markRead = useCallback(async (id) => {
        try {
            await apiMarkRead(id);
            setConversations((list) =>
                list.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
            );
        } catch {
            /* silent */
        }
    }, []);

    useEffect(() => {
        if (!socket) return;

        function onMessage(payload) {
            if (!payload?.conversationId) return;
            setConversations((list) => {
                const idx = list.findIndex((c) => c.id === payload.conversationId);
                const isActive = activeIdRef.current === payload.conversationId;
                const employeeUserId = payload.employeeUserId
                    ?? (idx === -1 ? null : list[idx].employeeUserId);
                const isFromEmployee = employeeUserId != null
                    ? payload.senderId === employeeUserId
                    : payload.senderRole === 'pca';
                const increment = isFromEmployee && !isActive ? 1 : 0;
                if (idx === -1) {
                    refresh();
                    return list;
                }
                const updated = {
                    ...list[idx],
                    employeeUserId: list[idx].employeeUserId ?? payload.employeeUserId ?? null,
                    lastMessage: {
                        id: payload.id,
                        content: payload.content,
                        senderId: payload.senderId,
                        senderRole: payload.senderRole,
                        createdAt: payload.createdAt,
                    },
                    lastMessageAt: payload.createdAt,
                    unreadCount: (list[idx].unreadCount || 0) + increment,
                };
                const next = [updated, ...list.filter((_, i) => i !== idx)];
                return next;
            });
        }

        function onConversationUpdated(payload) {
            if (!payload?.conversationId) return;
            setConversations((list) => {
                const idx = list.findIndex((c) => c.id === payload.conversationId);
                if (idx === -1) {
                    refresh();
                    return list;
                }
                const next = [...list];
                next[idx] = {
                    ...next[idx],
                    lastMessage: payload.lastMessage,
                    lastMessageAt: payload.lastMessageAt,
                    employeeName: payload.employeeName || next[idx].employeeName,
                    employeeUserId: payload.employeeUserId ?? next[idx].employeeUserId ?? null,
                };
                const item = next.splice(idx, 1)[0];
                return [item, ...next];
            });
        }

        function onConversationRead(payload) {
            if (!payload?.conversationId) return;
            setConversations((list) =>
                list.map((c) => (c.id === payload.conversationId ? { ...c, unreadCount: 0 } : c))
            );
        }

        function onConnect() {
            refresh();
        }

        socket.on('chat:message', onMessage);
        socket.on('chat:conversation-updated', onConversationUpdated);
        socket.on('chat:conversation-read', onConversationRead);
        socket.on('connect', onConnect);

        return () => {
            socket.off('chat:message', onMessage);
            socket.off('chat:conversation-updated', onConversationUpdated);
            socket.off('chat:conversation-read', onConversationRead);
            socket.off('connect', onConnect);
        };
    }, [socket, refresh]);

    const unreadConversations = conversations.length > 0
        ? conversations.filter((c) => (c.unreadCount || 0) > 0).length
        : summary.unreadConversations;
    const unreadMessages = conversations.length > 0
        ? conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
        : summary.unreadMessages;

    return (
        <MessagingContext.Provider
            value={{
                conversations,
                unreadConversations,
                unreadMessages,
                activeConversationId,
                setActiveConversationId,
                markRead,
                refresh,
                socket,
                connected,
            }}
        >
            {children}
        </MessagingContext.Provider>
    );
}

export function useMessaging() {
    const ctx = useContext(MessagingContext);
    if (!ctx) throw new Error('useMessaging must be used within MessagingProvider');
    return ctx;
}
