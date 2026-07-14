import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

function getBusinessId(req: Request, res: Response): string | null {
  const businessId = req.tenant?.businessId;

  if (!businessId) {
    res.status(401).json({
      ok: false,
      error: {
        message: 'Authenticated business is required'
      }
    });
    return null;
  }

  return businessId;
}

function cleanString(value: unknown): string | undefined {
  const text = String(value || '').trim();

  return text || undefined;
}

function parseMoney(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseIntValue(value: unknown, fallback = 30): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function formatCustomer(customer: {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  type: string | null;
  address: string | null;
  creditLimit: unknown;
  creditDays: number;
  openingBalance: unknown;
  balance: unknown;
  status: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: customer.id,
    businessId: customer.businessId,
    name: customer.name,
    code: customer.code,
    company: customer.company,
    phone: customer.phone,
    email: customer.email,
    type: customer.type,
    address: customer.address,
    creditLimit: Number(customer.creditLimit),
    creditDays: customer.creditDays,
    openingBalance: Number(customer.openingBalance),
    balance: Number(customer.balance),
    status: customer.status,
    active: customer.active,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt
  };
}

export async function listCustomers(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const q = cleanString(req.query.q);
    const activeQuery = cleanString(req.query.active);

    const where: Prisma.CustomerWhereInput = {
      businessId
    };

    if (activeQuery === 'true') {
      where.active = true;
    }

    if (activeQuery === 'false') {
      where.active = false;
    }

    if (q) {
      where.OR = [
        {
          name: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          code: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          company: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          phone: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          email: {
            contains: q,
            mode: 'insensitive'
          }
        }
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    res.json({
      ok: true,
      count: customers.length,
      customers: customers.map(formatCustomer)
    });
  } catch (error) {
    console.error('List customers failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to list customers'
      }
    });
  }
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Customer id is required'
        }
      });
      return;
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!customer) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Customer not found'
        }
      });
      return;
    }

    res.json({
      ok: true,
      customer: formatCustomer(customer)
    });
  } catch (error) {
    console.error('Get customer failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to get customer'
      }
    });
  }
}

export async function createCustomer(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const name = cleanString(req.body?.name);

    if (!name) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Customer name is required'
        }
      });
      return;
    }

    const code = cleanString(req.body?.code);

    if (code) {
      const duplicate = await prisma.customer.findFirst({
        where: {
          businessId,
          code
        }
      });

      if (duplicate) {
        res.status(409).json({
          ok: false,
          error: {
            message: `Customer code "${code}" is already in use`
          }
        });
        return;
      }
    }

    const openingBalance = parseMoney(req.body?.openingBalance, 0);
    const balance =
      req.body?.balance === undefined || req.body?.balance === null
        ? openingBalance
        : parseMoney(req.body?.balance, openingBalance);

    let customer;

    try {
      customer = await prisma.customer.create({
        data: {
          businessId,
          name,
          code,
          company: cleanString(req.body?.company),
          phone: cleanString(req.body?.phone),
          email: cleanString(req.body?.email)?.toLowerCase(),
          type: cleanString(req.body?.type) || 'Retail',
          address: cleanString(req.body?.address),
          creditLimit: parseMoney(req.body?.creditLimit, 0),
          creditDays: parseIntValue(req.body?.creditDays, 30),
          openingBalance,
          balance,
          status: cleanString(req.body?.status) || 'active',
          active: req.body?.active === undefined ? true : Boolean(req.body?.active)
        }
      });
    } catch (createError) {
      if (
        createError &&
        typeof createError === 'object' &&
        'code' in createError &&
        (createError as { code?: string }).code === 'P2002'
      ) {
        res.status(409).json({
          ok: false,
          error: {
            message: `Customer code "${code}" is already in use`
          }
        });
        return;
      }

      throw createError;
    }

    res.status(201).json({
      ok: true,
      customer: formatCustomer(customer)
    });
  } catch (error) {
    console.error('Create customer failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to create customer'
      }
    });
  }
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Customer id is required'
        }
      });
      return;
    }

    const existing = await prisma.customer.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!existing) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Customer not found'
        }
      });
      return;
    }

    const data: Prisma.CustomerUpdateInput = {};

    if (req.body?.name !== undefined) {
      const name = cleanString(req.body?.name);

      if (!name) {
        res.status(400).json({
          ok: false,
          error: {
            message: 'Customer name cannot be empty'
          }
        });
        return;
      }

      data.name = name;
    }

    if (req.body?.code !== undefined) {
      const code = cleanString(req.body?.code) || null;

      if (code) {
        const duplicate = await prisma.customer.findFirst({
          where: {
            businessId,
            code,
            NOT: {
              id: existing.id
            }
          }
        });

        if (duplicate) {
          res.status(409).json({
            ok: false,
            error: {
              message: `Customer code "${code}" is already in use`
            }
          });
          return;
        }
      }

      data.code = code;
    }

    if (req.body?.company !== undefined) {
      data.company = cleanString(req.body?.company) || null;
    }

    if (req.body?.phone !== undefined) {
      data.phone = cleanString(req.body?.phone) || null;
    }

    if (req.body?.email !== undefined) {
      data.email = cleanString(req.body?.email)?.toLowerCase() || null;
    }

    if (req.body?.type !== undefined) {
      data.type = cleanString(req.body?.type) || 'Retail';
    }

    if (req.body?.address !== undefined) {
      data.address = cleanString(req.body?.address) || null;
    }

    if (req.body?.creditLimit !== undefined) {
      data.creditLimit = parseMoney(req.body?.creditLimit, 0);
    }

    if (req.body?.creditDays !== undefined) {
      data.creditDays = parseIntValue(req.body?.creditDays, existing.creditDays);
    }

    if (req.body?.openingBalance !== undefined) {
      data.openingBalance = parseMoney(req.body?.openingBalance, Number(existing.openingBalance));
    }

    if (req.body?.balance !== undefined) {
      data.balance = parseMoney(req.body?.balance, Number(existing.balance));
    }

    if (req.body?.status !== undefined) {
      data.status = cleanString(req.body?.status) || 'active';
    }

    if (req.body?.active !== undefined) {
      data.active = Boolean(req.body?.active);
    }

    let customer;

    try {
      customer = await prisma.customer.update({
        where: {
          id: existing.id
        },
        data
      });
    } catch (updateError) {
      if (
        updateError &&
        typeof updateError === 'object' &&
        'code' in updateError &&
        (updateError as { code?: string }).code === 'P2002'
      ) {
        res.status(409).json({
          ok: false,
          error: {
            message: 'Customer code is already in use'
          }
        });
        return;
      }

      throw updateError;
    }

    res.json({
      ok: true,
      customer: formatCustomer(customer)
    });
  } catch (error) {
    console.error('Update customer failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to update customer'
      }
    });
  }
}

export async function deleteCustomer(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Customer id is required'
        }
      });
      return;
    }

    const existing = await prisma.customer.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!existing) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Customer not found'
        }
      });
      return;
    }

    const customer = await prisma.customer.update({
      where: {
        id: existing.id
      },
      data: {
        active: false,
        status: 'inactive'
      }
    });

    res.json({
      ok: true,
      customer: formatCustomer(customer)
    });
  } catch (error) {
    console.error('Delete customer failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to delete customer'
      }
    });
  }
}
