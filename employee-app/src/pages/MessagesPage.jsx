import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

export default function MessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.getMessages().then(data => {
      setMessages(data.messages || data || []);
      api.markRead().catch(() => {});
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(input.trim());
      setMessages(prev => [...prev, msg]);
      setInput('');
    } catch (err) { /* silent */ }
    setSending(false);
  };

  return (
    <div className="chat-page">
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
