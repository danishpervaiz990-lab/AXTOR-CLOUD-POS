import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Account = {
  id: string;
  name: string;
  type?: string | null;
  currency?: string | null;
  accountNumber?: string | null;
  active?: boolean;
};

type AccountsEnvelope = {
  ok?: boolean;
  data?: {
    accounts?: Account[];
  };
};

function methodType(type: unknown): string {
  const value = String(type ?? "cash").toLowerCase();
  if (value.includes("cheque") || value.includes("check")) return "CHEQUE";
  if (value.includes("card") || value.includes("pos")) return "CARD";
  if (value.includes("bank") || value.includes("online") || value.includes("transfer")) return "BANK_TRANSFER";
  if (value.includes("wallet")) return "WALLET";
  if (value.includes("credit")) return "CUSTOMER_CREDIT";
  return "CASH";
}

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  try {
    const payload = await sharedBackendRequest<AccountsEnvelope>("/api/v1/accounts?active=true", {
      token,
      businessId
    });
    const rows = payload.data?.accounts ?? [];
    return NextResponse.json(
      {
        data: rows.filter((row) => row.active !== false).map((row) => ({
          id: row.id,
          branchId: null,
          code: row.id,
          name: row.name,
          methodType: methodType(row.type),
          currencyCode: row.currency ?? "QAR",
          maskedAccountNumber: row.accountNumber
            ? `•••• ${row.accountNumber.slice(-4)}`
            : null
        }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Payment accounts could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
