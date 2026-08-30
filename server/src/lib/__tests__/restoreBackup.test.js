// Unit tests for the pure helpers in restoreBackup. The full DB round-trip is
// covered by src/__integration__/backupRoundTrip.itest.js.

const { toSnake, projectRow } = require('../restoreBackup');

describe('toSnake', () => {
    it('inverts camelCase back to snake_case column names', () => {
        expect(toSnake('clientName')).toBe('client_name');
        expect(toSnake('agencyId')).toBe('agency_id');
        expect(toSnake('createdAt')).toBe('created_at');
        // Already snake / single word stays put.
        expect(toSnake('status')).toBe('status');
        expect(toSnake('client_status')).toBe('client_status');
    });
});

describe('projectRow', () => {
    const info = {
        columns: new Set(['client_name', 'agency_id', 'created_at', 'permissions']),
        tsColumns: new Set(['created_at']),
        jsonColumns: new Set(['permissions']),
    };

    it('maps camelCase keys to real columns and drops unknown keys', () => {
        const { cols } = projectRow(
            { clientName: 'A', agencyId: 1, goneField: 'x' },
            info
        );
        expect(cols).toEqual(['client_name', 'agency_id']);
    });

    it('coerces timestamp columns to Date', () => {
        const { cols, vals } = projectRow({ createdAt: '2026-08-28T00:00:00.000Z' }, info);
        expect(cols).toEqual(['created_at']);
        expect(vals[0]).toBeInstanceOf(Date);
    });

    it('stringifies json/jsonb values and flags them for ::jsonb casting', () => {
        const { cols, vals, jsonFlags } = projectRow({ permissions: ['a', 'b'] }, info);
        expect(cols).toEqual(['permissions']);
        expect(vals[0]).toBe('["a","b"]');
        expect(jsonFlags[0]).toBe(true);
    });

    it('passes an already-stringified json value through unchanged', () => {
        const { vals } = projectRow({ permissions: '{"x":1}' }, info);
        expect(vals[0]).toBe('{"x":1}');
    });

    it('leaves plain scalars untouched and un-flagged', () => {
        const { vals, jsonFlags } = projectRow({ clientName: 'Jane' }, info);
        expect(vals[0]).toBe('Jane');
        expect(jsonFlags[0]).toBe(false);
    });
});
