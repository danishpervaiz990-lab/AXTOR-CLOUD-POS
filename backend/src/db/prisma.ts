import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function positiveMilliseconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const transactionMaxWait = positiveMilliseconds(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS, 30_000);
const transactionTimeout = positiveMilliseconds(process.env.PRISMA_TRANSACTION_TIMEOUT_MS, 60_000);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  transactionOptions: {
    maxWait: transactionMaxWait,
    timeout: transactionTimeout,
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
