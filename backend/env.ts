import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';

  if (statusCode >= 500) {
    // Keep console logging for Phase 2; replace with structured logger in production hardening.
    console.error(err);
  }

  res.status(statusCode).json({
    ok: false,
    error: {
      message: statusCode >= 500 ? 'Internal server error' : message,
      ...(isApiError && err.details ? { details: err.details } : {})
    }
  });
}
