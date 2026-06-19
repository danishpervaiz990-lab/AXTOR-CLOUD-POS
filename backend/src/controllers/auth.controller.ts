import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { createAuthToken, verifyAuthToken } from '../utils/auth-token.js';
import { verifyPassword } from '../utils/password.js';

function getBearerToken(req: Request): string | null {
  const header = req.header('authorization') || '';

  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
}

function invalidLogin(res: Response): void {
  res.status(401).json({
    ok: false,
    error: {
      message: 'Invalid business, email, or password'
    }
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const businessSlug = String(req.body?.businessSlug || '').trim().toLowerCase();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!businessSlug || !email || !password) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'businessSlug, email, and password are required'
        }
      });
      return;
    }

    const business = await prisma.business.findUnique({
      where: {
        slug: businessSlug
      }
    });

    if (!business) {
      invalidLogin(res);
      return;
    }

    if (business.status !== 'ACTIVE' && business.status !== 'TRIAL') {
      res.status(403).json({
        ok: false,
        error: {
          message: 'Business is not active'
        }
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        businessId_email: {
          businessId: business.id,
          email
        }
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user || !user.passwordHash) {
      invalidLogin(res);
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({
        ok: false,
        error: {
          message: 'User is not active'
        }
      });
      return;
    }

    const passwordOk = verifyPassword(password, user.passwordHash);

    if (!passwordOk) {
      invalidLogin(res);
      return;
    }

    const role = user.userRoles[0]?.role.name || 'User';

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        lastLoginAt: new Date()
      }
    });

    const token = createAuthToken({
      userId: user.id,
      businessId: business.id,
      businessSlug: business.slug,
      email: user.email,
      role
    });

    res.json({
      ok: true,
      token,
      tokenType: 'Bearer',
      expiresIn: Number(process.env.AUTH_TOKEN_EXPIRES_SECONDS || '86400'),
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        status: business.status,
        timezone: business.timezone,
        currency: business.currency
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        role,
        roles: user.userRoles.map((item) => item.role.name)
      }
    });
  } catch (error) {
    console.error('Auth login failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Login failed'
      }
    });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const token = getBearerToken(req);

    if (!token) {
      res.status(401).json({
        ok: false,
        error: {
          message: 'Authorization bearer token is required'
        }
      });
      return;
    }

    const payload = verifyAuthToken(token);

    if (!payload) {
      res.status(401).json({
        ok: false,
        error: {
          message: 'Invalid or expired token'
        }
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        id: payload.userId
      },
      include: {
        business: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user || user.businessId !== payload.businessId) {
      res.status(401).json({
        ok: false,
        error: {
          message: 'User session is no longer valid'
        }
      });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({
        ok: false,
        error: {
          message: 'User is not active'
        }
      });
      return;
    }

    if (user.business.status !== 'ACTIVE' && user.business.status !== 'TRIAL') {
      res.status(403).json({
        ok: false,
        error: {
          message: 'Business is not active'
        }
      });
      return;
    }

    const role = user.userRoles[0]?.role.name || 'User';

    res.json({
      ok: true,
      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        status: user.business.status,
        timezone: user.business.timezone,
        currency: user.business.currency
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        role,
        roles: user.userRoles.map((item) => item.role.name)
      }
    });
  } catch (error) {
    console.error('Auth me failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to load current user'
      }
    });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.json({
    ok: true,
    message: 'Logged out'
  });
}
