import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useMessaging } from '../hooks/useMessaging';
import { api } from '../api';

export default function MessagesPage() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const { clear } = useMessaging();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.getMessages().then(data => {
      setMessages(data.messages || data || []);
      api.markRead().then(() => clear()).catch(() => {});
    });
  }, [clear]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">No messages yet</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`chat-bubble ${msg.senderId === user?.id ? 'chat-bubble--mine' : 'chat-bubble--other'}`}>
              <p style={{ margin: 0 }}>{msg.content}</p>
              <span className="chat-time">
                {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
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
