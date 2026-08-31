// Guard test: expensive endpoints MUST carry a rate limiter.
//
// Rate limiting on PDF/zip generation, receipt generation, and file-parsing
// uploads is a security control (see server/src/middleware/rateLimiters.js).
// It's easy to drop when editing a route line, so this test greps the route
// definitions and fails the build if any of these routes loses its limiter.
//
// Mirrors the prismaImportGuard test's approach: assert a rule over the source
// text rather than exercising every route at runtime.

const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, '..', 'routes', 'api.js');
const src = fs.readFileSync(apiPath, 'utf8');

// A route "line" is the full router.<verb>(...) call. Routes can span multiple
// lines, but in api.js each of these is a single line; match by a stable
// substring unique to the route, then require the appropriate limiter name on
// that same line.
const HEAVY = 'heavyOperationLimiter';
const UPLOAD = 'uploadParseLimiter';

// path-substring → which limiter must appear on that route's line
const EXPENSIVE_ROUTES = [
    // Heavy generation (PDF / zip / receipts)
    ["'/files/export'", HEAVY],
    ["'/timesheets/bulk-export-pdf'", HEAVY],
    ["'/timesheets/:id/export-pdf'", HEAVY],
    ["'/payroll/runs/:id/export'", HEAVY],
    ["'/employees/:employeeId/notes-timeline/export'", HEAVY],
    ["'/clients/:clientId/notes-timeline/export'", HEAVY],
    ["'/receipts/preview'", HEAVY],
    ["'/receipts/generate'", HEAVY],
    ["'/receipts/:id/pdf'", HEAVY],
    // File-parsing uploads
    ["'/clients/bulk-import'", UPLOAD],
    ["'/employees/bulk-import'", UPLOAD],
    ["'/sandata/preview'", UPLOAD],
];

describe('rate-limit guard: expensive endpoints keep their limiter', () => {
    const lines = src.split('\n');

    it.each(EXPENSIVE_ROUTES)('%s is rate-limited (%s)', (routeMarker, limiter) => {
        const line = lines.find((l) => l.includes(routeMarker) && l.includes('router.'));
        expect(line).toBeDefined(); // the route itself must still exist
        expect(line).toContain(limiter);
    });

    it('both limiters are imported into the router', () => {
        expect(src).toMatch(/require\(['"]\.\.\/middleware\/rateLimiters['"]\)/);
        expect(src).toContain(HEAVY);
        expect(src).toContain(UPLOAD);
    });
});
