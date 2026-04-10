import { DynamoDBLib } from '../lib/dynamodb.lib';
import { newId, now } from '../utils/index';
import { createError } from '../middleware/asyncHandler';
import type { Stem, AudioCommit, Track } from '../types/models';

export class StemsService {
  constructor(private readonly dynamo: DynamoDBLib) {}

  async listByProject(projectId: string): Promise<Stem[]> {
    return this.dynamo.query<Stem>({
      indexName: 'GSI2',
      gsiPk: projectId,
      gsiPkField: 'GSI2PK',
      gsiSk: 'STEM#',
      gsiSkField: 'GSI2SK',
    });
  }

  async getById(projectId: string, stemId: string): Promise<Stem> {
    const stem = await this.dynamo.get<Stem>(`STEM#${stemId}`, `PROJECT#${projectId}`);
    if (!stem) throw createError('Stem not found', 404, 'NOT_FOUND');
    return stem;
  }

  async create(projectId: string, input: {
    name: string;
    trackIds: string[];
    color?: string;
    orderIndex?: number;
  }): Promise<Stem> {
    const id = newId();
    const ts = now();

    const stem: Stem = {
      id,
      project_id: projectId,
      name: input.name,
      color: input.color,
      order_index: input.orderIndex ?? 0,
      is_collapsed: false,
      playback_mode: 'grouped',
      created_at: ts,
      updated_at: ts,
    };

    await this.dynamo.put({
      ...stem,
      PK: `STEM#${id}`,
      SK: `PROJECT#${projectId}`,
      GSI2PK: projectId,
      GSI2SK: `STEM#${ts}`,
    });

    // Assign tracks to this stem
    await Promise.all(
      input.trackIds.map(trackId =>
        this.dynamo.update({
          pk: `TRACK#${trackId}`,
          sk: `PROJECT#${projectId}`,
          updates: { stem_id: id, updated_at: ts },
        })
      )
    );

    return stem;
  }

  async update(projectId: string, stemId: string, updates: Partial<Pick<Stem,
    'name' | 'color' | 'order_index' | 'is_collapsed' | 'playback_mode' | 'current_commit_id'
  >> & { addTrackIds?: string[]; removeTrackIds?: string[] }): Promise<void> {
    const ts = now();

    const { addTrackIds, removeTrackIds, ...stemUpdates } = updates;

    if (Object.keys(stemUpdates).length) {
      await this.dynamo.update({
        pk: `STEM#${stemId}`,
        sk: `PROJECT#${projectId}`,
        updates: { ...stemUpdates, updated_at: ts },
      });
    }

    if (addTrackIds?.length) {
      await Promise.all(
        addTrackIds.map(trackId =>
          this.dynamo.update({
            pk: `TRACK#${trackId}`,
            sk: `PROJECT#${projectId}`,
            updates: { stem_id: stemId, updated_at: ts },
          })
        )
      );
    }

    if (removeTrackIds?.length) {
      await Promise.all(
        removeTrackIds.map(trackId =>
          this.dynamo.update({
            pk: `TRACK#${trackId}`,
            sk: `PROJECT#${projectId}`,
            updates: { stem_id: null, updated_at: ts },
          })
        )
      );
    }
  }

  async ungroup(projectId: string, stemId: string): Promise<void> {
    // Get all member tracks and clear their stem_id
    const tracks = await this.dynamo.query<Track>({
      indexName: 'GSI2',
      gsiPk: projectId,
      gsiPkField: 'GSI2PK',
      filterExpression: 'stem_id = :sid',
      filterValues: { ':sid': stemId },
    });

    const ts = now();
    await Promise.all(
      tracks.map(t =>
        this.dynamo.update({
          pk: `TRACK#${t.id}`,
          sk: `PROJECT#${projectId}`,
          updates: { stem_id: null, updated_at: ts },
        })
      )
    );

    await this.dynamo.delete(`STEM#${stemId}`, `PROJECT#${projectId}`);
  }

  async getCommits(stemId: string): Promise<AudioCommit[]> {
    return this.dynamo.query<AudioCommit>({
      pk: `ASSET#${stemId}`,
      skPrefix: 'COMMIT#',
      scanForward: false,
    });
  }

  async checkoutCommit(projectId: string, stemId: string, commitId: string): Promise<void> {
    const commit = await this.dynamo.get<AudioCommit>(`ASSET#${stemId}`, `COMMIT#${commitId}`);
    if (!commit) throw createError('Commit not found', 404, 'NOT_FOUND');
    await this.update(projectId, stemId, {
      current_commit_id: commitId,
      playback_mode: 'file',
    });
  }
}
