import { expect, test } from '@playwright/test';

const unique = () => `web-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

test('home page renders the hero and every section', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Borrow what you need.');
  for (const heading of [
    'Rent in four simple steps',
    'Things people rarely need, but really need once',
    'Owning is expensive. Sharing isn’t.',
    'Built so both sides feel safe',
    'What could your idle things earn?',
    'Questions, answered',
    'Join the waitlist',
  ]) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('how-it-works tabs switch between borrowing and lending', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find it nearby' })).toBeVisible();
  await page.getByRole('tab', { name: 'I want to lend' }).click();
  await expect(page.getByRole('tab', { name: 'I want to lend' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'List in minutes' })).toBeVisible();
});

test('earnings calculator updates as the sliders move', async ({ page }) => {
  await page.goto('/lend');
  const earnings = page.getByTestId('monthly-earnings');
  await expect(earnings).toContainText('₹1,080'); // ₹150 × 8 days − 10%
  await page.getByLabel(/Days rented per month/).fill('20');
  await expect(earnings).toContainText('₹2,700');
});

test('inner pages, legal pages, SEO files and 404', async ({ page, request }) => {
  for (const [path, heading] of [
    ['/how-it-works', 'How Nivra works'],
    ['/lend', 'Earn from things you rarely use'],
    ['/faq', 'Frequently asked questions'],
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
    ['/contact', 'Contact us'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('/privacy</loc>');
  expect((await request.get('/robots.txt')).ok()).toBe(true);
  expect((await request.get('/opengraph-image')).headers()['content-type']).toBe('image/png');
  expect((await request.get('/nope')).status()).toBe(404);
});

test('blog: index, a post with its structured data, and the RSS feed', async ({
  page,
  request,
}) => {
  await page.goto('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
  await expect(page.getByTestId('post-card')).toHaveCount(3);
  await page
    .getByRole('link', { name: /How deposits and handover codes/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/blog\/how-deposits-and-handover-codes-keep-you-safe$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'How deposits and handover codes keep both sides safe',
  );
  await expect(page.getByRole('heading', { name: 'Late returns' })).toBeVisible();
  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  ) as { '@type': string; headline: string };
  expect(ld).toMatchObject({
    '@type': 'Article',
    headline: 'How deposits and handover codes keep both sides safe',
  });
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  const ogPath = new URL(og!).pathname;
  expect((await request.get(ogPath)).headers()['content-type']).toBe('image/png');

  const rss = await request.get('/blog/rss.xml');
  expect(rss.headers()['content-type']).toContain('application/rss+xml');
  const xml = await rss.text();
  expect(xml.match(/<item>/g)).toHaveLength(3);
  expect(xml).toContain('/blog/rent-or-buy-trekking-gear-pune</link>');
  expect((await request.get('/blog/no-such-post')).status()).toBe(404);
});

test('category landing pages with prices and FAQ structured data', async ({ page, request }) => {
  await page.goto('/rent/cameras');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Rent cameras and lenses in Pune',
  );
  await expect(page.getByTestId('price-table').getByRole('row')).toHaveCount(4);
  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  ) as { '@type': string; mainEntity: unknown[] };
  expect(ld['@type']).toBe('FAQPage');
  expect(ld.mainEntity).toHaveLength(2);
  // Before launch, the page ends with the waitlist, not store buttons.
  await expect(page.locator('#waitlist')).toBeVisible();
  await expect(page.getByTestId('download')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Rent in Pune' })
    .getByRole('link', { name: 'Tools' })
    .click();
  await expect(page).toHaveURL(/\/rent\/tools$/);
  expect((await request.get('/rent/boats')).status()).toBe(404);
});

test('account deletion page (the URL Google Play asks for)', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Delete your account' }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your account');
  for (const h of [
    'In the app',
    'By email',
    'What’s deleted straight away',
    'What we keep, and for how long',
  ]) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of [
    '/delete-account',
    '/blog',
    '/blog/lenders-guide-earn-from-things-you-rarely-use',
    '/rent/trekking-gear',
  ]) {
    expect(sitemap).toContain(`${path}</loc>`);
  }
});

test('security headers on every page', async ({ request }) => {
  for (const path of ['/', '/blog', '/delete-account']) {
    const headers = (await request.get(path)).headers();
    expect(headers['strict-transport-security']).toContain('max-age=63072000');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-powered-by']).toBeUndefined();
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the static gradient instead of the shader', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('hero-poster')).toBeAttached();
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('hero-shader')).toHaveCount(0);
  });
});

test.describe('waitlist (needs the API)', () => {
  test('joins, then recognises the same email', async ({ page }) => {
    const email = unique();
    await page.goto('/?utm_source=e2e');
    const form = page.locator('#waitlist');
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('City').fill('Pune');
    await form.getByLabel('I’m interested in').selectOption('BORROWER');
    await form.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByTestId('waitlist-success')).toContainText('You’re on the list');

    await page.reload();
    await page.locator('#waitlist').getByLabel('Email').fill(email);
    await page.locator('#waitlist').getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByTestId('waitlist-success')).toContainText('already on the list');
  });

  test('the browser blocks an invalid email before sending', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('#waitlist');
    await form.getByLabel('Email').fill('not-an-email');
    await form.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByTestId('waitlist-success')).toHaveCount(0);
    expect(
      await form.getByLabel('Email').evaluate((el: HTMLInputElement) => el.validity.valid),
    ).toBe(false);
  });
});

test.describe('invite links (needs the API)', () => {
  const API = process.env.NEXT_PUBLIC_SAJHA_API_URL ?? 'http://localhost:3000';

  /** Signs a new person up (OTP bypass code) and returns their invite code. */
  async function inviteCode(name: string): Promise<string> {
    const phone = `9${String(Date.now()).slice(-9)}`;
    const ip = { 'x-forwarded-for': `203.0.113.${(Number(phone.slice(-6)) % 254) + 1}` };
    const post = async (path: string, body: unknown, token?: string, method = 'POST') => {
      const res = await fetch(`${API}/v1${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...ip,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      expect(res.ok, `${path} → ${res.status}`).toBe(true);
      return res.json();
    };
    const { challengeId } = await post('/auth/otp/request', { phone: `+91${phone}` });
    const login = await post('/auth/otp/verify', {
      challengeId,
      code: process.env.E2E_OTP_CODE ?? '000000',
      deviceId: `web-e2e-${phone}`,
      deviceName: 'Web E2E',
    });
    await post('/me', { name }, login.accessToken, 'PATCH');
    const res = await fetch(`${API}/v1/me/referral`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    });
    return (await res.json()).code;
  }

  test('a valid link shows who invited you, the credit and the code', async ({
    page,
    context,
    browserName,
  }) => {
    const code = await inviteCode('Meera Iyer');
    await page.goto(`/r/${code.toLowerCase()}`);
    await expect(page.getByTestId('invite-heading')).toHaveText('Meera invited you to Nivra');
    await expect(page.getByRole('main')).toContainText('₹100');
    await expect(page.getByTestId('invite-code')).toHaveText(code);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.getByRole('button', { name: 'Copy code' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    }
  });

  test('an unknown code says the link doesn’t work', async ({ page }) => {
    const res = await page.goto('/r/NOTACODE');
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId('invite-invalid')).toContainText('This invite link doesn’t work');
  });
});
