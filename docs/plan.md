# BravoTools — įgyvendinimo planas v1.0

2026-07-11 · Schema v1.0 užšaldyta (35 lentelės) · Pilotas: Sivysta

## Architektūros sprendimas: offline

Lauko aplikacijos kasdienis ciklas — QR skenavimas, komplektacijos patikra, foto, parašas — privalo veikti rūsyje be ryšio. Tai pagrindinis sprendimo kriterijus.

**Sprendimas: Expo (React Native) lauko aplikacijai + Next.js web dispečerio pultui.**

Kodėl ne PWA: iOS įrenginiuose PWA kamera, push pranešimai ir background sync yra nestabilūs ir apriboti — o push pranešimai (nuomos terminai, patikros, užduotys vairuotojams) yra ne priedas, o produkto nervų sistema. Migracija iš PWA į native vėliau kainuotų daugiau nei native nuo pradžių. Expo su TypeScript ir Supabase yra artimas jau turimam stack'ui, o Claude Code jį valdo puikiai.

Offline mechanika: lokali SQLite (expo-sqlite) + outbox pattern — visi veiksmai rašomi lokaliai su UUID, siunčiami į Supabase kai atsiranda ryšys. Konfliktai reti (judėjimai yra append-only įvykiai, ne redagavimai), tad last-write-wins pakanka.

Web pultas (tiekimo vadovui, admin): Next.js + Supabase, online-only — vadovas sėdi prie ryšio.

## Stack santrauka

| Sluoksnis | Pasirinkimas |
|---|---|
| Mobile (lauko) | Expo / React Native, TypeScript, expo-sqlite |
| Web (pultas) | Next.js, Vercel |
| Backend | Supabase (Postgres, Auth, Storage, RLS) |
| AI | Anthropic API: medžiagų matching, sąskaitų OCR/parse, pasiūlymai |
| PDF (aktai, sąskaitos) | serverio pusė, react-pdf |
| Žemėlapis | Leaflet + OSM |
| QR | expo-camera + lipdukų generavimas (PDF lapais) |

## Realizacijos principai (nuo pirmos kodo eilutės)

**1. Zero hardcode / i18n-first.** Bazinė kalba — anglų: visi raktai ir
kodas EN, vertimai JSON failuose (`en.json` — šaltinis, `lt.json` — pirmas
vertimas). Kiekvienas UI tekstas tik per `t('key')` — jokių string'ų
komponentuose. Įrankiai: next-intl (web) + i18next (Expo), bendras
`packages/i18n` paketas monorepe. DB statusai lieka EN enum'ai (schema jau
tokia) — verčiami tik UI sluoksnyje. Datos/valiutos per `Intl` pagal
`profiles.locale`. Dokumentų šablonai (aktai, sąskaitos) — irgi lokalizuoti,
kalba pagal org nustatymą. BravoBIM pamoka: i18n disciplina nuo 1 dienos,
ne gaudymas agentu po metų.

**2. Design tokens / zero hardcoded styles.** Jokių spalvų, šriftų ar
tarpų komponentuose — viskas per tokens (`packages/theme`): web'e CSS
variables + Tailwind config iš tokens, Expo — theme objektas per context.
Komponentai žino tik `--color-primary`, ne `#F5B301`. Temos apibrėžimas —
JSON, saugomas platformos lygyje: super admin gali keisti temą ar priskirti
org'ui alternatyvią (enterprise white-label ateityje) be jokio deploy.
Klientas temų nevaldo — valdo tik super admin.

**3. Monorepo (Turborepo):** `apps/mobile` (Expo) · `apps/web` (pultas) ·
`apps/admin` (super admin) · `packages/i18n` · `packages/theme` ·
`packages/db` (iš Supabase generuoti TypeScript tipai — schema yra vienintelis
tiesos šaltinis, tipai niekada nerašomi ranka).

## Etapas 1 — Įrankių ašis (mėn. 1)

Tikslas: Sivysta realiai seka įrankius. Kasdienė vertė be jokio AI.

