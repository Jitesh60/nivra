import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DATABASE_URL is only needed by commands that talk to the database (migrate, studio).
// `prisma generate` must work without it, e.g. in CI lint/typecheck jobs.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
