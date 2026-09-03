// ─────────────────────────────────────────────────────────────────────────────
// DEMO AGENCY PROVISIONING
//
// Builds (and rebuilds) the sales-demo tenant: a fully-populated agency a
// salesperson can walk a prospect through — clients with live authorizations, a
// staffed week of shifts, submitted and draft timesheets, a working PCA-form
// link, a processed payroll run with review/void edge cases, certifications on
// the reminder curve, and audit history so the Activity/History views aren't
// empty.
//
// ── SAFETY ───────────────────────────────────────────────────────────────────
// This module DELETES DATA, so its blast radius is fixed by construction:
//
//   1. The target is the hard-coded DEMO_SLUG constant. No caller — HTTP or
//      otherwise — can supply the slug, so no request can aim the wipe at a
//      real tenant.
//   2. `demo` is in platformController's RESERVED_SLUGS, so a real agency can
//      never occupy the slug this function deletes.
//   3. destroyDemoAgency re-checks the slug on the row it fetched and throws
//      rather than deleting if it isn't the demo agency (defence in depth
//      against a mis-scoped query).
//   4. Deletion is a single `agency.delete` by id. Every tenant table carries
//      `agency_id` with `onDelete: Cascade`, so child rows go with it — there
//      is deliberately NO manual `deleteMany` sweep that could be mis-scoped
//      and reach another tenant's rows.
//
// Runs on the OWNER prisma connection (like the rest of the platform console)
// because provisioning creates the agency itself, which exists before any
// tenant context does. PHI-marked fields (Client.medicaidId/dob/notes,
// Employee.dob/notes) are written as plaintext here and encrypted transparently
// by the lib/prisma extension — the values are invented, but they still travel
// the same path as real data.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { seedAgencyDefaults } = require('../../prisma/seedAgencyDefaults');
const audit = require('./auditService');
const { runWithTenant } = require('../lib/tenantContext');
const {
    DEMO_SLUG,
    DEMO_AGENCY_NAME,
    DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_NAME,
    DEMO_CLIENTS,
    DEMO_EMPLOYEES,
    DEMO_CERTS,
    DEMO_PAYROLL_ROWS,
    daysFromNow,
    addDays,
    sundayOfThisWeek,
    toDateStr,
} = require('../lib/demoData');

// ── small helpers ────────────────────────────────────────────────────────────

// Shared throwaway password for every demo caregiver login. These accounts hold
// nothing but invented data, and the demoer needs to be able to log in as a
// caregiver on request.
const DEMO_USER_PASSWORD = 'DemoPass1234!';


