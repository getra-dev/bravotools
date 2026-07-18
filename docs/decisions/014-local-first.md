# ADR-014: Local-first development — no production until E1 is stable

**Date:** 2026-07-18 · **Status:** Accepted

## Decision
Everything runs on localhost until Etapas 1 is stable: local Supabase
(Docker, ports 55321-55324), `next dev`, Expo Go over LAN. NO production
Supabase project, NO Vercel deploy, NO EAS/TestFlight builds until the
promotion gate is passed. The only external dependency allowed in dev is
the Anthropic API key in .env (Etapas 2+).

## Promotion gate (all three, then promote)
1. All Etapas 1 flows work end-to-end on local seed data
2. RLS tests green for every table
3. Seed demo walkthrough passes: import → QR → handover → act PDF

## How promotion works (when gated)
`supabase link && supabase db push` + Vercel connect + first EAS build.
Migrations-only schema means local and cloud are the same code — promotion
is hours, not a project.

## Guardrails
- No secrets for prod services may appear in .env before the gate.
- "Polish before showing" is drift: the gate is the three checks above,
  not perceived readiness. When they pass — promote immediately, because
  the real stability test only happens in Sivysta's hands.
