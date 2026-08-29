// Spreadsheet read/write helper built on ExcelJS.
//
// This exists to replace the `xlsx` (SheetJS) package, which carries
// unfixable high-severity advisories (prototype pollution + ReDoS) and parses
// untrusted uploads (payroll / client / employee imports). ExcelJS is actively
// maintained and has no known equivalent advisories.
//
// The read helper reproduces the ONE shape the old code depended on:
// `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })` — an
// array-of-arrays where each inner array is positional (column A = index 0),
// blank cells are '' so column indexes never shift, numbers stay numbers, and
// date cells come back as real Date objects. Keeping that exact contract lets
// every call site swap in with almost no logic change.

const ExcelJS = require('exceljs');

// Convert an Excel serial date number (days since 1899-12-30) to a JS Date at
// local midnight. ExcelJS already returns real Date objects for date-typed
// .xlsx cells, so this only matters for numeric cells from CSV or untyped
// columns. Returns null for non-date-like numbers.
function excelSerialToDate(serial) {
    if (typeof serial !== 'number' || !(serial > 0)) return null;
    // 25569 = days between the Excel epoch (1899-12-30) and the Unix epoch.
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    // Reconstruct at local midnight so callers get a clean calendar date.
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Turn a single ExcelJS cell's value into the primitive the old parser yielded.
// ExcelJS wraps some values (formulas, rich text, hyperlinks) in objects; we
// unwrap to the plain display value so downstream String()/Number() coercion
// behaves exactly as it did under SheetJS `raw: true`.
function cellValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
        // Formula cell → use its computed result.
        if ('result' in value) return cellValue(value.result);
        // Rich text → concatenate the runs.
        if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
        // Hyperlink cell → the visible text.
        if ('text' in value) return value.text;
        // Error cell (e.g. { error: '#REF!' }) → empty, matching lenient parse.
        if ('error' in value) return '';
        return '';
    }
    return value;
}

// Convert one ExcelJS row into a dense positional array. ExcelJS `row.values`
// is 1-indexed (index 0 is always undefined) and sparse (missing cells are
// holes); we densify from column 1..N filling gaps with ''.
function rowToArray(row) {
    const values = row.values; // 1-based; values[0] is undefined by design
    const width = values.length - 1; // number of columns actually present
    const out = [];
    for (let c = 1; c <= width; c++) {
        out.push(cellValue(values[c]));
    }
    return out;
}

// Turn one ExcelJS worksheet into a squared-off array-of-arrays, matching the
// SheetJS `sheet_to_json({header:1, defval:'', raw:true})` shape.
function worksheetToRows(ws) {
    const rows = [];
    let maxCols = 0;
    ws.eachRow({ includeEmpty: true }, (row) => {
        const arr = rowToArray(row);
        if (arr.length > maxCols) maxCols = arr.length;
        rows.push(arr);
    });

    // Pad every row to the widest row so column indexes are stable across the
    // whole sheet (mirrors SheetJS, which squares off the range).
    for (const r of rows) {
        while (r.length < maxCols) r.push('');
    }

    // ExcelJS emits trailing empty rows for some files; trim wholly-blank rows
    // from the end so callers that iterate `rows.length` don't process ghosts.
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) {
        rows.pop();
    }

    return rows;
}

async function loadWorkbook(buffer, csv) {
    const wb = new ExcelJS.Workbook();
    if (csv) {
        // ExcelJS CSV reader takes a stream; wrap the buffer.
        const { Readable } = require('stream');
        await wb.csv.read(Readable.from(buffer));
    } else {
        await wb.xlsx.load(buffer);
    }
    return wb;
}

/**
 * Read the first worksheet of an .xlsx/.xls/.csv buffer into an array-of-arrays.
 * Drop-in replacement for `sheet_to_json(sheet, { header:1, defval:'', raw:true })`.
 *
 * @param {Buffer} buffer   raw file bytes (e.g. multer memoryStorage req.file.buffer)
 * @param {object} [opts]
 * @param {boolean} [opts.csv=false]  parse as CSV instead of XLSX
 * @returns {Promise<Array<Array<string|number|Date>>>}
 */
async function sheetToRows(buffer, { csv = false } = {}) {
    const wb = await loadWorkbook(buffer, csv);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('Spreadsheet contains no sheets.');
    return worksheetToRows(ws);
}

