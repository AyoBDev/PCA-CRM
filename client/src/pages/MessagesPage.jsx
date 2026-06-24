import { useState, useEffect, useRef } from 'react';
import GlobalToolbar from '../components/common/GlobalToolbar';
import Icons from '../components/common/Icons';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { getConversations, getConversationMessages, sendConversationMessage } from '../api';
import { formatDate } from '../utils/dates';

function formatRelativeTime(date) {
    const now = new Date();
    const msgDate = new Date(date);
    const diffMs = now - msgDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return formatDate(date);
}

export default function MessagesPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [mobileView, setMobileView] = useState('list');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadConversations();
    }, []);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    async function loadConversations() {
        try {
            setLoading(true);
            const data = await getConversations();
            setConversations(data);
        } catch (err) {
            showToast(err.message || 'Failed to load conversations', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function loadMessages(convId) {
        try {
            setLoadingMessages(true);
            const data = await getConversationMessages(convId);
            setMessages(data);
        } catch (err) {
            showToast(err.message || 'Failed to load messages', 'error');
        } finally {
            setLoadingMessages(false);
        }
    }

    function handleSelectConversation(conv) {
        setSelectedConv(conv);
        setMobileView('chat');
        loadMessages(conv.id);
    }

    function handleBackToList() {
        setMobileView('list');
        setSelectedConv(null);
        setMessages([]);
    }

    async function handleSendMessage() {
        if (!replyText.trim() || !selectedConv) return;
        const content = replyText.trim();
        setReplyText('');

        try {
            setSending(true);
            await sendConversationMessage(selectedConv.id, content);
            await loadMessages(selectedConv.id);
            await loadConversations();
        } catch (err) {
            showToast(err.message || 'Failed to send message', 'error');
            setReplyText(content);
        } finally {
            setSending(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    return (
        <>
            <GlobalToolbar
                title="Messages"
                subtitle="Chat with employees"
                icon={Icons.mail}
                hideUndo
            />
            <div className="page-container">
                <div className="msg-page">
                    <div className={`msg-list ${mobileView === 'chat' ? 'msg-list--hidden' : ''}`}>
                        {loading ? (
                            <div className="msg-empty">Loading conversations…</div>
                        ) : conversations.length === 0 ? (
                            <div className="msg-empty">No messages yet</div>
                        ) : (
                            conversations.map((conv) => (
                                <button
                                    key={conv.id}
                                    className={`msg-list-item ${selectedConv?.id === conv.id ? 'msg-list-item--active' : ''}`}
                                    onClick={() => handleSelectConversation(conv)}
                                >
                                    <div className="msg-list-item__avatar">
                                        {conv.employeeName?.charAt(0).toUpperCase() || 'E'}
                                    </div>
                                    <div className="msg-list-item__content">
                                        <div className="msg-list-item__header">
                                            <div className="msg-list-item__name">{conv.employeeName}</div>
                                            <div className="msg-list-item__time">
                                                {formatRelativeTime(conv.lastMessageAt)}
                                            </div>
                                        </div>
                                        <div className="msg-list-item__preview">{conv.lastMessage?.content || ''}</div>
                                    </div>
                                    {conv.unreadCount > 0 && (
                                        <div className="msg-list-item__badge">{conv.unreadCount}</div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>

                    <div className={`msg-chat ${mobileView === 'list' ? 'msg-chat--hidden' : ''}`}>
                        {!selectedConv ? (
                            <div className="msg-empty">Select a conversation to view messages</div>
                        ) : (
                            <>
                                <div className="msg-chat__header">
                                    <button className="msg-back-btn" onClick={handleBackToList}>
                                        {Icons.arrowLeft}
                                    </button>
                                    <div className="msg-chat__header-text">
                                        <div className="msg-chat__name">{selectedConv.employeeName}</div>
                                    </div>
                                </div>
                                <div className="msg-chat__body">
                                    {loadingMessages ? (
                                        <div className="msg-empty">Loading messages…</div>
                                    ) : messages.length === 0 ? (
                                        <div className="msg-empty">No messages in this conversation</div>
                                    ) : (
                                        messages.map((msg) => {
                                            const isMine = msg.senderRole === 'admin' || msg.senderRole === 'user';
                                            return (
                                                <div key={msg.id} className={`msg-bubble-wrap ${isMine ? 'msg-bubble-wrap--mine' : ''}`}>
                                                    <div className={`msg-bubble ${isMine ? 'msg-bubble--mine' : 'msg-bubble--other'}`}>
                                                        {!isMine && (
                                                            <div className="msg-bubble__sender">{msg.sender?.name || 'Employee'}</div>
                                                        )}
                                                        <div className="msg-bubble__content">{msg.content}</div>
                                                        <div className="msg-bubble__time">
                                                            {formatRelativeTime(msg.createdAt)}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="msg-input-bar">
                                    <textarea
                                        className="msg-input-bar__input"
                                        placeholder="Type a message…"
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        rows={1}
                                    />
                                    <button
                                        className="btn btn--primary msg-input-bar__btn"
                                        onClick={handleSendMessage}
                                        disabled={!replyText.trim() || sending}
                                    >
                                        Send
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
