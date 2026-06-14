const prisma = require('../../lib/prisma');

async function getMessages(req, res) {
  const employeeId = req.employee.id;
  const before = req.query.before ? parseInt(req.query.before) : undefined;

  let convo = await prisma.conversation.findUnique({ where: { employeeId } });
  if (!convo) {
    convo = await prisma.conversation.create({ data: { employeeId } });
  }

  const where = { conversationId: convo.id };
  if (before) where.id = { lt: before };

  const messages = await prisma.message.findMany({
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
  let convo = await prisma.conversation.findUnique({ where: { employeeId } });
  if (!convo) {
    convo = await prisma.conversation.create({ data: { employeeId } });
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: convo.id,
      senderId: req.user.id,
      senderRole: req.user.role,
      content: content.trim(),
    },
    include: { sender: { select: { name: true } } },
  });

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { lastMessageAt: new Date() },
  });

  res.status(201).json(msg);
}

async function markRead(req, res) {
  const employeeId = req.employee.id;
  const convo = await prisma.conversation.findUnique({ where: { employeeId } });
  if (!convo) return res.json({ updated: 0 });

  const result = await prisma.message.updateMany({
    where: { conversationId: convo.id, senderRole: { not: 'pca' }, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}

module.exports = { getMessages, sendMessage, markRead };
