import { type Request, type Response } from 'express';
import { buildSDK } from '../sdk/index';

// ─── Current user ────────────────────────────────────────────────────────────

export async function me(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const user = await sdk.users.getById(req.user!.id);

  res.json(user);
}

// ─── Username availability ───────────────────────────────────────────────────

export async function checkUsername(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');

  const username = String(req.query.username ?? '')
    .toLowerCase()
    .trim();

  if (!username) {
    res.status(400).json({ error: 'USERNAME_REQUIRED' });
    return;
  }

  const available = await sdk.users.isUsernameAvailable(username);

  res.json({ available });
}

// ─── Create profile (signup completion) ─────────────────────────────────────

export async function createProfile(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);

  const { username, avatar } = req.body;

  const user = await sdk.users.createProfile(req.user!.id, {
    username,
    avatar,
  });

  res.status(201).json(user);
}

// ─── Update profile (safe patch) ─────────────────────────────────────────────

export async function updateUser(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);

  const { username, avatar } = req.body;

  const updated = await sdk.users.update(req.user!.id, {
    username,
    avatar,
  });

  res.json(updated);
}

// ─── Search users (for invites) ──────────────────────────────────────────────

export async function searchUsers(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);

  const q = String(req.query.q ?? '').toLowerCase().trim();

  if (!q) {
    res.json([]);
    return;
  }

  const users = await sdk.users.search(q);

  res.json(users);
}

// ─── Get user by id (public profile) ────────────────────────────────────────

export async function getById(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');

  const { uid } = req.params;

  if (!uid) {
    res.status(400).json({ error: 'USER_ID_REQUIRED' });
    return;
  }

  const user = await sdk.users.getById(uid);

  res.json(user);
}