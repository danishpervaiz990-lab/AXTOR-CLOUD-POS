import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";

const expectedBusinessColumns = new Set([
  "id",
  "name",
  "legal_name",
  "slug",
  "status",
  "country",
  "timezone",
  "currency",
  "tax_number",
  "subscription_plan",
  "subscription_status",
  "trial_ends_at",
  "default_language",
  "date_format",
  "number_locale",
  "tax_label",
  "onboarding_state",
  "onboarding_step",
  "onboarding_completed_at",
  "maintenance_mode",
  "created_at",
  "updated_at",
]);

type DiagnosticsDb = Pick<PrismaClient, "$queryRaw">;

type ColumnRow = {
  column_name: string;
  is_nullable: string;
  column_default: string | null;
  is_identity: string;
  is_generated: string;
  udt_name: string;
};

type NameRow = { name: string };
type PrivilegeRow = { can_insert: boolean };
type SecurityRow = { row_security_enabled: boolean; row_security_forced: boolean };

export type BusinessInsertCompatibility = {
  status: "AVAILABLE" | "UNAVAILABLE";
  missingModelColumns: string[];
  blockingExtraColumns: string[];
  enumColumnTypes: {
    status: string | null;
    onboardingState: string | null;
  };
  insertPrivilege: boolean | null;
  rowSecurityEnabled: boolean | null;
  rowSecurityForced: boolean | null;
  policyNames: string[];
  triggerNames: string[];
  checkConstraintNames: string[];
};

export async function collectBusinessInsertCompatibility(
  db: DiagnosticsDb = prisma,
): Promise<BusinessInsertCompatibility> {
  try {
    const [columns, triggers, constraints, privileges, security, policies] = await Promise.all([
      db.$queryRaw<ColumnRow[]>`
        SELECT column_name, is_nullable, column_default, is_identity, is_generated, udt_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'businesses'
        ORDER BY ordinal_position
      `,
      db.$queryRaw<NameRow[]>`
        SELECT trigger_name AS name
        FROM information_schema.triggers
        WHERE trigger_schema = current_schema()
          AND event_object_table = 'businesses'
        ORDER BY trigger_name
      `,
      db.$queryRaw<NameRow[]>`
        SELECT con.conname AS name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = current_schema()
          AND rel.relname = 'businesses'
          AND con.contype = 'c'
        ORDER BY con.conname
      `,
      db.$queryRaw<PrivilegeRow[]>`
        SELECT has_table_privilege(
          current_user,
          quote_ident(current_schema()) || '.businesses',
          'INSERT'
        ) AS can_insert
      `,
      db.$queryRaw<SecurityRow[]>`
        SELECT relrowsecurity AS row_security_enabled,
               relforcerowsecurity AS row_security_forced
        FROM pg_class rel
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = current_schema()
          AND rel.relname = 'businesses'
      `,
      db.$queryRaw<NameRow[]>`
        SELECT policyname AS name
        FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'businesses'
        ORDER BY policyname
      `,
    ]);

    const names = new Set(columns.map((column) => String(column.column_name)));
    const missingModelColumns = [...expectedBusinessColumns]
      .filter((column) => !names.has(column))
      .sort();
    const blockingExtraColumns = columns
      .filter((column) => {
        const name = String(column.column_name);
        return !expectedBusinessColumns.has(name)
          && column.is_nullable === "NO"
          && !column.column_default
          && column.is_identity !== "YES"
          && column.is_generated === "NEVER";
      })
      .map((column) => String(column.column_name))
      .sort();
    const typeByColumn = new Map(
      columns.map((column) => [String(column.column_name), String(column.udt_name)]),
    );

    return {
      status: "AVAILABLE",
      missingModelColumns,
      blockingExtraColumns,
      enumColumnTypes: {
        status: typeByColumn.get("status") || null,
        onboardingState: typeByColumn.get("onboarding_state") || null,
      },
      insertPrivilege: privileges[0]?.can_insert ?? null,
      rowSecurityEnabled: security[0]?.row_security_enabled ?? null,
      rowSecurityForced: security[0]?.row_security_forced ?? null,
      policyNames: policies.map((row) => String(row.name)).sort(),
      triggerNames: triggers.map((row) => String(row.name)).sort(),
      checkConstraintNames: constraints.map((row) => String(row.name)).sort(),
    };
  } catch (error) {
    console.error("Business insert compatibility diagnostics failed", { error });
    return {
      status: "UNAVAILABLE",
      missingModelColumns: [],
      blockingExtraColumns: [],
      enumColumnTypes: { status: null, onboardingState: null },
      insertPrivilege: null,
      rowSecurityEnabled: null,
      rowSecurityForced: null,
      policyNames: [],
      triggerNames: [],
      checkConstraintNames: [],
    };
  }
}
