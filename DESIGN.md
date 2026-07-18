# DESIGN.md — Industrial Precision

BravoTools looks like a quality power tool, not an office app.
Reference implementation: `bravotools_mockup_v3.html` — when in doubt, copy it.

## Tokens (single source: packages/theme/tokens.json)
| token | value | use |
|---|---|---|
| ink | #17191C | app background (graphite tool body) |
| panel | #21252A | cards |
| panel2 | #1B1E22 | nested surfaces (drafts) |
| line | #2E333A | borders |
| steel | #96A0AA | secondary text |
| dim | #6B7480 | labels, captions |
| paper | #F1F2F3 | primary text; also "document" surfaces |
| hi | #F3B000 | ACTION ONLY: PTT, confirm, attention |
| hot | #E8503A | HOT / problems / overdue |
| ok | #3CB878 | confirmed / on track |
| blue | #8FB0FF | AI identity / info |

Radius: cards 14px, buttons 9–12px, stamps 5px.

## Typography (3 voices, never a 4th)
1. **Display**: system sans, weight 800–900, tight tracking — big numbers
   (€ values, counts). Numbers are content; make them loud.
2. **Mono**: SF Mono / ui-monospace — inventory codes, invoice numbers,
   engine hours, receipts. Always uppercase, letter-spacing ~1.5px.
3. **Body**: system sans 400–650.

## Signature elements (protect these)
- **Inventory tag card**: left punched-hole dot, mono code line in `hi`,
  name, location line with 12px icon.
- **Status stamp**: bordered uppercase chip, 1px currentColor border,
  semantic color, NO rotation, NO fill.
- **PTT button**: 80px yellow circle, radial highlight, pulse only while
  recording. The single most prominent element in the app.
- **Receipt**: paper-white monospace block with perforated bottom edge —
  used ONLY for the monthly "SAVED €" report.

## Field ergonomics (non-negotiable)
- Touch targets ≥ 52px (gloves). Primary actions in thumb zone (bottom).
- Mobile app is dark-only. Dispatcher web is light, dense, keyboard-first.
- High contrast; test in sunlight mindset.
- Offline states are designed, not error states.

## Forbidden (instant PR rejection)
- Emoji as icons (lucide only, stroke 1.8)
- Gradients as decoration (only the PTT radial highlight)
- Blue/violet primary buttons, generic shadcn look
- Yellow used decoratively (yellow = action/attention only)
- Rounded avatars, playful bounce animations, confetti
- More than one accent color per screen region
- Lithuanian (or any non-English) strings in code — i18n only

## Motion
≤200ms, purpose only: QR scan laser line, PTT pulse while recording,
stamp "thunk" + haptic on act signing. Respect prefers-reduced-motion.

## Voice & copy (English, sentence case)
Buttons say what happens: "Confirm and send", not "Submit".
Errors say what to do next. Empty states invite action
(blueprint-style line illustrations). AI messages always carry the AI badge.
