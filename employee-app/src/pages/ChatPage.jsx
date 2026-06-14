import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useSocket } from '../hooks/useSocket';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const bottomRef = useRef();

  useEffect(() => { api.getMessages().then(d => { setMessages(d.messages || []); }).finally(() => setLoading(false)); api.markRead(); }, []);

  useEffect(() => {
    if (!socket) return;
    function onMessage(msg) { setMessages(prev => [...prev, msg]); }
    socket.on('chat:message', onMessage);
    return () => socket.off('chat:message', onMessage);
  }, [socket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');
    if (socket) { socket.emit('chat:message', { content }); } else { const msg = await api.sendMessage(content); setMessages(prev => [...prev, msg]); }
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="chat-page">
      <h1 className="page-title">Communication</h1>
      <div className="chat-messages">
        {messages.length === 0 && <p className="text-muted chat-empty">No messages yet. Send a message to the office.</p>}
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble ${m.senderRole === 'pca' ? 'chat-bubble--mine' : 'chat-bubble--office'}`}>
            <p className="chat-text">{m.content}</p>
            <span className="chat-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-bar" onSubmit={handleSend}>
        <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." />
        <button type="submit" className="btn btn-primary">Send</button>
      </form>
    </div>
  );
}
