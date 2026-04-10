import { type Request, type Response } from 'express';
import { buildSDK } from '../sdk/index.js';

// ─── Stems ────────────────────────────────────────────────────────────────────

export async function listStems(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  res.json(await sdk.stems.listByProject(req.params.pid));
}

export async function getStem(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  res.json(await sdk.stems.getById(req.params.pid, req.params.id));
}

export async function createStem(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const stem = await sdk.stems.create(req.params.pid, req.body);
  res.status(201).json(stem);
}

export async function updateStem(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.stems.update(req.params.pid, req.params.id, req.body);
  res.json({ id: req.params.id });
}

export async function ungroupStem(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.stems.ungroup(req.params.pid, req.params.id);
  res.status(204).send();
}

export async function listStemCommits(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  res.json(await sdk.stems.getCommits(req.params.id));
}

export async function checkoutStemCommit(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.stems.checkoutCommit(req.params.pid, req.params.id, req.params.cid);
  res.json({ checked_out: req.params.cid });
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function presign(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const result = await sdk.upload.presign({
    user: req.user!,
    projectId: req.body.projectId,
    assetId: req.body.assetId,
    assetType: req.body.assetType,
    contentType: req.body.contentType,
    fileSizeBytes: req.body.fileSizeBytes,
  });
  res.json(result);
}

export async function confirmUpload(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.upload.confirm({ ...req.body, userId: req.user!.id });
  res.json({ confirmed: true });
}

export async function presignCover(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const result = await sdk.upload.presignCoverImage(req.user!, req.params.pid, req.body.contentType);
  res.json(result);
}

export async function deleteCover(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  if (req.project?.cover_image_key) {
    await sdk.s3.deleteObject(req.project.cover_image_key);
    await sdk.projects.update(req.params.pid, req.user!.id, {
      cover_image_url: undefined,
      cover_image_key: undefined,
    });
  }
  res.status(204).send();
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function listComments(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  const comments = await sdk.comments.list(req.params.tid, {
    commitId: req.query.commitId as string | undefined,
    resolved: req.query.resolved !== undefined ? req.query.resolved === 'true' : undefined,
  });
  res.json(comments);
}

export async function createComment(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  const comment = await sdk.comments.create({
    projectId: req.params.pid,
    trackId: req.params.tid,
    ...req.body,
    authorId: req.user?.id,
  });
  res.status(201).json(comment);
}

export async function updateComment(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  await sdk.comments.update(req.params.cid, req.params.tid, {
    ...req.body,
    resolved_by: req.user?.id,
  });
  res.json({ id: req.params.cid });
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  await sdk.comments.delete(req.params.cid, req.params.tid);
  res.status(204).send();
}

export async function addReply(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  const reply = await sdk.comments.addReply(req.params.cid, {
    ...req.body,
    authorId: req.user?.id,
  });
  res.status(201).json(reply);
}

export async function deleteReply(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  await sdk.comments.deleteReply(req.params.rid, req.params.cid);
  res.status(204).send();
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export async function getTrackAI(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  res.json(await sdk.ai.getTrackAI(req.params.pid, req.params.id));
}

export async function reanalyseTrack(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.ai.reanalyse(req.params.pid, req.params.id);
  res.json({ queued: true });
}

export async function suggestStems(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  res.json(await sdk.ai.suggestStems(req.params.pid));
}

// ─── Shares ───────────────────────────────────────────────────────────────────

export async function listShares(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  res.json(await sdk.shares.listShares(req.params.pid));
}

export async function createShare(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const result = await sdk.shares.createShare(req.params.pid, req.user!.id, req.body);
  res.status(201).json(result);
}

export async function revokeShare(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.shares.revokeShare(req.params.pid, req.params.sid);
  res.status(204).send();
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  res.json(await sdk.shares.listMembers(req.params.pid));
}

export async function inviteMember(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const member = await sdk.shares.invite(req.params.pid, req.user!.id, req.body);
  res.status(201).json(member);
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.shares.removeMember(req.params.pid, req.params.uid);
  res.status(204).send();
}

export async function resolveShareToken(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK('anon');
  const share = await sdk.shares.resolveToken(req.params.token);
  if (!share) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Share link is invalid, expired, or revoked' });
    return;
  }
  const project = await sdk.projects.getById(share.project_id);
  const tracks = await sdk.tracks.listByProject(share.project_id);
  const stems = await sdk.stems.listByProject(share.project_id);
  res.json({ project, tracks, stems, permission: share.permission });
}
