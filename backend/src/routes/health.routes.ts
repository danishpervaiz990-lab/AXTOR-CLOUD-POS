import { Router } from 'express';
import { apiHealthCheck, healthCheck } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/health', healthCheck);
healthRouter.get('/api/v1/health', apiHealthCheck);
