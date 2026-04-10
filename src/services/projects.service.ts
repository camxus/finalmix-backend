import { DynamoDBLib } from '../lib/dynamodb.lib';
import { newId, now } from '../utils/index';
import { createError } from '../middleware/asyncHandler';
import type { Project, ProjectStatus, ProjectVisibility } from '../types/models';

export interface CreateProjectInput {
  title: string;
  artist?: string;
  client?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  year?: number;
  bpm?: number;
  key?: string;
  genre?: string[];
  custom_tags?: string[];
  notes?: string;
  collection_id?: string;
}

export class ProjectsService {
  constructor(private readonly dynamo: DynamoDBLib) {}

  async list(userId: string, filters?: {
    status?: ProjectStatus;
    year?: number;
    search?: string;
  }): Promise<Project[]> {
    const all = await this.dynamo.query<Project>({
      indexName: 'GSI1',
      gsiPk: userId,
      gsiPkField: 'GSI1PK',
      gsiSkField: 'GSI1SK',
    });
    return all.filter(p => {
      if (filters?.status && p.status !== filters.status) return false;
      if (filters?.year && p.year !== filters.year) return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !(p.artist ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  async getById(projectId: string, userId?: string): Promise<Project> {
    const projects = await this.dynamo.query<Project>({
      indexName: 'GSI2',
      gsiPk: projectId,
      gsiPkField: 'GSI2PK',
    });
    const project = projects.find(p => p.id === projectId) ?? null;
    if (!project) throw createError('Project not found', 404, 'NOT_FOUND');
    if (userId && project.owner_id !== userId && project.visibility === 'private') {
      throw createError('Access denied', 403, 'FORBIDDEN');
    }
    return project;
  }

  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    const id = newId();
    const ts = now();
    const project: Project = {
      id,
      owner_id: userId,
      title: input.title,
      artist: input.artist,
      client: input.client,
      status: input.status ?? 'wip',
      visibility: input.visibility ?? 'private',
      year: input.year,
      bpm: input.bpm,
      key: input.key,
      genre: input.genre ?? [],
      custom_tags: input.custom_tags ?? [],
      notes: input.notes,
      collection_id: input.collection_id,
      created_at: ts,
      updated_at: ts,
    };
    await this.dynamo.put({
      ...project,
      PK: `PROJECT#${id}`,
      SK: `USER#${userId}`,
      GSI1PK: userId,
      GSI1SK: ts,
      GSI2PK: id,
    });
    return project;
  }

  async update(projectId: string, userId: string, updates: Partial<Omit<Project,
    'id' | 'owner_id' | 'created_at'
  >>): Promise<void> {
    await this.dynamo.update({
      pk: `PROJECT#${projectId}`,
      sk: `USER#${userId}`,
      updates: { ...updates, updated_at: now() },
    });
  }

  async delete(projectId: string, userId: string): Promise<void> {
    await this.dynamo.delete(`PROJECT#${projectId}`, `USER#${userId}`);
  }
}
