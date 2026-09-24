import { expect, test, type Page } from '@playwright/test';
import {
  bookingAction,
  bookingCode,
  confirmStage,
  createAppUser,
  openDispute,
  payBooking,
  publishListing,
  requestBooking,
  respondToDispute,
  seedAdmin,
  sendMessage,
  startConversation,
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

const CLAIM = 'The tent came back with a torn fly sheet and a bent pole.';
const REPLY = 'The pole was already bent when I picked it up.';
const CHAT = 'Heads up: one pole looks a little bent.';

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run, 'disputes');
  support = seedAdmin('SUPPORT', run, 'disputes');
  lender = await createAppUser('Nisha Lender');
  await verifyEmail(lender);
  borrower = await createAppUser('Arjun Borrower');
  await verifyEmail(borrower);
  listingTitle = `E2E disputed tent ${run}`;
  const listing = await publishListing(lender, { title: listingTitle, requireId: false });

  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await opsPage.goto(`/listings/${listing.id}`);
  await opsPage.getByRole('button', { name: 'Approve' }).click();
  await expect(opsPage.getByTestId('listing-status')).toHaveText('Live');

  // Arjun books from tomorrow (handover opens the day before), pays, and
  // mentions the pole in chat.
  bookingId = (await requestBooking(borrower, listing.id, 1, 2)).id;
  expect((await bookingAction(lender, bookingId, 'accept')).status).toBe('AWAITING_PAYMENT');
  expect(await payBooking(borrower, bookingId)).toBe('CONFIRMED');
  const chat = await startConversation(borrower, listing.id);
  await sendMessage(borrower, chat.id, CHAT);

  // Handover with Arjun's code and Nisha's photos; return with Nisha's code
  // and Arjun's photos.
  const handover = await bookingCode(borrower, bookingId);
  expect(handover.stage).toBe('HANDOVER');
  expect(
    (await confirmStage(lender, bookingId, 'handover', handover.code, 'All good, pole straight'))
      .status,
  ).toBe('ACTIVE');
  const back = await bookingCode(lender, bookingId);
  expect(back.stage).toBe('RETURN');
  expect((await confirmStage(borrower, bookingId, 'return', back.code)).status).toBe('RETURNED');

  // Nisha claims ₹800 of the ₹1,000 deposit; Arjun replies.
  expect(
    (
      await openDispute(lender, bookingId, {
        reason: 'DAMAGE',
        description: CLAIM,
        claimPaise: 80_000,
      })
    ).status,
  ).toBe('DISPUTED');
  await respondToDispute(borrower, bookingId, REPLY);
});

test.afterAll(async () => {
  await opsPage?.close();
});

test('Support can read a dispute but not settle it', async ({ browser }) => {
  const page = await browser.newPage();
  await firstLogin(page, support.email, support.password);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Disputes' })
    .click();
  await expect(page).toHaveURL('/disputes');
  const row = page.getByTestId('dispute-row').filter({ hasText: listingTitle });
  await expect(row).toContainText('Damaged');
  await expect(row).toContainText('Borrower replied');
  await expect(row).toContainText('₹800');
  await row.getByRole('link', { name: 'Review' }).click();

  await expect(page.getByTestId('dispute-status')).toHaveText('Open');
  await expect(page.getByTestId('dispute-description')).toContainText(CLAIM);
  await expect(page.getByTestId('cannot-resolve')).toBeVisible();
  await expect(page.getByLabel('Lender keeps (₹)')).toHaveCount(0);
  await page.close();
});

