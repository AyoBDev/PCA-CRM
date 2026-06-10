const xlsx = require('xlsx');
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

const VALID_ACCOUNTS = ['71040', '71120', '71119', '71635'];

const ACCOUNT_SERVICE_CODES = {
    '71040': ['PCS'],
    '71120': ['S5125', 'S5130', 'S5135', 'S5150'],
    '71119': ['S5125', 'S5130', 'S5135', 'S5150'],
    '71635': ['SDPC'],
};

async function previewSandata(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { accountNumber } = req.body;
        if (!accountNumber || !VALID_ACCOUNTS.includes(accountNumber)) {
            return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNTS.join(', ')}` });
        }

        const sandataRows = parseXlsx(req.file.buffer);
        if (!sandataRows) return res.status(400).json({ error: 'Missing required columns: CLIENT ID and CLIENT MEDICAID ID' });
        if (sandataRows.length === 0) return res.status(400).json({ error: 'File is empty or has no valid data rows' });

        const { uniqueRows, duplicates } = deduplicateRows(sandataRows);

        const clients = await prisma.client.findMany({
            where: { archivedAt: null },
            select: { id: true, clientName: true, medicaidId: true, address: true, phone: true },
            orderBy: { clientName: 'asc' },
        });

        const clientByMedicaid = new Map();
        for (const c of clients) {
            if (c.medicaidId) clientByMedicaid.set(c.medicaidId.trim(), c);
        }

        const serviceCodes = ACCOUNT_SERVICE_CODES[accountNumber] || [];
        const matched = [];
        const unmatched = [];
        const mismatches = [];

        for (const sr of uniqueRows) {
            const client = clientByMedicaid.get(sr.medicaidId);
            if (!client) {
                unmatched.push({ sandataClientId: sr.sandataClientId, medicaidId: sr.medicaidId, name: sr.name });
                continue;
            }

            const authCount = await prisma.authorization.count({
                where: {
                    clientId: client.id,
                    archivedAt: null,
                    OR: [
                        { accountNumber },
                        { accountNumber: '', serviceCode: { in: serviceCodes } },
                    ],
                },
            });

            matched.push({
                clientId: client.id,
                clientName: client.clientName,
                sandataClientId: sr.sandataClientId,
                medicaidId: sr.medicaidId,
                authCount,
                currentSandataId: '',
            });

            const phoneMismatch = sr.phone && client.phone && normalizePhone(sr.phone) !== normalizePhone(client.phone);
            const addressMismatch = sr.address && client.address && normalizeAddress(sr.address) !== normalizeAddress(client.address);

            if (phoneMismatch || addressMismatch) {
                mismatches.push({
                    clientId: client.id,
                    clientName: client.clientName,
                    medicaidId: sr.medicaidId,
                    ...(phoneMismatch && { appPhone: client.phone, sandataPhone: sr.phone }),
                    ...(addressMismatch && { appAddress: client.address, sandataAddress: sr.address }),
                });
            }
        }

        // Fetch current sandataClientId for matched clients
        if (matched.length > 0) {
            const clientIds = matched.map(m => m.clientId);
            const existingAuths = await prisma.authorization.findMany({
                where: {
                    clientId: { in: clientIds },
                    archivedAt: null,
                    OR: [
                        { accountNumber },
                        { accountNumber: '', serviceCode: { in: serviceCodes } },
                    ],
                },
                select: { clientId: true, sandataClientId: true },
            });
            const currentMap = new Map();
            for (const a of existingAuths) {
                if (a.sandataClientId && !currentMap.has(a.clientId)) {
                    currentMap.set(a.clientId, a.sandataClientId);
                }
            }
            for (const m of matched) {
                m.currentSandataId = currentMap.get(m.clientId) || '';
            }
        }

        res.json({
            summary: {
                totalSandataRows: sandataRows.length,
                uniqueRows: uniqueRows.length,
                duplicateRows: duplicates.length,
                matched: matched.length,
                unmatched: unmatched.length,
                mismatchCount: mismatches.length,
            },
            matched,
            unmatched,
            mismatches,
            duplicates,
            accountNumber,
        });
    } catch (err) {
        next(err);
    }
}

async function applySandata(req, res, next) {
    try {
        const { accountNumber, entries } = req.body;
        if (!accountNumber || !VALID_ACCOUNTS.includes(accountNumber)) {
            return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNTS.join(', ')}` });
        }
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ error: 'No entries to apply' });
        }

        const serviceCodes = ACCOUNT_SERVICE_CODES[accountNumber] || [];
        let updated = 0;
        const previousValues = [];

        for (const entry of entries) {
            if (!entry.clientId || !entry.sandataClientId) continue;
            const whereClause = {
                clientId: entry.clientId,
                archivedAt: null,
                OR: [
                    { accountNumber },
                    { accountNumber: '', serviceCode: { in: serviceCodes } },
                ],
            };
            const existing = await prisma.authorization.findMany({
                where: whereClause,
                select: { id: true, sandataClientId: true, accountNumber: true },
            });
            if (existing.length > 0) {
                previousValues.push({
                    clientId: entry.clientId,
                    auths: existing.map(a => ({ id: a.id, sandataClientId: a.sandataClientId || '', accountNumber: a.accountNumber || '' })),
                });
            }
            const result = await prisma.authorization.updateMany({
                where: whereClause,
                data: { sandataClientId: entry.sandataClientId.toString().trim(), accountNumber },
            });
            if (result.count > 0) updated += result.count;
        }

        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE',
            entityType: 'Authorization',
            entityId: 0,
            entityName: `SANDATA Import (${accountNumber})`,
            metadata: { accountNumber, clientsApplied: entries.length, authorizationsUpdated: updated },
        });

        res.json({
            applied: entries.length,
            authorizationsUpdated: updated,
            accountNumber,
            previousValues,
        });
    } catch (err) {
        next(err);
    }
}

