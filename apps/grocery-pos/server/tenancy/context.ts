import { requireAuthenticatedSession } from "@/server/auth/session";

export type TenantContext = {
  businessId: string;
  userId: string;
  role:
    | "OWNER"
    | "ADMINISTRATOR"
    | "MANAGER"
    | "CASHIER"
    | "INVENTORY_MANAGER"
    | "ACCOUNTANT"
    | "SALESPERSON"
    | "VIEWER_AUDITOR";
};

export async function requireTenantContext(): Promise<TenantContext> {
  const session = await requireAuthenticatedSession();
  return {
    businessId: session.businessId,
    userId: session.userId,
    role: session.role
  };
}

export function tenantWhere<T extends object>(context: TenantContext, where?: T): T & { businessId: string } {
  return {
    ...(where ?? ({} as T)),
    businessId: context.businessId
  };
}

export function assertRecordBelongsToTenant(context: TenantContext, recordBusinessId: string): void {
  if (recordBusinessId !== context.businessId) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
}
