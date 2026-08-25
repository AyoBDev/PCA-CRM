const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/secrets');
const { corsOrigin } = require('./lib/corsOrigin');
const { tenantClient } = require('./lib/tenantPrisma');
const { runWithTenant } = require('./lib/tenantContext');
let io;

function employeeRoom(agencyId, employeeId) {
  return `agency:${agencyId}:employee:${employeeId}`;
}

function officeRoom(agencyId) {
  return `agency:${agencyId}:office`;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (!Number.isInteger(payload.agencyId)) return next(new Error('Authentication required'));
      socket.user = payload;
      socket.agencyId = payload.agencyId;
      const employee = await tenantClient(payload.agencyId).employee.findUnique({ where: { userId: payload.id } });
      if (employee) socket.employeeId = employee.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.employeeId) {
      socket.join(employeeRoom(socket.agencyId, socket.employeeId));
    } else {
      socket.join(officeRoom(socket.agencyId));
    }

    socket.on('chat:message', (data) =>
      runWithTenant({ agencyId: socket.agencyId, db: tenantClient(socket.agencyId) }, async () => {
        const db = tenantClient(socket.agencyId);
        try {
          if (!socket.employeeId) {
            const employee = await db.employee.findUnique({ where: { userId: socket.user.id } });
            if (!employee) {
              socket.emit('chat:error', { error: 'No employee profile linked to this account' });
              return;
            }
            socket.employeeId = employee.id;
            socket.join(employeeRoom(socket.agencyId, employee.id));
          }
          const convo = await db.conversation.upsert({
            where: { employeeId: socket.employeeId },
            create: { employeeId: socket.employeeId },
            update: { lastMessageAt: new Date() },
          });
          const msg = await db.message.create({
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
          io.to(officeRoom(socket.agencyId)).emit('chat:message', {
            ...payload,
            employeeId: socket.employeeId,
            employeeName: socket.user.name,
            employeeUserId: socket.user.id,
          });
          io.to(officeRoom(socket.agencyId)).emit('chat:conversation-updated', {
            conversationId: convo.id,
            employeeId: socket.employeeId,
            employeeName: socket.user.name,
            employeeUserId: socket.user.id,
            lastMessage: {
              id: msg.id,
              content: msg.content,
              senderId: msg.senderId,
              senderRole: msg.senderRole,
              createdAt: msg.createdAt,
            },
            lastMessageAt: convo.lastMessageAt,
          });
        } catch (err) {
          socket.emit('chat:error', { error: 'Failed to send message' });
        }
      })
    );

    socket.on('chat:typing', () =>
      runWithTenant({ agencyId: socket.agencyId, db: tenantClient(socket.agencyId) }, async () => {
        if (socket.employeeId) {
          io.to(officeRoom(socket.agencyId)).emit('chat:typing', { employeeId: socket.employeeId });
        }
      })
    );

    socket.on('chat:read', (data) =>
      runWithTenant({ agencyId: socket.agencyId, db: tenantClient(socket.agencyId) }, async () => {
        if (!socket.employeeId || !data.upTo) return;
        const db = tenantClient(socket.agencyId);
        await db.message.updateMany({
          where: {
            id: { lte: data.upTo },
            conversation: { employeeId: socket.employeeId },
            senderId: { not: socket.user.id },
            readAt: null,
          },
          data: { readAt: new Date() },
        });
      })
    );

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  return io;
}

function emitToEmployee(agencyId, employeeId, event, data) {
  if (io) io.to(employeeRoom(agencyId, employeeId)).emit(event, data);
}

function emitToOffice(agencyId, event, data) {
  if (io) io.to(officeRoom(agencyId)).emit(event, data);
}

module.exports = { initSocket, getIO, emitToEmployee, emitToOffice, employeeRoom, officeRoom };
