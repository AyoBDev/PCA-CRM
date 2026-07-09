const fs = require('fs');
const path = require('path');

const schema = fs.readFileSync(path.join(__dirname, 'schema.prisma'), 'utf8');
const EXCLUDED = new Set(['agencies']);
const tables = [];
let current = null;
let mapped = null;
for (const line of schema.split('\n')) {
  const start = line.match(/^model\s+(\w+)\s*\{/);
  if (start) { current = start[1]; mapped = null; continue; }
  if (!current) continue;
  const mapMatch = line.match(/@@map\("([^"]+)"\)/);
  if (mapMatch) mapped = mapMatch[1];
  if (/^\}/.test(line)) {
    const table = mapped || current;
    if (!EXCLUDED.has(table)) tables.push(table);
    current = null;
  }
}

const sql = tables
  .map(
    (t) => `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "${t}"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);`
  )
  .join('\n\n');
process.stdout.write(sql + '\n');
