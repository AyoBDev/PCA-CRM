const prisma = require('../lib/prisma');
const XLSX = require('xlsx');
const { enrichClient } = require('../services/authorizationService');
const audit = require('../services/auditService');

// GET /api/clients
async function listClients(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const clients = await prisma.client.findMany({
            where,
            include: {
                authorizations: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        authorization_documents: {
                            select: { id: true, authorization_id: true, file_name: true, file_path: true, file_size: true, mime_type: true, uploaded_by: true, notes: true, created_at: true, users: { select: { id: true, name: true } } },
                            orderBy: { created_at: 'desc' }
                        }
                    }
                },
                timesheets: { orderBy: { weekStart: 'desc' }, take: 1, select: { weekStart: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        res.json(clients.map(c => {
            const enriched = enrichClient(c);
            enriched.lastVisit = c.timesheets?.[0]?.weekStart || null;
            return enriched;
        }));
    } catch (err) {
        next(err);
    }
}

// GET /api/clients/:id
async function getClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({
            where: { id },
            include: {
                authorizations: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        authorization_documents: {
                            select: { id: true, authorization_id: true, file_name: true, file_path: true, file_size: true, mime_type: true, uploaded_by: true, notes: true, created_at: true, users: { select: { id: true, name: true } } },
                            orderBy: { created_at: 'desc' }
                        }
                    }
                },
                careTeam: { include: { employee: true }, orderBy: { assignedAt: 'desc' } },
                documents: {
                    select: { id: true, clientId: true, category: true, fileName: true, filePath: true, fileSize: true, mimeType: true, uploadedBy: true, notes: true, createdAt: true, updatedAt: true, uploader: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'desc' }
                },
                hospitalVisits: { orderBy: { visitDate: 'desc' } },
                incidents: { orderBy: { incidentDate: 'desc' } },
                clientNotes: { orderBy: { date: 'desc' } },
            },
        });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json(enrichClient(client));
    } catch (err) {
        next(err);
    }
}

