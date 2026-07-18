# Kitos sesijos darbai (užfiksuota 2026-07-18 vakare)

## 1. BUG (P0): telefonas negauna naujo JS bundle

Simptomai iš realaus įrenginio:
- Po pradinio parsisiuntimo (905 moduliai, SDK 54) telefonas gaudavo tik
  pavienius HMR patch'us; nuo 22:40 nebegavo NIEKO.
- Vartotojas teigia darė pilną Expo Go uždarymą + atidarymą per exp:// —
  Metro loge NEATSIRADO naujo pilno bundle request'o, o UI požymiai
  (nėra parašų skaitliuko, nėra pass-phone ekrano) rodo seną kodą.
- Hipotezės tikrinimui: (a) Expo Go bundle cache — bandyti su
  `npx expo start --clear`; (b) CI=1 režimas gali trukdyti dev session
  registracijai — paleisti Metro be CI; (c) galimai telefonas jungiasi prie
  KITO Metro proceso/porto likučio; patikrinti ar 8081 klauso tik vienas;
  (d) Expo Go „Recently opened" gali atidaryti seną manifest cache — atidaryti
  per QR su pridėtu cache-buster.
- Dėl šito realiai NEPATIKRINTA, ar parašų vertikalės fix'ai
  (dcf223c „be ScrollView", 9a37605 stroke race) veikia — spręsti tik
  užsitikrinus, kad įrenginys vykdo naujausią kodą (požymis: skaitliukas
  `X / Y` po parašo lauku).

## 2. Įrankio kortelėje nerodomos nuotraukos

Savininko pastaba: kortelėje (mobile ir web detalėje) nesimato įrankio
nuotraukų. Duomenys YRA (tool_photos + storage bucket tool-photos; realaus
perdavimo foto įkeltos sėkmingai), bet UI jų niekur nerodo.
SPEC 2.3 numato „photo hero" — įgyvendinti:
- web detalė: hero nuotrauka + perdavimų foto galerija prie judėjimų;
- mobile kortelė: paskutinė nuotrauka viršuje;
- signed URL helper'is (bucket'ai private).

## 3. ADR-015: nuotolinis gavėjo parašas (žr. docs/decisions/015)

Perdaryti 2.4 srautą: initiate_handover + countersign_handover,
pending_signatures būsena, push gavėjui (prisitraukia SPEC 2.7 push
infrastruktūra), „laukia tavo parašo" sąrašas. Išoriniams asmenims kol kas
lieka on-device parašas.

## Fonas

- Web dev :3100, Metro :8081, Supabase 55321-55324 — visi paleisti fone.
- Paskutinis commit: žr. git log (pass-phone interstitial jau įdėtas, bet
  pagal ADR-015 liks tik external atvejui).
