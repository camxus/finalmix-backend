import { handler } from '../../sqs/aiAnalysisWorker';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { NemotronLib } from '../../lib/nemotron.lib';
import { mockTrack } from '../setup';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const mockNemotron = new NemotronLib() as jest.Mocked<InstanceType<typeof NemotronLib>>;

function sqsEvent(body: object) {
  return { Records: [{ body: JSON.stringify(body) }] };
}

beforeEach(() => jest.clearAllMocks());

describe('aiAnalysisWorker.handler', () => {
  it('sets ai_status to processing, then complete on success', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    mockDynamo.update.mockResolvedValue(undefined);
    mockNemotron.complete.mockResolvedValue(JSON.stringify({
      instrument_type: 'kick drum',
      category: 'drums',
      subcategory: 'kick',
      confidence: 0.95,
      tags: ['punchy'],
      detected_bpm: 128,
      detected_key: null,
    }));
    mockNemotron.parseJSON.mockImplementation((raw: string) => JSON.parse(raw));

    await handler(sqsEvent({ trackId: 'track-test-1', commitId: 'c1', projectId: 'p1' }));

    const updateCalls = mockDynamo.update.mock.calls.map(c => c[0]);

    // First update: processing
    expect(updateCalls[0].updates).toMatchObject({ ai_status: 'processing' });

    // Final update: complete with ai_data
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate.updates).toMatchObject({ ai_status: 'complete' });
    expect(finalUpdate.updates.ai_data).toBeDefined();
  });

  it('sets ai_status to failed when Nemotron throws', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    mockNemotron.complete.mockRejectedValue(new Error('upstream timeout'));
    mockDynamo.update.mockResolvedValue(undefined);

    await handler(sqsEvent({ trackId: 'track-test-1', commitId: 'c1', projectId: 'p1' }));

    const updateCalls = mockDynamo.update.mock.calls.map(c => c[0]);
    const failCall = updateCalls.find(c => c.updates?.ai_status === 'failed');
    expect(failCall).toBeDefined();
    expect(failCall!.updates.ai_error).toContain('upstream timeout');
  });

  it('is idempotent — processes even if ai_status is already complete', async () => {
    mockDynamo.get.mockResolvedValue({ ...mockTrack, ai_status: 'complete' });
    mockDynamo.update.mockResolvedValue(undefined);
    mockNemotron.complete.mockResolvedValue(JSON.stringify({
      instrument_type: 'kick', category: 'drums', confidence: 0.9, tags: [],
    }));
    mockNemotron.parseJSON.mockImplementation((raw: string) => JSON.parse(raw));

    await handler(sqsEvent({ trackId: 'track-test-1', commitId: 'c1', projectId: 'p1' }));

    expect(mockNemotron.complete).toHaveBeenCalledTimes(1);
    const finalUpdate = mockDynamo.update.mock.calls.slice(-1)[0][0];
    expect(finalUpdate.updates.ai_status).toBe('complete');
  });

  it('handles invalid JSON in SQS record without throwing', async () => {
    await expect(
      handler({ Records: [{ body: 'not-json' }] })
    ).resolves.not.toThrow();
    expect(mockDynamo.update).not.toHaveBeenCalled();
  });

  it('processes multiple records in one batch', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    mockDynamo.update.mockResolvedValue(undefined);
    mockNemotron.complete.mockResolvedValue(JSON.stringify({
      instrument_type: 'kick', category: 'drums', confidence: 0.9, tags: [],
    }));
    mockNemotron.parseJSON.mockImplementation((raw: string) => JSON.parse(raw));

    await handler({
      Records: [
        { body: JSON.stringify({ trackId: 't1', commitId: 'c1', projectId: 'p1' }) },
        { body: JSON.stringify({ trackId: 't2', commitId: 'c2', projectId: 'p1' }) },
      ],
    });

    expect(mockNemotron.complete).toHaveBeenCalledTimes(2);
  });
});
