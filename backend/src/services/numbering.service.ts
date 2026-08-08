type SequenceOptions = {
  sequenceKey?: string;
  where?: Record<string, unknown>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePrefix(value: unknown) {
  return text(value).replace(/[-\s]+$/g, "") || "DOC";
}

function normalizePadding(value: unknown, fallback = 6) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function sequenceSettingKey(modelName: string, fieldName: string, options?: SequenceOptions) {
  const raw = text(options?.sequenceKey) || `${modelName}.${fieldName}`;
  const safe = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return `numbering.sequence.${safe}`;
}

function numericSuffix(value: unknown) {
  const match = text(value).match(/(\d+)$/);
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

async function seedNextNumber(
  tx: any,
  modelName: string,
  fieldName: string,
  businessId: string,
  options?: SequenceOptions
) {
  const model = tx?.[modelName];
  if (!model?.findMany) throw new Error(`Numbering model is unavailable: ${modelName}`);
  const rows = await model.findMany({
    where: { businessId, ...(options?.where || {}) },
    select: { [fieldName]: true },
  });
  let highest = 0;
  for (const row of rows) highest = Math.max(highest, numericSuffix(row?.[fieldName]));
  return highest + 1;
}

/**
 * Allocates a tenant-scoped entity number inside the caller's transaction.
 *
 * The business row is updated first so PostgreSQL serializes every allocator
 * transaction for the tenant without advisory locks. The durable next value is
 * stored in the existing AppSetting table under numbering.sequence.*. Existing
 * entity numbers are scanned only when a sequence is first initialized, so old
 * numbers are preserved while subsequent allocations remain O(1).
 */
export async function nextEntityNumber(
  tx: any,
  modelName: string,
  fieldName: string,
  businessId: string,
  prefix: string,
  padding = 6,
  options?: SequenceOptions
): Promise<string> {
  if (!businessId) throw new Error("Business is required for number allocation");
  if (!tx?.business?.update || !tx?.appSetting?.findUnique) throw new Error("Number allocation requires a Prisma transaction client");

  const normalizedPrefix = normalizePrefix(prefix);
  const normalizedPadding = normalizePadding(padding);
  const key = sequenceSettingKey(modelName, fieldName, options);

  // A row update obtains a normal PostgreSQL row lock until the surrounding
  // transaction commits. This works through the project's Prisma transaction
  // proxy and avoids the advisory-lock incompatibility seen in production.
  await tx.business.update({ where: { id: businessId }, data: { updatedAt: new Date() } });

  const existing = await tx.appSetting.findUnique({ where: { businessId_key: { businessId, key } } });
  const stored = existing?.value && typeof existing.value === "object" && !Array.isArray(existing.value)
    ? existing.value as Record<string, unknown>
    : {};

  let nextNumber = Number(stored.nextNumber);
  if (!Number.isInteger(nextNumber) || nextNumber < 1) {
    nextNumber = await seedNextNumber(tx, modelName, fieldName, businessId, options);
  }

  const effectivePrefix = existing ? normalizePrefix(stored.prefix || normalizedPrefix) : normalizedPrefix;
  const effectivePadding = existing ? normalizePadding(stored.padding, normalizedPadding) : normalizedPadding;
  const value = {
    prefix: effectivePrefix,
    padding: effectivePadding,
    nextNumber: nextNumber + 1,
    lastAllocated: nextNumber,
    updatedAt: new Date().toISOString(),
  };

  await tx.appSetting.upsert({
    where: { businessId_key: { businessId, key } },
    create: { businessId, key, value },
    update: { value },
  });

  return `${effectivePrefix}-${String(nextNumber).padStart(effectivePadding, "0")}`;
}

export async function previewEntityNumber(
  tx: any,
  modelName: string,
  fieldName: string,
  businessId: string,
  prefix: string,
  padding = 6,
  options?: SequenceOptions
): Promise<{ preview: string; prefix: string; padding: number; nextNumber: number; settingKey: string }> {
  const normalizedPrefix = normalizePrefix(prefix);
  const normalizedPadding = normalizePadding(padding);
  const key = sequenceSettingKey(modelName, fieldName, options);
  const existing = await tx.appSetting.findUnique({ where: { businessId_key: { businessId, key } } });
  const stored = existing?.value && typeof existing.value === "object" && !Array.isArray(existing.value)
    ? existing.value as Record<string, unknown>
    : {};
  let nextNumber = Number(stored.nextNumber);
  if (!Number.isInteger(nextNumber) || nextNumber < 1) nextNumber = await seedNextNumber(tx, modelName, fieldName, businessId, options);
  const effectivePrefix = existing ? normalizePrefix(stored.prefix || normalizedPrefix) : normalizedPrefix;
  const effectivePadding = existing ? normalizePadding(stored.padding, normalizedPadding) : normalizedPadding;
  return {
    preview: `${effectivePrefix}-${String(nextNumber).padStart(effectivePadding, "0")}`,
    prefix: effectivePrefix,
    padding: effectivePadding,
    nextNumber,
    settingKey: key,
  };
}
