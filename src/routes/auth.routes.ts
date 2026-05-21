import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { auth } from '../middleware/auth';
import {
  signup,
  login,
  refreshToken,
  forgotPassword,
  confirmPassword,
  setNewPassword,
  me,
} from '../controllers/auth.controller';

const r = Router();

// Public — no auth required
r.post('/signup',           asyncHandler(signup));
r.post('/login',            asyncHandler(login));
r.post('/refresh',          asyncHandler(refreshToken));
r.post('/forgot-password',  asyncHandler(forgotPassword));
r.post('/confirm-password', asyncHandler(confirmPassword));
r.post('/set-password',     asyncHandler(setNewPassword));

// Protected
r.get('/me', auth, asyncHandler(me));

export default r;
