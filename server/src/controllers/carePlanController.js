const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

// ── Care Team ──

async function addCareTeamMember(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const { employeeId, role, notes } = req.body;
        if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const employee = await prisma.employee.findUnique({ where: { id: Number(employeeId) } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        const member = await prisma.clientCareTeam.create({
            data: {
                clientId,
                employeeId: Number(employeeId),
                role: role || 'agency_pca',
                notes: (notes || '').trim(),
            },
            include: { employee: true },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'ClientCareTeam', entityId: member.id,
            entityName: `${employee.name} → ${client.clientName}`,
        });

        res.status(201).json(member);
    } catch (err) {
        next(err);
    }
}

async function removeCareTeamMember(req, res, next) {
    try {
        const id = Number(req.params.id);
        const member = await prisma.clientCareTeam.findUnique({
            where: { id },
            include: { employee: true, client: true },
        });
        if (!member) return res.status(404).json({ error: 'Care team member not found' });

        await prisma.clientCareTeam.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'ClientCareTeam', entityId: id,
            entityName: `${member.employee.name} → ${member.client.clientName}`,
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ── Hospital Visits ──

async function listHospitalVisits(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const visits = await prisma.hospitalVisit.findMany({
            where: { clientId },
            orderBy: { visitDate: 'desc' },
        });
        res.json(visits);
    } catch (err) {
        next(err);
    }
}

async function createHospitalVisit(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const { visitDate, visitTime, providerName, location, purpose, status, notes } = req.body;
        if (!visitDate) return res.status(400).json({ error: 'visitDate is required' });

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const visit = await prisma.hospitalVisit.create({
            data: {
                clientId,
                visitDate: new Date(visitDate),
                visitTime: (visitTime || '').trim(),
                providerName: (providerName || '').trim(),
                location: (location || '').trim(),
                purpose: (purpose || '').trim(),
                status: status || 'upcoming',
                notes: (notes || '').trim(),
            },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'HospitalVisit', entityId: visit.id,
            entityName: `${client.clientName} — ${purpose || 'Visit'}`,
        });

        res.status(201).json(visit);
    } catch (err) {
        next(err);
    }
}

async function updateHospitalVisit(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.hospitalVisit.findUnique({ where: { id }, include: { client: true } });
        if (!existing) return res.status(404).json({ error: 'Hospital visit not found' });

        const { visitDate, visitTime, providerName, location, purpose, status, notes } = req.body;
        const data = {};
        if (visitDate !== undefined) data.visitDate = new Date(visitDate);
        if (visitTime !== undefined) data.visitTime = visitTime.trim();
        if (providerName !== undefined) data.providerName = providerName.trim();
        if (location !== undefined) data.location = location.trim();
        if (purpose !== undefined) data.purpose = purpose.trim();
        if (status !== undefined) data.status = status;
        if (notes !== undefined) data.notes = notes.trim();

        const visit = await prisma.hospitalVisit.update({ where: { id }, data });

        const changes = audit.diffFields(existing, visit, ['visitDate', 'visitTime', 'providerName', 'location', 'purpose', 'status', 'notes']);
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'HospitalVisit', entityId: id,
            entityName: `${existing.client.clientName} — ${visit.purpose || 'Visit'}`,
            changes,
        });

        res.json(visit);
    } catch (err) {
        next(err);
    }
}

async function deleteHospitalVisit(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.hospitalVisit.findUnique({ where: { id }, include: { client: true } });
        if (!existing) return res.status(404).json({ error: 'Hospital visit not found' });

        await prisma.hospitalVisit.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'HospitalVisit', entityId: id,
            entityName: `${existing.client.clientName} — ${existing.purpose || 'Visit'}`,
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ── Incidents ──

async function listIncidents(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const incidents = await prisma.incident.findMany({
            where: { clientId },
            orderBy: { incidentDate: 'desc' },
        });
        res.json(incidents);
    } catch (err) {
        next(err);
    }
}

async function createIncident(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const { incidentDate, description, severity, reportedBy, notes } = req.body;
        if (!incidentDate) return res.status(400).json({ error: 'incidentDate is required' });

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const incident = await prisma.incident.create({
            data: {
                clientId,
                incidentDate: new Date(incidentDate),
                description: (description || '').trim(),
                severity: severity || 'minor',
                reportedBy: (reportedBy || '').trim(),
                notes: (notes || '').trim(),
            },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'Incident', entityId: incident.id,
            entityName: `${client.clientName} — ${description ? description.substring(0, 50) : 'Incident'}`,
        });

        res.status(201).json(incident);
    } catch (err) {
        next(err);
    }
}

async function updateIncident(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.incident.findUnique({ where: { id }, include: { client: true } });
        if (!existing) return res.status(404).json({ error: 'Incident not found' });

        const { incidentDate, description, severity, reportedBy, status, resolvedAt, resolution, notes } = req.body;
        const data = {};
        if (incidentDate !== undefined) data.incidentDate = new Date(incidentDate);
        if (description !== undefined) data.description = description.trim();
        if (severity !== undefined) data.severity = severity;
        if (reportedBy !== undefined) data.reportedBy = reportedBy.trim();
        if (status !== undefined) data.status = status;
        if (resolvedAt !== undefined) data.resolvedAt = resolvedAt ? new Date(resolvedAt) : null;
        if (resolution !== undefined) data.resolution = resolution.trim();
        if (notes !== undefined) data.notes = notes.trim();

        const incident = await prisma.incident.update({ where: { id }, data });

        const changes = audit.diffFields(existing, incident, ['incidentDate', 'description', 'severity', 'reportedBy', 'status', 'resolution', 'notes']);
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'Incident', entityId: id,
            entityName: `${existing.client.clientName} — ${incident.description ? incident.description.substring(0, 50) : 'Incident'}`,
            changes,
        });

        res.json(incident);
    } catch (err) {
        next(err);
    }
}

async function deleteIncident(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.incident.findUnique({ where: { id }, include: { client: true } });
        if (!existing) return res.status(404).json({ error: 'Incident not found' });

        await prisma.incident.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'Incident', entityId: id,
            entityName: `${existing.client.clientName} — ${existing.description ? existing.description.substring(0, 50) : 'Incident'}`,
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    addCareTeamMember,
    removeCareTeamMember,
    listHospitalVisits,
    createHospitalVisit,
    updateHospitalVisit,
    deleteHospitalVisit,
    listIncidents,
    createIncident,
    updateIncident,
    deleteIncident,
};
