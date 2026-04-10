import { type Request, type Response } from 'express';
import { buildSDK } from '../sdk/index.js';

export async function listProjects(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const data = await sdk.projects.list(req.user!.id, {
    status: req.query.status as string | undefined,
    year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
    search: req.query.search as string | undefined,
  } as Parameters<typeof sdk.projects.list>[1]);
  res.json(data);
}

export async function getProject(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user?.id ?? 'anon');
  res.json(req.project);
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  const project = await sdk.projects.create(req.user!.id, req.body);
  res.status(201).json(project);
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.projects.update(req.params.pid, req.user!.id, req.body);
  res.json({ id: req.params.pid });
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  const sdk = buildSDK(req.user!.id);
  await sdk.projects.delete(req.params.pid, req.user!.id);
  res.status(204).send();
}
