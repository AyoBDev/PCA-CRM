const prisma = require('../src/lib/prisma');
const { getUnreadSummary } = require('../src/controllers/employeePortal/adminChatController');

function mockRes() {
  const res = {};
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('getUnreadSummary', () => {
  let pcaUserA, pcaUserB, pcaUserC;
  let empA, empB, empC;
  let convA, convB, convC;

  beforeAll(async () => {
    pcaUserA = await prisma.user.create({ data: { email: `pus-a-${Date.now()}@test.local`, passwordHash: 'x', name: 'PA', role: 'pca', agencyId: 1 } });
    pcaUserB = await prisma.user.create({ data: { email: `pus-b-${Date.now()}@test.local`, passwordHash: 'x', name: 'PB', role: 'pca', agencyId: 1 } });
    pcaUserC = await prisma.user.create({ data: { email: `pus-c-${Date.now()}@test.local`, passwordHash: 'x', name: 'PC', role: 'pca', agencyId: 1 } });
    empA = await prisma.employee.create({ data: { name: 'EA', userId: pcaUserA.id, agencyId: 1 } });
    empB = await prisma.employee.create({ data: { name: 'EB', userId: pcaUserB.id, agencyId: 1 } });
    empC = await prisma.employee.create({ data: { name: 'EC', userId: pcaUserC.id, agencyId: 1 } });
    convA = await prisma.conversation.create({ data: { employeeId: empA.id, agencyId: 1 } });
    convB = await prisma.conversation.create({ data: { employeeId: empB.id, agencyId: 1 } });
    convC = await prisma.conversation.create({ data: { employeeId: empC.id, agencyId: 1 } });

    // A: 2 unread PCA messages
    await prisma.message.createMany({ data: [
      { conversationId: convA.id, senderId: pcaUserA.id, senderRole: 'pca', content: 'a1', agencyId: 1 },
      { conversationId: convA.id, senderId: pcaUserA.id, senderRole: 'pca', content: 'a2', agencyId: 1 },
    ]});
    // B: 1 unread PCA message
    await prisma.message.create({ data: { conversationId: convB.id, senderId: pcaUserB.id, senderRole: 'pca', content: 'b1', agencyId: 1 }});
    // C: all read
    await prisma.message.create({ data: { conversationId: convC.id, senderId: pcaUserC.id, senderRole: 'pca', content: 'c1', readAt: new Date(), agencyId: 1 }});
  });

  afterAll(async () => {
    const ids = [convA.id, convB.id, convC.id];
    await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: [empA.id, empB.id, empC.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [pcaUserA.id, pcaUserB.id, pcaUserC.id] } } });
    await prisma.$disconnect();
  });

  test('returns conversation count and message count', async () => {
    const res = mockRes();
    await getUnreadSummary({ db: prisma }, res);
    const arg = res.json.mock.calls[0][0];
    expect(arg.unreadConversations).toBe(2);
    expect(arg.unreadMessages).toBe(3);
  });
});
