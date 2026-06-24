const prisma = require('../src/lib/prisma');
const { markConversationRead } = require('../src/controllers/employeePortal/adminChatController');

jest.mock('../src/socket', () => ({
  emitToEmployee: jest.fn(),
  emitToOffice: jest.fn(),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('markConversationRead', () => {
  let employee;
  let conversation;
  let adminUser;
  let pcaUser;

  beforeAll(async () => {
    adminUser = await prisma.user.create({ data: { email: `admin-mr-${Date.now()}@test.local`, passwordHash: 'x', name: 'AdminMR', role: 'admin' } });
    pcaUser = await prisma.user.create({ data: { email: `pca-mr-${Date.now()}@test.local`, passwordHash: 'x', name: 'PcaMR', role: 'pca' } });
    employee = await prisma.employee.create({ data: { name: 'EmpMR', userId: pcaUser.id } });
    conversation = await prisma.conversation.create({ data: { employeeId: employee.id } });
    await prisma.message.createMany({
      data: [
        { conversationId: conversation.id, senderId: pcaUser.id, senderRole: 'pca', content: 'hi 1' },
        { conversationId: conversation.id, senderId: pcaUser.id, senderRole: 'pca', content: 'hi 2' },
        { conversationId: conversation.id, senderId: adminUser.id, senderRole: 'admin', content: 'reply' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
    await prisma.conversation.delete({ where: { id: conversation.id } });
    await prisma.employee.delete({ where: { id: employee.id } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, pcaUser.id] } } });
    await prisma.$disconnect();
  });

  test('marks all unread PCA messages read and returns unreadCount 0', async () => {
    const req = { params: { id: String(conversation.id) }, user: adminUser };
    const res = mockRes();

    await markConversationRead(req, res);

    expect(res.json).toHaveBeenCalledWith({ conversationId: conversation.id, unreadCount: 0 });

    const remaining = await prisma.message.count({
      where: { conversationId: conversation.id, senderRole: 'pca', readAt: null },
    });
    expect(remaining).toBe(0);

    const adminMsg = await prisma.message.findFirst({
      where: { conversationId: conversation.id, senderRole: 'admin' },
    });
    expect(adminMsg.readAt).toBeNull();
  });

  test('idempotent on second call', async () => {
    const req = { params: { id: String(conversation.id) }, user: adminUser };
    const res = mockRes();
    await markConversationRead(req, res);
    expect(res.json).toHaveBeenCalledWith({ conversationId: conversation.id, unreadCount: 0 });
  });

  test('emits chat:conversation-read to office', async () => {
    const { emitToOffice } = require('../src/socket');
    expect(emitToOffice).toHaveBeenCalledWith('chat:conversation-read', { conversationId: conversation.id });
  });
});
