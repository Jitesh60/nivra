import { z } from 'zod';

/** Treats `FOO=` (empty) in a .env file the same as not setting FOO. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/**
 * Every environment variable the API reads, validated once at boot.
 * The app refuses to start if anything is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  SWAGGER_ENABLED: booleanString,
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  // ── Auth tokens ──
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ADMIN_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(600),
  ADMIN_REFRESH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(12),

  // ── OTP ──
  /** HMAC key for stored OTP codes. */
  OTP_PEPPER: z.string().min(32),
  /** Development only: this code is always accepted. Refused outside development/test. */
  OTP_DEV_BYPASS_CODE: optional(z.string().regex(/^\d{6}$/)),

  // ── Admin 2FA ──
  /** 32-byte key (base64) that encrypts admin TOTP secrets at rest. */
  TOTP_ENC_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),
  TOTP_ISSUER: z.string().default('Nivra Admin'),

  // ── Listings ──
  /** 32-byte key (base64) that encrypts lenders' exact pickup addresses at rest. */
  ADDRESS_ENC_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),

  // ── SMS ──
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: optional(z.string()),
  MSG91_OTP_TEMPLATE_ID: optional(z.string()),
  /** DLT template for overdue-return SMS (`##item##`, `##days##`); optional. */
  MSG91_OVERDUE_TEMPLATE_ID: optional(z.string()),

  // ── Push (FCM) ──
  /** `console` logs pushes (development, or until Firebase is set up). */
  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),
  FCM_PROJECT_ID: optional(z.string()),
  /** The Firebase service account key file's JSON (one line). */
  FCM_SERVICE_ACCOUNT_JSON: optional(z.string()),

  // ── Email ──
  EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  EMAIL_FROM: z.string().default('Nivra <no-reply@sajha.app>'),
  /** The marketing site, for links the API hands out (invite links). */
  PUBLIC_SITE_URL: z.url().default('https://sajha.app'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  RESEND_API_KEY: optional(z.string()),

  // ── Object storage (S3; SeaweedFS locally) ──
  /** Custom endpoint for S3-compatible storage. Leave unset for AWS S3. */
  S3_ENDPOINT: optional(z.url()),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString,
  /** Avatars (and later listing photos), served publicly via S3_PUBLIC_BASE_URL. */
  S3_PUBLIC_BUCKET: z.string().min(3),
  /** Identity documents and temporary uploads. Never public. */
  S3_PRIVATE_BUCKET: z.string().min(3),
  /** Base URL for public objects: a CDN in production, the bucket URL locally. */
  S3_PUBLIC_BASE_URL: z.url(),
  /** Server-side encryption for the private bucket. */
  S3_PRIVATE_SSE: z.enum(['AES256', 'aws:kms', 'none']).default('none'),

  // ── Bookings & jobs ──
  /** Requests a minute per IP to public reads (search, home, listings, reviews). */
  PUBLIC_READ_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),

  /** Sentry error reporting; off when unset. Read in instrument.ts before boot. */
  SENTRY_DSN: optional(z.url()),
  SENTRY_ENVIRONMENT: optional(z.string()),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  /** The deployed commit, shown by /v1/health and tagged on Sentry errors. */
  GIT_SHA: optional(z.string().max(64)),

  /** Run the BullMQ worker (booking timers, purge) in this process. */
  JOBS_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** How long the lender has to accept or decline a request. */
  BOOKING_REQUEST_TTL_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60),
  /** How long the borrower has to share documents, and the lender to review them. */
  BOOKING_DOCS_TTL_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60),
  /** How long accepted dates are held for payment. */
  BOOKING_PAYMENT_TTL_MIN: z.coerce.number().int().positive().default(120),
  /** Shared document copies are deleted this long after the booking closes. */
  SHARE_RETENTION_DAYS: z.coerce.number().int().nonnegative().default(30),

  // ── Payments (Razorpay) ──
  /** `fake` mimics Razorpay without the network (development and tests). */
  PAYMENT_PROVIDER: z.enum(['fake', 'razorpay']).default('fake'),
  RAZORPAY_KEY_ID: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('rzp_test_fakekey'),
  ),
  RAZORPAY_KEY_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('fake-razorpay-key-secret'),
  ),
  /** The secret set on the webhook in the Razorpay dashboard. */
  RAZORPAY_WEBHOOK_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('fake-razorpay-webhook-secret'),
  ),
});

