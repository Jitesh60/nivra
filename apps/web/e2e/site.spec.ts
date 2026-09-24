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
    ['/how-it-works', 'How Sajha works'],
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
