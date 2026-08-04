import type { Request, Response } from "express";
import * as reports from "../services/reports.service.js";
import { isGroceryOperationalReport, runGroceryOperationalReport } from "../services/grocery-reports.service.js";
import { isGrocerySalesAnalyticsReport, runGrocerySalesAnalyticsReport } from "../services/grocery-sales-analytics.service.js";
import { isGroceryFinanceReport, runGroceryFinanceReport } from "../services/grocery-finance-reports.service.js";
import { isFinancialMovementReport, runFinancialMovementReport } from "../services/financial-movement-reports.service.js";
import { handleError, tenant } from "../utils/http.js";

export async function options(req: Request, res: Response) {
  try {
    const context = tenant(req);
    res.json({ ok: true, data: await reports.options(context.businessId) });
  } catch (error) {
    handleError(res, error);
  }
}

export async function run(req: Request, res: Response) {
  try {
    const context = tenant(req);
    const reportId = req.params.reportId;
    let data;
    if (isFinancialMovementReport(reportId)) {
      data = await runFinancialMovementReport(context.businessId, reportId, req.query);
    } else if (isGroceryOperationalReport(reportId)) {
      data = await runGroceryOperationalReport(context.businessId, reportId, req.query);
    } else if (isGrocerySalesAnalyticsReport(reportId)) {
      data = await runGrocerySalesAnalyticsReport(context.businessId, reportId, req.query);
    } else if (isGroceryFinanceReport(reportId)) {
      data = await runGroceryFinanceReport(context.businessId, reportId, req.query);
    } else {
      data = await reports.runReport(context.businessId, reportId, req.query);
    }
    res.json({ ok: true, data });
  } catch (error) {
    handleError(res, error);
  }
}
