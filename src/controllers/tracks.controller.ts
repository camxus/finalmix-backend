import { type Request, type Response } from 'express';
import { buildSDK } from '../sdk/index';

export async function listTracks(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  const tracks = await sdk.tracks.listByProject(req.params.pid);
  res.json(tracks);
}

export async function getTrack(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  const track = await sdk.tracks.getById(req.params.pid, req.params.id);
  res.json(track);
}

export async function createTrack(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const track = await sdk.tracks.create(req.params.pid, req.body);
  res.status(201).json(track);
}

export async function updateTrack(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.tracks.update(req.params.pid, req.params.id, req.body);
  res.json({ id: req.params.id });
}

export async function deleteTrack(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.tracks.delete(req.params.pid, req.params.id);
  res.status(204).send();
}

export async function batchRename(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const { updates } = req.body as { updates: { id: string; name: string }[] };
  await sdk.tracks.batchRename(req.params.pid, updates);
  res.json({ updated: updates.length });
}

export async function downloadZip(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const { trackIds, versionStrategy = 'current' } = req.body as {
    trackIds: string[];
    versionStrategy?: 'current' | 'all';
  };
  const zip = await sdk.download.buildZip(req.params.pid, trackIds, versionStrategy);
  const filename = `${req.project?.title ?? 'tracks'}_${Date.now()}.zip`.replace(/\s+/g, '_');
  await sdk.download.streamToResponse(zip, res, filename);
}

export async function listCommits(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  const commits = await sdk.tracks.getCommits(req.params.id);
  res.json(commits);
}

export async function checkoutCommit(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.tracks.checkoutCommit(req.params.pid, req.params.id, req.params.cid);
  res.json({ checked_out: req.params.cid });
}
