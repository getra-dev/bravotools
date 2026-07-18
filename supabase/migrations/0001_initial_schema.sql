-- =====================================================
-- BRAVOTOOLS — pradinis duomenų modelis (v0.1)
-- Standalone app, Supabase (Postgres), multi-tenant
-- =====================================================

-- ---------- 1. TENANCY ----------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_code text,
  vat_code text,
  plan text not null default 'free'
    check (plan in ('free','pro','business','enterprise')),
  plan_valid_until date,                   -- null = neterminuotas / free
  logo_path text,                          -- logotipas aktams ir sąskaitoms
  settings jsonb not null default '{}',    -- numeracijos prefiksai, privalomos
                                           -- foto, pranešimų taisyklės ir pan.
  created_at timestamptz not null default now()
);

-- planų limitai — vienoje vietoje, keičiami be deploy
create table plan_limits (
  plan text primary key,
  max_tools integer,                       -- null = be ribos
  max_users integer,
  max_sites integer,
  ai_features boolean not null default false,
  reconciliation boolean not null default false,  -- sąskaitų sutikrinimas
  recharging boolean not null default false,      -- persąskaitinimas
  updated_at timestamptz not null default now()
);

insert into plan_limits (plan, max_tools, max_users, max_sites, ai_features, reconciliation, recharging) values
  ('free',       25,   3,    1,    false, false, false),
  ('pro',        null, 15,   null, true,  true,  false),
  ('business',   null, null, null, true,  true,  true),
  ('enterprise', null, null, null, true,  true,  true);

-- platformos administratoriai (virš RLS, atskiras admin pultas)
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- palaikymo prisijungimų auditas ("prisijungti kaip klientas")
create table admin_access_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references platform_admins(user_id),
  org_id uuid not null references organizations(id),
  reason text not null,
  accessed_at timestamptz not null default now()
);

-- profiles papildo supabase auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  locale text not null default 'lt',       -- UI kalba: 'lt', 'en', 'ru', 'pl'...
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'worker'
    check (role in ('owner','admin','supply_manager','site_manager','driver','worker')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ---------- 2. OBJEKTAI IR SANDĖLIAI ----------

-- viena lentelė visoms lokacijoms: statybvietė, sandėlis, servisas
create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null default 'site'
    check (type in ('site','warehouse','service','vendor')),
  vendor_id uuid,                          -- jei type='vendor': išorinis sandėlis
  name text not null,
  address text,
  latitude numeric(9,6),                   -- žemėlapiui
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 2a. PRISKYRIMAI PRIE OBJEKTŲ ----------

-- kas už kurį objektą atsakingas / kuriame dirba
create table site_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references locations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  is_manager boolean not null default false, -- objekto vadovas
  created_at timestamptz not null default now(),
  unique (site_id, user_id)
);

create index idx_assignments_user on site_assignments (user_id);

-- helper RLS politikoms: ar useris priskirtas objektui
create or replace function is_assigned_to_site(check_site uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from site_assignments
    where site_id = check_site and user_id = auth.uid()
  ) or exists (
    select 1 from memberships m
    join locations l on l.org_id = m.org_id
    where l.id = check_site and m.user_id = auth.uid()
      and m.role in ('owner','admin','supply_manager')
  );
$$;

-- ---------- 2b. IŠORINIAI ASMENYS (subrangovų atstovai) ----------

-- žmogus, kuris nėra org narys, bet gali priimti įrankius/medžiagas
create table external_persons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid,                          -- FK į vendors (subrangovo įmonė), pridedama žemiau
  full_name text not null,
  phone text,
  position text,                           -- "brigadininkas"
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 3. ĮRANKIAI ----------

create table tool_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  unique (org_id, name)
);

create table tools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  category_id uuid references tool_categories(id),
  name text not null,                      -- "Hilti TE 60-AVR"
  serial_number text,
  inventory_code text,                     -- vidinis inventoriaus kodas
  qr_code text unique,                     -- QR kodo turinys (pvz. "BT-TOOL-000123")
  ownership text not null default 'owned'
    check (ownership in ('owned','rented')),
  status text not null default 'available'
    check (status in ('available','checked_out','in_service','lost','written_off','returned_to_vendor')),
  current_location_id uuid references locations(id),
  current_holder_id uuid references profiles(id),      -- savas darbuotojas
  current_external_holder_id uuid references external_persons(id), -- ARBA subrangovas
  -- nuosavo įrankio laukai
  purchase_date date,
  purchase_price numeric(10,2),
  purchased_from_vendor_id uuid,           -- kur pirktas (FK į vendors, žemiau)
  purchase_invoice_number text,            -- sąskaitos nr. garantiniam atvejui
  internal_rate_daily numeric(10,2),       -- vidinis nuomos įkainis objektams
  warranty_months integer,                 -- garantinis laikotarpis mėnesiais
  warranty_until date generated always as
    (((purchase_date + (warranty_months * interval '1 month')))::date) stored,
  -- nuomojamo įrankio laukai
  rental_vendor_id uuid,                   -- FK į vendors (žemiau)
  rental_rate_daily numeric(10,2),
  rental_start date,
  rental_due_return date,                  -- AI priminimų pagrindas
  rented_for_vendor_id uuid,               -- jei nuoma subrangovo naudai (FK žemiau)
  tracks_engine_hours boolean not null default false, -- sunkioji technika
  engine_hours numeric(9,1),               -- paskutinis žinomas mval. rodmuo
  notes text,
  created_at timestamptz not null default now()
);

