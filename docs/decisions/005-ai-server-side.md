# ADR-005: AI server-side only, five named jobs

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Clients never call Anthropic API. Backend endpoints only: voice-parse,
radio-answer, invoice-parse, dedup-check, daily-digest. Every AI action
logs to activity_log (actor_type='ai', payload). AI never sends anything
external without human approval. Radio rule: unsure → escalate, never guess.

## Context
API keys, per-org rate limits (plan enforcement), prompt versioning,
cost tracking (tokens per org in payload), auditability.

## Cost guards
Haiku for parse/dedup, Sonnet for reasoning; hard per-org monthly caps
checked BEFORE each call; Anthropic console spend limit as backstop.
Free plan has ai_features=false — zero AI cost exposure from freemium.
