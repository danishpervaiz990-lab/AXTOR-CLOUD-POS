import type { Request, Response } from "express";
import * as reports from "../services/reports.service.js";
import { isGroceryOperationalReport, runGroceryOperationalReport } from "../services/grocery-reports.service.js";
import { isGrocerySalesAnalyticsReport, runGrocerySalesAnalyticsReport } from "../services/grocery-sales-analytics.service.js";
import { isGroceryFinanceReport, runGroceryFinanceReport } from "../services/grocery-finance-reports.service.js";
import { isFinancialMovementReport, runFinancialMovementReport } from "../services/financial-movement-reports.service.js";
import { isGrocery21To30Report, runGrocery21To30Report } from "../services/grocery-21-30-reports.service.js";
import { isGrocery21To30InventoryOverrideReport, runGrocery21To30InventoryOverrideReport } from "../services/grocery-21-30-inventory-overrides.service.js";
import { resolveGrocery21To30GroupBy } from "../services/grocery-21-30-grouping.service.js";
import { isGrocery31To33Report, runGrocery31To33Report } from "../services/grocery-31-40-accounting.service.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { handleError, tenant } from "../utils/http.js";

async function requireSensitiveReportAccess(req: Request, businessId: string, reportId: string) {
  const required = reportId === "grocery-profit-loss" ? "reports.pnl"
    : reportId === "grocery-balance-sheet" ? "reports.balance_sheet"
    : reportId === "grocery-trial-balance" ? "reports.trial_balance"
    : ["grocery-general-ledger","grocery-account-ledger","grocery-journal-report","grocery-cash-book","grocery-bank-book","grocery-credit-debit-accounting-report","grocery-cash-flow-accounting"].includes(reportId) ? "reports.ledger"
    : ["grocery-product-profitability","grocery-customer-profitability"].includes(reportId) ? "reports.profit"
    : null;
  if (!required) return;
  const access = await loadUserAccess((await import("../db/prisma.js")).prisma as any, businessId, req.tenant?.userId);
  if (!hasPermission(access, required)) throw new Error(`Permission denied: ${required}`);
}

export async function options(req: Request, res: Response) { try { const context = tenant(req); res.json({ ok: true, data: await reports.options(context.businessId) }); } catch (error) { handleError(res, error); } }

export async function run(req: Request, res: Response) {
  try {
    const context = tenant(req), requestedReportId = req.params.reportId;
    const reportId = isGrocery21To30Report(requestedReportId) ? resolveGrocery21To30GroupBy(requestedReportId, req.query.groupBy) : requestedReportId;
    await requireSensitiveReportAccess(req, context.businessId, reportId);
    let data;
    if (isGrocery31To33Report(reportId)) data = await runGrocery31To33Report(context.businessId, reportId, req.query);
    else if (isGrocery21To30InventoryOverrideReport(reportId)) data = await runGrocery21To30InventoryOverrideReport(context.businessId, reportId, req.query);
    else if (isGrocery21To30Report(reportId)) data = await runGrocery21To30Report(context.businessId, reportId, req.query);
    else if (isFinancialMovementReport(reportId)) data = await runFinancialMovementReport(context.businessId, reportId, req.query);
    else if (isGroceryOperationalReport(reportId)) data = await runGroceryOperationalReport(context.businessId, reportId, req.query);
    else if (isGrocerySalesAnalyticsReport(reportId)) data = await runGrocerySalesAnalyticsReport(context.businessId, reportId, req.query);
    else if (isGroceryFinanceReport(reportId)) data = await runGroceryFinanceReport(context.businessId, reportId, req.query);
    else data = await reports.runReport(context.businessId, reportId, req.query);
    res.json({ ok: true, data });
  } catch (error) { handleError(res, error); }
}
