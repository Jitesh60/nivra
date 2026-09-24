import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright loads this package's TypeScript as CommonJS.
const here = __dirname;
export const STATE_FILE = resolve(here, '.state.json');

/** Seeds a brand-new Super Admin for this run via the API's seed script. */
export default async function globalSetup() {
  const run = Date.now();
  const root = {
    email: `e2e-root-${run}@sajha.app`,
    name: 'E2E Root',
    password: 'e2e correct horse battery',
  };
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@sajha/api',
      'seed:admin',
      '--',
      '--email',
      root.email,
      '--name',
      root.name,
      '--password',
      root.password,
    ],
    { stdio: 'inherit', cwd: resolve(here, '../../..') },
  );
  writeFileSync(STATE_FILE, JSON.stringify({ run, root }));
}
