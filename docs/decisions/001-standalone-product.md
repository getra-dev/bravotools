# ADR-001: BravoTools is a standalone product, not a BravoBIM module

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Separate Supabase project, separate repo, separate auth. Shares only the
"Bravo" family brand and architectural patterns with BravoBIM.

## Context
Supply management has its own users (field workers, drivers, dispatcher),
own sales motion, and own pilot (Sivysta). Coupling to BravoBIM would slow
both products.

## Rejected alternatives
- Third "surface" on BravoBIM backend — rejected by founder: different
  product category, must be sellable alone.
