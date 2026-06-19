import type { DocumentType, Prisma, PrismaClient } from '@prisma/client';

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export function getDocumentPrefix(documentType: DocumentType): string {
  if (documentType === 'INVOICE') {
    return 'INV';
  }

  if (documentType === 'QUOTATION') {
    return 'QUO';
  }

  if (documentType === 'DELIVERY_NOTE') {
    return 'DN';
  }

  return 'DOC';
}

export async function getNextDocumentNumber(
  prismaClient: PrismaClientOrTransaction,
  businessId: string,
  branchId: string | null,
  documentType: DocumentType
): Promise<string> {
  const defaultPrefix = getDocumentPrefix(documentType);

  const existingCounter = await prismaClient.documentCounter.findFirst({
    where: {
      businessId,
      branchId,
      documentType
    }
  });

  if (!existingCounter) {
    const firstNumber = 1;
    const padding = 6;

    await prismaClient.documentCounter.create({
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

  const currentNumber = existingCounter.nextNumber;
  const padding = existingCounter.padding || 6;
  const prefix = existingCounter.prefix || defaultPrefix;

  await prismaClient.documentCounter.update({
    where: {
      id: existingCounter.id
    },
    data: {
      nextNumber: currentNumber + 1,
      prefix
    }
  });

  return `${prefix}-${String(currentNumber).padStart(padding, '0')}`;
}
