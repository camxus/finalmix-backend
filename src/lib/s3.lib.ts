import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET ?? 'mixvault-audio-dev';
const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const PRESIGN_TTL = parseInt(process.env.S3_PRESIGN_EXPIRES_SECONDS ?? '3600', 10);

export class S3Lib {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly userId: string, bucket: string = BUCKET) {
    this.client = new S3Client({ region: REGION });
    this.bucket = bucket;
  }

  async presignPut(key: string, contentType: string, expiresIn: number = PRESIGN_TTL): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn }
    );
  }

  async presignGet(key: string, expiresIn: number = PRESIGN_TTL): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn }
    );
  }

  async getStream(key: string): Promise<Buffer> {
    const result: GetObjectCommandOutput = await this.withRetry(() =>
      this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    );
    if (!result.Body) throw new Error(`S3 object not found: ${key}`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async deleteObject(key: string): Promise<void> {
    await this.withRetry(() =>
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    );
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: unknown) {
        const isTransient =
          err instanceof Error &&
          (err.message.includes('503') || err.message.includes('throttl'));
        if (!isTransient || i === attempts - 1) throw err;
        await new Promise(r => setTimeout(r, 100 * 2 ** i));
      }
    }
    throw new Error('unreachable');
  }
}
