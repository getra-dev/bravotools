# ADR-004: Single theme, design frozen, tokens only

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
One "Industrial Precision" theme (DESIGN.md + tokens.json + mockup v3 as
reference). Components use tokens only — no raw colors/sizes anywhere.
Clients do NOT get theming. Super admin may assign alternate theme JSON
later (enterprise white-label), without deploy.

## Context
Founder priority: build functionality, not endless visual iteration.
Appearance is DONE as of mockup v3; new screens only compose existing
packages/ui components. Any new visual pattern requires updating DESIGN.md
first — which should be rare.

## Consequences
UI work per feature ≈ composition, not design. Lint blocks raw styles.
