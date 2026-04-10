import { auth, optionalAuth } from '../../middleware/auth';
import { CognitoLib } from '../../lib/cognito.lib';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { createError } from '../../middleware/asyncHandler';

jest.mock('../lib/cognito.lib');
jest.mock('../lib/dynamodb.lib');
jest.mock('../middleware/asyncHandler', () => ({
  createError: jest.fn((msg, status, code) => ({ msg, status, code })),
}));

const mockVerifyToken = jest.fn();
const mockGet = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  (CognitoLib as jest.Mock).mockImplementation(() => ({
    verifyToken: mockVerifyToken,
  }));

  (DynamoDBLib as jest.Mock).mockImplementation(() => ({
    get: mockGet,
  }));
});

function mockReq(authHeader?: string) {
  return {
    headers: {
      authorization: authHeader,
    },
  } as any;
}

function mockRes() {
  return {} as any;
}

function mockNext() {
  return jest.fn();
}

describe('auth middleware', () => {
  it('rejects missing auth header', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await auth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 401,
        code: 'UNAUTHORIZED',
      })
    );
  });

  it('rejects invalid token', async () => {
    const req = mockReq('Bearer badtoken');
    const res = mockRes();
    const next = mockNext();

    mockVerifyToken.mockRejectedValue(new Error('invalid'));

    await auth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 401,
      })
    );
  });

  it('attaches user and calls next on success', async () => {
    const req = mockReq('Bearer goodtoken');
    const res = mockRes();
    const next = mockNext();

    mockVerifyToken.mockResolvedValue({ sub: 'user-123' });
    mockGet.mockResolvedValue({ id: 'USER#user-123', name: 'Camillus' });

    await auth(req, res, next);

    expect(req.user).toEqual({ id: 'USER#user-123', name: 'Camillus' });
    expect(next).toHaveBeenCalledWith();
  });

  it('fails when user not found', async () => {
    const req = mockReq('Bearer goodtoken');
    const res = mockRes();
    const next = mockNext();

    mockVerifyToken.mockResolvedValue({ sub: 'user-123' });
    mockGet.mockResolvedValue(null);

    await auth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 401,
        code: 'UNAUTHORIZED',
      })
    );
  });
});

describe('optionalAuth middleware', () => {
  it('continues without token', async () => {
    const req = mockReq();
    const next = mockNext();

    await optionalAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('attaches user when token valid', async () => {
    const req = mockReq('Bearer goodtoken');
    const next = mockNext();

    mockVerifyToken.mockResolvedValue({ sub: 'user-123' });
    mockGet.mockResolvedValue({ id: 'USER#user-123' });

    await optionalAuth(req, mockRes(), next);

    expect(req.user).toEqual({ id: 'USER#user-123' });
  });

  it('silently ignores invalid token', async () => {
    const req = mockReq('Bearer badtoken');
    const next = mockNext();

    mockVerifyToken.mockRejectedValue(new Error('invalid'));

    await optionalAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});