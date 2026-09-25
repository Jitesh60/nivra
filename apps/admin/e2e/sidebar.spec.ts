import { expect, test } from '@playwright/test';
import { seedAdmin } from './app-user';
import { firstLogin, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let ops: ReturnType<typeof seedAdmin>;
let support: ReturnType<typeof seedAdmin>;

test.beforeAll(() => {
  ops = seedAdmin('OPS', state().run, 'sidebar');
  support = seedAdmin('SUPPORT', state().run, 'sidebar');
});

test('desktop: the sidebar collapses to icons and remembers it', async ({ page }) => {
  await firstLogin(page, ops.email, ops.password);
  const sidebar = page.getByTestId('sidebar');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Requests' })).toContainText('Requests');

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  // Icons only, but every link keeps its name (and still works).
  await expect(nav.getByRole('link', { name: 'Requests' })).not.toContainText('Requests');
  await nav.getByRole('link', { name: 'Requests' }).click();
  await expect(page).toHaveURL(/\/requests/);

  // Remembered across pages and reloads, with no flash of the wide sidebar.
  await page.reload();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(sidebar).not.toHaveAttribute('data-collapsed');
  await page.reload();
  await expect(nav.getByRole('link', { name: 'Requests' })).toContainText('Requests');
});

test('phone: a menu button opens the sidebar as a drawer', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await firstLogin(page, support.email, support.password);

  // The desktop sidebar is hidden; the menu is closed.
  await expect(page.getByTestId('sidebar')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Requests' }).click();
  await expect(page).toHaveURL(/\/requests/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Escape closes it too.
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.close();
});
