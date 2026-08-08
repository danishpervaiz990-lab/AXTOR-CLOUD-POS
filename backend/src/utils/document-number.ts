import type { DocumentType, Prisma, PrismaClient } from '@prisma/client';
import { nextEntityNumber, previewEntityNumber } from '../services/numbering.service.js';

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export function getDocumentPrefix(documentType: DocumentType): string {
  if (documentType === 'INVOICE') return 'INV';
  if (documentType === 'QUOTATION') return 'QUO';
  if (documentType === 'DELIVERY_NOTE') return 'DN';
  return 'DOC';
}

async function numberSettings(prismaClient: PrismaClientOrTransaction, businessId: string, documentType: DocumentType) {
  const counter = await (prismaClient as any).documentCounter.findFirst({
    where: { businessId, branchId: null, documentType }
  });
  return {
    prefix: String(counter?.prefix || getDocumentPrefix(documentType)).replace(/[-\s]+$/g, ''),
    padding: Math.max(1, Math.min(12, Number(counter?.padding || 6))),
  };
}

export async function previewDocumentNumber(
  prismaClient: PrismaClientOrTransaction,
  businessId: string,
  documentType: DocumentType
): Promise<{ preview: string; prefix: string; nextNumber: number }> {
  const settings = await numberSettings(prismaClient, businessId, documentType);
  const result = await previewEntityNumber(
    prismaClient as any,
    'salesDocument',
    'documentNo',
    businessId,
    settings.prefix,
    settings.padding,
    { sequenceKey: `sales.${documentType}`, where: { documentType } }
  );
  return { preview: result.preview, prefix: result.prefix, nextNumber: result.nextNumber };
}

/**
 * Allocates the official invoice / quotation / delivery-note number inside the
 * caller's database transaction. Allocation is serialized by the tenant row
 * lock in nextEntityNumber(), so concurrent requests cannot receive the same
 * sequence value. Existing DocumentCounter prefixes/padding are still honored.
 */
export async function getNextDocumentNumber(
  prismaClient: PrismaClientOrTransaction,
  businessId: string,
  _branchId: string | null,
  documentType: DocumentType
): Promise<string> {
  const settings = await numberSettings(prismaClient, businessId, documentType);
  const allocated = await nextEntityNumber(
    prismaClient as any,
    'salesDocument',
    'documentNo',
    businessId,
    settings.prefix,
    settings.padding,
    { sequenceKey: `sales.${documentType}`, where: { documentType } }
  );

  // Keep the legacy counter's display value synchronized for existing settings
  // screens. It is no longer the concurrency primitive.
  const numeric = Number(allocated.match(/(\d+)$/)?.[1] || 0);
  const counter = await (prismaClient as any).documentCounter.findFirst({ where: { businessId, branchId: null, documentType } });
  if (counter) {
    await (prismaClient as any).documentCounter.update({
      where: { id: counter.id },
      data: { prefix: settings.prefix, padding: settings.padding, nextNumber: Math.max(Number(counter.nextNumber || 1), numeric + 1) }
    });
  } else {
    await (prismaClient as any).documentCounter.create({
      data: { businessId, branchId: null, documentType, prefix: settings.prefix, padding: settings.padding, nextNumber: numeric + 1 }
    });
  }
  return allocated;
}
