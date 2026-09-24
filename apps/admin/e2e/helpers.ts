import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { STATE_FILE } from './global-setup';

export interface Credentials {
  email: string;
  name: string;
  password: string;
}

export const state = () =>
  JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { run: number; root: Credentials };

/** TOTP code for the current 30s window, or a later one (`windowsAhead`). */
export function totp(secret: string, windowsAhead = 0) {
  return generate({ secret, epoch: Math.floor(Date.now() / 1000) + windowsAhead * 30 });
}

export async function submitPassword(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** First login: password → scan (read the key) → code → recovery codes. */
export async function firstLogin(
  page: Page,
  email: string,
  password: string,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  await submitPassword(page, email, password);
  await expect(page).toHaveURL(/\/login\/setup/);
  await page.getByText('Can’t scan? Enter this key instead').click();
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

  await page.getByLabel('Authenticator code').fill(await totp(secret));
  await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click();

  await expect(page).toHaveURL(/\/login\/recovery-codes/);
  const codes = page.getByTestId('recovery-codes').locator('li');
  await expect(codes).toHaveCount(8);
  const recoveryCodes = (await codes.allTextContents()).map((c) => c.trim());
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  return { secret, recoveryCodes };
}