create index idx_tools_org_status on tools (org_id, status);
create index idx_tools_due_return on tools (rental_due_return)
  where ownership = 'rented' and status <> 'returned_to_vendor';

-- ---------- 4. JUDĖJIMAS (audit trail) ----------

create table tool_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  action text not null
    check (action in ('checkout','checkin','transfer','to_service','from_service','write_off')),
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  holder_id uuid references profiles(id),             -- kam perduota (savas)
  external_holder_id uuid references external_persons(id), -- kam perduota (subrangovas)
  performed_by uuid not null references profiles(id),
  performed_at timestamptz not null default now(),
  gps_latitude numeric(9,6),               -- kur fiziškai įvyko perdavimas
  gps_longitude numeric(9,6),              -- (iš telefono QR skenavimo metu)
  engine_hours_reading numeric(9,1),       -- mval. rodmuo (jei technika jį seka)
  notes text
);

create index idx_movements_tool on tool_movements (tool_id, performed_at desc);

-- ---------- 5. PRIĖMIMO-PERDAVIMO AKTAI ----------

-- aktas generuojamas automatiškai iš judėjimo + komponentų + nuotraukų
create table handover_acts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  act_number text not null,                -- "BT-AKT-2026-0001"
  movement_id uuid not null references tool_movements(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','pending_signatures','signed','void')),
  pdf_storage_path text,                   -- sugeneruotas PDF Supabase Storage
  -- perduodančioji pusė
  giver_id uuid references profiles(id),
  giver_signed_at timestamptz,
  giver_signature_path text,               -- parašo paveikslėlis (canvas)
  -- priimančioji pusė
  receiver_id uuid references profiles(id),
  external_receiver_id uuid references external_persons(id), -- subrangovo atstovas
  receiver_signed_at timestamptz,
  receiver_signature_path text,
  created_at timestamptz not null default now(),
  unique (org_id, act_number)
);

create index idx_acts_movement on handover_acts (movement_id);

-- ---------- 6. TIEKĖJAI ----------

create table vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  type text[] not null default '{materials}',  -- materials / rental / tools / subcontractor
  email text,
  phone text,
  -- kaip tiekėjui siunčiami užsakymai:
  order_method text not null default 'manual'
    check (order_method in ('manual','email','csv','api')),
  default_lead_time_days integer,          -- įprastas įvykdymo terminas
  integration_config jsonb,                -- api endpoint, csv formatas, auth ref
  notes text,
  created_at timestamptz not null default now()
);

-- tiekėjo prekių katalogas (importuotas iš CSV arba sinchronizuotas per API)
create table vendor_catalog_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  sku text not null,                       -- tiekėjo prekės kodas
  material_id uuid,                        -- FK į materials: kainų palyginimo raktas
  name text not null,
  unit text not null default 'vnt',
  price numeric(10,2),
  lead_time_days integer,                  -- jei skiriasi nuo tiekėjo default
  is_available boolean not null default true,
  source text not null default 'csv'
    check (source in ('csv','api','manual')),
  synced_at timestamptz,
  unique (vendor_id, sku)
);

create index idx_catalog_search on vendor_catalog_items
  using gin (to_tsvector('simple', name));

alter table external_persons
  add constraint fk_external_vendor
  foreign key (vendor_id) references vendors(id);

alter table tools
  add constraint fk_tools_rental_vendor
  foreign key (rental_vendor_id) references vendors(id);

alter table tools
  add constraint fk_tools_rented_for
  foreign key (rented_for_vendor_id) references vendors(id);

alter table tools
  add constraint fk_tools_purchased_from
  foreign key (purchased_from_vendor_id) references vendors(id);

create index idx_tools_warranty on tools (warranty_until)
  where ownership = 'owned' and status <> 'written_off';

-- ---------- 7. REMONTO / SERVISO ISTORIJA ----------

create table tool_repairs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  repair_type text not null default 'repair'
    check (repair_type in ('repair','maintenance','calibration','inspection')),
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','cancelled')),
  is_warranty_claim boolean not null default false,  -- garantinis remontas?
  service_vendor_id uuid references vendors(id),     -- kas remontavo
  description text not null,                         -- gedimo aprašymas
  resolution text,                                   -- kas padaryta
  cost numeric(10,2),                                -- 0 jei garantinis
  sent_at date not null default current_date,
  returned_at date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_repairs_tool on tool_repairs (tool_id, sent_at desc);

-- ---------- 8. ĮRANKIO SUDEDAMOSIOS DALYS ----------

