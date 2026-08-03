import { execFileSync } from 'node:child_process';
import { test as setup, expect } from '@playwright/test';

// Sesija kuriama per GoTrue admin magic-link: jokių slaptažodžių testų
// kode ir jokio priklausomumo nuo laiško gaudyklės.
//
// Raktas NIEKADA nerašomas į repo (net lokalus): imamas iš aplinkos arba
// klausiamas paties Supabase CLI. Taip tas pats failas veikia ir tavo
// mašinoje, ir CI'e, ir po `supabase stop && start` su naujais raktais.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const DEMO_EMAIL = process.env.E2E_EMAIL ?? 'ona@sivysta.lt';
const AUTH_FILE = 'playwright/.auth/supply.json';

function localServiceKey(): string {
  const fromEnv = process.env.E2E_SUPABASE_SECRET;
  if (fromEnv) return fromEnv;

  // `supabase status -o env` grąžina eilutes KEY="value"
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: new URL('../../..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  const match = output.match(/^(?:SECRET_KEY|SERVICE_ROLE_KEY)="([^"]+)"/m);
  if (!match) {
    throw new Error(
      'local Supabase secret not found — start the stack (pnpm db:start) or set E2E_SUPABASE_SECRET',
    );
  }
  return match[1];
}

setup('sign in as the supply manager', async ({ page, request }) => {
  const response = await request.post(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    headers: {
      apikey: localServiceKey(),
      Authorization: `Bearer ${localServiceKey()}`,
      'Content-Type': 'application/json',
    },
    data: { type: 'magiclink', email: DEMO_EMAIL },
  });
  expect(response.ok(), 'local Supabase must be running (pnpm db:start)').toBeTruthy();

  const { hashed_token: token } = (await response.json()) as { hashed_token: string };
  expect(token, 'GoTrue returned no token').toBeTruthy();

  await page.goto(`/auth/confirm?token_hash=${token}&type=magiclink`);
  // Sėkmingas patvirtinimas nukreipia į apžvalgą, ne atgal į /login.
  await expect(page).toHaveURL(/\/(?!login)/);
  await expect(page.getByRole('link', { name: /orders|užsakymai/i })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
