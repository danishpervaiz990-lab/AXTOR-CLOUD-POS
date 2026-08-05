import { AuditAction, Prisma, ProductType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { assertNonNegativeMoney, formatMoneyForStorage } from "@/lib/money";
import { requirePermission } from "@/server/permissions/permissions";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decimalString = z.union([z.string(), z.number()]).transform((value, context) => {
  try {
    return assertNonNegativeMoney(String(value)).toFixed(4);
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid non-negative decimal amount" });
    return z.NEVER;
  }
});

const createProductSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  baseUnitId: z.string().uuid(),
  sku: z.string().trim().min(1).max(80),
  plu: z.string().trim().min(1).max(30).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  localName: z.string().trim().max(200).nullable().optional(),
  type: z.nativeEnum(ProductType).default(ProductType.STANDARD),
  barcodes: z.array(z.string().trim().regex(/^\d{4,32}$/)).max(20).default([]),
  costPrice: decimalString,
  retailPrice: decimalString,
  wholesalePrice: decimalString.nullable().optional(),
  memberPrice: decimalString.nullable().optional(),
  minimumStock: decimalString.default("0"),
  reorderQuantity: decimalString.default("0"),
  taxRate: z.union([z.string(), z.number()]).transform((value) => String(value)).default("0"),
  trackInventory: z.boolean().default(true),
  trackBatches: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  allowNegativeStock: z.boolean().default(false),
  allowPriceOverride: z.boolean().default(false),
  allowDiscount: z.boolean().default(true)
}).superRefine((value, context) => {
  if (new Set(value.barcodes).size !== value.barcodes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["barcodes"],
      message: "Duplicate barcodes are not allowed"
    });
  }
  if (value.trackExpiry && !value.trackBatches) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trackBatches"],
      message: "Expiry tracking requires batch tracking"
    });
  }
});

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  const context = await requireTenantContext();
  requirePermission(context, "products.manage");

  const parsed = createProductSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const database = getDatabase();
  const [unit, category] = await Promise.all([
    database.unit.findFirst({ where: { id: input.baseUnitId, businessId: context.businessId } }),
    input.categoryId
      ? database.category.findFirst({ where: { id: input.categoryId, businessId: context.businessId } })
      : Promise.resolve(null)
  ]);

  if (!unit || (input.categoryId && !category)) {
    return NextResponse.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  }

  try {
    const product = await database.$transaction(async (transaction) => {
      const created = await transaction.product.create({
        data: {
          businessId: context.businessId,
          categoryId: input.categoryId,
          baseUnitId: input.baseUnitId,
          sku: input.sku,
          plu: input.plu,
          name: input.name,
          localName: input.localName,
          type: input.type,
          costPrice: input.costPrice,
          retailPrice: input.retailPrice,
          wholesalePrice: input.wholesalePrice,
          memberPrice: input.memberPrice,
          minimumStock: input.minimumStock,
          reorderQuantity: input.reorderQuantity,
          taxRate: input.taxRate,
          trackInventory: input.trackInventory,
          trackBatches: input.trackBatches,
          trackExpiry: input.trackExpiry,
          allowNegativeStock: input.allowNegativeStock,
          allowPriceOverride: input.allowPriceOverride,
          allowDiscount: input.allowDiscount,
          barcodes: {
            create: input.barcodes.map((barcode, index) => ({
              businessId: context.businessId,
              barcode,
              isPrimary: index === 0
            }))
          }
        },
        include: { barcodes: true, baseUnit: true, category: true }
      });

      await transaction.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          action: AuditAction.CREATE,
          entityType: "PRODUCT",
          entityId: created.id,
          afterData: {
            sku: created.sku,
            name: created.name,
            type: created.type,
            barcodeCount: created.barcodes.length
          }
        }
      });

      return created;
    });

    return NextResponse.json(
      {
        data: {
          id: product.id,
          sku: product.sku,
          plu: product.plu,
          name: product.name,
          type: product.type,
          costPrice: formatMoneyForStorage(product.costPrice.toString(), 4),
          retailPrice: formatMoneyForStorage(product.retailPrice.toString(), 4),
          category: product.category,
          baseUnit: product.baseUnit,
          barcodes: product.barcodes
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "DUPLICATE_PRODUCT_IDENTITY", message: "SKU, PLU or barcode already exists in this workspace." },
        { status: 409 }
      );
    }
    throw error;
  }
}