-- pvz. perforatorius: 2 baterijos, kroviklis, lagaminas, papildoma rankena
create table tool_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  name text not null,                      -- "Baterija 5.0Ah"
  serial_number text,                      -- jei komponentas turi savo SN
  quantity integer not null default 1,
  status text not null default 'ok'
    check (status in ('ok','damaged','lost','replaced')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_components_tool on tool_components (tool_id);

-- komponentų patikra perdavimo metu (checklist)
create table movement_components (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references tool_movements(id) on delete cascade,
  component_id uuid not null references tool_components(id) on delete cascade,
  included boolean not null default true,  -- ar komponentas perduotas kartu
  condition_note text,                     -- "baterija įskilusi"
  unique (movement_id, component_id)
);

-- ---------- 9. NUOTRAUKOS ----------

-- failai laikomi Supabase Storage, čia tik metaduomenys
create table tool_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  movement_id uuid references tool_movements(id) on delete set null,
  repair_id uuid references tool_repairs(id) on delete set null,
  photo_type text not null
    check (photo_type in ('original','checkout','checkin','damage','repair')),
  storage_path text not null,              -- kelias Supabase Storage bucket'e
  taken_by uuid references profiles(id),
  taken_at timestamptz not null default now(),
  notes text
);

create index idx_photos_tool on tool_photos (tool_id, taken_at desc);
create index idx_photos_movement on tool_photos (movement_id)
  where movement_id is not null;

-- ---------- 10. MEDŽIAGŲ ŽODYNAS (normalizacija) ----------

-- kanoninis medžiagos įrašas — viena tiesa apie "kas tai yra"
create table materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  canonical_name text not null,            -- "EPS 100 polistirolas 50mm 1200x600"
  category text,                           -- "šiltinimas", "gipsas", "tvirtinimas"
  base_unit text not null default 'vnt',   -- bazinis vnt., į kurį viskas verčiama
  unit_weight_kg numeric(10,3),            -- 1 bazinio vnt. svoris (pakavimo logikai)
  unit_volume_m3 numeric(10,4),            -- 1 bazinio vnt. tūris
  max_length_m numeric(6,2),               -- ilgiausias matmuo (6m armatūra ≠ busiukas)
  handling text default 'boxed'
    check (handling in ('boxed','pallet','long','crane_only','fragile')),
  notes text,
  created_at timestamptz not null default now()
);

-- visi būdai, kaip šitą daiktą vadina objektai ir tiekėjai
-- (žodynas mokosi: kiekvienas patvirtintas match'as tampa nauju alias'u)
create table material_aliases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  alias text not null,                     -- "polistirolis", "putplastis fasadui"
  source text not null default 'site'
    check (source in ('site','vendor','ai','manual')),
  confirmed boolean not null default false,-- ar žmogus patvirtino AI spėjimą
  unique (org_id, alias)
);

create index idx_aliases_search on material_aliases
  using gin (to_tsvector('simple', alias));

-- pakuočių/vienetų konversijos: 1 lapas = 0.036 m3, 1 pak = 10 vnt
create table material_packages (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  package_name text not null,              -- "lapas", "pak", "rulonas", "m2"
  qty_in_base numeric(14,6) not null,      -- kiek bazinių vienetų viename
  unique (material_id, package_name)
);

-- ---------- 11. POREIKIAI IŠ OBJEKTŲ (prieš užsakymus) ----------

-- objektas rašo laisvu tekstu; tiekimo vadovas + AI verčia į užsakymus
create table material_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references locations(id),
  requested_by uuid not null references profiles(id),
  needed_by date,
  is_hot boolean not null default false,   -- terminas < SLA (skaičiuojama kūrimo metu)
  hot_reason text
    check (hot_reason in
      ('planning_miss',   -- nesuplanavo (sąžiningas prisipažinimas)
       'scope_change',    -- užsakovas/projektas pakeitė sprendimą
       'emergency',       -- avarija, broko taisymas
       'vendor_fail',     -- tiekėjas pavedė su ankstesniu užsakymu
       'weather',         -- oro sąlygų perplanavimas
       'other')),
  status text not null default 'open'
    check (status in ('open','processing','ordered','delivered','cancelled')),
  created_at timestamptz not null default now(),
  check (not is_hot or hot_reason is not null)  -- HOT be priežasties negalimas
);

create index idx_requests_hot on material_requests (org_id, site_id, is_hot)
  where is_hot;

create table material_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references material_requests(id) on delete cascade,
  raw_text text not null,                  -- "polistirolio 2 lapu" — kaip parašė
  material_id uuid references materials(id),        -- AI atpažinta medžiaga
  match_confidence numeric(4,3),           -- 0.000–1.000; žemas → vadovas tvirtina
  qty numeric(12,3),                       -- 2
  unit text,                               -- "lapas"
  base_qty numeric(14,6),                  -- 0.072 (perskaičiuota į base_unit)
  status text not null default 'pending'
    check (status in ('pending','matched','confirmed','ordered','duplicate')),
  flagged_duplicate_of uuid,               -- nuoroda į order_items/request_items,
                                           -- su kuriuo AI aptiko persidengimą
  duplicate_resolution text
    check (duplicate_resolution in ('merged','confirmed_extra','cancelled')),
  order_item_id uuid,                      -- FK į order_items kai užsakyta
  notes text
);



-- užduotis darbuotojui: iš kur paimti, kur nuvežti
-- ---------- 12. UŽSAKYMAI ----------

