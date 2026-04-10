import JSZip from 'jszip';
import { DownloadService } from '../../services/download.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';
import { S3Lib } from '../../lib/s3.lib';
import { mockTrack, mockCommit } from '../setup';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const mockS3 = new S3Lib('user-1') as jest.Mocked<InstanceType<typeof S3Lib>>;
const service = new DownloadService(mockDynamo, mockS3);

beforeEach(() => jest.clearAllMocks());

describe('DownloadService.buildZip', () => {
  it('throws BAD_REQUEST when no trackIds provided', async () => {
    await expect(service.buildZip('project-1', [], 'current')).rejects.toMatchObject({
      statusCode: 400, code: 'BAD_REQUEST',
    });
  });

  it('adds one file per track with correct filename', async () => {
    mockDynamo.get
      .mockResolvedValueOnce(mockTrack)     // Track lookup
      .mockResolvedValueOnce(mockCommit);   // Commit lookup
    mockS3.getStream.mockResolvedValue(Buffer.from('RIFF_fake_wav'));

    const zip = await service.buildZip('project-1', ['track-test-1'], 'current');

    expect(zip).toBeInstanceOf(JSZip);
    const files = Object.keys(zip.files);
    expect(files).toContain('Kick.wav');
    expect(mockS3.getStream).toHaveBeenCalledWith(mockCommit.file_key);
  });

  it('throws 422 when track has no commit', async () => {
    mockDynamo.get.mockResolvedValue({ ...mockTrack, current_commit_id: undefined });
    await expect(service.buildZip('project-1', ['track-test-1'], 'current')).rejects.toMatchObject({
      statusCode: 422, code: 'NO_COMMITS',
    });
  });

  it('throws NOT_FOUND when commit record missing', async () => {
    mockDynamo.get
      .mockResolvedValueOnce(mockTrack)
      .mockResolvedValueOnce(null); // commit not found
    await expect(service.buildZip('project-1', ['track-test-1'], 'current')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('creates versioned folders when strategy is all', async () => {
    mockDynamo.get.mockResolvedValue(mockTrack);
    mockDynamo.query.mockResolvedValue([
      { ...mockCommit, version_number: 1 },
      { ...mockCommit, id: 'c2', version_number: 2 },
    ]);
    mockS3.getStream.mockResolvedValue(Buffer.from('RIFF_fake'));

    const zip = await service.buildZip('project-1', ['track-test-1'], 'all');
    const files = Object.keys(zip.files);
    expect(files).toContain('Kick/v1.wav');
    expect(files).toContain('Kick/v2.wav');
  });
});
