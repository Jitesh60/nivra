import { expect, test } from '@playwright/test';
import { firstLogin, state, submitPassword, totp } from './helpers';

test.describe.configure({ mode: 'serial' });

let rootSecret = '';
let rootRecoveryCodes: string[] = [];
let opsSecret = '';
let opsTempPassword = '';
const opsEmail = () => `e2e-ops-${state().run}@sajha.app`;

test('rejects a wrong password with a clear message', async ({ page }) => {
  await submitPassword(page, state().root.email, 'not the password');
  await expect(page.getByTestId('form-error')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login$/);
});

test('sends security headers and stays out of search engines', async ({ request }) => {
  const headers = (await request.get('/login')).headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(headers['strict-transport-security']).toContain('max-age=63072000');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('redirects to /login when signed out', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login\?next=%2Fusers/);
});

test('Super Admin: first login sets up 2FA and reaches the dashboard', async ({ page }) => {
  const { root } = state();
  ({ secret: rootSecret, recoveryCodes: rootRecoveryCodes } = await firstLogin(
    page,
    root.email,
    root.password,
  ));

  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('admin-name')).toHaveText(root.name);
  await expect(page.getByTestId('admin-role')).toHaveText('Super Admin');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admins' }),
  ).toBeVisible();

  // Tokens are httpOnly: page JavaScript can't see them.
  expect(await page.evaluate(() => document.cookie)).not.toContain('sajha_admin');
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'sajha_admin_at')?.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name === 'sajha_admin_rt')?.httpOnly).toBe(true);

  // Survives a reload.
  await page.reload();
  await expect(page.getByTestId('admin-name')).toHaveText(root.name);
});

test('Super Admin: silent refresh, users list, invite an admin, log out', async ({ page }) => {
  const { root } = state();
  // Sign in again: the verify page (2FA already on). Use the next TOTP window,
  // because the current code was just used and codes can't be replayed.
  await submitPassword(page, root.email, root.password);
  await expect(page).toHaveURL(/\/login\/verify/);
  await page.getByLabel('Authenticator code').fill(await totp(rootSecret, 1));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  // Access token gone (as if expired): the proxy refreshes it transparently.
  const before = (await page.context().cookies()).find((c) => c.name === 'sajha_admin_rt')!.value;
  await page.context().clearCookies({ name: 'sajha_admin_at' });
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const after = (await page.context().cookies()).find((c) => c.name === 'sajha_admin_rt')!.value;
  expect(after).not.toBe(before);

  // Invite an Ops admin.
  await page.getByRole('link', { name: 'Admins' }).click();
  await page.getByLabel('Name', { exact: true }).fill('E2E Ops');
  await page.getByLabel('Email', { exact: true }).fill(opsEmail());
  await page.getByLabel('Role', { exact: true }).selectOption('OPS');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByTestId('invite-result')).toContainText(opsEmail());
  opsTempPassword = (await page.getByTestId('temporary-password').textContent())!.trim();
  await expect(page.getByTestId('admin-row').filter({ hasText: opsEmail() })).toContainText(
    'invited',
  );

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('Ops: temporary password → 2FA → forced password change → limited menu', async ({ page }) => {
  ({ secret: opsSecret } = await firstLogin(page, opsEmail(), opsTempPassword));

  // Must choose a new password before anything else.
  await expect(page).toHaveURL('/account/password');
  await page.goto('/users');
  await expect(page).toHaveURL('/account/password');

  await page.getByLabel('Temporary password').fill(opsTempPassword);
  await page.getByLabel(/New password/).fill('ops chose a long passphrase');
  await page.getByLabel('Confirm new password').fill('ops chose a long passphrase');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL('/');

  await expect(page.getByTestId('admin-role')).toHaveText('Ops');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Admins' })).toHaveCount(0);

  // Ops can see the waitlist and download it as CSV.
  await nav.getByRole('link', { name: 'Waitlist' }).click();
  await expect(page.getByRole('heading', { name: 'Waitlist' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV' }).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toMatch(/^sajha-waitlist-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.goto('/admins');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});

test('a disabled admin is signed out on their next request', async ({ browser }) => {
  const { root } = state();

  // Ops signs in (next TOTP window; the current one was used at setup).
  const opsContext = await browser.newContext();
  const ops = await opsContext.newPage();
  await submitPassword(ops, opsEmail(), 'ops chose a long passphrase');
  await ops.getByLabel('Authenticator code').fill(await totp(opsSecret, 1));
  await ops.getByRole('button', { name: 'Sign in' }).click();
  await expect(ops.getByTestId('admin-role')).toHaveText('Ops');

  // The Super Admin signs in with a recovery code and disables Ops.
  const rootContext = await browser.newContext();
  const page = await rootContext.newPage();
  await submitPassword(page, root.email, root.password);
  await page.getByRole('button', { name: 'Lost your phone? Use a recovery code' }).click();
  await page.getByLabel('Recovery code').fill(rootRecoveryCodes[0]!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/admins');
  const row = page.getByTestId('admin-row').filter({ hasText: opsEmail() });
  await row.getByRole('button', { name: 'Disable' }).click();
  await expect(row).toContainText('disabled');

  // Ops' next page load ends their session.
  await ops.goto('/users');
  await expect(ops).toHaveURL(/\/login\?reason=/);
  await expect(ops.getByText(/Your session ended|This account is disabled/)).toBeVisible();

  // A recovery code works only once.
  const again = await rootContext.newPage();
  await again.context().clearCookies();
  await submitPassword(again, root.email, root.password);
  await again.getByRole('button', { name: 'Lost your phone? Use a recovery code' }).click();
  await again.getByLabel('Recovery code').fill(rootRecoveryCodes[0]!);
  await again.getByRole('button', { name: 'Sign in' }).click();
  await expect(again.getByTestId('form-error')).toContainText('That code is incorrect');

  await opsContext.close();
  await rootContext.close();
});
