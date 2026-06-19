import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/api/v1/auth/login', login);
authRouter.get('/api/v1/auth/me', me);
authRouter.post('/api/v1/auth/logout', logout);
