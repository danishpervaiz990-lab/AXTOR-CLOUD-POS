import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';

const app = createApp();
const server = createServer(app);

server.listen(env.port, '0.0.0.0', () => {
  console.log(`${env.appName} listening on 0.0.0.0:${env.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received. Shutting down Axtor API...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
