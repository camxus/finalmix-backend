import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { auth, optionalAuth } from '../middleware/auth';
import { projectAccess, requireOwner, requireReadAccess } from '../middleware/projectAccess';

// ── Route modules ─────────────────────────────────────────────────────────────
import authRoutes from './auth.routes';
import collectionsRoutes from './collections.routes';

// ── Controllers ───────────────────────────────────────────────────────────────
import * as projects from '../controllers/projects.controller';
import * as tracks from '../controllers/tracks.controller';
import * as combined from '../controllers/combined.controller';
import * as upload from '../controllers/upload.controller';

const r = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
r.use('/auth', authRoutes);

// ── Collections ───────────────────────────────────────────────────────────────
r.use('/collections', collectionsRoutes);

// ── Projects ──────────────────────────────────────────────────────────────────
r.get('/projects', auth, asyncHandler(projects.listProjects));
r.post('/projects', auth, asyncHandler(projects.createProject));

r.get('/projects/:pid',
  auth, asyncHandler(projectAccess), asyncHandler(projects.getProject));
r.patch('/projects/:pid',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(projects.updateProject));
r.delete('/projects/:pid',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(projects.deleteProject));

// Cover image
r.post('/projects/:pid/cover',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(upload.presignCover));
r.delete('/projects/:pid/cover',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(upload.deleteCover));

// ── Tracks ────────────────────────────────────────────────────────────────────
r.get('/projects/:pid/tracks',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(tracks.listTracks));
r.post('/projects/:pid/tracks',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(tracks.createTrack));

// Batch ops — must come BEFORE /:id routes
r.patch('/projects/:pid/tracks/batch',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(tracks.batchRename));
r.post('/projects/:pid/tracks/download',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(tracks.downloadZip));

r.get('/projects/:pid/tracks/:id',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(tracks.getTrack));
r.patch('/projects/:pid/tracks/:id',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(tracks.updateTrack));
r.delete('/projects/:pid/tracks/:id',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(tracks.deleteTrack));

// Track commits
r.get('/projects/:pid/tracks/:id/commit/:cid',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(tracks.getCommit));
r.get('/projects/:pid/tracks/:id/commits',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(tracks.listCommits));
r.patch('/projects/:pid/tracks/:id/commits/:cid/checkout',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(tracks.checkoutCommit));

// ── AI ────────────────────────────────────────────────────────────────────────
r.get('/projects/:pid/tracks/:id/ai',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.getTrackAI));
r.post('/projects/:pid/tracks/:id/ai/reanalyse',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.reanalyseTrack));
r.post('/projects/:pid/ai/suggest-stems',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.suggestStems));

// ── Stems ─────────────────────────────────────────────────────────────────────
r.get('/projects/:pid/stems',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.listStems));
r.post('/projects/:pid/stems',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.createStem));

r.get('/projects/:pid/stems/:id',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.getStem));
r.patch('/projects/:pid/stems/:id',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.updateStem));
r.delete('/projects/:pid/stems/:id',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.ungroupStem));

r.get('/projects/:pid/stems/:id/commits/:cid',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.getStemCommit));
r.post('/projects/:pid/stems/:id/commits/:cid',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.createStemCommit));
r.get('/projects/:pid/stems/:id/commits',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.listStemCommits));
r.patch('/projects/:pid/stems/:id/commits/:cid/checkout',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.checkoutStemCommit));

// ── Comments ──────────────────────────────────────────────────────────────────
r.get('/projects/:pid/comments',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.listProjectComments));
r.get('/projects/:pid/tracks/:tid/comments',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.listComments));
r.post('/projects/:pid/tracks/:tid/comments',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.createComment));
r.patch('/projects/:pid/tracks/:tid/comments/:cid',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.updateComment));
r.delete('/projects/:pid/tracks/:tid/comments/:cid',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.deleteComment));

r.get('/projects/:pid/tracks/:tid/comments/:cid/replies',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.getReplies));
r.post('/projects/:pid/tracks/:tid/comments/:cid/replies',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.addReply));
r.delete('/projects/:pid/tracks/:tid/comments/:cid/replies/:rid',
  optionalAuth, asyncHandler(projectAccess), requireReadAccess, asyncHandler(combined.deleteReply));

// ── Shares & members ──────────────────────────────────────────────────────────
r.get('/projects/:pid/shares',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.listShares));
r.post('/projects/:pid/shares',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.createShare));
r.delete('/projects/:pid/shares/:sid',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.revokeShare));

r.get('/projects/:pid/members',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.listMembers));
r.post('/projects/:pid/members',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.inviteMember));
r.delete('/projects/:pid/members/:uid',
  auth, asyncHandler(projectAccess), requireOwner, asyncHandler(combined.removeMember));

// ── Upload ────────────────────────────────────────────────────────────────────
r.post('/upload/presign', auth, asyncHandler(upload.presign));
r.post('/upload/confirm', auth, asyncHandler(upload.confirm));
r.get('/upload/presign-post', auth, asyncHandler(upload.presignPost));

// ── Public share endpoint (no auth) ──────────────────────────────────────────
r.get('/share/:token', asyncHandler(combined.resolveShareToken));

export default r;
