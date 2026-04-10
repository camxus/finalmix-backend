import { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { buildApiError } from '../utils/index.js';

// ─── asyncHandler ─────────────────────────────────────────────────────────────

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// ─── errorMiddleware ──────────────────────────────────────────────────────────

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  console.error('[error]', err.message, err.stack?.split('\n')[1]);

  const statusCode = err.statusCode ?? 500;
  const error = err.code ?? (statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR');

  res.status(statusCode).json(buildApiError(error, err.message));
}

// ─── AppError factory ─────────────────────────────────────────────────────────

export function createError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
