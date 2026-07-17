// server/scripts/import-monday-certs.js
'use strict';

const { uploadFile } = require('../src/lib/storage');
const prisma = require('../src/lib/prisma');
const audit = require('../src/services/auditService');
const { buildCertPlan, matchEmployee } = require('./monday-cert-mapping');

const BOARD_ID = process.env.MONDAY_BOARD_ID || '3544216266'; // "PCA's Employees Certification Updates NEW"
const TOKEN = process.env.MONDAY_API_TOKEN || '';
const API_URL = 'https://api.monday.com/v2';

async function mondayQuery(query, variables = {}) {
  if (!TOKEN) throw new Error('MONDAY_API_TOKEN env var is required');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error('Monday API HTTP ' + res.status + ' ' + res.statusText);
  const json = await res.json();
  if (json.errors) throw new Error('Monday API error: ' + JSON.stringify(json.errors));
  return json.data;
}

// Paginate all items on the board and normalize columns.
async function fetchBoardItems(boardId) {
  const items = [];
  let cursor = null;
  do {
    const data = await mondayQuery(
      `query ($board: ID!, $cursor: String) {
         boards(ids: [$board]) {
           items_page(limit: 100, cursor: $cursor) {
             cursor
             items {
               id
               name
               assets { id name public_url created_at }
               column_values { column { title } text value }
             }
           }
         }
       }`,
      { board: boardId, cursor }
    );
    const page = data.boards?.[0]?.items_page;
    if (!page) break;
    for (const it of page.items) items.push(normalizeItem(it));
    cursor = page.cursor;
  } while (cursor);
  return items;
}

// Turn a raw Monday item into { id, name, email, columns }.
// Assets are matched to their file column heuristically is NOT reliable via
// board-level assets; per-column files come from the file column's own value.
function normalizeItem(it) {
  const columns = {};
  let email = '';
  for (const cv of it.column_values || []) {
    const title = cv.column?.title || '';
    if (!title) continue;
    columns[title] = { value: cv.text || '', files: filesFromColumnValue(cv.value, it.assets) };
    if (/email/i.test(title) && cv.text) email = cv.text;
  }
  return { id: it.id, name: it.name, email, columns };
}

// A file column's `value` JSON contains { files: [{ assetId, name }] }.
// Resolve each to the board asset (which carries public_url + created_at).
function filesFromColumnValue(rawValue, assets) {
  if (!rawValue) return [];
  let parsed;
  try { parsed = JSON.parse(rawValue); } catch { return []; }
  const fileRefs = parsed && Array.isArray(parsed.files) ? parsed.files : [];
  const byId = new Map((assets || []).map(a => [String(a.id), a]));
  return fileRefs.map(fr => {
    const asset = byId.get(String(fr.assetId));
    return {
      id: asset && asset.id,
      name: (asset && asset.name) || fr.name || 'file',
      url: asset && asset.public_url,
      created_at: (asset && asset.created_at) || null,
    };
  }).filter(f => f.url);
}

