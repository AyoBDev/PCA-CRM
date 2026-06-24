const prisma = require('../../lib/prisma');
const { emitToEmployee, emitToOffice } = require('../../socket');

async function listConversations(req, res) {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    include: {
      employee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const enriched = [];
  for (const c of conversations) {
    const unreadCount = await prisma.message.count({
      where: { conversationId: c.id, senderRole: 'pca', readAt: null },
    });
    enriched.push({
      id: c.id,
      employeeId: c.employee.id,
      employeeName: c.employee.name,
      lastMessage: c.messages[0] || null,
      lastMessageAt: c.lastMessageAt,
      unreadCount,
    });
  }

  res.json(enriched);
}

async function getConversationMessages(req, res) {
  const id = parseInt(req.params.id);
  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { name: true } } },
  });
  res.json(messages);
}

async function adminSendMessage(req, res) {
  const conversationId = parseInt(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const msg = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      senderRole: req.user.role,
      content: content.trim(),
    },
    include: { sender: { select: { name: true } } },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  const employee = await prisma.employee.findUnique({ where: { id: convo.employeeId }, select: { name: true } });

  emitToEmployee(convo.employeeId, 'chat:message', {
    id: msg.id, content: msg.content, senderId: msg.senderId, senderRole: msg.senderRole, createdAt: msg.createdAt, conversationId: conversationId,
  });

  emitToOffice('chat:conversation-updated', {
    conversationId,
    employeeId: convo.employeeId,
    employeeName: employee?.name || '',
    lastMessage: {
      id: msg.id,
      content: msg.content,
      senderRole: msg.senderRole,
      createdAt: msg.createdAt,
    },
    lastMessageAt: new Date(),
  });

  res.status(201).json(msg);
}

async function markConversationRead(req, res) {
  const conversationId = parseInt(req.params.id);
  if (!conversationId) return res.status(400).json({ error: 'Invalid conversation id' });

  await prisma.message.updateMany({
    where: { conversationId, senderRole: 'pca', readAt: null },
    data: { readAt: new Date() },
  });

  emitToOffice('chat:conversation-read', { conversationId });

  res.json({ conversationId, unreadCount: 0 });
}

async function getUnreadSummary(req, res) {
  const grouped = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { senderRole: 'pca', readAt: null },
    _count: { _all: true },
  });
  const unreadConversations = grouped.length;
  const unreadMessages = grouped.reduce((sum, g) => sum + g._count._all, 0);
  res.json({ unreadConversations, unreadMessages });
}

module.exports = { listConversations, getConversationMessages, adminSendMessage, markConversationRead, getUnreadSummary };
