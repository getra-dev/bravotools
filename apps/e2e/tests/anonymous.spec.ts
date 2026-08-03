import { test, expect } from '@playwright/test';

// Sargas: kiekvienas app'o puslapis privalo reikalauti prisijungimo.
// Jei kada nors kas nors pamirš auth patikrą, šitas kris.
const PROTECTED = ['/', '/orders', '/requests', '/attention', '/tools', '/vendors', '/stock'];

test.describe('unauthenticated visitor', () => {
  for (const path of PROTECTED) {
    test(`is sent to the sign-in page from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('button', { name: /sign in|prisijungti/i }).first()).toBeVisible();
    });
  }
});