// POST /api/clients
async function createClient(req, res, next) {
    try {
        const { clientName, medicaidId, insuranceType, address, secondaryAddress, phone, secondaryPhone, email, gender, gateCode, notes, pcaNotes, caregiverRequirements, mainServices, enabledServices, dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, emergencyContactName, emergencyContactPhone, emergencyContactRelation, secondaryEmergencyName, secondaryEmergencyPhone, secondaryEmergencyRelation, critical } = req.body;
        if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
            return res.status(400).json({ error: 'clientName is required' });
        }
        const client = await prisma.client.create({
            data: {
                clientName: clientName.trim(),
                medicaidId: (medicaidId || '').trim(),
                insuranceType: insuranceType || 'MEDICAID',
                address: (address || '').trim(),
                secondaryAddress: (secondaryAddress || '').trim(),
                phone: (phone || '').trim(),
                secondaryPhone: (secondaryPhone || '').trim(),
                email: (email || '').trim(),
                gender: (gender || '').trim(),
                gateCode: (gateCode || '').trim(),
                notes: (notes || '').trim(),
                pcaNotes: (pcaNotes || '').trim(),
                caregiverRequirements: (caregiverRequirements || '').trim(),
                mainServices: (mainServices || '').trim(),
                enabledServices: enabledServices || '["PAS","Homemaker"]',
                dob: dob ? new Date(dob) : null,
                paNumber: (paNumber || '').trim(),
                doctorName: (doctorName || '').trim(),
                doctorPhone: (doctorPhone || '').trim(),
                backupDoctorName: (backupDoctorName || '').trim(),
                backupDoctorPhone: (backupDoctorPhone || '').trim(),
                emergencyContactName: (emergencyContactName || '').trim(),
                emergencyContactPhone: (emergencyContactPhone || '').trim(),
                emergencyContactRelation: (emergencyContactRelation || '').trim(),
                secondaryEmergencyName: (secondaryEmergencyName || '').trim(),
                secondaryEmergencyPhone: (secondaryEmergencyPhone || '').trim(),
                secondaryEmergencyRelation: (secondaryEmergencyRelation || '').trim(),
                critical: critical === true,
            },
            include: { authorizations: true },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Client', entityId: client.id, entityName: client.clientName });
        res.status(201).json(enrichClient(client));
    } catch (err) {
        next(err);
    }
}

// PUT /api/clients/:id
async function updateClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { clientName, medicaidId, insuranceType, address, secondaryAddress, phone, secondaryPhone, email, gender, gateCode, notes, pcaNotes, caregiverRequirements, mainServices, enabledServices, dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, emergencyContactName, emergencyContactPhone, emergencyContactRelation, secondaryEmergencyName, secondaryEmergencyPhone, secondaryEmergencyRelation, critical } = req.body;
        if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
            return res.status(400).json({ error: 'clientName is required' });
        }
        const oldClient = await prisma.client.findUnique({ where: { id } });
        const updated = await prisma.client.update({
            where: { id },
            data: {
                clientName: clientName.trim(),
                medicaidId: (medicaidId || '').trim(),
                insuranceType: insuranceType || 'MEDICAID',
                address: (address || '').trim(),
                secondaryAddress: (secondaryAddress || '').trim(),
                phone: (phone || '').trim(),
                secondaryPhone: (secondaryPhone || '').trim(),
                email: (email || '').trim(),
                gender: (gender || '').trim(),
                gateCode: (gateCode || '').trim(),
                notes: (notes || '').trim(),
                pcaNotes: (pcaNotes || '').trim(),
                caregiverRequirements: (caregiverRequirements || '').trim(),
                mainServices: (mainServices || '').trim(),
                enabledServices: enabledServices || '["PAS","Homemaker"]',
                dob: dob ? new Date(dob) : null,
                paNumber: (paNumber || '').trim(),
                doctorName: (doctorName || '').trim(),
                doctorPhone: (doctorPhone || '').trim(),
                backupDoctorName: (backupDoctorName || '').trim(),
                backupDoctorPhone: (backupDoctorPhone || '').trim(),
                emergencyContactName: (emergencyContactName || '').trim(),
                emergencyContactPhone: (emergencyContactPhone || '').trim(),
                emergencyContactRelation: (emergencyContactRelation || '').trim(),
                secondaryEmergencyName: (secondaryEmergencyName || '').trim(),
                secondaryEmergencyPhone: (secondaryEmergencyPhone || '').trim(),
                secondaryEmergencyRelation: (secondaryEmergencyRelation || '').trim(),
                critical: critical === true,
            },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });
        const changes = audit.diffFields(oldClient, updated, ['clientName', 'medicaidId', 'insuranceType', 'address', 'secondaryAddress', 'phone', 'secondaryPhone', 'email', 'gender', 'gateCode', 'notes', 'pcaNotes', 'caregiverRequirements', 'mainServices', 'enabledServices', 'dob', 'paNumber', 'doctorName', 'doctorPhone', 'backupDoctorName', 'backupDoctorPhone', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation', 'secondaryEmergencyName', 'secondaryEmergencyPhone', 'secondaryEmergencyRelation', 'critical']);
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Client', entityId: updated.id, entityName: updated.clientName, changes });
        res.json(enrichClient(updated));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
        next(err);
    }
}

