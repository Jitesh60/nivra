import { expect, test } from '@playwright/test';
import { createAppUser, liveListing, type AppUser } from './api';
import { signIn, uniq } from './helpers';

// Kothrud, Pune: where the API-made listings are.
const HERE = { latitude: 18.5074, longitude: 73.8077 };
test.use({ geolocation: HERE, permissions: ['geolocation'] });

let lender: AppUser;
let listingTitle: string;

test.beforeAll(async () => {
  lender = await createAppUser('Asha Lender');
  listingTitle = `Web growth tent ${uniq()}`;
  await liveListing(lender, { title: listingTitle });
});

test('a borrower asks for something and a nearby lender replies with a listing', async ({
  page,
  browser,
}) => {
  test.slow();
  const title = `Need a 4-person tent ${uniq()}`;
  await signIn(page, { name: 'Rahul Borrower', next: '/requests/new' });
  await page.getByLabel('What do you need?').fill(title);
  await page.getByLabel('Details').fill('For a weekend trek to Rajmachi, two nights.');
  await page.getByLabel('Budget per day, ₹ (optional)').fill('300');
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByText('Drag the pin to adjust.')).toBeVisible();
  await page.getByLabel('Area').fill('Kothrud, Pune');
  await page.getByRole('button', { name: 'Post request' }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}\?posted=1/);
  const requestPath = new URL(page.url()).pathname;
  await expect(page.getByText('Posted. Lenders nearby will see it.')).toBeVisible();

  const wait = lender.codeAgainAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const asha = await (
    await browser.newContext({ geolocation: HERE, permissions: ['geolocation'] })
  ).newPage();
  await signIn(asha, { phone: lender.phone, next: '/requests' });
  await expect(asha.getByText('Turn on “Near me” to see requests around you')).toBeVisible();
  await asha.getByRole('button', { name: 'Near me' }).click();
  await asha.getByRole('link', { name: new RegExp(title) }).click();
  await asha.getByLabel('Your listing').selectOption({ label: listingTitle });
  await asha.getByLabel('Message').fill('Mine is free that weekend!');
  await asha.getByRole('button', { name: 'Send reply' }).click();
  await expect(asha.getByText('You replied to this request.')).toBeVisible();

  await page.goto(requestPath);
  await expect(page.getByText('Mine is free that weekend!')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible();
  await page.getByRole('button', { name: 'Close request' }).click();
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
});

test('saved searches, invites and settings', async ({ page, browser }) => {
  test.slow();
  await signIn(page, { name: 'Neha Borrower', next: '/explore' });

  // Save a nearby search.
  await page.getByRole('button', { name: 'Near me' }).click();
  await expect(page).toHaveURL(/lat=/);
  await page.getByRole('searchbox', { name: 'Search' }).fill('tent');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Save search' }).click();
  await expect(page.getByText(/Saved\. We’ll tell you/)).toBeVisible();
  await page.goto('/saved-searches');
  await page.getByRole('link', { name: /tent/ }).click();
  await expect(page.getByRole('heading', { name: 'tent', level: 1 })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No saved searches')).toBeVisible();

  // Neha's invite code works for a friend who just joined.
  await page.goto('/invite');
  const code = (await page.getByTestId('referral-code').textContent())!.trim();
  const friend = await (await browser.newContext()).newPage();
  await signIn(friend, { name: 'Kabir Friend', next: `/invite?code=${code}` });
  await expect(friend.getByLabel('Friend’s code')).toHaveValue(code);
  await friend.getByRole('button', { name: 'Apply code' }).click();
  await expect(
    friend.getByText('You joined with Neha Borrower’s code.', { exact: false }),
  ).toBeVisible();

  // Settings: a preference, this device, then delete the friend's account.
  await page.goto('/settings');
  await page.getByLabel(/News and offers/).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByText('this browser')).toBeVisible();

  await friend.goto('/settings');
  await friend.getByRole('button', { name: 'Delete my account' }).click();
  await friend.getByLabel('Type DELETE to confirm').fill('DELETE');
  await friend.getByRole('button', { name: 'Delete forever' }).click();
  await expect(friend).toHaveURL(/\/\?deleted=1/);
  await friend.goto('/profile');
  await expect(friend).toHaveURL(/\/login/);

  // Sign out everywhere ends this session too.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page).toHaveURL(/\/login\?reason=signedout/);
});
