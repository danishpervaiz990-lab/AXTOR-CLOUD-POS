import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedInventoryRow = {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  unit?: string | null;
  minStock?: string | number | null;
  currentStock?: string | number | null;
  lowStock?: boolean;
  customFields?: Record<string, unknown> | null;
  warehouses?: Array<{
    warehouseId: string;
    qtyOnHand?: string | number | null;
    qtyReserved?: string | number | null;
  }>;
};

type SharedEnvelope<T> = { ok?: boolean; data?: T } & Record<string, unknown>;

function unwrap<T>(payload: SharedEnvelope<T> | T): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as SharedEnvelope<T>).data as T;
  }
  return payload as T;
}

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const source = new URL(request.url);
  const query = new URLSearchParams();
  const warehouseId = source.searchParams.get("warehouseId")?.trim();
  const search = source.searchParams.get("search")?.trim();
  if (warehouseId) query.set("warehouseId", warehouseId);
  if (search) query.set("q", search);

  try {
    const payload = await sharedBackendRequest<SharedEnvelope<SharedInventoryRow[]>>(
      `/api/v1/inventory/stock?${query.toString()}`,
      { token, businessId }
    );
    let rows = unwrap(payload) ?? [];
    if (!Array.isArray(rows)) rows = [];
    if (source.searchParams.get("lowStockOnly") === "true") {
      rows = rows.filter((row) => row.lowStock === true);
    }

    const adapted = rows.map((row) => {
      const warehouseRows = Array.isArray(row.warehouses) ? row.warehouses : [];
      const selectedRows = warehouseId
        ? warehouseRows.filter((item) => item.warehouseId === warehouseId)
        : warehouseRows;
      const quantity = selectedRows.length
        ? selectedRows.reduce((sum, item) => sum + Number(item.qtyOnHand ?? 0), 0)
        : Number(row.currentStock ?? 0);
      const reserved = selectedRows.reduce((sum, item) => sum + Number(item.qtyReserved ?? 0), 0);
      const available = quantity - reserved;
      const custom = row.customFields ?? {};
      const weighted = custom.weighted === true || custom.productType === "WEIGHTED";
      const minimumStock = Number(row.minStock ?? 0);
      const reorderQuantity = Number(custom.reorderQuantity ?? Math.max(0, minimumStock * 2 - available));
      return {
        id: row.id,
        sku: row.sku,
        plu: typeof custom.plu === "string" ? custom.plu : null,
        name: row.name,
        type: weighted ? "WEIGHTED" : "STANDARD",
        baseUnit: { symbol: row.unit ?? (weighted ? "kg" : "PCS") },
        minimumStock: String(minimumStock),
        reorderQuantity: String(reorderQuantity),
        quantity: String(quantity),
        reserved: String(reserved),
        available: String(available),
        lowStock: row.lowStock === true || available <= minimumStock,
        batches: []
      };
    });

    return NextResponse.json(
      {
        data: {
          totals: {
            products: adapted.length,
            lowStockProducts: adapted.filter((row) => row.lowStock).length,
            expiringBatches: 0,
            quantity: String(adapted.reduce((sum, row) => sum + Number(row.quantity), 0)),
            available: String(adapted.reduce((sum, row) => sum + Number(row.available), 0))
          },
          rows: adapted
        }
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
      { error: "BACKEND_UNAVAILABLE", message: "Inventory could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
