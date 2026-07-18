# BravoTools

Voice-first construction supply OS for mixed-fleet SMB contractors.
Tools (QR, handover acts) + materials (voice → AI → orders) + logistics +
invoice truth. Multi-tenant SaaS. Pilot: Sivysta UAB.

Start: docs/HANDOFF.md

## Local dev (LOCAL-FIRST, ADR-014)

```bash
pnpm install
pnpm db:start        # local Supabase: API 55321, DB 55322, Studio 55323, mail 55324
pnpm db:reset        # migrations + seed (Sivysta demo story)
pnpm dev             # web dispatcher console → http://localhost:3100
pnpm mobile          # Expo — scan QR with Expo Go on the same LAN
```

Checks: `pnpm lint` (tokens + i18n fences) · `pnpm typecheck` ·
`pnpm db:test` (RLS) · `pnpm db:typegen` (regenerate DB types) ·
`pnpm --filter @bravotools/i18n test` (en/lt key parity).
