/**
 * Creates the first Super Admin. There is no public admin sign-up.
 *
 *   pnpm --filter @sajha/api seed:admin -- --email you@sajha.app --name "Your Name"
 *
 * Without --password, a random temporary password is generated and printed once;
 * it must be changed after the first login. 2FA is set up on first login.
 */
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { randomToken } from '../common/crypto/crypto.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../modules/admin-auth/password.js';

loadEnv({ quiet: true });

const { values } = parseArgs({
  // `pnpm seed:admin -- --email …` forwards the literal `--`; drop it.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
  },
});

async function main(): Promise<number> {
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !name) {
    console.error('Usage: seed:admin -- --email <email> --name "<name>" [--password <password>]');
    return 1;
  }
  if (values.password && values.password.length < PASSWORD_MIN_LENGTH) {
    console.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    return 1;
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (copy apps/api/.env.example to apps/api/.env).');
    return 1;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    if (await prisma.adminUser.findUnique({ where: { email } })) {
      console.error(`An admin with email ${email} already exists.`);
      return 1;
    }
    const password = values.password ?? randomToken(12);
    const admin = await prisma.adminUser.create({
      data: {
        email,
        name,
        role: 'SUPER_ADMIN',
        passwordHash: await hashPassword(password),
        mustChangePassword: !values.password,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'admin.admins.seed',
        targetType: 'admin_user',
        targetId: admin.id,
        metadata: { email },
      },
    });
    console.log(`Created SUPER_ADMIN ${email} (${admin.id}).`);
    if (!values.password) {
      console.log(`Temporary password (shown once, change it after first login): ${password}`);
    }
    console.log('Two-factor authentication is set up on first login.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main();
