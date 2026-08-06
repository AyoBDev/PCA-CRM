// Privacy guard: internal notes must never reach the caregiver.
//
// The employee notes timeline is an internal record used to see the pattern
// behind complaints and attendance. If a caregiver could read it, knowing their
// callouts are being tallied would change what they report — destroying the
// signal the record exists to capture. It is also the kind of material that
// belongs in a management conversation, not a self-service app screen.
//
// These tests assert the boundary at the route level rather than trusting that
// nobody wires it up later.

const employeeRoutes = require('../../../routes/employee');

function routePaths(router) {
    return router.stack
        .filter(l => l.route)
        .map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
}

describe('employee portal does not expose internal notes', () => {
    test('no notes route is mounted on the portal', () => {
        const paths = routePaths(employeeRoutes);

        expect(paths.some(p => /note/i.test(p))).toBe(false);
    });

    test('the profile endpoint selects an explicit allowlist that omits notes', () => {
        const src = require('fs').readFileSync(
            require.resolve('../profileController'), 'utf8',
        );

        // An allowlist is what keeps this safe: a bare findUnique would return
        // every column, including notes, the moment a field is added. Accept
        // either an inline `select: { ... }` or an extracted allowlist constant
        // referenced as `select: SOME_CONST` — both are explicit allowlists.
        expect(src).toMatch(/select:\s*(\{|[A-Z][A-Z0-9_]*)/);
        expect(src).not.toMatch(/notes:\s*true/);
        // And every findUnique/findMany on this route must go through a select
        // (never a bare query that would return all columns, incl. notes).
        expect(src).not.toMatch(/find(?:Unique|Many|First)\(\{\s*where:[^}]*\}\s*\)/);
    });

    test('the portal offers endpoint does not return callout reasons', () => {
        const src = require('fs').readFileSync(
            require.resolve('../offersController'), 'utf8',
        );

        // A caregiver being offered a shift has no need to know why the
        // previous caregiver dropped it.
        expect(src).not.toMatch(/calloutReason|callout\.reason/);
    });
});
