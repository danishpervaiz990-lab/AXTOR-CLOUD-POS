import type { DocumentType, Prisma, PrismaClient } from '@prisma/client';
import { nextEntityNumber, previewEntityNumber } from '../services/numbering.service.js';

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export function getDocumentPrefix(documentType: DocumentType): string {
  if (documentType === 'INVOICE') return 'INV';
  if (documentType === 'QUOTATION') return 'QUO';
  if (documentType === 'DELIVERY_NOTE') return 'DN';
  return 'DOC';
}

function sequenceKeyForDocumentType(documentType: DocumentType): string {
  if (documentType === 'INVOICE') return 'grocery.invoice';
  if (documentType === 'QUOTATION') return 'grocery.quotation';
  if (documentType === 'DELIVERY_NOTE') return 'grocery.delivery_note';
  return `grocery.${String(documentType).toLowerCase()}`;
}

async function numberSettings(prismaClient: PrismaClientOrTransaction, businessId: string, documentType: DocumentType) {
  const sequenceKey = sequenceKeyForDocumentType(documentType);
  const settingKey = `numbering.sequence.${sequenceKey}`;
  const [setting, counter] = await Promise.all([
    (prismaClient as any).appSetting.findUnique({ where: { businessId_key: { businessId, key: settingKey } } }),
    (prismaClient as any).documentCounter.findFirst({ where: { businessId, branchId: null, documentType } }),
  ]);
  const value = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value) ? setting.value as Record<string, unknown> : {};
  const prefix = String(value.prefix || counter?.prefix || getDocumentPrefix(documentType)).replace(/[-\s]+$/g, '');
  const rawPadding = Number(value.padding ?? counter?.padding ?? 6);
  const padding = Number.isInteger(rawPadding) ? Math.max(1, Math.min(12, rawPadding)) : 6;
  return { prefix, padding, sequenceKey };
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
    { sequenceKey: settings.sequenceKey, where: { documentType } }
  );
  return { preview: result.preview, prefix: result.prefix, nextNumber: result.nextNumber };
}

/**
 * Allocates the official invoice / quotation / delivery-note number inside the
 * caller's database transaction. The sequence key is intentionally identical
 * to Grocery Settings -> Numbering so a saved tenant prefix/padding is the one
 * used by the next real document. Allocation is serialized by the tenant row
 * lock in nextEntityNumber().
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
    { sequenceKey: settings.sequenceKey, where: { documentType } }
  );

  // Keep the legacy counter's display value synchronized for older settings
  // screens. AppSetting remains the concurrency-safe source of the next value.
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
