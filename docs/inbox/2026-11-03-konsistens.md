# Konsistenskontroll 2026-11-03

Rutinkörning mot repots tillstånd (HEAD c9da692, senaste commit 2026-10-23). Endast avvikelser. Inga ändringar gjorda i PLAN/ROADMAP/BACKLOG. **Begränsning:** `npm test` kunde inte köras (`node_modules` saknas i miljön) — testresultat är därför inte använda som underlag.

## 1. Dokument som påstår något koden/repot motsäger

**STATUS.md (rad 3–13) — föråldrad sedan 2026-07-07.** Säger "Tre isolerade strömmar redo att starta" (A, B, C) och att pose är "Horisont (ej schemalagt)" som fallback. Verkligheten enligt BACKLOG/handoff/kod: C-1, UI-1/2, D-1…D-4, E-2, W-1 och S-48 är klara; D-5 är `[~]`; envelope-pose är produktionens *primära* frame-selektor (`frameExtractor.ts` → `selectViaPose`), pixel-diff är fallback. A-3, A-5, B-1…B-3, C-2 är fortfarande `[ ]`. *Förslag:* skriv om "Nuvarande fokus" mot BACKLOG, flytta pose ur "Horisont", sätt nytt datum.

**docs/ROADMAP.md (rad 5–7, källnoten) — säger att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` inte finns i repot.** Filen finns nu (`docs/reviews/ARCHITECTURE_REVIEW_2026-07.md`). *Förslag:* ta bort noten och gör den reconciliation noten ber om.

**docs/ROADMAP.md (M4, rad "CC-pass: D-2 … D-3 (utvärdering + beslut)", fork 1) vs docs/BACKLOG.md D-3.** ROADMAP beskriver D-2 som självhost + `posePhases` och D-3 som 20-klipps utvärdering. BACKLOG:s D-3 är i stället *cutover* (envelope som primär väg), `posePhases.ts` finns inte längre (ersatt av `poseEnvelope.ts`, ADR-002) och utvärderingen är markerad "ej byggt". ROADMAP är inte uppdaterad efter det. *Förslag:* notera ADR-002/D-3-cutover under M4 och fork 1.

**docs/ROADMAP.md (rad 11, 17) — "D-1 pass 1 på `stream-d`", "A-1/A-2, C-1 mergade".** Repot har bara `main` + arbetsbranch; strömmarna är mergade till main via PR #21/#22. Mindre avvikelse, samma rotorsak som ovan.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**BACKLOG D-3 `[x]` (rad 505–527).** Acceptans: "≥ 80 % inom ±150 ms" på 20 klipp. Ingen resultattabell finns (`docs/pose-detection.md` krävdes enligt dokumentkravet); BACKLOG medger själv att cutovern gjordes på 3 klipp. Kriteriet är inte uppfyllt eller mätt — uppgiften är i praktiken avvikande-stängd, inte acceptans-uppfylld. *Förslag:* ändra till `[~]` med "metrik ej mätt; ersatt av path-logg" eller formellt ersätt kriteriet.

**BACKLOG D-2 `[x]` (rad 329–).** Acceptans kräver "posePhases ger fyra timestamps", "enhetstest på platå-/vändpunktslogik" och "noll jsDelivr-requests offline". `lib/posePhases.ts` är borttagen (ersatt av `poseEnvelope.ts`, vars tester finns). Självhostningen är verifierbar i kod (`scripts/copy-pose-wasm.mjs`, `vite.config.ts` precache, ingen jsDelivr-referens i `src/`), men *offline-beviset* finns bara som påstående. *Förslag:* skriv in att acceptansen ändrats av ADR-002 och peka på vilket test/vilken logg som bevisar offline-körning.

**BACKLOG UI-1 `[x]` (rad 37) vs docs/swingcheck-handoff.md ("Ej enhetsverifierad").** Handoff säger att Club Cream inte är enhetsverifierad; om UI-1:s acceptans innehåller visuell verifiering på enhet är den inte uppfylld. *Förslag:* förtydliga i UI-1 vad som är verifierat.

## 3. Milstolpar/beslutsdatum i ROADMAP som passerat utan statusändring

PLAN.md innehåller inga milstolpar eller datum (bara routine-beskrivning; båda routines är fortfarande "TBD"). Datumen bor i ROADMAP.md:

- **Beslutsfork 1: 2026-07-31** (D-3 fältkört/metrik, annars F-1 trim-slider). Passerat med 95 dagar. D-3 stängdes 2026-08-05 utan metriken; F-1 (trim-slider) finns inte i BACKLOG och beslutet "pose degraderas till overlay" är varken fattat eller avfört. *Förslag:* dokumentera utfallet i ROADMAP (datum + beslut).
- **Beslutsfork 2: G1-scopefrys 2026-08-15** (M2-metrik 18/20 eller "tillräckligt bra"-bedömning). Passerat med 80 dagar; A-3, A-5 och C-2 är alla `[ ]` och ingen M2-mätning/frysning är noterad. Samtidigt har icke-planerat G1-arbete tillkommit (D-5, UI-1/2, E-2, S-48). *Förslag:* avgör och logga frysning, eller flytta datumet.
- **M1 (A-3), M3 (E-1), M5 (B-1…B-3) och M6** — inga har statusändring. E-1 är `[ ]` trots "körs nu, villkorslöst" (fork 3), medan E-2 byggts före den. BACKLOG:s ordning (rad 5: "A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2") följs inte. *Förslag:* ROADMAP bör få ny prioritetsordning eller en rad om varför planen avvikits.
- **ROADMAP-sidhuvud "2026-07-07" och fork-regeln "uppdatera när en beslutsfork avgörs"** — D-3-cutovern avgjorde i praktiken fork 1, men filen är orörd sedan dess.
