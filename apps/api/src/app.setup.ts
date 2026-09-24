import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';

/**
 * Applies everything that must be identical in `main.ts` and in e2e tests:
 * security headers, CORS, `/v1` URI versioning, validation, error shape and Swagger.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }), credentials: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const doc = new DocumentBuilder()
      .setTitle('Sajha API')
      .setDescription('REST API for the Sajha mobile app, admin panel and website.')
      .setVersion('1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc), {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
  return app;
}
