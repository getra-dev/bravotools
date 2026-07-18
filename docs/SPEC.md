# SPEC.md — BravoTools Functional Specification v1.0

Read order for agents: CLAUDE.md → DESIGN.md → docs/decisions/ → this file.
Schema (supabase/migrations/0001) is the single source of truth for data.
Mockups in docs/reference/ are the UX source of truth. Language: EN (i18n keys).

---

## 0. System overview

Three surfaces, one Supabase backend:

| App | Users | Stack | Mode |
|---|---|---|---|
| apps/mobile | foremen, workers, drivers | Expo RN | dark, offline-capable |
| apps/web | supply manager (dispatcher), client admin | Next.js | light, dense, online |
| apps/admin | platform super admin | Next.js (service role) | internal only |

AI jobs (server-side only, packages/ai): voice-parse, radio-answer,
invoice-parse, dedup-check, daily-digest. Every AI mutation → activity_log.

---

## 1. Roles & visibility matrix (RLS)

Roles (memberships.role): owner, admin, supply_manager, site_manager, driver, worker.

| Data | worker/site_manager | driver | supply_manager/admin/owner |
|---|---|---|---|
| Tools list, locations, holders | all org | all org | all org |
| Tool purchase prices, rates | hidden | hidden | full |
| Material requests, orders | own sites only (site_assignments) | read linked to own tasks | all |
| Delivery tasks | own (as holder party) | own assigned + own trips | all |
| Costs, invoices, reconciliation | none | none | full |
| Recharge invoices | none | none | full |
| Site services, waste | own sites | none | full |
| activity_log | entries on own entities | own | all |
| platform tables (plan_limits read-only) | read | read | read |

Helper fns exist in schema: is_org_member(org), is_assigned_to_site(site).
Every table ships with RLS policy + a pgTAP or SQL test in packages/db/tests.

---

## 2. Etapas 1 — Tools axis (build first, full detail)

### 2.1 Auth & org
- Email+password and email OTP via Supabase Auth. profiles row auto-created
  (trigger) with locale default 'lt' UI value but EN keys.
- First user creates organization → role owner. Invite by email → membership.
- Org switcher if user belongs to >1 org.
- AC: new user → org → invite worker → worker sees empty Tools list. RLS test:
  user B (other org) sees zero rows of org A.

### 2.2 Excel import (onboarding-critical)
- Web admin uploads .xlsx/.csv of existing tool list. AI maps columns
  (name/serial/category/price/date bought/vendor) with preview table;
  user corrects mapping; import creates tools + tool_categories + vendors.
- Unmapped rows land in a "fix later" list, never block import.
- AC: 200-row messy file imports in <2 min with ≥90% auto-mapped.

### 2.3 Tool registry & QR
- Tool CRUD (web + mobile read). qr_code generated as `BT-TOOL-######`
  (org-scoped sequence in settings). QR sticker sheets: A4 PDF, 3×8 labels,
  code + name + org logo. Print from web.
- Tool detail: photo hero, status, holder, location, warranty (auto badge
  <60 days), components list, repairs, movement timeline, acts.
- Scan (expo-camera): resolves qr_code → tool detail with primary action
  contextual: available→"Hand over", checked_out→"Return / Transfer".
- AC: scan-to-detail <2 s; unknown code → "register this sticker?" flow.

### 2.4 Handover flow (core loop, must work offline)
Steps: scan → choose receiver (org member OR external_person; create-inline
for external with name+company+phone) → component checklist (from
tool_components; default all included; toggle + condition note) →
≥1 photo (checkout/checkin type) → optional engine-hours input when
tools.tracks_engine_hours → GPS capture (silent) → both parties sign on
screen (signature canvas) → movement + act rows created → PDF generated
server-side when online (react-pdf), stored, linked.
- Numbering: `BT-AKT-YYYY-####` per org.
- Offline: movement+act queued in outbox with client UUIDs; PDF renders
  after sync; UI shows "act pending sync" stamp.
- AC: full flow ≤30 s with gloves-size targets (≥52 px). Return flow diffs
  components vs last checkout and flags missing (component status).

