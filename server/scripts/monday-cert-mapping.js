// server/scripts/monday-cert-mapping.js

// Note: the CPR expiration column title in the export has TWO spaces
// ("Act  Due Date CPR") — copied verbatim from the board.
const FILE_COLUMN_MAP = [
  { column: 'ID EXP DATE',     certType: 'id_expiration',   expirationColumn: 'ID EXP DATE' },
  { column: 'TB/FILES',        certType: 'tb_test',         expirationColumn: 'Act Due TB/TB screening' },
  { column: 'CPR/FILES',       certType: 'cpr',             expirationColumn: 'Act  Due Date CPR' },
  { column: 'TRAINING/FILES',  certType: 'annual_training', expirationColumn: 'Act Due 8 HR ANNUAL TRAINING' },
  { column: 'NABS/FILES',      certType: 'background_check', expirationColumn: 'Act Due BACKGROUND CHECK' },
];

const MIXED_COLUMN = 'TRAINING/CERTIFICATES';
const OTHER_COLUMNS = ['NPPES COPIES', 'NPI'];

function classifyTrainingFile(fileName) {
  const n = String(fileName || '').toLowerCase();
  if (n.includes('cult')) return 'cultural_competency';       // "cult", "culture"
  if (n.includes('infect')) return 'infection_control';       // "infect", "infection"
  return 'other';
}

function rankFiles(files) {
  const list = (files || []).slice().sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta; // descending: newest first
  });
  if (list.length === 0) return { active: null, history: [] };
  return { active: list[0], history: list.slice(1) };
}

// Parses a Monday/Excel expiration value into a Date at UTC midnight.
// These are date-ONLY values (a calendar due date, no time-of-day). Anchoring
// to UTC midnight (Date.UTC) makes the stored DateTime round-trip to the SAME
// calendar day regardless of the server's timezone — using local midnight would
// shift the stored day by ±1 in any non-UTC zone (e.g. Africa/Lagos, US/Pacific).
function parseExcelDate(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    // Excel serial (days since 1899-12-30) → the SAME calendar day at UTC
    // midnight. Compute directly rather than via the shared helper because that
    // one anchors to LOCAL midnight, which would shift the day in non-UTC zones.
    if (!(val > 0)) return null;
    const utcMs = Math.round((val - 25569) * 86400 * 1000); // 25569 = 1899-12-30 → 1970-01-01
    const base = new Date(utcMs);
    return isNaN(base.getTime())
      ? null
      : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  }
  const str = String(val).trim();
  if (!str) return null;
  // ISO YYYY-MM-DD → UTC midnight
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  // M/D/YYYY or M-D-YYYY → UTC midnight
  const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) return new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function matchEmployee(mondayItem, employees) {
  const name = String(mondayItem.name || '').trim().toLowerCase();
  const email = String(mondayItem.email || '').trim().toLowerCase();
  if (name) {
    const byName = employees.find(e => String(e.name || '').trim().toLowerCase() === name);
    if (byName) return byName;
  }
  if (email) {
    const byEmail = employees.find(e => String(e.email || '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  return null;
}

function buildCertPlan(columns) {
  const cols = columns || {};
  const getFiles = (title) => (cols[title] && cols[title].files) || [];
  const getValue = (title) => (cols[title] ? cols[title].value : null);

  // certType -> { files: [], expirationDate }
  const buckets = {};
  const ensure = (certType, expirationDate) => {
    if (!buckets[certType]) buckets[certType] = { files: [], expirationDate: expirationDate ?? null };
    return buckets[certType];
  };

  // Fixed columns
  for (const entry of FILE_COLUMN_MAP) {
    const files = getFiles(entry.column);
    if (!files.length) continue;
    const exp = entry.expirationColumn ? parseExcelDate(getValue(entry.expirationColumn)) : null;
    const b = ensure(entry.certType, exp);
    b.files.push(...files);
  }

  // Mixed training column -> split by filename
  for (const f of getFiles(MIXED_COLUMN)) {
    const certType = classifyTrainingFile(f.name);
    ensure(certType, null).files.push(f);
  }

  // NPPES / NPI -> other
  for (const col of OTHER_COLUMNS) {
    for (const f of getFiles(col)) ensure('other', null).files.push(f);
  }

  // Rank each bucket
  return Object.entries(buckets)
    .map(([certType, b]) => {
      const { active, history } = rankFiles(b.files);
      return { certType, expirationDate: b.expirationDate, active, history };
    })
    .filter(p => p.active); // omit empty cert types
}

module.exports = { FILE_COLUMN_MAP, MIXED_COLUMN, OTHER_COLUMNS, classifyTrainingFile, rankFiles, parseExcelDate, matchEmployee, buildCertPlan };
