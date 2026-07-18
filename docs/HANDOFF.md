# HANDOFF.md — Start here, Claude Code

## Mode: LOCAL-FIRST (ADR-014)
Everything on localhost until Etapas 1 passes the promotion gate:
local Supabase (55321-55324) + next dev + Expo Go over LAN. No prod
Supabase, no Vercel, no EAS builds before the gate. Only external dev
dependency: ANTHROPIC_API_KEY in .env (Etapas 2+).

## Read order (once, at session start)
1. CLAUDE.md — hard rules (locked stack, tokens-only, t()-only, RLS, AI server-side)
2. DESIGN.md — Industrial Precision; mockups in docs/reference/ are UX truth
3. docs/decisions/ — 13 ADRs; never re-litigate these
4. docs/SPEC.md — functional spec; Etapas 1 is fully detailed
5. supabase/migrations/0001 — 51-table schema, source of truth for data

## Session 0 (bootstrap) — exit condition for each step is stated
1. Turborepo + pnpm workspaces per SPEC layout (use official Expo monorepo
   example for Metro config — do not invent). DONE = `pnpm dev` runs web,
   `pnpm mobile` opens Expo.
2. `supabase init` with project_id "bravotools", ports 55321-55324
   (bravobim owns 5432x). Apply migration 0001. DONE = `supabase db reset`
   clean, Studio shows 51 tables.
3. packages/theme tokens.json from DESIGN.md table → Tailwind config + RN
   theme. packages/i18n en.json+lt.json scaffolding. ESLint fences:
   no-literal-string, no raw hex, no-restricted-imports. DONE = lint fails
   on a deliberate hardcoded string test file, passes after fix.
4. packages/db: `supabase gen types` script + first RLS test (tools org
   isolation). DONE = test red without policy, green with.
5. seed.sql per SPEC §7. DONE = db reset tells the demo story in Studio.

## Then build in SPEC order: 2.1 → 2.8. One numbered SPEC section per
session. Every session ends with: tests green, lint green, i18n complete,
commit. Weekly demo = local walkthrough on seed data (Expo Go on a real phone over LAN). EAS/TestFlight only after the ADR-014 promotion gate.

## Execution mode: BUILD FIRST, AUTONOMOUSLY
Default behavior: build the whole task end-to-end yourself, then present
the result — do not stop mid-session to ask for confirmation on things
already decided in CLAUDE.md / SPEC / ADRs.

- Session 0 and each SPEC section: execute ALL steps without pausing;
  verify your own exit conditions (run the tests, run the lint, run
  db reset) before declaring done. Show a summary at the end, not
  questions in the middle.
- Ask ONLY when genuinely blocked by: (a) a real ambiguity that SPEC and
  ADRs do not answer, (b) a new dependency (CLAUDE.md rule 6), or
  (c) anything requiring credentials/accounts. Batch such questions at
  the end of the session, with your recommended answer for each.
- Never ask "should I proceed?" — the answer is always yes if it follows
  the docs. Never present three options when the ADRs already picked one.
- If something fails, attempt the fix yourself first (up to 3 approaches),
  log what was tried, and only then escalate with the error and diagnosis.
- The human's role is review of finished increments, not supervision of
  steps.

## Working agreements
- Small sessions; if context drifts from CLAUDE.md rules, stop and re-read.
- New dependency ⇒ ask with one-line justification.
- Anything ambiguous ⇒ check SPEC first, then ask; do not improvise schema.
- UI: compose packages/ui reference components; first build ONE component
  (inventory tag) with all 8 states as the quality bar.
