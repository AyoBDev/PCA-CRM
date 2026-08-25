const prisma = require('../lib/prisma');
const { roundTo15, computeHours, computeTotalHoursWithBlocks, deriveTimesheetService } = require('../lib/timesheetUtils');
const { enterTokenTenant } = require('../lib/tokenTenant');
const serviceRegistry = require('../services/serviceRegistry');
const audit = require('../services/auditService');
const { filterAuthsByWeek, classifyWeekAuthBySection } = require('../services/authorizationService');
const { computeAndStoreIntegrityHash } = require('../services/timesheetIntegrityService');

// Whether a client's override is currently in effect (active and not expired).
function overrideInEffect(client, now = new Date()) {
  if (!client || !client.overrideActive) return false;
  if (!client.overrideExpiresOn) return true;
  return new Date(client.overrideExpiresOn) >= now;
}

// Format a Date as "Mon D, YYYY" for caregiver-facing messages.
function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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
  if (!enabledServices.includes('Companion')) {
    filtered.companionActivities = '{}';
    filtered.companionTimeIn = null;
    filtered.companionTimeOut = null;
    filtered.companionPcaInitials = '';
    filtered.companionClientInitials = '';
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

    await enterTokenTenant(req, res, link.agencyId, async () => {
      const db = req.db;
      if (!link.active) return res.status(403).json({ error: 'This link has been deactivated' });
      if (link.client.archivedAt) return res.status(403).json({ error: 'This client is no longer active. The timesheet link has been disabled.' });

      // Warm the service registry cache so deriveTimesheetService (sync) reflects DB values
      await serviceRegistry.getServiceMap();

      let weekStart;
      if (req.query.weekStart) {
        weekStart = normalizeWeekStart(req.query.weekStart);
      } else {
        weekStart = getCurrentWeekStart();
      }
      const timesheet = await db.timesheet.findFirst({
        where: { clientId: link.clientId, pcaName: link.pcaName, weekStart, archivedAt: null },
        include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
      });

      // Effective enabled services = the client's stored admin toggle. We do NOT
      // intersect with authorized services here: the caregiver must always be able
      // to SEE the sections and enter hours. Authorization is enforced at SUBMIT
      // time (see updatePcaForm) with a clear, specific message — hiding sections
      // at load time leaves the caregiver with a blank, unusable form.
      const enabledServices = JSON.parse(link.client.enabledServices || '["PAS","Homemaker"]');

      // Fetch authorizations for this client
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

      const allAuthorizations = await db.authorization.findMany({
        where: {
          clientId: link.clientId,
        },
        select: {
          serviceCode: true,
          serviceName: true,
          serviceCategory: true,
          authorizedUnits: true,
          authorizationStartDate: true,
          authorizationEndDate: true,
          manualStatus: true,
          archivedAt: true,
        },
      });

      // Filter to active authorizations overlapping this week via the SSOT helper.
      const authorizations = filterAuthsByWeek(allAuthorizations, weekStart, weekEnd);

      // Build a map of service → authorized weekly units
      const authLimits = {};
      for (const auth of authorizations) {
        const service = deriveTimesheetService(auth);
        if (service) {
          if (!authLimits[service]) {
            authLimits[service] = {
              units: 0,
              hours: 0,
              serviceCode: auth.serviceCode,
              serviceName: auth.serviceName || service,
              startDate: auth.authorizationStartDate,
              endDate: auth.authorizationEndDate,
            };
          }
          authLimits[service].units += auth.authorizedUnits || 0;
          authLimits[service].hours = Math.round((authLimits[service].units / 4) * 100) / 100;
        }
      }

      // Compute the authorization gate status per section for this week, so the
      // caregiver sees WHY submission may be blocked (spec §4). Only meaningful
      // when the client requires authorization and no override is in effect.
      const client = link.client;
      const requiresAuth = client.authorizationRequired !== false && !overrideInEffect(client);
      const { expiredOn, hadAny } = classifyWeekAuthBySection(
        allAuthorizations, weekStart, weekEnd, deriveTimesheetService,
      );
      const authorizedSet = new Set(Object.keys(authLimits));
      // Per-section state for sections the client has enabled.
      const authStatusBySection = {};
      for (const svc of enabledServices) {
        if (authorizedSet.has(svc)) {
          authStatusBySection[svc] = { state: 'ok' };
        } else if (expiredOn[svc]) {
          authStatusBySection[svc] = { state: 'expired', expiredOn: expiredOn[svc] };
        } else {
          authStatusBySection[svc] = { state: 'none' };
        }
      }
      // Overall banner state: 'ok' if every enabled section is authorized; otherwise
      // the worst state (expired takes precedence over none for messaging clarity).
      let overallState = 'ok';
      for (const svc of enabledServices) {
        const s = authStatusBySection[svc]?.state;
        if (s === 'expired') { overallState = 'expired'; break; }
        if (s === 'none') overallState = 'none';
      }
      const anyExpiredDate = Object.values(expiredOn).sort((a, b) => b - a)[0] || null;
      const authStatus = {
        requiresAuth,
        state: requiresAuth ? overallState : 'ok',
        bySection: authStatusBySection,
        expiredOn: overallState === 'expired' ? anyExpiredDate : null,
      };

      const clientPayload = {
        id: client.id,
        clientName: client.clientName,
        enabledServices,
        authorizationRequired: client.authorizationRequired !== false,
        overrideActive: overrideInEffect(client),
        overrideExpiresOn: overrideInEffect(client) ? client.overrideExpiresOn : null,
        authStatus,
      };

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
            companionActivities: '{}', companionTimeIn: null, companionTimeOut: null, companionHours: 0, companionPcaInitials: '', companionClientInitials: '', companionTimeBlocks: '[]',
          });
        }

        return res.json({
          client: clientPayload,
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
        client: clientPayload,
        pcaName: link.pcaName,
        authLimits,
        timesheet,
      });
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

    await enterTokenTenant(req, res, link.agencyId, async () => {
      const db = req.db;
      if (!link.active) return res.status(403).json({ error: 'This link has been deactivated' });
      if (link.client.archivedAt) return res.status(403).json({ error: 'This client is no longer active. The timesheet link has been disabled.' });

      // Warm the service registry cache so deriveTimesheetService (sync) reflects DB values
      await serviceRegistry.getServiceMap();

      let weekStart;
      if (req.body.weekStart) {
        weekStart = normalizeWeekStart(req.body.weekStart);
      } else {
        weekStart = getCurrentWeekStart();
      }
      let timesheet = await db.timesheet.findFirst({
        where: { clientId: link.clientId, pcaName: link.pcaName, weekStart, archivedAt: null },
        include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
      });

      // Auto-create timesheet if it doesn't exist yet (same as GET handler)
      if (!timesheet) {
        // Remove any archived timesheet occupying this unique slot
        const archivedTs = await db.timesheet.findFirst({
          where: { clientId: link.clientId, pcaName: link.pcaName, weekStart, archivedAt: { not: null } },
        });
        if (archivedTs) {
          await db.timesheetEntry.deleteMany({ where: { timesheetId: archivedTs.id } });
          await db.timesheet.delete({ where: { id: archivedTs.id } });
        }

        const entryData = [];
        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart);
          date.setUTCDate(date.getUTCDate() + d);
          entryData.push({
            agencyId: link.agencyId,
            dayOfWeek: d,
            dateOfService: date.toISOString().slice(0, 10),
          });
        }
        timesheet = await db.timesheet.create({
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
      // Effective enabled services = the client's admin toggle. Sections are NOT
      // intersected with authorization here: the caregiver's entered hours for any
      // admin-enabled section are preserved on save. Authorization is enforced by
      // BLOCKING submit below (with a specific message) when required and missing —
      // so unauthorized hours never reach 'submitted' status, while a draft save
      // keeps them for the office to reconcile.
      const enabledServices = JSON.parse(link.client.enabledServices || '["PAS","Homemaker"]');

      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const allAuths = await db.authorization.findMany({
        where: { clientId: link.clientId },
        select: { serviceCode: true, serviceName: true, serviceCategory: true, authorizedUnits: true, authorizationStartDate: true, authorizationEndDate: true, manualStatus: true, archivedAt: true, authorizationType: true, authorizedHoursPerYear: true, hoursPerVisit: true, usedHoursYtd: true },
      });

      // Validate on submit
      if (action === 'submit') {
        // ── Baseline checks — ALWAYS run, regardless of authorization ──
        if (!pcaFullName || !pcaSignature || !recipientName || !recipientSignature) {
          return res.status(400).json({ error: 'All signatures and names are required' });
        }

        const hasAnyTask = (entries || []).some(entry => {
          const f = filterByEnabledServices(entry, enabledServices);
          return hasActivity(f.adlActivities) || hasActivity(f.iadlActivities) || hasActivity(f.respiteActivities) || hasActivity(f.companionActivities);
        });
        if (!hasAnyTask) {
          return res.status(400).json({ error: 'Please select at least one service task before submitting your timesheet.' });
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
          if (hasActivity(filtered.companionActivities)) {
            if (!filtered.companionTimeIn || !filtered.companionTimeOut) {
              errors.push(`${dayLabel}: Companion has activities but missing time in/out`);
            }
            if (!filtered.companionPcaInitials || !filtered.companionClientInitials) {
              errors.push(`${dayLabel}: Companion missing initials`);
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

        // ── Authorization branch — gated on the client (spec §3) ──
        const client = link.client;
        const skipAuth = client.authorizationRequired === false || overrideInEffect(client);

        if (!skipAuth) {
          // Total submitted hours per section (units = hours × 4).
          let checkPas = 0, checkHm = 0, checkRespite = 0, checkCompanion = 0;
          for (const entry of (entries || [])) {
            const f = filterByEnabledServices(entry, enabledServices);
            checkPas += computeTotalHoursWithBlocks(f.adlTimeIn, f.adlTimeOut, f.adlTimeBlocks);
            checkHm += computeTotalHoursWithBlocks(f.iadlTimeIn, f.iadlTimeOut, f.iadlTimeBlocks);
            checkRespite += computeTotalHoursWithBlocks(f.respiteTimeIn, f.respiteTimeOut, f.respiteTimeBlocks);
            checkCompanion += computeTotalHoursWithBlocks(f.companionTimeIn, f.companionTimeOut, f.companionTimeBlocks);
          }
          const submitted = { PAS: checkPas, Homemaker: checkHm, Respite: checkRespite, Companion: checkCompanion };

          // Split authorizations into GUIDE (Annual Visits) and weekly.
          const guideAuths = allAuths.filter(a => a.authorizationType === 'Annual Visits');
          const weeklyAuths = allAuths.filter(a => a.authorizationType !== 'Annual Visits');

          // Classify weekly sections: active units, expired dates, and whether any
          // authorization ever existed — so we distinguish none/expired/exceeds.
          const { activeUnits, expiredOn } = classifyWeekAuthBySection(
            weeklyAuths, weekStart, weekEnd, deriveTimesheetService,
          );

          const authErrors = [];
          const enforceFlags = {
            PAS: await serviceRegistry.sectionEnforcesLimit('PAS'),
            Homemaker: await serviceRegistry.sectionEnforcesLimit('Homemaker'),
            Respite: await serviceRegistry.sectionEnforcesLimit('Respite'),
            Companion: await serviceRegistry.sectionEnforcesLimit('Companion'),
          };

          for (const section of ['PAS', 'Homemaker', 'Respite', 'Companion']) {
            const hours = submitted[section];
            if (hours <= 0) continue;                 // nothing entered for this section
            if (!enforceFlags[section]) continue;     // section not authorization-gated

            const units = activeUnits[section] || 0;
            if (units > 0) {
              // Active authorization exists — cap on the week's units.
              if (Math.round(hours * 4) > units) {
                const remaining = Math.max(0, (units - Math.round(hours * 4)));
                authErrors.push(`Submitted ${section} hours (${hours.toFixed(2)} hrs / ${Math.round(hours * 4)} units) exceed this client's remaining authorized units (${units} authorized this week).`);
              }
            } else if (expiredOn[section]) {
              authErrors.push(`This client's ${section} authorization expired on ${fmtDate(expiredOn[section])}. Please contact the office.`);
            } else {
              authErrors.push(`No active ${section} authorization found. Please contact the office before submitting.`);
            }
          }

          // GUIDE annual-visits validation (hours-based, cumulative YTD).
          if (guideAuths.length > 0) {
            const guideHours = checkPas + checkHm + checkRespite + checkCompanion; // GUIDE hours span whatever sections were used
            // Find a GUIDE auth whose period covers the week.
            const svcDateMs = Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate());
            const activeGuide = guideAuths.find(a => {
              if ((a.manualStatus || 'active') !== 'active' || a.archivedAt) return false;
              const startOk = !a.authorizationStartDate || new Date(a.authorizationStartDate).getTime() <= Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate());
              const endOk = !a.authorizationEndDate || new Date(a.authorizationEndDate).getTime() >= svcDateMs;
              return startOk && endOk;
            });
            if (guideHours > 0) {
              if (!activeGuide) {
                authErrors.push('Service date is outside the current GUIDE authorization period. Please contact the office.');
              } else {
                const remainingHours = (activeGuide.authorizedHoursPerYear || 0) - (activeGuide.usedHoursYtd || 0);
                if (guideHours > remainingHours) {
                  const perVisit = activeGuide.hoursPerVisit || 4;
                  const remainingVisits = (remainingHours / perVisit).toFixed(1);
                  authErrors.push(`This visit would exceed the client's remaining GUIDE hours (${remainingHours.toFixed(2)} hrs / ${remainingVisits} visits remaining).`);
                }
              }
            }
          }

          if (authErrors.length > 0) {
            return res.status(400).json({ error: authErrors.join('; ') });
          }
        } else {
          // Authorization gate skipped — record why, for the audit trail.
          audit.logAction({
            userId: 0,
            userName: link.client.clientName,
            userRole: 'pca',
            action: 'SUBMIT',
            entityType: 'Timesheet',
            entityId: timesheet.id,
            entityName: `${link.client.clientName} — week of ${weekStart.toISOString().slice(0, 10)}`,
            metadata: {
              authGate: 'skipped',
              reason: link.client.authorizationRequired === false ? 'authorizationRequired=false' : 'override_active',
            },
          });
        }
      }

      // Save entries — map by dayOfWeek to handle newly-created timesheets
      // where the client sends entries with id: null (placeholder from GET)
      const dbEntryByDay = {};
      for (const e of timesheet.entries) {
        dbEntryByDay[e.dayOfWeek] = e;
      }

      let totalPasHours = 0, totalHmHours = 0, totalRespiteHours = 0, totalCompanionHours = 0;

      for (const entry of (entries || [])) {
        const dbEntry = entry.id ? { id: entry.id } : dbEntryByDay[entry.dayOfWeek];
        if (!dbEntry) continue;
        const filtered = filterByEnabledServices(entry, enabledServices);

        const adlHours = computeTotalHoursWithBlocks(filtered.adlTimeIn, filtered.adlTimeOut, filtered.adlTimeBlocks);
        const iadlHours = computeTotalHoursWithBlocks(filtered.iadlTimeIn, filtered.iadlTimeOut, filtered.iadlTimeBlocks);
        const respiteHours = computeTotalHoursWithBlocks(filtered.respiteTimeIn, filtered.respiteTimeOut, filtered.respiteTimeBlocks);
        const companionHours = computeTotalHoursWithBlocks(filtered.companionTimeIn, filtered.companionTimeOut, filtered.companionTimeBlocks);

        totalPasHours += adlHours;
        totalHmHours += iadlHours;
        totalRespiteHours += respiteHours;
        totalCompanionHours += companionHours;

        await db.timesheetEntry.update({
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
            companionActivities: filtered.companionActivities || '{}',
            companionTimeIn: filtered.companionTimeIn || null,
            companionTimeOut: filtered.companionTimeOut || null,
            companionHours,
            companionPcaInitials: filtered.companionPcaInitials || '',
            companionClientInitials: filtered.companionClientInitials || '',
            companionTimeBlocks: filtered.companionTimeBlocks || '[]',
          },
        });
      }

      const totalHours = totalPasHours + totalHmHours + totalRespiteHours + totalCompanionHours;

      const updateData = {
        totalPasHours,
        totalHmHours,
        totalRespiteHours,
        totalCompanionHours,
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

      await db.timesheet.update({
        where: { id: timesheet.id },
        data: updateData,
      });

      if (action === 'submit') {
        // Signatures are freshly captured on every PCA-form submit, so this is
        // always a new attestation — bind the hash to the persisted content.
        await computeAndStoreIntegrityHash(timesheet.id);
        audit.logAction({
          userId: 0, userName: link.pcaName, userRole: 'pca',
          action: 'SUBMIT', entityType: 'Timesheet', entityId: timesheet.id,
          entityName: `${link.pcaName} - ${link.client?.clientName || ''}`,
          metadata: { source: 'pca-form' },
        });
      }

      const updated = await db.timesheet.findUnique({
        where: { id: timesheet.id },
        include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
      });

      // Fetch auth limits for response — filtered by timesheet week via SSOT helper
      const respWeekEnd = new Date(weekStart);
      respWeekEnd.setUTCDate(respWeekEnd.getUTCDate() + 6);
      const authzForResp = filterAuthsByWeek(allAuths, weekStart, respWeekEnd);
      const respAuthLimits = {};
      for (const auth of authzForResp) {
        const service = deriveTimesheetService(auth);
        if (service) {
          if (!respAuthLimits[service]) {
            respAuthLimits[service] = {
              units: 0,
              hours: 0,
              serviceCode: auth.serviceCode,
              serviceName: auth.serviceName || service,
              startDate: auth.authorizationStartDate,
              endDate: auth.authorizationEndDate,
            };
          }
          respAuthLimits[service].units += auth.authorizedUnits || 0;
          respAuthLimits[service].hours = Math.round((respAuthLimits[service].units / 4) * 100) / 100;
        }
      }

      res.json({
        client: {
          id: link.client.id,
          clientName: link.client.clientName,
          enabledServices,
          authorizationRequired: link.client.authorizationRequired !== false,
          overrideActive: overrideInEffect(link.client),
          overrideExpiresOn: overrideInEffect(link.client) ? link.client.overrideExpiresOn : null,
        },
        pcaName: link.pcaName,
        authLimits: respAuthLimits,
        timesheet: updated,
      });
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPcaForm, updatePcaForm };
