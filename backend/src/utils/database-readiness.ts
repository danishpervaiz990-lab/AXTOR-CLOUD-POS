import { prisma } from "../db/prisma.js";

export type DatabaseFailureCategory =
  | "authentication_failed"
  | "database_unreachable"
  | "connection_timeout"
  | "connection_closed"
  | "schema_missing"
  | "query_failed";

export type SafeDatabaseFailure = {
  category: DatabaseFailureCategory;
  code: string | null;
  type: string;
};

export type DatabaseReadinessStage = "connection" | "schema" | "query";

export type DatabaseReadinessResult = {
  ok: boolean;
  stage: DatabaseReadinessStage;
  checks: {
    prismaConnection: boolean;
    postgresQuery: boolean;
    businessesTable: boolean;
  };
  businessCount: number | null;
  error: SafeDatabaseFailure | null;
};

export type DatabaseReadinessClient = {
  connection(): Promise<void>;
  businessesRelation(): Promise<string | null>;
  businessCount(): Promise<number>;
};

function safeErrorCode(error: unknown): string | null {
  const code = String((error as any)?.code || "").trim();
  return /^P\d{4}$/.test(code) ? code : null;
}

function safeErrorType(error: unknown): string {
  const name = String((error as any)?.name || (error as any)?.constructor?.name || "Error").trim();
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : "Error";
}

export function classifyDatabaseFailure(error: unknown): SafeDatabaseFailure {
  const code = safeErrorCode(error);
  const message = String((error as any)?.message || "").toLowerCase();
  let category: DatabaseFailureCategory = "query_failed";

  if (code === "P1000" || /authentication failed|password authentication failed/.test(message)) {
    category = "authentication_failed";
  } else if (code === "P1001" || /can't reach database|cannot reach database|connection refused|name or service not known|enotfound/.test(message)) {
    category = "database_unreachable";
  } else if (code === "P1002" || /timed out|timeout/.test(message)) {
    category = "connection_timeout";
  } else if (code === "P1017" || /server has closed the connection|connection closed|connection terminated/.test(message)) {
    category = "connection_closed";
  } else if (code === "P2021" || /relation .* does not exist|table .* does not exist/.test(message)) {
    category = "schema_missing";
  }

  return { category, code, type: safeErrorType(error) };
}

export function productionDatabaseReadinessClient(): DatabaseReadinessClient {
  return {
    async connection() {
      await prisma.$queryRaw`SELECT 1`;
    },
    async businessesRelation() {
      const rows = await prisma.$queryRaw<Array<{ relation: string | null }>>`
        SELECT to_regclass('public.businesses')::text AS relation
      `;
      return rows[0]?.relation || null;
    },
    async businessCount() {
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM businesses
      `;
      return rows[0]?.count ?? 0;
    },
  };
}

export async function checkDatabaseReadiness(
  client: DatabaseReadinessClient = productionDatabaseReadinessClient(),
): Promise<DatabaseReadinessResult> {
  const checks = {
    prismaConnection: false,
    postgresQuery: false,
    businessesTable: false,
  };

  try {
    await client.connection();
    checks.prismaConnection = true;
    checks.postgresQuery = true;
  } catch (error) {
    return {
      ok: false,
      stage: "connection",
      checks,
      businessCount: null,
      error: classifyDatabaseFailure(error),
    };
  }

  try {
    const relation = await client.businessesRelation();
    if (!relation) {
      return {
        ok: false,
        stage: "schema",
        checks,
        businessCount: null,
        error: { category: "schema_missing", code: null, type: "SchemaMissing" },
      };
    }
    checks.businessesTable = true;
  } catch (error) {
    return {
      ok: false,
      stage: "schema",
      checks,
      businessCount: null,
      error: classifyDatabaseFailure(error),
    };
  }

  try {
    const businessCount = await client.businessCount();
    return {
      ok: true,
      stage: "query",
      checks,
      businessCount,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      stage: "query",
      checks,
      businessCount: null,
      error: classifyDatabaseFailure(error),
    };
  }
}
