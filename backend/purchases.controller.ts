import type {Request,Response} from "express";import * as s from "../services/suppliers.service.js";import{handleError,tenant}from"../utils/http.js";
export async function list(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.listSuppliers(t.businessId,req.query)});}catch(e){handleError(res,e);}}
export async function get(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.getSupplier(t.businessId,req.params.id)});}catch(e){handleError(res,e);}}
export async function create(req:Request,res:Response){try{const t=tenant(req);res.status(201).json({ok:true,data:await s.createSupplier(req,t.businessId,t.userId,req.body)});}catch(e){handleError(res,e);}}
export async function update(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.updateSupplier(req,t.businessId,t.userId,req.params.id,req.body)});}catch(e){handleError(res,e);}}
export async function remove(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.deleteSupplier(req,t.businessId,t.userId,req.params.id)});}catch(e){handleError(res,e);}}