create table orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  order_number text not null,              -- "BT-2026-0001", generuojamas
  site_id uuid not null references locations(id),
  vendor_id uuid references vendors(id),
  status text not null default 'requested'
    check (status in ('requested','approved','ordered','partially_delivered','delivered','cancelled')),
  requested_by uuid not null references profiles(id),
  approved_by uuid references profiles(id),
  needed_by date,                          -- kada reikia objekte
  bill_to text not null default 'own'
    check (bill_to in ('own','subcontractor')), -- kieno kaštai
  bill_to_vendor_id uuid references vendors(id), -- subrangovas, kuriam persąskaitinama
  quote_id uuid,                           -- laimėjęs pasiūlymas (FK žemiau)
  is_hot boolean not null default false,
  hot_premium numeric(10,2),               -- kiek skuba kainavo brangiau
                                           -- (vs pigiausias pasiūlymas/katalogo kaina)
  promised_delivery_date date,             -- tiekėjo patvirtintas terminas
  confirmed_at timestamptz,                -- kada tiekėjas patvirtino užsakymą
  total_estimate numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, order_number)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  catalog_item_id uuid references vendor_catalog_items(id),  -- jei iš katalogo
  description text not null,               -- "Gipso plokštė 12.5mm"
  quantity numeric(12,3) not null,
  unit text not null default 'vnt',        -- vnt, m2, m3, kg, pak
  unit_price numeric(10,2),
  delivered_quantity numeric(12,3) not null default 0,
  notes text
);

-- ---------- 12b. KAINŲ APKLAUSOS (RFQ) ----------

-- užklausa keliems tiekėjams: "pasiūlykit kainą šioms pozicijoms"
create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  request_number text not null,            -- "BT-RFQ-2026-0005"
  site_id uuid references locations(id),
  material_request_id uuid references material_requests(id), -- iš kurio poreikio
  deadline date,                           -- iki kada laukiam pasiūlymų
  status text not null default 'draft'
    check (status in ('draft','sent','comparing','awarded','cancelled')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, request_number)
);

-- vienas įrašas = vienas tiekėjas vienoje apklausoje
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  status text not null default 'sent'
    check (status in
      ('sent',        -- užklausa išsiųsta el. paštu
       'received',    -- pasiūlymas gautas (AI ištraukė iš atsakymo/PDF)
       'declined',    -- tiekėjas atsisakė / neturi
       'no_response',
       'awarded',     -- laimėjo → tampa užsakymu (orders.quote_id)
       'rejected')),
  total_amount numeric(12,2),
  delivery_days integer,                   -- pasiūlytas terminas
  valid_until date,                        -- pasiūlymo galiojimas
  lines jsonb,                             -- pozicijų kainos (AI parse rezultatas)
  document_path text,                      -- originalus pasiūlymo PDF/laiškas
  received_at timestamptz,
  notes text,
  unique (quote_request_id, vendor_id)
);

create index idx_quotes_request on quotes (quote_request_id, status);

alter table orders
  add constraint fk_orders_quote foreign key (quote_id) references quotes(id);

-- ---------- 13. SANDĖLIO LIKUČIAI (eksploatacinės medžiagos) ----------

-- diskai, grąžtai, varžtai, silikonas — kiekinė apskaita pagal lokaciją
create table stock_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  material_id uuid not null references materials(id),
  location_id uuid not null references locations(id),
  quantity numeric(14,3) not null default 0,
  unit text not null default 'vnt',
  min_quantity numeric(14,3),              -- įspėjimo riba: "baigiasi"
  unique (org_id, material_id, location_id)
);

create index idx_stock_low on stock_items (org_id)
  where min_quantity is not null;

-- kiekvienas likučio pokytis — atskiras įrašas (audit trail)
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  movement_type text not null
    check (movement_type in
      ('receipt',       -- gauta iš užsakymo
       'issue',         -- išduota darbuotojui/objektui
       'transfer_in','transfer_out',
       'adjustment',    -- inventorizacijos korekcija
       'write_off')),
  quantity numeric(14,3) not null,         -- teigiamas arba neigiamas
  order_item_id uuid references order_items(id),   -- jei gauta iš užsakymo
  issued_to uuid references profiles(id),          -- kam išduota
  performed_by uuid not null references profiles(id),
  performed_at timestamptz not null default now(),
  notes text
);

create index idx_stock_movements on stock_movements (stock_item_id, performed_at desc);

-- ---------- 14. PERIODINĖS PATIKROS ----------

-- patikrų grafikas; atliktos patikros registruojamos tool_repairs
-- (repair_type='inspection'/'calibration'), o čia atnaujinama next_due
create table inspection_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  inspection_type text not null
    check (inspection_type in
      ('electrical_safety',    -- varžos patikra
       'lifting_certificate',  -- kėlimo įrangos sertifikatas
       'calibration',          -- matavimo prietaisų kalibravimas
       'general')),
  interval_months integer,                 -- kalendorinis intervalas...
  interval_hours numeric(9,1),             -- ...ARBA motovalandų intervalas
  last_done date,
  last_done_at_hours numeric(9,1),         -- mval. rodmuo atlikimo metu
  next_due date,                           -- priminimas pagal datą...
  next_due_at_hours numeric(9,1),          -- ...ir/arba pagal mval.
  certificate_path text,                   -- galiojantis sertifikatas (Storage)
  notes text,
  unique (tool_id, inspection_type),
  check (interval_months is not null or interval_hours is not null)
);

