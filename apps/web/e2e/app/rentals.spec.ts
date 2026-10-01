import { expect, test, type Page } from '@playwright/test';
import { confirmedBooking, createAppUser, liveListing, resolveDispute, type AppUser } from './api';
import { photo, signIn, uniq } from './helpers';

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let lender: AppUser;
let borrower: AppUser;
let bookingId: string;

test.beforeAll(async () => {
  lender = await createAppUser('Asha Lender');
  borrower = await createAppUser('Rahul Borrower');
  const listing = await liveListing(lender, {
    title: `Web rental tent ${uniq()}`,
  });
  ({ id: bookingId } = await confirmedBooking(borrower, lender, listing.id, day(1), day(2)));
});

async function readCode(page: Page): Promise<string> {
  const code = (await page.getByTestId('stage-code').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function confirmStage(page: Page, button: string, code: string) {
  await page.getByLabel('Their code').fill(code);
  await page.getByLabel('Condition photos').setInputFiles([photo('a.jpg'), photo('b.jpg')]);
  await expect(page.getByRole('img', { name: 'Photo 2' })).toBeVisible();
  await page.getByRole('button', { name: button }).click();
}

test('handover → return → dispute → response → resolved → review, both sides on the web', async ({
  browser,
}) => {
  test.slow();
  const wait = Math.max(lender.codeAgainAt, borrower.codeAgainAt) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const rahul = await (await browser.newContext()).newPage();
  const asha = await (await browser.newContext()).newPage();
  await signIn(rahul, { phone: borrower.phone, next: `/bookings/${bookingId}` });
  await signIn(asha, { phone: lender.phone, next: `/bookings/${bookingId}` });
  await expect(rahul.getByTestId('booking-status')).toHaveText('Confirmed');

  // Handover: Rahul shows his code, Asha types it (a wrong one first) with photos.
  await rahul.getByRole('link', { name: 'Show pickup code' }).click();
  await expect(rahul.getByRole('img', { name: 'QR code of the same code' })).toBeVisible();
  const pickup = await readCode(rahul);
  await asha.getByRole('link', { name: 'Confirm handover' }).click();
  await confirmStage(asha, 'Confirm handover', pickup === '000000' ? '111111' : '000000');
  await expect(asha.getByText(/That code isn’t right/)).toBeVisible();
  await confirmStage(asha, 'Confirm handover', pickup);
  await expect(asha).toHaveURL(/\?handedover=1/);
  await expect(asha.getByTestId('booking-status')).toHaveText('With borrower');
  await expect(asha.getByRole('img', { name: 'Condition photo 1' }).first()).toBeVisible();

  // Rahul's code page moves on by itself.
  await rahul.goto(`/bookings/${bookingId}`);
  await expect(rahul.getByTestId('booking-status')).toHaveText('With borrower');

  // Return: Asha shows her code, Rahul confirms with photos.
  await asha.getByRole('link', { name: 'Show return code' }).click();
  const back = await readCode(asha);
  await rahul.getByRole('link', { name: 'Confirm return' }).click();
  await confirmStage(rahul, 'Confirm return', back);
  await expect(rahul).toHaveURL(/\?returned=1/);
  await expect(rahul.getByTestId('booking-status')).toHaveText('Returned');

  // Asha reports a problem; Rahul responds.
  await asha.goto(`/bookings/${bookingId}`);
  await asha.getByRole('link', { name: 'Report a problem' }).click();
  await asha.getByLabel('What went wrong?').selectOption('MISSING_PARTS');
  await asha.getByLabel('Describe it').fill('Two tent pegs and the bag were missing.');
  await asha.getByLabel(/Amount you’re claiming/).fill('200');
  await asha.getByRole('button', { name: 'Raise the problem' }).click();
  await expect(asha).toHaveURL(/\?disputed=1/);
  await expect(asha.getByTestId('booking-status')).toHaveText('In dispute');
  await expect(asha.getByTestId('dispute')).toContainText('missing parts');

  await rahul.goto(`/bookings/${bookingId}`);
  await rahul.getByRole('link', { name: 'Respond to the problem' }).click();
  await rahul.getByLabel('Your side').fill('I returned everything in the bag; see the photos.');
  await rahul.getByRole('button', { name: 'Send my response' }).click();
  await expect(rahul).toHaveURL(/\?responded=1/);
  await expect(rahul.getByTestId('dispute')).toContainText('Response: I returned everything');
  // Ops settles it (the booking completes), then Rahul reviews.
  await resolveDispute(bookingId, 10_000);
  await rahul.goto(`/bookings/${bookingId}`);
  await expect(rahul.getByTestId('booking-status')).toHaveText('Completed');
  await expect(rahul.getByTestId('dispute')).toContainText('Decision: Split fairly');
  await rahul.getByRole('link', { name: 'Leave a review' }).click();
  await rahul.getByRole('radio', { name: '5 stars' }).click();
  await rahul.getByLabel('A few words (optional)').fill('Great tent, easy pickup.');
  await rahul.getByRole('button', { name: 'Post review' }).click();
  await expect(rahul.getByText('Thanks for the review!')).toBeVisible();
  await expect(rahul.getByText(/Your review: ★★★★★/)).toBeVisible();

  // The lender's public reviews page is reachable from listings.
  await rahul.goto(`/u/${lender.id}`);
  await expect(rahul.getByRole('heading', { name: 'Reviews', level: 1 })).toBeVisible();
});
