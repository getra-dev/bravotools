# ADR-015: Receiver signs on their OWN phone (remote signature)

Data: 2026-07-18 · Statusas: NUSPRĘSTA (savininkas), keičia SPEC 2.4 vieno įrenginio srautą

## Sprendimas

Perdavimo aktas NE pasirašomas paduodant vieną telefoną iš rankų į rankas.
Srautas:

1. Perduodantis inicijuoja perdavimą savo telefone: gavėjas, komplektacija,
   foto, GPS — ir pasirašo TIK savo parašą.
2. Aktas sukuriamas su statusu `pending_signatures` (schema jau palaiko).
3. Gavėjas gauna push pranešimą SAVO telefone (SPEC 2.7 push infrastruktūra),
   atsidaro aktą SAVO paskyroje, peržiūri ką priima (įrankis, komplektacija,
   nuotraukos) ir pasirašo savo įrenginyje.
4. Po antro parašo aktas tampa `signed`, generuojamas PDF.

## Kodėl

Savininko UX pastaba iš realaus bandymo: telefono padavinėjimas svetimam
žmogui yra nenatūralus ir nesaugus (svetima paskyra atrakinta jo rankose);
parašas savo paskyroje turi ir stipresnę įrodomąją vertę (aišku, KAS
pasirašė, nes autentifikuotas).

## Atviri klausimai (savininkui)

- **Išoriniai asmenys (subrangovai) paskyros NETURI.** Variantai:
  a) jiems lieka pasirašymas ant perduodančiojo telefono (hibridas);
  b) token-nuoroda SMS/el. paštu į pasirašymo puslapį (kaip client-portal
     pattern; reikalauja ryšio);
  c) subrangovo brigadininkui kuriama mini-paskyra.
  Siūlymas: (a) dabar, (b) vėliau kartu su Etapo 2 portalu.
- **Offline kampas:** kai gavėjas be ryšio, aktas kabo `pending_signatures`
  — reikia priminimo push + „laukia tavo parašo" sąrašo app'e (dera su 2.5
  „My responsibility" ekranu).

## Įgyvendinimo būsena (2026-07-19)

ĮGYVENDINTA: initiate_handover + countersign_handover (0010), pending
sąrašas „Pas mane" ekrane su realtime atnaujinimu, countersign peržiūros
ekranas (komplektacija, nuotraukos, pastabos, parašas savo sesijoje).
PUSH PASTABA: tikri push pranešimai per Expo Go NEGALIMI be EAS projekto
(getExpoPushTokenAsync reikalauja projectId) — o EAS draudžiamas iki
ADR-014 promotion gate. Iki tol: in-app pranešimai + supabase realtime
(veikia atidarius app'ą). Fizinis push įsijungs kartu su dev build'ais
po gate (SPEC 2.7).

## Pasekmės

- `perform_handover` skaidomas į `initiate_handover` (giver parašas) ir
  `countersign_handover` (receiver parašas savo sesijoje).
- Reikalinga notifications lentelė (yra) + Expo push tokens (SPEC 2.7 —
  prisitraukia anksčiau).
- Pass-the-phone tarpinis ekranas (commit dcf223c → 9a37605 era) lieka tik
  external-asmenų atvejui.
