import { DynamoDBLib } from '../lib/dynamodb.lib';
import { newId, now } from '../utils/index';
import { createError } from '../middleware/asyncHandler';
import type { Collection } from '../types/models';

export class CollectionsService {
  constructor(private readonly dynamo: DynamoDBLib) {}

  // ── List all collections for a user ─────────────────────────────────────────

  async listByUser(userId: string): Promise<Collection[]> {
    return this.dynamo.query<Collection>({
      indexName: 'GSI1',
      gsiPk:     userId,
      gsiPkField: 'GSI1PK',
      gsiSk:     'COLLECTION#',
      gsiSkField: 'GSI1SK',
    });
  }

  // ── Get single collection ───────────────────────────────────────────────────

  async getById(userId: string, collectionId: string): Promise<Collection> {
    const col = await this.dynamo.get<Collection>(
      `COLLECTION#${collectionId}`,
      `USER#${userId}`,
    );
    if (!col) throw createError('Collection not found', 404, 'NOT_FOUND');
    return col;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    input: {
      name:                  string;
      description?:          string;
      tags?:                 string[];
      cover_art_url?:        string;
      parent_collection_id?: string;
    },
  ): Promise<Collection> {
    if (!input.name?.trim()) {
      throw createError('name is required', 400, 'BAD_REQUEST');
    }

    const id = newId();
    const ts = now();

    const collection: Collection = {
      id,
      owner_id:              userId,
      name:                  input.name.trim(),
      description:           input.description,
      tags:                  input.tags           ?? [],
      cover_art_url:         input.cover_art_url,
      parent_collection_id:  input.parent_collection_id,
      created_at:            ts,
      updated_at:            ts,
    };

    await this.dynamo.put({
      ...collection,
      PK:      `COLLECTION#${id}`,
      SK:      `USER#${userId}`,
      GSI1PK:  userId,
      GSI1SK:  `COLLECTION#${ts}`,
      GSI2PK:  id,
    });

    return collection;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(
    userId:       string,
    collectionId: string,
    updates:      Partial<Pick<Collection, 'name' | 'description' | 'tags' | 'cover_art_url'>>,
  ): Promise<void> {
    // Verify ownership
    await this.getById(userId, collectionId);

    const patch: Record<string, unknown> = { updated_at: now() };
    if (updates.name        !== undefined) patch.name        = updates.name.trim();
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.tags        !== undefined) patch.tags        = updates.tags;
    if (updates.cover_art_url !== undefined) patch.cover_art_url = updates.cover_art_url;

    await this.dynamo.update({
      pk:      `COLLECTION#${collectionId}`,
      sk:      `USER#${userId}`,
      updates: patch,
    });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async delete(userId: string, collectionId: string): Promise<void> {
    await this.getById(userId, collectionId);
    await this.dynamo.delete(`COLLECTION#${collectionId}`, `USER#${userId}`);
  }

  // ── Add project to collection ───────────────────────────────────────────────

  async addProject(
    userId:       string,
    collectionId: string,
    projectId:    string,
  ): Promise<void> {
    await this.getById(userId, collectionId);

    // Update the project record to set collection_id
    // Projects are keyed PROJECT#id / USER#ownerId — find by projectId via GSI2
    const projects = await this.dynamo.query<{ PK: string; SK: string }>({
      indexName:  'GSI2',
      gsiPk:      projectId,
      gsiPkField: 'GSI2PK',
    });

    const proj = projects[0];
    if (!proj) throw createError('Project not found', 404, 'NOT_FOUND');

    // Verify the project belongs to this user
    if (proj.SK !== `USER#${userId}`) {
      throw createError('Access denied', 403, 'FORBIDDEN');
    }

    await this.dynamo.update({
      pk:      proj.PK,
      sk:      proj.SK,
      updates: { collection_id: collectionId, updated_at: now() },
    });
  }

  // ── Remove project from collection ──────────────────────────────────────────

  async removeProject(
    userId:       string,
    collectionId: string,
    projectId:    string,
  ): Promise<void> {
    await this.getById(userId, collectionId);

    const projects = await this.dynamo.query<{ PK: string; SK: string; collection_id?: string }>({
      indexName:  'GSI2',
      gsiPk:      projectId,
      gsiPkField: 'GSI2PK',
    });

    const proj = projects[0];
    if (!proj) throw createError('Project not found', 404, 'NOT_FOUND');

    if (proj.SK !== `USER#${userId}`) {
      throw createError('Access denied', 403, 'FORBIDDEN');
    }

    if (proj.collection_id !== collectionId) {
      throw createError('Project is not in this collection', 422, 'UNPROCESSABLE');
    }

    await this.dynamo.update({
      pk:      proj.PK,
      sk:      proj.SK,
      updates: { collection_id: null, updated_at: now() },
    });
  }
}
