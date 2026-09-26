# CLAUDE.md — BravoTools

BravoTools is a construction supply management SaaS: tool tracking (QR,
handover acts), material ordering (voice → AI parse → orders), invoice
reconciliation, and logistics. Multi-tenant. Pilot client: Sivysta UAB.

## 🚦 Orchestration — ask first (owner, 2026-09-26)

BravoTools is part of the BravoBIM team and runs under the same orchestrator as
`~/my-saas`. The orchestrator is the Claude session **„Agentų orkestravimas ir prieigos
kontrolė"**; name this session **„BravoTools"**.

- Before ANY work (edits, builds, tests, migrations, local DB resets, browser QA,
  subagents): `SendMessage` the orchestrator `REQUEST — BravoTools — <task>` and wait for
  `GRANTED`. Only one working session runs at a time across both repos.
- When done, or before going idle: `DONE — BravoTools — <result + commit>`. Your own chat is
  not a report. Waiting on the owner → `OWNER-NEEDED — BravoTools — <what>` first.
- QA verifies every DONE; work to another role goes as `HANDOFF` through the orchestrator.
- Overlaps with BravoBIM must be raised to the orchestrator before building, never solved
  locally: vendors ↔ BravoBIM Contacts (`@kit/contacts`), `vendor_contracts` / vendor
  invoices ↔ BravoBIM Contracting (SPEC-85), orders / notifications / comments name clashes,
  people ↔ BravoBIM HR (own + contingent workers). Direction (not locked): BravoTools becomes
  a module inside BravoBIM (`~/my-saas/specs/SPEC-64-…`, ADR-016) — no new BT features
  that deepen the split until the owner locks it.
- Full rules: `~/my-saas/CLAUDE.md` → „ONE AGENT AT A TIME".

## Stack (LOCKED — never suggest alternatives)
- Mobile field app: **Expo / React Native**, TypeScript, expo-sqlite (offline outbox)
- Web (dispatcher pult + admin): **Next.js** on Vercel
- Backend: **Supabase** (Postgres, Auth, Storage, RLS)
- AI: **Anthropic API, server-side only** (Next API routes / Edge Functions)
- Monorepo: **Turborepo + pnpm**

## Hard rules — NEVER / ALWAYS
1. NEVER hardcode user-facing strings. ALWAYS `t('key')`. Source of truth:
   `packages/i18n/en.json`. Keys in English. `lt.json` mirrors every key.
2. NEVER use raw colors, font sizes, or spacing values in components.
   ALWAYS design tokens from `packages/theme`. No hex anywhere outside tokens.json.
3. NEVER write DB types by hand. ALWAYS `supabase gen types` into `packages/db`.
4. NEVER change schema ad-hoc. ALWAYS a new migration file in `packages/db/migrations`.
5. NEVER call Anthropic API from mobile/web clients. ALWAYS through backend
   endpoints in `packages/ai` contracts.
6. NEVER add a dependency without asking first. One-line justification required.
7. NEVER use emoji as UI icons. ALWAYS `lucide-react` / `lucide-react-native`.
8. Every table has `org_id` + RLS policy. Every new table PR includes an RLS test.
9. Every AI action writes to `activity_log` (actor_type='ai', full payload).
   AI never sends anything external without human approval.
10. All UI text is English (base). Lithuanian lives only in lt.json.

## Conventions
- IDs: uuid. Timestamps: timestamptz, `created_at` everywhere.
- Statuses: English snake_case enums with CHECK constraints (see schema).
- Movements/events are append-only; never UPDATE history rows.
- Offline: writes go to local outbox first, sync worker pushes to Supabase,
  last-write-wins (events are append-only so conflicts are rare).
- Reference component examples live in `packages/ui` — copy their patterns.

## Key domain concepts (read schema comments for detail)
- `tools` — owned or rented; holder can be internal (`profiles`) or external
  (`external_persons`, subcontractors). Heavy equipment tracks engine hours.
- `tool_movements` + `handover_acts` — every transfer is an event with photos,
  component checklist, GPS, and a signable PDF act.
- `materials` + `material_aliases` — normalization dictionary; AI matches free
  text/voice to canonical materials; confirmed matches become new aliases.
- HOT requests: needed_by inside vendor lead time → is_hot + mandatory reason.
- `vendor_invoices` reconciliation: billed vs system facts (period, rate, qty,
  downtime) — variance detection is the core value engine.
- `activity_log` + `outbound_messages` — immutable proof layer ("who did what,
  was the email delivered/opened"). Never bypass it.

## Definition of done (every PR)
lint passes (tokens/i18n rules) · types regenerated & clean diff · RLS test
for touched tables · works offline if it's a field-app flow · en.json and
lt.json both updated · activity_log entries for new mutations
