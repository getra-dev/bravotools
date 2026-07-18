# ADR-009: HOT orders — visible cost, mandatory reason, never blocked

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Request inside vendor lead time → is_hot, reason REQUIRED (planning_miss /
scope_change / emergency / vendor_fail / weather / other), warning shown
BEFORE save, hot_premium € tracked on orders.

## Fair play rules
Rules/SLA visible upfront; HOT allowed (target <15%, not 0); metrics at
site level first, person level only for repeat patterns; improving trends
praised, not only failures flagged. System is a mirror, not a policeman.
