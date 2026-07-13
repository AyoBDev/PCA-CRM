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

module.exports = { FILE_COLUMN_MAP, MIXED_COLUMN, OTHER_COLUMNS, classifyTrainingFile, rankFiles };
