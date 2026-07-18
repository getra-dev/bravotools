# ADR-003: English-first, zero hardcoded strings

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Code, keys, DB enums, docs — English. All UI text via t(). en.json is
source of truth; lt.json (and later pl.json) are translations. User
locale in profiles.locale.

## Context
Opens Baltics→PL→Nordics→DACH without rewrites. Mixed-language crews
(PL/UA/RU) are the field norm. BravoBIM lesson: retrofitting i18n is
expensive; prevention is cheap.
