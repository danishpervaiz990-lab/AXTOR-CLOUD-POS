import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const db: any = prisma;
const businessId = (req: Request) => req.tenant?.businessId;

export async function bootstrapPaintIndustry(req: Request, res: Response) {
  const bid = businessId(req);
  if (!bid) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });

  try {
    const result = await db.$transaction(async (tx: any) => {
      const labPermissions = [
        "industry.paint.catalogue.manage",
        "industry.paint.formula.manage",
        "industry.paint.mix_job.manage",
        "industry.paint.mix_jobs.manage",
        "industry.paint.component_stock.manage",
        "industry.paint.quality.manage",
      ];
      const accountsPermissions = [
        "accounts.view",
        "accounts.manage",
        "expenses.view",
        "expenses.manage",
        "reports.view",
        "industry.paint.reports.view",
      ];

      const labRole = await tx.role.upsert({
        where: { businessId_name: { businessId: bid, name: "Mixing Lab Technician" } },
        create: {
          businessId: bid,
          name: "Mixing Lab Technician",
          description: "Create and revise paint formulas, run mixing jobs, consume components, complete quality checks and print labels",
          permissions: labPermissions,
          isSystemRole: true,
        },
        update: {
          description: "Create and revise paint formulas, run mixing jobs, consume components, complete quality checks and print labels",
          permissions: labPermissions,
          isSystemRole: true,
        },
      });

      const accountsRole = await tx.role.upsert({
        where: { businessId_name: { businessId: bid, name: "Accounts" } },
        create: {
          businessId: bid,
          name: "Accounts",
          description: "Manage ledgers, expenses, reconciliation and financial reporting",
          permissions: accountsPermissions,
          isSystemRole: true,
        },
        update: {
          description: "Manage ledgers, expenses, reconciliation and financial reporting",
          permissions: accountsPermissions,
          isSystemRole: true,
        },
      });

      const brand = await tx.paintBrand.upsert({
        where: { businessId_name: { businessId: bid, name: "AXTOR Professional Paints" } },
        create: { businessId: bid, name: "AXTOR Professional Paints", active: true },
        update: { active: true },
      });

      const productLine = await tx.paintProductLine.upsert({
        where: { businessId_brandId_name: { businessId: bid, brandId: brand.id, name: "Automotive Refinish" } },
        create: { businessId: bid, brandId: brand.id, name: "Automotive Refinish", technology: "2K / Solventborne", active: true },
        update: { technology: "2K / Solventborne", active: true },
      });

      const color = await tx.paintColor.upsert({
        where: { businessId_code: { businessId: bid, code: "AXT-QA-001" } },
        create: { businessId: bid, code: "AXT-QA-001", name: "AXTOR Ocean Blue", collection: "AXTOR Standard", active: true },
        update: { name: "AXTOR Ocean Blue", collection: "AXTOR Standard", active: true },
      });

      let formula = await tx.paintFormula.findFirst({ where: { businessId: bid, formulaCode: "AXT-FRM-001" } });
      if (!formula) {
        formula = await tx.paintFormula.create({
          data: {
            businessId: bid,
            formulaCode: "AXT-FRM-001",
            colorId: color.id,
            productLineId: productLine.id,
            baseCode: "BASE-CLEAR-1L",
            packSize: 1,
            unit: "ltr",
            currentRevision: 1,
            active: true,
          },
        });
        const revision = await tx.paintFormulaRevision.create({
          data: { businessId: bid, formulaId: formula.id, revision: 1, notes: "AXTOR starter formula" },
        });
        await tx.paintFormulaComponent.createMany({
          data: [
            { businessId: bid, revisionId: revision.id, componentCode: "TINT-WHITE", componentName: "White Tinter", quantity: 0.7, unit: "kg", sequence: 0 },
            { businessId: bid, revisionId: revision.id, componentCode: "TINT-BLUE", componentName: "Blue Tinter", quantity: 0.2, unit: "kg", sequence: 1 },
            { businessId: bid, revisionId: revision.id, componentCode: "TINT-BLACK", componentName: "Black Tinter", quantity: 0.1, unit: "kg", sequence: 2 },
          ],
        });
      }

      for (const component of [
        { componentCode: "TINT-WHITE", componentName: "White Tinter", quantityOnHand: 500, unit: "kg", averageCost: 8, minimumStock: 10 },
        { componentCode: "TINT-BLUE", componentName: "Blue Tinter", quantityOnHand: 500, unit: "kg", averageCost: 12, minimumStock: 10 },
        { componentCode: "TINT-BLACK", componentName: "Black Tinter", quantityOnHand: 500, unit: "kg", averageCost: 10, minimumStock: 10 },
      ]) {
        await tx.paintComponentStock.upsert({
          where: { businessId_componentCode: { businessId: bid, componentCode: component.componentCode } },
          create: { businessId: bid, ...component, active: true },
          update: { ...component, active: true },
        });
      }

      return {
        roles: [
          { id: labRole.id, name: labRole.name },
          { id: accountsRole.id, name: accountsRole.name },
        ],
        brand: { id: brand.id, name: brand.name },
        productLine: { id: productLine.id, name: productLine.name },
        color: { id: color.id, code: color.code },
        formula: { id: formula.id, formulaCode: formula.formulaCode, currentRevision: formula.currentRevision },
      };
    });

    return res.status(201).json({ ok: true, data: result });
  } catch (error: any) {
    console.error("bootstrapPaintIndustry error:", error);
    return res.status(500).json({ ok: false, error: { message: error?.message || "Unable to bootstrap Paint industry" } });
  }
}
