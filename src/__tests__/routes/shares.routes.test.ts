import request from 'supertest';
import { app } from '../../server';
import { mockUser, mockProject } from '../setup';

// Mock auth middleware to inject user
jest.mock('../../middleware/auth', () => ({
  auth: (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
  optionalAuth: (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
}));

// Mock projectAccess middleware
jest.mock('../../middleware/projectAccess', () => ({
  projectAccess: (req: any, _res: any, next: any) => {
    req.project = mockProject;
    req.projectAccess = 'owner';
    next();
  },
  requireOwner: (_req: any, _res: any, next: any) => next(),
  requireReadAccess: (_req: any, _res: any, next: any) => next(),
}));

// Mock SharesService
jest.mock('../../services/shares.service', () => ({
  SharesService: jest.fn().mockImplementation(() => ({
    createShare: jest.fn().mockResolvedValue({
      token: 'xK9mPqRt4nBv8wZyLp3vXcQm7n',
      shareUrl: 'http://localhost:3000/share/xK9mPqRt4nBv8wZyLp3vXcQm7n',
      share: {
        id: 'share-1', project_id: 'project-test-1', permission: 'view',
        is_revoked: false, access_count: 0, created_at: '2026-01-01T00:00:00Z',
      },
    }),
    listShares: jest.fn().mockResolvedValue([]),
    revokeShare: jest.fn().mockResolvedValue(undefined),
    listMembers: jest.fn().mockResolvedValue([]),
    invite: jest.fn().mockResolvedValue({
      id: 'm1', project_id: 'p1', user_id: 'u2', role: 'viewer',
      invited_by: 'u1', invited_at: '2026-01-01T00:00:00Z',
    }),
    removeMember: jest.fn().mockResolvedValue(undefined),
    resolveToken: jest.fn().mockResolvedValue(null),
  })),
}));

describe('POST /api/v1/projects/:pid/shares', () => {
  it('returns 201 with token and shareUrl', async () => {
    const res = await request(app)
      .post('/api/v1/projects/project-test-1/shares')
      .set('Authorization', 'Bearer fake-token')
      .send({ label: 'Client review', permission: 'view' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.shareUrl).toMatch('/share/');
  });
});

describe('GET /api/v1/projects/:pid/shares', () => {
  it('returns 200 with an array', async () => {
    const res = await request(app)
      .get('/api/v1/projects/project-test-1/shares')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('DELETE /api/v1/projects/:pid/shares/:sid', () => {
  it('returns 204', async () => {
    const res = await request(app)
      .delete('/api/v1/projects/project-test-1/shares/share-1')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(204);
  });
});

describe('POST /api/v1/projects/:pid/members', () => {
  it('returns 201 with the new member', async () => {
    const res = await request(app)
      .post('/api/v1/projects/project-test-1/members')
      .set('Authorization', 'Bearer fake-token')
      .send({ userId: 'invited-user-2', role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('viewer');
  });
});

describe('GET /api/v1/share/:token (public)', () => {
  it('returns 403 for invalid token', async () => {
    const res = await request(app).get('/api/v1/share/invalid-token');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

describe('GET /health', () => {
  it('returns 200 with ok: true', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('Unknown routes', () => {
  it('returns 404 with NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
