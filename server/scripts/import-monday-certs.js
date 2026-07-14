// server/scripts/import-monday-certs.js
'use strict';

const BOARD_ID = process.env.MONDAY_BOARD_ID || '13357748';
const TOKEN = process.env.MONDAY_API_TOKEN || '';
const API_URL = 'https://api.monday.com/v2';

async function mondayQuery(query, variables = {}) {
  if (!TOKEN) throw new Error('MONDAY_API_TOKEN env var is required');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables }),
  });
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
      name: (asset && asset.name) || fr.name || 'file',
      url: asset && asset.public_url,
      created_at: (asset && asset.created_at) || null,
    };
  }).filter(f => f.url);
}

module.exports = { mondayQuery, fetchBoardItems, normalizeItem, filesFromColumnValue };

if (require.main === module) {
  // main() defined in Task 10
  require('./import-monday-certs').main?.().catch(err => { console.error(err); process.exit(1); });
}
