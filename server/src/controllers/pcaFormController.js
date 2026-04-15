const prisma = require('../lib/prisma');

function roundTo15(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  let rh = h, rm;
  if (m <= 7) rm = 0;
  else if (m <= 22) rm = 15;
  else if (m <= 37) rm = 30;
  else if (m <= 52) rm = 45;
  else { rm = 0; rh = h + 1; }
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function computeHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const rIn = roundTo15(timeIn);
  const rOut = roundTo15(timeOut);
  const [hIn, mIn] = rIn.split(':').map(Number);
  const [hOut, mOut] = rOut.split(':').map(Number);
  const diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

function computeTotalHoursWithBlocks(timeIn, timeOut, timeBlocksJson) {
  let total = computeHours(timeIn, timeOut);
  try {
    const blocks = JSON.parse(timeBlocksJson || '[]');
    for (const b of blocks) {
      total += computeHours(b.in, b.out);
    }
  } catch {}
  return Math.round(total * 100) / 100;
}

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function hasActivity(activitiesJson) {
  try {
    const obj = JSON.parse(activitiesJson || '{}');
    return Object.values(obj).some(v => v === true);
  } catch {
    return false;
  }
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function timesOverlap(aIn, aOut, bIn, bOut) {
  const a0 = timeToMinutes(aIn), a1 = timeToMinutes(aOut);
  const b0 = timeToMinutes(bIn), b1 = timeToMinutes(bOut);
  if (a0 === null || a1 === null || b0 === null || b1 === null) return false;
  return a0 < b1 && b0 < a1;
}

function filterByEnabledServices(entry, enabledServices) {
  const filtered = { ...entry };
  if (!enabledServices.includes('PAS')) {
    filtered.adlActivities = '{}';
    filtered.adlTimeIn = null;
    filtered.adlTimeOut = null;
    filtered.adlPcaInitials = '';
    filtered.adlClientInitials = '';
  }
  if (!enabledServices.includes('Homemaker')) {
    filtered.iadlActivities = '{}';
    filtered.iadlTimeIn = null;
    filtered.iadlTimeOut = null;
    filtered.iadlPcaInitials = '';
    filtered.iadlClientInitials = '';
  }
  if (!enabledServices.includes('Respite')) {
    filtered.respiteActivities = '{}';
    filtered.respiteTimeIn = null;
    filtered.respiteTimeOut = null;
    filtered.respitePcaInitials = '';
    filtered.respiteClientInitials = '';
  }
  return filtered;
}

// GET /api/pca-form/:token?weekStart=YYYY-MM-DD
async function getPcaForm(req, res, next) {
  try {
    const { token } = req.params;
    const link = await prisma.permanentLink.findUnique({
      where: { token },
      include: { client: true },
    });

    if (!link) return res.status(404).json({ error: 'Invalid link' });
    if (!link.active) return res.status(403).json({ error: 'This link has been deactivated' });

    let weekStart;
    if (req.query.weekStart) {
      // Parse the provided Sunday date
      const d = new Date(req.query.weekStart + 'T00:00:00');
      // Snap to Sunday if needed
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      weekStart = d;
    } else {
      weekStart = getCurrentWeekStart();
    }
    let timesheet = await prisma.timesheet.findFirst({
      where: { clientId: link.clientId, pcaName: link.pcaName, weekStart },
      include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
    });

    if (!timesheet) {
      const entryData = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);
        entryData.push({
          dayOfWeek: d,
          dateOfService: date.toISOString().slice(0, 10),
        });
      }
      timesheet = await prisma.timesheet.create({
        data: {
          clientId: link.clientId,
          pcaName: link.pcaName,
          weekStart,
          entries: { create: entryData },
        },
        include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
      });
    }

    const enabledServices = JSON.parse(link.client.enabledServices || '["PAS","Homemaker"]');

    res.json({
      client: {
        id: link.client.id,
        clientName: link.client.clientName,
        enabledServices,
      },
      pcaName: link.pcaName,
      timesheet,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/pca-form/:token
async function updatePcaForm(req, res, next) {
  try {
    const { token } = req.params;
    const link = await prisma.permanentLink.findUnique({
      where: { token },
      include: { client: true },
    });

    if (!link) return res.status(404).json({ error: 'Invalid link' });
    if (!link.active) return res.status(403).json({ error: 'This link has been deactivated' });

    let weekStart;
    if (req.body.weekStart) {
      const d = new Date(req.body.weekStart + 'T00:00:00');
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      weekStart = d;
    } else {
      weekStart = getCurrentWeekStart();
    }
    const timesheet = await prisma.timesheet.findFirst({
      where: { clientId: link.clientId, pcaName: link.pcaName, weekStart },
      include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
    });

    if (!timesheet) return res.status(404).json({ error: 'No timesheet found for current week' });
    if (timesheet.status === 'submitted') return res.status(400).json({ error: 'Timesheet already submitted' });

    const { action, entries, pcaFullName, pcaSignature, recipientName, recipientSignature } = req.body;
    const enabledServices = JSON.parse(link.client.enabledServices || '["PAS","Homemaker"]');

    // Validate on submit
    if (action === 'submit') {
      if (!pcaFullName || !pcaSignature || !recipientName || !recipientSignature) {
        return res.status(400).json({ error: 'All signatures and names are required' });
      }

      const errors = [];
      for (const entry of (entries || [])) {
        const filtered = filterByEnabledServices(entry, enabledServices);
        const dayLabel = `Day ${entry.dayOfWeek !== undefined ? entry.dayOfWeek : '?'}`;

        if (hasActivity(filtered.adlActivities)) {
          if (!filtered.adlTimeIn || !filtered.adlTimeOut) {
            errors.push(`${dayLabel}: ADL has activities but missing time in/out`);
          }
          if (!filtered.adlPcaInitials || !filtered.adlClientInitials) {
            errors.push(`${dayLabel}: ADL missing initials`);
          }
        }
        if (hasActivity(filtered.iadlActivities)) {
          if (!filtered.iadlTimeIn || !filtered.iadlTimeOut) {
            errors.push(`${dayLabel}: IADL (Homemaker) has activities but missing time in/out`);
          }
          if (!filtered.iadlPcaInitials || !filtered.iadlClientInitials) {
            errors.push(`${dayLabel}: IADL (Homemaker) missing initials`);
          }
        }
        if (hasActivity(filtered.respiteActivities)) {
          if (!filtered.respiteTimeIn || !filtered.respiteTimeOut) {
            errors.push(`${dayLabel}: Respite has activities but missing time in/out`);
          }
          if (!filtered.respitePcaInitials || !filtered.respiteClientInitials) {
            errors.push(`${dayLabel}: Respite missing initials`);
          }
        }

        if (filtered.iadlTimeIn && filtered.iadlTimeOut && filtered.respiteTimeIn && filtered.respiteTimeOut) {
          if (timesOverlap(filtered.iadlTimeIn, filtered.iadlTimeOut, filtered.respiteTimeIn, filtered.respiteTimeOut)) {
            errors.push(`${dayLabel}: Homemaker and Respite times overlap`);
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join('; ') });
      }
    }

    // Save entries
    let totalPasHours = 0, totalHmHours = 0, totalRespiteHours = 0;

    for (const entry of (entries || [])) {
      if (!entry.id) continue;
      const filtered = filterByEnabledServices(entry, enabledServices);

      const adlHours = computeTotalHoursWithBlocks(filtered.adlTimeIn, filtered.adlTimeOut, filtered.adlTimeBlocks);
      const iadlHours = computeTotalHoursWithBlocks(filtered.iadlTimeIn, filtered.iadlTimeOut, filtered.iadlTimeBlocks);
      const respiteHours = computeTotalHoursWithBlocks(filtered.respiteTimeIn, filtered.respiteTimeOut, filtered.respiteTimeBlocks);

      totalPasHours += adlHours;
      totalHmHours += iadlHours;
      totalRespiteHours += respiteHours;

      await prisma.timesheetEntry.update({
        where: { id: entry.id },
        data: {
          adlActivities: filtered.adlActivities || '{}',
          adlTimeIn: filtered.adlTimeIn || null,
          adlTimeOut: filtered.adlTimeOut || null,
          adlHours,
          adlPcaInitials: filtered.adlPcaInitials || '',
          adlClientInitials: filtered.adlClientInitials || '',
          adlTimeBlocks: filtered.adlTimeBlocks || '[]',
          iadlActivities: filtered.iadlActivities || '{}',
          iadlTimeIn: filtered.iadlTimeIn || null,
          iadlTimeOut: filtered.iadlTimeOut || null,
          iadlHours,
          iadlPcaInitials: filtered.iadlPcaInitials || '',
          iadlClientInitials: filtered.iadlClientInitials || '',
          iadlTimeBlocks: filtered.iadlTimeBlocks || '[]',
          respiteActivities: filtered.respiteActivities || '{}',
          respiteTimeIn: filtered.respiteTimeIn || null,
          respiteTimeOut: filtered.respiteTimeOut || null,
          respiteHours,
          respitePcaInitials: filtered.respitePcaInitials || '',
          respiteClientInitials: filtered.respiteClientInitials || '',
          respiteTimeBlocks: filtered.respiteTimeBlocks || '[]',
        },
      });
    }

    const totalHours = totalPasHours + totalHmHours + totalRespiteHours;

    const updateData = {
      totalPasHours,
      totalHmHours,
      totalRespiteHours,
      totalHours,
    };

    if (action === 'submit') {
      updateData.status = 'submitted';
      updateData.submittedAt = new Date();
      updateData.pcaFullName = pcaFullName;
      updateData.pcaSignature = pcaSignature;
      updateData.recipientName = recipientName;
      updateData.recipientSignature = recipientSignature;
      updateData.completionDate = new Date().toISOString().slice(0, 10);
    }

    await prisma.timesheet.update({
      where: { id: timesheet.id },
      data: updateData,
    });

    const updated = await prisma.timesheet.findUnique({
      where: { id: timesheet.id },
      include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
    });

    res.json({ timesheet: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPcaForm, updatePcaForm };
