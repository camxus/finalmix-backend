import { UsersService } from '../../services/users.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { mockUser } from '../setup';

const mockDynamo = new DynamoDBLib() as jest.Mocked<
  InstanceType<typeof DynamoDBLib>
>;

const service = new UsersService(mockDynamo);

beforeEach(() => jest.clearAllMocks());

describe('UsersService.getById', () => {
  it('returns user by id', async () => {
    mockDynamo.get.mockResolvedValue(mockUser);

    const result = await service.getById('user-test-1');

    expect(mockDynamo.get).toHaveBeenCalledWith({
      pk: 'USER#user-test-1',
      sk: 'PROFILE',
    });

    expect(result).toEqual(mockUser);
  });

  it('returns null when user not found', async () => {
    mockDynamo.get.mockResolvedValue(null);

    const result = await service.getById('missing-user');

    expect(result).toBeNull();
  });
});

describe('UsersService.isUsernameAvailable', () => {
  it('returns false when username exists', async () => {
    mockDynamo.query.mockResolvedValue([mockUser]);

    const result = await service.isUsernameAvailable('john');

    expect(mockDynamo.query).toHaveBeenCalledWith({
      indexName: 'GSI1',
      gsiPk: 'username#john',
      gsiPkField: 'GSI1PK',
    });

    expect(result).toBe(false);
  });

  it('returns true when username is free', async () => {
    mockDynamo.query.mockResolvedValue([]);

    const result = await service.isUsernameAvailable('newuser');

    expect(result).toBe(true);
  });
});

describe('UsersService.createProfile', () => {
  it('creates user profile with username + avatar', async () => {
    mockDynamo.put.mockResolvedValue(undefined);

    const result = await service.createProfile('user-test-1', {
      username: 'john',
      avatar: 'avatar.png',
    });

    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: 'USER#user-test-1',
        SK: 'PROFILE',
        username: 'john',
        avatar: 'avatar.png',
      })
    );

    expect(result.username).toBe('john');
  });

  it('throws if username is already taken', async () => {
    mockDynamo.query.mockResolvedValue([mockUser]);

    await expect(
      service.createProfile('user-test-1', {
        username: 'taken',
        avatar: 'a.png',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'USERNAME_TAKEN',
    });
  });
});

describe('UsersService.update', () => {
  it('updates username and avatar', async () => {
    mockDynamo.update.mockResolvedValue();

    const result = await service.update('user-test-1', {
      username: 'newname',
      avatar: 'new.png',
    });

    expect(mockDynamo.update).toHaveBeenCalledWith({
      pk: 'USER#user-test-1',
      sk: 'PROFILE',
      updates: {
        username: 'newname',
        avatar: 'new.png',
      },
    });

    expect(result.username).toBe('newname');
  });

  it('allows partial updates', async () => {
    mockDynamo.update.mockResolvedValue();

    const result = await service.update('user-test-1', {
      avatar: 'only-avatar.png',
    });

    expect(result.avatar).toBe('only-avatar.png');
  });
});