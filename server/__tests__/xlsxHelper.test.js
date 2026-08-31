const ExcelJS = require('exceljs');
const { sheetToRows, sheetsToRows, namedSheetsToRows, readRowsFromFile, readSheetObjects, rowsToXlsxBuffer, writeXlsxFile } = require('../src/lib/xlsxHelper');

// Build a real .xlsx buffer we can feed back through the reader. Using ExcelJS
// to *produce* the fixture keeps the test self-contained (no binary fixtures on
// disk) while still exercising a genuine OOXML file, not a hand-rolled mock.
async function makeXlsxBuffer(aoa, { sheetName = 'Sheet1' } = {}) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    for (const row of aoa) ws.addRow(row);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('sheetToRows — header:1 array-of-arrays contract', () => {
    it('returns each row as a positional array (like sheet_to_json{header:1})', async () => {
        const buf = await makeXlsxBuffer([
            ['Client', 'Medicaid', 'Insurance'],
            ['John Smith', '12345', 'Medicaid'],
        ]);
        const rows = await sheetToRows(buf);
        expect(rows[0]).toEqual(['Client', 'Medicaid', 'Insurance']);
        expect(rows[1]).toEqual(['John Smith', '12345', 'Medicaid']);
    });

    it('fills leading/interior blank cells with "" so column indexes stay aligned', async () => {
        // Row where col A and col C are populated but col B is empty. The old
        // parser (defval:'') kept the slot so row[2] stayed column C.
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('S');
        const r = ws.addRow([]);
        r.getCell(1).value = 'A';
        r.getCell(3).value = 'C';
        const buf = Buffer.from(await wb.xlsx.writeBuffer());

        const rows = await sheetToRows(buf);
        expect(rows[0][0]).toBe('A');
        expect(rows[0][1]).toBe(''); // the gap is preserved, not collapsed
        expect(rows[0][2]).toBe('C');
    });

    it('preserves numbers as numbers (raw), not strings', async () => {
        const buf = await makeXlsxBuffer([['Units'], [12], [0]]);
        const rows = await sheetToRows(buf);
        expect(rows[1][0]).toBe(12);
        expect(rows[2][0]).toBe(0);
    });

    it('returns real Date objects for date-typed cells', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('S');
        const row = ws.addRow(['label']);
        row.getCell(2).value = new Date('2026-06-14T00:00:00Z');
        const buf = Buffer.from(await wb.xlsx.writeBuffer());

        const rows = await sheetToRows(buf);
        expect(rows[0][1]).toBeInstanceOf(Date);
    });

    it('reads the first sheet when multiple exist', async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('First').addRow(['from first']);
        wb.addWorksheet('Second').addRow(['from second']);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        const rows = await sheetToRows(buf);
        expect(rows[0][0]).toBe('from first');
    });

    it('throws a clear error when the workbook has no sheets', async () => {
        const wb = new ExcelJS.Workbook();
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        await expect(sheetToRows(buf)).rejects.toThrow(/no sheets/i);
    });

    it('reads a real CSV buffer too (bulk-import accepts .csv)', async () => {
        const csv = Buffer.from('a,b,c\n1,2,3\n', 'utf8');
        const rows = await sheetToRows(csv, { csv: true });
        expect(rows[0]).toEqual(['a', 'b', 'c']);
        expect(rows[1]).toEqual([1, 2, 3]);
    });
});

describe('sheetsToRows — every sheet as its own array-of-arrays', () => {
    it('returns one rows-array per worksheet, in workbook order', async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('One').addRow(['a', 'b']);
        const s2 = wb.addWorksheet('Two');
        s2.addRow(['CLIENT ID', 'CLIENT MEDICAID ID']);
        s2.addRow([123, 'M1']);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());

        const sheets = await sheetsToRows(buf);
        expect(sheets).toHaveLength(2);
        expect(sheets[0][0]).toEqual(['a', 'b']);
        expect(sheets[1][0]).toEqual(['CLIENT ID', 'CLIENT MEDICAID ID']);
        expect(sheets[1][1]).toEqual([123, 'M1']);
    });
});

describe('namedSheetsToRows — sheet name + rows, for name-based sheet picking', () => {
    it('returns {name, rows} per sheet so callers can find a sheet by name', async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('Cover').addRow(['ignore me']);
        wb.addWorksheet('Visits').addRow(['Client', 'Employee']);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());

        const sheets = await namedSheetsToRows(buf);
        expect(sheets.map((s) => s.name)).toEqual(['Cover', 'Visits']);
        const visits = sheets.find((s) => /^visits$/i.test(s.name));
        expect(visits.rows[0]).toEqual(['Client', 'Employee']);
    });
});

describe('writeXlsxFile — filesystem export', () => {
    it('writes a real .xlsx file that reads back correctly', async () => {
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        const out = path.join(os.tmpdir(), `xlsxHelper-test-${Date.now()}.xlsx`);
        await writeXlsxFile(out, [
            { name: 'Review', rows: [['h1', 'h2'], ['v1', 'v2']] },
            { name: 'Choices', rows: [['x']] },
        ]);
        expect(fs.existsSync(out)).toBe(true);
        const sheets = await sheetsToRows(fs.readFileSync(out));
        expect(sheets[0][0]).toEqual(['h1', 'h2']);
        expect(sheets[1][0]).toEqual(['x']);
        fs.unlinkSync(out);
    });
});

describe('readRowsFromFile — path-based reader for CLI scripts', () => {
    it('reads header:1 rows from a file on disk', async () => {
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        const p = path.join(os.tmpdir(), `readRows-${Date.now()}.xlsx`);
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('S').addRow(['x', 'y']);
        await wb.xlsx.writeFile(p);

        const rows = await readRowsFromFile(p);
        expect(rows[0]).toEqual(['x', 'y']);
        fs.unlinkSync(p);
    });
});

describe('readSheetObjects — header-keyed row objects', () => {
    it('maps each data row to an object keyed by the header row', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Review');
        ws.addRow(['group_key', 'Owner decision', 'Correct ID']);
        ws.addRow(['g1', 'keep', 'ID-9']);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());

        const objs = await readSheetObjects(buf, { sheetName: 'Review' });
        expect(objs).toEqual([{ group_key: 'g1', 'Owner decision': 'keep', 'Correct ID': 'ID-9' }]);
    });

    it('falls back to the first sheet when the named sheet is absent', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Data');
        ws.addRow(['a']);
        ws.addRow(['1']);      // authored as a string cell → stays a string
        const buf = Buffer.from(await wb.xlsx.writeBuffer());

        const objs = await readSheetObjects(buf, { sheetName: 'Nope' });
        expect(objs).toEqual([{ a: '1' }]);
    });
});

describe('rowsToXlsxBuffer — export contract', () => {
    it('produces a readable workbook with the given rows and sheet name', async () => {
        const aoa = [
            ['Client', 'Units'],
            ['John', 5],
            ['', ''],
        ];
        const buf = await rowsToXlsxBuffer(aoa, {
            sheetName: 'Payroll',
            colWidths: [30, 12],
        });
        // Round-trip: read it back and confirm structure survived.
        const rows = await sheetToRows(buf);
        expect(rows[0]).toEqual(['Client', 'Units']);
        expect(rows[1]).toEqual(['John', 5]);
    });
});
