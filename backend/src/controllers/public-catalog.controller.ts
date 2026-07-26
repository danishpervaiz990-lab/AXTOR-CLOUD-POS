import type { Request, Response } from "express";
import * as service from "../services/public-catalog.service.js";

function fail(res: Response, error: unknown) {
  if (error instanceof service.PublicCatalogError) {
    res.status(error.status).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        referenceId: res.locals.requestId,
      },
    });
    return;
  }
  console.error("Public catalogue request failed:", error);
  res.status(500).json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unable to complete the request",
      referenceId: res.locals.requestId,
    },
  });
}

export async function catalog(_req: Request, res: Response) {
  try { res.json({ ok: true, data: await service.catalogue() }); } catch (error) { fail(res, error); }
}

export async function industry(req: Request, res: Response) {
  try { res.json({ ok: true, data: service.industryDetail(req.params.code) }); } catch (error) { fail(res, error); }
}

export async function register(req: Request, res: Response) {
  try { res.status(201).json({ ok: true, data: await service.register(req, req.body || {}) }); } catch (error) { fail(res, error); }
}
