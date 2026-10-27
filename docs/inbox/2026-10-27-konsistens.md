# Konsistenskontroll 2026-10-27

Avvikelser mellan dokument och repots faktiska tillstånd (HEAD `c9da692`). Förslag anges, inget är ändrat. Obs: `npm test` kunde inte köras (inga `node_modules`/vitest i sessionen) — testsiffror som `187/187` i BACKLOG/handoff är därför overifierade här.

## 1. Dokument som påstår något koden/andra dokument motsäger

- **`STATUS.md` (rad 3–13) är föråldrad.** Säger "Senast uppdaterad 2026-07-07" och att Ström A/B/C är "redo att starta", att rörelsebaserad detektering "ännu inte [är] verifierad", och att pose är "Horisont (ej schemalagt)". `docs/swingcheck-handoff.md` ("Fungerar", "Ström D — klar och mergad") och `docs/BACKLOG.md` (D-1…D-4 `[x]`, UI-1/2, E-2, S-48, W-1 `[x]`) visar att pose/envelope är primär och fältverifierad, och att strömmarna UI, D, E, W finns. STATUS nämner inte ens dem. Förslag: skriv om STATUS till nuläget eller ta bort "Nuvarande fokus"/"Horisont".
- **`docs/oppna-fragor.md` F1 (rad 28–31) står som ÖPPEN** ("rörelsebaserad detektering … inte verifierad … nästa steg pose"). Handoff säger att pose-envelope är primär väg, fältverifierad på iPhone (14,9 fps), och `frameExtractor.ts` har pose som primär med pixel-diff som fallback. BACKLOG D-3 anger att utfallet skulle skrivas in i `oppna-fragor.md` ("stänger F1-komplexet") — det har inte gjorts. Förslag: stäng/uppdatera F1.
- **`docs/oppna-fragor.md` F2 (rad 33–36)** säger "Supabase-rader har `user_id = null`" och att auth är obeslutat; ROADMAP M5 och BACKLOG Ström B har redan beslutat auth + RLS som G2:s hårda grind (B-1…B-3 är dock `[ ]`; `user_id` finns inte i `src/` utom `lib/supabase.ts`). Förslag: markera F2 som beslutad (ROADMAP M5).
- **`docs/ROADMAP.md` rad 6–8 (Källnot)** säger att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` "inte finns i repot". Filen finns (`docs/reviews/ARCHITECTURE_REVIEW_2026-07.md`, senast ändrad 2026-08-11 enligt git). Förslag: ta bort källnoten och reconcila mot reviewen som noten själv föreslår.
- **`docs/ROADMAP.md` rad 21 ("D-1 pass 1 på `stream-d`")** och beslutsforkarna beskriver D som pågående/ej utvärderad; BACKLOG säger D-2…D-4 klara och mergade. ROADMAP har inte uppdaterats sedan 2026-07-07 (git: sista ändring 2026-08-02). Förslag: ROADMAP-statusrad per milstolpe (se punkt 3).
- **`docs/PLAN.md` (rad 5–8)** anger Routine 1 och 2 som "TBD". Den här kontrollen är i praktiken en sådan routine; beskrivningarna saknas fortfarande. Förslag: fyll i.
- **`docs/BACKLOG.md` rad 5** ger prioritetsordningen "A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2", men D-2/D-3 är klara medan A-3, A-5, C-2, E-1 och hela B fortfarande är `[ ]` — dvs. ordningen följdes inte (ROADMAP:s G1-scopefrys 2026-08-15 gäller M2, som aldrig levererades). Förslag: ny ordningsrad som speglar verkligheten.

## 2. Uppgifter markerade klara vars acceptanskriterier inte kan verifieras

- **D-3 `[x]` (`docs/BACKLOG.md` rad 505–527).** Acceptansen är ≥ 80 % av 20 klipp inom ±150 ms. Uppgiften medger själv att den gjordes på 3 klipp + enhetstester, och att 20-klippsutvärderingen "ersätts" av `path`-loggen. Ingen sammanställd fältdata över pose-vs-motion-frekvens finns i `docs/pose-detection.md` eller `docs/`; ROADMAP beslutsfork 1 har inget utfall inskrivet. Förslag: antingen `[~]` med återstående mätning, eller skriv in faktisk fallback-frekvens från loggarna.
- **UI-1 `[x]` (`docs/BACKLOG.md` rad 37).** Handoff: "Ej enhetsverifierad" (`design-system.md` → Kända avgränsningar). Om iPhone-rendering ingår i acceptansen är den inte uppfylld.
- **W-1 `[x]` (rad 1138–1190).** Acceptansen innehåller "appen oförändrad i prod med `cache_read_input_tokens` > 0". Uppgiften säger själv att deploy, D1-migrering och den kontrollen är "kvar för Erik". Koden/testerna täcker resten (`worker/worker.test.ts` finns, pinning/origin i `worker/worker.ts`), men prod-kriteriet är inte belagt i något dokument. Förslag: `[~]` tills Erik bekräftat, eller notera bekräftelsen.
- **Testsiffror** (`187/187` i W-1, `149/149` i handoff): kunde inte reproduceras (se ovan). Handoff och BACKLOG anger olika tal utan datum på den senare.

## 3. Milstolpar i ROADMAP.md vars måldatum passerat utan statusändring

(`docs/PLAN.md` innehåller inga milstolpar eller datum. Datumen ligger i `docs/ROADMAP.md`; dagens datum 2026-10-27.)

- **Beslutsfork 1, `docs/ROADMAP.md` rad 77: "D-3 fältkörd senast 2026-07-31"** — passerat med ~3 månader. D-3 har gjorts på 3 klipp (se ovan); ingen F-1 (trim-slider) skapad i BACKLOG, inget utfall inskrivet. Förslag: besluta uttryckligen (pose behålls på fältdata / F-1 startas) och skriv in.
- **Beslutsfork 2, rad 80: "G1-scopefrys senast 2026-08-15"** — passerat ~10 veckor. M2-metriken (≥ 18/20 hands-free) är inte mätt: A-3, A-5 och C-2 är `[ ]`, `swingStartTimestamp` finns inte i koden. Ingen frysning dokumenterad, samtidigt som G1-liknande arbete (UI-2, S-48, kameraläge) pågått efter datumet. Förslag: antingen flytta datumet eller dokumentera att frysen passerats utan M2.
- **M1–M6 saknar statusfält helt.** M3 (E-1, `[ ]`, ingen långsida-cap i `frameExtractor.ts`) och M5/M6 (B/G2 `[ ]`) har inga måldatum men är i praktiken eftersatta mot ordningen i ROADMAP; ändå står inga milstolpar som "pågår/klar". Förslag: lägg in status per milstolpe.
