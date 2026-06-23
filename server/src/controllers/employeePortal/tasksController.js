const prisma = require('../../lib/prisma');

async function getTasks(req, res) {
  const tasks = await prisma.employeeTask.findMany({
    where: { employeeId: req.employee.id },
    orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(tasks);
}

async function completeTask(req, res) {
  const id = parseInt(req.params.id);
  const task = await prisma.employeeTask.findFirst({
    where: { id, employeeId: req.employee.id },
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.source === 'compliance') {
    return res.status(400).json({ error: 'Compliance tasks auto-resolve when certification is approved' });
  }

  const updated = await prisma.employeeTask.update({
    where: { id },
    data: { completedAt: new Date() },
  });
  res.json(updated);
}

module.exports = { getTasks, completeTask };
