import { expect, test } from '@playwright/test';
import { approveListing } from './api';
import { photo, signIn, uniq } from './helpers';

test('a lender lists an item from scratch and sends it for review', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const title = `Web camping stove ${uniq()}`;
  await signIn(page, { name: 'Meera Lender', next: '/listings' });

  await expect(page.getByText('Nothing listed yet')).toBeVisible();
  await page.getByRole('link', { name: 'List your first item' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Condition').selectOption('LIKE_NEW');
  await page.getByLabel('Description').fill('Compact gas stove with windshield and a carry pouch.');
  await page.getByLabel('Price per day (₹)').fill('120');
  await page.getByLabel('Refundable deposit (₹)').fill('800');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}\?created=1/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();

  // 1. Photos
  await page.getByLabel('Add listing photos').setInputFiles([photo('a.jpg'), photo('b.jpg')]);
  await expect(page.getByText('2 photos added.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Make photo 2 the cover' }).click();
  await page.getByRole('button', { name: 'Remove photo 2' }).click();
  await expect(page.getByRole('img', { name: 'Photo 2' })).toHaveCount(0);

  // 2. Pickup: drop the pin on the map, name the area
  const map = page.getByRole('application', { name: /Pickup location map/ });
  await expect(map).toBeVisible();
  await map.click({ position: { x: 150, y: 120 } });
  await page.getByLabel('Area name').fill('Baner, Pune');
  await page.getByLabel('Exact address (optional)').fill('12 Test Lane');
  await page.getByRole('button', { name: 'Save pickup' }).click();
  await expect(page.getByText('Pickup saved.')).toBeVisible();

  // 4. Block a weekend
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('First day').fill(day(10));
  await page.getByLabel('Last day').fill(day(11));
  await page.getByRole('button', { name: 'Block dates' }).click();
  await expect(page.getByText('Dates saved.')).toBeVisible();

  // 5. Ask for an ID
  await page.getByLabel('Government ID', { exact: true }).check();
  await page.getByRole('button', { name: 'Save documents' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

  // 6. Publish → first listing goes to review
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Sent for review/)).toBeVisible();
  await expect(page.getByText('In review', { exact: true })).toBeVisible();

  await page.goto('/listings');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toContainText('In review');
  expect(errors).toEqual([]);
});

test('a lender pauses, resumes and deletes a listing', async ({ page }) => {
  test.slow();
  const title = `Web drill ${uniq()}`;
  await signIn(page, { name: 'Kabir Lender', next: '/listings/new' });
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Description').fill('Cordless drill with two batteries and a bit set.');
  await page.getByLabel('Price per day (₹)').fill('200');
  await page.getByLabel('Refundable deposit (₹)').fill('1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}/);
  const id = new URL(page.url()).pathname.split('/').pop()!;

  await page.getByLabel('Add listing photos').setInputFiles(photo());
  await expect(page.getByText('Photo added.')).toBeVisible();
  await page
    .getByRole('application', { name: /Pickup location map/ })
    .click({ position: { x: 120, y: 100 } });
  await page.getByLabel('Area name').fill('Aundh, Pune');
  await page.getByRole('button', { name: 'Save pickup' }).click();
  await expect(page.getByText('Pickup saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Sent for review/)).toBeVisible();

  await approveListing(id);
  await page.reload();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused: hidden from search.')).toBeVisible();
  await page.getByRole('button', { name: 'Make live again' }).click();
  await expect(page.getByText('Live again.')).toBeVisible();
  await page.getByRole('link', { name: 'View as a borrower' }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await page.goto(`/listings/${id}`);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/listings\?deleted=1/);
  await expect(page.getByText('Listing deleted.')).toBeVisible();
});
