// PHI-at-rest crypto layer: write args for PHI models are encrypted before
// hitting the DB; query results are deep-walked and any ciphertext-formatted
// string is decrypted — including PHI arriving via nested includes.

const { encrypt } = require('../../services/encryptionService');
const { PHI_FIELDS, CIPHERTEXT_RE, encryptWriteArgs, decryptDeep } = require('../phiCrypto');

beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'd'.repeat(64);
});

describe('CIPHERTEXT_RE', () => {
    it('matches encryptionService output and rejects plaintext', () => {
        expect(CIPHERTEXT_RE.test(encrypt('12345678'))).toBe(true);
        expect(CIPHERTEXT_RE.test('12345678')).toBe(false);
        expect(CIPHERTEXT_RE.test('1990-01-05')).toBe(false);
        expect(CIPHERTEXT_RE.test('data:image/png;base64,abc')).toBe(false);
        expect(CIPHERTEXT_RE.test('')).toBe(false);
        // hex-ish but wrong shape
        expect(CIPHERTEXT_RE.test('abc:def:123')).toBe(false);
    });
});

describe('encryptWriteArgs', () => {
    it('encrypts PHI fields in create data and leaves others alone', () => {
        const args = { data: { clientName: 'John', medicaidId: '12345678901', notes: 'diabetic', phone: '555' } };
        encryptWriteArgs('Client', args);
        expect(CIPHERTEXT_RE.test(args.data.medicaidId)).toBe(true);
        expect(CIPHERTEXT_RE.test(args.data.notes)).toBe(true);
        expect(args.data.clientName).toBe('John');
        expect(args.data.phone).toBe('555');
    });

    it('handles upsert create/update shapes', () => {
        const args = {
            create: { medicaidId: 'A111' },
            update: { pcaNotes: 'prefers mornings' },
        };
        encryptWriteArgs('Client', args);
        expect(CIPHERTEXT_RE.test(args.create.medicaidId)).toBe(true);
        expect(CIPHERTEXT_RE.test(args.update.pcaNotes)).toBe(true);
    });

    it('handles createMany arrays', () => {
        const args = { data: [{ purpose: 'checkup' }, { purpose: 'ER visit' }] };
        encryptWriteArgs('HospitalVisit', args);
        expect(args.data.every(r => CIPHERTEXT_RE.test(r.purpose))).toBe(true);
    });

    it('never double-encrypts (idempotent on ciphertext)', () => {
        const once = encrypt('12345678901');
        const args = { data: { medicaidId: once } };
        encryptWriteArgs('Client', args);
        expect(args.data.medicaidId).toBe(once);
    });

    it('leaves empty strings and non-PHI models untouched', () => {
        const args = { data: { medicaidId: '', notes: '' } };
        encryptWriteArgs('Client', args);
        expect(args.data.medicaidId).toBe('');

        const other = { data: { notes: 'shift note' } };
        encryptWriteArgs('Shift', other);
        expect(other.data.notes).toBe('shift note');
    });
});

describe('decryptDeep', () => {
    it('decrypts ciphertext strings anywhere in a nested include-shaped result', () => {
        const result = {
            id: 1,
            weekStart: new Date('2026-07-12'),
            client: {
                id: 9,
                clientName: 'Mary',
                medicaidId: encrypt('12345678901'),
                dob: encrypt('1950-03-02'),
                hospitalVisits: [
                    { id: 3, purpose: encrypt('cardiology follow-up'), status: 'completed' },
                ],
            },
            entries: [{ id: 2, adlActivities: '{"Bathing":true}' }],
        };
        const out = decryptDeep(result);
        expect(out.client.medicaidId).toBe('12345678901');
        expect(out.client.dob).toBe('1950-03-02');
        expect(out.client.hospitalVisits[0].purpose).toBe('cardiology follow-up');
        expect(out.client.clientName).toBe('Mary');
        expect(out.entries[0].adlActivities).toBe('{"Bathing":true}');
        expect(out.weekStart).toBeInstanceOf(Date);
    });

    it('passes plaintext through untouched (mixed-state safety)', () => {
        const row = { medicaidId: '12345678901', notes: 'still plaintext' };
        expect(decryptDeep(row)).toEqual({ medicaidId: '12345678901', notes: 'still plaintext' });
    });

    it('returns a marker instead of throwing on corrupted ciphertext', () => {
        const corrupted = encrypt('secret').replace(/.$/, m => (m === '0' ? '1' : '0'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const out = decryptDeep({ notes: corrupted });
        expect(out.notes).toBe('[decryption failed]');
        spy.mockRestore();
    });

    it('handles scalars, null, arrays and Buffers', () => {
        expect(decryptDeep(null)).toBeNull();
        expect(decryptDeep(42)).toBe(42);
        expect(decryptDeep([encrypt('a'), 'b'])).toEqual(['a', 'b']);
        const buf = Buffer.from('pdf-bytes');
        expect(decryptDeep({ fileData: buf }).fileData).toBe(buf);
    });
});

describe('PHI_FIELDS', () => {
    it('covers the audited models and fields', () => {
        expect(PHI_FIELDS.Client).toEqual(expect.arrayContaining(['medicaidId', 'dob', 'notes', 'pcaNotes']));
        expect(PHI_FIELDS.Employee).toEqual(expect.arrayContaining(['dob', 'notes']));
        expect(PHI_FIELDS.HospitalVisit).toEqual(expect.arrayContaining(['providerName', 'location', 'purpose', 'notes']));
    });
});
