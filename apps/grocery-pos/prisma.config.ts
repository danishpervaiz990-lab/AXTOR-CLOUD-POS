import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Transitional schema-generation config only.
 * Grocery production does not open this datasource; runtime persistence is
 * owned by the existing shared AXTOR backend and PostgreSQL service.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs"
  },
  datasource: {
    url: "postgresql://migration-compat.invalid/grocery"
  }
});
