import { expect, test } from '@playwright/test';
import { createAppUser, liveListing, type AppUser } from './api';
import { signIn, uniq } from './helpers';

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let lender: AppUser;
let mine: { id: string };
let theirs: { id: string };

test.beforeAll(async () => {
  lender = await createAppUser('Meera Both');
  const other = await createAppUser('Kabir Lender');
  [mine, theirs] = await Promise.all([
    liveListing(lender, { title: `Meera's drill ${uniq()}` }),
    liveListing(other, { title: `Kabir's tent ${uniq()}` }),
  ]);
});

test('the dock sits at the bottom and the Me sheet holds borrowing and lending', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, { name: 'Dock Tester', next: '/bookings' });

  const dock = page.getByRole('navigation', { name: 'App' });
  await expect(dock).toBeVisible();
  const box = (await dock.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);

  await dock.getByRole('link', { name: 'Lend' }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(dock.getByRole('link', { name: 'Lend' })).toHaveAttribute('aria-current', 'page');
  await dock.getByRole('link', { name: 'Borrow' }).click();
  await expect(page).toHaveURL(/\/explore/);
  await expect(dock.getByRole('link', { name: 'List an item' })).toHaveAttribute(
    'href',
    '/listings/new',
  );

  await dock.getByRole('button', { name: 'Me', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Me' });
  await expect(sheet.getByRole('region', { name: 'Borrowing' })).toBeVisible();
  await expect(sheet.getByRole('region', { name: 'Lending' })).toBeVisible();
  await sheet.getByRole('link', { name: 'Things I’m lending' }).click();
  await expect(page).toHaveURL(/\/bookings\?role=LENDER/);
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});

test('a lender can borrow other people’s things, but not their own', async ({ page }) => {
  test.slow();
  // The lender's number just got a code from the API; wait out the resend cooldown.
  const wait = lender.codeAgainAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await signIn(page, { phone: lender.phone, next: `/item/${mine.id}` });

  const own = page.getByTestId('own-listing');
  await expect(own).toContainText('This is your listing');
  await expect(own.getByRole('link', { name: 'Edit listing' })).toHaveAttribute(
    'href',
    `/listings/${mine.id}`,
  );
  await expect(page.getByRole('button', { name: 'Check price' })).toHaveCount(0);

  await page.goto(`/item/${theirs.id}?start=${day(3)}&end=${day(4)}`);
  await expect(page.getByTestId('own-listing')).toHaveCount(0);
  await expect(page.getByTestId('quote')).toContainText('× 2 days');
  await page.getByRole('button', { name: 'Request to book' }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?requested=1/);
  await expect(page.getByTestId('booking-status')).toHaveText('Requested');
});
