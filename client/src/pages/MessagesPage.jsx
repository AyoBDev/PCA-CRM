import { useState, useEffect, useRef } from 'react';
import GlobalToolbar from '../components/common/GlobalToolbar';
import Icons from '../components/common/Icons';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useMessaging } from '../contexts/MessagingContext';
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
    const {
        conversations,
        markRead,
        setActiveConversationId,
        socket,
        connected,
    } = useMessaging();
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [mobileView, setMobileView] = useState('list');
    const [newMessageMarkerId, setNewMessageMarkerId] = useState(null);
    const messagesEndRef = useRef(null);
    const messagesBodyRef = useRef(null);
    const userScrolledUpRef = useRef(false);

    useEffect(() => {
        if (!messagesBodyRef.current) return;
        const el = messagesBodyRef.current;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom < 120) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        return () => setActiveConversationId(null);
    }, [setActiveConversationId]);

    useEffect(() => {
        if (!socket || !selectedConv) return;

        function onMessage(payload) {
            if (payload.conversationId !== selectedConv.id) return;
            const isFromEmployee = selectedConv.employeeUserId != null
                ? payload.senderId === selectedConv.employeeUserId
                : payload.senderRole === 'pca';
            const normalized = {
                ...payload,
                sender: payload.sender
                    || (isFromEmployee && payload.employeeName ? { name: payload.employeeName } : undefined),
            };
            setMessages((prev) => {
                if (prev.some((m) => m.id === normalized.id)) return prev;
                if (isFromEmployee) {
                    setNewMessageMarkerId((cur) => cur ?? normalized.id);
                }
                return [...prev, normalized];
            });
            if (isFromEmployee) {
                markRead(selectedConv.id);
            }
        }

        socket.on('chat:message', onMessage);
        return () => socket.off('chat:message', onMessage);
    }, [socket, selectedConv, markRead]);

    async function loadMessages(convId) {
        try {
            setLoadingMessages(true);
            const data = await getConversationMessages(convId);
            setMessages(Array.isArray(data) ? data : (data.messages || []));
        } catch (err) {
            showToast(err.message || 'Failed to load messages', 'error');
        } finally {
            setLoadingMessages(false);
        }
    }

    function handleBodyScroll(e) {
        const el = e.currentTarget;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        userScrolledUpRef.current = distanceFromBottom > 120;
    }

    async function handleSelectConversation(conv) {
        setSelectedConv(conv);
        setActiveConversationId(conv.id);
        setMobileView('chat');
        setNewMessageMarkerId(null);
        userScrolledUpRef.current = false;
        await loadMessages(conv.id);
        if ((conv.unreadCount || 0) > 0) {
            markRead(conv.id);
        }
    }

    function handleBackToList() {
        setMobileView('list');
        setSelectedConv(null);
        setActiveConversationId(null);
        setMessages([]);
        setNewMessageMarkerId(null);
    }

    async function handleSendMessage() {
        if (!replyText.trim() || !selectedConv) return;
        const content = replyText.trim();
        setReplyText('');

        try {
            setSending(true);
            const msg = await sendConversationMessage(selectedConv.id, content);
            setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
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
                        {conversations.length === 0 ? (
                            <div className="msg-empty">No messages yet</div>
                        ) : (
                            conversations.map((conv) => (
                                <button
                                    key={conv.id}
                                    className={`msg-list-item ${selectedConv?.id === conv.id ? 'msg-list-item--active' : ''} ${(conv.unreadCount || 0) > 0 ? 'msg-list-item--unread' : ''}`}
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
                                        {!connected && (
                                            <span className="msg-connecting-pill">Connecting…</span>
                                        )}
                                    </div>
                                </div>
                                <div className="msg-chat__body" ref={messagesBodyRef} onScroll={handleBodyScroll}>
                                    {loadingMessages ? (
                                        <div className="msg-empty">Loading messages…</div>
                                    ) : messages.length === 0 ? (
                                        <div className="msg-empty">No messages in this conversation</div>
                                    ) : (
                                        messages.map((msg) => {
                                            const isFromEmployee = selectedConv.employeeUserId != null
                                                ? msg.senderId === selectedConv.employeeUserId
                                                : msg.senderRole === 'pca';
                                            const isMine = !isFromEmployee;
                                            const showDivider = newMessageMarkerId === msg.id;
                                            return (
                                                <div key={msg.id}>
                                                    {showDivider && (
                                                        <div className="msg-new-divider">
                                                            <span>New messages</span>
                                                        </div>
                                                    )}
                                                    <div className={`msg-bubble-wrap ${isMine ? 'msg-bubble-wrap--mine' : ''}`}>
                                                        <div className={`msg-bubble ${isMine ? 'msg-bubble--mine' : 'msg-bubble--other'}`}>
                                                            <div className="msg-bubble__sender">
                                                                {isMine
                                                                    ? (msg.sender?.name || user?.name || 'You')
                                                                    : (msg.sender?.name || selectedConv.employeeName || 'Employee')}
                                                            </div>
                                                            <div className="msg-bubble__content">{msg.content}</div>
                                                            <div className="msg-bubble__time">
                                                                {formatRelativeTime(msg.createdAt)}
                                                            </div>
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
