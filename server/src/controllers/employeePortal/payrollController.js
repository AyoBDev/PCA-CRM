const prisma = require('../../lib/prisma');

async function getPayrollSummary(req, res) {
  const employeeId = req.employee.id;
  const lastReceipt = await prisma.payReceipt.findFirst({
    where: { employeeId },
    orderBy: { payDate: 'desc' },
    select: { netPay: true, payDate: true, totalHours: true, periodStart: true, periodEnd: true },
  });

  const ytd = await prisma.payReceipt.findFirst({
    where: { employeeId },
    orderBy: { payDate: 'desc' },
    select: { ytdGross: true, ytdNet: true },
  });

  res.json({
    lastPaycheck: lastReceipt ? { amount: lastReceipt.netPay, date: lastReceipt.payDate } : null,
    ytdEarnings: ytd ? ytd.ytdGross : 0,
    currentPeriodHours: lastReceipt ? lastReceipt.totalHours : 0,
  });
}

async function getPaystubs(req, res) {
  const receipts = await prisma.payReceipt.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { payDate: 'desc' },
    select: {
      id: true, periodStart: true, periodEnd: true, payDate: true,
      grossEarnings: true, netPay: true, totalHours: true, status: true,
    },
  });
  res.json(receipts);
}

async function downloadPaystub(req, res) {
  const id = parseInt(req.params.id);
  const receipt = await prisma.payReceipt.findFirst({
    where: { id, employeeId: req.employee.id },
  });
  if (!receipt) return res.status(404).json({ error: 'Paystub not found' });
  res.json({ receipt });
}

module.exports = { getPayrollSummary, getPaystubs, downloadPaystub };
