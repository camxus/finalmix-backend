import { DynamoDBLib } from '../lib/dynamodb.lib';
import { newId, now } from '../utils/index';
import { createError } from '../middleware/asyncHandler';
import type { TrackComment, CommentReply, User } from '../types/models';
import { S3Lib } from '@/lib/s3.lib';

export class CommentsService {
  constructor(private readonly dynamo: DynamoDBLib, private readonly s3: S3Lib) { }

  async list(trackId: string, filters?: {
    commitId?: string;
    resolved?: boolean;
  }): Promise<TrackComment[]> {
    const comments = await this.dynamo.query<TrackComment>({
      indexName: 'GSI5',
      gsiPk: trackId,
      gsiPkField: 'GSI5PK',
      gsiSkField: 'GSI5SK',
      scanForward: true,
    });

    const users = await Promise.all(comments.map(c => c.author_id ? this.dynamo.get<User>(`USER#${c.author_id}`, 'PROFILE') : null));
    const updatedComments = await Promise.all(comments.map(async (c, i) => {
      if (users[i]) c.author_avatar_url = await this.s3.presignGet(`avatars/${users[i]!.id}`);
      return c;
    }));

    return updatedComments.filter(c => {
      if (filters?.commitId && c.commit_id !== filters.commitId) return false;
      if (filters?.resolved !== undefined && c.is_resolved !== filters.resolved) return false;
      return true;
    });
  }

  async create(input: {
    projectId: string;
    trackId: string;
    commitId: string;
    timestampSeconds: number;
    body: string;
    authorId?: string;
    authorName: string;
    authorEmail?: string;
  }): Promise<TrackComment> {
    if (!input.body.trim()) throw createError('Comment body cannot be empty', 400, 'BAD_REQUEST');
    if (input.body.length > 2000) throw createError('Comment exceeds 2000 characters', 400, 'BAD_REQUEST');

    const id = newId();
    const ts = now();
    const comment: TrackComment = {
      id,
      project_id: input.projectId,
      track_id: input.trackId,
      commit_id: input.commitId,
      timestamp_seconds: input.timestampSeconds,
      body: input.body.trim(),
      author_id: input.authorId,
      author_name: input.authorName,
      author_email: input.authorEmail,
      is_resolved: false,
      created_at: ts,
      updated_at: ts,
    };

    await this.dynamo.put({
      ...comment,
      PK: `COMMENT#${id}`,
      SK: `TRACK#${input.trackId}`,
      GSI5PK: input.trackId,
      GSI5SK: ts,
      GSI6PK: input.commitId,
      GSI6SK: `COMMENT#${ts}`,
    });

    return comment;
  }

  async update(commentId: string, trackId: string, updates: {
    body?: string;
    is_resolved?: boolean;
    resolved_by?: string;
  }): Promise<void> {
    const final: Record<string, unknown> = { updated_at: now() };
    if (updates.body !== undefined) {
      if (!updates.body.trim()) throw createError('Body cannot be empty', 400, 'BAD_REQUEST');
      final.body = updates.body.trim();
    }
    if (updates.is_resolved !== undefined) {
      final.is_resolved = updates.is_resolved;
      final.resolved_by = updates.is_resolved ? updates.resolved_by : null;
      final.resolved_at = updates.is_resolved ? now() : null;
    }
    await this.dynamo.update({
      pk: `COMMENT#${commentId}`,
      sk: `TRACK#${trackId}`,
      updates: final,
    });
  }

  async delete(commentId: string, trackId: string): Promise<void> {
    await this.dynamo.delete(`COMMENT#${commentId}`, `TRACK#${trackId}`);
    // Also delete all replies
    const replies = await this.getReplies(commentId);
    await Promise.all(replies.map(r => this.dynamo.delete(`REPLY#${r.id}`, `COMMENT#${commentId}`)));
  }

  async addReply(commentId: string, input: {
    body: string;
    authorId?: string;
    authorName: string;
  }): Promise<CommentReply> {
    if (!input.body.trim()) throw createError('Reply cannot be empty', 400, 'BAD_REQUEST');
    const id = newId();
    const ts = now();
    const reply: CommentReply = {
      id,
      comment_id: commentId,
      body: input.body.trim(),
      author_id: input.authorId,
      author_name: input.authorName,
      created_at: ts,
    };
    await this.dynamo.put({
      ...reply,
      PK: `COMMENT#${commentId}`,
      SK: `REPLY#${id}`,
    });
    return reply;
  }

  async getReplies(commentId: string): Promise<CommentReply[]> {
    const results = await this.dynamo.query<CommentReply>({
      pk: `COMMENT#${commentId}`,
      skPrefix: 'REPLY#',
    });

    return await Promise.all(
      results.map(async (r) => {
        if (!r.author_id) return r;

        const author_avatar_url = await this.s3.presignGet(
          `avatars/${r.author_id}`
        );

        return {
          ...r,
          author_avatar_url,
        };
      })
    );
  }

  async deleteReply(replyId: string, commentId: string): Promise<void> {
    await this.dynamo.delete(`COMMENT#${commentId}`, `REPLY#${replyId}`);
  }
}
