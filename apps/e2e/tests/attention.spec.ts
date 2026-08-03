import { test, expect } from '@playwright/test';

// SPEC 3.3 dėmesio eilė. Testas TYČIA nespaudžia „Atnaujinti“ — tai
// kainuotų tikrą modelio iškvietimą kiekviename paleidime. Tikrinam
// puslapio kontraktą ir tai, kad rodomos tik DB esančios kortelės.

test('attention queue renders cards or an honest empty state', async ({ page }) => {
  await page.goto('/attention');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /refresh|atnaujinti/i })).toBeVisible();

  const cards = page.getByRole('listitem');
  const count = await cards.count();

  if (count === 0) {
    await expect(page.getByText(/nothing needs attention|dėmesio niekas nereikalauja/i)).toBeVisible();
    return;
  }

  // kiekviena kortelė turi turėti priežastį ir bent vieną veiksmą —
  // kortelė be veiksmo yra tik triukšmas
  const first = cards.first();
  await expect(first.getByRole('button', { name: /dismiss|atmesti/i })).toBeVisible();
  await expect(first.getByRole('link')).not.toHaveCount(0);

  // paleidimo antspaudas: modelis ir kaina turi būti matomi, ne paslėpti
  await expect(page.getByText(/claude-/i)).toBeVisible();
});
