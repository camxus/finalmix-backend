import request from 'supertest';
import { app } from '../../server';
import { mockUser, mockProject, mockTrack, mockCommit } from '../setup';

jest.mock('../../middleware/auth', () => ({
  auth: (req: any, _res: any, next: any) => { req.user = mockUser; next(); },
  optionalAuth: (req: any, _res: any, next: any) => { req.user = mockUser; next(); },
}));

jest.mock('../../middleware/projectAccess', () => ({
  projectAccess: (req: any, _res: any, next: any) => {
    req.project = mockProject; req.projectAccess = 'owner'; next();
  },
  requireOwner: (_req: any, _res: any, next: any) => next(),
  requireReadAccess: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/tracks.service', () => ({
  TracksService: jest.fn().mockImplementation(() => ({
    listByProject: jest.fn().mockResolvedValue([mockTrack]),
    getById: jest.fn().mockResolvedValue(mockTrack),
    create: jest.fn().mockResolvedValue(mockTrack),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    batchRename: jest.fn().mockResolvedValue(undefined),
    getCommits: jest.fn().mockResolvedValue([mockCommit]),
    checkoutCommit: jest.fn().mockResolvedValue(undefined),
    enqueueAIAnalysis: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/download.service', () => ({
  DownloadService: jest.fn().mockImplementation(() => ({
    buildZip: jest.fn().mockResolvedValue({ generateNodeStream: () => ({ pipe: (r: any) => r.end(), on: () => {} }) }),
    streamToResponse: jest.fn().mockImplementation((_zip: any, res: any) => res.end()),
  })),
}));

describe('GET /api/v1/projects/:pid/tracks', () => {
  it('returns 200 with track array', async () => {
    const res = await request(app)
      .get('/api/v1/projects/p1/tracks')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(mockTrack.id);
  });
});

describe('POST /api/v1/projects/:pid/tracks', () => {
  it('returns 201 with created track', async () => {
    const res = await request(app)
      .post('/api/v1/projects/p1/tracks')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Kick', color: '#5a8ff0' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Kick');
  });
});

describe('GET /api/v1/projects/:pid/tracks/:id', () => {
  it('returns 200 with track', async () => {
    const res = await request(app)
      .get('/api/v1/projects/p1/tracks/track-test-1')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('track-test-1');
  });
});

describe('PATCH /api/v1/projects/:pid/tracks/batch', () => {
  it('returns 200 with updated count', async () => {
    const res = await request(app)
      .patch('/api/v1/projects/p1/tracks/batch')
      .set('Authorization', 'Bearer token')
      .send({ updates: [{ id: 'track-test-1', name: 'Kick Drum' }] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
  });
});

describe('GET /api/v1/projects/:pid/tracks/:id/commits', () => {
  it('returns 200 with commits array', async () => {
    const res = await request(app)
      .get('/api/v1/projects/p1/tracks/track-test-1/commits')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(mockCommit.id);
  });
});

describe('PATCH /api/v1/projects/:pid/tracks/:id/commits/:cid/checkout', () => {
  it('returns 200 with checked_out commitId', async () => {
    const res = await request(app)
      .patch('/api/v1/projects/p1/tracks/track-test-1/commits/commit-test-1/checkout')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.checked_out).toBe('commit-test-1');
  });
});

describe('DELETE /api/v1/projects/:pid/tracks/:id', () => {
  it('returns 204', async () => {
    const res = await request(app)
      .delete('/api/v1/projects/p1/tracks/track-test-1')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(204);
  });
});