create index idx_inspections_due on inspection_schedules (org_id, next_due)
  where next_due is not null;



-- ---------- 15. LOGISTIKA (paėmimas / pristatymas) ----------

-- nuosavas transportas
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,                      -- "MAN su fiskaru", "Crafter"
  plate_number text,
  type text not null default 'van'
    check (type in ('van','truck','crane_truck','trailer','other')),
  has_crane boolean not null default false,-- fiskaras — lemia ką gali vežti
  capacity_kg integer,
  capacity_m3 numeric(6,2),
  max_item_length_m numeric(5,2),          -- ar telpa 6m armatūra
  can_carry_pallets boolean not null default true,
  status text not null default 'available'
    check (status in ('available','in_use','in_service','unavailable')),
  created_at timestamptz not null default now()
);

-- užduotis darbuotojui: iš kur paimti, kur nuvežti
create table delivery_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,     -- prekių paėmimas
  tool_id uuid references tools(id) on delete cascade,       -- arba įrankio pervežimas
  assigned_to uuid references profiles(id),
  priority text not null default 'normal'
    check (priority in ('normal','urgent')),  -- skubu = push + viršus sąraše
  created_via text not null default 'planned'
    check (created_via in ('planned','phone_logged','voice')), -- fiksuota post factum
  delivery_method text not null default 'own_vehicle'
    check (delivery_method in
      ('own_vehicle',      -- vežam patys
       'vendor_delivers',  -- atveža tiekėjas (vairuotojo nereikia, tik priėmimas)
       'hired')),          -- samdomas transportas
  vehicle_id uuid references vehicles(id), -- kuria mašina (jei own_vehicle)
  requires_crane boolean not null default false, -- reikia fiskaro?
  est_weight_kg numeric(10,1),             -- paskaičiuota iš eilučių × unit_weight
  est_volume_m3 numeric(10,3),
  pickup_location_id uuid not null references locations(id), -- iš kur (tiekėjo sandėlis)
  dropoff_location_id uuid not null references locations(id),-- kur (objektas)
  scheduled_date date,
  status text not null default 'assigned'
    check (status in ('assigned','picked_up','delivered','cancelled')),
  pickup_document_path text,               -- paėmimo aktas / važtaraštis (foto)
  picked_up_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_delivery_assigned on delivery_tasks (assigned_to, status)
  where status not in ('delivered','cancelled');

-- ---------- 16. REISAI IR KURAS (vairuotojų apskaita) ----------

-- reisas: vairuotojas + mašina + diena; prie reiso prisisieja delivery_tasks
create table vehicle_trips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  odometer_start integer,                  -- km paleidžiant
  odometer_end integer,                    -- km baigiant
  km_total integer generated always as
    (odometer_end - odometer_start) stored,
  notes text
);

create index idx_trips_driver on vehicle_trips (driver_id, started_at desc);
create index idx_trips_vehicle on vehicle_trips (vehicle_id, started_at desc);

-- pristatymo užduotis priskiriama reisui
alter table delivery_tasks add column trip_id uuid references vehicle_trips(id);

-- kuro pylimai
create table fuel_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vehicle_id uuid references vehicles(id),         -- ARBA mašina...
  tool_id uuid references tools(id),               -- ...ARBA technika (generatorius, kranas)
  driver_id uuid references profiles(id),
  filled_at timestamptz not null default now(),
  liters numeric(7,2) not null,
  cost numeric(9,2),
  odometer integer,                        -- rida pylimo metu → l/100km
  receipt_photo_path text,                 -- čekio foto
  notes text,
  check (vehicle_id is not null or tool_id is not null)
);

create index idx_fuel_vehicle on fuel_logs (vehicle_id, filled_at desc)
  where vehicle_id is not null;
create index idx_fuel_tool on fuel_logs (tool_id, filled_at desc)
  where tool_id is not null;

-- ---------- 16b. REZERVACIJOS ----------

