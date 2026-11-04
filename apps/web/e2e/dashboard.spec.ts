import { expect, test } from '@playwright/test';

test('loads the dashboard and real monitor outcomes through the same-origin API', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Endpoint Watch', exact: true })).toBeVisible();
  const healthy = page.getByRole('article', { name: 'E2E Healthy', exact: true });
  await expect(healthy.getByText('Healthy', { exact: true })).toBeVisible();
  await expect(healthy.getByText('12.5 ms')).toBeVisible();
  await expect(page.getByRole('article', { name: 'E2E Failed', exact: true }).getByText('HTTP error', { exact: true })).toBeVisible();
  const unchecked = page.getByRole('article', { name: 'E2E Unchecked', exact: true });
  await expect(unchecked.getByText('No recorded checks', { exact: true })).toBeVisible();
  await expect(unchecked.getByText('Disabled — scheduled checks paused')).toBeVisible();
  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

test('selects a monitor with the keyboard, displays persisted history, and restores focus', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'View history for E2E Healthy', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: 'E2E Healthy — recent history' });
  await expect(panel.getByRole('heading')).toBeFocused();
  const table = panel.getByRole('table', { name: 'Recent checks for E2E Healthy' });
  await expect(table.getByRole('row')).toHaveCount(3);
  const latest = table.getByRole('row').nth(1);
  await expect(latest.getByRole('cell', { name: 'Healthy', exact: true })).toBeVisible();
  await expect(latest.getByRole('cell', { name: '200', exact: true })).toBeVisible();
  await expect(latest.locator('time')).toHaveAttribute('datetime', '2026-11-04T12:00:00.000Z');
  await expect(table.getByText('Request timed out', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Close history' }).click();
  await expect(button).toBeFocused();
  await expect(panel).toBeHidden();
});

test('selects another monitor and displays empty history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View history for E2E Failed' }).click();
  await expect(page.getByRole('table', { name: 'Recent checks for E2E Failed' })).toBeVisible();
  await page.getByRole('button', { name: 'View history for E2E Unchecked' }).click();
  const panel = page.getByRole('region', { name: 'E2E Unchecked — recent history' });
  await expect(panel.getByText('No recorded checks for this monitor.')).toBeVisible();
  await expect(panel.getByText('Disabled — scheduled checks paused')).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(0);
});