// PATCH /api/clients/:id
async function patchClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { address, secondaryAddress, phone, secondaryPhone, email, gender, gateCode, notes, pcaNotes, caregiverRequirements, mainServices, enabledServices, dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, emergencyContactName, emergencyContactPhone, emergencyContactRelation, secondaryEmergencyName, secondaryEmergencyPhone, secondaryEmergencyRelation, critical, clientStatus } = req.body;
        const data = {};
        if (address !== undefined) data.address = address;
        if (secondaryAddress !== undefined) data.secondaryAddress = secondaryAddress;
        if (phone !== undefined) data.phone = phone;
        if (secondaryPhone !== undefined) data.secondaryPhone = secondaryPhone;
        if (email !== undefined) data.email = email;
        if (gender !== undefined) data.gender = gender;
        if (gateCode !== undefined) data.gateCode = gateCode;
        if (notes !== undefined) data.notes = notes;
        if (pcaNotes !== undefined) data.pcaNotes = pcaNotes;
        if (caregiverRequirements !== undefined) data.caregiverRequirements = caregiverRequirements;
        if (mainServices !== undefined) data.mainServices = mainServices;
        if (enabledServices !== undefined) data.enabledServices = enabledServices;
        if (dob !== undefined) data.dob = dob ? new Date(dob) : null;
        if (paNumber !== undefined) data.paNumber = paNumber;
        if (doctorName !== undefined) data.doctorName = doctorName;
        if (doctorPhone !== undefined) data.doctorPhone = doctorPhone;
        if (backupDoctorName !== undefined) data.backupDoctorName = backupDoctorName;
        if (backupDoctorPhone !== undefined) data.backupDoctorPhone = backupDoctorPhone;
        if (emergencyContactName !== undefined) data.emergencyContactName = emergencyContactName;
        if (emergencyContactPhone !== undefined) data.emergencyContactPhone = emergencyContactPhone;
        if (emergencyContactRelation !== undefined) data.emergencyContactRelation = emergencyContactRelation;
        if (secondaryEmergencyName !== undefined) data.secondaryEmergencyName = secondaryEmergencyName;
        if (secondaryEmergencyPhone !== undefined) data.secondaryEmergencyPhone = secondaryEmergencyPhone;
        if (secondaryEmergencyRelation !== undefined) data.secondaryEmergencyRelation = secondaryEmergencyRelation;
        if (critical !== undefined) data.critical = critical;
        if (clientStatus !== undefined) data.client_status = clientStatus;

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        const oldClient = await prisma.client.findUnique({ where: { id } });
        const updated = await prisma.client.update({
            where: { id },
            data,
            include: { authorizations: true },
        });

        if (clientStatus === 'inactive') {
            await prisma.authorization.updateMany({
                where: { clientId: id, archivedAt: null },
                data: { manualStatus: 'inactive' },
            });
        }

        const changes = audit.diffFields(oldClient, updated, Object.keys(data));
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Client', entityId: id, entityName: updated.clientName, changes });

        const final = await prisma.client.findUnique({
            where: { id },
            include: { authorizations: true },
        });
        res.json(enrichClient(final));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
        next(err);
    }
}

// DELETE /api/clients/:id  (soft-delete → archive)
async function deleteClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        const now = new Date();
        await prisma.shift.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        await prisma.timesheet.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        const archived = await prisma.client.update({ where: { id }, data: { archivedAt: now }, include: { authorizations: true } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Client', entityId: id, entityName: client.clientName });
        res.json(archived);
    } catch (err) {
        next(err);
    }
}

// POST /api/clients/bulk-delete  (soft-delete → archive)
async function bulkDelete(req, res, next) {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }
        const numericIds = ids.map(Number).filter(n => !isNaN(n));
        const now = new Date();
        await prisma.shift.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.timesheet.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.client.updateMany({ where: { id: { in: numericIds } }, data: { archivedAt: now } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Client', entityId: 0, metadata: { count: numericIds.length } });
        res.json({ archived: numericIds.length });
    } catch (err) {
        next(err);
    }
}

// PUT /api/clients/:id/restore
async function restoreClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        await prisma.shift.updateMany({ where: { clientId: id, archivedAt: { not: null } }, data: { archivedAt: null } });
        await prisma.timesheet.updateMany({ where: { clientId: id, archivedAt: { not: null } }, data: { archivedAt: null } });
        const restored = await prisma.client.update({
            where: { id }, data: { archivedAt: null },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'Client', entityId: id, entityName: restored.clientName });
        res.json(enrichClient(restored));
    } catch (err) {
        next(err);
    }
}

