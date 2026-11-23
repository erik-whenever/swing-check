# Konsistenskontroll 2026-11-23

Underlag: `main` @ `c9da692` (senaste commit 2026-10-23). `npx vitest run` 206/206 gröna (17 filer). `tsc -b` rent. `eslint .` ger 28 problem (20 fel, 8 varningar). `npm ci` **misslyckas**. 11 `// OSÄKER:` i `src/lib/`.
Inga dokument har ändrats sedan förra körningen (2026-10-31, branch `claude/konsistens-2026-10-31`, ej mergad), så de fynden står kvar. De upprepas kort nedan. Fynd märkta **NYTT** är nya i dag.

## 1. Dokument som påstår något koden motsäger

**NYTT: `package-lock.json` saknar `@fontsource/outfit`.** `package.json` fick beroendet i `61a0b46` (UI-1, 2026-08-10), men låsfilen uppdaterades aldrig. `npm ci` avbryter med `EUSAGE … Missing: @fontsource/outfit@5.3.0 from lock file`. BACKLOG UI-1 (rad 37 ff.) och handoff säger "build ren", men en ren CI-/deploy-installation fungerar inte. Förslag: kör `npm install`, committa låsfilen och verifiera med `npm ci && npm run build`.

**NYTT: handoff, miljövariabeltabellen: `MAX_TOKENS` "Default 2000".** I koden är `DEFAULT_MAX_TOKENS = 4096` (`worker/worker.ts:23`) och `worker/wrangler.toml:33` sätter 4096. Förslag: ändra till 4096 i tabellen.

**NYTT: handoff, *Säkerhetsmodell* punkt 3: "quick mode skickar 600".** Sedan S-48 beräknar `maxTokensFor()` taket (`src/lib/api.ts:34`), quick som `200+120·n`. Ingen fast 600 finns kvar. Förslag: ersätt med en hänvisning till `maxTokensFor` och taket 4096.

**NYTT: BACKLOG W-1 (rad ~1170), "Kvar för Erik: sätt `ALLOWED_ORIGINS` till prod-origin".** Det är redan gjort i `worker/wrangler.toml:25` (`619e586`). Värdet har ett avslutande `/`, vilket `worker.ts:103` tolererar. Förslag: bocka av delsteget. D1-migreringen och `cache_read`-kontrollen efter deploy går inte att verifiera från repot.

**NYTT: batchad fjärrloggning för native-byggen (`b3e217f`, `src/lib/logger.ts`, `worker/worker.ts`) är odokumenterad.** Handoff, BACKLOG och STATUS nämner varken native-byggen eller den nya logg-vägen. Branchen `stream-native` finns på origin men saknas i BACKLOG. Kommentaren i `worker.ts:72` ("native build's origin must be added to ALLOWED_ORIGINS") syns inte i handoffens miljövariabeltabell. Förslag: lägg in en BACKLOG-post (eller en strömrubrik) och en rad i handoffen.

**NYTT: handoff och BACKLOG anger lint som "ren".** Flera poster (E-2, impact-grind, fasklustring m.fl.) skriver "build + lint rena", men `eslint .` ger 20 fel. UI-2 redovisar ärligt "28 problem, identiskt med baslinjen", så "ren" betyder i praktiken "0 nya". Förslag: skriv "lint: 0 nya (baslinje 28)" konsekvent, eller åtgärda baslinjen.

**Kvarstår: STATUS.md (daterad 2026-07-07) är föråldrad.** Där står att A/B/C är "redo att starta" och pose ligger under "Horisont". Pose/envelope är primär selektor (`frameExtractor.ts:154`, `selectViaPose`). Förslag: skriv om filen eller gör den till en ren pekare.

**Kvarstår: ROADMAP.md, källnoten om att `ARCHITECTURE_REVIEW_2026-07.md` "inte finns i repot".** Filen finns i `docs/reviews/`, och BACKLOG W-1 och handoffen länkar till den. Förslag: stryk källnoten och reconcila mot reviewen.

**Kvarstår: BACKLOG D-2 och `docs/pose-detection.md` hänvisar till `src/lib/posePhases.ts` och `poseFrameSelection.ts`.** Ingen av filerna finns. De har ersatts av `poseEnvelope.ts` och `poseEnvelopeSelection.ts`. Förslag: markera avsnitten som ersatta.

