import { projectAccess, requireOwner, requireReadAccess } from '../../middleware/projectAccess';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { createError } from '../../middleware/asyncHandler';
import crypto from 'crypto';

jest.mock('../lib/dynamodb.lib');
jest.mock('../middleware/asyncHandler', () => ({
  createError: jest.fn((msg, status, code) => ({ msg, status, code })),
}));

const mockGet = jest.fn();
const mockQuery = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();

  (DynamoDBLib as jest.Mock).mockImplementation(() => ({
    get: mockGet,
    query: mockQuery,
    update: mockUpdate,
  }));
});

function mockReq(overrides: any = {}) {
  return {
    params: {},
    query: {},
    headers: {},
    user: undefined,
    ...overrides,
  } as any;
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as any;
}

function mockNext() {
  return jest.fn();
}

describe('projectAccess middleware', () => {
  const project = {
    id: 'p1',
    owner_id: 'user-1',
  };

  it('returns 400 if pid missing', async () => {
    const req = mockReq();
    const next = mockNext();

    await projectAccess(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'BAD_REQUEST' })
    );
  });

  it('returns 404 if project not found', async () => {
    const req = mockReq({ params: { pid: 'p1' } });
    const next = mockNext();

    mockQuery.mockResolvedValue([]);

    await projectAccess(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' })
    );
  });

  it('grants OWNER access', async () => {
    const req = mockReq({
      params: { pid: 'p1' },
      user: { id: 'user-1' },
    });
    const next = mockNext();

    mockQuery.mockResolvedValue([project]);

    await projectAccess(req, mockRes(), next);

    expect(req.project).toEqual(project);
    expect(req.projectAccess).toBe('owner');
    expect(next).toHaveBeenCalledWith();
  });

  it('grants MEMBER access', async () => {
    const req = mockReq({
      params: { pid: 'p1' },
      user: { id: 'user-2' },
    });
    const next = mockNext();

    mockQuery.mockResolvedValue([project]);
    mockGet.mockResolvedValue({ accepted_at: '2025-01-01' });

    await projectAccess(req, mockRes(), next);

    expect(req.projectAccess).toBe('member');
    expect(req.project).toEqual(project);
  });

  it('grants SHARE token access', async () => {
    const shareToken = 'my-token';
    const hash = crypto.createHash('sha256').update(shareToken).digest('hex');

    const req = mockReq({
      params: { pid: 'p1' },
      query: { token: shareToken },
    });

    const next = mockNext();

    mockQuery.mockResolvedValue([project]);
    mockGet.mockImplementation((pk: string) => {
      if (pk.startsWith('SHARE#')) {
        return Promise.resolve({
          is_revoked: false,
          access_count: 1,
          expires_at: new Date(Date.now() + 100000).toISOString(),
        });
      }
      return null;
    });

    await projectAccess(req, mockRes(), next);

    expect(req.projectAccess).toBe('share');
    expect(req.project).toEqual(project);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('denies access if no match', async () => {
    const req = mockReq({
      params: { pid: 'p1' },
      user: { id: 'user-2' },
    });

    const next = mockNext();

    mockQuery.mockResolvedValue([project]);
    mockGet.mockResolvedValue(null);

    await projectAccess(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
    );
  });
});

describe('requireOwner middleware', () => {
  it('blocks non-owner', () => {
    const req = mockReq({ projectAccess: 'member' });
    const res = mockRes();
    const next = mockNext();

    requireOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' })
    );
  });

  it('allows owner', () => {
    const req = mockReq({ projectAccess: 'owner' });
    const res = mockRes();
    const next = mockNext();

    requireOwner(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireReadAccess middleware', () => {
  it('blocks when no access', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    requireReadAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows any access level', () => {
    const req = mockReq({ projectAccess: 'member' });
    const res = mockRes();
    const next = mockNext();

    requireReadAccess(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});