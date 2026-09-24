import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_ADMIN_ACCESS_SECRET: 'b'.repeat(32),
  OTP_PEPPER: 'c'.repeat(32),
  TOTP_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: [],
      SWAGGER_ENABLED: false,
    });
  });

  it('parses types from strings', () => {
    const env = validateEnv({
      ...valid,
      PORT: '4000',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: 'http://a.test, http://b.test,',
    });
    expect(env.PORT).toBe(4000);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('refuses the OTP bypass code and console SMS in production', () => {
    expect(() =>
      validateEnv({ ...valid, NODE_ENV: 'production', OTP_DEV_BYPASS_CODE: '000000' }),
    ).toThrow(/OTP_DEV_BYPASS_CODE/);
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/SMS_PROVIDER/);
  });

  it('requires MSG91 credentials when MSG91 is selected', () => {
    expect(() => validateEnv({ ...valid, SMS_PROVIDER: 'msg91' })).toThrow(/MSG91_AUTH_KEY/);
  });

  it('requires distinct user and admin JWT secrets', () => {
    expect(() =>
      validateEnv({ ...valid, JWT_ADMIN_ACCESS_SECRET: valid.JWT_ACCESS_SECRET }),
    ).toThrow(/JWT_ADMIN_ACCESS_SECRET/);
  });

  it('rejects a TOTP key that is not 32 bytes', () => {
    expect(() => validateEnv({ ...valid, TOTP_ENC_KEY: 'c2hvcnQ=' })).toThrow(/TOTP_ENC_KEY/);
  });

  it('treats empty optional values as unset', () => {
    expect(validateEnv({ ...valid, OTP_DEV_BYPASS_CODE: '' }).OTP_DEV_BYPASS_CODE).toBeUndefined();
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://x@y/z' })).toThrow(/DATABASE_URL/);
  });
});
