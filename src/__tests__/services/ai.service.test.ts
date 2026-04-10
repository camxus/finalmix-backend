import { AIService } from '../../services/ai.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { SQSLib } from '../../lib/sqs.lib';
import { NemotronLib } from '../../lib/nemotron.lib';
import { mockTrack } from '../setup';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const mockSqs = new SQSLib() as jest.Mocked<InstanceType<typeof SQSLib>>;
const mockNemotron = new NemotronLib() as jest.Mocked<InstanceType<typeof NemotronLib>>;
const service = new AIService(mockDynamo, mockSqs, mockNemotron);

const validAIResponse = JSON.stringify({
  instrument_type: 'kick drum',
  category: 'drums',
  subcategory: 'kick',
  confidence: 0.95,
  tags: ['punchy', 'sub-heavy'],
  detected_bpm: 128,
  detected_key: null,
});

beforeEach(() => jest.clearAllMocks());

describe('AIService.getTrackAI', () => {
  it('returns ai_status and ai_data from track', async () => {
    const track = { ...mockTrack, ai_status: 'complete' as const, ai_data: { category: 'drums' } };
    mockDynamo.get.mockResolvedValue(track);
    const result = await service.getTrackAI('p1', 'track-test-1');
    expect(result.ai_status).toBe('complete');
    expect(result.ai_data).toEqual({ category: 'drums' });
  });

  it('throws 404 when track not found', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.getTrackAI('p1', 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('AIService.reanalyse', () => {
  it('resets status to pending and enqueues SQS message', async () => {
    process.env.SQS_AI_ANALYSIS_QUEUE_URL = 'https://sqs.example.com/ai';
    mockDynamo.get.mockResolvedValue({ ...mockTrack, current_commit_id: 'c1' });
    await service.reanalyse('p1', 'track-test-1');
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ ai_status: 'pending', ai_error: null }),
      })
    );
    expect(mockSqs.send).toHaveBeenCalledWith(
      'https://sqs.example.com/ai',
      expect.objectContaining({ trackId: 'track-test-1', commitId: 'c1' }),
      expect.any(String)
    );
    delete process.env.SQS_AI_ANALYSIS_QUEUE_URL;
  });

  it('throws 422 when track has no uploaded file', async () => {
    mockDynamo.get.mockResolvedValue({ ...mockTrack, current_commit_id: undefined });
    await expect(service.reanalyse('p1', 'track-test-1')).rejects.toMatchObject({
      statusCode: 422, code: 'NO_COMMITS',
    });
  });
});

describe('AIService.runAnalysis', () => {
  it('writes ai_data and sets status to complete', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    mockNemotron.complete.mockResolvedValue(validAIResponse);
    mockNemotron.parseJSON.mockImplementation((raw: string) => JSON.parse(raw));

    const result = await service.runAnalysis('track-test-1', 'c1', 'p1');

    expect(result.category).toBe('drums');
    expect(result.confidence).toBe(0.95);
    expect(result.analysed_at).toBeDefined();

    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'TRACK#track-test-1',
        updates: expect.objectContaining({ ai_status: 'complete', ai_data: expect.objectContaining({ category: 'drums' }) }),
      })
    );
  });

  it('propagates detected_bpm to the commit record', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    mockNemotron.complete.mockResolvedValue(validAIResponse);
    mockNemotron.parseJSON.mockImplementation((raw: string) => JSON.parse(raw));

    await service.runAnalysis('track-test-1', 'c1', 'p1');

    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'ASSET#track-test-1',
        sk: 'COMMIT#c1',
        updates: expect.objectContaining({ detected_bpm: 128 }),
      })
    );
  });
});

describe('AIService.suggestStems', () => {
  it('throws 422 when no tracks have been analysed', async () => {
    mockDynamo.query.mockResolvedValue([{ ...mockTrack, ai_data: undefined }]);
    await expect(service.suggestStems('p1')).rejects.toMatchObject({
      statusCode: 422, code: 'NO_AI_DATA',
    });
  });

  it('returns suggestions and strips invalid trackIds', async () => {
    const analysed = [
      { ...mockTrack, id: 't1', ai_data: { category: 'drums', tags: [] } },
      { ...mockTrack, id: 't2', ai_data: { category: 'vocals', tags: [] } },
    ];
    mockDynamo.query.mockResolvedValue(analysed);
    mockNemotron.complete.mockResolvedValue(JSON.stringify({
      suggestions: [
        { stemName: 'Drums', trackIds: ['t1', 'INVALID'] },
        { stemName: 'Vocals', trackIds: ['t2'] },
      ],
    }));
    mockNemotron.parseJSON.mockImplementation((raw: string) => JSON.parse(raw));

    const result = await service.suggestStems('p1');

    expect(result.suggestions[0].stemName).toBe('Drums');
    expect(result.suggestions[0].trackIds).toEqual(['t1']); // INVALID stripped
    expect(result.suggestions[1].trackIds).toEqual(['t2']);
  });
});
