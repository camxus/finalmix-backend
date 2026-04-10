import { DynamoDBLib } from '../lib/dynamodb.lib.js';
import { SQSLib } from '../lib/sqs.lib.js';
import { newId, now } from '../utils/index.js';
import { createError } from '../middleware/asyncHandler.js';
import type { Track, AudioCommit, AIStatus } from '../types/models.js';

const AI_QUEUE = process.env.SQS_AI_ANALYSIS_QUEUE_URL ?? '';

export class TracksService {
  constructor(
    private readonly dynamo: DynamoDBLib,
    private readonly sqs: SQSLib,
  ) {}

  async listByProject(projectId: string): Promise<Track[]> {
    return this.dynamo.query<Track>({
      pk: `PROJECT#${projectId}`,
      skPrefix: 'TRACK#',
      indexName: 'GSI2',
      gsiPk: projectId,
      gsiPkField: 'GSI2PK',
    });
  }

  async getById(projectId: string, trackId: string): Promise<Track> {
    const track = await this.dynamo.get<Track>(`TRACK#${trackId}`, `PROJECT#${projectId}`);
    if (!track) throw createError('Track not found', 404, 'NOT_FOUND');
    return track;
  }

  async create(projectId: string, input: {
    name: string;
    color?: string;
    orderIndex?: number;
    stemId?: string;
    isPlaceholder?: boolean;
  }): Promise<Track> {
    const id = newId();
    const ts = now();
    const track: Track = {
      id,
      project_id: projectId,
      name: input.name,
      color: input.color,
      order_index: input.orderIndex ?? 0,
      stem_id: input.stemId,
      is_placeholder: input.isPlaceholder ?? false,
      ai_status: 'pending',
      user_tags: [],
      created_at: ts,
      updated_at: ts,
    };
    await this.dynamo.put({
      ...track,
      PK: `TRACK#${id}`,
      SK: `PROJECT#${projectId}`,
      GSI2PK: projectId,
      GSI2SK: `TRACK#${ts}`,
    });
    return track;
  }

  async update(projectId: string, trackId: string, updates: Partial<Pick<Track,
    'name' | 'color' | 'order_index' | 'stem_id' | 'user_tags' | 'current_commit_id'
  >>): Promise<void> {
    await this.dynamo.update({
      pk: `TRACK#${trackId}`,
      sk: `PROJECT#${projectId}`,
      updates: { ...updates, updated_at: now() },
    });
  }

  async batchRename(projectId: string, updates: { id: string; name: string }[]): Promise<void> {
    if (!updates.length) throw createError('No updates provided', 400, 'BAD_REQUEST');
    const ts = now();
    await Promise.all(
      updates.map(u =>
        this.dynamo.update({
          pk: `TRACK#${u.id}`,
          sk: `PROJECT#${projectId}`,
          updates: { name: u.name, updated_at: ts },
        })
      )
    );
  }

  async delete(projectId: string, trackId: string): Promise<void> {
    await this.dynamo.delete(`TRACK#${trackId}`, `PROJECT#${projectId}`);
  }

  async setAIStatus(
    projectId: string,
    trackId: string,
    status: AIStatus,
    extra?: Record<string, unknown>
  ): Promise<void> {
    await this.dynamo.update({
      pk: `TRACK#${trackId}`,
      sk: `PROJECT#${projectId}`,
      updates: { ai_status: status, updated_at: now(), ...extra },
    });
  }

  async enqueueAIAnalysis(trackId: string, commitId: string, projectId: string): Promise<void> {
    if (!AI_QUEUE) return;
    await this.setAIStatus(projectId, trackId, 'pending');
    await this.sqs.send(AI_QUEUE, { trackId, commitId, projectId }, `${trackId}-${commitId}`);
  }

  async getCommits(trackId: string): Promise<AudioCommit[]> {
    return this.dynamo.query<AudioCommit>({
      pk: `ASSET#${trackId}`,
      skPrefix: 'COMMIT#',
      scanForward: false,
    });
  }

  async getCommit(trackId: string, commitId: string): Promise<AudioCommit | null> {
    return this.dynamo.get<AudioCommit>(`ASSET#${trackId}`, `COMMIT#${commitId}`);
  }

  async createCommit(commit: Omit<AudioCommit, 'id' | 'created_at'> & { id?: string }): Promise<AudioCommit> {
    const id = commit.id ?? newId();
    const ts = now();
    const full: AudioCommit = { ...commit, id, created_at: ts };
    await this.dynamo.put({
      ...full,
      PK: `ASSET#${full.asset_id}`,
      SK: `COMMIT#${id}`,
      GSI5PK: full.asset_id,
      GSI5SK: ts,
    });
    return full;
  }

  async checkoutCommit(projectId: string, trackId: string, commitId: string): Promise<void> {
    const commit = await this.getCommit(trackId, commitId);
    if (!commit) throw createError('Commit not found', 404, 'NOT_FOUND');
    await this.update(projectId, trackId, { current_commit_id: commitId });
  }
}
