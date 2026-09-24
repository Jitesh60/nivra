import { expect, test, type Page } from '@playwright/test';
import {
  bookingAction,
  createAppUser,
  payBooking,
  publishListing,
  requestBooking,
  seedAdmin,
  verifyEmail,
  type AppUser,
} from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let lender: AppUser;
let borrower: AppUser;
let listingTitle = '';
let bookingId = '';
let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;
let opsPage: Page;

// ₹150/day × 2 days + ₹1,000 deposit.
const TOTAL = '₹1,300';

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run, 'payments');
  support = seedAdmin('SUPPORT', run, 'payments');
  lender = await createAppUser('Meera Lender');
  await verifyEmail(lender);
  borrower = await createAppUser('Kabir Borrower');
  await verifyEmail(borrower);
  listingTitle = `E2E paid tent ${run}`;
  const listing = await publishListing(lender, { title: listingTitle, requireId: false });

  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await opsPage.goto(`/listings/${listing.id}`);
  await opsPage.getByRole('button', { name: 'Approve' }).click();
  await expect(opsPage.getByTestId('listing-status')).toHaveText('Live');

  // Kabir books, Meera accepts, Kabir pays through the test checkout.
  bookingId = (await requestBooking(borrower, listing.id, 20, 21)).id;
  expect((await bookingAction(lender, bookingId, 'accept')).status).toBe('AWAITING_PAYMENT');
  expect(await payBooking(borrower, bookingId)).toBe('CONFIRMED');
});

test.afterAll(async () => {
  await opsPage?.close();
});

test('a paid booking shows up in Payments with its payout and ledger lines', async () => {
  const page = opsPage;
  await page.goto(`/bookings/${bookingId}`);
  await expect(page.getByTestId('booking-status')).toHaveText('Confirmed');
  await expect(page.getByTestId('booking-event').last()).toContainText('Paid (confirmed)');
  await page.getByTestId('booking-payments').click();

  await expect(page).toHaveURL(new RegExp(`/payments\\?q=${bookingId}`));
  const row = page.getByTestId('payment-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(listingTitle);
  await expect(row).toContainText('Kabir Borrower');
  await expect(row).toContainText(TOTAL);
  await expect(row).toContainText('Paid');
  await row.getByRole('link', { name: 'Open' }).click();

  await expect(page.getByTestId('payment-status')).toHaveText('Paid');
  await expect(page.getByTestId('refundable')).toContainText(TOTAL);
  // Meera has no payout account yet: her share (₹300 less 10%) waits.
  const transfer = page.getByTestId('transfer-row');
  await expect(transfer).toContainText('Meera Lender');
  await expect(transfer).toContainText('₹270');
  await expect(transfer).toContainText('Waiting for bank account');
  // Captured: gateway debit, then deposit, lender and Sajha credits.
  await expect(page.getByTestId('ledger-line')).toHaveCount(4);
  await expect(page.getByTestId('refund-row')).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'Finance' })
    .getByRole('link', { name: 'Ledger' })
    .click();
  await expect(page).toHaveURL('/payments/ledger');
  await expect(page.getByTestId('ledger-balanced')).toHaveText('Balanced');
  await expect(page.getByTestId('check-unbalanced')).toHaveText('0');
  await expect(page.getByTestId('check-unposted')).toHaveText('0');

  await page
    .getByRole('navigation', { name: 'Finance' })
    .getByRole('link', { name: 'Payouts' })
    .click();
  await page.getByRole('link', { name: 'Waiting for bank account' }).click();
  await expect(
    page
      .getByTestId('payout-row')
      .filter({ has: page.locator(`a[href="/bookings/${bookingId}"]`) }),
  ).toContainText('₹270');
});

test('Ops refunds part of a payment as goodwill', async () => {
  const page = opsPage;
  await page.goto(`/payments?q=${bookingId}`);
  await page.getByTestId('payment-row').getByRole('link', { name: 'Open' }).click();

  await page.getByRole('button', { name: 'Refund…' }).click();
  await expect(page.getByLabel('Amount (₹)')).toHaveValue('1300');
  // More than was paid is refused.
  await page.getByLabel('Amount (₹)').fill('5000');
  await page.getByRole('button', { name: 'Charged twice' }).click();
  await page.getByRole('button', { name: 'Confirm refund' }).click();
  await expect(page.getByTestId('refund-error')).toContainText('₹1,300');

  await page.getByLabel('Amount (₹)').fill('150');
  await page.getByRole('button', { name: 'Goodwill after a complaint' }).click();
  await expect(page.getByLabel('Reason (audit log)')).toHaveValue('Goodwill after a complaint');
  await page.getByRole('button', { name: 'Confirm refund' }).click();
  await expect(page.getByTestId('refund-done')).toContainText('Refund of ₹150');

  await expect(page.getByTestId('payment-status')).toHaveText('Partly refunded');
  await expect(page.getByTestId('refundable')).toContainText('₹1,150');
  const refund = page.getByTestId('refund-row');
  await expect(refund).toHaveCount(1);
  await expect(refund).toContainText('Goodwill (manual)');
  await expect(refund).toContainText('₹150');
  await expect(refund).toContainText('E2E Ops Reviewer');
  // Sajha pays for it: goodwill debit, gateway credit.
  await expect(page.getByTestId('ledger-line')).toHaveCount(6);

  await page.goto('/payments/ledger');
  await expect(page.getByTestId('ledger-balanced')).toHaveText('Balanced');
});

test('Support can read payments but not refund them', async ({ browser }) => {
  const page = await browser.newPage();
  await firstLogin(page, support.email, support.password);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Payments' })
    .click();
  await expect(page).toHaveURL('/payments');
  await page.getByLabel('Search payments').fill(listingTitle);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByTestId('payment-row').getByRole('link', { name: 'Open' }).click();
  await expect(page.getByTestId('payment-status')).toHaveText('Partly refunded');
  await expect(page.getByTestId('cannot-refund')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refund…' })).toHaveCount(0);

  await page.goto('/payments/ledger');
  await expect(page.getByTestId('ledger-balanced')).toHaveText('Balanced');
  await page.close();
});
