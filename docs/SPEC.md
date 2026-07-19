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
- OWNER AMENDMENT (2026-07-19): tools WITHOUT QR stickers are the common
  case (onboarding backlog, rented machines) — identification by SEARCH
  (serial number / inventory code / name / QR text) is a first-class
  alternative everywhere scanning is offered; the found tool behaves
  identically to a scanned one (same card, same handover actions).
  Stickers remain the target state; search is the permanent fallback.

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
- OWNER AMENDMENTS (2026-07-19): (a) condition photos are part of the act —
  embedded in the PDF; components are checked against photos on handover AND
  return, per-component photos supported; (b) both parties can add free-text
  notes (giver + receiver), printed on the act; (c) when a return flags
  missing components, the SUPPLY MANAGER is notified (notifications row now,
  push when 2.7 lands); (d) checkout must record the destination site
  (to_location) — "kur įrankis yra" is first-class; (e) see ADR-015: receiver
  countersigns on their OWN phone (remote signature), pass-the-phone stays
  only for external persons.

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

- 2.6 IMPLEMENTATION NOTE (2026-07-19): sync replays the SAME idempotent
  RPCs (initiate/perform, keyed by client movement uuid) instead of a
  separate /api/sync endpoint — identical guarantees (inserts only,
  duplicate uuid = skip), one code path fewer to maintain.

### 2.7 Push & reminders (E1 scope)
- OWNER AMENDMENT (2026-07-19): + missing_components notification to supply
  manager/admin/owner when a return flags lost components (see 2.4c);
  + signature_requested push to the receiver (ADR-015).
- Expo push tokens per device. Server cron (Vercel cron or pg_cron) daily:
  rental_due (T-3, T-1, overdue), warranty_expiring (T-30), inspection_due
  (T-14). Insert notifications row + push. Tap → deep link to tool.

### 2.8 Web: tools table + map
- Dense table (30+ rows visible): columns code/name/status/location/holder/
  due; saved filters; Cmd+K search; bulk print QR.
- Map (Leaflet+OSM): location markers with tool counts; vendor locations
  distinct color. Click → filtered list.

### 2.8b Objektų valdymas — OWNER ADDITION (2026-07-19, E1 scope gap)

Sites/locations management was implicit in the schema but never specced as
UI. Requirements:
- Owner/admin/supply_manager CREATE and edit locations: type (site /
  warehouse / service), name, address, geo coordinates (map picker or
  address geocode — feeds the 2.8 map), is_active archiving. Page-based
  CRUD (web /locations, /locations/new, /locations/[id]/edit).
- RESPONSIBLES: assign people to a site (site_assignments): one or more
  workers + explicitly marked site manager (is_manager). Assignment UI on
  the location page; a person can be on several sites.
- Visibility follows the §1 roles matrix: workers/site managers see their
  own sites' requests/tasks via site_assignments — this is the data that
  E2 flows (material requests, receiving) will depend on, so it must land
  BEFORE E2 starts.
- Handover wizard site pickers list only active sites; site card shows
  current tools on site (count + list link).
- NOT random input: creation restricted to owner/admin/supply_manager;
  workers cannot create locations.

### Mobile IA note — OWNER CONFIRMATION (2026-07-19)

The field app grows into BOTTOM TABS as etapas content lands (per
docs/plan.md skeleton): My (E1, exists) · Tools/search (E1 end, 2.8 era) ·
Radio PTT (E2) · Orders (E2) · costs views (E3). The single-screen E1 layout
is intentional scope, not the final IA; introduce the tab bar with the first
E2 surface (or at 2.8 if a second E1 tab ships earlier).

### 2.9 Tools-axis backlog — OWNER ADDITIONS (2026-07-19, scope for E1.5/E2)

- **Inventorizacija (stocktake).** Periodic audit session: auditor walks a
  location scanning QR codes; system builds found / missing / misplaced
  (wrong location or holder) lists live; unresolved missing → tool status
  lost + supply-manager notification; session closes with a signed audit
  report (PDF) and adjustment log. Supports per-location partial audits.
  Needs new tables (inventory_sessions, inventory_scans) — reuse-check first.
- **Nurašymas (write-off).** Guided flow: reason (broken / lost / stolen /
  worn_out), photo evidence, approval by owner/admin, write_off movement
  (action exists in schema) + written_off status, write-off act PDF for
  accounting; if held by a subcontractor at the time → hook into recharge
  builder (lost_tool line type already exists).
