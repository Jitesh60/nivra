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
  TOTP_ISSUER: z.string().default('Sajha Admin'),

  // ── SMS ──
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: optional(z.string()),
  MSG91_OTP_TEMPLATE_ID: optional(z.string()),

  // ── Email ──
  EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  EMAIL_FROM: z.string().default('Sajha <no-reply@sajha.app>'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  RESEND_API_KEY: optional(z.string()),
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
  if (env.SMS_PROVIDER === 'msg91') {
    if (!env.MSG91_AUTH_KEY) issue('MSG91_AUTH_KEY', 'required when SMS_PROVIDER=msg91');
    if (!env.MSG91_OTP_TEMPLATE_ID) {
      issue('MSG91_OTP_TEMPLATE_ID', 'required when SMS_PROVIDER=msg91');
    }
  }
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    issue('RESEND_API_KEY', 'required when EMAIL_PROVIDER=resend');
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
