import { expect, test } from '@playwright/test';
import { createAppUser, liveListing, type AppUser } from './api';
import { photo, signIn, uniq } from './helpers';

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let lender: AppUser;
let listing: { id: string };
let title: string;

test.beforeAll(async () => {
  title = `Web chat speaker ${uniq()}`;
  lender = await createAppUser('Asha Lender');
  listing = await liveListing(lender, { title });
});

test('a borrower messages the lender, offers a price, and the lender accepts', async ({
  page,
  browser,
}) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Guest → "Message lender" → sign in → back on the item → chat opens.
  await page.goto(`/item/${listing.id}`);
  await page.getByRole('button', { name: 'Message lender' }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page, { name: 'Rahul Borrower', next: `/item/${listing.id}` });
  await page.getByRole('button', { name: 'Message lender' }).click();
  await expect(page).toHaveURL(/\/inbox\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('link', { name: title })).toBeVisible();

  await page
    .getByLabel('Message', { exact: true })
    .fill('Hi! Is it free next weekend? Call me on 9876543210');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Hi! Is it free next weekend?')).toBeVisible();
  await expect(page.getByText('contact details hidden')).toBeVisible();

  await page.getByLabel('Photo to send').setInputFiles(photo('pic.jpg'));
  await expect(page.getByRole('img', { name: 'Photo' })).toBeVisible();

  await page.getByRole('button', { name: 'Make an offer' }).click();
  await page.getByLabel('From', { exact: true }).fill(day(6));
  await page.getByLabel('To', { exact: true }).fill(day(7));
  await page.getByLabel('₹ per day').fill('120');
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByTestId('offer-card')).toContainText('Your offer');
  await expect(page.getByTestId('offer-card')).toContainText('₹120 / day');

  // The lender sees the unread chat and accepts the offer.
  const wait = lender.codeAgainAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const asha = await (await browser.newContext()).newPage();
  await signIn(asha, { phone: lender.phone, next: '/inbox' });
  await expect(asha.locator('[data-testid="badge-conversations"]:visible')).toHaveText('1');
  await asha.getByRole('link', { name: /Rahul Borrower/ }).click();
  await expect(asha.getByText('Hi! Is it free next weekend?')).toBeVisible();
  await expect(asha.getByText('9876543210')).toHaveCount(0);
  await asha.getByTestId('offer-card').getByRole('button', { name: 'Accept' }).click();
  await expect(asha.getByText('Offer accepted: a booking has been created.')).toBeVisible();
  await expect(asha.getByRole('link', { name: 'Booking', exact: true })).toBeVisible();

  // The borrower's chat picks it up by polling; the booking is waiting for payment.
  await expect(page.getByRole('link', { name: 'Booking', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('link', { name: 'Booking', exact: true }).click();
  await expect(page.getByTestId('booking-status')).toHaveText('Awaiting payment');

  // Notifications list renders, and links to the booking.
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a borrower can report and block someone in a chat', async ({ page }) => {
  // Without a verified email, "Message lender" asks for it first, then comes back.
  await signIn(page, { name: 'Neha Borrower', next: `/item/${listing.id}`, skipEmail: true });
  await page.getByRole('button', { name: 'Message lender' }).click();
  await expect(page.getByRole('heading', { name: 'Add your email' })).toBeVisible();
  await page.getByLabel('Email').fill(`neha.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page).toHaveURL(new RegExp(`/item/${listing.id}`));
  await page.getByRole('button', { name: 'Message lender' }).click();
  await expect(page).toHaveURL(/\/inbox\//);
  await page.getByLabel('Message', { exact: true }).fill('Hello');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await page.getByRole('button', { name: 'Chat options' }).click();
  await page.getByRole('button', { name: 'Report' }).click();
  await page.getByLabel('What happened?').selectOption('OFF_PLATFORM_PAYMENT');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. Our team will review this conversation.')).toBeVisible();

  await page.getByRole('button', { name: 'Chat options' }).click();
  await page.getByRole('button', { name: 'Block this person' }).click();
  await expect(page.getByText(/You blocked this person/)).toBeVisible();
  await page.getByRole('button', { name: 'Chat options' }).click();
  await page.getByRole('button', { name: 'Unblock' }).click();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
});
