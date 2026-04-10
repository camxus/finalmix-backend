import { DynamoDBLib } from '../lib/dynamodb.lib';
import { newId, now } from '../utils/index';
import { createError } from '../middleware/asyncHandler';

export interface CreateUserInput {
  username: string;
  avatar?: string;
}

export interface UpdateUserInput {
  username?: string;
  avatar?: string;
}

export interface User {
  id: string;
  username: string;
  avatar?: string;
  created_at: string;
  updated_at: string;
}

export class UsersService {
  constructor(private readonly dynamo: DynamoDBLib) {}

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  async getById(userId: string): Promise<User> {
    const users = await this.dynamo.query<User>({
      indexName: 'GSI2',
      gsiPk: userId,
      gsiPkField: 'GSI2PK',
    });

    const user = users[0];
    if (!user) {
      throw createError('User not found', 404, 'NOT_FOUND');
    }

    return user;
  }

  // ─── Username availability ────────────────────────────────────────────────

  async isUsernameAvailable(username: string): Promise<boolean> {
    const normalized = username.toLowerCase().trim();

    const existing = await this.dynamo.query<User>({
      indexName: 'GSI_USERNAME',
      gsiPk: `USERNAME#${normalized}`,
      gsiPkField: 'GSI1PK',
    });

    return existing.length === 0;
  }

  // ─── Create profile (signup completion) ───────────────────────────────────

  async createProfile(userId: string, input: CreateUserInput): Promise<User> {
    const ts = now();
    const username = input.username.toLowerCase().trim();

    // check availability first (soft check; real safety is DB constraint)
    const available = await this.isUsernameAvailable(username);
    if (!available) {
      throw createError('Username already taken', 409, 'USERNAME_TAKEN');
    }

    const user: User = {
      id: userId,
      username,
      avatar: input.avatar,
      created_at: ts,
      updated_at: ts,
    };

    await this.dynamo.put({
      ...user,

      // primary user record
      PK: `USER#${userId}`,
      SK: `PROFILE`,

      // lookup by id (optional redundancy, depending on your design)
      GSI2PK: userId,

      // username index (critical for uniqueness + search)
      GSI1PK: `USERNAME#${username}`,
      GSI1SK: `USER#${userId}`,
    });

    return user;
  }

  // ─── Update profile (safe patch) ──────────────────────────────────────────

  async update(userId: string, updates: UpdateUserInput): Promise<User> {
    const existing = await this.getById(userId);

    const ts = now();
    const newUsername = updates.username?.toLowerCase().trim();

    // ── Username change flow ────────────────────────────────────────────────
    if (newUsername && newUsername !== existing.username) {
      const available = await this.isUsernameAvailable(newUsername);
      if (!available) {
        throw createError('Username already taken', 409, 'USERNAME_TAKEN');
      }

      // ⚠️ NOTE:
      // In a production-grade system, this should be a TRANSACTION
      // (delete old username key + create new + update user)

      await this.dynamo.put({
        PK: `USERNAME#${newUsername}`,
        SK: `LOCK`,
        GSI1PK: `USERNAME#${newUsername}`,
        GSI1SK: `USER#${userId}`,
      });
    }

    const updated: Partial<User> = {
      username: newUsername ?? existing.username,
      avatar: updates.avatar ?? existing.avatar,
      updated_at: ts,
    };

    await this.dynamo.update({
      pk: `USER#${userId}`,
      sk: `PROFILE`,
      updates: updated,
    });

    return this.getById(userId);
  }

  // ─── Search users (for invites) ──────────────────────────────────────────

  async search(query: string): Promise<User[]> {
    const q = query.toLowerCase().trim();

    if (!q) return [];

    const results = await this.dynamo.query<User>({
      indexName: 'GSI_USERNAME',
      gsiPk: `USERNAME#${q}`,
      gsiPkField: 'GSI1PK',
    });

    return results.slice(0, 10);
  }
}