import { ProjectsService } from '../../services/projects.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { mockProject } from '../setup';
import { createError } from '../../middleware/asyncHandler';

const mockDynamo = new DynamoDBLib() as jest.Mocked<
  InstanceType<typeof DynamoDBLib>
>;

const service = new ProjectsService(mockDynamo);

beforeEach(() => jest.clearAllMocks());

describe('ProjectsService.list', () => {
  it('returns filtered projects by status', async () => {
    mockDynamo.query.mockResolvedValue([
      { ...mockProject, status: 'wip' },
      { ...mockProject, id: 'p2', status: 'done' },
    ]);

    const result = await service.list('user-1', { status: 'wip' });

    expect(result.length).toBe(1);
    expect(result[0].status).toBe('wip');
  });

  it('filters by year', async () => {
    mockDynamo.query.mockResolvedValue([
      { ...mockProject, year: 2023 },
      { ...mockProject, id: 'p2', year: 2024 },
    ]);

    const result = await service.list('user-1', { year: 2024 });

    expect(result.length).toBe(1);
    expect(result[0].year).toBe(2024);
  });

  it('filters by search (title + artist)', async () => {
    mockDynamo.query.mockResolvedValue([
      { ...mockProject, title: 'Drum Loop', artist: 'A' },
      { ...mockProject, id: 'p2', title: 'Bass Line', artist: 'B' },
    ]);

    const result = await service.list('user-1', { search: 'bass' });

    expect(result.length).toBe(1);
    expect(result[0].title).toBe('Bass Line');
  });
});

describe('ProjectsService.getById', () => {
  it('returns project by id', async () => {
    mockDynamo.query.mockResolvedValue([mockProject]);

    const result = await service.getById('p1');

    expect(mockDynamo.query).toHaveBeenCalledWith({
      indexName: 'GSI2',
      gsiPk: 'p1',
      gsiPkField: 'GSI2PK',
    });

    expect(result.id).toBe('p1');
  });

  it('throws NOT_FOUND when project missing', async () => {
    mockDynamo.query.mockResolvedValue([]);

    await expect(service.getById('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('blocks private project access for non-owner', async () => {
    mockDynamo.query.mockResolvedValue([
      { ...mockProject, visibility: 'private', owner_id: 'owner-1' },
    ]);

    await expect(
      service.getById('p1', 'other-user')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('ProjectsService.create', () => {
  it('creates a project with defaults', async () => {
    mockDynamo.put.mockResolvedValue(undefined);

    const result = await service.create('user-1', {
      title: 'My Project',
    });

    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: expect.stringContaining('PROJECT#'),
        SK: 'USER#user-1',
        title: 'My Project',
        status: 'wip',
        visibility: 'private',
        genre: [],
        custom_tags: [],
      })
    );

    expect(result.title).toBe('My Project');
  });
});

describe('ProjectsService.update', () => {
  it('updates project with timestamp', async () => {
    mockDynamo.update.mockResolvedValue(undefined);

    await service.update('p1', 'user-1', {
      title: 'Updated',
    });

    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'PROJECT#p1',
        sk: 'USER#user-1',
        updates: expect.objectContaining({
          title: 'Updated',
          updated_at: expect.any(String),
        }),
      })
    );
  });
});

describe('ProjectsService.delete', () => {
  it('deletes project', async () => {
    mockDynamo.delete.mockResolvedValue(undefined);

    await service.delete('p1', 'user-1');

    expect(mockDynamo.delete).toHaveBeenCalledWith(
      'PROJECT#p1',
      'USER#user-1'
    );
  });
});