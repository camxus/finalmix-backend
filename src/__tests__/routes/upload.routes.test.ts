import request from 'supertest';
import { app } from '../../server';
import { mockUser, mockProject } from '../setup';

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

jest.mock('../../services/upload.service', () => ({
  UploadService: jest.fn().mockImplementation(() => ({
    presign: jest.fn().mockResolvedValue({
      uploadUrl: 'https://s3.example.com/presigned',
      fileKey: 'users/u1/projects/p1/tracks/t1/c1.wav',
      commitId: 'c1',
    }),
    confirm: jest.fn().mockResolvedValue(undefined),
    presignCoverImage: jest.fn().mockResolvedValue({
      uploadUrl: 'https://s3.example.com/cover-presigned',
      fileKey: 'users/u1/projects/p1/cover.jpg',
      commitId: 'img-1',
    }),
  })),
}));

describe('POST /api/v1/upload/presign', () => {
  it('returns uploadUrl, fileKey, and commitId', async () => {
    const res = await request(app)
      .post('/api/v1/upload/presign')
      .set('Authorization', 'Bearer token')
      .send({
        projectId: 'p1',
        assetId: 'track-1',
        assetType: 'track',
        contentType: 'audio/wav',
        fileSizeBytes: 5_000_000,
      });
    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toContain('s3.example.com');
    expect(res.body.commitId).toBe('c1');
  });
});

describe('POST /api/v1/upload/confirm', () => {
  it('returns 200 with confirmed: true', async () => {
    const res = await request(app)
      .post('/api/v1/upload/confirm')
      .set('Authorization', 'Bearer token')
      .send({
        projectId: 'p1',
        assetId: 'track-1',
        assetType: 'track',
        commitId: 'c1',
        fileKey: 'users/u1/projects/p1/tracks/t1/c1.wav',
        versionNumber: 1,
        fileSizeBytes: 5_000_000,
        durationSeconds: 222,
        format: 'wav',
        sampleRate: 48000,
        channels: 2,
      });
    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(true);
  });
});

describe('POST /api/v1/projects/:pid/cover', () => {
  it('returns 200 with uploadUrl', async () => {
    const res = await request(app)
      .post('/api/v1/projects/p1/cover')
      .set('Authorization', 'Bearer token')
      .send({ contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toContain('cover-presigned');
  });
});
