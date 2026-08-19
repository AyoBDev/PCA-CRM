// One-time (idempotent) data migration: renames legacy onboardingStatus
// values to the canonical Employee Portal v3 lifecycle names, then backfills
// employees who already have saved onboarding data but are still sitting at
// invitation_pending into onboarding_in_progress.
//
// Legacy -> canonical:
//   invited   -> invitation_pending
//   submitted -> pending_review
//
// Backfill filter deliberately avoids `dob`: Employee.dob is a PHI-encrypted
// field (see server/src/lib/phiCrypto.js PHI_FIELDS.Employee), so comparing
// it via Prisma `where` (`{ not: '' }` / `{ not: null }`) does not reliably
// reflect "has data" once values are ciphertext. `address` is plain text and
// `onboardingDraft` is a JSON column — both are safe to filter on directly.
//
// Safe to run repeatedly: every step only touches rows still holding the old
// value, so a second run is a no-op.
const prisma = require('../src/lib/prisma');

async function run() {
    await prisma.employee.updateMany({
        where: { onboardingStatus: 'invited' },
        data: { onboardingStatus: 'invitation_pending' },
    });
    await prisma.employee.updateMany({
        where: { onboardingStatus: 'submitted' },
        data: { onboardingStatus: 'pending_review' },
    });

    // Backfill: employees still in invitation_pending who already saved
    // onboarding data (address filled in, or an onboardingDraft exists)
    // should reflect that they're mid-onboarding, not merely invited.
    const started = await prisma.employee.findMany({
        where: {
            onboardingStatus: 'invitation_pending',
            OR: [
                { address: { not: '' } },
                { onboardingDraft: { not: null } },
            ],
        },
        select: { id: true },
    });
    if (started.length) {
        await prisma.employee.updateMany({
            where: { id: { in: started.map((e) => e.id) } },
            data: { onboardingStatus: 'onboarding_in_progress' },
        });
    }

    return { renamed: true, backfilled: started.length };
}

if (require.main === module) {
    run()
        .then((result) => {
            console.log('lifecycle status migration complete', result);
            process.exit(0);
        })
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}

module.exports = { run };
