const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'nvbestpca-secret';
let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.EMPLOYEE_APP_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = payload;
      if (payload.role === 'pca') {
        const employee = await prisma.employee.findUnique({ where: { userId: payload.id } });
        if (employee) socket.employeeId = employee.id;
      }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.employeeId) {
      socket.join(`employee:${socket.employeeId}`);
    }
    if (socket.user.role === 'admin' || socket.user.role === 'user') {
      socket.join('office');
    }

    socket.on('chat:message', async (data) => {
      try {
        if (!socket.employeeId) {
          const employee = await prisma.employee.findUnique({ where: { userId: socket.user.id } });
          if (!employee) {
            socket.emit('chat:error', { error: 'No employee profile linked to this account' });
            return;
          }
          socket.employeeId = employee.id;
          socket.join(`employee:${employee.id}`);
        }
        const convo = await prisma.conversation.upsert({
          where: { employeeId: socket.employeeId },
          create: { employeeId: socket.employeeId },
          update: { lastMessageAt: new Date() },
        });
        const msg = await prisma.message.create({
          data: {
            conversationId: convo.id,
            senderId: socket.user.id,
            senderRole: socket.user.role,
            content: data.content,
          },
        });
        const payload = {
          id: msg.id,
          content: msg.content,
          senderId: msg.senderId,
          senderRole: msg.senderRole,
          createdAt: msg.createdAt,
          conversationId: convo.id,
        };
        socket.emit('chat:message', payload);
        io.to('office').emit('chat:message', {
          ...payload,
          employeeId: socket.employeeId,
          employeeName: socket.user.name,
        });
        io.to('office').emit('chat:conversation-updated', {
          conversationId: convo.id,
          employeeId: socket.employeeId,
          employeeName: socket.user.name,
          lastMessage: {
            id: msg.id,
            content: msg.content,
            senderRole: msg.senderRole,
            createdAt: msg.createdAt,
          },
          lastMessageAt: convo.lastMessageAt,
        });
      } catch (err) {
        socket.emit('chat:error', { error: 'Failed to send message' });
      }
    });

    socket.on('chat:typing', () => {
      if (socket.employeeId) {
        io.to('office').emit('chat:typing', { employeeId: socket.employeeId });
      }
    });

    socket.on('chat:read', async (data) => {
      if (!socket.employeeId || !data.upTo) return;
      await prisma.message.updateMany({
        where: { id: { lte: data.upTo }, conversation: { employeeId: socket.employeeId }, readAt: null },
        data: { readAt: new Date() },
      });
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  return io;
}

function emitToEmployee(employeeId, event, data) {
  if (io) io.to(`employee:${employeeId}`).emit(event, data);
}

function emitToOffice(event, data) {
  if (io) io.to('office').emit(event, data);
}

module.exports = { initSocket, getIO, emitToEmployee, emitToOffice };
