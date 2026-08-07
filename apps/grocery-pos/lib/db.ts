import type { PrismaClient } from "@prisma/client";

/**
 * Transitional compile-time compatibility only.
 *
 * The Grocery frontend no longer owns or opens a PostgreSQL connection. All
 * production reads/writes must go through the existing shared AXTOR backend.
 * Any remaining legacy caller that reaches this function is a migration bug
 * and must fail closed instead of creating a second source of truth.
 */
export function getDatabase(): PrismaClient {
  throw new Error("LOCAL_GROCERY_DATABASE_DISABLED_USE_SHARED_BACKEND");
}
