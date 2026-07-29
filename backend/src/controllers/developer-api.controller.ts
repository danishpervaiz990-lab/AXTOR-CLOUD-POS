import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { ApiError, handleError, plain, tenant } from "../utils/http.js";

export async function status(req: Request, res: Response) {
  try {
    const context = tenant(req);
    const business = await prisma.business.findUnique({
      where: { id: context.businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        country: true,
        timezone: true,
        currency: true,
        defaultLanguage: true,
        updatedAt: true,
      },
    });
    if (!business) throw new ApiError(404, "Business not found");
    return res.json({
      ok: true,
      data: {
        apiVersion: "v1",
        business: plain(business),
        key: {
          id: req.developerApiKey?.id,
          name: req.developerApiKey?.name,
          scopes: req.developerApiKey?.scopes || [],
        },
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function products(req: Request, res: Response) {
  try {
    const context = tenant(req);
    const limitRaw = Number(req.query.limit || 100);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100, 1), 200);
    const search = String(req.query.search || "").trim().slice(0, 100);
    const updatedAfterText = String(req.query.updatedAfter || "").trim();
    let updatedAfter: Date | undefined;
    if (updatedAfterText) {
      updatedAfter = new Date(updatedAfterText);
      if (Number.isNaN(updatedAfter.getTime())) throw new ApiError(400, "updatedAfter must be a valid date");
    }

    const rows = await prisma.product.findMany({
      where: {
        businessId: context.businessId,
        active: true,
        deleted: false,
        ...(updatedAfter ? { updatedAt: { gt: updatedAfter } } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: limit,
      select: {
        id: true,
        sku: true,
        barcode: true,
        qrCode: true,
        name: true,
        category: true,
        brand: true,
        unit: true,
        price: true,
        currentStock: true,
        imageUrl: true,
        updatedAt: true,
      },
    });

    return res.json({
      ok: true,
      data: plain(rows),
      meta: {
        count: rows.length,
        limit,
        updatedAfter: updatedAfter?.toISOString() || null,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}
