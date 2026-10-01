import { expect, type Page } from '@playwright/test';

/** The API in e2e runs with OTP_DEV_BYPASS_CODE (never allowed in production). */
export const OTP = process.env.E2E_OTP_CODE ?? '000000';

let counter = 0;

/** A fresh 10-digit mobile number, unique per test run. */
export function newPhone(): string {
  counter += 1;
  const tail = `${Date.now()}${counter}${Math.floor(Math.random() * 10)}`.slice(-8);
  return `9${(counter % 9) + 1}${tail}`.slice(0, 10);
}

/**
 * Each test browses from its own IP (documentation range, sent as
 * X-Forwarded-For). The web server passes it on to the API, so the suite
 * stays under the per-IP sign-in limit, as real visitors would.
 */
export async function browseFromOwnIp(page: Page, phone: string): Promise<void> {
  const n = Number(phone.slice(-6));
  await page.setExtraHTTPHeaders({
    'x-forwarded-for': `203.0.${Math.floor(n / 254) % 254}.${(n % 254) + 1}`,
  });
}

/**
 * Signs up (or in) through the web pages. New accounts get a name and,
 * unless `skipEmail`, a verified email (the bypass code works for both).
 */
export async function signIn(
  page: Page,
  { name = 'Web Tester', phone = newPhone(), next, skipEmail = false } = {} as {
    name?: string;
    phone?: string;
    next?: string;
    skipEmail?: boolean;
  },
): Promise<{ phone: string; name: string }> {
  await browseFromOwnIp(page, phone);
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  await page.getByLabel('Code').fill(OTP);
  await page.getByRole('button', { name: 'Verify and continue' }).click();

  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  if (new URL(page.url()).pathname === '/welcome') {
    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
    await page.getByLabel('Full name').fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL((url) => url.pathname !== '/welcome');
  }
  if (new URL(page.url()).pathname === '/welcome/email') {
    await expect(page.getByRole('heading', { name: 'Add your email' })).toBeVisible();
    if (skipEmail) {
      await page.getByRole('link', { name: 'Skip for now' }).click();
    } else {
      await page.getByLabel('Email').fill(`web.${phone}@example.com`);
      await page.getByRole('button', { name: 'Email me a code' }).click();
      await page.getByLabel('Code').fill(OTP);
      await page.getByRole('button', { name: 'Verify email' }).click();
    }
    await page.waitForURL((url) => !url.pathname.startsWith('/welcome'));
  }
  await expect(page).not.toHaveURL(/\/(login|welcome)/);
  return { phone, name };
}

/** A real 32×20 JPEG: the API decodes and re-encodes every upload. */
export const JPEG = Buffer.from(
  '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAUACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAMG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AiAqxYAAAAAD/2Q==',
  'base64',
);

export const photo = (name = 'photo.jpg') => ({ name, mimeType: 'image/jpeg', buffer: JPEG });

/** A short unique tag for test data (time + randomness, so parallel workers never collide). */
export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
