import { type Request, type Response, type NextFunction } from 'express';
import { DynamoDBLib } from '../lib/dynamodb.lib.js';
import { createError } from './asyncHandler.js';
import type { Project, ProjectShare, ProjectMember } from '../types/models.js';
import crypto from 'crypto';

const dynamo = new DynamoDBLib();

export async function projectAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const { pid } = req.params;
    if (!pid) return next(createError('Project ID required', 400, 'BAD_REQUEST'));

    const project = await dynamo.get<Project>(`PROJECT#${pid}`, `USER#placeholder`);
    // Query project by id regardless of owner
    const projects = await dynamo.query<Project>({
      pk: `PROJECT#${pid}`,
      indexName: 'GSI2',
      gsiPk: pid,
      gsiPkField: 'GSI2PK',
    });

    const proj = projects[0] ?? null;
    if (!proj) return next(createError('Project not found', 404, 'NOT_FOUND'));

    // 1. Owner
    if (req.user && proj.owner_id === req.user.id) {
      req.project = proj;
      req.projectAccess = 'owner';
      return next();
    }

    // 2. Member (authenticated user)
    if (req.user) {
      const member = await dynamo.get<ProjectMember>(
        `MEMBER#${req.user.id}`,
        `PROJECT#${pid}`
      );
      if (member?.accepted_at) {
        req.project = proj;
        req.projectAccess = 'member';
        return next();
      }
    }

    // 3. Share token
    const shareToken = (req.query.token ?? req.headers['x-share-token']) as string | undefined;
    if (shareToken) {
      const hash = crypto.createHash('sha256').update(shareToken).digest('hex');
      const share = await dynamo.get<ProjectShare>(`SHARE#${hash}`, `PROJECT#${pid}`);
      if (share && !share.is_revoked) {
        const expired = share.expires_at && new Date(share.expires_at) < new Date();
        if (!expired) {
          req.project = proj;
          req.projectAccess = 'share';
          // fire-and-forget access log
          dynamo.update({
            pk: `SHARE#${hash}`,
            sk: `PROJECT#${pid}`,
            updates: {
              last_accessed_at: new Date().toISOString(),
              access_count: (share.access_count ?? 0) + 1,
            },
          }).catch(() => {});
          return next();
        }
      }
    }

    next(createError('Access denied', 403, 'FORBIDDEN'));
  } catch (err) {
    next(err);
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.projectAccess !== 'owner') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Owner access required' });
    return;
  }
  next();
}

export function requireReadAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.projectAccess) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
    return;
  }
  next();
}
