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
  const utcDay = now.getUTCDay();
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - utcDay));
  return sunday;
}

// Parse a YYYY-MM-DD string to a Date snapped to Sunday (UTC midnight).
function normalizeWeekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt;
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
      weekStart = normalizeWeekStart(req.query.weekStart);
    } else {
      weekStart = getCurrentWeekStart();
    }
    const timesheet = await prisma.timesheet.findFirst({
      where: { clientId: link.clientId, pcaName: link.pcaName, weekStart, archivedAt: null },
      include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
    });

    const enabledServices = JSON.parse(link.client.enabledServices || '["PAS","Homemaker"]');

    // Fetch active authorizations for this client
    const authorizations = await prisma.authorization.findMany({
      where: {
        clientId: link.clientId,
      },
      select: {
        serviceCode: true,
        serviceName: true,
        authorizedUnits: true,
        authorizationStartDate: true,
        authorizationEndDate: true,
      },
    });

    // Build a map of service → authorized weekly units
    // Service code mapping: PCS/PAS → PAS, S5130 → Homemaker, S5150 → Respite
    const authLimits = {};
    for (const auth of authorizations) {
      const code = auth.serviceCode;
      let service = null;
      if (code === 'PCS' || code === 'PAS') service = 'PAS';
      else if (code === 'S5130') service = 'Homemaker';
      else if (code === 'S5150') service = 'Respite';
      if (service) {
        // authorizedUnits are weekly 15-min units
        if (!authLimits[service] || auth.authorizedUnits > authLimits[service].units) {
          authLimits[service] = {
            units: auth.authorizedUnits,
            hours: Math.round((auth.authorizedUnits / 4) * 100) / 100,
            serviceCode: code,
            serviceName: auth.serviceName || service,
            startDate: auth.authorizationStartDate,
            endDate: auth.authorizationEndDate,
          };
        }
      }
    }

    // If no timesheet exists yet, return placeholder data without persisting.
    // A real timesheet will only be created when the user saves (PUT).
    if (!timesheet) {
      const placeholderEntries = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setUTCDate(date.getUTCDate() + d);
        placeholderEntries.push({
          id: null,
          dayOfWeek: d,
          dateOfService: date.toISOString().slice(0, 10),
          adlActivities: '{}', adlTimeIn: null, adlTimeOut: null, adlHours: 0, adlPcaInitials: '', adlClientInitials: '', adlTimeBlocks: '[]',
          iadlActivities: '{}', iadlTimeIn: null, iadlTimeOut: null, iadlHours: 0, iadlPcaInitials: '', iadlClientInitials: '', iadlTimeBlocks: '[]',
          respiteActivities: '{}', respiteTimeIn: null, respiteTimeOut: null, respiteHours: 0, respitePcaInitials: '', respiteClientInitials: '', respiteTimeBlocks: '[]',
        });
      }

      return res.json({
        client: {
          id: link.client.id,
          clientName: link.client.clientName,
          enabledServices,
        },
        pcaName: link.pcaName,
        authLimits,
        timesheet: {
          id: null,
          clientId: link.clientId,
          pcaName: link.pcaName,
          weekStart: weekStart.toISOString(),
          status: 'draft',
          totalPasHours: 0,
          totalHmHours: 0,
          totalRespiteHours: 0,
          totalHours: 0,
          pcaFullName: '',
          pcaSignature: '',
          recipientName: '',
          recipientSignature: '',
          entries: placeholderEntries,
        },
      });
    }

    res.json({
      client: {
        id: link.client.id,
        clientName: link.client.clientName,
        enabledServices,
      },
      pcaName: link.pcaName,
      authLimits,
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
      weekStart = normalizeWeekStart(req.body.weekStart);
    } else {
      weekStart = getCurrentWeekStart();
    }
    let timesheet = await prisma.timesheet.findFirst({
      where: { clientId: link.clientId, pcaName: link.pcaName, weekStart, archivedAt: null },
      include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
    });

    // Auto-create timesheet if it doesn't exist yet (same as GET handler)
    if (!timesheet) {
      // Remove any archived timesheet occupying this unique slot
      const archivedTs = await prisma.timesheet.findFirst({
        where: { clientId: link.clientId, pcaName: link.pcaName, weekStart, archivedAt: { not: null } },
      });
      if (archivedTs) {
        await prisma.timesheetEntry.deleteMany({ where: { timesheetId: archivedTs.id } });
        await prisma.timesheet.delete({ where: { id: archivedTs.id } });
      }

      const entryData = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setUTCDate(date.getUTCDate() + d);
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

      // Check authorization limits
      const authz = await prisma.authorization.findMany({
        where: { clientId: link.clientId },
        select: { serviceCode: true, authorizedUnits: true },
      });
      const authMap = {};
      for (const a of authz) {
        let svc = null;
        if (a.serviceCode === 'PCS' || a.serviceCode === 'PAS') svc = 'PAS';
        else if (a.serviceCode === 'S5130') svc = 'Homemaker';
        else if (a.serviceCode === 'S5150') svc = 'Respite';
        if (svc && (!authMap[svc] || a.authorizedUnits > authMap[svc])) {
          authMap[svc] = a.authorizedUnits;
        }
      }

      // Compute total hours per service from submitted entries
      let checkPas = 0, checkHm = 0, checkRespite = 0;
      for (const entry of (entries || [])) {
        const f = filterByEnabledServices(entry, enabledServices);
        checkPas += computeTotalHoursWithBlocks(f.adlTimeIn, f.adlTimeOut, f.adlTimeBlocks);
        checkHm += computeTotalHoursWithBlocks(f.iadlTimeIn, f.iadlTimeOut, f.iadlTimeBlocks);
        checkRespite += computeTotalHoursWithBlocks(f.respiteTimeIn, f.respiteTimeOut, f.respiteTimeBlocks);
      }

      if (authMap.PAS && Math.round(checkPas * 4) > authMap.PAS) {
        errors.push(`PAS hours (${checkPas.toFixed(2)} hrs / ${Math.round(checkPas * 4)} units) exceed authorized limit of ${(authMap.PAS / 4).toFixed(2)} hrs / ${authMap.PAS} units`);
      }
      if (authMap.Homemaker && Math.round(checkHm * 4) > authMap.Homemaker) {
        errors.push(`Homemaker hours (${checkHm.toFixed(2)} hrs / ${Math.round(checkHm * 4)} units) exceed authorized limit of ${(authMap.Homemaker / 4).toFixed(2)} hrs / ${authMap.Homemaker} units`);
      }
      if (authMap.Respite && Math.round(checkRespite * 4) > authMap.Respite) {
        errors.push(`Respite hours (${checkRespite.toFixed(2)} hrs / ${Math.round(checkRespite * 4)} units) exceed authorized limit of ${(authMap.Respite / 4).toFixed(2)} hrs / ${authMap.Respite} units`);
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join('; ') });
      }
    }

    // Save entries — map by dayOfWeek to handle newly-created timesheets
    // where the client sends entries with id: null (placeholder from GET)
    const dbEntryByDay = {};
    for (const e of timesheet.entries) {
      dbEntryByDay[e.dayOfWeek] = e;
    }

    let totalPasHours = 0, totalHmHours = 0, totalRespiteHours = 0;

    for (const entry of (entries || [])) {
      const dbEntry = entry.id ? { id: entry.id } : dbEntryByDay[entry.dayOfWeek];
      if (!dbEntry) continue;
      const filtered = filterByEnabledServices(entry, enabledServices);

      const adlHours = computeTotalHoursWithBlocks(filtered.adlTimeIn, filtered.adlTimeOut, filtered.adlTimeBlocks);
      const iadlHours = computeTotalHoursWithBlocks(filtered.iadlTimeIn, filtered.iadlTimeOut, filtered.iadlTimeBlocks);
      const respiteHours = computeTotalHoursWithBlocks(filtered.respiteTimeIn, filtered.respiteTimeOut, filtered.respiteTimeBlocks);

      totalPasHours += adlHours;
      totalHmHours += iadlHours;
      totalRespiteHours += respiteHours;

      await prisma.timesheetEntry.update({
        where: { id: dbEntry.id },
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

    // Fetch auth limits for response
    const authzForResp = await prisma.authorization.findMany({
      where: { clientId: link.clientId },
      select: { serviceCode: true, serviceName: true, authorizedUnits: true, authorizationStartDate: true, authorizationEndDate: true },
    });
    const respAuthLimits = {};
    for (const auth of authzForResp) {
      let service = null;
      if (auth.serviceCode === 'PCS' || auth.serviceCode === 'PAS') service = 'PAS';
      else if (auth.serviceCode === 'S5130') service = 'Homemaker';
      else if (auth.serviceCode === 'S5150') service = 'Respite';
      if (service && (!respAuthLimits[service] || auth.authorizedUnits > respAuthLimits[service].units)) {
        respAuthLimits[service] = {
          units: auth.authorizedUnits,
          hours: Math.round((auth.authorizedUnits / 4) * 100) / 100,
          serviceCode: auth.serviceCode,
          serviceName: auth.serviceName || service,
          startDate: auth.authorizationStartDate,
          endDate: auth.authorizationEndDate,
        };
      }
    }

    res.json({
      client: {
        id: link.client.id,
        clientName: link.client.clientName,
        enabledServices,
      },
      pcaName: link.pcaName,
      authLimits: respAuthLimits,
      timesheet: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPcaForm, updatePcaForm };
