import type { Request, Response } from 'express';
import { createFrontendHandoff, exchangeFrontendHandoff } from '../services/frontend-handoff.service.js';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Frontend session handoff failed';
}

export async function frontendHandoff(req: Request, res: Response): Promise<void> {
  const businessId = req.tenant?.businessId;
  const userId = req.tenant?.userId;
  if (!businessId || !userId) {
    res.status(401).json({ ok: false, error: { message: 'Authentication required' } });
    return;
  }

  try {
    const result = await createFrontendHandoff({
      req,
      businessId,
      userId,
      targetOrigin: req.body?.targetOrigin
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: { message: message(error) } });
  }
}

export async function exchangeHandoff(req: Request, res: Response): Promise<void> {
  try {
    const result = await exchangeFrontendHandoff({
      req,
      code: req.body?.code,
      targetOrigin: req.body?.targetOrigin
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: { message: message(error) } });
  }
}
