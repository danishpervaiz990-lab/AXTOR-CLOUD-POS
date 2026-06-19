import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { tenantMiddleware } from './middleware/tenant.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { customersRouter } from './routes/customers.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { productsRouter } from './routes/products.routes.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());

  app.use(cors({
    origin: env.corsOrigins === '*' ? true : env.corsOrigins,
    credentials: true
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.use(tenantMiddleware);

  app.use(healthRouter);
  app.use(authRouter);
  app.use(customersRouter);
  app.use(productsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
