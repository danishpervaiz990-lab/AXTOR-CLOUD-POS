import { Router } from 'express';
import {
  apiHealthCheck,
  databaseHealthCheck,
  healthCheck
} from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/health', healthCheck);
healthRouter.get('/health/db', databaseHealthCheck);

healthRouter.get('/api/v1/health', apiHealthCheck);
healthRouter.get('/api/v1/health/db', databaseHealthCheck);
