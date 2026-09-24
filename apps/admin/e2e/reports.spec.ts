import { expect, test, type Page } from '@playwright/test';
import {
  chatMessages,
  createAppUser,
  publishListing,
  report,
  seedAdmin,
  sendMessage,
  startConversation,
  verifyEmail,
  type AppUser,
} from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const UPI_ASK = 'Pay me on asha@okaxis instead, or call 98765 43210';

let lender: AppUser;
let borrower: AppUser;
let listingId = '';
let conversationId = '';
let messageReportId = '';

/** Rows are matched by their link, so reports left by earlier runs don't collide. */
const reportRow = (page: Page, id: string) =>
  page.getByTestId('report-row').filter({ has: page.locator(`a[href="/reports/${id}"]`) });
let listingReportId = '';
let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;
let opsPage: Page;

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run, 'reports');
  support = seedAdmin('SUPPORT', run, 'reports');
  lender = await createAppUser('Asha Lender');
  await verifyEmail(lender);
  borrower = await createAppUser('Rahul Borrower');
  await verifyEmail(borrower);
  const listing = await publishListing(lender, { title: `E2E chat tent ${run}` });
  listingId = listing.id;

  // A first listing waits for review: Ops approves it so people can chat about it.
  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await opsPage.goto(`/listings/${listingId}`);
  await opsPage.getByRole('button', { name: 'Approve' }).click();
  await expect(opsPage.getByTestId('listing-status')).toHaveText('Live');

  // Rahul asks; Asha answers with her UPI ID and number, which Rahul sees hidden.
  conversationId = (await startConversation(borrower, listingId)).id;
  await sendMessage(borrower, conversationId, 'Hi! Is the tent free next weekend?');
  const ask = await sendMessage(lender, conversationId, UPI_ASK);
  expect(ask).toMatchObject({ body: UPI_ASK, masked: true });
  const [seen] = await chatMessages(borrower, conversationId);
  expect(seen!.body).toBe('Pay me on ••• instead, or call •••');

  messageReportId = (
    await report(borrower, {
      targetType: 'MESSAGE',
      targetId: ask.id,
      reason: 'OFF_PLATFORM_PAYMENT',
      note: 'Wants to be paid outside Sajha',
    })
  ).id;
  listingReportId = (
    await report(borrower, { targetType: 'LISTING', targetId: listingId, reason: 'OTHER' })
  ).id;
});

test.afterAll(async () => {
  await opsPage?.close();
});

test('Ops reviews a reported message, reads the logged transcript, and closes it', async () => {
  const page = opsPage;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Reports' })
    .click();
  await expect(page).toHaveURL('/reports');
  const row = reportRow(page, messageReportId);
  await expect(row).toContainText('Pay me on ••• instead');
  await expect(row).toContainText('Chat message');
  await expect(row).toContainText('Paying or talking outside Sajha');
  await row.getByRole('link', { name: 'Review' }).click();
  await expect(page).toHaveURL(`/reports/${messageReportId}`);

  // Admins see what was typed, and what the other person saw.
  await expect(page.getByTestId('original-text')).toHaveText(UPI_ASK);
  await expect(page.getByText('Pay me on ••• instead, or call •••')).toBeVisible();
  await expect(page.getByText('“Wants to be paid outside Sajha”')).toBeVisible();

  await page.getByRole('link', { name: 'View conversation (logged) →' }).click();
  await expect(page).toHaveURL(`/conversations/${conversationId}?report=${messageReportId}`);
  await expect(page.getByTestId('logged-banner')).toContainText('This view is logged');
  const messages = page.getByTestId('transcript-message');
  await expect(messages).toHaveCount(2);
  await expect(messages.nth(0)).toContainText('Rahul Borrower (borrower)');
  await expect(messages.nth(1)).toContainText(UPI_ASK);
  await expect(messages.nth(1)).toContainText('contact details hidden from the other person');

  await page.getByRole('link', { name: '← Report' }).click();
  await page.getByRole('radio', { name: /^Actioned/ }).check();
  await page
    .getByLabel('Note for the record')
    .fill('Warned the lender about off-platform payment.');
  await page.getByRole('button', { name: 'Close report' }).click();
  // The form goes once the report is closed; the badge and note show the outcome.
  await expect(page.getByTestId('report-status')).toHaveText('Actioned');
  await expect(page.getByText('Warned the lender about off-platform payment.')).toBeVisible();

  await page.goto('/reports?status=ACTIONED');
  await expect(reportRow(page, messageReportId)).toBeVisible();
});

test('Support can read reports but not close them', async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await firstLogin(page, support.email, support.password);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Reports' })
      .click();
    const row = reportRow(page, listingReportId);
    await expect(row).toContainText(`E2E chat tent ${state().run}`);
    await expect(row).toContainText('Listing');
    await row.getByRole('link', { name: 'Review' }).click();
    await expect(page).toHaveURL(`/reports/${listingReportId}`);
    await expect(page.getByRole('link', { name: 'Open listing →' })).toBeVisible();
    await expect(page.getByTestId('cannot-resolve')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close report' })).toHaveCount(0);
  } finally {
    await page.close();
  }
});