- Auth, organizacija, rolės, darbuotojų pakvietimas
- Įrankių registras + **Excel importas** (onboardingo kritinė dalis)
- QR lipdukų generavimas ir spausdinimas lapais
- Skenavimas → perdavimas: komplektacijos checklist, foto, GPS
- Aktų generavimas (PDF) su parašais ekrane
- „Pas mane" ekranas darbuotojui; sąrašas + filtrai + žemėlapis vadovui
- Offline outbox skenavimo įvykiams
- Push: nuomos grąžinimo terminai

**Sėkmės kriterijus:** Sivysta darbuotojai patys skenuoja be raginimo 2 savaites iš eilės.

## Etapas 2 — Tiekimo srautas (mėn. 2)

Tikslas: poreikis iš objekto virsta užsakymu be popieriaus.

- Poreikiai laisvu tekstu + balso žinute (transkripcija → AI parse)
- Medžiagų žodynas: AI matching su confidence, vadovo patvirtinimas mokosi
- Dispečerio pultas (web): poreikių eilė, grupavimas, AI pasiūlymai
- „Pirmiausia savas sandėlis" patikra prieš perkant
- Užsakymo PDF/CSV generavimas → el. paštu tiekėjui, terminų sekimas
- Pristatymo užduotys vairuotojams: maršrutas, važtaraščio foto, reisai
- Sandėlio likučiai + min. ribos įspėjimai

**Sėkmės kriterijus:** ≥80% poreikių pereina per sistemą, ne per telefoną.

## Etapas 3 — Pinigų sluoksnis (mėn. 3)

Tikslas: produktas pats įrodinėja ROI kas mėnesį.

- Sąskaitų įkėlimas (foto/PDF) → AI eilučių ištraukimas → sutikrinimas
  su faktiniais judėjimais (permokos, terminai, nežinomi įrašai)
- Kaštų priskyrimas objektams ir kategorijoms; objekto kaštų vaizdas
- Vidinės sąskaitos už nuosavus įrankius (mėn. generavimas)
- Statybvietės paslaugos + objekto uždarymo checklist'as
- Atliekų registras (konteineriai, lydraščiai, GPAIS statusai)
- **Mėnesio ataskaita: „BravoTools sutaupė X €"** — permokos, laiku
  grąžintos nuomos, panaudoti likučiai, nuoma-vs-pirkimas patarimai
- Periodinių patikrų grafikas ir priminimai

**Sėkmės kriterijus:** pirmoje mėnesio ataskaitoje sutaupyta suma > licencijos kaina.

## v2 backlog (sąmoningai NE dabar)

GPAIS API integracija · tiekėjų katalogų API/CSV sync · kainų palyginimo
automatika · telematika (Teltonika API) · buhalterijos eksportas
(Rivilė/Finvalda) · bendras tarp-įmoninis medžiagų žodynas ·
nusidėvėjimo apskaita · klientų API

## Ekosistemos idėjos (atskiri produktai, ne BravoTools moduliai)

- **BravoSafe** — darbų sauga: instruktažai su parašais, AAP išdavimas,
  incidentai, pavojingų darbų leidimai, VDI dokumentacija. Sąlyčio taškas:
  be galiojančio instruktažo negalima pasirašyti įrankio priėmimo.
  ~40% perpanaudoja BravoTools šablonus (aktai, perdavimai, patikros).
- **BravoCrew** — darbo jėgos planavimas: brigadų kalendorius tarp objektų,
  poreikiai ("4 mūrininkai kitą savaitę"), remiasi site_assignments.
  Principas: BravoTools valdo daiktus ir jų pinigus, žmonės — atskiras
  produktas su savo reguliaciniu lauku (DK, tabeliai, grafikai).
- Vardų/ženklo pastaba: "BravoCon" netinka (EN "con" = apgavystė + Bravo TV
  renginio prekės ženklas). Kandidatai šeimai: Bravo Suite / BravoWorks /
  tiesiog "Bravo" ekosistema. Prieš fiksuojant — EUIPO paieška.

## Kaip statome: SaaS + app + AI (build blueprint)