/**
 * Read EVERY worksheet of an .xlsx buffer, returning one array-of-arrays per
 * sheet in workbook order. Used where the data sheet may not be the first one
 * (e.g. Sandata exports with a cover sheet).
 *
 * @param {Buffer} buffer
 * @returns {Promise<Array<Array<Array<string|number|Date>>>>}
 */
async function sheetsToRows(buffer) {
    const wb = await loadWorkbook(buffer, false);
    if (!wb.worksheets.length) throw new Error('Spreadsheet contains no sheets.');
    return wb.worksheets.map(worksheetToRows);
}

/**
 * Read every worksheet, returning `{ name, rows }` per sheet so callers can pick
 * a sheet by name (e.g. payroll prefers a sheet named "Visits" or "Result").
 *
 * @param {Buffer} buffer
 * @returns {Promise<Array<{name:string, rows:Array<Array<string|number|Date>>}>>}
 */
async function namedSheetsToRows(buffer) {
    const wb = await loadWorkbook(buffer, false);
    if (!wb.worksheets.length) throw new Error('Spreadsheet contains no sheets.');
    return wb.worksheets.map((ws) => ({ name: ws.name, rows: worksheetToRows(ws) }));
}

/**
 * Build an .xlsx file buffer from an array-of-arrays (header row + data rows).
 * Drop-in replacement for the aoa_to_sheet → book_new → write pipeline.
 *
 * @param {Array<Array<*>>} aoa
 * @param {object} [opts]
 * @param {string}   [opts.sheetName='Sheet1']
 * @param {number[]} [opts.colWidths]  character widths per column
 * @returns {Promise<Buffer>}
 */
async function rowsToXlsxBuffer(aoa, { sheetName = 'Sheet1', colWidths } = {}) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    for (const row of aoa) ws.addRow(row);
    if (Array.isArray(colWidths)) {
        ws.columns.forEach((col, i) => {
            if (colWidths[i] != null) col.width = colWidths[i];
        });
    }
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out);
}

/**
 * Read the first worksheet of an .xlsx file ON DISK into header:1 rows.
 * Convenience for CLI import scripts that take a path, not an upload buffer.
 *
 * @param {string} filePath
 * @returns {Promise<Array<Array<string|number|Date>>>}
 */
async function readRowsFromFile(filePath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('Spreadsheet contains no sheets.');
    return worksheetToRows(ws);
}

/**
 * Read a worksheet as an array of objects keyed by the header row — the shape
 * `sheet_to_json(sheet, { defval:'' })` produced (no `header:1`). Accepts a
 * Buffer or a file path. Picks `sheetName` if given, else the first sheet.
 *
 * @param {Buffer|string} bufferOrPath
 * @param {object} [opts]
 * @param {string} [opts.sheetName]  preferred sheet; falls back to the first
 * @returns {Promise<Array<Object>>}
 */
async function readSheetObjects(bufferOrPath, { sheetName } = {}) {
    const wb = new ExcelJS.Workbook();
    if (Buffer.isBuffer(bufferOrPath)) {
        await wb.xlsx.load(bufferOrPath);
    } else {
        await wb.xlsx.readFile(bufferOrPath);
    }
    const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
    if (!ws) throw new Error('Spreadsheet contains no sheets.');

    const rows = worksheetToRows(ws);
    if (!rows.length) return [];
    const headers = rows[0].map((h) => String(h == null ? '' : h));
    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const obj = {};
        for (let c = 0; c < headers.length; c++) {
            if (headers[c] === '') continue;
            obj[headers[c]] = rows[i][c] === undefined ? '' : rows[i][c];
        }
        out.push(obj);
    }
    return out;
}

/**
 * Write a multi-sheet .xlsx file to disk. For CLI/admin export scripts.
 * Drop-in for the aoa_to_sheet → book_append_sheet → writeFile pipeline.
 *
 * @param {string} filePath
 * @param {Array<{name:string, rows:Array<Array<*>>}>} sheets
 * @returns {Promise<void>}
 */
async function writeXlsxFile(filePath, sheets) {
    const wb = new ExcelJS.Workbook();
    for (const { name, rows } of sheets) {
        const ws = wb.addWorksheet(name);
        for (const row of rows) ws.addRow(row);
    }
    await wb.xlsx.writeFile(filePath);
}

module.exports = {
    sheetToRows,
    sheetsToRows,
    namedSheetsToRows,
    readRowsFromFile,
    readSheetObjects,
    rowsToXlsxBuffer,
    writeXlsxFile,
    cellValue,
    excelSerialToDate,
};
