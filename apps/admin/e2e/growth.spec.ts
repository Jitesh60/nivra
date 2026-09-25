import { expect, test, type Page } from '@playwright/test';
import {
  answerRequest,
  createAppUser,
  myReferral,
  postRequest,
  publishListing,
  redeemCode,
  report,
  seedAdmin,
  verifyEmail,
  type AppUser,
} from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;
let opsPage: Page;
let lender: AppUser;
let borrower: AppUser;
let requestId = '';
let requestReportId = '';
let requestTitle = '';

/** Rows are matched by their link, so requests from earlier runs don't collide. */
const requestRow = (page: Page, id: string) =>
  page.getByTestId('request-row').filter({ has: page.locator(`a[href="/requests/${id}"]`) });

test.beforeAll(async ({ browser }) => {
  const { run } = state();
  ops = seedAdmin('OPS', run, 'growth');
  support = seedAdmin('SUPPORT', run, 'growth');
  lender = await createAppUser('Asha Lender');
  await verifyEmail(lender);
  borrower = await createAppUser('Rahul Borrower');
  await verifyEmail(borrower);
  const listing = await publishListing(lender, { title: `E2E growth tent ${run}` });

  // A first listing waits for review; once live, Asha can answer requests with it.
  opsPage = await browser.newPage();
  await firstLogin(opsPage, ops.email, ops.password);
  await opsPage.goto(`/listings/${listing.id}`);
  await opsPage.getByRole('button', { name: 'Approve' }).click();
  await expect(opsPage.getByTestId('listing-status')).toHaveText('Live');

  requestTitle = `E2E: 2-person tent for a trek ${run}`;
  requestId = (await postRequest(borrower, requestTitle)).id;
  await answerRequest(lender, requestId, listing.id);
  requestReportId = (
    await report(lender, { targetType: 'REQUEST', targetId: requestId, reason: 'SPAM' })
  ).id;
});

test.afterAll(async () => {
  await opsPage?.close();
});

test('Ops sees a reported request with its answer, and takes it down with a reason', async () => {
  const page = opsPage;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Requests' })
    .click();
  await expect(page).toHaveURL(/\/requests/);
  const row = requestRow(page, requestId);
  await expect(row).toContainText(requestTitle);
  await expect(row.getByTestId('request-answers')).toHaveText('1');
  await expect(row.getByTestId('request-reports')).toHaveText('1 open');

  await row.getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: requestTitle })).toBeVisible();
  await expect(page.getByTestId('request-status')).toHaveText('Open');
  const answer = page.getByTestId('request-response');
  await expect(answer).toHaveCount(1);
  await expect(answer).toContainText('Asha Lender');
  await expect(answer.getByRole('link', { name: 'Open the chat →' })).toBeVisible();

  // The report points at the request, not the borrower.
  await page.goto(`/reports/${requestReportId}`);
  await page.getByRole('link', { name: 'Open request →' }).click();
  await expect(page).toHaveURL(`/requests/${requestId}`);

  await page
    .getByLabel('Reason shown to the borrower')
    .fill('Looks like spam or an advert, not a real request.');
  await page.getByRole('button', { name: 'Remove request' }).click();
  // The form goes once the request is no longer open; the status and reason show.
  await expect(page.getByTestId('request-status')).toHaveText('Removed');
  await expect(page.getByTestId('request-removed-reason')).toContainText(
    'Looks like spam or an advert',
  );

  await page.goto('/requests?status=REMOVED');
  await expect(requestRow(page, requestId)).toBeVisible();
  await page.goto('/requests?status=OPEN');
  await expect(requestRow(page, requestId)).toHaveCount(0);
});

test('Support can read requests but not remove them', async ({ browser }) => {
  const { run } = state();
  const other = await postRequest(borrower, `E2E: a camera tripod ${run}`);
  const page = await browser.newPage();
  await firstLogin(page, support.email, support.password);
  await page.goto(`/requests/${other.id}`);
  await expect(page.getByTestId('request-status')).toHaveText('Open');
  await expect(page.getByTestId('request-no-moderation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove request' })).toHaveCount(0);
  await page.close();
});

test('invite credit: who invited whom, and Ops takes unused credit away', async () => {
  const page = opsPage;
  const inviter = await createAppUser('Meera Inviter');
  const friend = await createAppUser('Kabir Friend');
  const { code } = await myReferral(inviter);
  expect((await redeemCode(friend, code)).creditBalancePaise).toBe(10_000);

  await page.goto(`/users/${friend.id}`);
  const card = page.getByTestId('invite-credit');
  await expect(card.getByTestId('credit-balance')).toHaveText('₹100');
  await expect(card.getByTestId('referred-by')).toHaveText('Meera Inviter');
  await expect(page.getByTestId('credit-entry')).toContainText(['Joined with an invite code']);

  // More than the balance: the API refuses.
  await card.getByLabel('Amount to take away, in rupees').fill('500');
  await card.getByLabel('Reason for taking credit away').fill('Checking the limit.');
  await card.getByRole('button', { name: 'Take credit away' }).click();
  await expect(card.getByRole('alert')).toBeVisible();

  await card.getByLabel('Amount to take away, in rupees').fill('40');
  await card.getByLabel('Reason for taking credit away').fill('Invite abuse (same device).');
  await card.getByRole('button', { name: 'Take credit away' }).click();
  await expect(card.getByRole('status')).toContainText('Took ₹40 of credit away.');
  await expect(card.getByTestId('credit-balance')).toHaveText('₹60');
  await expect(page.getByTestId('credit-entry').first()).toContainText('Taken away by an admin');
  await expect(page.getByRole('main')).toContainText('Admin took invite credit away');

  // The inviter's page lists the friend.
  await card.getByTestId('referred-by').getByRole('link').click();
  await expect(page).toHaveURL(`/users/${inviter.id}`);
  await expect(page.getByTestId('invited-count')).toHaveText('1');
  await expect(page.getByTestId('invited-person')).toContainText('Kabir Friend');
});

test('the dashboard shows invite sign-ups and credit used', async () => {
  await opsPage.goto('/?days=90');
  await expect(opsPage.getByTestId('kpi-referralSignups')).toBeVisible();
  await expect(opsPage.getByTestId('kpi-creditsSpentPaise')).toContainText('Invite credit used');
});
