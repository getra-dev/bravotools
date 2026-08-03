# Testing

Three layers, each answering a different question. Run them all with one
command before anything ships:

```bash
pnpm verify   # typecheck → lint → unit + RLS → e2e
```

| Layer | Command | Answers | Needs |
|---|---|---|---|
| Unit (vitest) | `pnpm test:unit` | Does the pure logic hold? | nothing |
| RLS (psql) | `pnpm test:db` | Can the wrong person read or write this? | local Supabase |
| E2E (Playwright) | `pnpm test:e2e` | Does the flow work in a real browser? | local Supabase + web :3100 |

`pnpm test` runs the unit and RLS layers together (turbo). E2E is separate
because it drives a browser and a dev server.

## Unit — vitest

Tests live next to the code as `*.test.ts`. Only pure logic belongs here;
anything that needs a database belongs in the RLS layer.

Current coverage, chosen because these are the places where a silent bug
costs the most:

- `packages/ai/src/attention.test.ts` — `sanitizeCards`, the guard between
  the model and the database. Fixes the promise that a hallucinated card,
  a disallowed action, or a flooded reason never reaches a table.
- `apps/web/src/lib/import/mapping.test.ts` — Excel column guessing and
  date normalisation (SPEC 2.2 onboarding: a wrong guess means the client's
  first day produces a junk registry).
- `apps/web/src/lib/import/parse.test.ts` — CSV delimiters, BOM, quotes.

## RLS — psql suites

`packages/db/tests/*.sql`, one per feature area, run inside a transaction
and rolled back. Every new table ships with a suite (CLAUDE.md rule 8).

## E2E — Playwright

`apps/e2e`. First run needs the browser binary:

```bash
pnpm --filter e2e browsers
```

**Auth without passwords.** `tests/auth.setup.ts` asks the local GoTrue
admin endpoint for a magic-link token and confirms it, then saves the
session to `playwright/.auth/supply.json`. No password appears in the test
code, and no mail catcher is involved.

**No key is stored in the repo, not even a local one.** The setup reads
`E2E_SUPABASE_SECRET` if set, otherwise asks the CLI (`supabase status -o
env`). That keeps the file working after `supabase stop && start` mints
new keys, and it keeps GitHub's secret scanner quiet — it blocks any
pushed Supabase secret key by pattern, no matter which machine that key
unlocks. Production keys never enter this repo at all (ADR-014).

Two projects:

- `anonymous` — no stored session; asserts every app route redirects to
  sign-in. This is the guard against an auth check going missing.
- `chromium` — signed in as the supply manager; walks the real flows.

**Cost rule:** E2E must never trigger a paid model call. The attention
queue spec checks the page contract and existing cards but deliberately
does not press *Refresh*.

**Seed dependence:** specs assert structure and the presence of seeded
records, not exact numbers, so they survive data drift. Anything a spec
creates (e.g. a vendor contact) it removes again.

## Not covered yet

- Mobile (Expo) has no test layer — the field flows are still verified by
  hand on a real device.
- No CI runs these yet: the repo has no remote. When one exists, `pnpm
  verify` is the whole gate; the plan's quality fences (tokens-only,
  t()-only, generated DB types, i18n completeness, RLS per table, manual
  dependency approval) attach there.
