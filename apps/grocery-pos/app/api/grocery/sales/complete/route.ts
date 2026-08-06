import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedSale = {
  id?: string;
  documentNo?: string;
  total?: string | number;
  paid?: string | number;
  balance?: string | number;
  paymentLines?: unknown[];
};

type SharedSaleEnvelope = {
  ok?: boolean;
  data?: SharedSale;
  document?: SharedSale;
};

function backendMethod(value: unknown): string {
  const method = String(value ?? "cash").toLowerCase();
  if (method.includes("bank")) return "bank_transfer";
  if (method.includes("card")) return "card";
  if (method.includes("cheque") || method.includes("check")) return "cheque";
  if (method.includes("wallet")) return "wallet";
  if (method.includes("credit")) return "credit";
  return "cash";
}

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const items = Array.isArray(input.items) ? input.items as Array<Record<string, unknown>> : [];
  const payments = Array.isArray(input.payments) ? input.payments as Array<Record<string, unknown>> : [];
  if (!items.length) return NextResponse.json({ error: "INVALID_SALE_ITEMS" }, { status: 422 });

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();
  const totalPayments = payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const methods = [...new Set(payments.map((payment) => backendMethod(payment.methodType)))];
  const paymentMethod = methods.length > 1 ? "mixed" : methods[0] ?? (totalPayments > 0 ? "cash" : "credit");
  const paymentLines = payments
    .filter((payment) => Number(payment.amount ?? 0) > 0)
    .map((payment) => {
      const cheque = payment.cheque && typeof payment.cheque === "object"
        ? payment.cheque as Record<string, unknown>
        : null;
      return {
        method: backendMethod(payment.methodType),
        amount: Number(payment.amount),
        accountId: payment.accountId,
        referenceNo: payment.reference ?? cheque?.chequeNumber ?? null,
        notes: cheque
          ? JSON.stringify({
              bankName: cheque.bankName,
              chequeDate: cheque.chequeDate,
              dueDate: cheque.dueDate
            })
          : null
      };
    });

  try {
    const payload = await sharedBackendRequest<SharedSaleEnvelope>("/api/v1/sales-documents", {
      method: "POST",
      token,
      businessId,
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        documentType: "invoice",
        postingMode: "post",
        idempotencyKey,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        counterId: input.registerId ?? input.counterId,
        shiftId: input.shiftId,
        customerId: input.customerId,
        dueDate: input.dueAt,
        paymentMethod,
        paymentLines,
        paidAmount: totalPayments,
        items: items.map((item) => ({
          productId: item.productId,
          inventoryBatchId: item.batchId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxRate: item.taxRate
        }))
      }
    });
    const sale = payload.data ?? payload.document ?? {};
    const paid = Number(sale.paid ?? totalPayments);
    const total = Number(sale.total ?? 0);
    const pendingChequeTotal = payments
      .filter((payment) => backendMethod(payment.methodType) === "cheque")
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    return NextResponse.json(
      {
        data: {
          id: sale.id,
          invoiceNumber: sale.documentNo ?? sale.id ?? "Posted invoice",
          grandTotal: String(total),
          paidTotal: String(paid),
          balance: String(sale.balance ?? Math.max(0, total - paid)),
          pendingChequeTotal: String(pendingChequeTotal)
        }
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SALE_POSTING_FAILED", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Checkout could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
