import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    smtpHost: string;
    smtpPort: number;
    mailpitUrl: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;
let mailpit: StartedTestContainer | undefined;

/**
 * Starts throwaway PostGIS, Redis and Mailpit containers once per e2e run and
 * applies migrations.
 */
export async function setup(project: TestProject): Promise<void> {
  [postgres, redis, mailpit] = await Promise.all([
    new PostgreSqlContainer('postgis/postgis:16-3.4').start(),
    new RedisContainer('redis:7-alpine').start(),
    new GenericContainer('axllent/mailpit:latest')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/livez', 8025))
      .start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redis.getConnectionUrl());
  project.provide('smtpHost', mailpit.getHost());
  project.provide('smtpPort', mailpit.getMappedPort(1025));
  project.provide('mailpitUrl', `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`);
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), redis?.stop(), mailpit?.stop()]);
}
