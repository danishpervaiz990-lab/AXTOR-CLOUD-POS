import { NextResponse } from "next/server";
import {
  SharedBackendError,
  sharedBackendRequest
} from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedProduct = {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  unit?: string | null;
  price?: string | number | null;
  costPrice?: string | number | null;
  currentStock?: string | number | null;
  customFields?: Record<string, unknown> | null;
};

type SharedProductsPayload = {
  ok?: boolean;
  products?: SharedProduct[];
};

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const source = new URL(request.url);
  const query = new URLSearchParams();
  const q = source.searchParams.get("q")?.trim();
  if (q) query.set("q", q);
  query.set("active", "true");

  try {
    const payload = await sharedBackendRequest<SharedProductsPayload>(
      `/api/v1/products?${query.toString()}`,
      { token, businessId }
    );
    const products = Array.isArray(payload.products) ? payload.products : [];
    const requestedSize = Number(source.searchParams.get("pageSize") ?? "20");
    const pageSize = Number.isFinite(requestedSize)
      ? Math.max(1, Math.min(50, Math.trunc(requestedSize)))
      : 20;

    return NextResponse.json(
      {
        data: products.slice(0, pageSize).map((product) => {
          const custom = product.customFields ?? {};
          const weighted = custom.weighted === true || custom.productType === "WEIGHTED";
          return {
            id: product.id,
            sku: product.sku,
            plu: typeof custom.plu === "string" ? custom.plu : null,
            name: product.name,
            type: weighted ? "WEIGHTED" : "STANDARD",
            costPrice: String(product.costPrice ?? "0"),
            retailPrice: String(product.price ?? "0"),
            currentStock: String(product.currentStock ?? "0"),
            baseUnit: {
              symbol: product.unit ?? (weighted ? "kg" : "PCS"),
              decimalScale: weighted ? 3 : 0
            },
            barcodes: product.barcode
              ? [{ barcode: product.barcode, isPrimary: true }]
              : []
          };
        }),
        pagination: {
          page: 1,
          pageSize,
          total: products.length,
          pageCount: Math.max(1, Math.ceil(products.length / pageSize))
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
      { error: "BACKEND_UNAVAILABLE", message: "Product search could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