export type Env = z.infer<typeof envSchema>;

const productionLike = (env: Env) => env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

/** Rules that span several variables. */
const envRules = envSchema.superRefine((env, ctx) => {
  const issue = (path: keyof Env, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  if (env.OTP_DEV_BYPASS_CODE && productionLike(env)) {
    issue('OTP_DEV_BYPASS_CODE', 'must not be set in staging or production');
  }
  if (env.SMS_PROVIDER === 'console' && productionLike(env)) {
    issue('SMS_PROVIDER', 'console provider is for development only');
  }
  if (env.PUSH_PROVIDER === 'console' && productionLike(env)) {
    issue('PUSH_PROVIDER', 'console provider is for development only');
  }
  if (env.EMAIL_PROVIDER === 'smtp' && productionLike(env)) {
    issue('EMAIL_PROVIDER', 'smtp (Mailpit) is for development only; use resend');
  }
  if (env.SWAGGER_ENABLED && env.NODE_ENV === 'production') {
    issue('SWAGGER_ENABLED', 'must be off in production');
  }
  if (env.CORS_ORIGINS.length === 0 && productionLike(env)) {
    issue('CORS_ORIGINS', 'list the admin and website origins');
  }
  if (env.CORS_ORIGINS.some((o) => o === '*') && productionLike(env)) {
    issue('CORS_ORIGINS', 'must not be * (credentials are allowed)');
  }
  if (env.SMS_PROVIDER === 'msg91') {
    if (!env.MSG91_AUTH_KEY) issue('MSG91_AUTH_KEY', 'required when SMS_PROVIDER=msg91');
    if (!env.MSG91_OTP_TEMPLATE_ID) {
      issue('MSG91_OTP_TEMPLATE_ID', 'required when SMS_PROVIDER=msg91');
    }
  }
  if (env.PUSH_PROVIDER === 'fcm') {
    if (!env.FCM_PROJECT_ID) issue('FCM_PROJECT_ID', 'required when PUSH_PROVIDER=fcm');
    if (!env.FCM_SERVICE_ACCOUNT_JSON) {
      issue('FCM_SERVICE_ACCOUNT_JSON', 'required when PUSH_PROVIDER=fcm');
    } else {
      try {
        const key = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as Record<string, unknown>;
        if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
          issue('FCM_SERVICE_ACCOUNT_JSON', 'needs client_email and private_key');
        }
      } catch {
        issue('FCM_SERVICE_ACCOUNT_JSON', 'must be the service account JSON');
      }
    }
  }
  if (env.PAYMENT_PROVIDER === 'fake' && productionLike(env)) {
    issue('PAYMENT_PROVIDER', 'the fake payment provider is for development only');
  }
  if (env.PAYMENT_PROVIDER === 'razorpay') {
    if (env.RAZORPAY_KEY_ID.startsWith('rzp_test_fake')) {
      issue('RAZORPAY_KEY_ID', 'required when PAYMENT_PROVIDER=razorpay');
    }
    if (env.RAZORPAY_KEY_SECRET.startsWith('fake-')) {
      issue('RAZORPAY_KEY_SECRET', 'required when PAYMENT_PROVIDER=razorpay');
    }
    if (env.RAZORPAY_WEBHOOK_SECRET.startsWith('fake-')) {
      issue('RAZORPAY_WEBHOOK_SECRET', 'required when PAYMENT_PROVIDER=razorpay');
    }
  }
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    issue('RESEND_API_KEY', 'required when EMAIL_PROVIDER=resend');
  }
  if (env.S3_PRIVATE_SSE === 'none' && productionLike(env)) {
    issue('S3_PRIVATE_SSE', 'documents must be encrypted at rest in staging and production');
  }
  if (env.S3_PUBLIC_BUCKET === env.S3_PRIVATE_BUCKET) {
    issue('S3_PRIVATE_BUCKET', 'must differ from S3_PUBLIC_BUCKET');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_ADMIN_ACCESS_SECRET) {
    issue('JWT_ADMIN_ACCESS_SECRET', 'must differ from JWT_ACCESS_SECRET');
  }
});

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envRules.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
