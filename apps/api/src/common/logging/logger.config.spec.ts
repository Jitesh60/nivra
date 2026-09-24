import { Writable } from 'node:stream';
import pino from 'pino';
import { loggerConfig, REDACT_PATHS } from './logger.config.js';

describe('logger redaction', () => {
  it('never writes OTP codes, passwords, tokens or phone numbers', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const config = loggerConfig({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    const redact = (config.pinoHttp as { redact: { paths: string[]; censor: string } }).redact;
    expect(redact.paths).toEqual(REDACT_PATHS);

    const logger = pino({ redact }, sink);
    logger.info({
      req: {
        headers: { authorization: 'Bearer eyJ.secret', cookie: 'sid=abc' },
        body: {
          code: '482913',
          password: 'hunter2hunter2',
          refreshToken: 'rt-secret',
          phone: '+919876543210',
        },
      },
      res: { headers: { 'set-cookie': 'sid=abc' } },
    });

    const out = lines.join('');
    for (const secret of [
      '482913',
      'hunter2hunter2',
      'rt-secret',
      '+919876543210',
      'eyJ.secret',
      'sid=abc',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
  });
});