// Monday asset public_url values are 1-hour presigned S3 links. On a long run
// they expire mid-import (403). Fetch a FRESH url for a given asset id right
// before downloading it. Falls back to the provided stale url if the refresh
// query returns nothing.
async function freshAssetUrl(assetId, fallbackUrl) {
  if (!assetId) return fallbackUrl;
  try {
    const data = await mondayQuery(
      `query ($ids: [ID!]!) { assets (ids: $ids) { id public_url } }`,
      { ids: [String(assetId)] }
    );
    const a = data && data.assets && data.assets[0];
    return (a && a.public_url) || fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

// Fetch board items and print per-column file lists WITHOUT writing anything.
async function probe(limit = 3) {
  const items = await fetchBoardItems(BOARD_ID);
  console.log(`Fetched ${items.length} items. Showing first ${limit}:\n`);
  for (const it of items.slice(0, limit)) {
    console.log(`— ${it.name} <${it.email || 'no email'}>`);
    for (const [title, col] of Object.entries(it.columns)) {
      const n = col.files.length;
      if (n) console.log(`    [${title}] ${n} file(s): ${col.files.map(f => `${f.name}@${f.created_at}`).join(', ')}`);
    }
  }
  if (items.length > 0) {
    const totalFiles = items.reduce((sum, it) => sum + Object.values(it.columns).reduce((s, col) => s + col.files.length, 0), 0);
    if (totalFiles === 0) {
      console.log(`\n⚠️  WARNING: Fetched ${items.length} items but resolved 0 files. filesFromColumnValue is likely parsing the Monday file-column shape incorrectly. DO NOT run --execute until this is fixed.\n`);
    }
  }
}

// Fetch a Monday public_url and return { buffer, contentType }.
async function downloadAsset(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

// Upload to bucket key certs/${employeeId}/${certType}/${Date.now()}-${fileName} and return the key.
async function storeFile(employeeId, certType, fileName, buffer, contentType) {
  const key = `certs/${employeeId}/${certType}/${Date.now()}-${fileName}`;
  await uploadFile(key, buffer, contentType);
  return key;
}

async function processEmployee(item, employees, existingByEmp, execute, report) {
  const emp = matchEmployee(item, employees);
  if (!emp) { report.unmatched.push(item.name); return; }

  const plan = buildCertPlan(item.columns);
  const existingTypes = existingByEmp.get(emp.id) || new Set();

  for (const cert of plan) {
    if (existingTypes.has(cert.certType)) { report.skipped.push(`${emp.name}/${cert.certType}`); continue; }
    if (!cert.active) continue;

    report.willCreate.push(`${emp.name}/${cert.certType} (active: ${cert.active.name}, history: ${cert.history.length})`);
    for (const f of [cert.active, ...cert.history]) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)) report.nonStandard.push(`${emp.name}/${cert.certType}: ${f.name}`);
    }
    if (cert.certType === 'other') report.otherRouted.push(`${emp.name}: ${cert.active.name}`);

    if (!execute) continue;

    // Active file: refresh the (possibly expired) presigned url, then download,
    // store in bucket AND keep inline bytes for admin download route.
    const activeUrl = await freshAssetUrl(cert.active.id, cert.active.url);
    const activeDl = await downloadAsset(activeUrl);
    const activeKey = await storeFile(emp.id, cert.certType, cert.active.name, activeDl.buffer, activeDl.contentType);

    const created = await prisma.employeeCertification.create({
      data: {
        employeeId: emp.id,
        certType: cert.certType,
        status: 'active',
        expirationDate: cert.expirationDate,
        fileName: cert.active.name,
        fileSize: activeDl.buffer.length,
        fileType: activeDl.contentType,
        fileData: activeDl.buffer,
        notes: 'Imported from Monday.com',
        uploads: {
          create: [{
            bucketKey: activeKey,
            fileName: cert.active.name,
            fileSize: activeDl.buffer.length,
            fileType: activeDl.contentType,
            note: 'Active (imported)',
          }],
        },
      },
    });

    // History files: bucket-only CertificationUpload rows.
    // Wrapped in its own try/catch — a history download failure must NOT void the
    // already-committed active cert; surface it as a partial-cert warning instead.
    try {
      for (const f of cert.history) {
        const fUrl = await freshAssetUrl(f.id, f.url);
        const dl = await downloadAsset(fUrl);
        const key = await storeFile(emp.id, cert.certType, f.name, dl.buffer, dl.contentType);
        await prisma.certificationUpload.create({
          data: {
            certificationId: created.id,
            bucketKey: key,
            fileName: f.name,
            fileSize: dl.buffer.length,
            fileType: dl.contentType,
            note: 'History (imported)',
          },
        });
      }
    } catch (err) {
      report.partialCerts.push(`${emp.name}/${cert.certType}: active saved but history incomplete (${err.message})`);
      // continue to next cert — active cert is validly saved and accessible via fileData
    }

    audit.logAction({
      userId: 0, userName: 'Monday Import', userRole: 'system',
      action: 'CREATE', entityType: 'EmployeeCertification', entityId: created.id,
      entityName: `${cert.certType} - ${emp.name}`, changes: [], metadata: { source: 'monday_import', historyCount: cert.history.length },
    });
    report.created++;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const limitArg = args.indexOf('--limit');
  let limit = Infinity;
  if (limitArg >= 0) {
    const parsed = Number(args[limitArg + 1]);
    if (isNaN(parsed) || parsed < 1) throw new Error('--limit requires a positive integer, got: ' + args[limitArg + 1]);
    limit = parsed;
  }

  console.log(execute ? '=== EXECUTE MODE (writing) ===' : '=== DRY RUN (no writes; pass --execute to write) ===');

  const employees = await prisma.employee.findMany({ select: { id: true, name: true, email: true } });
  const existing = await prisma.employeeCertification.findMany({ select: { employeeId: true, certType: true } });
  const existingByEmp = new Map();
  for (const c of existing) {
    if (!existingByEmp.has(c.employeeId)) existingByEmp.set(c.employeeId, new Set());
    existingByEmp.get(c.employeeId).add(c.certType);
  }

  let items = await fetchBoardItems(BOARD_ID);
  if (Number.isFinite(limit)) items = items.slice(0, limit);

  const report = { created: 0, willCreate: [], skipped: [], unmatched: [], otherRouted: [], nonStandard: [], errors: [], partialCerts: [] };

  // Process employees in bounded-concurrency batches. Each employee is
  // independent (distinct employeeId, skip-if-present precomputed), so parallel
  // processing is safe and finishes the whole run well within Monday's 1-hour
  // presigned-url lifetime. freshAssetUrl also re-fetches urls at download time.
  const CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY) || 6;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (item) => {
      try { await processEmployee(item, employees, existingByEmp, execute, report); }
      catch (err) { report.errors.push(`${item.name}: ${err.message}`); }
    }));
  }

  console.log(`\n--- Report ---`);
  console.log(`Employees processed: ${items.length}`);
  console.log(`Certs ${execute ? 'created' : 'to create'}: ${execute ? report.created : report.willCreate.length}`);
  if (report.willCreate.length) console.log(`Planned:\n  ${report.willCreate.join('\n  ')}`);
  if (report.skipped.length) console.log(`Skipped (already present):\n  ${report.skipped.join('\n  ')}`);
  if (report.unmatched.length) console.log(`UNMATCHED employees:\n  ${report.unmatched.join('\n  ')}`);
  if (report.otherRouted.length) console.log(`Routed to 'other':\n  ${report.otherRouted.join('\n  ')}`);
  if (report.nonStandard.length) console.log(`Non-PDF/image files (stored as-is):\n  ${report.nonStandard.join('\n  ')}`);
  if (report.partialCerts.length) console.log(`PARTIAL CERTS (active saved, history incomplete):\n  ${report.partialCerts.join('\n  ')}`);
  if (report.errors.length) console.log(`ERRORS (write/download failures — may have left partial data):\n  ${report.errors.join('\n  ')}`);

  await prisma.$disconnect();
}

module.exports = { mondayQuery, fetchBoardItems, normalizeItem, filesFromColumnValue, freshAssetUrl, probe, downloadAsset, storeFile, main, processEmployee };

if (require.main === module) {
  const args = process.argv.slice(2);
  const run = args.includes('--probe') ? probe() : main();
  run.catch(err => { console.error(err); process.exit(1); });
}
