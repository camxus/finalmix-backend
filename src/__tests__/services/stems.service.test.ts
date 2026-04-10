import { StemsService } from '../../services/stems.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const service = new StemsService(mockDynamo);

const mockStem = {
  id: 'stem-1',
  project_id: 'p1',
  name: 'Drums',
  order_index: 0,
  is_collapsed: false,
  playback_mode: 'grouped' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

describe('StemsService.create', () => {
  it('creates a stem and assigns member tracks', async () => {
    const stem = await service.create('p1', {
      name: 'Drums',
      trackIds: ['t1', 't2', 't3'],
      color: '#5a8ff0',
    });
    expect(stem.name).toBe('Drums');
    expect(stem.playback_mode).toBe('grouped');
    // 1 put for the stem + 3 updates for track assignments
    expect(mockDynamo.put).toHaveBeenCalledTimes(1);
    expect(mockDynamo.update).toHaveBeenCalledTimes(3);
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ pk: 'TRACK#t1', updates: expect.objectContaining({ stem_id: stem.id }) })
    );
  });
});

describe('StemsService.update', () => {
  it('updates stem fields', async () => {
    await service.update('p1', 'stem-1', { name: 'Drum Bus', is_collapsed: true });
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'STEM#stem-1',
        updates: expect.objectContaining({ name: 'Drum Bus', is_collapsed: true }),
      })
    );
  });

  it('adds new member tracks when addTrackIds provided', async () => {
    await service.update('p1', 'stem-1', { addTrackIds: ['t4', 't5'] });
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ pk: 'TRACK#t4', updates: expect.objectContaining({ stem_id: 'stem-1' }) })
    );
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ pk: 'TRACK#t5', updates: expect.objectContaining({ stem_id: 'stem-1' }) })
    );
  });

  it('clears stem_id on removed tracks', async () => {
    await service.update('p1', 'stem-1', { removeTrackIds: ['t1'] });
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ pk: 'TRACK#t1', updates: expect.objectContaining({ stem_id: null }) })
    );
  });
});

describe('StemsService.ungroup', () => {
  it('clears stem_id on all member tracks and deletes the stem', async () => {
    mockDynamo.query.mockResolvedValue([
      { id: 't1', stem_id: 'stem-1' },
      { id: 't2', stem_id: 'stem-1' },
    ]);
    await service.ungroup('p1', 'stem-1');
    expect(mockDynamo.update).toHaveBeenCalledTimes(2);
    expect(mockDynamo.delete).toHaveBeenCalledWith('STEM#stem-1', 'PROJECT#p1');
  });
});

describe('StemsService.checkoutCommit', () => {
  it('sets playback_mode to file and updates current_commit_id', async () => {
    const mockCommit = { id: 'c1', asset_id: 'stem-1', version_number: 2 };
    mockDynamo.get.mockResolvedValue(mockCommit);
    await service.checkoutCommit('p1', 'stem-1', 'c1');
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ current_commit_id: 'c1', playback_mode: 'file' }),
      })
    );
  });

  it('throws NOT_FOUND when commit missing', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.checkoutCommit('p1', 'stem-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
