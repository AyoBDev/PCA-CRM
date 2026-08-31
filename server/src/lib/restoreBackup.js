// Schema-driven restore of a JSON backup produced by backupController.
//
// WHY schema-driven + raw SQL: the backup EXPORT derives its table list from the
// live database (information_schema), so it automatically covers every table
// (currently 57). A hardcoded restore list (the old prisma/import-backup.js knew
// only 17 tables) silently drops ~70% of the data — which defeats the point of a
// backup. And the backup emits every column camelCased, whereas Prisma's
// createMany expects *model field names*, which don't match uniformly (some
// fields are snake_case in the schema, some are @map'd). So instead of going
// through Prisma's field layer, we INSERT with raw parameterized SQL against the
// real DB column names, matched from information_schema.
//
// The load runs with FK checks deferred (session_replication_role='replica') so
// it needs no hand-maintained FK ordering and tolerates self-references (e.g.
// admin_folders.parent_id) and cycles. Runs on the OWNER connection — restore is
// deliberate operator maintenance, and session_replication_role needs that role.

// camelCase (backup key) → snake_case (DB column). Inverse of the export's
// camelizeRow, so a round-trip lands on the original column name.
function toSnake(s) {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

// Fetch the real column set + which columns are timestamp/date typed.
async function columnInfo(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    table
  );
  const columns = new Set();
  const tsColumns = new Set();
  const jsonColumns = new Set();
  for (const r of rows) {
    columns.add(r.column_name);
    if (/timestamp|^date$/i.test(r.data_type)) tsColumns.add(r.column_name);
    if (/^json/i.test(r.data_type)) jsonColumns.add(r.column_name); // json / jsonb
  }
  return { columns, tsColumns, jsonColumns };
}

// Turn one backup row (camelCase keys) into { columns:[snake...], values:[...] }
// aligned to the table's real columns. Unknown keys (columns the current schema
// dropped) are ignored; timestamp columns are coerced to Date.
function projectRow(row, { columns, tsColumns, jsonColumns }) {
  const cols = [];
  const vals = [];
  const jsonFlags = [];
  for (const [k, v] of Object.entries(row)) {
    const col = toSnake(k);
    if (!columns.has(col)) continue; // column no longer exists — skip it
    cols.push(col);
    if (v != null && jsonColumns.has(col)) {
      // json/jsonb: bind as a JSON *string* + cast to jsonb in SQL, so arrays
      // and objects don't get mis-bound as Postgres arrays.
      jsonFlags.push(true);
      vals.push(typeof v === 'string' ? v : JSON.stringify(v));
    } else if (v != null && tsColumns.has(col)) {
      jsonFlags.push(false);
      const d = new Date(v);
      vals.push(isNaN(d.getTime()) ? null : d);
    } else {
      jsonFlags.push(false);
      vals.push(v);
    }
  }
  return { cols, vals, jsonFlags };
}

// Build a multi-row INSERT ... ON CONFLICT DO NOTHING for a batch of rows that
// share the same column set. Returns { sql, params }.
function buildInsert(table, cols, jsonFlags, batch) {
  const quotedCols = cols.map((c) => `"${c}"`).join(', ');
  const params = [];
  const rowSqls = [];
  for (const vals of batch) {
    const placeholders = vals.map((v, i) => {
      params.push(v);
      // Cast json/jsonb columns explicitly so a JSON string binds correctly.
      return jsonFlags[i] ? `$${params.length}::jsonb` : `$${params.length}`;
    });
    rowSqls.push(`(${placeholders.join(', ')})`);
  }
  const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES ${rowSqls.join(', ')} ON CONFLICT DO NOTHING`;
  return { sql, params };
}

/**
 * Restore a parsed backup object into the database `prisma` points at.
 *
 * @param {import('@prisma/client').PrismaClient} prisma  owner client
 * @param {object} backup  parsed backup JSON ({ tables: { <table>: [rows] } })
 * @param {object} [opts]
 * @param {(msg:string)=>void} [opts.log]  progress logger (defaults to no-op)
 * @param {number} [opts.batchSize=200]
 * @returns {Promise<{ imported: number, perTable: Record<string, number>, skipped: string[] }>}
 */
async function restoreBackup(prisma, backup, { log = () => {}, batchSize = 200 } = {}) {
  if (!backup || typeof backup !== 'object' || !backup.tables) {
    throw new Error('Invalid backup: missing "tables" object');
  }

  const perTable = {};
  const skipped = [];
  let imported = 0;

  // Pre-resolve each table's real columns before the FK-deferred transaction.
  const plan = [];
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!Array.isArray(rows) || rows.length === 0) {
      perTable[table] = 0;
      continue;
    }
    const info = await columnInfo(prisma, table);
    if (info.columns.size === 0) {
      // Table in the backup no longer exists in this schema.
      skipped.push(table);
      continue;
    }
    plan.push({ table, rows, info });
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
      for (const { table, rows, info } of plan) {
        let count = 0;
        for (let i = 0; i < rows.length; i += batchSize) {
          const slice = rows.slice(i, i + batchSize);
          // Group by identical column shape so every INSERT is well-formed even
          // if rows have slightly different key sets.
          const byShape = new Map();
          for (const row of slice) {
            const { cols, vals, jsonFlags } = projectRow(row, info);
            const key = cols.join(',');
            if (!byShape.has(key)) byShape.set(key, { cols, jsonFlags, batch: [] });
            byShape.get(key).batch.push(vals);
          }
          for (const { cols, jsonFlags, batch } of byShape.values()) {
            if (cols.length === 0) continue;
            const { sql, params } = buildInsert(table, cols, jsonFlags, batch);
            await tx.$executeRawUnsafe(sql, ...params);
            count += batch.length;
          }
        }
        perTable[table] = count;
        imported += count;
        log(`  done  ${table} — ${count} row(s)`);
      }
      await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    },
    { timeout: 120000 }
  );

  // Reset id sequences so future inserts don't collide with restored ids.
  for (const { table } of plan) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`
      );
    } catch {
      // Table without an id sequence (join tables) — nothing to reset.
    }
  }

  if (skipped.length) {
    log(`  note  skipped ${skipped.length} table(s) not in current schema: ${skipped.join(', ')}`);
  }

  return { imported, perTable, skipped };
}

module.exports = { restoreBackup, toSnake, columnInfo, projectRow };
