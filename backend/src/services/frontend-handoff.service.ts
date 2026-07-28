import crypto from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../db/prisma.js';
import { createAuthToken, hashAuthToken } from '../utils/auth-token.js';
import { serializeBusinessContext } from './tenant-context.service.js';

const HANDOFF_TTL_SECONDS = 120;
const HANDOFF_USER_AGENT_PREFIX = 'frontend-handoff:';

function requestIp(req: Request): string | null {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim() || null;
}

function normalizeOrigin(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) throw new Error('Target origin is required');

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('Target origin is invalid');
  }

  const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  const isVercel = parsed.hostname === 'vercel.app' || parsed.hostname.endsWith('.vercel.app');
  const isAxtor = parsed.hostname === 'axtorpos.com' || parsed.hostname.endsWith('.axtorpos.com');

  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
    throw new Error('Target origin must use HTTPS');
  }
  if (!isLocal && !isVercel && !isAxtor) {
    throw new Error('Target origin is not an approved Axtor frontend');
  }

  return parsed.origin;
}

export async function createFrontendHandoff(input: {
  req: Request;
  businessId: string;
  userId: string;
  targetOrigin: unknown;
}) {
  const targetOrigin = normalizeOrigin(input.targetOrigin);
  const code = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

  await prisma.authSession.create({
    data: {
      businessId: input.businessId,
      userId: input.userId,
      tokenHash: hashAuthToken(code),
      expiresAt,
      ipAddress: requestIp(input.req),
      userAgent: `${HANDOFF_USER_AGENT_PREFIX}${targetOrigin}`.slice(0, 500)
    }
  });

  return {
    code,
    targetOrigin,
    expiresIn: HANDOFF_TTL_SECONDS,
    expiresAt
  };
}

export async function exchangeFrontendHandoff(input: {
  req: Request;
  code: unknown;
  targetOrigin?: unknown;
}) {
  const code = String(input.code || '').trim();
  if (!code) throw new Error('Handoff code is required');

  const requestedOrigin = normalizeOrigin(input.targetOrigin || input.req.headers.origin);
  const tokenHash = hashAuthToken(code);
  const handoffSession = await prisma.authSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: {
      id: true,
      businessId: true,
      userId: true,
      userAgent: true
    }
  });

  if (!handoffSession) throw new Error('Handoff code is expired or has already been used');

  const boundOrigin = String(handoffSession.userAgent || '').startsWith(HANDOFF_USER_AGENT_PREFIX)
    ? String(handoffSession.userAgent).slice(HANDOFF_USER_AGENT_PREFIX.length)
    : '';
  if (!boundOrigin || normalizeOrigin(boundOrigin) !== requestedOrigin) {
    throw new Error('Handoff target does not match this frontend');
  }

  const consumed = await prisma.authSession.updateMany({
    where: {
      id: handoffSession.id,
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    data: {
      revokedAt: new Date(),
      lastSeenAt: new Date()
    }
  });
  if (consumed.count !== 1) throw new Error('Handoff code is expired or has already been used');

  const user = await prisma.user.findFirst({
    where: {
      id: handoffSession.userId,
      businessId: handoffSession.businessId,
      status: 'ACTIVE'
    },
    include: {
      business: {
        include: {
          businessIndustry: {
            include: {
              industry: {
                select: {
                  code: true,
                  name: true
                }
              }
            }
          }
        }
      },
      userRoles: {
        include: {
          role: true
        }
      }
    }
  });

  if (!user) throw new Error('User session is no longer valid');
  if (user.business.status !== 'ACTIVE' && user.business.status !== 'TRIAL') {
    throw new Error('Business is not active');
  }

  const role = user.userRoles[0]?.role.name || 'User';
  const sessionId = crypto.randomUUID();
  const token = createAuthToken({
    userId: user.id,
    businessId: user.businessId,
    businessSlug: user.business.slug,
    email: user.email,
    role,
    sessionId
  });
  const expiresIn = Number(process.env.AUTH_TOKEN_EXPIRES_SECONDS || '86400');

  await prisma.authSession.create({
    data: {
      id: sessionId,
      businessId: user.businessId,
      userId: user.id,
      tokenHash: hashAuthToken(token),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      ipAddress: requestIp(input.req),
      userAgent: String(input.req.headers['user-agent'] || '').slice(0, 500) || null
    }
  });

  const permissions = Array.from(new Set(user.userRoles.flatMap(item => item.role.permissions)));

  return {
    token,
    tokenType: 'Bearer',
    expiresIn,
    business: serializeBusinessContext(user.business),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      role,
      roles: user.userRoles.map(item => item.role.name),
      mustChangePassword: user.mustChangePassword
    },
    permissions
  };
}
