const express = require('express');
const request = require('supertest');
const { heavyOperationLimiter, uploadParseLimiter, keyByUserOrIp } = require('../rateLimiters');

// Build a tiny app that mounts a limiter on a route and stamps a fake user, so
// we can drive the limiter without the whole auth stack.
function appWith(limiter, { user } = {}) {
    const app = express();
    app.set('trust proxy', 1);
    app.use((req, _res, next) => { if (user !== undefined) req.user = user; next(); });
    app.get('/x', limiter, (_req, res) => res.json({ ok: true }));
    return app;
}

describe('keyByUserOrIp', () => {
    it('keys on the authenticated user id when present', () => {
        const key = keyByUserOrIp({ user: { id: 42 }, ip: '1.2.3.4' });
        expect(key).toBe('user:42');
    });

    it('falls back to IP when there is no user', () => {
        const key = keyByUserOrIp({ ip: '9.9.9.9' });
        expect(key).toBe('ip:9.9.9.9');
    });
});

describe('heavyOperationLimiter', () => {
    it('allows requests up to the limit, then returns 429', async () => {
        const app = appWith(heavyOperationLimiter, { user: { id: 1 } });
        // The limiter is configured with max=30/15min. Fire 30 → all 200, 31st → 429.
        let last;
        for (let i = 0; i < 30; i++) {
            last = await request(app).get('/x');
            expect(last.status).toBe(200);
        }
        const over = await request(app).get('/x');
        expect(over.status).toBe(429);
        expect(over.body.error).toMatch(/too many/i);
    });

    it('scopes the limit per user (one user hitting the cap does not block another)', async () => {
        const appA = appWith(heavyOperationLimiter, { user: { id: 100 } });
        // Exhaust user 100.
        for (let i = 0; i < 30; i++) await request(appA).get('/x');
        expect((await request(appA).get('/x')).status).toBe(429);

        // A different user id on a fresh app instance is unaffected.
        const appB = appWith(heavyOperationLimiter, { user: { id: 200 } });
        expect((await request(appB).get('/x')).status).toBe(200);
    });
});

describe('uploadParseLimiter', () => {
    it('is stricter than the heavy limiter (max 10) and 429s past it', async () => {
        const app = appWith(uploadParseLimiter, { user: { id: 5 } });
        for (let i = 0; i < 10; i++) {
            expect((await request(app).get('/x')).status).toBe(200);
        }
        expect((await request(app).get('/x')).status).toBe(429);
    });
});
