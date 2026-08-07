import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpenseBackendRecord = Record<string, unknown>;
type ExpenseBackendResponse = ExpenseBackendRecord & { data?: ExpenseBackendRecord };

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const headers = new Headers();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  try {
    const payload = await sharedBackendRequest<ExpenseBackendResponse>("/api/v1/expenses", {
      method: "POST",
      token,
      businessId,
      headers,
      body: {
        branchId: input.branchId,
        accountId: input.paymentAccountId ?? input.accountId,
        category: input.category,
        description: input.description,
        amount: Number(input.amount ?? 0) + Number(input.taxAmount ?? 0),
        expenseDate: input.incurredAt ?? input.expenseDate,
        referenceNo: input.reference,
        metadata: {
          paymentMethod: input.methodType,
          netAmount: input.amount,
          taxAmount: input.taxAmount ?? 0
        }
      }
    });
    const data: ExpenseBackendRecord = payload.data ?? payload;
    return NextResponse.json(
      {
        data: {
          ...data,
          expenseNumber: data.id ?? data.referenceNo ?? "Posted expense"
        }
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "EXPENSE_POSTING_FAILED", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Expense could not be posted." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