-- ateities poreikis: įrankis ARBA mašina konkrečiam laikotarpiui
create table resource_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid references tools(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete cascade,
  reserved_by uuid not null references profiles(id),
  site_id uuid references locations(id),   -- kuriam objektui
  starts_on date not null,
  ends_on date not null,
  status text not null default 'requested'
    check (status in
      ('requested',   -- laukia patvirtinimo (jei konfliktas — vadovas sprendžia)
       'confirmed',
       'fulfilled',   -- įrankis realiai perduotas (susietas judėjimas)
       'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (tool_id is not null or vehicle_id is not null)
);

create index idx_reservations_tool on resource_reservations
  (tool_id, starts_on) where status in ('requested','confirmed');
create index idx_reservations_vehicle on resource_reservations
  (vehicle_id, starts_on) where status in ('requested','confirmed');

-- ---------- 17. STATYBVIETĖS PASLAUGOS (pridėtinės išlaidos) ----------

-- elektra, apsauga, vanduo, internetas, buitis — sutarčių registras pagal objektą
create table site_services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references locations(id),
  service_type text not null
    check (service_type in
      ('electricity','water','security','internet','phone',
       'household_waste',   -- buitinių šiukšlių išvežimas
       'welfare',           -- vagonėliai, WC, kava, buitis
       'other')),
  vendor_id uuid references vendors(id),
  contract_number text,
  monthly_cost_estimate numeric(10,2),
  starts_on date,
  ends_on date,                            -- planuojama pabaiga
  status text not null default 'active'
    check (status in ('planned','active','terminated')),
  notes text,
  created_at timestamptz not null default now()
);

-- objekto uždarymo kontrolei: kas dar "aktyvu" uždarytame objekte
create index idx_services_active on site_services (site_id, status)
  where status = 'active';

-- ---------- 18. STATYBINĖS ATLIEKOS (konteineriai, GPAIS) ----------

create table waste_containers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references locations(id),
  vendor_id uuid references vendors(id),   -- konteinerių nuomotojas/vežėjas
  container_type text,                     -- "7 m3", "12 m3"
  waste_type text not null default 'mixed'
    check (waste_type in ('mixed','concrete','wood','metal','plasterboard','soil','hazardous','other')),
  ordered_at date,
  delivered_at date,
  removed_at date,
  cost numeric(10,2),
  status text not null default 'ordered'
    check (status in ('ordered','on_site','removed','invoiced')),
  notes text
);

create index idx_containers_site on waste_containers (site_id, status);

-- atliekų apskaitos įrašai (GPAIS / lydraščiai)
create table waste_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references locations(id),
  container_id uuid references waste_containers(id),
  waste_code text not null,                -- EWC kodas, pvz. "17 09 04"
  description text,                        -- "mišrios statybinės atliekos"
  weight_kg numeric(10,1),
  removed_at date not null,
  carrier_vendor_id uuid references vendors(id),   -- vežėjas
  receiver_name text,                      -- atliekų tvarkytojas
  manifest_number text,                    -- lydraščio nr.
  gpais_status text not null default 'pending'
    check (gpais_status in ('pending','submitted','confirmed','not_required')),
  document_path text,                      -- lydraštis / pažyma (Storage)
  notes text,
  created_at timestamptz not null default now()
);

create index idx_waste_gpais on waste_records (org_id, gpais_status)
  where gpais_status = 'pending';

-- ---------- 19. VIDINĖS SĄSKAITOS (nuosavi įrankiai → objektai) ----------



-- vidinis kaštų paskirstymas: kiek kiekvienas objektas "sunaudojo" įrankių
create table internal_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  invoice_number text not null,            -- "BT-VID-2026-07-001"
  site_id uuid not null references locations(id),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in ('draft','issued','void')),
  total_amount numeric(12,2),
  pdf_storage_path text,
  created_at timestamptz not null default now(),
  unique (org_id, invoice_number)
);

-- eilutės generuojamos automatiškai iš tool_movements:
-- checkout→checkin trukmė objekte × internal_rate_daily
create table internal_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references internal_invoices(id) on delete cascade,
  tool_id uuid not null references tools(id),
  days_used integer not null,
  rate_daily numeric(10,2) not null,
  amount numeric(12,2) not null,
  period_start date not null,              -- faktinis naudojimo intervalas
  period_end date not null
);

-- ---------- 20. TIEKĖJŲ SĄSKAITOS IR SUTIKRINIMAS ----------

create table vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  invoice_number text not null,            -- tiekėjo sąskaitos nr.
  invoice_date date not null,
  invoice_type text not null default 'rental'
    check (invoice_type in ('rental','materials','purchase','service','utilities','waste')),
  total_amount numeric(12,2) not null,
  file_storage_path text,                  -- originali sąskaita (PDF/foto)
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in
      ('pending','matched','discrepancy','disputed','resolved')),
  created_at timestamptz not null default now(),
  unique (org_id, vendor_id, invoice_number)
);

-- kiekviena sąskaitos eilutė sutikrinama su sistemos faktais
create table vendor_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references vendor_invoices(id) on delete cascade,
  description text not null,               -- kaip parašyta sąskaitoje
  tool_id uuid references tools(id),       -- AI/vartotojo susietas įrankis
  order_id uuid references orders(id),     -- arba užsakymas (medžiagoms)
  site_id uuid references locations(id),   -- kuriam objektui priskirti kaštai
  site_service_id uuid references site_services(id), -- jei tai paslaugos sąskaita
  cost_category text
    check (cost_category in
      ('tools','materials','rental','utilities','security',
       'communications','welfare','waste','transport',
       'operator',       -- mašinistas / operatorius (samdomas)
       'mobilization',   -- technikos atvežimas, montavimas, demontavimas
       'other')),
  -- ką sako sąskaita:
  billed_qty numeric(12,3),
  billed_period_start date,                -- nuomos pradžia pagal sąskaitą
  billed_period_end date,                  -- nuomos pabaiga pagal sąskaitą
  billed_rate numeric(10,2),
  billed_amount numeric(12,2) not null,
  -- ką sako sistema (užpildoma sutikrinimo metu):
  system_period_start date,                -- faktinė nuoma pagal movements
  system_period_end date,                  -- faktinė grąžinimo data
  system_expected_amount numeric(12,2),
  variance_amount numeric(12,2),           -- billed - expected
  line_status text not null default 'pending'
    check (line_status in
      ('pending',            -- dar nesutikrinta
       'matched',            -- atitinka
       'overbilled_period',  -- sąskaitoje ilgesnis laikotarpis nei faktinis
       'overbilled_rate',    -- įkainis didesnis nei sutarta
       'overbilled_qty',     -- kiekis didesnis
       'unknown_item',       -- sistemoje tokio įrankio/užsakymo nėra
       'downtime_deduction', -- nuoma skaičiuota už remonto prastovos dienas
       'accepted')),         -- neatitikimas peržiūrėtas ir priimtas
  notes text
);

