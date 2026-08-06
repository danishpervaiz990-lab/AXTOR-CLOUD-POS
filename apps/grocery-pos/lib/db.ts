import { PrismaClient } from "@prisma/client";
import { getServerEnvironment } from "@/lib/env";

type PrismaGlobal = typeof globalThis & {
  groceryPrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export function getDatabase(): PrismaClient {
  if (prismaGlobal.groceryPrisma) {
    return prismaGlobal.groceryPrisma;
  }

  const environment = getServerEnvironment();
  const client = new PrismaClient({
    datasourceUrl: environment.GROCERY_DATABASE_URL,
    log: environment.GROCERY_ENVIRONMENT === "development" ? ["warn", "error"] : ["error"]
  });

  if (environment.GROCERY_ENVIRONMENT !== "production") {
    prismaGlobal.groceryPrisma = client;
  }

  return client;
}
