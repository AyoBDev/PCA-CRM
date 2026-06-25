import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useMessaging } from '../hooks/useMessaging';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../api';

export default function MessagesPage() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const { clear } = useMessaging();
  const { refresh } = useNotifications();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);
  const [unreadIndex, setUnreadIndex] = useState(-1);

  useEffect(() => {
    api.getMessages().then(data => {
      const msgs = data.messages || data || [];
      setMessages(msgs);
      // Capture unread divider index on mount
      const idx = msgs.findIndex(m => !m.readAt && m.senderRole === 'admin');
      setUnreadIndex(idx);
      // Mark read and refresh notifications
      api.markRead().then(() => {
        clear();
        refresh();
      }).catch(() => {});
    });
  }, [clear, refresh]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!socket || !user) return;
    function onMessage(payload) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, payload];
      });
      if (payload.senderId !== user.id) {
        api.markRead().catch(() => {});
      }
    }
    socket.on('chat:message', onMessage);
    return () => socket.off('chat:message', onMessage);
  }, [socket, user]);

  const formatDateLabel = (prevDate, currDate) => {
    const prev = prevDate ? new Date(prevDate) : null;
    const curr = new Date(currDate);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDay(curr, now)) return 'Today';
    if (isSameDay(curr, yesterday)) return 'Yesterday';

    return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(curr);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    try {
      if (socket && connected) {
        socket.emit('chat:message', { content });
      } else {
        const msg = await api.sendMessage(content);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    } catch {
      setInput(content);
    }
    setSending(false);
  };

  return (
    <div className="chat-page">
      {!connected && <div className="chat-connecting">Connecting…</div>}
      <div className="chat-messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">No messages yet</div>
        ) : (
          messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const isAdmin = msg.senderRole === 'admin';
            const prevIsAdmin = prev && prev.senderRole === 'admin';
            const showSenderLabel = isAdmin && !prevIsAdmin;

            // Date separator logic
            const showDateSeparator = prev && (() => {
              const prevTime = new Date(prev.createdAt).getTime();
              const currTime = new Date(msg.createdAt).getTime();
              return currTime - prevTime >= 24 * 60 * 60 * 1000;
            })();

            // Unread divider logic
            const showUnreadDivider = idx === unreadIndex;

            return (
              <div key={msg.id}>
                {showDateSeparator && (
                  <div className="chat-date-separator">
                    {formatDateLabel(prev.createdAt, msg.createdAt)}
                  </div>
                )}
                {showUnreadDivider && (
                  <div className="chat-unread-divider">— New messages —</div>
                )}
                {showSenderLabel && (
                  <div className="chat-sender-label">Office</div>
                )}
                <div className={`chat-bubble ${msg.senderId === user?.id ? 'chat-bubble--mine' : 'chat-bubble--other'}`}>
                  <p style={{ margin: 0 }}>{msg.content}</p>
                  <span className="chat-time">
                    {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form className="chat-input-bar" onSubmit={handleSend}>
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit" className="chat-send" disabled={!input.trim() || sending}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  );
}