- **Priėmimas į eksploataciją (commissioning).** Intake flow for a newly
  purchased/leased tool: registration with purchase data (vendor, invoice
  no, warranty), initial condition photos, component list definition, QR
  sticker assignment, inspection schedule setup where applicable, optional
  commissioning act. Turns "naujas daiktas iš parduotuvės" into a tracked
  tool in one guided pass. Pairs with the future "ordered / in transit"
  states question (see E2 delivery_tasks).

### 2.10 Rented tools lifecycle — OWNER ADDITION (2026-07-19)

Rented machines are NOT our inventory but ARE our responsibility while on
hire; the dispute-proof moments are intake and give-back:
- **Rental intake (paėmimas):** quick-create/scan at the vendor desk with
  ownership=rented, vendor, daily rate, due date + MANDATORY condition
  photos and engine-hours reading at pickup. This baseline wins later
  damage/hours disputes.
- **Return to VENDOR (grąžinimas nuomotojui):** dedicated flow (distinct
  from returning to our warehouse): condition photos, engine hours, target
  = vendor location, tool → returned_to_vendor, reminders stop; the return
  movement date becomes system_period_end evidence for E3 invoice
  reconciliation (billed days vs actual).
- Ordering + pickup/dropoff logistics ride on E2 delivery_tasks (3.4);
  reconciliation itself is E3 (§4).
- Stocktake counts active rentals normally; returned_to_vendor excluded.

### 2.11 Global history & archiving — OWNER ADDITION (2026-07-19)

- **History journal (web):** one chronological view across ALL tools —
  movements, acts, write-offs, rental intakes/returns, inventory closures —
  grouped BY MONTH with filters (month, action type, location, person,
  tool search). Today history lives only on each tool card; the journal
  answers "kas vyko įmonėje liepą". Data source: tool_movements +
  activity_log (no new tables).
