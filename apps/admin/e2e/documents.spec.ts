import { expect, test, type Page } from '@playwright/test';
import { createAppUser, me, seedAdmin, submitDocument, type AppUser } from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let user: AppUser;
let panId = '';
let dlId = '';
let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;
let opsPage: Page;

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run);
  support = seedAdmin('SUPPORT', run);
  user = await createAppUser('Priya Reviewee');
  panId = (await submitDocument(user, 'PAN')).id;
  dlId = (await submitDocument(user, 'DRIVING_LICENCE', true)).id;

  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await expect(opsPage).toHaveURL('/');
});

test.afterAll(async () => {
  await opsPage.close();
});

test('Ops approves an ID in the queue; the user gets the ID badge', async () => {
  const page = opsPage;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Documents' })
    .click();
  await expect(page).toHaveURL('/documents');
  const row = page.getByTestId('document-row').filter({ hasText: user.phone }).filter({
    hasText: 'PAN card',
  });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: 'Review' }).click();
  await expect(page).toHaveURL(`/documents/${panId}`);

  // The image streams through the admin server, uncached, and actually renders.
  const image = page.getByTestId('document-image-front');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(await image.getAttribute('src')).toBe(`/documents/${panId}/image?side=front`);
  const res = await page.request.get(`/documents/${panId}/image?side=front`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/jpeg');
  expect(res.headers()['cache-control']).toContain('no-store');
  await expect(page.getByTestId('watermark').first()).toContainText(`Viewed by ${ops.name}`);

  expect((await me(user)).body.user?.idVerified).toBe(false);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('document-status')).toHaveText('Approved');
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByText(/^Reviewed .* by E2E Ops Reviewer$/)).toBeVisible();

  expect((await me(user)).body.user?.idVerified).toBe(true);
});

test('Ops rejects a document with a common reason', async () => {
  const page = opsPage;
  await page.goto(`/documents/${dlId}`);
  await expect(page.getByTestId('document-image-back')).toBeVisible();
  await page.getByLabel('Common reasons').selectOption({ index: 1 });
  await expect(page.getByLabel('Reason shown to the user')).toHaveValue(/blurry/);
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByTestId('document-status')).toHaveText('Rejected');
  await expect(page.getByText(/Reason: The photo is blurry/)).toBeVisible();

  await page.goto('/documents?status=REJECTED');
  await expect(page.getByTestId('document-row').filter({ hasText: user.phone })).toBeVisible();
});

test('user detail shows documents and activity; suspending signs the user out', async () => {
  const page = opsPage;
  await page.goto(`/users?search=${encodeURIComponent(user.phone)}`);
  await page.getByRole('link', { name: user.name }).click();
  await expect(page).toHaveURL(`/users/${user.id}`);
  await expect(page.getByTestId('badge-id')).toContainText('✓');
  await expect(page.getByTestId('active-sessions')).toHaveText('Signed in on 1 device');
  await expect(
    page.getByTestId('activity-row').filter({ hasText: 'Admin approved a document' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('activity-row').filter({ hasText: 'Admin viewed a document' }).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Suspend' }).click();
  await page.getByLabel(/Reason/).fill('E2E: repeated no-shows reported by lenders');
  await page.getByRole('button', { name: 'Confirm suspend' }).click();
  await expect(page.getByTestId('user-status')).toHaveText('suspended');
  await expect(page.getByTestId('active-sessions')).toHaveText('Signed in on 0 devices');
  await expect(
    page.getByTestId('activity-row').filter({ hasText: 'E2E: repeated no-shows' }),
  ).toBeVisible();
  expect((await me(user)).status).toBeGreaterThanOrEqual(401);

  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByLabel(/Reason/).fill('E2E: appeal accepted');
  await page.getByRole('button', { name: 'Confirm reactivate' }).click();
  await expect(page.getByTestId('user-status')).toHaveText('active');
});

test('Support can read a user but not review documents or suspend', async ({ page }) => {
  await firstLogin(page, support.email, support.password);
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Documents' }),
  ).toHaveCount(0);

  await page.goto('/documents');
  await expect(page.getByTestId('forbidden')).toBeVisible();
  await page.goto(`/documents/${panId}`);
  await expect(page.getByTestId('forbidden')).toBeVisible();
  expect((await page.request.get(`/documents/${panId}/image?side=front`)).status()).toBe(403);

  await page.goto(`/users/${user.id}`);
  await expect(page.getByTestId('user-status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
  await expect(page.getByText('Only Ops and Super Admins can suspend or ban.')).toBeVisible();
});
