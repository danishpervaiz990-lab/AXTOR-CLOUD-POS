import type { DocumentType, Prisma, PrismaClient } from '@prisma/client';

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export function getDocumentPrefix(documentType: DocumentType): string {
  if (documentType === 'INVOICE') return 'INV';
  if (documentType === 'QUOTATION') return 'QUO';
  if (documentType === 'DELIVERY_NOTE') return 'DN';
  return 'DOC';
}

export async function previewDocumentNumber(
  prismaClient: PrismaClientOrTransaction,
  businessId: string,
  documentType: DocumentType
): Promise<{ preview: string; prefix: string; nextNumber: number }> {
  const counter = await (prismaClient as any).documentCounter.findFirst({
    where: { businessId, branchId: null, documentType }
  });
  const prefix = counter?.prefix || getDocumentPrefix(documentType);
  const padding = Number(counter?.padding || 6);
  const documents = await (prismaClient as any).salesDocument.findMany({
    where: { businessId, documentType },
    select: { documentNo: true }
  });
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numberPattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);
  const highestIssued = documents.reduce((highest: number, row: { documentNo: string }) => {
    const match = numberPattern.exec(String(row.documentNo || ""));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const nextNumber = Math.max(Number(counter?.nextNumber || 1), highestIssued + 1);
  return { preview: `${prefix}-${String(nextNumber).padStart(padding, "0")}`, prefix, nextNumber };
}

/**
 * Allocates a document number inside the caller's database transaction.
 * PostgreSQL advisory transaction locking prevents two concurrent requests
 * from receiving the same counter value, including the global (null branch) case.
 */
export async function getNextDocumentNumber(
  prismaClient: PrismaClientOrTransaction,
  businessId: string,
  _branchId: string | null,
  documentType: DocumentType
): Promise<string> {
  const defaultPrefix = getDocumentPrefix(documentType);
  // SalesDocument is unique by (businessId, documentNo), not by branch.  A
  // branch-specific counter can therefore allocate the same INV-000001 as the
  // global counter.  Lock and allocate once per business/document type.
  const lockKey = `axtor:document-counter:${businessId}:${documentType}`;

  await (prismaClient as any).$queryRawUnsafe(
    'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
    lockKey
  );

  const existingCounter = await (prismaClient as any).documentCounter.findFirst({
    where: { businessId, branchId: null, documentType }
  });

  // Counter rows may predate this fix or may have been restored from a backup.
  // Reconcile the next value with saved documents while holding the same lock;
  // this prevents stale counters from recreating an already-issued number.
  const prefix = existingCounter?.prefix || defaultPrefix;
  const padding = Number(existingCounter?.padding || 6);
  const documents = await (prismaClient as any).salesDocument.findMany({
    where: { businessId, documentType },
    select: { documentNo: true }
  });
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numberPattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);
  const highestIssued = documents.reduce((highest: number, row: { documentNo: string }) => {
    const match = numberPattern.exec(String(row.documentNo || ""));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const nextNumber = Math.max(Number(existingCounter?.nextNumber || 1), highestIssued + 1);

  if (!existingCounter) {
    await (prismaClient as any).documentCounter.create({
      data: {
        businessId,
        branchId: null,
        documentType,
        prefix,
        nextNumber: nextNumber + 1,
        padding
      }
    });
    return `${prefix}-${String(nextNumber).padStart(padding, '0')}`;
  }

  await (prismaClient as any).documentCounter.update({
    where: { id: existingCounter.id },
    data: {
      nextNumber: nextNumber + 1,
      prefix
    }
  });
  return `${prefix}-${String(nextNumber).padStart(padding, '0')}`;
}
