import { type Response } from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/asyncHandler';
import { createError } from '../middleware/asyncHandler';
import { AuthenticatedRequest } from '../middleware/auth';

// ─── Constants ────────────────────────────────────────────────────────────────

const REGION      = process.env.AWS_REGION ?? 'eu-west-1';
const BUCKET      = process.env.S3_BUCKET  ?? 'mixvault-audio-dev';
const TEMP_BUCKET = process.env.S3_TEMP_BUCKET ?? process.env.S3_BUCKET ?? 'mixvault-audio-dev';
const PRESIGN_TTL = parseInt(process.env.S3_PRESIGN_EXPIRES_SECONDS ?? '3600', 10);

const MAX_AUDIO_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_IMAGE_BYTES =   5 * 1024 * 1024; //   5 MB

const AUDIO_MIME = new Set([
  'audio/wav', 'audio/x-wav', 'audio/aiff', 'audio/x-aiff',
  'audio/flac', 'audio/mpeg', 'audio/ogg',
]);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
  'audio/flac': 'flac', 'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

const s3 = new S3Client({ region: REGION });

// ─── Multer-S3 instance — direct upload to S3 (no tmp disk) ──────────────────

function buildS3Upload(bucketOverride?: string) {
  return multer({
    storage: multerS3({
      s3,
      bucket: bucketOverride ?? BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key(_req, file, cb) {
        const ext = MIME_TO_EXT[file.mimetype] ?? path.extname(file.originalname).slice(1) ?? 'bin';
        cb(null, `temp/${crypto.randomUUID()}.${ext}`);
      },
    }),
    limits: { fileSize: MAX_AUDIO_BYTES },
    fileFilter(_req, file, cb) {
      const allowed = new Set([...AUDIO_MIME, ...IMAGE_MIME]);
      if (!allowed.has(file.mimetype)) {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      } else {
        cb(null, true);
      }
    },
  });
}

export const uploadSingle = buildS3Upload().single('file');
export const uploadImage  = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key(_req, file, cb) {
      const ext = MIME_TO_EXT[file.mimetype] ?? 'jpg';
      cb(null, `covers/${crypto.randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter(_req, file, cb) {
    if (!IMAGE_MIME.has(file.mimetype)) cb(new Error(`Unsupported image type: ${file.mimetype}`));
    else cb(null, true);
  },
}).single('file');

// ─── POST /upload/presign ─────────────────────────────────────────────────────
// Returns a presigned PUT URL. Client uploads directly to S3, then calls /upload/confirm.

export const presign = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId, assetId, assetType, contentType, fileSizeBytes } = req.body as {
    projectId: string;
    assetId: string;
    assetType: 'track' | 'stem' | 'master';
    contentType: string;
    fileSizeBytes: number;
  };

  if (!AUDIO_MIME.has(contentType)) {
    throw createError(`Unsupported audio format: ${contentType}`, 400, 'BAD_REQUEST');
  }

  const maxBytes = MAX_AUDIO_BYTES;
  if (fileSizeBytes > maxBytes) {
    throw createError(
      `File too large. Maximum is ${maxBytes / 1024 / 1024} MB`,
      413,
      'FILE_TOO_LARGE',
    );
  }

  // Quota check — fetch user's current usage from DynamoDB
  const { DynamoDBLib } = await import('../lib/dynamodb.lib');
  const dynamo = new DynamoDBLib();
  const user = await dynamo.get<{ storage_used_bytes: number; storage_quota_bytes: number }>(
    `USER#${req.user!.id}`,
    'PROFILE',
  );
  const quota = user?.storage_quota_bytes ?? 50 * 1024 * 1024 * 1024;
  const used  = user?.storage_used_bytes  ?? 0;

  if (used + fileSizeBytes > quota) {
    throw createError('Storage quota exceeded', 402, 'QUOTA_EXCEEDED');
  }

  const ext      = MIME_TO_EXT[contentType] ?? 'wav';
  const commitId = crypto.randomUUID();
  const userId   = req.user!.id;

  const keyMap: Record<string, string> = {
    track:  `users/${userId}/projects/${projectId}/tracks/${assetId}/${commitId}.${ext}`,
    stem:   `users/${userId}/projects/${projectId}/stems/${assetId}/${commitId}.${ext}`,
    master: `users/${userId}/projects/${projectId}/master/${commitId}.${ext}`,
  };

  const fileKey  = keyMap[assetType];
  if (!fileKey) throw createError('Invalid asset type', 400, 'BAD_REQUEST');

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: fileKey, ContentType: contentType }),
    { expiresIn: PRESIGN_TTL },
  );

  res.json({ uploadUrl, fileKey, commitId });
};