/** Decimal hours between two "HH:MM" strings; 0 if the range is empty/invalid. */
function hoursBetween(from, to) {
    if (!from || !to) return 0;
    const [h1, m1] = from.split(':').map(Number);
    const [h2, m2] = to.split(':').map(Number);
    const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

/** Authorization units are 15-minute units: 1 hour = 4 units. */
const unitsFor = (hours) => Math.round(hours * 4);

/** "HH:MM" plus n hours, wrapped to a 24h clock. */
function shiftTime(start, hours) {
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + Math.round(hours * 60);
    const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
    return `${hh}:${String(total % 60).padStart(2, '0')}`;
}

// ── destructive path ─────────────────────────────────────────────────────────

/**
 * Delete the demo agency and, by FK cascade, everything belonging to it.
 * Scoped to DEMO_SLUG by construction — see the SAFETY note above.
 * @returns {{deleted: boolean, agencyId: number|null}}
 */
async function destroyDemoAgency() {
    const existing = await prisma.agency.findUnique({ where: { slug: DEMO_SLUG } });
    if (!existing) return { deleted: false, agencyId: null };

    // Defence in depth. The lookup above is already keyed on the constant, so
    // this can only fire if something upstream is badly wrong — in which case
    // refusing to delete is the only safe response.
    if (existing.slug !== DEMO_SLUG) {
        throw new Error(`Refusing to delete agency "${existing.slug}" — only the "${DEMO_SLUG}" agency may be reset.`);
    }

    await prisma.agency.delete({ where: { id: existing.id } });
    return { deleted: true, agencyId: existing.id };
}

// ── population steps ─────────────────────────────────────────────────────────

async function seedClients(agencyId) {
    const clients = [];
    for (const c of DEMO_CLIENTS) {
        const client = await prisma.client.create({
            data: {
                agencyId,
                clientName: c.clientName,
                medicaidId: c.medicaidId,
                insuranceType: c.insuranceType,
                address: c.address,
                phone: c.phone,
                dob: c.dob,
                gender: c.gender || '',
                gateCode: c.gateCode || '',
                notes: c.notes || '',
                doctorName: c.doctorName || '',
                doctorPhone: c.doctorPhone || '',
                emergencyContactName: c.emergencyContactName || '',
                emergencyContactPhone: c.emergencyContactPhone || '',
                emergencyContactRelation: c.emergencyContactRelation || '',
                enabledServices: JSON.stringify(c.enabledServices || ['PAS']),
            },
        });
        for (const a of c.authorizations) {
            await prisma.authorization.create({
                data: {
                    agencyId,
                    clientId: client.id,
                    serviceCode: a.serviceCode,
                    serviceName: a.serviceName,
                    serviceCategory: 'PCS',
                    authorizedUnits: a.authorizedUnits,
                    authorizedHours: a.authorizedUnits / 4,
                    authorizationStartDate: daysFromNow(a.startsInDays),
                    authorizationEndDate: daysFromNow(a.endsInDays),
                    authorizationNumber: `DEMO-AUTH-${client.id}-${a.serviceCode}`,
                    manualStatus: 'active',
                },
            });
        }
        clients.push(client);
    }
    return clients;
}

async function seedEmployees(agencyId) {
    const employees = [];
    const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
    for (const e of DEMO_EMPLOYEES) {
        const user = await prisma.user.create({
            data: {
                agencyId,
                email: e.email,
                passwordHash,
                name: e.name,
                role: 'pca',
                active: true,
                status: 'active',
            },
        });
        const employee = await prisma.employee.create({
            data: {
                agencyId,
                userId: user.id,
                name: e.name,
                email: e.email,
                phone: e.phone,
                dob: e.dob,
                address: e.address,
                gender: e.gender || '',
                preferredLanguage: e.preferredLanguage || '',
                active: true,
                status: 'active',
                onboardingStatus: 'active',
                firstAssignmentDate: daysFromNow(-120),
            },
        });
        employees.push(employee);
    }
    return employees;
}

async function seedCertifications(agencyId, employees) {
    let created = 0;
    for (const c of DEMO_CERTS) {
        const employee = employees[c.employeeIndex];
        if (!employee) continue;
        const expiration = daysFromNow(c.expiresInDays);
        await prisma.employeeCertification.create({
            data: {
                agencyId,
                employeeId: employee.id,
                certType: c.certType,
                expirationDate: expiration,
                status: c.expiresInDays < 0 ? 'expired' : 'active',
                notes: '',
            },
        });
        created += 1;
    }
    return created;
}

/**
 * A full week of shifts for the current week, assigned round-robin from the
 * caregivers whose shiftLoad isn't 'none'. Weekday-only for 'partial' staff so
 * the calendar has visible variety rather than a uniform grid.
 */
async function seedShifts(agencyId, clients, employees) {
    const sunday = sundayOfThisWeek();
    const staffed = employees.filter((_, i) => DEMO_EMPLOYEES[i].shiftLoad !== 'none');
    if (!staffed.length) return 0;

    const loadOf = (emp) => DEMO_EMPLOYEES[employees.indexOf(emp)].shiftLoad;

    // Tracks what each caregiver is already booked for on a given day, so the
    // same person is never scheduled into two homes at once. A demo schedule
    // showing a double-booked caregiver would both look wrong to a prospect and
    // trip the app's own overlap detection.
    const booked = new Map(); // `${employeeId}|${day}` -> [{start, end}]
    const overlaps = (list, start, end) =>
        list.some((b) => start < b.end && end > b.start);

    let created = 0;
    let rr = 0;
    for (let ci = 0; ci < clients.length; ci++) {
        const client = clients[ci];
        const auth = DEMO_CLIENTS[ci].authorizations[0];
        // Eight distinct start times, so demand spreads across the day rather
        // than piling onto a few slots — with only a handful of caregivers,
        // clashing start times would leave later clients unstaffed.
        const startTime = ['08:00', '09:30', '13:00', '07:00', '14:00', '11:00', '16:00', '12:00'][ci % 8];
        const length = [3, 4, 3, 3, 2, 2, 3, 2][ci % 8];
        const endTime = shiftTime(startTime, length);

        for (let day = 0; day < 7; day++) {
            // Give every other client a lighter weekend so the week isn't a
            // uniform grid.
            if (day === 0 && ci % 2 === 0) continue;

            // Take the next caregiver who is free at this time on this day.
            // Starting the scan at the round-robin cursor keeps the load even
            // rather than always falling back to the first free person.
            let employee = null;
            for (let k = 0; k < staffed.length; k++) {
                const cand = staffed[(rr + k) % staffed.length];
                // 'partial' caregivers work weekdays only.
                if (loadOf(cand) === 'partial' && (day === 0 || day === 6)) continue;
                const key = `${cand.id}|${day}`;
                if (overlaps(booked.get(key) || [], startTime, endTime)) continue;
                employee = cand;
                rr = (rr + k + 1) % staffed.length;
                break;
            }
            if (!employee) continue; // nobody free — leave the day unstaffed.

            const key = `${employee.id}|${day}`;
            if (!booked.has(key)) booked.set(key, []);
            booked.get(key).push({ start: startTime, end: endTime });

            await prisma.shift.create({
                data: {
                    agencyId,
                    clientId: client.id,
                    employeeId: employee.id,
                    serviceCode: auth.serviceCode,
                    shiftDate: addDays(sunday, day),
                    startTime,
                    endTime,
                    hours: length,
                    units: unitsFor(length),
                    status: 'scheduled',
                    // Dormant by design — account/Sandata IDs resolve live from
                    // the authorization (see the Single Source of Truth rule).
                    accountNumber: '',
                    sandataClientId: '',
                },
            });
            created += 1;
        }
    }
    return created;
}

/**
 * Timesheets for the PRIOR week (submitted, signed) and the CURRENT week
 * (draft, partially filled) so both states are demonstrable, plus a permanent
 * PCA-form link per client+caregiver pair so the caregiver-facing form opens.
 */
async function seedTimesheets(agencyId, clients, employees) {
    const sunday = sundayOfThisWeek();
    const lastWeek = addDays(sunday, -7);
    const staffed = employees.filter((_, i) => DEMO_EMPLOYEES[i].shiftLoad !== 'none');
    let sheets = 0;
    let links = 0;

    for (let ci = 0; ci < clients.length; ci++) {
        const client = clients[ci];
        const employee = staffed[ci % staffed.length];
        // Eight distinct start times, so demand spreads across the day rather
        // than piling onto a few slots — with only a handful of caregivers,
        // clashing start times would leave later clients unstaffed.
        const startTime = ['08:00', '09:30', '13:00', '07:00', '14:00', '11:00', '16:00', '12:00'][ci % 8];
        const length = [3, 4, 3, 3, 2, 2, 3, 2][ci % 8];
        const endTime = shiftTime(startTime, length);

        await prisma.permanentLink.create({
            data: { agencyId, clientId: client.id, pcaName: employee.name, active: true },
        });
        links += 1;

        // Submitted + signed timesheet for last week.
        const submitted = await prisma.timesheet.create({
            data: {
                agencyId,
                clientId: client.id,
                pcaName: employee.name,
                pcaFullName: employee.name,
                weekStart: lastWeek,
                status: 'submitted',
                submittedAt: daysFromNow(-2),
                recipientName: client.clientName,
                clientPhone: DEMO_CLIENTS[ci].phone,
                totalPasHours: length * 5,
                totalHours: length * 5,
                // A visible mark rather than a forged signature image.
                pcaSignature: 'DEMO SIGNATURE',
                recipientSignature: 'DEMO SIGNATURE',
                completionDate: toDateStr(addDays(lastWeek, 6)),
            },
        });
        for (let day = 1; day <= 5; day++) {
            await prisma.timesheetEntry.create({
                data: {
                    agencyId,
                    timesheetId: submitted.id,
                    dayOfWeek: day,
                    dateOfService: toDateStr(addDays(lastWeek, day)),
                    adlTimeIn: startTime,
                    adlTimeOut: endTime,
                    adlHours: length,
                    adlActivities: JSON.stringify({ Bathing: true, Dressing: true, Grooming: true }),
                    adlPcaInitials: initialsOf(employee.name),
                    adlClientInitials: initialsOf(client.clientName),
                },
            });
        }
        sheets += 1;

        // Draft in-progress timesheet for the current week (first 3 clients
        // only, so the list shows a realistic mix of draft and submitted).
        if (ci < 3) {
            const draft = await prisma.timesheet.create({
                data: {
                    agencyId,
                    clientId: client.id,
                    pcaName: employee.name,
                    pcaFullName: employee.name,
                    weekStart: sunday,
                    status: 'draft',
                    recipientName: client.clientName,
                    clientPhone: DEMO_CLIENTS[ci].phone,
                    totalPasHours: length * 2,
                    totalHours: length * 2,
                },
            });
            for (let day = 1; day <= 2; day++) {
                await prisma.timesheetEntry.create({
                    data: {
                        agencyId,
                        timesheetId: draft.id,
                        dayOfWeek: day,
                        dateOfService: toDateStr(addDays(sunday, day)),
                        adlTimeIn: startTime,
                        adlTimeOut: endTime,
                        adlHours: length,
                        adlActivities: JSON.stringify({ Bathing: true, Dressing: true }),
                    },
                });
            }
            sheets += 1;
        }
    }
    return { sheets, links };
}

function initialsOf(name) {
    return String(name).split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase();
}

/**
 * A processed payroll run over the prior full week. Rows are written in their
 * ALREADY-PROCESSED form (units, void flags and review reasons precomputed from
 * the fixtures) rather than pushed through the import pipeline, because the
 * pipeline's entry point is an uploaded XLSX — the demo only needs the result.
 */
async function seedPayroll(agencyId, clients, employees) {
    const periodStart = addDays(sundayOfThisWeek(), -7);
    const periodEnd = addDays(periodStart, 6);
    const staffed = employees;

    const run = await prisma.payrollRun.create({
        data: {
            agencyId,
            name: `Demo Payroll — week of ${toDateStr(periodStart)}`,
            fileName: 'demo-evv-export.xlsx',
            periodStart,
            periodEnd,
            status: 'completed',
            authorizationSnapshot: '{}',
        },
    });

    let totalPayable = 0;
    let visits = 0;
    for (const row of DEMO_PAYROLL_ROWS) {
        const client = clients[row.clientIndex];
        const employee = row.employeeIndex === null ? null : staffed[row.employeeIndex];
        if (!client) continue;

        const rawHours = hoursBetween(row.callIn, row.callOut);
        // Mirror the pipeline's clip window (04:30–23:30) and 28-unit daily cap
        // so the demo's numbers are self-consistent with the app's rules.
        const clippedIn = row.callIn && row.callIn < '04:30' ? '04:30' : row.callIn;
        const clippedOut = row.callOut && row.callOut > '23:30' ? '23:30' : row.callOut;
        const clippedHours = hoursBetween(clippedIn, clippedOut);
        const cappedUnits = row.needsReview ? 0 : Math.min(unitsFor(clippedHours), 28);
        const wasClipped = clippedIn !== row.callIn || clippedOut !== row.callOut;
        const wasCapped = !row.needsReview && unitsFor(clippedHours) > 28;

        await prisma.payrollVisit.create({
            data: {
                agencyId,
                runId: run.id,
                clientName: client.clientName,
                employeeName: employee ? employee.name : '',
                service: row.serviceCode,
                serviceCode: row.serviceCode,
                visitDate: addDays(periodStart, row.dayOffset),
                callInTime: row.callIn || '',
                callOutTime: row.callOut || '',
                callHoursRaw: rawHours,
                durationMinutes: Math.round(clippedHours * 60),
                unitsRaw: unitsFor(rawHours),
                finalPayableUnits: cappedUnits,
                visitStatus: row.visitStatus || 'Verified',
                needsReview: !!row.needsReview,
                reviewReason: row.reviewReason || '',
                isIncomplete: !row.callIn || !row.callOut,
                earlyCallIn: !!row.callIn && row.callIn < '04:30',
                lateCallOut: !!row.callOut && row.callOut > '23:30',
                notes: wasCapped
                    ? 'Capped at the 28-unit daily maximum.'
                    : wasClipped
                        ? 'Clipped to the 04:30–23:30 payable window.'
                        : '',
            },
        });
        totalPayable += cappedUnits;
        visits += 1;
    }

    await prisma.payrollRun.update({
        where: { id: run.id },
        data: { totalVisits: visits, totalPayable },
    });
    return { runId: run.id, visits, totalPayable };
}

/**
 * Backfill audit history so History and the Activity drawers open onto
 * something. Written directly (not via auditService) because these entries
 * describe a synthetic past, and must be stamped with the demo agency and
 * backdated rather than "now".
 */
async function seedAuditHistory(agencyId, clients, employees) {
    const rows = [];
    const actor = { userId: 0, userName: DEMO_ADMIN_NAME, userRole: 'admin' };
    clients.forEach((c, i) => {
        rows.push({
            ...actor, agencyId, action: 'CREATE', entityType: 'Client',
            entityId: c.id, entityName: c.clientName,
            changes: '[]', metadata: JSON.stringify({ demo: true }),
            createdAt: daysFromNow(-30 + i),
        });
    });
    employees.forEach((e, i) => {
        rows.push({
            ...actor, agencyId, action: 'CREATE', entityType: 'Employee',
            entityId: e.id, entityName: e.name,
            changes: '[]', metadata: JSON.stringify({ demo: true }),
            createdAt: daysFromNow(-28 + i),
        });
    });
    clients.slice(0, 4).forEach((c, i) => {
        rows.push({
            ...actor, agencyId, action: 'UPDATE', entityType: 'Client',
            entityId: c.id, entityName: c.clientName,
            changes: JSON.stringify([{ field: 'phone', oldValue: '(702) 555-0100', newValue: DEMO_CLIENTS[i].phone }]),
            metadata: JSON.stringify({ demo: true }),
            createdAt: daysFromNow(-7 + i),
        });
    });
    await prisma.auditLog.createMany({ data: rows });
    return rows.length;
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Wipe any existing demo agency and rebuild it from scratch.
 * @param {{actor?: {id:number,name:string,role:string}}} opts
 * @returns {Promise<{agency, adminEmail, adminPassword, caregiverPassword, counts, reset:boolean}>}
 */
async function provisionDemoAgency({ actor } = {}) {
    const { deleted } = await destroyDemoAgency();

    const agency = await prisma.agency.create({
        data: { name: DEMO_AGENCY_NAME, slug: DEMO_SLUG, status: 'active' },
    });
    await seedAgencyDefaults(prisma, agency.id);

    // A fresh random admin password each reset, returned to the caller ONCE and
    // never logged — the demoer copies it out of the console response.
    const adminPassword = `Demo-${crypto.randomBytes(6).toString('hex')}`;
    const admin = await prisma.user.create({
        data: {
            agencyId: agency.id,
            email: DEMO_ADMIN_EMAIL,
            passwordHash: await bcrypt.hash(adminPassword, 10),
            name: DEMO_ADMIN_NAME,
            role: 'admin',
            active: true,
            status: 'active',
        },
    });

    const clients = await seedClients(agency.id);
    const employees = await seedEmployees(agency.id);
    const certs = await seedCertifications(agency.id, employees);
    const shifts = await seedShifts(agency.id, clients, employees);
    const { sheets, links } = await seedTimesheets(agency.id, clients, employees);
    const payroll = await seedPayroll(agency.id, clients, employees);
    const auditRows = await seedAuditHistory(agency.id, clients, employees);

    const counts = {
        clients: clients.length,
        employees: employees.length,
        certifications: certs,
        shifts,
        timesheets: sheets,
        permanentLinks: links,
        payrollVisits: payroll.visits,
        auditEntries: auditRows,
    };

    if (actor) {
        runWithTenant({ agencyId: agency.id, db: null }, () => {
            audit.logAction({
                userId: actor.id,
                userName: actor.name,
                userRole: actor.role,
                action: deleted ? 'UPDATE' : 'CREATE',
                entityType: 'Agency',
                entityId: agency.id,
                entityName: agency.name,
                metadata: { demoReset: true, replacedExisting: deleted, counts },
            });
        });
    }

    return {
        agency,
        adminEmail: admin.email,
        adminPassword,
        caregiverPassword: DEMO_USER_PASSWORD,
        counts,
        reset: deleted,
    };
}

module.exports = {
    provisionDemoAgency,
    destroyDemoAgency,
    DEMO_SLUG,
    DEMO_USER_PASSWORD,
};
