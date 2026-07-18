# ADR-013: Dashboards = exception queue + fixed reports (no builder)

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
v1 ships exactly: (1) dispatcher attention queue (~15 ranked exceptions
with prepared actions), (2) dense filterable tables with saved filters,
(3) fixed monthly receipt (SAVED € + freed hours), (4) site cost view,
(5) HOT rate view. All are SQL views + existing components. NO custom
dashboard builder, NO chart library zoo, NO configurable widgets in v1.

## Context
Dashboards are the classic solo-founder time sink; supply managers need
decisions surfaced, not chart configuration. Fixed reports are testable,
fast, and agent-safe (no drift surface). Custom analytics = v2, only if
paying customers ask twice.
