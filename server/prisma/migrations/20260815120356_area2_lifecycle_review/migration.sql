-- AlterTable
ALTER TABLE "employee_requirements" ADD COLUMN     "review_status" TEXT NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "onboarding_status" SET DEFAULT 'invitation_pending';

-- Rename legacy onboardingStatus values to canonical Area 2 names.
UPDATE "employees" SET "onboarding_status" = 'invitation_pending' WHERE "onboarding_status" = 'invited';
UPDATE "employees" SET "onboarding_status" = 'pending_review'     WHERE "onboarding_status" = 'submitted';
-- 'active' and 'changes_requested' are already canonical; no change.
