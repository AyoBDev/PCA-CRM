const prisma = require('../../lib/prisma');
const { emitToEmployee, emitToOffice } = require('../../socket');

async function listConversations(req, res) {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    include: {
      employee: { select: { id: true, name: true, userId: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const enriched = [];
  for (const c of conversations) {
    const employeeUserId = c.employee.userId;
    const unreadCount = employeeUserId
      ? await prisma.message.count({
          where: { conversationId: c.id, senderId: employeeUserId, readAt: null },
        })
      : 0;
    enriched.push({
      id: c.id,
      employeeId: c.employee.id,
      employeeName: c.employee.name,
      employeeUserId,
      lastMessage: c.messages[0] || null,
      lastMessageAt: c.lastMessageAt,
      unreadCount,
    });
  }

  res.json(enriched);
}

async function getConversationMessages(req, res) {
  const id = parseInt(req.params.id);
  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: { employee: { select: { id: true, name: true, userId: true } } },
  });
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { name: true } } },
  });
  res.json({
    conversationId: convo.id,
    employeeId: convo.employee.id,
    employeeName: convo.employee.name,
    employeeUserId: convo.employee.userId,
    messages,
  });
}

async function adminSendMessage(req, res) {
  const conversationId = parseInt(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { employee: { select: { id: true, name: true, userId: true } } },
  });
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

  const updatedConvo = await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  const payload = {
    id: msg.id,
    content: msg.content,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    createdAt: msg.createdAt,
    conversationId,
    employeeId: convo.employee.id,
    employeeName: convo.employee.name,
    employeeUserId: convo.employee.userId,
  };

  emitToEmployee(convo.employeeId, 'chat:message', payload);
  emitToOffice('chat:message', payload);

  emitToOffice('chat:conversation-updated', {
    conversationId,
    employeeId: convo.employee.id,
    employeeName: convo.employee.name,
    employeeUserId: convo.employee.userId,
    lastMessage: {
      id: msg.id,
      content: msg.content,
      senderId: msg.senderId,
      senderRole: msg.senderRole,
      createdAt: msg.createdAt,
    },
    lastMessageAt: updatedConvo.lastMessageAt,
  });

  res.status(201).json(msg);
}

async function markConversationRead(req, res) {
  const conversationId = parseInt(req.params.id);
  if (!conversationId) return res.status(400).json({ error: 'Invalid conversation id' });

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { employee: { select: { userId: true } } },
  });
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const employeeUserId = convo.employee.userId;
  if (employeeUserId) {
    await prisma.message.updateMany({
      where: { conversationId, senderId: employeeUserId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  emitToOffice('chat:conversation-read', { conversationId });

  res.json({ conversationId, unreadCount: 0 });
}

async function getUnreadSummary(req, res) {
  const employees = await prisma.employee.findMany({
    where: { userId: { not: null } },
    select: { userId: true, conversation: { select: { id: true } } },
  });

  let unreadConversations = 0;
  let unreadMessages = 0;
  for (const emp of employees) {
    if (!emp.conversation || !emp.userId) continue;
    const count = await prisma.message.count({
      where: { conversationId: emp.conversation.id, senderId: emp.userId, readAt: null },
    });
    if (count > 0) {
      unreadConversations += 1;
      unreadMessages += count;
    }
  }

  res.json({ unreadConversations, unreadMessages });
}

module.exports = { listConversations, getConversationMessages, adminSendMessage, markConversationRead, getUnreadSummary };
