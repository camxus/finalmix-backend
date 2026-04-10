import { UploadService } from '../../services/upload.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { S3Lib } from '../../lib/s3.lib';
import { SQSLib } from '../../lib/sqs.lib';
import { mockUser } from '../setup';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const mockS3 = new S3Lib('user-1') as jest.Mocked<InstanceType<typeof S3Lib>>;
const mockSqs = new SQSLib() as jest.Mocked<InstanceType<typeof SQSLib>>;
const service = new UploadService(mockDynamo, mockS3, mockSqs);

beforeEach(() => jest.clearAllMocks());

describe('UploadService.presign', () => {
  it('returns a presigned URL, fileKey, and commitId', async () => {
    mockS3.presignPut.mockResolvedValue('https://s3.example.com/presigned');
    const result = await service.presign({
      user: mockUser,
      projectId: 'p1',
      assetId: 'track-1',
      assetType: 'track',
      contentType: 'audio/wav',
      fileSizeBytes: 5_000_000,
    });
    expect(result.uploadUrl).toBe('https://s3.example.com/presigned');
    expect(result.fileKey).toContain('users/user-test-1/projects/p1/tracks/track-1/');
    expect(result.commitId).toBeTruthy();
  });

  it('throws BAD_REQUEST for unsupported content type', async () => {
    await expect(service.presign({
      user: mockUser,
      projectId: 'p1',
      assetId: 'track-1',
      assetType: 'track',
      contentType: 'video/mp4',
      fileSizeBytes: 1000,
    })).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });

  it('throws QUOTA_EXCEEDED when file would exceed quota', async () => {
    const nearQuotaUser = {
      ...mockUser,
      storage_used_bytes: 49 * 1024 * 1024 * 1024,
      storage_quota_bytes: 50 * 1024 * 1024 * 1024,
    };
    await expect(service.presign({
      user: nearQuotaUser,
      projectId: 'p1',
      assetId: 'track-1',
      assetType: 'track',
      contentType: 'audio/wav',
      fileSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB — would exceed
    })).rejects.toMatchObject({ statusCode: 402, code: 'QUOTA_EXCEEDED' });
  });

  it('generates correct S3 key for master asset type', async () => {
    mockS3.presignPut.mockResolvedValue('https://s3.example.com/master');
    const result = await service.presign({
      user: mockUser,
      projectId: 'p1',
      assetId: 'master-1',
      assetType: 'master',
      contentType: 'audio/wav',
      fileSizeBytes: 50_000_000,
    });
    expect(result.fileKey).toContain('users/user-test-1/projects/p1/master/');
  });
});

describe('UploadService.confirm', () => {
  it('creates commit record, updates asset, and enqueues jobs', async () => {
    process.env.SQS_WAVEFORM_QUEUE_URL = 'https://sqs.example.com/waveform';
    process.env.SQS_AI_ANALYSIS_QUEUE_URL = 'https://sqs.example.com/ai';
    mockS3.presignGet.mockResolvedValue('https://s3.example.com/presigned-get');

    await service.confirm({
      userId: 'user-test-1',
      projectId: 'p1',
      assetId: 'track-1',
      assetType: 'track',
      commitId: 'commit-1',
      fileKey: 'users/u1/projects/p1/tracks/t1/commit-1.wav',
      versionNumber: 1,
      fileSizeBytes: 10_000_000,
      durationSeconds: 222,
      format: 'wav',
      sampleRate: 48000,
      channels: 2,
    });

    // Commit record created
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'commit-1',
        asset_type: 'track',
        PK: 'ASSET#track-1',
        SK: 'COMMIT#commit-1',
      })
    );

    // Asset current_commit_id updated
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'TRACK#track-1',
        updates: expect.objectContaining({ current_commit_id: 'commit-1' }),
      })
    );

    // Both jobs enqueued
    expect(mockSqs.send).toHaveBeenCalledTimes(2);
    const sqsCalls = mockSqs.send.mock.calls.map(c => c[1] as Record<string, unknown>);
    expect(sqsCalls.some(b => b.commitId === 'commit-1')).toBe(true);
    expect(sqsCalls.some(b => b.trackId === 'track-1')).toBe(true);

    delete process.env.SQS_WAVEFORM_QUEUE_URL;
    delete process.env.SQS_AI_ANALYSIS_QUEUE_URL;
  });

  it('does not enqueue AI job for stem or master asset type', async () => {
    process.env.SQS_WAVEFORM_QUEUE_URL = 'https://sqs.example.com/waveform';
    process.env.SQS_AI_ANALYSIS_QUEUE_URL = 'https://sqs.example.com/ai';
    mockS3.presignGet.mockResolvedValue('https://s3.example.com/url');

    await service.confirm({
      userId: 'u1', projectId: 'p1', assetId: 'stem-1', assetType: 'stem',
      commitId: 'c1', fileKey: 'key.wav', versionNumber: 1,
      fileSizeBytes: 1000, durationSeconds: 10, format: 'wav', sampleRate: 44100, channels: 2,
    });

    const sqsCalls = mockSqs.send.mock.calls.map(c => c[1] as Record<string, unknown>);
    expect(sqsCalls.some(b => b.trackId)).toBe(false); // no AI job
    expect(sqsCalls.some(b => b.commitId)).toBe(true);  // waveform job still runs

    delete process.env.SQS_WAVEFORM_QUEUE_URL;
    delete process.env.SQS_AI_ANALYSIS_QUEUE_URL;
  });
});
