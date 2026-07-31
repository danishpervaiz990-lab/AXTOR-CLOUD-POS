import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { runProductionDisplayCleanup } from './services/production-display-cleanup.js';

const app = createApp();
const server = createServer(app);
const host = '0.0.0.0';

async function start(): Promise<void> {
  try {
    await runProductionDisplayCleanup();
  } catch (error) {
    console.error('Production display cleanup skipped:', error);
  }

  server.listen(env.port, host, () => {
    console.log(`${env.appName} listening on ${host}:${env.port}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received. Shutting down Axtor API...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
