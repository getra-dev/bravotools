# ADR-008: Append-only events + outbox sync (last-write-wins)

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Movements, acts, stock movements, activity_log are append-only events
with client-generated UUIDs. Offline writes queue in local SQLite outbox;
sync worker performs idempotent inserts; LWW suffices.

## Context
Events (not edits) make conflicts rare by design — no complex CRDT/merge
logic. History is immutable: no UPDATE/DELETE on event tables, ever.
This is also the anti-"aš siunčiau!" proof layer.
