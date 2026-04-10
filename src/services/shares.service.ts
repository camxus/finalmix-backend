import crypto from 'crypto';
import { DynamoDBLib } from '../lib/dynamodb.lib';
import { newId, now } from '../utils/index';
import { createError } from '../middleware/asyncHandler';
import type { ProjectShare, ProjectMember } from '../types/models';

const TOKEN_BYTES = parseInt(process.env.SHARE_TOKEN_BYTES ?? '24', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

export class SharesService {
  constructor(private readonly dynamo: DynamoDBLib) {}

  // ── Share links ─────────────────────────────────────────────────────────────

  async createShare(projectId: string, userId: string, input: {
    label?: string;
    expiresAt?: string;
    permission?: 'view';
  }): Promise<{ token: string; shareUrl: string; share: ProjectShare }> {
    const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url').slice(0, 32);
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const id = newId();
    const ts = now();

    const share: ProjectShare = {
      id,
      project_id: projectId,
      token_hash: hash,
      label: input.label,
      permission: input.permission ?? 'view',
      created_by: userId,
      expires_at: input.expiresAt,
      access_count: 0,
      is_revoked: false,
      created_at: ts,
    };

    await this.dynamo.put({
      ...share,
      PK: `SHARE#${hash}`,
      SK: `PROJECT#${projectId}`,
      GSI3PK: projectId,
      GSI3SK: `SHARE#${ts}`,
    });

    return {
      token: rawToken,
      shareUrl: `${FRONTEND_URL}/share/${rawToken}`,
      share,
    };
  }

  async listShares(projectId: string): Promise<ProjectShare[]> {
    return this.dynamo.query<ProjectShare>({
      indexName: 'GSI3',
      gsiPk: projectId,
      gsiPkField: 'GSI3PK',
      gsiSkField: 'GSI3SK',
      gsiSk: 'SHARE#',
    });
  }

  async revokeShare(projectId: string, shareId: string): Promise<void> {
    const shares = await this.listShares(projectId);
    const share = shares.find(s => s.id === shareId);
    if (!share) throw createError('Share not found', 404, 'NOT_FOUND');
    await this.dynamo.update({
      pk: `SHARE#${share.token_hash}`,
      sk: `PROJECT#${projectId}`,
      updates: { is_revoked: true },
    });
  }

  async resolveToken(token: string): Promise<ProjectShare | null> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    // We need to find the share by hash — scan GSI or use the hash as PK
    // Using token_hash as PK prefix in a query across all projects
    const results = await this.dynamo.query<ProjectShare>({
      pk: `SHARE#${hash}`,
    });
    const share = results[0] ?? null;
    if (!share) return null;
    if (share.is_revoked) return null;
    if (share.expires_at && new Date(share.expires_at) < new Date()) return null;
    return share;
  }

  async recordAccess(shareId: string, tokenHash: string, projectId: string): Promise<void> {
    const share = await this.dynamo.get<ProjectShare>(`SHARE#${tokenHash}`, `PROJECT#${projectId}`);
    if (!share) return;
    await this.dynamo.update({
      pk: `SHARE#${tokenHash}`,
      sk: `PROJECT#${projectId}`,
      updates: {
        last_accessed_at: now(),
        access_count: (share.access_count ?? 0) + 1,
      },
    });
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  async invite(projectId: string, invitedBy: string, input: {
    userId: string;
    role?: 'viewer';
  }): Promise<ProjectMember> {
    const id = newId();
    const ts = now();
    const member: ProjectMember = {
      id,
      project_id: projectId,
      user_id: input.userId,
      role: input.role ?? 'viewer',
      invited_by: invitedBy,
      invited_at: ts,
    };
    await this.dynamo.put({
      ...member,
      PK: `MEMBER#${input.userId}`,
      SK: `PROJECT#${projectId}`,
      GSI4PK: input.userId,
      GSI4SK: `MEMBER#${ts}`,
    });
    return member;
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    return this.dynamo.query<ProjectMember>({
      indexName: 'GSI3',
      gsiPk: projectId,
      gsiPkField: 'GSI3PK',
      gsiSk: 'MEMBER#',
      gsiSkField: 'GSI3SK',
    });
  }

  async getMember(projectId: string, userId: string): Promise<ProjectMember | null> {
    return this.dynamo.get<ProjectMember>(`MEMBER#${userId}`, `PROJECT#${projectId}`);
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.dynamo.delete(`MEMBER#${userId}`, `PROJECT#${projectId}`);
  }
}
