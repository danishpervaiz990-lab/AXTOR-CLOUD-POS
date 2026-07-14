import type { DocumentType, Prisma, PrismaClient } from '@prisma/client';

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export function getDocumentPrefix(documentType: DocumentType): string {
  if (documentType === 'INVOICE') return 'INV';
  if (documentType === 'QUOTATION') return 'QUO';
  if (documentType === 'DELIVERY_NOTE') return 'DN';
  return 'DOC';
}

/**
 * Allocates a document number inside the caller's database transaction.
 * PostgreSQL advisory transaction locking prevents two concurrent requests
 * from receiving the same counter value, including the global (null branch) case.
 */
export async function getNextDocumentNumber(
  prismaClient: PrismaClientOrTransaction,
  businessId: string,
  branchId: string | null,
  documentType: DocumentType
): Promise<string> {
  const defaultPrefix = getDocumentPrefix(documentType);
  const lockKey = `axtor:document-counter:${businessId}:${branchId || 'global'}:${documentType}`;

  await (prismaClient as any).$queryRawUnsafe(
    'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
    lockKey
  );

  const existingCounter = await (prismaClient as any).documentCounter.findFirst({
    where: { businessId, branchId, documentType }
  });

  if (!existingCounter) {
    const firstNumber = 1;
    const padding = 6;
    await (prismaClient as any).documentCounter.create({
      data: {
        businessId,
        branchId,
        documentType,
        prefix: defaultPrefix,
        nextNumber: firstNumber + 1,
        padding
      }
    });
    return `${defaultPrefix}-${String(firstNumber).padStart(padding, '0')}`;
  }

  const updatedCounter = await (prismaClient as any).documentCounter.update({
    where: { id: existingCounter.id },
    data: {
      nextNumber: { increment: 1 },
      prefix: existingCounter.prefix || defaultPrefix
    }
  });

  const allocatedNumber = Number(updatedCounter.nextNumber) - 1;
  const padding = Number(updatedCounter.padding || 6);
  const prefix = updatedCounter.prefix || defaultPrefix;
  return `${prefix}-${String(allocatedNumber).padStart(padding, '0')}`;
}
