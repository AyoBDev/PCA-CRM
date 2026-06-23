const prisma = require('../../lib/prisma');

async function getAvailability(req, res) {
  const emp = await prisma.employee.findUnique({
    where: { id: req.employee.id },
    select: { availability: true },
  });
  res.json({ availability: emp.availability });
}

async function submitAvailabilityRequest(req, res) {
  const { requestedChanges } = req.body;
  if (!requestedChanges) return res.status(400).json({ error: 'requestedChanges is required' });

  const request = await prisma.availabilityRequest.create({
    data: { employeeId: req.employee.id, requestedChanges },
  });
  res.status(201).json(request);
}

async function getTimeOffRequests(req, res) {
  const requests = await prisma.timeOffRequest.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
}

async function submitTimeOff(req, res) {
  const { dateFrom, dateTo, reason } = req.body;
  if (!dateFrom || !dateTo || !reason) {
    return res.status(400).json({ error: 'dateFrom, dateTo, and reason are required' });
  }
  const validReasons = ['vacation', 'sick_leave', 'personal', 'medical'];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason' });
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      employeeId: req.employee.id,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      reason,
    },
  });
  res.status(201).json(request);
}

module.exports = { getAvailability, submitAvailabilityRequest, getTimeOffRequests, submitTimeOff };