### Repo skeletas (diena 1)
```
bravotools/
  apps/
    mobile/        # Expo (field app: Radio, Tools, Orders, My)
    web/           # Next.js (dispatcher pult + client admin)
    admin/         # Next.js (super admin, service role)
  packages/
    db/            # Supabase migracijos + generuoti TS tipai
    i18n/          # en.json (šaltinis), lt.json
    theme/         # tokens.json → Tailwind config + RN theme
    ui/            # etaloniniai komponentai (Tag, Stamp, PTTButton...)
    ai/            # promptai, tool definitions, parse schemos
  CLAUDE.md        # ~10 kietų taisyklių agentams
  DESIGN.md        # Industrial Precision draudimai ir etalonai
```

### AI sluoksnis — visas serverio pusėje
Mobile/web NIEKADA nekviečia Anthropic API tiesiogiai — tik savo backend
(Next.js API routes / Supabase Edge Functions). Priežastys: API raktai,
rate limiting per org (plano limitai!), promptų versijavimas, ir kiekvieno
AI veiksmo įrašymas į activity_log.

Penki AI darbai, kiekvienas — atskiras endpoint'as su savo promptu
packages/ai kataloge:
1. **voice-parse**: audio → Whisper transkripcija → Claude structured
   output (poreikio juodraštis su material match + confidence)
2. **radio-answer**: klausimas → Claude su tool use (read-only užklausos
   į Supabase: tools, orders, stock) → atsakymas; geležinė taisyklė:
   nežinai → eskaluok žmogui, niekada nespėliok
3. **invoice-parse**: PDF/foto → eilutės → match su orders/movements →
   sutikrinimo verdiktai (permokos, prastovos, dubliai)
4. **dedup-check**: naujas poreikis → palyginimas su atvirais
   (material_id + base_qty + laiko langas) → žmogiškas klausimas balsu
5. **daily-digest**: dėmesio eilės rikiavimas + mėnesio čekio generavimas

Kiekvienas AI veiksmas → activity_log su actor_type='ai' ir payload.
AI niekada nesiunčia nieko į išorę be žmogaus patvirtinimo.

### Startas (savaitė po savaitės)
- **S1**: repo + tvoros (tokens, eslint, CLAUDE.md, DESIGN.md) →
  Supabase projektas → schema v1.6 migracijomis → RLS testai →
  auth + org + Excel importas
- **S2**: Tools registras + QR lipdukai + checkout/checkin + aktas PDF →
  pirmas TestFlight/APK Sivystai
- **S3**: offline outbox + push + "My responsibility" + gyvi lipdukai
  ant Sivystos įrankių — **1 etapo pabaiga**
- **S4–6**: Radio (PTT → voice-parse → juodraštis), žodynas mokosi iš
  patvirtinimų, dispečerio pultas (dėmesio eilė + tanki lentelė),
  delivery tasks vairuotojams
- **S7–9**: invoice-parse + sutikrinimas + mėnesio čekis + site
  services — pirmoji "SAVED €" ataskaita

### Kokybės tvoros (CI, visos privalomos)
tokens-only stiliai · t()-only tekstai · generuoti DB tipai (diff=fail) ·
i18n raktų pilnumas · RLS testai kiekvienai lentelei · naujas dependency
= manual approve · schema keičiama tik migracijų failais

### Infrastruktūros kaina (startas)
Supabase Pro ~$25 + Vercel ~$0–20 + Resend ~$0 + Anthropic API pagal
naudojimą (~$30–80/mėn pilote, Haiku/Sonnet mix: voice-parse ir dedup —
Haiku, invoice-parse ir radio-answer — Sonnet) + Expo EAS $0–19.
Viso: <150 €/mėn iki pirmų mokančių klientų.

## Rizikos

1. **Darbuotojų adopcija** — viskas lūžta, jei skenuoti tingima.
   Atsakas: srautas ≤30 sek., „pas tave už X €" atsakomybės efektas,
   Sivysta vadovybės mandatas pilotui.
2. **Solo dev + trys produktai** (BravoBIM, PLANASNAMAS agentai, BravoTools).
   Atsakas: etapas = mėnuo, po kiekvieno — veikiantis produktas, kurį
   galima pauzuoti nepraradus vertės.
3. **Medžiagų žodyno šaltas startas** — pirmi matching'ai bus prasti.
   Atsakas: 2 etape žodynas pildosi iš Sivystos realių poreikių su
   žmogaus patvirtinimu; AI tik siūlo.
