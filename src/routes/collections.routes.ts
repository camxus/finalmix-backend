import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { auth } from '../middleware/auth';
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addProject,
  removeProject,
} from '../controllers/collections.controller';

const r = Router();

// All collection routes require authentication
r.use(auth);

r.get('/',    asyncHandler(listCollections));
r.post('/',   asyncHandler(createCollection));

r.get('/:id',    asyncHandler(getCollection));
r.patch('/:id',  asyncHandler(updateCollection));
r.delete('/:id', asyncHandler(deleteCollection));

r.post('/:id/projects',       asyncHandler(addProject));
r.delete('/:id/projects/:pid', asyncHandler(removeProject));

export default r;
