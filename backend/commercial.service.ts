import { randomBytes, scryptSync } from 'node:crypto';
import { prisma } from '../db/prisma.js';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');

  return `scrypt$${salt}$${hash}`;
}

async function main(): Promise<void> {
  const businessName = process.env.SEED_BUSINESS_NAME?.trim() || 'Axtor Demo Business';
  const businessSlug = slugify(process.env.SEED_BUSINESS_SLUG || businessName);
  const ownerName = process.env.SEED_OWNER_NAME?.trim() || 'Owner';
  const ownerEmail = requiredEnv('SEED_OWNER_EMAIL').toLowerCase();
  const ownerPassword = requiredEnv('SEED_OWNER_PASSWORD');

  const business = await prisma.business.upsert({
    where: {
      slug: businessSlug
    },
    update: {
      name: businessName,
      legalName: businessName,
      status: 'ACTIVE',
      subscriptionPlan: 'FOUNDATION',
      subscriptionStatus: 'ACTIVE'
    },
    create: {
      name: businessName,
      legalName: businessName,
      slug: businessSlug,
      status: 'ACTIVE',
      country: 'QA',
      timezone: 'Asia/Qatar',
      currency: 'QAR',
      subscriptionPlan: 'FOUNDATION',
      subscriptionStatus: 'ACTIVE'
    }
  });

  const branch = await prisma.branch.upsert({
    where: {
      businessId_name: {
        businessId: business.id,
        name: 'Main Branch'
      }
    },
    update: {
      active: true
    },
    create: {
      businessId: business.id,
      name: 'Main Branch',
      code: 'MAIN',
      city: 'Doha',
      country: 'QA',
      active: true
    }
  });

  const warehouse = await prisma.warehouse.upsert({
    where: {
      businessId_name: {
        businessId: business.id,
        name: 'Main Warehouse'
      }
    },
    update: {
      active: true,
      branchId: branch.id
    },
    create: {
      businessId: business.id,
      branchId: branch.id,
      name: 'Main Warehouse',
      code: 'MAIN-WH',
      active: true
    }
  });

  const counter = await prisma.counter.upsert({
    where: {
      businessId_name: {
        businessId: business.id,
        name: 'Main Counter'
      }
    },
    update: {
      status: 'ACTIVE',
      branchId: branch.id
    },
    create: {
      businessId: business.id,
      branchId: branch.id,
      name: 'Main Counter',
      code: 'MAIN-COUNTER',
      status: 'ACTIVE'
    }
  });

  const ownerRole = await prisma.role.upsert({
    where: {
      businessId_name: {
        businessId: business.id,
        name: 'Owner'
      }
    },
    update: {
      isSystemRole: true,
      permissions: ['*']
    },
    create: {
      businessId: business.id,
      name: 'Owner',
      description: 'Full system access for business owner.',
      isSystemRole: true,
      permissions: ['*']
    }
  });

  const ownerUser = await prisma.user.upsert({
    where: {
      businessId_email: {
        businessId: business.id,
        email: ownerEmail
      }
    },
    update: {
      branchId: branch.id,
      name: ownerName,
      passwordHash: hashPassword(ownerPassword),
      status: 'ACTIVE'
    },
    create: {
      businessId: business.id,
      branchId: branch.id,
      name: ownerName,
      email: ownerEmail,
      passwordHash: hashPassword(ownerPassword),
      status: 'ACTIVE'
    }
  });

  await prisma.userRole.upsert({
    where: {
      businessId_userId_roleId: {
        businessId: business.id,
        userId: ownerUser.id,
        roleId: ownerRole.id
      }
    },
    update: {},
    create: {
      businessId: business.id,
      userId: ownerUser.id,
      roleId: ownerRole.id
    }
  });

  console.log('Seed completed successfully.');
  console.log(
    JSON.stringify(
      {
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug
        },
        owner: {
          id: ownerUser.id,
          name: ownerUser.name,
          email: ownerUser.email
        },
        defaults: {
          branch: branch.name,
          warehouse: warehouse.name,
          counter: counter.name
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
