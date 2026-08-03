import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error'] });
const requiredColumns = [
  'id', 'name', 'slug', 'status', 'country', 'timezone', 'currency',
  'subscription_plan', 'subscription_status', 'trial_ends_at',
  'default_language', 'date_format', 'number_locale', 'tax_label',
  'onboarding_state', 'onboarding_step', 'onboarding_completed_at',
  'maintenance_mode', 'created_at', 'updated_at',
];
const requiredBusinessStatuses = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'];
const requiredOnboardingStates = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];

try {
  const columns = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'businesses'
  `;
  const columnNames = new Set(columns.map((row) => String(row.column_name)));
  const missingColumns = requiredColumns.filter((name) => !columnNames.has(name));

  const enumRows = await prisma.$queryRaw`
    SELECT t.typname AS type_name, e.enumlabel AS enum_value
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ('BusinessStatus', 'OnboardingState')
  `;
  const valuesByType = new Map();
  for (const row of enumRows) {
    const name = String(row.type_name);
    const values = valuesByType.get(name) || new Set();
    values.add(String(row.enum_value));
    valuesByType.set(name, values);
  }
  const missingBusinessStatuses = requiredBusinessStatuses.filter((value) => !valuesByType.get('BusinessStatus')?.has(value));
  const missingOnboardingStates = requiredOnboardingStates.filter((value) => !valuesByType.get('OnboardingState')?.has(value));

  if (missingColumns.length || missingBusinessStatuses.length || missingOnboardingStates.length) {
    console.error('Production Business schema verification failed', {
      missingColumns,
      missingBusinessStatuses,
      missingOnboardingStates,
    });
    process.exitCode = 1;
  } else {
    console.log('Production Business schema verification passed.');
  }
} finally {
  await prisma.$disconnect();
}
