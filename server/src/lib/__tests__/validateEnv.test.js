// validateEnv() is the boot-time guard that stops a deploy from running
// without an encryption key and silently storing PHI in plaintext.

const { validateEnv, isHex64 } = require('../validateEnv');

const KEY = 'a'.repeat(64);

describe('isHex64', () => {
    it('accepts exactly 64 hex chars', () => {
        expect(isHex64(KEY)).toBe(true);
        expect(isHex64('AbCdEf' + '0'.repeat(58))).toBe(true);
    });
    it('rejects wrong length or non-hex', () => {
        expect(isHex64('a'.repeat(63))).toBe(false);
        expect(isHex64('a'.repeat(65))).toBe(false);
        expect(isHex64('z'.repeat(64))).toBe(false);
        expect(isHex64('')).toBe(false);
        expect(isHex64(undefined)).toBe(false);
    });
});

describe('validateEnv', () => {
    const OLD = { ...process.env };
    let exitSpy, errSpy, warnSpy;

    beforeEach(() => {
        delete process.env.ENCRYPTION_KEY;
        delete process.env.INTEGRITY_KEY;
        delete process.env.ALLOW_PLAINTEXT_PHI;
        exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
        errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        process.env = { ...OLD };
        exitSpy.mockRestore(); errSpy.mockRestore(); warnSpy.mockRestore();
    });

    it('exits when ENCRYPTION_KEY is missing and plaintext is not allowed', () => {
        expect(() => validateEnv()).toThrow('process.exit');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits when ENCRYPTION_KEY is malformed', () => {
        process.env.ENCRYPTION_KEY = 'too-short';
        expect(() => validateEnv()).toThrow('process.exit');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('passes with a valid ENCRYPTION_KEY', () => {
        process.env.ENCRYPTION_KEY = KEY;
        expect(() => validateEnv()).not.toThrow();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits when INTEGRITY_KEY is set but malformed, even with a valid ENCRYPTION_KEY', () => {
        process.env.ENCRYPTION_KEY = KEY;
        process.env.INTEGRITY_KEY = 'nope';
        expect(() => validateEnv()).toThrow('process.exit');
    });

    it('allows a keyless boot ONLY when ALLOW_PLAINTEXT_PHI=true (with a warning)', () => {
        process.env.ALLOW_PLAINTEXT_PHI = 'true';
        expect(() => validateEnv()).not.toThrow();
        expect(exitSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
    });
});
