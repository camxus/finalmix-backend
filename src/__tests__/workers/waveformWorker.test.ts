import { handler } from '../../sqs/waveformWorker';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { S3Lib } from '../../lib/s3.lib';

jest.mock('../../lib/dynamodb.lib');
jest.mock('../../lib/s3.lib');

const mockDynamo = new DynamoDBLib() as jest.Mocked<
  InstanceType<typeof DynamoDBLib>
>;

const mockS3 = new S3Lib('worker') as jest.Mocked<
  InstanceType<typeof S3Lib>
>;

// override module instances used in worker
jest.mock('../../sqs/waveformWorker', () => {
  const original = jest.requireActual('../../sqs/waveformWorker');
  return {
    ...original,
    __setMocks: (d: any, s: any) => {
      (original as any).__dynamo = d;
      (original as any).__S3 = s;
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('waveformWorker.handler', () => {
  it('processes valid SQS record and updates DynamoDB with waveform', async () => {
    mockS3.getStream.mockResolvedValue(Buffer.from([0, 128, 255, 64]));

    mockDynamo.update.mockResolvedValue(undefined);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            commitId: 'commit-1',
            fileKey: 'file.wav',
            assetId: 'track-1',
          }),
        },
      ],
    };

    await handler(event as any);

    expect(mockS3.getStream).toHaveBeenCalledWith('file.wav');

    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'ASSET#track-1',
        sk: 'COMMIT#commit-1',
        updates: expect.objectContaining({
          waveform_data: expect.any(Array),
          updated_at: expect.any(String),
        }),
      })
    );
  });

  it('skips invalid JSON without crashing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const event = {
      Records: [{ body: 'not-json' }],
    };

    await handler(event as any);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid JSON'),
      'not-json'
    );

    consoleSpy.mockRestore();
  });

  it('handles S3 errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    mockS3.getStream.mockRejectedValue(new Error('S3 failure'));

    const event = {
      Records: [
        {
          body: JSON.stringify({
            commitId: 'commit-1',
            fileKey: 'file.wav',
            assetId: 'track-1',
          }),
        },
      ],
    };

    await handler(event as any);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('commit-1'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});