- **Archiving (display state, never deletion):** append-only stays sacred —
  acts/movements are dispute evidence and are NEVER deleted. Archiving:
  handover_acts.archived_at set by a bulk action (owner/admin: "archive all
  signed acts up to DATE"); archived acts disappear from default lists and
  tool cards (toggle "show archived" reveals them), PDFs remain in storage.
  Optional later: yearly auto-archive via pg_cron.

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
- OWNER AMENDMENT (2026-07-19, request form UX): the site field is a
  DROPDOWN (not a stacked list) and shows ONLY sites assigned to the
  person (site_assignments); no fallback to all org sites for workers.
  Supply roles (owner/admin/supply_manager) see all sites — they
  dispatch for everyone. needed_by is a date PICKER with a drop-down
  calendar, not a free-text field.
- OWNER AMENDMENT (2026-07-19, structured lines): a request is entered as
  LINE ROWS — each row = description + qty + unit (dropdown of standard
  units), NOT one free-text blob. Reason: downstream reconciliation
  (order vs delivery vs invoice, E3) needs structured qty/unit from the
  source. Worker-entered qty/unit flow into material_request_items and
  pre-fill the dispatcher confirm step; dispatcher can still override.

### 3.2 Materials dictionary
- On unmatched raw text: fuzzy (pg_trgm) over material_aliases → top-3 to
  dispatcher with confidence; confirm creates alias (source ai, confirmed).
- New material creation inline with base_unit + packages + weight/volume
  estimates (AI suggested).

### 3.3 Dispatcher pult (web)
- BUILT WITHOUT AI (2026-07-19, E2-D): order → vendor email with a
  generated PO PDF is live. Local delivery goes to the inbucket/mailpit
  catcher (SMTP :55325, view :55324); on the ADR-014 promotion gate set
  RESEND_API_KEY and the mailer switches with no caller change. Each
  send writes an outbound_messages proof row (to, subject, message-id,
  PDF path) and advances requested/approved → ordered. Still AI-gated:
  the attention queue ranking, inbound quote/confirmation parsing, RFQ.
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
- BUILT WITHOUT AI (2026-07-19, 3.4a+b): /vehicles admin (capacity kg/m³,
  max item length, crane, pallets, type), plan_delivery (weight/volume
  est), assign vehicle+driver+date, dispatcher /deliveries with load bar,
  mobile DriverScreen (today's stops, trip odometer, picked_up/delivered).
- OWNER AMENDMENTS (2026-07-19, later work — 3.4c bundle):
  * Material physical params: expose the existing weight/volume/max-length
    on the /materials form, and ADD width, units_per_pallet, pallet_type.
    Vehicles already carry capacity/crane/pallets/length (built in 3.4a) —
    optionally add pallet-count capacity + width.
  * Greedy vehicle suggestion on plan/assign: sum weight/volume/pallets +
    max item length across the stop(s) → hard filters (crane, length,
    pallets, capacity) → suggest the smallest fitting vehicle ≤85%; warn
    over 85%; one site = one vehicle/day (crane split surfaced).
  * Trips as a first-class group: dispatcher bundles the day's tasks into
    one trip; add delivery_tasks.stop_order for route sequencing.
  * Pick list (surinkimo lapas) PDF: line items aggregated per trip,
    grouped by pickup location (warehouse/vendor) with summed qty — load
    once for many orders.
  * Trip / route sheet (kelionės lapas) PDF: ordered stops with addresses,
    per-stop manifest, trip-log fields (date, vehicle, driver, odometer
    in/out, km). LT semi-formal fleet doc.
  * Crane as a service: the fiskaras (crane truck) also does crane
    unload/lift-to-height — extra service + time. Add delivery_tasks
    crane_lift_height_m, est_crane_minutes, crane_billable; feeds vehicle
    filter (has_crane), the trip-time estimate, and a billable service
    line (site_services / E3 money layer). Capture + sheet now; invoicing
    is E3.
  * External / hired transport: delivery_tasks.delivery_method already
    has own_vehicle | vendor_delivers | hired — wire it. Plan/assign lets
    the dispatcher pick the method. vendor_delivers = no own vehicle, ETA
    from the vendor PO. hired = pick a carrier (a vendor with a transport
    type — add 'transport' to the vendor type set, or free-text) + cost,
    and optionally ORDER transport by email reusing the PO-email mailer
    (outbound_messages proof). Greedy own-vehicle suggestion only applies
    when method = own_vehicle.
  Suggested order: material params → greedy suggestion → trips+stop_order
  → pick list + trip sheet PDFs → crane service capture → external/hired
  transport method.

### 3.5 Receiving (foreman)
- Exception-first: all lines default delivered; groups by category;
  search + Issues filter; pre-flagged vendor shorts locked with source;
  stepper sets received qty + reason + photo; sign → order_items
  delivered_quantity updated, issues → delivery_issues, remainder →
  backorder suggestion in queue.

### 3.6 Vendor relationship hub — "Vendor 360" (OWNER AMENDMENT 2026-07-19, later work)
Owner-requested. The vendor detail page becomes the single place to
track everything about a vendor. Buildable WITHOUT AI except where noted.
- **Contacts (multiple per vendor).** New `vendor_contacts` table:
  vendor_id, name, position, email, phone, `handles` text[] (what they
  cover — e.g. one contact for blocks, another for stone wool),
  is_primary. One vendor = many responsible people. RPCs create/update/
  remove, gated is_supply; select is_org_member.
  - PO email auto-routing: when sending an order (E2-D), pick the contact
    whose `handles` intersects the order's material categories; fall back
    to is_primary; then to vendors.email. Surface which contact it went
    to in the outbound_messages proof.
- **Trading history.** Consolidated ledger on the vendor page: orders to
  this vendor + vendor_invoices, one timeline, running totals (ordered €,
  invoiced €, delivered/outstanding). Data already exists (orders +
  vendor_invoices) — this is a read/aggregate view.
- **Credit limit.** New `vendors.credit_limit numeric`. Exposure =
  open-order value (unpaid/undelivered) + unpaid vendor_invoices; show a
  bar on the vendor page and warn on the order-create/send step when a
  new PO would push exposure over the limit (soft warning, not a block).
- **Contracts.** New `vendor_contracts` table: vendor_id, number,
  valid_from, valid_to, terms text, file_storage_path (new storage
  bucket, org-prefix RLS like the others). List + upload + validity
  badge (active / expiring / expired) on the vendor page; expiring
  contract → reminder (reuse run_daily_reminders / notifications).
- **Vendor invoices.** `vendor_invoices` + `vendor_invoice_lines` tables
  already exist. Buildable now: list on the vendor page + manual add
  (number, date, total, PDF upload) + open/paid status.
  - AI / E3 (needs ANTHROPIC_API_KEY): auto-parse invoice PDF →
    vendor_invoice_lines, reconcile against order/movement lines,
    per-line verdict — this is the §4 money layer, do NOT build without
    the key.
- Suggested build order when activated: contacts (+PO routing) → trading
  history + invoice list → credit limit → contracts.

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
