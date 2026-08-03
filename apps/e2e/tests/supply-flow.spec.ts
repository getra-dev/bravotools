import { test, expect } from '@playwright/test';

// Tiekimo stuburas: poreikis → užsakymas → laukiama pristatymo.
// Testai remiasi seed duomenimis (supabase/seed.sql), todėl tikrina
// struktūrą ir realių įrašų buvimą, ne konkrečius kintančius skaičius.

test('overview shows the signed-in org and its counters', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/sivysta/i).first()).toBeVisible();
  await expect(page.getByText(/tools|įrankiai/i).first()).toBeVisible();
});

test('orders board lists seeded orders and opens an order detail', async ({ page }) => {
  await page.goto('/orders');
  const orderLink = page.getByRole('link', { name: /^BT-\d{4}-\d{4}$/ }).first();
  await expect(orderLink).toBeVisible();

  const orderNumber = (await orderLink.textContent())?.trim() ?? '';
  await orderLink.click();

  await expect(page.getByRole('heading', { name: orderNumber })).toBeVisible();
  // eilučių lentelė su kiekiu — be jos užsakymas nieko nereiškia
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('button', { name: /cancel|atšaukti/i })).toBeVisible();
});

test('awaiting board shows outstanding lines with a date picker per line', async ({ page }) => {
  await page.goto('/awaiting');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs.first()).toBeVisible();
});

test('requests queue renders for the dispatcher', async ({ page }) => {
  await page.goto('/requests');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/objektas/i).first()).toBeVisible();
});