// POST /api/clients/bulk-import
async function bulkImport(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File upload required (.xlsx, .xls, or .csv)' });
        }

        const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

        // Parse parent/child rows
        const parsed = [];
        let current = null;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const hasContent = row.some(cell => cell !== '' && cell !== undefined && cell !== null);
            if (!hasContent) continue;

            const clientName = String(row[1] || '').trim();
            const medicaidId = String(row[2] || '').trim();
            const insuranceType = String(row[3] || '').trim();
            const serviceCategory = String(row[4] || '').trim();
            const serviceCode = String(row[5] || '').trim();
            const serviceName = String(row[6] || '').trim();
            const authorizedUnits = row[7];
            const authStart = row[8];
            const authEnd = row[9];
            const notes = String(row[12] || '').trim();

            if (clientName) {
                if (current) parsed.push(current);
                current = { clientName, medicaidId, insuranceType: insuranceType || 'MEDICAID', authorizations: [] };
                continue;
            }

            if (current && serviceCode) {
                current.authorizations.push({
                    serviceCategory,
                    serviceCode,
                    serviceName: serviceName || serviceCode,
                    authorizedUnits: parseInt(authorizedUnits, 10) || 0,
                    authorizationStartDate: parseExcelDate(authStart),
                    authorizationEndDate: parseExcelDate(authEnd),
                    notes,
                });
            }
        }
        if (current) parsed.push(current);

        if (parsed.length === 0) {
            return res.status(400).json({ error: 'No valid client rows found in the spreadsheet' });
        }

        // Load existing clients by Medicaid ID
        const existingClients = await prisma.client.findMany({ include: { authorizations: true } });
        const clientByMedicaid = {};
        for (const c of existingClients) {
            if (c.medicaidId) clientByMedicaid[c.medicaidId] = c;
        }

        let clientsCreated = 0, clientsUpdated = 0, authsCreated = 0, authsUpdated = 0;

        for (const c of parsed) {
            const existing = c.medicaidId ? clientByMedicaid[c.medicaidId] : null;

            if (existing) {
                const updates = {};
                if (c.clientName && c.clientName !== existing.clientName) updates.clientName = c.clientName;
                if (c.insuranceType && c.insuranceType !== existing.insuranceType) updates.insuranceType = c.insuranceType;
                if (Object.keys(updates).length > 0) {
                    await prisma.client.update({ where: { id: existing.id }, data: updates });
                }

                for (const auth of c.authorizations) {
                    const match = existing.authorizations.find(a =>
                        a.serviceCode === auth.serviceCode &&
                        sameDay(a.authorizationStartDate, auth.authorizationStartDate) &&
                        sameDay(a.authorizationEndDate, auth.authorizationEndDate)
                    );

                    if (match) {
                        const authUpdates = {};
                        if (auth.authorizedUnits && auth.authorizedUnits !== match.authorizedUnits) authUpdates.authorizedUnits = auth.authorizedUnits;
                        if (auth.serviceName && auth.serviceName !== match.serviceName) authUpdates.serviceName = auth.serviceName;
                        if (auth.serviceCategory && auth.serviceCategory !== match.serviceCategory) authUpdates.serviceCategory = auth.serviceCategory;
                        if (auth.notes && auth.notes !== (match.notes || '')) authUpdates.notes = auth.notes;
                        if (Object.keys(authUpdates).length > 0) {
                            await prisma.authorization.update({ where: { id: match.id }, data: authUpdates });
                            authsUpdated++;
                        }
                    } else {
                        await prisma.authorization.create({
                            data: {
                                clientId: existing.id,
                                serviceCategory: auth.serviceCategory,
                                serviceCode: auth.serviceCode,
                                serviceName: auth.serviceName,
                                authorizedUnits: auth.authorizedUnits,
                                authorizationStartDate: auth.authorizationStartDate,
                                authorizationEndDate: auth.authorizationEndDate || new Date('2030-12-31'),
                                notes: auth.notes,
                            },
                        });
                        authsCreated++;
                    }
                }
                clientsUpdated++;
            } else {
                const auths = c.authorizations.map(a => ({
                    serviceCategory: a.serviceCategory,
                    serviceCode: a.serviceCode,
                    serviceName: a.serviceName,
                    authorizedUnits: a.authorizedUnits,
                    authorizationStartDate: a.authorizationStartDate,
                    authorizationEndDate: a.authorizationEndDate || new Date('2030-12-31'),
                    notes: a.notes,
                }));

                const newClient = await prisma.client.create({
                    data: {
                        clientName: c.clientName,
                        medicaidId: c.medicaidId,
                        insuranceType: c.insuranceType,
                        authorizations: { create: auths },
                    },
                });
                clientByMedicaid[c.medicaidId] = { ...newClient, authorizations: auths };
                clientsCreated++;
                authsCreated += auths.length;
            }
        }

        // Return refreshed client list
        const allClients = await prisma.client.findMany({
            where: { archivedAt: null },
            include: {
                authorizations: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        authorization_documents: {
                            select: { id: true, authorization_id: true, file_name: true, file_path: true, file_size: true, mime_type: true, uploaded_by: true, notes: true, created_at: true, users: { select: { id: true, name: true } } },
                            orderBy: { created_at: 'desc' }
                        }
                    }
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Client', entityId: 0, entityName: 'Bulk Import', metadata: { clientsCreated, clientsUpdated, authsCreated, authsUpdated } });

        res.status(201).json({
            clientsCreated,
            clientsUpdated,
            authsCreated,
            authsUpdated,
            clients: allClients.map(enrichClient),
        });
    } catch (err) {
        next(err);
    }
}

