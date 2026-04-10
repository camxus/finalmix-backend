import { type Request, type Response, type NextFunction } from 'express';
import { CognitoLib } from '../lib/cognito.lib';
import { DynamoDBLib } from '../lib/dynamodb.lib';
import { createError } from './asyncHandler';
import type { User } from '../types/models';

const cognito = new CognitoLib();
const dynamo = new DynamoDBLib();

export async function auth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(createError('Missing or invalid Authorization header', 401, 'UNAUTHORIZED'));
    }

    const token = header.slice(7);
    const payload = await cognito.verifyToken(token);

    const user = await dynamo.get<User>(`USER#${payload.sub}`, 'PROFILE');
    if (!user) {
      return next(createError('User not found', 401, 'UNAUTHORIZED'));
    }

    req.user = user;
    next();
  } catch {
    next(createError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
}

// Optional auth — attaches user if token present, continues without if not
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next();

    const token = header.slice(7);
    const payload = await cognito.verifyToken(token);
    const user = await dynamo.get<User>(`USER#${payload.sub}`, 'PROFILE');
    if (user) req.user = user;
  } catch { /* ignore */ }
  next();
}
