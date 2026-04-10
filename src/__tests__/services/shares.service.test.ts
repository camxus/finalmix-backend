import crypto from 'crypto';
import { SharesService } from '../../services/shares.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const service = new SharesService(mockDynamo);

beforeEach(() => jest.clearAllMocks());

describe('SharesService.createShare', () => {
  it('stores the hashed token and returns the plaintext token', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const result = await service.createShare('project-1', 'user-1', { label: 'Client review' });

    expect(result.token).toHaveLength(32);
    expect(result.shareUrl).toContain('/share/');
    expect(result.share.is_revoked).toBe(false);
    expect(result.share.permission).toBe('view');

    // Stored item must contain the hash, not the plaintext token
    const storedItem = mockDynamo.put.mock.calls[0][0];
    const expectedHash = crypto.createHash('sha256').update(result.token).digest('hex');
    expect(storedItem.token_hash).toBe(expectedHash);
    expect(storedItem.token_hash).not.toBe(result.token);
    expect(storedItem.PK).toBe(`SHARE#${expectedHash}`);
  });

  it('sets label correctly', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const result = await service.createShare('project-1', 'user-1', { label: 'A&R drop' });
    expect(result.share.label).toBe('A&R drop');
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'A&R drop' })
    );
  });

  it('stores expiry when provided', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const expiry = '2026-12-31T00:00:00.000Z';
    const result = await service.createShare('project-1', 'user-1', { expiresAt: expiry });
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: expiry })
    );
  });
});

describe('SharesService.resolveToken', () => {
  it('returns share when valid', async () => {
    const token = 'valid-token-32-chars-long-enough0';
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const mockShare = {
      id: 's1', project_id: 'p1', token_hash: hash,
      permission: 'view', created_by: 'u1',
      access_count: 0, is_revoked: false, created_at: '2026-01-01T00:00:00Z'
    };
    mockDynamo.query.mockResolvedValue([mockShare]);
    const result = await service.resolveToken(token);
    expect(result).toEqual(mockShare);
  });

  it('returns null for a revoked share', async () => {
    mockDynamo.query.mockResolvedValue([{ is_revoked: true, expires_at: null, project_id: 'p1' }]);
    const result = await service.resolveToken('any-token');
    expect(result).toBeNull();
  });

  it('returns null for an expired share', async () => {
    mockDynamo.query.mockResolvedValue([{
      is_revoked: false,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      project_id: 'p1',
    }]);
    const result = await service.resolveToken('any-token');
    expect(result).toBeNull();
  });

  it('returns null when no share found', async () => {
    mockDynamo.query.mockResolvedValue([]);
    const result = await service.resolveToken('unknown-token');
    expect(result).toBeNull();
  });
});

describe('SharesService.revokeShare', () => {
  it('sets is_revoked to true', async () => {
    const mockShare = { id: 'share-1', token_hash: 'abc123', project_id: 'p1', is_revoked: false };
    mockDynamo.query.mockResolvedValue([mockShare]);
    await service.revokeShare('p1', 'share-1');
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ updates: expect.objectContaining({ is_revoked: true }) })
    );
  });

  it('throws NOT_FOUND when share does not exist', async () => {
    mockDynamo.query.mockResolvedValue([]);
    await expect(service.revokeShare('p1', 'missing-share')).rejects.toMatchObject({
      statusCode: 404, code: 'NOT_FOUND',
    });
  });
});

describe('SharesService.invite', () => {
  it('creates a member record', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const member = await service.invite('p1', 'owner-1', { userId: 'invited-user-1' });
    expect(member.user_id).toBe('invited-user-1');
    expect(member.role).toBe('viewer');
    expect(member.accepted_at).toBeUndefined();
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({ PK: 'MEMBER#invited-user-1', SK: 'PROJECT#p1' })
    );
  });
});
