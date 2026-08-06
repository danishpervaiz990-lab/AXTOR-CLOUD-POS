import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountsEnvelope = {
  data?: {
    accounts?: Array<{ id: string; name: string; type?: string | null; active?: boolean }>;
  };
};

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const shiftId = String(input.shiftId ?? "").trim();
  const amount = Math.abs(Number(input.amount));
  if (!shiftId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "INVALID_CASH_MOVEMENT" }, { status: 422 });
  }

  try {
    const accounts = await sharedBackendRequest<AccountsEnvelope>("/api/v1/accounts?active=true", {
      token,
      businessId
    });
    const cashAccount = (accounts.data?.accounts ?? []).find((account) =>
      account.active !== false && String(account.type ?? account.name).toLowerCase().includes("cash")
    );
    if (!cashAccount) {
      return NextResponse.json(
        { error: "CASH_ACCOUNT_REQUIRED", message: "Create an active cash account before posting shift movements." },
        { status: 422 }
      );
    }
    const movementType = String(input.type ?? "PAID_IN").toUpperCase();
    const inward = ["PAID_IN", "CASH_IN", "DEPOSIT", "FLOAT_IN"].includes(movementType);
    const payload = await sharedBackendRequest<unknown>("/api/v1/accounts/transactions", {
      method: "POST",
      token,
      businessId,
      body: {
        accountId: cashAccount.id,
        type: inward ? "deposit" : "withdrawal",
        amount,
        description: input.reason ?? "Cashier shift cash movement",
        sourceType: "shift_cash_movement",
        sourceId: shiftId,
        transactionDate: new Date().toISOString()
      }
    });
    return NextResponse.json(
      { data: payload },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Cash movement could not be posted." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