create index idx_vinvoice_lines_status on vendor_invoice_lines (line_status)
  where line_status not in ('matched','accepted');
create index idx_vinvoices_recon on vendor_invoices (org_id, reconciliation_status);

-- ---------- 21. PERSĄSKAITINIMAS (sąskaitos subrangovams) ----------

-- paketas buhalterijai: už ką ir kiek išrašyti sąskaitą kitai įmonei
create table recharge_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  counterparty_vendor_id uuid not null references vendors(id), -- subrangovas
  invoice_number text not null,            -- "BT-PS-2026-0007" (vidinis)
  period_start date,
  period_end date,
  status text not null default 'draft'
    check (status in
      ('draft',              -- formuojama
       'approved',           -- vadovo patvirtinta
       'sent_to_accounting', -- perduota buhalterijai
       'invoiced',           -- buhalterija išrašė (accounting_ref užpildytas)
       'cancelled')),
  accounting_ref text,                     -- tikros SF numeris iš buhalterijos
  total_cost numeric(12,2),                -- savikaina
  total_billed numeric(12,2),              -- suma su antkainiu
  export_path text,                        -- CSV/PDF paketas buhalterijai
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, invoice_number)
);

create table recharge_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references recharge_invoices(id) on delete cascade,
  line_type text not null
    check (line_type in
      ('rental',        -- įrankio nuoma subrangovui (dienos × įkainis)
       'materials',     -- perpirktos medžiagos
       'services',      -- paslaugos (transportas, fiskaras ir pan.)
       'lost_tool',     -- negrąžintas/sugadintas įrankis
       'other')),
  description text not null,
  tool_id uuid references tools(id),       -- šaltinis: įrankis
  order_id uuid references orders(id),     -- šaltinis: užsakymas
  qty numeric(12,3),
  unit text,
  cost_amount numeric(12,2) not null,      -- savikaina (be antkainio)
  markup_percent numeric(5,2) not null default 0,  -- 0 = be antkainio
  billed_amount numeric(12,2) not null,    -- cost × (1 + markup/100), redaguojama
  notes text
);

create index idx_recharge_counterparty on recharge_invoices
  (org_id, counterparty_vendor_id, status);

-- ---------- 22. PRISTATYMO NEATITIKTYS ----------

-- atvežė mažiau / ne tą / sugadinta — fiksuojama priėmimo momentu
create table delivery_issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete cascade,
  delivery_task_id uuid references delivery_tasks(id) on delete set null,
  issue_type text not null
    check (issue_type in
      ('short_qty',     -- atvežė mažiau nei užsakyta
       'over_qty',      -- atvežė daugiau
       'wrong_item',    -- ne ta prekė
       'damaged',       -- sugadinta transportuojant
       'quality',       -- kokybės brokas
       'not_delivered')),
  qty_affected numeric(12,3),
  description text,
  photo_path text,                         -- įrodymas priėmimo momentu
  reported_by uuid not null references profiles(id),
  status text not null default 'open'
    check (status in
      ('open',
       'vendor_notified',   -- tiekėjui pranešta (auto el. laiškas)
       'credit_expected',   -- laukiama kreditinės sąskaitos
       'redelivery',        -- laukiama pakartotinio pristatymo
       'resolved',
       'written_off')),
  resolution_note text,
  created_at timestamptz not null default now()
);

create index idx_issues_open on delivery_issues (org_id, status)
  where status not in ('resolved','written_off');

-- ---------- 23. KOMENTARAI IR PAMINĖJIMAI ----------

-- universalūs komentarai prie bet kurio objekto (polimorfinis ryšys)
create table comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null
    check (entity_type in
      ('tool','order','material_request','delivery_task','delivery_issue',
       'vendor_invoice','recharge_invoice','waste_record','site_service',
       'handover_act','tool_repair','reservation')),
  entity_id uuid not null,
  author_type text not null default 'user'
    check (author_type in ('user','ai')),  -- AI atsakymai pažymėti aiškiai
  author_id uuid references profiles(id),  -- null kai author_type='ai'
  check (author_type = 'ai' or author_id is not null),
  body text not null,                      -- @paminėjimai; balso atveju — transkripcija
  photo_path text,                         -- komentaras gali turėti foto
  audio_path text,                         -- PTT balso žinutė (Storage); body = transkripcija
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index idx_comments_entity on comments (entity_type, entity_id, created_at);