**Kvarstår: ADR-filerna ligger i två kataloger.** ADR-0001 ligger i `docs/adr/`, ADR-002 och ADR-003 i `docs/decisions/`. CLAUDE.md pekar bara på `docs/adr/`. Förslag: välj en katalog.

**Kvarstår: docs/PLAN.md beskriver båda nattliga routines som "TBD".** Den här routinen körs redan. Förslag: fyll i beskrivningen.

**Kvarstår: handoffen anger senaste testsiffran som 187/187.** Det verkliga antalet är 206/206. Ingen motsägelse i sak, bara inaktuell siffra.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**Kvarstår: D-3 (BACKLOG rad 505) är `[x]`.** Acceptansen (≥ 80 % av 20 klipp inom ±150 ms) mättes aldrig. Avvikelsen är dokumenterad, men `docs/oppna-fragor.md` F1 är fortfarande öppen, fast D-3 krävde att den stängdes. Ingen fält-fallbackstatistik (`path`-loggen) finns redovisad. Förslag: stäng F1 med cutover-beslutet och lägg in fallback-frekvensen när den finns.

**Kvarstår: D-2 (rad 329) är `[x]` men texten börjar "Delvis (Pass 2, del b klar)".** Leveransfilerna finns inte heller (se kategori 1). Förslag: markera `[~]`/ersatt, eller skriv om rubriktexten.

**Kvarstår/förtydligat: W-1 är `[x]`, men acceptansen "appen oförändrad i prod med `cache_read_input_tokens` > 0" kräver en deploy.** Ingen deploy är bekräftad i repot, och S-48 säger uttryckligen att prod-Workern inte är deployad. Förslag: bekräfta deploy och notera datum i W-1 och S-48.

**Kvarstår: E-2 är `[x]`, men handoffen säger att beskärningen inte är fältverifierad efter att aspektlåset togs bort.** Förslag: gör "fältverifierad" till ett explicit acceptanskriterium, eller markera `[~]`.

## 3. Milstolpar i PLAN.md vars måldatum passerat utan statusändring

PLAN.md innehåller inga milstolpar med datum. De daterade målen finns i ROADMAP.md och rapporteras här som närmaste motsvarighet.

**ROADMAP beslutsfork 1: "D-3 fältkörd senast 2026-07-31".** Datumet passerade för snart 4 månader sedan. Ingen beslutsnotering finns i ROADMAP, trots instruktionen "uppdatera när en beslutsfork avgörs", och ingen F-1 (trim-slider) finns i BACKLOG. Förslag: skriv in utfallet (cutover 2026-08-05) med datum i forken.

**ROADMAP beslutsfork 2: "G1-scopefrys senast 2026-08-15".** Passerat. A-3 och A-5 är fortfarande `[ ]`, och koden saknar `swingStartTimestamp`/`voiceStartEnabled`. M1 och M2 har alltså inte nåtts. Ny G1-funktionalitet har ändå lagts till efter datumet (S-48, native-loggning). Förslag: dokumentera att frysen skjutits upp eller förkastats.

**ROADMAP-rubriken och STATUS är båda daterade 2026-07-07.** M3 (E-1, "körs nu, villkorslöst") och M5 (B-1–B-3) har inte rört sig. `frameExtractor.ts:133` har fortfarande bredd-cappen 1280. Förslag: uppdatera sekvenseringen eller prioritera om explicit.

## `// OSÄKER:`-markeringar

11 st i `src/lib/` (`videoChunkRing`, `livePoseLoop`, `poseEnvelope`, `poseDetector`, `poseTrajectory`). Inga motsägs av dokumenten och alla är öppna, i väntan på fältdata. De stämmer med handoffens *Öppna trådar*.

## Not

Tre konsistensbrancher (`claude/konsistens-2026-10-27`, `claude/konsistens-2026-10-29`, `claude/consistency-2026-10-31`) ligger otriagerade på origin. Inbox-README säger att fynd äldre än 30 dagar raderas. Förslag: triagera eller stäng dem så att fynden inte ackumuleras dubbelt.