async function undoSandata(req, res, next) {
    try {
        const { previousValues } = req.body;
        if (!Array.isArray(previousValues) || previousValues.length === 0) {
            return res.status(400).json({ error: 'No previous values to restore' });
        }

        let restored = 0;
        for (const entry of previousValues) {
            for (const auth of entry.auths) {
                await prisma.authorization.update({
                    where: { id: auth.id },
                    data: { sandataClientId: auth.sandataClientId, accountNumber: auth.accountNumber },
                });
                restored++;
            }
        }

        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'RESTORE',
            entityType: 'Authorization',
            entityId: 0,
            entityName: 'SANDATA Import Undo',
            metadata: { authorizationsRestored: restored, clientsAffected: previousValues.length },
        });

        res.json({ restored });
    } catch (err) {
        next(err);
    }
}

function parseXlsx(buffer) {
    const wb = xlsx.read(buffer, { type: 'buffer' });

    // Find the sheet containing the data headers (may be first or second sheet)
    let rows = null;
    let headerRowIdx = -1;
    for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const sheetRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 0; i < Math.min(10, sheetRows.length); i++) {
            const row = sheetRows[i];
            if (!row) continue;
            const cells = row.map(c => (c || '').toString().trim().toUpperCase());
            if (cells.includes('CLIENT ID') && cells.includes('CLIENT MEDICAID ID')) {
                rows = sheetRows;
                headerRowIdx = i;
                break;
            }
        }
        if (rows) break;
    }

    if (!rows || headerRowIdx === -1) return null;

    const headers = rows[headerRowIdx].map(h => (h || '').toString().trim().toUpperCase());
    const colIdx = {
        clientId: headers.indexOf('CLIENT ID'),
        medicaidId: headers.indexOf('CLIENT MEDICAID ID'),
        firstName: headers.indexOf('CLIENT FIRST NAME'),
        middleName: headers.indexOf('CLIENT MIDDLE NAME'),
        lastName: headers.indexOf('CLIENT LAST NAME'),
        phone: headers.indexOf('PHONE #'),
        address: headers.indexOf('ADDRESS'),
        city: headers.indexOf('CITY'),
        state: headers.indexOf('ST'),
        zip: headers.indexOf('ZIP'),
    };

    if (colIdx.clientId === -1 || colIdx.medicaidId === -1) return null;

    const sandataRows = [];
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const clientId = row[colIdx.clientId];
        const medicaidId = row[colIdx.medicaidId];
        // Skip continuation rows (no CLIENT ID) and footer rows
        if (!clientId || !medicaidId) continue;

        const sandataAddress = [
            (row[colIdx.address] || '').toString().trim(),
            (row[colIdx.city] || '').toString().trim(),
            (row[colIdx.state] || '').toString().trim(),
            (row[colIdx.zip] || '').toString().trim(),
        ].filter(Boolean).join(', ');

        sandataRows.push({
            sandataClientId: clientId.toString().trim(),
            medicaidId: medicaidId.toString().trim(),
            name: [row[colIdx.firstName], row[colIdx.middleName], row[colIdx.lastName]].filter(Boolean).map(s => s.toString().trim()).join(' '),
            phone: (row[colIdx.phone] || '').toString().trim(),
            address: sandataAddress,
        });
    }
    return sandataRows;
}

function deduplicateRows(sandataRows) {
    const seen = new Map();
    const duplicates = [];
    const uniqueRows = [];
    for (const sr of sandataRows) {
        if (seen.has(sr.medicaidId)) {
            duplicates.push({ medicaidId: sr.medicaidId, name: sr.name, sandataClientId: sr.sandataClientId });
        } else {
            seen.set(sr.medicaidId, sr);
            uniqueRows.push(sr);
        }
    }
    return { uniqueRows, duplicates };
}

function normalizePhone(p) {
    return (p || '').replace(/\D/g, '').slice(-10);
}

function normalizeAddress(a) {
    return (a || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0000$/, '');
}

module.exports = { previewSandata, applySandata, undoSandata };
