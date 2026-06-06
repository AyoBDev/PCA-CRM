const { encrypt, decrypt, maskSSN, maskEIN } = require('../encryptionService');

describe('encryptionService', () => {
    beforeAll(() => {
        process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
    });

    test('encrypts and decrypts a string', () => {
        const plain = '123-45-6789';
        const encrypted = encrypt(plain);
        expect(encrypted).not.toBe(plain);
        expect(encrypted).toContain(':'); // iv:authTag:ciphertext
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(plain);
    });

    test('returns empty string for empty input', () => {
        expect(encrypt('')).toBe('');
        expect(decrypt('')).toBe('');
    });

    test('maskSSN shows last 4', () => {
        expect(maskSSN('123-45-6789')).toBe('***-**-6789');
    });

    test('maskSSN handles empty', () => {
        expect(maskSSN('')).toBe('');
    });

    test('maskEIN shows last 4', () => {
        expect(maskEIN('12-3456789')).toBe('**-***6789');
    });
});
