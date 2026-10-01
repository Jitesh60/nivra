import { expect, test, type Browser, type Page } from '@playwright/test';
import { createAppUser, liveListing, type AppUser } from './api';
import { photo, signIn } from './helpers';

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let lender: AppUser;
let listing: { id: string };
let title: string;

test.beforeAll(async () => {
  title = `Web booking tent ${Date.now().toString(36)}`;
  lender = await createAppUser('Asha Lender');
  listing = await liveListing(lender, { title, requireId: true });
});

async function lenderPage(browser: Browser): Promise<Page> {
  // The lender's number just got a code from the API; wait out the resend cooldown.
  const wait = lender.codeAgainAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const page = await (await browser.newContext()).newPage();
  await signIn(page, { phone: lender.phone, next: '/bookings?role=LENDER' });
  return page;
}

test('request → accept → share ID → approve → pay → confirmed', async ({ page, browser }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Borrower asks for three days.
  await signIn(page, {
    name: 'Rahul Borrower',
    next: `/item/${listing.id}?start=${day(3)}&end=${day(5)}`,
  });
  await expect(page.getByTestId('quote')).toContainText('× 3 days');
  await page.getByRole('button', { name: 'Request to book' }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?requested=1/);
  const bookingUrl = page.url().split('?')[0]!;
  await expect(page.getByTestId('booking-status')).toHaveText('Requested');

  // Lender accepts.
  const asha = await lenderPage(browser);
  await asha
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  await expect(asha.getByTestId('booking-status')).toHaveText('Requested');
  await asha.getByRole('button', { name: 'Accept' }).click();
  await expect(asha.getByTestId('booking-status')).toHaveText('Documents needed');

  // Borrower adds a PAN card and shares it.
  await page.reload();
  await page.getByRole('link', { name: 'Share documents' }).click();
  await expect(page.getByText(/Add .* to your documents first/)).toBeVisible();
  await page.getByRole('link', { name: 'Add a document' }).click();
  await page.getByLabel('Type').selectOption('PAN');
  await page.getByLabel('Front photo').setInputFiles(photo('pan.jpg'));
  await page.getByRole('button', { name: 'Add document' }).click();
  await expect(page.getByText(/Added\. Our team checks it/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'PAN card front' })).toBeVisible();
  await page.getByRole('link', { name: '← Back to your booking' }).click();
  await page.getByRole('button', { name: 'Share with the lender' }).click();
  await expect(page).toHaveURL(/\?shared=1/);
  await expect(page.getByText('Documents shared. The lender will check them.')).toBeVisible();

  // Lender views it (watermarked) and approves.
  await asha.reload();
  await asha.getByRole('link', { name: 'View', exact: true }).click();
  const image = asha.getByRole('img', { name: 'Front' });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(asha.getByText(/Nivra · viewed by Asha Lender/).first()).toBeAttached();
  await asha.goBack();
  await asha.getByRole('button', { name: 'Approve documents' }).click();
  await expect(asha.getByTestId('booking-status')).toHaveText('Awaiting payment');

  // Borrower pays (test server: fake provider).
  await page.goto(bookingUrl);
  await page.getByRole('link', { name: /^Pay ₹/ }).click();
  await page.getByRole('button', { name: /Pay with UPI, card or netbanking/ }).click();
  await expect(page).toHaveURL(/\?paid=1/);
  await expect(page.getByTestId('booking-status')).toHaveText('Confirmed');
  await expect(page.getByText('Pickup address')).toBeVisible();
  await expect(page.getByText('Flat 4B, Sai Residency, Paud Road')).toBeVisible();

  // Both sides see it in their lists.
  await page.goto('/bookings');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toContainText('Confirmed');
  await asha.goto('/earnings');
  await expect(asha.getByRole('heading', { name: 'Earnings', level: 1 })).toBeVisible();
  await expect(asha.getByText('Add the account your earnings should go to.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a borrower cancels a request, and a lender declines another', async ({ page, browser }) => {
  test.slow();
  await signIn(page, {
    name: 'Neha Borrower',
    next: `/item/${listing.id}?start=${day(20)}&end=${day(21)}`,
  });
  await page.getByRole('button', { name: 'Request to book' }).click();
  await expect(page.getByTestId('booking-status')).toHaveText('Requested');
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.getByLabel('Why are you cancelling?').fill('Plans changed');
  await page.getByRole('button', { name: 'Cancel booking' }).last().click();
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');

  await page.goto(`/item/${listing.id}?start=${day(24)}&end=${day(25)}`);
  await page.getByRole('button', { name: 'Request to book' }).click();
  await expect(page.getByTestId('booking-status')).toHaveText('Requested');
  const bookingPath = new URL(page.url()).pathname;

  const asha = await lenderPage(browser);
  await asha.goto(bookingPath);
  await asha.getByRole('button', { name: 'Decline' }).click();
  await asha.getByLabel(/Reason/).fill('Away that weekend');
  await asha.getByRole('button', { name: 'Decline request' }).click();
  await expect(asha.getByTestId('booking-status')).toHaveText('Declined');
  await page.reload();
  await expect(page.getByText('Reason: Away that weekend')).toBeVisible();
});
