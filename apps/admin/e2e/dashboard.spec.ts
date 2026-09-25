import { expect, test } from '@playwright/test';
import {
  bookingAction,
  createAppUser,
  payBooking,
  publishListing,
  requestBooking,
  seedAdmin,
  verifyEmail,
} from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

// Dashboard numbers are cached for 5 minutes per period, and every login lands
// on the 30-day view, so these tests read the 90- and 7-day views.
test('the dashboard counts a paid booking, and the period can be switched', async ({ page }) => {
  const { run } = state();
  const ops = seedAdmin('OPS', run, 'dashboard');
  const lender = await createAppUser('Dia Lender');
  await verifyEmail(lender);
  const borrower = await createAppUser('Omar Borrower');
  await verifyEmail(borrower);
  const listing = await publishListing(lender, {
    title: `E2E dashboard tent ${run}`,
    requireId: false,
  });

  await firstLogin(page, ops.email, ops.password);
  await page.goto(`/listings/${listing.id}`);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('listing-status')).toHaveText('Live');

  const booking = await requestBooking(borrower, listing.id, 30, 31);
  await bookingAction(lender, booking.id, 'accept');
  expect(await payBooking(borrower, booking.id)).toBe('CONFIRMED');

  await page.goto('/?days=90');
  await expect(page.getByRole('link', { name: '90 days' })).toHaveAttribute('aria-current', 'page');
  const value = (key: string) => page.getByTestId(`kpi-${key}`).getByTestId('kpi-value');
  await expect(value('confirmed')).not.toHaveText('0');
  await expect(value('signups')).not.toHaveText('0');
  await expect(value('gmvPaise')).not.toHaveText('₹0');
  await expect(page.getByTestId('funnel-paid')).not.toHaveText(/^0 /);
  // One bar per day, with a readable table behind the chart.
  await expect(page.getByTestId('chart-bookings').locator('svg g')).toHaveCount(90);
  await expect(page.getByTestId('chart-bookings').getByRole('table')).toBeAttached();
  await expect(page.getByTestId('right-now')).toContainText('Live listings');

  await page
    .getByRole('navigation', { name: 'Period' })
    .getByRole('link', { name: '7 days' })
    .click();
  await expect(page).toHaveURL(/\?days=7$/);
  await expect(page.getByTestId('chart-gmv').locator('svg g')).toHaveCount(7);
  await expect(value('confirmed')).not.toHaveText('0');
});

test('Support sees the dashboard too', async ({ browser }) => {
  const { run } = state();
  const support = seedAdmin('SUPPORT', run, 'dashboard');
  const page = await browser.newPage();
  await firstLogin(page, support.email, support.password);
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('kpi-confirmed')).toBeVisible();
  await expect(page.getByTestId('funnel')).toBeVisible();
  // The API status card lists every job queue with its depth.
  await expect(page.getByTestId('queue-row')).toHaveCount(4);
  await expect(page.getByTestId('queues')).toContainText('bookings');
  await expect(page.getByTestId('queues')).toContainText('email');
  await expect(page.getByTestId('api-version')).toContainText('version');
  await page.close();
});
