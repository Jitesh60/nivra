import { expect, test, type Page } from '@playwright/test';
import {
  createAppUser,
  myListing,
  publicCategories,
  publicListingStatus,
  publishListing,
  seedAdmin,
  verifyEmail,
  type AppUser,
} from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let lender: AppUser;
let firstId = '';
let secondId = '';
let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;
let opsPage: Page;

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run, 'listings');
  support = seedAdmin('SUPPORT', run, 'listings');
  lender = await createAppUser('Aman Lender');
  await verifyEmail(lender);
  const first = await publishListing(lender, { title: `E2E trekking tent ${run}` });
  expect(first).toMatchObject({ status: 'PENDING', inReview: true });
  firstId = first.id;

  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await expect(opsPage).toHaveURL('/');
});

test.afterAll(async () => {
  await opsPage.close();
});

test('Ops approves a lender’s first listing; it goes public', async () => {
  const page = opsPage;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Listings' })
    .click();
  await expect(page).toHaveURL('/listings');
  const row = page
    .getByTestId('listing-row')
    .filter({ hasText: `E2E trekking tent ${state().run}` });
  await expect(row).toContainText('first listing');
  await row.getByRole('link', { name: 'Review' }).click();
  await expect(page).toHaveURL(`/listings/${firstId}`);

  // Photos render; prices and earnings; never the exact address.
  const photo = page.getByTestId('listing-photo').first();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByTestId('listing-price')).toHaveText('₹150');
  await expect(page.getByText('₹135')).toBeVisible();
  await expect(page.getByText('Kothrud, Pune')).toBeVisible();
  await expect(page.getByText('Government ID')).toBeVisible();
  await expect(page.getByTestId('first-listing')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Sai Residency');

  expect(await publicListingStatus(firstId)).toBe(404);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('listing-status')).toHaveText('Live');
  await expect(page.getByText(/^Reviewed .* by E2E Ops Reviewer$/)).toBeVisible();
  expect(await publicListingStatus(firstId)).toBe(200);
});

test('the lender’s next listing skips review; Ops can unpublish it', async () => {
  const second = await publishListing(lender, { title: `E2E camera kit ${state().run}` });
  expect(second).toMatchObject({ status: 'LIVE', inReview: false });
  secondId = second.id;

  const page = opsPage;
  await page.goto(
    `/listings?status=LIVE&search=${encodeURIComponent(`E2E camera kit ${state().run}`)}`,
  );
  const row = page.getByTestId('listing-row');
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText('first listing');
  await row.getByRole('link', { name: 'Open' }).click();

  await page.getByLabel('Common reasons (unpublish)').selectOption({ index: 3 });
  await expect(page.getByLabel('Reason shown to the lender (unpublish)')).toHaveValue(
    /isn’t allowed/,
  );
  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByTestId('listing-status')).toHaveText('Removed');
  expect(await publicListingStatus(secondId)).toBe(404);
  expect((await myListing(lender, secondId)).rejectionReason).toMatch(/isn’t allowed/);
});

test('Ops sends a listing back with a reason and can move its category', async () => {
  const newLender = await createAppUser('Rohan Newlender');
  await verifyEmail(newLender);
  const { id } = await publishListing(newLender, { title: `E2E blurry drill ${state().run}` });

  const page = opsPage;
  await page.goto(`/listings/${id}`);
  await page.getByLabel('Category').selectOption({ label: 'Tools & DIY' });
  await page.getByRole('button', { name: 'Move' }).click();
  await expect(page.getByText('Category updated.')).toBeVisible();
  expect((await myListing(newLender, id)).category.slug).toBe('tools-diy');

  await page
    .getByLabel('Reason shown to the lender (send back with a reason)')
    .fill('Photos are blurry, please retake them');
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByTestId('listing-status')).toHaveText('Rejected');
  expect(await myListing(newLender, id)).toMatchObject({
    status: 'REJECTED',
    rejectionReason: 'Photos are blurry, please retake them',
  });
});

test('the user page lists the lender’s listings and their moderation trail', async () => {
  const page = opsPage;
  await page.goto(`/users/${lender.id}`);
  await expect(page.getByTestId('user-listing-row')).toHaveCount(2);
  await expect(
    page.getByTestId('activity-row').filter({ hasText: 'Admin approved a listing' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('activity-row').filter({ hasText: 'Admin unpublished a listing' }),
  ).toBeVisible();
});

test('Ops manages categories; the apps see the changes', async () => {
  const page = opsPage;
  const run = state().run;
  const name = `E2E instruments ${run}`;
  const slug = `e2e-instruments-${run}`;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Categories' })
    .click();
  await expect(page).toHaveURL('/categories');

  await page.getByLabel('Name').last().fill(name);
  await expect(page.getByLabel('Slug').last()).toHaveValue(slug);
  await page.getByLabel('Icon').last().fill('music_note');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText(`Added “${name}”.`)).toBeVisible();
  expect((await publicCategories()).map((c) => c.slug)).toContain(slug);

  // A duplicate slug is refused with a clear message.
  await page.getByLabel('Name').last().fill('Another name');
  await page.getByLabel('Slug').last().fill(slug);
  await page.getByLabel('Icon').last().fill('music_note');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('Another category already uses this slug.')).toBeVisible();

  // Move it up one place.
  const rows = page.getByTestId('category-row');
  const before = await rows.allTextContents();
  const index = before.findIndex((t) => t.includes(name));
  await page.getByRole('button', { name: `Move ${name} up` }).click();
  await expect(rows.nth(index - 1)).toContainText(name);

  // Hide it: gone from the apps, kept in the admin list.
  const row = rows.filter({ hasText: name });
  await row.getByRole('button', { name: 'Hide' }).click();
  await expect(row.getByTestId('category-hidden')).toBeVisible();
  expect((await publicCategories()).map((c) => c.slug)).not.toContain(slug);
});

test('Support can read listings but not moderate them or manage categories', async ({ page }) => {
  await firstLogin(page, support.email, support.password);
  await expect(page).toHaveURL('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Listings' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Categories' })).toHaveCount(0);

  await page.goto('/categories');
  await expect(page.getByTestId('forbidden')).toBeVisible();

  await page.goto(`/listings/${firstId}`);
  await expect(page.getByTestId('listing-status')).toHaveText('Live');
  await expect(page.getByRole('button', { name: /Approve|Unpublish|Move/ })).toHaveCount(0);
  await expect(
    page.getByText('Only Ops and Super Admins can approve, reject or unpublish listings.'),
  ).toBeVisible();
});