### 2.5 My responsibility
- Mobile screen: big € total (sum of purchase_price of held tools), list
  with days-held, "long hold" stamp >14 d, rental return due warnings.
- AC: matches DB truth after any sync.

### 2.6 Offline outbox
- expo-sqlite table outbox(id uuid, kind, payload json, created_at, synced_at).
- Kinds in E1: movement, act, photo(meta+file path), component_check.
- Sync worker: on connectivity, POST batches to /api/sync (idempotent upsert
  by client uuid). Photos upload to Storage first, then row. Retry w/ backoff.
- Conflict policy: append-only ⇒ inserts only; duplicate uuid = already
  synced = skip. Never UPDATE history from client.
- AC: airplane-mode full handover, reconnect → all rows + PDF appear; double
  sync produces zero duplicates.

### 2.7 Push & reminders (E1 scope)
- Expo push tokens per device. Server cron (Vercel cron or pg_cron) daily:
  rental_due (T-3, T-1, overdue), warranty_expiring (T-30), inspection_due
  (T-14). Insert notifications row + push. Tap → deep link to tool.

### 2.8 Web: tools table + map
- Dense table (30+ rows visible): columns code/name/status/location/holder/
  due; saved filters; Cmd+K search; bulk print QR.
- Map (Leaflet+OSM): location markers with tool counts; vendor locations
  distinct color. Click → filtered list.

Definition of E1 done: Sivysta imports registry, prints stickers, and field
crew completes real handovers offline for 2 weeks without prompting.

---

## 3. Etapas 2 — Supply flow (summary spec)

### 3.1 Radio (PTT)
- Hold-to-talk (expo-av), release → upload → /ai/voice-parse:
  Whisper transcript → Claude structured JSON:
  `{intent: question|request|other, items:[{raw,material_id?,confidence,qty,unit}],
    site_id?, needed_by?, answer_targets?}`
- intent=question → /ai/radio-answer (Claude tool-use over RO views:
  tool_where, order_status, stock_check, rental_due). Unsure → escalate
  card to dispatcher, never guess. Reply as text + optional expo-speech TTS.
- intent=request → material_request draft; dedup-check runs BEFORE save
  (same site + material_id + open window) → if hit, AI asks user by voice
  (two big buttons: "Same need" / "Need MORE"); resolution stored
  (duplicate_resolution). Confirmed → request → dispatcher queue.
- Every exchange = comments rows (author_type ai/user, audio_path,
  body=transcript) + activity_log.

### 3.2 Materials dictionary
- On unmatched raw text: fuzzy (pg_trgm) over material_aliases → top-3 to
  dispatcher with confidence; confirm creates alias (source ai, confirmed).
- New material creation inline with base_unit + packages + weight/volume
  estimates (AI suggested).

### 3.3 Dispatcher pult (web)
- Attention queue: exceptions only, AI-ranked (hot, needed_by proximity,
  vendor silent >24h, duplicates, delivery issues). Each card: root cause
  line + 1-3 prepared actions (side-effects listed) — see personas mockup.
- Orders board: dense table, fulfillment bars (delivered/total items),
  grouping by vendor, bulk "send order email".
- Order lifecycle: requested→approved→ordered(email PDF/CSV via Resend,
  outbound_messages proof chain)→confirmed(inbound parse)→partial→delivered.
- RFQ: select request lines → quote_request to N vendors (unique reply-to
  quotes+{id}@); inbound webhook → /ai/invoice-parse variant extracts
  quote lines → comparison table → Award creates PO.

### 3.4 Logistics & fleet packing
- delivery_tasks generated from orders + transfers; est weight/volume from
  material fields. Packing draft (greedy): hard filters (length, crane,
  pallets, capacity) → cheapest fitting vehicle to ≤85%; rule one site =
  one vehicle per day (exception: crane split, surfaced explicitly).
- Driver mobile: today's route rail (see demo), per-stop manifest,
  "photo dispatch note" → AI diff vs order (mismatch shortlist), shorts
  logged as delivery_issues with photo; buttons picked_up/delivered;
  receiver signs on driver phone. Trip start/end with odometer.

