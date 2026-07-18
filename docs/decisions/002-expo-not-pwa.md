# ADR-002: Expo (React Native) for field app, Next.js for web

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Field app = Expo/RN with expo-sqlite offline outbox. Dispatcher pult and
admin = Next.js on Vercel (online-only).

## Context
Core field loop (QR scan, photos, PTT, signatures) must work offline in
basements. Push notifications are the product's nervous system.

## Rejected alternatives
- PWA: camera/push/background-sync unreliable on iOS; migration later
  would cost more than native now.
- Flutter: team stack is TypeScript; agents are strongest in TS/React.
