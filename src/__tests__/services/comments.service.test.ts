import { CommentsService } from '../../services/comments.service';
import { DynamoDBLib } from '../../lib/dynamodb.lib';

const mockDynamo = new DynamoDBLib() as jest.Mocked<InstanceType<typeof DynamoDBLib>>;
const service = new CommentsService(mockDynamo);

const mockComment = {
  id: 'comment-1',
  project_id: 'p1',
  track_id: 'track-1',
  commit_id: 'commit-1',
  timestamp_seconds: 84.5,
  body: 'De-essing needed around 8kHz',
  author_name: 'Client',
  is_resolved: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

describe('CommentsService.create', () => {
  it('creates a comment and returns it', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const comment = await service.create({
      projectId: 'p1',
      trackId: 'track-1',
      commitId: 'commit-1',
      timestampSeconds: 84.5,
      body: 'De-essing needed around 8kHz',
      authorName: 'Client',
    });
    expect(comment.body).toBe('De-essing needed around 8kHz');
    expect(comment.timestamp_seconds).toBe(84.5);
    expect(comment.is_resolved).toBe(false);
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: expect.stringMatching(/^COMMENT#/),
        SK: 'TRACK#track-1',
        GSI5PK: 'track-1',
      })
    );
  });

  it('throws BAD_REQUEST for empty body', async () => {
    await expect(service.create({
      projectId: 'p1', trackId: 't1', commitId: 'c1',
      timestampSeconds: 0, body: '  ', authorName: 'X',
    })).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST for body > 2000 chars', async () => {
    await expect(service.create({
      projectId: 'p1', trackId: 't1', commitId: 'c1',
      timestampSeconds: 0, body: 'x'.repeat(2001), authorName: 'X',
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('CommentsService.update', () => {
  it('resolves a comment', async () => {
    await service.update('comment-1', 'track-1', { is_resolved: true, resolved_by: 'owner-1' });
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          is_resolved: true,
          resolved_by: 'owner-1',
          resolved_at: expect.any(String),
        }),
      })
    );
  });

  it('unresolves a comment — clears resolved_by and resolved_at', async () => {
    await service.update('comment-1', 'track-1', { is_resolved: false });
    expect(mockDynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          is_resolved: false,
          resolved_by: null,
          resolved_at: null,
        }),
      })
    );
  });
});

describe('CommentsService.delete', () => {
  it('deletes the comment and all replies', async () => {
    const mockReply = { id: 'reply-1', comment_id: 'comment-1', body: 'ok', author_name: 'X', created_at: '' };
    mockDynamo.query.mockResolvedValue([mockReply]);
    await service.delete('comment-1', 'track-1');
    expect(mockDynamo.delete).toHaveBeenCalledWith('COMMENT#comment-1', 'TRACK#track-1');
    expect(mockDynamo.delete).toHaveBeenCalledWith('REPLY#reply-1', 'COMMENT#comment-1');
  });
});

describe('CommentsService.addReply', () => {
  it('creates and returns a reply', async () => {
    mockDynamo.put.mockResolvedValue(undefined);
    const reply = await service.addReply('comment-1', { body: 'Sounds good!', authorName: 'Engineer' });
    expect(reply.body).toBe('Sounds good!');
    expect(reply.comment_id).toBe('comment-1');
    expect(mockDynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({ SK: 'COMMENT#comment-1' })
    );
  });

  it('throws BAD_REQUEST for empty reply', async () => {
    await expect(
      service.addReply('comment-1', { body: '', authorName: 'X' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
