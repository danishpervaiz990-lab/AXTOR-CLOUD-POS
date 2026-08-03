-- Reconcile enum labels first. Prisma applies each migration directory as a
-- separate committed migration, so later column defaults can safely use values
-- added here on legacy production databases.

DO $$
BEGIN
  CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

DO $$
BEGIN
  CREATE TYPE "OnboardingState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "OnboardingState" ADD VALUE IF NOT EXISTS 'NOT_STARTED';
ALTER TYPE "OnboardingState" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "OnboardingState" ADD VALUE IF NOT EXISTS 'COMPLETED';