### 3.5 Receiving (foreman)
- Exception-first: all lines default delivered; groups by category;
  search + Issues filter; pre-flagged vendor shorts locked with source;
  stepper sets received qty + reason + photo; sign → order_items
  delivered_quantity updated, issues → delivery_issues, remainder →
  backorder suggestion in queue.

---

## 4. Etapas 3 — Money layer (summary spec)

- Invoice upload (photo/PDF) → /ai/invoice-parse → vendor_invoice_lines
  with billed_*; matcher fills system_* from movements/orders; verdict per
  line (matched/overbilled_period/rate/qty/downtime_deduction/unknown);
  dispatcher review UI: side-by-side billed vs system, one-click accept or
  dispute (drafted email with evidence links).
- Internal invoices: monthly cron builds per-site lines from movement
  durations × internal_rate_daily; PDF.
- Recharge invoices: builder pulls billable events per subcontractor
  (rented_for, bill_to, lost tools from unreturned diffs) → markup per
  line → export pack (PDF+CSV) → status sent_to_accounting.
- Site services registry + site-closing checklist (active services on
  completed site = exception card).
- Waste: containers board per site + waste_records with EWC codes and
  document uploads; GPAIS status tracking (manual in v1).
- Monthly receipt (fixed report): SAVED € lines (caught overbilling,
  stock reuse, on-time rentals, merged duplicates, consolidated runs)
  minus HOT premium; plus freed-hours estimate from activity_log counts.
  Rendered as the perforated receipt (DESIGN.md), exportable PDF.
- Reports (fixed, interactive filters only): receipt, HOT analytics,
  site cost view, fulfillment, fleet utilization. No dashboard builder
  (ADR-013).

---

## 5. AI endpoint contracts (packages/ai)

All: POST, auth required, org resolved server-side, rate-limit checked
against plan_limits BEFORE model call, tokens logged to activity_log.payload.

- /ai/voice-parse {audio_url} → {transcript, intent, items[], confidence}
  (model: haiku; whisper for STT)
- /ai/radio-answer {question, site_ctx} → {answer, sources[], escalate:boolean}
  (sonnet; tools: read-only SQL fns; hard rule in system prompt: unknown⇒escalate)
- /ai/dedup-check {request_item} → {duplicate_of?, confidence, question_text}
  (haiku)
- /ai/invoice-parse {file_url, kind: invoice|quote|dispatch_note}
  → {lines[], vendor_guess, totals} (sonnet, vision)
- /ai/note-diff {file_url, order_id} → {matches, mismatches[]} (sonnet, vision)
- /ai/daily-digest {org} → ranked exception list (haiku, cron)

Prompts live in packages/ai/prompts/*.md, versioned; JSON schemas in
packages/ai/schemas; responses validated (zod) before DB writes.

---

## 6. Numbering, settings, i18n

- org.settings jsonb keys: numbering{tool,act,order,rfq,recharge,internal}
  prefixes+counters; require_photo_on_handover (default true); hot_sla_days
  default map; notification toggles.
- All sequences org-scoped, generated server-side, gapless not required.
- i18n: en.json source; lt.json complete mirror (CI check); pl.json
  scaffold empty allowed in E1.

## 7. Seed (supabase/seed.sql)

Demo org "Sivysta UAB": 4 locations (2 sites, warehouse, Cramo vendor loc),
8 users across roles incl. external_person, 40 tools (2 rented w/ due dates,
1 in_service, 1 with engine hours), 15 materials + aliases (LT variants),
3 vehicles (van/crane/trailer profiles), 6 orders in mixed states incl.
1 partial with delivery_issues, 1 vendor_invoice with a seeded overbilling,
reservations, 1 recharge draft. Reset must tell the whole demo story.

## 8. Non-functional

- Mobile cold start <3 s; scan→detail <2 s; queue actions optimistic.
- All times stored UTC, displayed org TZ (settings, default Europe/Vilnius).
- Photos: client-compressed ~1600px max side before upload.
- Error tracking: Sentry (mobile+web+api) from S1.
- Backups: Supabase PITR note for prod; local dev via db reset.
- Security: no service key outside apps/admin server; storage buckets
  per-org path prefix + RLS policies.
