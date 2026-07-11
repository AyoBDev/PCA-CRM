const prisma = require('../../lib/prisma');
const { createService, updateService } = require('../serviceController');

function mockRes() {
  return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} };
}
const user = { id: 1, name: 'T', role: 'admin' };

describe('service CRUD new fields', () => {
  let id;
  afterAll(async () => { if (id) await prisma.service.delete({ where: { id } }).catch(()=>{}); await prisma.$disconnect(); });

  test('createService persists new fields', async () => {
    const res = mockRes();
    await createService({ body: { category: 'GUIDE', code: 'ZZTEST', name: 'Z', label: 'Z Label', accountNumber: '71119', color: '#123456', timesheetSection: 'Respite', sortOrder: 7, enforceAuthLimit: false }, user }, res, e=>{throw e;});
    expect(res.statusCode).toBe(201);
    id = res.body.id;
    expect(res.body.color).toBe('#123456');
    expect(res.body.timesheetSection).toBe('Respite');
    expect(res.body.sortOrder).toBe(7);
    expect(res.body.enforceAuthLimit).toBe(false);
  });

  test('createService defaults enforceAuthLimit to true when omitted', async () => {
    const res = mockRes();
    await createService({ body: { category: 'GUIDE', code: 'ZZTEST2', name: 'Z2' }, user }, res, e=>{throw e;});
    expect(res.body.enforceAuthLimit).toBe(true);
    await prisma.service.delete({ where: { id: res.body.id } }).catch(()=>{});
  });
});
