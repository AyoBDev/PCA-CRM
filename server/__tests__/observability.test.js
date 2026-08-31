// The observability layer MUST be a safe no-op when SENTRY_DSN is unset — that
// is the dev/test/default state, and any throw here would take down boot or the
// error handler. These tests pin that contract without touching a real DSN.

describe('observability (no DSN)', () => {
    let obs;
    beforeEach(() => {
        jest.resetModules();
        delete process.env.SENTRY_DSN;
        obs = require('../src/lib/observability');
    });

    it('initObservability returns false and reports disabled when no DSN', () => {
        expect(obs.initObservability()).toBe(false);
        expect(obs.isEnabled()).toBe(false);
    });

    it('setRequestUser is a harmless no-op with no DSN', () => {
        obs.initObservability();
        expect(() => obs.setRequestUser({ user: { id: 1, role: 'admin' } })).not.toThrow();
        expect(() => obs.setRequestUser(undefined)).not.toThrow();
        expect(() => obs.setRequestUser({})).not.toThrow();
    });

    it('captureError is a harmless no-op with no DSN', () => {
        obs.initObservability();
        expect(() => obs.captureError(new Error('boom'))).not.toThrow();
        expect(() => obs.captureError(new Error('boom'), { extra: 1 })).not.toThrow();
    });

    it('setupExpressErrorHandler does not throw on a minimal app object', () => {
        obs.initObservability();
        // Sentry.setupExpressErrorHandler(app) registers middleware via app.use.
        const app = { use: jest.fn() };
        expect(() => obs.setupExpressErrorHandler(app)).not.toThrow();
    });

    it('flush resolves immediately when disabled', async () => {
        obs.initObservability();
        await expect(obs.flush(10)).resolves.toBeUndefined();
    });
});