-- kas paminėtas — pranešimų pagrindas
create table comment_mentions (
  comment_id uuid not null references comments(id) on delete cascade,
  mentioned_user_id uuid not null references profiles(id) on delete cascade,
  primary key (comment_id, mentioned_user_id)
);

-- pranešimų dėžutė (push + in-app; naudoja ir priminimai, ne tik mentions)
create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null
    check (type in
      ('mention','comment_reply','task_assigned','rental_due','warranty_expiring',
       'inspection_due','reservation_status','delivery_issue','stock_low',
       'reconciliation_alert','system')),
  title text not null,
  body text,
  entity_type text,                        -- gili nuoroda į objektą
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_unread on notifications (user_id, created_at desc)
  where read_at is null;

-- ---------- 23b. VEIKLOS ŽURNALAS (append-only, ginčų pabaiga) ----------

-- kiekvienas veiksmas sistemoje: žmogaus, AI ir sistemos.
-- įrašai NIEKADA neredaguojami ir netrinami (jokių UPDATE/DELETE policy)
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null,               -- 'order','tool','material_request'...
  entity_id uuid not null,
  actor_type text not null
    check (actor_type in ('user','ai','system')),
  actor_id uuid references profiles(id),   -- null kai ai/system
  action text not null,                    -- 'created','status_changed','email_sent',
                                           -- 'ai_drafted','approved','reminder_sent'...
  payload jsonb,                           -- kas konkrečiai: prieš/po, sumos, gavėjai
  created_at timestamptz not null default now()
);

create index idx_activity_entity on activity_log (entity_type, entity_id, created_at desc);
create index idx_activity_actor on activity_log (org_id, actor_type, created_at desc);

-- išsiųsti pranešimai su PRISTATYMO ĮRODYMU (email/SMS provider webhook'ai)
create table outbound_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  channel text not null check (channel in ('email','sms','push')),
  to_address text not null,                -- gavėjo el. paštas / nr.
  subject text,
  entity_type text,                        -- prie ko prisiūta ('order','quote_request'...)
  entity_id uuid,
  sent_by_type text not null check (sent_by_type in ('user','ai','system')),
  sent_by uuid references profiles(id),
  provider_message_id text,                -- Resend/Postmark ID
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','opened','bounced','failed')),
  status_updated_at timestamptz,
  body_storage_path text,                  -- pilna laiško kopija (Storage)
  created_at timestamptz not null default now()
);

create index idx_outbound_entity on outbound_messages (entity_type, entity_id, created_at desc);
create index idx_outbound_status on outbound_messages (org_id, status)
  where status in ('bounced','failed');

-- ---------- 24. RLS (bazinis šablonas) ----------

alter table organizations enable row level security;
alter table plan_limits enable row level security;      -- skaitoma visiems, rašo tik service role
alter table platform_admins enable row level security;  -- nematoma klientams
alter table admin_access_log enable row level security;
alter table memberships enable row level security;
alter table locations enable row level security;
alter table external_persons enable row level security;
alter table site_assignments enable row level security;
alter table tool_categories enable row level security;
alter table tools enable row level security;
alter table tool_movements enable row level security;
alter table handover_acts enable row level security;
alter table vendors enable row level security;
alter table tool_repairs enable row level security;
alter table tool_components enable row level security;
alter table movement_components enable row level security;
alter table tool_photos enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table quote_requests enable row level security;
alter table quotes enable row level security;
alter table internal_invoices enable row level security;
alter table internal_invoice_lines enable row level security;
alter table vendor_invoices enable row level security;
alter table vendor_invoice_lines enable row level security;
alter table recharge_invoices enable row level security;
alter table recharge_invoice_lines enable row level security;
alter table delivery_issues enable row level security;
alter table comments enable row level security;
alter table comment_mentions enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;      -- select visiems org, insert tik per API
alter table outbound_messages enable row level security;
alter table vendor_catalog_items enable row level security;
alter table delivery_tasks enable row level security;
alter table vehicles enable row level security;
alter table vehicle_trips enable row level security;
alter table fuel_logs enable row level security;
alter table resource_reservations enable row level security;
alter table materials enable row level security;
alter table material_aliases enable row level security;
alter table material_packages enable row level security;
alter table material_requests enable row level security;
alter table material_request_items enable row level security;
alter table stock_items enable row level security;
alter table stock_movements enable row level security;
alter table inspection_schedules enable row level security;
alter table site_services enable row level security;
alter table waste_containers enable row level security;
alter table waste_records enable row level security;

-- helper: ar useris priklauso org
create or replace function is_org_member(check_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where org_id = check_org and user_id = auth.uid()
  );
$$;

-- pavyzdinė org lygio policy (įrankiai matomi visiems org nariams)
create policy org_members_all on tools
  for all using (is_org_member(org_id));

-- pavyzdinė objekto lygio policy (finansiniai duomenys tik savo objektų)
create policy site_scoped_read on material_requests
  for select using (is_org_member(org_id) and is_assigned_to_site(site_id));
