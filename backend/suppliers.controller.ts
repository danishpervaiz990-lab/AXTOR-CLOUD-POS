import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

type ProductLike = {
  id: string;
  businessId: string;
  sku: string;
  barcode: string | null;
  qrCode: string | null;
  code: string | null;
  itemCode: string | null;
  productCode: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string | null;
  price: unknown;
  costPrice: unknown;
  minStock: unknown;
  openingStock: unknown;
  currentStock: unknown;
  deleted: boolean;
  active: boolean;
  imageUrl: string | null;
  customFields: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

function getBusinessId(req: Request, res: Response): string | null {
  const businessId = req.tenant?.businessId;

  if (!businessId) {
    res.status(401).json({
      ok: false,
      error: {
        message: 'Authenticated business is required'
      }
    });
    return null;
  }

  return businessId;
}

function cleanString(value: unknown): string | undefined {
  const text = String(value || '').trim();

  return text || undefined;
}

function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const text = String(value).trim().toLowerCase();

  if (text === 'true') {
    return true;
  }

  if (text === 'false') {
    return false;
  }

  return fallback;
}

function formatProduct(product: ProductLike) {
  return {
    id: product.id,
    businessId: product.businessId,
    sku: product.sku,
    barcode: product.barcode,
    qrCode: product.qrCode,
    code: product.code,
    itemCode: product.itemCode,
    productCode: product.productCode,
    name: product.name,
    category: product.category,
    brand: product.brand,
    unit: product.unit,
    price: Number(product.price),
    costPrice: Number(product.costPrice),
    minStock: Number(product.minStock),
    openingStock: Number(product.openingStock),
    currentStock: Number(product.currentStock),
    deleted: product.deleted,
    active: product.active,
    imageUrl: product.imageUrl,
    customFields: product.customFields,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const q = cleanString(req.query.q);
    const activeQuery = cleanString(req.query.active);
    const deletedQuery = cleanString(req.query.deleted);

    const where: Prisma.ProductWhereInput = {
      businessId
    };

    if (deletedQuery === 'true') {
      where.deleted = true;
    } else {
      where.deleted = false;
    }

    if (activeQuery === 'true') {
      where.active = true;
    }

    if (activeQuery === 'false') {
      where.active = false;
    }

    if (q) {
      where.OR = [
        {
          sku: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          barcode: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          qrCode: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          code: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          itemCode: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          productCode: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          name: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          category: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          brand: {
            contains: q,
            mode: 'insensitive'
          }
        }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    res.json({
      ok: true,
      count: products.length,
      products: products.map(formatProduct)
    });
  } catch (error) {
    console.error('List products failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to list products'
      }
    });
  }
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Product id is required'
        }
      });
      return;
    }

    const product = await prisma.product.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!product) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Product not found'
        }
      });
      return;
    }

    res.json({
      ok: true,
      product: formatProduct(product)
    });
  } catch (error) {
    console.error('Get product failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to get product'
      }
    });
  }
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const sku = cleanString(req.body?.sku);
    const name = cleanString(req.body?.name);

    if (!sku) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Product SKU is required'
        }
      });
      return;
    }

    if (!name) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Product name is required'
        }
      });
      return;
    }

    const openingStock = parseNumber(req.body?.openingStock, 0);
    const currentStock =
      req.body?.currentStock === undefined || req.body?.currentStock === null
        ? openingStock
        : parseNumber(req.body?.currentStock, openingStock);

    const product = await prisma.product.create({
      data: {
        businessId,
        sku,
        barcode: cleanString(req.body?.barcode),
        qrCode: cleanString(req.body?.qrCode),
        code: cleanString(req.body?.code),
        itemCode: cleanString(req.body?.itemCode),
        productCode: cleanString(req.body?.productCode),
        name,
        category: cleanString(req.body?.category),
        brand: cleanString(req.body?.brand),
        unit: cleanString(req.body?.unit) || 'PCS',
        price: parseNumber(req.body?.price, 0),
        costPrice: parseNumber(req.body?.costPrice, 0),
        minStock: parseNumber(req.body?.minStock, 0),
        openingStock,
        currentStock,
        deleted: false,
        active: parseBoolean(req.body?.active, true),
        imageUrl: cleanString(req.body?.imageUrl),
        customFields: req.body?.customFields ?? undefined
      }
    });

    res.status(201).json({
      ok: true,
      product: formatProduct(product)
    });
  } catch (error) {
    console.error('Create product failed:', error);

    if (isUniqueError(error)) {
      res.status(409).json({
        ok: false,
        error: {
          message: 'Product SKU already exists for this business'
        }
      });
      return;
    }

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to create product'
      }
    });
  }
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Product id is required'
        }
      });
      return;
    }

    const existing = await prisma.product.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!existing) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Product not found'
        }
      });
      return;
    }

    const data: Prisma.ProductUncheckedUpdateInput = {};

    if (req.body?.sku !== undefined) {
      const sku = cleanString(req.body?.sku);

      if (!sku) {
        res.status(400).json({
          ok: false,
          error: {
            message: 'Product SKU cannot be empty'
          }
        });
        return;
      }

      data.sku = sku;
    }

    if (req.body?.name !== undefined) {
      const name = cleanString(req.body?.name);

      if (!name) {
        res.status(400).json({
          ok: false,
          error: {
            message: 'Product name cannot be empty'
          }
        });
        return;
      }

      data.name = name;
    }

    if (req.body?.barcode !== undefined) {
      data.barcode = cleanString(req.body?.barcode) || null;
    }

    if (req.body?.qrCode !== undefined) {
      data.qrCode = cleanString(req.body?.qrCode) || null;
    }

    if (req.body?.code !== undefined) {
      data.code = cleanString(req.body?.code) || null;
    }

    if (req.body?.itemCode !== undefined) {
      data.itemCode = cleanString(req.body?.itemCode) || null;
    }

    if (req.body?.productCode !== undefined) {
      data.productCode = cleanString(req.body?.productCode) || null;
    }

    if (req.body?.category !== undefined) {
      data.category = cleanString(req.body?.category) || null;
    }

    if (req.body?.brand !== undefined) {
      data.brand = cleanString(req.body?.brand) || null;
    }

    if (req.body?.unit !== undefined) {
      data.unit = cleanString(req.body?.unit) || 'PCS';
    }

    if (req.body?.price !== undefined) {
      data.price = parseNumber(req.body?.price, Number(existing.price));
    }

    if (req.body?.costPrice !== undefined) {
      data.costPrice = parseNumber(req.body?.costPrice, Number(existing.costPrice));
    }

    if (req.body?.minStock !== undefined) {
      data.minStock = parseNumber(req.body?.minStock, Number(existing.minStock));
    }

    if (req.body?.openingStock !== undefined) {
      data.openingStock = parseNumber(req.body?.openingStock, Number(existing.openingStock));
    }

    if (req.body?.currentStock !== undefined) {
      data.currentStock = parseNumber(req.body?.currentStock, Number(existing.currentStock));
    }

    if (req.body?.active !== undefined) {
      data.active = parseBoolean(req.body?.active, existing.active);
    }

    if (req.body?.deleted !== undefined) {
      data.deleted = parseBoolean(req.body?.deleted, existing.deleted);
    }

    if (req.body?.imageUrl !== undefined) {
      data.imageUrl = cleanString(req.body?.imageUrl) || null;
    }

    if (req.body?.customFields !== undefined) {
      data.customFields = req.body?.customFields ?? null;
    }

    const product = await prisma.product.update({
      where: {
        id: existing.id
      },
      data
    });

    res.json({
      ok: true,
      product: formatProduct(product)
    });
  } catch (error) {
    console.error('Update product failed:', error);

    if (isUniqueError(error)) {
      res.status(409).json({
        ok: false,
        error: {
          message: 'Product SKU already exists for this business'
        }
      });
      return;
    }

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to update product'
      }
    });
  }
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Product id is required'
        }
      });
      return;
    }

    const existing = await prisma.product.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!existing) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Product not found'
        }
      });
      return;
    }

    const product = await prisma.product.update({
      where: {
        id: existing.id
      },
      data: {
        active: false,
        deleted: true
      }
    });

    res.json({
      ok: true,
      product: formatProduct(product)
    });
  } catch (error) {
    console.error('Delete product failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to delete product'
      }
    });
  }
}