function parseExcelDate(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return new Date(d.y, d.m - 1, d.d);
        return null;
    }
    const str = String(val).trim();
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function sameDay(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

async function permanentlyDeleteClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        if (!client.archivedAt) return res.status(400).json({ error: 'Only archived clients can be permanently deleted' });
        await prisma.client.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PERMANENT_DELETE', entityType: 'Client', entityId: id, entityName: client.clientName });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function bulkPermanentlyDeleteClients(req, res, next) {
    try {
        const result = await prisma.client.deleteMany({ where: { archivedAt: { not: null } } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'BULK_DELETE', entityType: 'Client', entityId: 0, metadata: { count: result.count } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

async function mergeClients(req, res, next) {
    try {
        const keepId = Number(req.params.id);
        const { mergeId } = req.body;
        if (!mergeId || keepId === Number(mergeId)) return res.status(400).json({ error: 'Invalid merge target' });

        const keep = await prisma.client.findUnique({ where: { id: keepId } });
        const merge = await prisma.client.findUnique({ where: { id: Number(mergeId) } });
        if (!keep || !merge) return res.status(404).json({ error: 'Client not found' });

        await prisma.$transaction([
            prisma.timesheet.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.authorization.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.permanentLink.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.shift.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.clientNote.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.clientCareTeam.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.clientDocument.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.hospitalVisit.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.incident.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.clientActivity.updateMany({ where: { clientId: Number(mergeId) }, data: { clientId: keepId } }),
            prisma.client.delete({ where: { id: Number(mergeId) } }),
        ]);

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Client', entityId: keepId, entityName: keep.clientName, metadata: { mergedFrom: merge.clientName, mergedId: Number(mergeId) } });

        const updated = await prisma.client.findUnique({ where: { id: keepId }, include: { authorizations: { orderBy: { createdAt: 'asc' } } } });
        res.json(enrichClient(updated));
    } catch (err) { next(err); }
}

module.exports = { listClients, getClient, createClient, updateClient, patchClient, deleteClient, bulkDelete, bulkImport, restoreClient, permanentlyDeleteClient, bulkPermanentlyDeleteClients, mergeClients };
