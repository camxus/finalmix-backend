import { TracksService } from '../../services/tracks.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { SQSLib } from '../../lib/sqs.lib';
import { mockTrack, mockCommit } from '../setup';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const mockSqs = new SQSLib() as jest.Mocked<InstanceType<typeof SQSLib>>;
const service = new TracksService(mockDynamo, mockSqs);

beforeEach(() => jest.clearAllMocks());

describe('TracksService.listByProject', () => {
  it('returns tracks from dynamo query', async () => {
    mockDynamo.query.mockResolvedValue([mockTrack]);
    const result = await service.listByProject('project-test-1');
    expect(result).toEqual([mockTrack]);
    expect(mockDynamo.query).toHaveBeenCalledWith(
      expect.objectContaining({ gsiPk: 'project-test-1' })
    );
  });
});

describe('TracksService.getById', () => {
  it('returns the track when found', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    const result = await service.getById('project-test-1', 'track-test-1');
    expect(result).toEqual(mockTrack);
  });

  it('throws 404 when not found', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.getById('project-test-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('TracksService.create', () => {
  it('puts a new track record and returns it', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const track = await service.create('project-test-1', { name: 'Snare', color: '#5a8ff0' });
    expect(track.name).toBe('Snare');
    expect(track.project_id).toBe('project-test-1');
    expect(track.ai_status).toBe('pending');
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Snare', PK: expect.stringMatching(/^TRACK#/) })
    );
  });
});

describe('TracksService.batchRename', () => {
  it('calls dynamo.update for each track', async () => {
    const updates = [
      { id: 'track-1', name: 'Kick' },
      { id: 'track-2', name: 'Snare' },
    ];
    await service.batchRename('project-test-1', updates);
    expect(mockDynamo.update).toHaveBeenCalledTimes(2);
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ pk: 'TRACK#track-1', updates: expect.objectContaining({ name: 'Kick' }) })
    );
  });

  it('throws BAD_REQUEST if updates array is empty', async () => {
    await expect(service.batchRename('project-test-1', [])).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });
});

describe('TracksService.enqueueAIAnalysis', () => {
  it('sets ai_status to pending and sends SQS message', async () => {
    process.env.SQS_AI_ANALYSIS_QUEUE_URL = 'https://sqs.example.com/ai-queue';
    await service.enqueueAIAnalysis('track-test-1', 'commit-test-1', 'project-test-1');
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({ updates: expect.objectContaining({ ai_status: 'pending' }) })
    );
    expect(mockSqs.send).toHaveBeenCalledWith(
      'https://sqs.example.com/ai-queue',
      expect.objectContaining({ trackId: 'track-test-1' }),
      expect.any(String)
    );
    delete process.env.SQS_AI_ANALYSIS_QUEUE_URL;
  });

  it('silently skips if no queue URL configured', async () => {
    delete process.env.SQS_AI_ANALYSIS_QUEUE_URL;
    await service.enqueueAIAnalysis('track-test-1', 'commit-test-1', 'project-test-1');
    expect(mockSqs.send).not.toHaveBeenCalled();
  });
});

describe('TracksService.checkoutCommit', () => {
  it('updates current_commit_id when commit exists', async () => {
    mockDynamo.get.mockResolvedValue(mockCommit);
    await service.checkoutCommit('project-test-1', 'track-test-1', 'commit-test-1');
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ current_commit_id: 'commit-test-1' }),
      })
    );
  });

  it('throws 404 if commit not found', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(
      service.checkoutCommit('project-test-1', 'track-test-1', 'missing-commit')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
