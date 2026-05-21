import { type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { CollectionsService } from '../services/collections.service';
import { DynamoDBLib } from '../lib/dynamodb.lib';
import type { AuthenticatedRequest } from '../middleware/auth';

const dynamo = new DynamoDBLib();
const service = new CollectionsService(dynamo);

export const listCollections =
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await service.listByUser(req.user!.id);
    res.json(data);
  }


export const getCollection =
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await service.getById(req.user!.id, req.params.id);
    res.json(data);
  }


export const createCollection =
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await service.create(req.user!.id, req.body);
    res.status(201).json(data);
  }


export const updateCollection =
  async (req: AuthenticatedRequest, res: Response) => {
    await service.update(req.user!.id, req.params.id, req.body);
    res.json({ id: req.params.id });
  }


export const deleteCollection =
  async (req: AuthenticatedRequest, res: Response) => {
    await service.delete(req.user!.id, req.params.id);
    res.status(204).send();
  }


export const addProject =
  async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.body as { projectId: string };
    await service.addProject(req.user!.id, req.params.id, projectId);
    res.json({ added: projectId });
  }


export const removeProject =
  async (req: AuthenticatedRequest, res: Response) => {
    await service.removeProject(req.user!.id, req.params.id, req.params.pid);
    res.status(204).send();
  }