test('Ops compares the photos and chat, then keeps ₹600 of the deposit', async () => {
  const page = opsPage;
  await page.goto('/disputes');
  await page
    .getByTestId('dispute-row')
    .filter({ hasText: listingTitle })
    .getByRole('link', { name: 'Review' })
    .click();

  // The claim, the reply and their photos.
  await expect(page.getByTestId('dispute-claim')).toHaveText('₹800');
  await expect(page.getByTestId('dispute-description')).toContainText(CLAIM);
  await expect(page.getByTestId('evidence-photo')).toHaveCount(1);
  await expect(page.getByTestId('dispute-response')).toContainText(REPLY);
  await expect(page.getByTestId('response-photo')).toHaveCount(1);

  // Condition photos side by side: Nisha's at handover, Arjun's at return.
  await expect(
    page.getByTestId('photos-HANDOVER-LENDER').getByTestId('condition-photo'),
  ).toHaveCount(2);
  await expect(page.getByTestId('photos-HANDOVER-LENDER')).toContainText('All good, pole straight');
  await expect(
    page.getByTestId('photos-RETURN-BORROWER').getByTestId('condition-photo'),
  ).toHaveCount(2);
  await expect(page.getByTestId('photos-RETURN-LENDER')).toContainText('None.');

  // Photos come through our own route, never cached; the storage link stays on the server.
  const href = await page.getByTestId('evidence-photo').getAttribute('href');
  expect(href).toBe(`${new URL(page.url()).pathname}/photos/4`);
  const photo = await page.request.get(href!);
  expect(photo.status()).toBe(200);
  expect(photo.headers()['content-type']).toMatch(/^image\//);
  expect(photo.headers()['cache-control']).toContain('no-store');
  expect((await page.request.get(`${href!.replace(/\/4$/, '/9')}`)).status()).toBe(404);

  // The chat excerpt and the money.
  await expect(page.getByTestId('chat-excerpt')).toContainText(CHAT);
  await expect(page.getByTestId('late-fee')).toHaveText('₹0');
  await expect(page.getByTestId('max-keep')).toHaveText('₹1,000');

  // The form starts at the claim; too much is refused before anything is sent.
  await expect(page.getByLabel('Lender keeps (₹)')).toHaveValue('800');
  await page.getByLabel('Lender keeps (₹)').fill('1200');
  await expect(page.getByRole('button', { name: 'Settle dispute…' })).toBeDisabled();
  await page.getByLabel('Lender keeps (₹)').fill('600');
  await expect(page.getByTestId('split-lender')).toHaveText('₹600');
  await expect(page.getByTestId('split-borrower')).toHaveText('₹400');
  await page
    .getByLabel('Note (both people see it)')
    .fill('The return photos show the tear; the pole was mentioned in chat before the rental.');
  await page.getByRole('button', { name: 'Settle dispute…' }).click();
  await page.getByRole('button', { name: 'Confirm and settle' }).click();
  // The page shows the decision in place of the form.
  await expect(page.getByTestId('dispute-status')).toHaveText('Settled');
  await expect(page.getByLabel('Lender keeps (₹)')).toHaveCount(0);
  await expect(page.getByTestId('outcome-kept')).toHaveText('₹600');
  await expect(page.getByTestId('outcome-returned')).toHaveText('₹400');
  await expect(page.getByTestId('dispute-outcome')).toContainText('E2E Ops Reviewer');

  // The booking completed, with the rental and its photos, and can't be cancelled.
  await page.goto(`/bookings/${bookingId}`);
  await expect(page.getByTestId('booking-status')).toHaveText('Completed');
  await expect(page.getByTestId('booking-event').last()).toContainText('Dispute settled');
  await expect(page.getByTestId('rental-card')).toContainText('₹600');
  await expect(page.getByTestId('condition-photo')).toHaveCount(4);
  await expect(page.getByText('Cancel this booking')).toHaveCount(0);
  const bookingPhoto = await page.request.get(`/bookings/${bookingId}/photos/0?thumb=1`);
  expect(bookingPhoto.status()).toBe(200);
  expect(bookingPhoto.headers()['cache-control']).toContain('no-store');

  // Arjun got the rest of the deposit back, and the books balance.
  await page.getByTestId('booking-payments').click();
  await page.getByTestId('payment-row').getByRole('link', { name: 'Open' }).click();
  const refund = page.getByTestId('refund-row').filter({ hasText: 'Deposit back' });
  await expect(refund).toHaveCount(1);
  await expect(refund).toContainText('₹400');
  await page.goto('/payments/ledger');
  await expect(page.getByTestId('ledger-balanced')).toHaveText('Balanced');

  // It's under Settled now.
  await page.goto('/disputes?status=RESOLVED');
  await expect(page.getByTestId('dispute-row').filter({ hasText: listingTitle })).toHaveCount(1);
});
