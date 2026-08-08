import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createSalesReturn } from "./sales-returns.controller.js";
import { createRefund } from "./refunds.controller.js";
import * as purchases from "./purchases.controller.js";
import { groceryPurchaseReturnCreate, groceryRefundCreate, grocerySalesReturnCreate } from "./grocery-31-40-returns.controller.js";

async function isGrocery(req: Request) {
  const businessId = req.tenant?.businessId;
  if (!businessId) return false;
  const selection = await prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } });
  return String(selection?.industry?.code || "").toLowerCase() === "grocery";
}

export async function createSalesReturnByIndustry(req: Request, res: Response) { return (await isGrocery(req)) ? grocerySalesReturnCreate(req, res) : createSalesReturn(req, res); }
export async function createRefundByIndustry(req: Request, res: Response) { return (await isGrocery(req)) ? groceryRefundCreate(req, res) : createRefund(req, res); }
export async function createPurchaseReturnByIndustry(req: Request, res: Response) { return (await isGrocery(req)) ? groceryPurchaseReturnCreate(req, res) : purchases.createReturn(req, res); }
