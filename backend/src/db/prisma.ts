import { AsyncLocalStorage } from 'node:async_hooks';
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

const client = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  transactionOptions: {
    maxWait: transactionMaxWait,
    timeout: transactionTimeout,
  },
});

const transactionContext = new AsyncLocalStorage<any>();

function bindValue(value: any, receiver: any) {
  return typeof value === 'function' ? value.bind(receiver) : value;
}

/**
 * Prisma does not natively join nested interactive transactions. Grocery sale
 * posting needs the shared sales engine and Grocery accounting/COGS hooks to
 * commit or roll back as one business transaction. This proxy keeps the public
 * PrismaClient contract while reusing the current interactive transaction when
 * a nested callback transaction is requested in the same async call chain.
 */
export const prisma = new Proxy(client as any, {
  get(target, property, receiver) {
    if (property === '$transaction') {
      return async (operation: any, ...args: any[]) => {
        const active = transactionContext.getStore();
        if (active && typeof operation === 'function') {
          return operation(active);
        }
        if (typeof operation === 'function') {
          return target.$transaction(
            (tx: any) => transactionContext.run(tx, () => operation(tx)),
            ...args,
          );
        }
        return target.$transaction(operation, ...args);
      };
    }

    const active = transactionContext.getStore();
    if (active && property in active) {
      return bindValue(active[property], active);
    }
    return bindValue(Reflect.get(target, property, receiver), target);
  },
}) as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}
