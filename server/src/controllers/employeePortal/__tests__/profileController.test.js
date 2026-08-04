const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { employeeAuthHeader } = require('../../../../__tests__/helpers/auth');

afterAll(async () => { await prisma.$disconnect(); });

describe('employee self-service profile', () => {
  it('persists the expanded personal + emergency-contact fields', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const res = await request(app)
      .patch('/api/employee/profile')
      .set(header)
      .send({
        address: '10 Main St',
        dob: '1985-06-15',
        gender: 'F',
        preferredLanguage: 'Spanish',
        emergencyContactName: 'Pat Doe',
        emergencyContactRelationship: 'Sibling',
        emergencyContactPhone: '555-0100',
        emergencyContactEmail: 'pat@example.com',
      });
    expect(res.status).toBe(200);
    // Response reflects the saved values...
    expect(res.body.gender).toBe('F');
    expect(res.body.emergencyContactName).toBe('Pat Doe');
    // ...and they are actually persisted (dob decrypted transparently by the prisma extension).
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(ee.dob).toBe('1985-06-15');
    expect(ee.preferredLanguage).toBe('Spanish');
    expect(ee.emergencyContactPhone).toBe('555-0100');
  });

  it('never lets the profile route write ssn', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    await request(app)
      .patch('/api/employee/profile')
      .set(header)
      .send({ ssn: '999-99-9999', gender: 'M' });
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(ee.ssn).not.toBe('999-99-9999');
    expect(ee.gender).toBe('M');
  });
});
