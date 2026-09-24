import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
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
    s3Endpoint: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;
let mailpit: StartedTestContainer | undefined;
let seaweed: StartedTestContainer | undefined;

export const TEST_BUCKETS = {
  public: 'sajha-public-media',
  private: 'sajha-private-docs',
} as const;
export const TEST_S3_CREDENTIALS = {
  accessKeyId: 'sajha',
  secretAccessKey: 'sajha-s3-secret',
} as const;

/**
 * Starts throwaway PostGIS, Redis, Mailpit and SeaweedFS (S3) containers once
 * per e2e run, applies migrations and creates the buckets.
 */
export async function setup(project: TestProject): Promise<void> {
  [postgres, redis, mailpit, seaweed] = await Promise.all([
    new PostgreSqlContainer('postgis/postgis:16-3.4').start(),
    new RedisContainer('redis:7-alpine').start(),
    new GenericContainer('axllent/mailpit:latest')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/livez', 8025))
      .start(),
    // Same S3 config as local dev (infra/s3/s3.json): public bucket readable anonymously.
    new GenericContainer('chrislusf/seaweedfs:latest')
      .withCommand([
        'server',
        '-dir=/data',
        '-s3',
        '-s3.port=8333',
        '-s3.config=/etc/seaweedfs/s3.json',
        '-master.volumeSizeLimitMB=64',
      ])
      .withCopyFilesToContainer([
        {
          source: resolve(import.meta.dirname, '../../../infra/s3/s3.json'),
          target: '/etc/seaweedfs/s3.json',
        },
      ])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forHttp('/status', 8333))
      .start(),
  ]);

  const s3Endpoint = `http://${seaweed.getHost()}:${seaweed.getMappedPort(8333)}`;
  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'ap-south-1',
    forcePathStyle: true,
    credentials: TEST_S3_CREDENTIALS,
  });
  for (const bucket of Object.values(TEST_BUCKETS)) {
    // SeaweedFS can take a moment after /status before accepting bucket creation.
    for (let attempt = 0; ; attempt++) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        break;
      } catch (err) {
        if ((err as { name?: string }).name === 'BucketAlreadyOwnedByYou') break;
        if (attempt > 20) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  s3.destroy();

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
  project.provide('s3Endpoint', s3Endpoint);
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), redis?.stop(), mailpit?.stop(), seaweed?.stop()]);
}
