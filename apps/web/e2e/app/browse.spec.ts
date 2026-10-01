import { expect, test } from '@playwright/test';
import { createAppUser, liveListing } from './api';
import { browseFromOwnIp, newPhone, signIn, uniq } from './helpers';

let run: string;
let title: string;
let listingId: string;

test.beforeAll(async () => {
  // Fresh per run of this hook: a worker may run it more than once.
  run = uniq();
  title = `Webtest dome tent ${run}`;
  const lender = await createAppUser('Asha Lender');
  ({ id: listingId } = await liveListing(lender, {
    title,
    description: 'Two-person dome tent with rain fly. Pegs and bag included.',
  }));
});

/** A date `days` from today, YYYY-MM-DD. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('a guest searches, opens an item and prices their dates', async ({ page }) => {
  await browseFromOwnIp(page, newPhone());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search' }).fill(`dome tent ${run}`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=dome/);
  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();

  await expect(page).toHaveURL(new RegExp(`/item/${listingId}`));
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Kothrud, Pune').first()).toBeVisible();
  await expect(page.getByText('₹150', { exact: true })).toBeVisible();

  await page.getByLabel('From', { exact: true }).fill(day(3));
  await page.getByLabel('To', { exact: true }).fill(day(5));
  await page.getByRole('button', { name: 'Check price' }).click();
  const quote = page.getByTestId('quote');
  await expect(quote).toContainText('₹150 × 3 days');
  await expect(quote).toContainText('Refundable deposit');
  await expect(quote).toContainText('Total today');
  expect(errors).toEqual([]);
});

test('saving as a guest asks for sign-in, then the item lands in the wishlist', async ({
  page,
}) => {
  await browseFromOwnIp(page, newPhone());
  await page.goto(`/item/${listingId}`);
  await page.getByRole('button', { name: `Save ${title} to wishlist` }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fitem%2F/);

  await signIn(page, { name: 'Rahul Borrower', next: `/item/${listingId}`, skipEmail: true });
  await expect(page).toHaveURL(new RegExp(`/item/${listingId}`));
  await page.getByRole('button', { name: `Save ${title} to wishlist` }).click();
  await expect(page.getByRole('button', { name: `Remove ${title} from wishlist` })).toBeVisible();

  await page.goto('/wishlist');
  await expect(page.getByRole('heading', { name: 'Wishlist', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  await page.getByRole('button', { name: `Remove ${title} from wishlist` }).click();
  await page.reload();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
});

test('filters narrow the results and an impossible search says so', async ({ page }) => {
  await browseFromOwnIp(page, newPhone());
  await page.goto(`/explore?q=${encodeURIComponent(`dome tent ${run}`)}&max=100`);
  await expect(page.getByText('No matches')).toBeVisible(); // ₹150/day is over ₹100
  await page.goto(`/explore?q=${encodeURIComponent(`dome tent ${run}`)}&max=200`);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await page.goto('/explore?q=zzqqxxnothinglikethis');
  await expect(page.getByText('No matches')).toBeVisible();
});

test('an unknown item shows a friendly page', async ({ page }) => {
  await page.goto('/item/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('This item isn’t available')).toBeVisible();
});
