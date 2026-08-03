import { test, expect } from '@playwright/test';

// SPEC 3.6 blokas 1: tiekėjo kontaktai. Testas prideda kontaktą, tikrina
// kad kategorijų žymos atsirado, ir po savęs sutvarko — kad kartotinis
// paleidimas neaugintų šiukšlių demo duomenyse.

test('supply can add, see and remove a vendor contact', async ({ page }) => {
  await page.goto('/vendors');
  await page.getByRole('link', { name: /kesko senukai/i }).click();

  await expect(page.getByRole('heading', { name: /kesko senukai/i })).toBeVisible();

  const name = `E2E Kontaktas ${Date.now()}`;
  const addForm = page.locator('form').filter({ has: page.getByRole('button', { name: /add contact|pridėti kontaktą/i }) });

  await addForm.getByPlaceholder(/^name$|^vardas$/i).fill(name);
  await addForm.getByPlaceholder(/email|el\. paštas/i).fill('e2e@example.test');
  await addForm.getByPlaceholder(/covers|kuruoja/i).fill('mūras, tvirtinimas');
  await addForm.getByRole('button', { name: /add contact|pridėti kontaktą/i }).click();

  // kontaktas matomas su kategorijų žymomis
  const row = page.locator('li').filter({ has: page.locator(`input[value="${name}"]`) });
  await expect(row).toBeVisible();
  await expect(row.getByText('mūras')).toBeVisible();
  await expect(row.getByText('tvirtinimas')).toBeVisible();

  // po savęs sutvarkom
  await row.getByRole('button', { name: /remove|šalinti/i }).click();
  await expect(page.locator(`input[value="${name}"]`)).toHaveCount(0);
});
