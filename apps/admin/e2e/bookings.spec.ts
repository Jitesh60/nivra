import { expect, test, type Page } from '@playwright/test';
import {
  bookingAction,
  createAppUser,
  publishListing,
  requestBooking,
  seedAdmin,
  shareDocuments,
  submitDocument,
  verifyEmail,
  viewSharedDocument,
  type AppUser,
} from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let lender: AppUser;
let borrower: AppUser;
let listingTitle = '';
let heldId = '';
let requestedId = '';
let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;
let opsPage: Page;

/** Rows are matched by their link, so bookings from earlier runs don't collide. */
const bookingRow = (page: Page, id: string) =>
  page.getByTestId('booking-row').filter({ has: page.locator(`a[href="/bookings/${id}"]`) });

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run, 'bookings');
  support = seedAdmin('SUPPORT', run, 'bookings');
  lender = await createAppUser('Asha Lender');
  await verifyEmail(lender);
  borrower = await createAppUser('Rahul Borrower');
  await verifyEmail(borrower);
  listingTitle = `E2E booking tent ${run}`;
  // Asks for a government ID (see publishListing).
  const listing = await publishListing(lender, { title: listingTitle });

  // A first listing waits for review: Ops approves it so it can be booked.
  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await opsPage.goto(`/listings/${listing.id}`);
  await opsPage.getByRole('button', { name: 'Approve' }).click();
  await expect(opsPage.getByTestId('listing-status')).toHaveText('Live');

  // Rahul requests, Asha accepts, Rahul shares his PAN, Asha opens it and approves:
  // the dates are now held for payment.
  const pan = await submitDocument(borrower, 'PAN');
  heldId = (await requestBooking(borrower, listing.id, 5, 6)).id;
  expect((await bookingAction(lender, heldId, 'accept')).status).toBe('AWAITING_DOCS');
  await shareDocuments(borrower, heldId, pan.id);
  await viewSharedDocument(lender, heldId);
  expect((await bookingAction(lender, heldId, 'documents/approve')).status).toBe(
    'AWAITING_PAYMENT',
  );

  // Someone else asks for later dates; still waiting for Asha.
  const priya = await createAppUser('Priya Borrower');
  await verifyEmail(priya);
  requestedId = (await requestBooking(priya, listing.id, 10, 11)).id;
});

test.afterAll(async () => {
  await opsPage?.close();
});

test('Ops finds a held booking, reads its timeline and document log, and cancels it', async () => {
  const page = opsPage;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Bookings' })
    .click();
  await expect(page).toHaveURL('/bookings');
  // Waiting for Asha: on the Open tab.
  await page.getByLabel('Search bookings').fill(listingTitle);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(bookingRow(page, requestedId)).toContainText('Priya Borrower → Asha Lender');
  await expect(bookingRow(page, heldId)).toHaveCount(0);

  await page.getByRole('link', { name: 'Awaiting payment' }).click();
  const row = bookingRow(page, heldId);
  await expect(row).toContainText('Rahul Borrower → Asha Lender');
  await expect(row).toContainText('Awaiting payment');
  await row.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(`/bookings/${heldId}`);

  await expect(page.getByTestId('booking-status')).toHaveText('Awaiting payment');
  const events = page.getByTestId('booking-event');
  await expect(events).toHaveCount(4);
  await expect(events.nth(0)).toContainText('Requested');
  await expect(events.nth(0)).toContainText('Rahul Borrower');
  await expect(events.nth(1)).toContainText('Accepted');
  await expect(events.nth(1)).toContainText('Asha Lender');
  await expect(events.nth(2)).toContainText('Documents shared');
  await expect(events.nth(3)).toContainText('Documents approved');
  const shared = page.getByTestId('shared-document');
  await expect(shared).toContainText('PAN');
  await expect(shared).toContainText('APPROVED');
  await expect(page.getByTestId('document-view')).toContainText('Opened by Asha Lender');
  await expect(page.getByTestId('lender-cancellations')).toContainText('0 cancellations');

  await page.getByRole('button', { name: 'Cancel booking…' }).click();
  await page.getByRole('button', { name: 'Reported as a scam' }).click();
  await expect(page.getByLabel('Reason (shown to both people)')).toHaveValue('Reported as a scam');
  await page.getByRole('button', { name: 'Confirm cancel' }).click();
  // The form goes once the booking is closed; the status shows the outcome.
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
  await expect(page.getByText('Cancelled by Sajha: “Reported as a scam”')).toBeVisible();
  await expect(events).toHaveCount(5);
  await expect(events.nth(4)).toContainText('E2E Ops Reviewer');

  await page.goto(`/bookings?tab=CLOSED&q=${encodeURIComponent(listingTitle)}`);
  await expect(bookingRow(page, heldId)).toContainText('Cancelled');
});

test('Support can read bookings but not cancel them', async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await firstLogin(page, support.email, support.password);
    await page.goto(`/bookings/${requestedId}`);
    await expect(page.getByTestId('booking-status')).toHaveText('Requested');
    await expect(page.getByTestId('cannot-cancel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel booking…' })).toHaveCount(0);
  } finally {
    await page.close();
  }
});
