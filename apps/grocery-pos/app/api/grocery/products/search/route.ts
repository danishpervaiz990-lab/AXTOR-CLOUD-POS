import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  warehouseId: z.string().uuid().optional(),
  activeOnly: z.enum(["true", "false"]).default("true")
});

export async function GET(request: Request) {
  const context = await requireTenantContext();
  requirePermission(context, "products.view");

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  }

  const { q, page, pageSize, warehouseId, activeOnly } = parsed.data;
  const database = getDatabase();

  if (warehouseId) {
    const warehouseExists = await database.warehouse.count({
      where: { id: warehouseId, businessId: context.businessId, active: true }
    });
    if (!warehouseExists) {
      return NextResponse.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
    }
  }

  const searchFilter = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { localName: { contains: q, mode: "insensitive" as const } },
          { sku: { contains: q, mode: "insensitive" as const } },
          { plu: { equals: q } },
          { barcodes: { some: { barcode: { contains: q } } } }
        ]
      }
    : {};

  const where = {
    businessId: context.businessId,
    ...(activeOnly === "true" ? { active: true } : {}),
    ...searchFilter
  };

  const [total, products] = await database.$transaction([
    database.product.count({ where }),
    database.product.findMany({
      where,
      include: {
        category: { select: { id: true, code: true, name: true } },
        baseUnit: { select: { id: true, code: true, name: true, symbol: true, decimalScale: true } },
        barcodes: { orderBy: [{ isPrimary: "desc" }, { barcode: "asc" }] },
        inventoryBalances: warehouseId
          ? { where: { warehouseId }, select: { quantity: true, reserved: true, warehouseId: true } }
          : { take: 0 }
      },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return NextResponse.json(
    {
      data: products.map((product) => ({
        id: product.id,
        sku: product.sku,
        plu: product.plu,
        name: product.name,
        localName: product.localName,
        type: product.type,
        category: product.category,
        baseUnit: product.baseUnit,
        costPrice: product.costPrice.toFixed(4),
        retailPrice: product.retailPrice.toFixed(4),
        weighted: product.type === "WEIGHTED",
        trackBatches: product.trackBatches,
        trackExpiry: product.trackExpiry,
        barcodes: product.barcodes.map((barcode) => ({
          id: barcode.id,
          barcode: barcode.barcode,
          isPrimary: barcode.isPrimary
        })),
        inventory: warehouseId
          ? product.inventoryBalances.reduce(
              (summary, balance) => ({
                quantity: summary.quantity + Number(balance.quantity.toString()),
                reserved: summary.reserved + Number(balance.reserved.toString())
              }),
              { quantity: 0, reserved: 0 }
            )
          : null
      })),
      pagination: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize)
      }
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
