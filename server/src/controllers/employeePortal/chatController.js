const audit = require('../../services/auditService');
const { emitToOffice } = require('../../socket');

async function getMessages(req, res) {
  const employeeId = req.employee.id;
  const before = req.query.before ? parseInt(req.query.before) : undefined;

  let convo = await req.db.conversation.findUnique({ where: { employeeId } });
  if (!convo) {
    convo = await req.db.conversation.create({ data: { employeeId } });
  }

  const where = { conversationId: convo.id };
  if (before) where.id = { lt: before };

  const messages = await req.db.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { sender: { select: { name: true } } },
  });

  res.json({ conversationId: convo.id, messages: messages.reverse() });
}

async function sendMessage(req, res) {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });

  const employeeId = req.employee.id;
  let convo = await req.db.conversation.findUnique({ where: { employeeId } });
  if (!convo) {
    convo = await req.db.conversation.create({ data: { employeeId } });
  }

  const msg = await req.db.message.create({
    data: {
      conversationId: convo.id,
      senderId: req.user.id,
      senderRole: req.user.role,
      content: content.trim(),
    },
    include: { sender: { select: { name: true } } },
  });

  const updatedConvo = await req.db.conversation.update({
    where: { id: convo.id },
    data: { lastMessageAt: new Date() },
  });

  emitToOffice(req.user.agencyId, 'chat:message', {
    id: msg.id,
    content: msg.content,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    createdAt: msg.createdAt,
    conversationId: convo.id,
    employeeId: req.employee.id,
    employeeName: req.employee.name,
    employeeUserId: req.user.id,
  });

  emitToOffice(req.user.agencyId, 'chat:conversation-updated', {
    conversationId: convo.id,
    employeeId: req.employee.id,
    employeeName: req.employee.name,
    employeeUserId: req.user.id,
    lastMessage: {
      id: msg.id,
      content: msg.content,
      senderId: msg.senderId,
      senderRole: msg.senderRole,
      createdAt: msg.createdAt,
    },
    lastMessageAt: updatedConvo.lastMessageAt,
  });

  audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Message', entityId: msg.id, entityName: req.employee.name, metadata: { conversationId: convo.id } });
  res.status(201).json(msg);
}

async function markRead(req, res) {
  const employeeId = req.employee.id;
  const employeeUserId = req.user.id;
  const convo = await req.db.conversation.findUnique({ where: { employeeId } });
  if (!convo) return res.json({ updated: 0 });

  const result = await req.db.message.updateMany({
    where: { conversationId: convo.id, senderId: { not: employeeUserId }, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}

async function getUnreadCount(req, res) {
  const employeeId = req.employee.id;
  const employeeUserId = req.user.id;
  const convo = await req.db.conversation.findUnique({ where: { employeeId } });
  if (!convo) return res.json({ unreadCount: 0 });

  const unreadCount = await req.db.message.count({
    where: { conversationId: convo.id, senderId: { not: employeeUserId }, readAt: null },
  });
  res.json({ unreadCount });
}

module.exports = { getMessages, sendMessage, markRead, getUnreadCount };
