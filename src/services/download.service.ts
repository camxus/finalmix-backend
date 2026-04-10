import JSZip from 'jszip';
import { type Response } from 'express';
import { DynamoDBLib } from '../lib/dynamodb.lib';
import { S3Lib } from '../lib/s3.lib';
import { createError } from '../middleware/asyncHandler';
import type { Track, AudioCommit } from '../types/models';

export class DownloadService {
  constructor(
    private readonly dynamo: DynamoDBLib,
    private readonly s3: S3Lib,
  ) {}

  async buildZip(
    projectId: string,
    trackIds: string[],
    versionStrategy: 'current' | 'all' = 'current',
  ): Promise<JSZip> {
    if (!trackIds.length) throw createError('No track IDs provided', 400, 'BAD_REQUEST');

    const zip = new JSZip();

    await Promise.all(
      trackIds.map(async trackId => {
        const track = await this.dynamo.get<Track>(`TRACK#${trackId}`, `PROJECT#${projectId}`);
        if (!track) throw createError(`Track ${trackId} not found`, 404, 'NOT_FOUND');

        if (versionStrategy === 'all') {
          const commits = await this.dynamo.query<AudioCommit>({
            pk: `ASSET#${trackId}`,
            skPrefix: 'COMMIT#',
            scanForward: false,
          });
          if (!commits.length) throw createError(`Track ${track.name} has no uploaded files`, 422, 'NO_COMMITS');
          const folder = zip.folder(track.name) ?? zip;
          await Promise.all(
            commits.map(async commit => {
              const buf = await this.s3.getStream(commit.file_key);
              folder.file(`v${commit.version_number}.${commit.format}`, buf);
            })
          );
        } else {
          if (!track.current_commit_id) {
            throw createError(`Track ${track.name} has no uploaded file`, 422, 'NO_COMMITS');
          }
          const commit = await this.dynamo.get<AudioCommit>(
            `ASSET#${trackId}`,
            `COMMIT#${track.current_commit_id}`
          );
          if (!commit) throw createError(`Track ${track.name}: commit not found`, 404, 'NOT_FOUND');
          const buf = await this.s3.getStream(commit.file_key);
          zip.file(`${track.name}.${commit.format}`, buf);
        }
      })
    );

    return zip;
  }

  async streamToResponse(zip: JSZip, res: Response, filename: string): Promise<void> {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true });
    await new Promise<void>((resolve, reject) => {
      stream.pipe(res);
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }
}