// ─── POST /upload/confirm ─────────────────────────────────────────────────────
// Called after client finishes the S3 PUT. Creates the AudioCommit record
// and queues waveform + AI analysis jobs.

export const confirm = async (req: AuthenticatedRequest, res: Response) => {
  const {
    projectId, assetId, assetType,
    commitId, fileKey, versionNumber, commitMessage,
    fileSizeBytes, durationSeconds, format, sampleRate, channels,
  } = req.body as {
    projectId: string; assetId: string; assetType: 'track' | 'stem' | 'master';
    commitId: string; fileKey: string; versionNumber: number; commitMessage?: string;
    fileSizeBytes: number; durationSeconds: number; format: string;
    sampleRate: number; channels: number;
  };

  const { UploadService } = await import('../services/upload.service');
  const { DynamoDBLib }   = await import('../lib/dynamodb.lib');
  const { S3Lib }         = await import('../lib/s3.lib');
  const { SQSLib }        = await import('../lib/sqs.lib');

  const dynamo  = new DynamoDBLib();
  const s3Lib   = new S3Lib(req.user!.id);
  const sqs     = new SQSLib();
  const service = new UploadService(dynamo, s3Lib, sqs);

  await service.confirm({
    userId: req.user!.id,
    projectId, assetId, assetType,
    commitId, fileKey, versionNumber, commitMessage,
    fileSizeBytes, durationSeconds, format, sampleRate, channels,
  });

  res.json({ confirmed: true });
});

// ─── POST /projects/:pid/cover ────────────────────────────────────────────────
// Presign for a cover image upload.

export const presignCover = async (req: AuthenticatedRequest, res: Response) => {
  const { contentType } = req.body as { contentType: string };

  if (!IMAGE_MIME.has(contentType)) {
    throw createError(`Unsupported image format: ${contentType}`, 400, 'BAD_REQUEST');
  }

  const ext     = MIME_TO_EXT[contentType] ?? 'jpg';
  const fileKey = `users/${req.user!.id}/projects/${req.params.pid}/cover.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: fileKey, ContentType: contentType }),
    { expiresIn: 3600 },
  );

  res.json({ uploadUrl, fileKey });
};

// ─── DELETE /projects/:pid/cover ──────────────────────────────────────────────

export const deleteCover = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.project?.cover_image_key) {
    res.status(204).send();
    return;
  }

  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: req.project.cover_image_key }),
  );

  const { DynamoDBLib } = await import('../lib/dynamodb.lib');
  const dynamo = new DynamoDBLib();
  await dynamo.update({
    pk: `PROJECT#${req.params.pid}`,
    sk: `USER#${req.user!.id}`,
    updates: { cover_image_url: null, cover_image_key: null },
  });

  res.status(204).send();
};

// ─── POST /upload/presign-post ────────────────────────────────────────────────
// Alternative presigned POST endpoint matching the reference auth controller pattern.
// Enforces user-prefix key and file size server-side.

export const presignPost = async (req: AuthenticatedRequest, res: Response) => {
  const { key, contentType } = req.query as { key: string; contentType: string };

  if (!key || !contentType) {
    throw createError('key and contentType query params are required', 400, 'BAD_REQUEST');
  }

  const userId = req.user!.id;
  if (!key.startsWith(`${userId}/`)) {
    throw createError('Key must be prefixed with your user ID', 403, 'FORBIDDEN');
  }

  const { createPresignedPost } = await import('@aws-sdk/s3-presigned-post');

  const result = await createPresignedPost(s3 as any, {
    Bucket: TEMP_BUCKET,
    Key: key,
    Conditions: [
      ['content-length-range', 0, MAX_AUDIO_BYTES],
      ['eq', '$Content-Type', contentType],
      ['starts-with', '$key', `${userId}/`],
    ],
    Fields: { 'Content-Type': contentType },
    Expires: 300,
  });

  res.json({
    upload_url: result.url,
    fields: result.fields,
    key,
    max_size: MAX_AUDIO_BYTES,
  });
};
