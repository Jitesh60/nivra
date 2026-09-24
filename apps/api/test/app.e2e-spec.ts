import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

describe('API foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /v1/health/live -> 200', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200, { status: 'ok' });
  });

  it('GET /v1/health -> 200 with database and redis up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('has the PostGIS, btree_gist and citext extensions installed', async () => {
    const rows = await app.get(PrismaService).$queryRaw<
      { extname: string }[]
    >`SELECT extname FROM pg_extension`;
    expect(rows.map((r) => r.extname)).toEqual(
      expect.arrayContaining(['postgis', 'btree_gist', 'citext']),
    );
  });

  it('returns unknown routes in the standard error shape', async () => {
    const res = await request(app.getHttpServer()).get('/v1/does-not-exist').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Cannot GET /v1/does-not-exist' },
    });
  });

  it('echoes a caller-supplied x-request-id, or generates one', async () => {
    const echoed = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('x-request-id', 'test-123');
    expect(echoed.headers['x-request-id']).toBe('test-123');

    const generated = await request(app.getHttpServer()).get('/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers and allows configured CORS origins only', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('Origin', 'http://localhost:3001');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');

    const blocked = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/docs/openapi.json').expect(200);
    expect(res.body.info.title).toBe('Sajha API');
    expect(Object.keys(res.body.paths)).toContain('/v1/health');
  });
});
