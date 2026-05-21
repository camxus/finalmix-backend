import { type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthService } from '../services/auth.service';
import { DynamoDBLib } from '../lib/dynamodb.lib';
import type { AuthenticatedRequest } from '../middleware/auth';

const dynamo      = new DynamoDBLib();
const authService = new AuthService(dynamo);

function decodeUsername(bearerHeader?: string): string {
  try {
    const raw = (bearerHeader ?? '').replace('Bearer ', '');
    const payload = JSON.parse(
      Buffer.from(raw.split('.')[1] ?? '', 'base64').toString(),
    ) as { username?: string; 'cognito:username'?: string };
    return payload.username ?? payload['cognito:username'] ?? '';
  } catch {
    return '';
  }
}

export const signup = async (req: Request, res: Response) => {
  const result = await authService.signup(req.body);
  res.status(201).json(result);
};

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authService.login(username, password);
  res.json(result);
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const username = decodeUsername(req.headers.authorization);
  const result   = await authService.refreshToken(refreshToken, username);
  res.json(result);
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  await authService.forgotPassword(email);
  // Deliberately vague to avoid user enumeration
  res.json({ message: 'If that account exists, a reset code has been sent' });
};

export const confirmPassword = async (req: Request, res: Response) => {
  const { username, code, newPassword } = req.body as {
    username: string; code: string; newPassword: string;
  };
  await authService.confirmPassword(username, code, newPassword);
  res.json({ message: 'Password reset successful' });
};

export const setNewPassword = async (req: Request, res: Response) => {
  const { email, newPassword } = req.body as { email: string; newPassword: string };
  await authService.setNewPassword(email, newPassword);
  res.json({ message: 'Password updated successfully' });
};

export const me = async (req: AuthenticatedRequest, res: Response) => {
  res.json(req.user);
};
