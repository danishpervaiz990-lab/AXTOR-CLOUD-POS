import type { Request, Response } from "express";
import {
  GROCERY_41_50_MODULES, GROCERY_PRINT_TEMPLATES, commitImport, exportDataset, generateOperationalNotifications,
  globalSearch, groceryDashboard41To50, grocerySettings, labelPreview, listNotificationRules, listPrintProfiles,
  previewImport, printableDocument, purchaseCostHistory, saveGrocerySettings, saveNotificationRule, savePrintProfile,
  stockValuation, syncWeightedAverageProductCosts,
} from "../services/grocery-41-50.service.js";

function tenant(req: Request) { const businessId=req.tenant?.businessId,userId=req.tenant?.userId;if(!businessId||!userId)throw new Error("Authenticated Grocery tenant is required");return{businessId,userId}; }
function ok(res: Response,data: unknown,status=200){return res.status(status).json({ok:true,data});}
function fail(res: Response,e:any,status=400){return res.status(status).json({ok:false,error:{message:e?.message||"Request failed"}});}

export async function grocery41To50Catalog(req:Request,res:Response){try{tenant(req);return ok(res,{modules:[...GROCERY_41_50_MODULES],valuationMethod:"weighted_average",physicalRotation:"FEFO",printTemplates:[...GROCERY_PRINT_TEMPLATES],importTypes:["products","categories","customers","suppliers","opening_stock","product_pricing"],performance:{serverPagination:true,boundedSearch:true,bulkImportMaxRows:5000,labelPreviewMax:500}});}catch(e){return fail(res,e);}}
export async function groceryStockValuation(req:Request,res:Response){try{const t=tenant(req);return ok(res,await stockValuation(t.businessId,req.query));}catch(e){return fail(res,e);}}
export async function grocerySyncValuation(req:Request,res:Response){try{const t=tenant(req);return ok(res,await syncWeightedAverageProductCosts(req,t.businessId,t.userId,Array.isArray(req.body?.productIds)?req.body.productIds:undefined));}catch(e){return fail(res,e);}}
export async function groceryCostHistory(req:Request,res:Response){try{const t=tenant(req);return ok(res,await purchaseCostHistory(t.businessId,req.params.productId,req.query));}catch(e){return fail(res,e);}}
export async function groceryPrintProfiles(req:Request,res:Response){try{const t=tenant(req);return ok(res,await listPrintProfiles(t.businessId,t.userId));}catch(e){return fail(res,e);}}
export async function groceryPrintProfileSave(req:Request,res:Response){try{const t=tenant(req);return ok(res,await savePrintProfile(req,t.businessId,t.userId,req.params.code,req.body));}catch(e){return fail(res,e);}}
export async function groceryPrintableDocument(req:Request,res:Response){try{const t=tenant(req);return ok(res,await printableDocument(t.businessId,req.params.type,req.params.id,String(req.query.profile||""),t.userId));}catch(e){return fail(res,e,404);}}
export async function groceryLabelPreview(req:Request,res:Response){try{const t=tenant(req);return ok(res,await labelPreview(t.businessId,req.body));}catch(e){return fail(res,e);}}
export async function groceryDashboardV5(req:Request,res:Response){try{const t=tenant(req);return ok(res,await groceryDashboard41To50(t.businessId));}catch(e){return fail(res,e);}}
export async function grocerySettingsV5(req:Request,res:Response){try{const t=tenant(req);return ok(res,await grocerySettings(t.businessId));}catch(e){return fail(res,e);}}
export async function grocerySettingsSaveV5(req:Request,res:Response){try{const t=tenant(req);return ok(res,await saveGrocerySettings(req,t.businessId,t.userId,req.body));}catch(e){return fail(res,e);}}
export async function groceryNotificationRules(req:Request,res:Response){try{const t=tenant(req);return ok(res,await listNotificationRules(t.businessId));}catch(e){return fail(res,e);}}
export async function groceryNotificationRuleSave(req:Request,res:Response){try{const t=tenant(req);return ok(res,await saveNotificationRule(req,t.businessId,t.userId,req.params.code,req.body));}catch(e){return fail(res,e);}}
export async function groceryNotificationsGenerate(req:Request,res:Response){try{const t=tenant(req);return ok(res,await generateOperationalNotifications(req,t.businessId,t.userId));}catch(e){return fail(res,e);}}
export async function groceryImportPreview(req:Request,res:Response){try{const t=tenant(req);return ok(res,await previewImport(req,t.businessId,t.userId,req.body),201);}catch(e){return fail(res,e);}}
export async function groceryImportCommit(req:Request,res:Response){try{const t=tenant(req);return ok(res,await commitImport(req,t.businessId,t.userId,req.body),201);}catch(e){return fail(res,e);}}
export async function groceryExportDataset(req:Request,res:Response){try{const t=tenant(req);return ok(res,await exportDataset(t.businessId,req.params.entityType,req.query));}catch(e){return fail(res,e);}}
export async function groceryGlobalSearch(req:Request,res:Response){try{const t=tenant(req);return ok(res,await globalSearch(t.businessId,req.query));}catch(e){return fail(res,e);}}
