import { DynamoDBLib } from '../lib/dynamodb.lib';
import { S3Lib } from '../lib/s3.lib';
import { SQSLib } from '../lib/sqs.lib';
import { newId, now, s3Keys, AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, MIME_TO_EXT } from '../utils/index';
import { createError } from '../middleware/asyncHandler';
import type { User, AssetType } from '../types/models';

const WAVEFORM_QUEUE = process.env.SQS_WAVEFORM_QUEUE_URL ?? '';
const AI_QUEUE = process.env.SQS_AI_ANALYSIS_QUEUE_URL ?? '';
const QUOTA_DEFAULT = 50 * 1024 * 1024 * 1024; // 50 GB

export interface PresignResult {
  uploadUrl: string;
  fileKey: string;
  commitId: string;
}

export class UploadService {
  constructor(
    private readonly dynamo: DynamoDBLib,
    private readonly s3: S3Lib,
    private readonly sqs: SQSLib,
  ) {}

  async presign(input: {
    user: User;
    projectId: string;
    assetId: string;
    assetType: AssetType;
    contentType: string;
    fileSizeBytes: number;
    stemId?: string;
  }): Promise<PresignResult> {
    if (!AUDIO_MIME_TYPES.has(input.contentType)) {
      throw createError(`Unsupported audio format: ${input.contentType}`, 400, 'BAD_REQUEST');
    }

    const quota = input.user.storage_quota_bytes ?? QUOTA_DEFAULT;
    if (input.user.storage_used_bytes + input.fileSizeBytes > quota) {
      throw createError('Storage quota exceeded', 402, 'QUOTA_EXCEEDED');
    }

    const ext = MIME_TO_EXT[input.contentType] ?? 'wav';
    const commitId = newId();
    const keys = s3Keys(input.user.id);
    let fileKey: string;

    switch (input.assetType) {
      case 'track':
        fileKey = keys.trackCommit(input.projectId, input.assetId, commitId, ext);
        break;
      case 'stem':
        fileKey = keys.stemCommit(input.projectId, input.assetId, commitId, ext);
        break;
      case 'master':
        fileKey = keys.masterCommit(input.projectId, commitId, ext);
        break;
      default:
        throw createError('Invalid asset type', 400, 'BAD_REQUEST');
    }

    const uploadUrl = await this.s3.presignPut(fileKey, input.contentType);
    return { uploadUrl, fileKey, commitId };
  }

  async confirm(input: {
    userId: string;
    projectId: string;
    assetId: string;
    assetType: AssetType;
    commitId: string;
    fileKey: string;
    versionNumber: number;
    commitMessage?: string;
    fileSizeBytes: number;
    durationSeconds: number;
    format: string;
    sampleRate: number;
    bitDepth?: number;
    channels: number;
  }): Promise<void> {
    const ts = now();
    const fileUrl = await this.s3.presignGet(input.fileKey, 3600 * 24 * 7); // 7-day URL

    await this.dynamo.put({
      id: input.commitId,
      asset_id: input.assetId,
      asset_type: input.assetType,
      version_number: input.versionNumber,
      commit_message: input.commitMessage,
      file_url: fileUrl,
      file_key: input.fileKey,
      file_size_bytes: input.fileSizeBytes,
      duration_seconds: input.durationSeconds,
      format: input.format,
      sample_rate: input.sampleRate,
      bit_depth: input.bitDepth,
      channels: input.channels,
      uploaded_by: input.userId,
      created_at: ts,
      PK: `ASSET#${input.assetId}`,
      SK: `COMMIT#${input.commitId}`,
      GSI5PK: input.assetId,
      GSI5SK: ts,
    });

    // Update asset's current_commit_id
    const pkMap = { track: 'TRACK', stem: 'STEM', master: 'MASTER' };
    await this.dynamo.update({
      pk: `${pkMap[input.assetType]}#${input.assetId}`,
      sk: `PROJECT#${input.projectId}`,
      updates: { current_commit_id: input.commitId, updated_at: ts },
    });

    // Enqueue background jobs
    if (WAVEFORM_QUEUE) {
      await this.sqs.send(WAVEFORM_QUEUE, {
        commitId: input.commitId,
        fileKey: input.fileKey,
        assetId: input.assetId,
        assetType: input.assetType,
      }, input.commitId);
    }

    if (AI_QUEUE && input.assetType === 'track') {
      await this.sqs.send(AI_QUEUE, {
        trackId: input.assetId,
        commitId: input.commitId,
        projectId: input.projectId,
      }, `${input.assetId}-${input.commitId}`);
    }

    // Update storage quota
    await this.dynamo.update({
      pk: `USER#${input.userId}`,
      sk: 'PROFILE',
      updates: { storage_used_bytes: { $add: input.fileSizeBytes } },
    });
  }

  async presignCoverImage(user: User, projectId: string, contentType: string): Promise<PresignResult> {
    if (!IMAGE_MIME_TYPES.has(contentType)) {
      throw createError(`Unsupported image format: ${contentType}`, 400, 'BAD_REQUEST');
    }
    const ext = MIME_TO_EXT[contentType] ?? 'jpg';
    const commitId = newId();
    const fileKey = s3Keys(user.id).cover(projectId, ext);
    const uploadUrl = await this.s3.presignPut(fileKey, contentType);
    return { uploadUrl, fileKey, commitId };
  }
}
