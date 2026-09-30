import { expect, test } from '@playwright/test';
import { newPhone, OTP, photo, signIn, useOwnIp } from './helpers';

test('a new visitor signs up, names themselves, verifies email and edits their profile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { phone } = await signIn(page, { name: 'Asha Web', next: '/profile' });

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue('Asha Web');
  await expect(page.getByText(`web.${phone}@example.com`)).toBeVisible();

  await page.getByLabel('City').fill('Pune');
  await page.getByLabel('About you').fill('Weekend trekker.');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('City')).toHaveValue('Pune');

  await page.getByLabel('Profile photo').setInputFiles(photo());
  await expect(page.getByText('Photo updated.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('private pages ask for sign-in and come back afterwards', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
  await signIn(page, { next: '/profile', skipEmail: true });
  await expect(page).toHaveURL(/\/profile$/);
});

test('a wrong code is refused and the number can be changed', async ({ page }) => {
  const phone = newPhone();
  await useOwnIp(page, phone);
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Enter a 10-digit Indian mobile number.')).toBeVisible();

  await page.getByLabel('Mobile number').fill(`+91 ${phone}`);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText(`+91 ${phone.slice(0, 2)}••••••${phone.slice(-2)}`)).toBeVisible();
  await page.getByLabel('Code').fill(OTP === '111111' ? '222222' : '111111');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.locator('form p[role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(/\/login\/verify/);
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page, { next: '/profile', skipEmail: true });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('the marketing header shows the account menu once signed in', async ({ page }) => {
  await page.goto('/how-it-works');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await signIn(page, { next: '/how-it-works', skipEmail: true });
  await page.goto('/how-it-works');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
});
