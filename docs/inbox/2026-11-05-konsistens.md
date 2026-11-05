# Konsistenskontroll 2026-11-05

Jämfört: BACKLOG, PLAN, ROADMAP, STATUS, handoff, docs/decisions/ mot kod (HEAD `c9da692`) och `npx vitest run` (17 filer, **206/206 gröna**; `npm ci` fungerar inte, lockfilen är osynkad med package.json — se fynd 2.5). Inga ändringar gjorda i PLAN/ROADMAP/BACKLOG; allt nedan är förslag. `docs/gtm/` finns inte.

## 1. Dokument som påstår något koden/andra dokument motsäger

**1.1 STATUS.md (rad 3–13) är föråldrad.** Den säger "Tre isolerade strömmar redo att starta" (A, B, C) och att rörelsebaserad detektering är primär med pose som framtida "Horisont". Verkligheten (handoff, ADR-002, `frameExtractor.ts` `selectViaPose`): C-1 klar, Ström D klar och mergad, pose-envelope är primär väg, pixel-diff är fallback, Club Cream/UI-1/UI-2, E-2, W-1 och S-48 klara; aktivt arbete är D-5 pass 3 och Ström A:s A-3. Filen är daterad 2026-07-07. Förslag: skriv om "Nuvarande fokus" och ta bort pose ur "Horisont", eller sluta underhålla filen och peka allt till BACKLOG.

**1.2 ROADMAP.md:s källnot (rad 5–7) säger att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` inte finns.** Filen finns (`docs/reviews/`) och handoff/BACKLOG W-1 refererar den (R2 åtgärdad). Förslag: ta bort notisen och reconcila beslutsforkarna mot reviewen som notisen själv ber om.

**1.3 ROADMAP.md M4/Prompt 3 och beslutsfork 1 beskriver D-2/D-3 annorlunda än BACKLOG och koden.** ROADMAP: D-2 = `lib/posePhases.ts` (handledshastighet → `{address, top, impact, followThrough}`) och D-3 = 20-klippsutvärdering mot ±150 ms-metriken. Faktiskt: `posePhases.ts` finns inte; fasdetektion ersattes av `poseEnvelope.ts` (ADR-002), D-2 är avbockad i BACKLOG som självhost + fasdetektion, och D-3 blev *cutover* till envelope-selektion (2026-08-05), inte en utvärdering. ±150 ms-metriken är inte mätt någonstans. Förslag: markera beslutsfork 1 som avgjord av ADR-002/D-3 (eller formellt släpp metriken) och uppdatera M4.

**1.4 ROADMAP.md M1/G1-resonemang vs. ADR-003.** ROADMAP gör röstankaret (A-3) till G1:s kärna ("kringgår pixel-diff i sessionsläge"). Handoff (Ström A, slutnotis) och ADR-003 omdefinierar röst till *sessionskontroll*, och sessionsläget använder nu live-pose + envelope, inte pixel-diff. A-3:s motivering (ankare för pixel-diff) är därmed delvis överspelad; A-3 står fortfarande `[ ]` utan omvärdering. Förslag: avgör om A-3 ska skrivas om/strykas.

**1.5 ROADMAP.md rad 7–8 / "Reconciliation" säger D-1 pass 1 ligger på `stream-d` och att "A-1/A-2, C-1 mergade".** Hela Ström D är mergad till `main` (handoff). Samma stycke är föråldrat.

**1.6 Handoff vs. BACKLOG: S-48 och W-1 är `[x]` men handoff/BACKLOG medger att produktion inte matchar koden.** `worker/wrangler.toml` har `MAX_TOKENS = "4096"` och `ALLOWED_ORIGINS` satt, men handoff (*Öppna trådar*, S-48) säger att prod-Workern klampar till 2000 tills `wrangler deploy`. Konsistent internt, men "klart" betyder här "kod klar, ej deployad" — se 2.2.

**1.7 Handoff *Öppna trådar* saknar flera `// OSÄKER:` som finns i koden.** Dokumenterade: takt-trösklar live-vägen, fMP4-fönster. Ej nämnda: `poseDetector.ts:124,176` (landmarkern är single-tenant under en extraktion; live-loop överlappar), `poseTrajectory.ts:35` (cap ~4500 inferenser, 2–5 min på CPU-delegat), `poseEnvelope.ts:62,82,110,362` (0,04-tröskel, 3-frames-hållning, 15 fps-kalibrering, finish söks i hela klippet). Förslag: lägg en rad per fil i *Öppna trådar*.

**1.8 Testräkning.** Handoff/BACKLOG anger 149, 164, 187 test på olika ställen (historiska noteringar); nuvarande är 206. Ofarligt men ingen "aktuell" siffra finns. Förslag: ange `npm test`-antal bara på ett ställe, eller inte alls.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 UI-1 / UI-2 (`[x]`).** Handoff: "Ej enhetsverifierad" (Club Cream) och UI-2:s verifieringsläge begränsat. Acceptans som kräver iPhone-rendering/safe-area kan inte styrkas ur repot.

**2.2 W-1 (`[x]`).** Acceptans: "appen oförändrad … i prod med `cache_read_input_tokens` > 0". Backloggen säger själv att Erik ska deploya, applicera D1-migrationen `api_usage` och bekräfta efter deploy. Inget i repot visar att det skett. Dessutom: `DAILY_CALL_CAP = 300` — ej verifierat mot faktisk användning (D-5-sessioner kan nå det).

**2.3 S-48 (`[x]`).** Acceptansen "0/12 klippta" kommer från mätning (rapport i `docs/vision-max-tokens/README.md`), men taket 4096 gäller först efter `wrangler deploy`; prod klampar fortfarande till 2000 enligt handoff. Utan deploy är felet inte åtgärdat i produktion för ≥ 8 regler.

**2.4 E-2 (`[x]`).** Handoff: beskärningen "ej fältverifierad efter borttaget aspektlås"; trösklar (0,3/0,5/0,6, `MIN_WIDTH_TO_HEIGHT`) valda på resonemang. Kostnadspåståendet (~$0,063 → lägre) är inte reproducerbart ur repot.

**2.5 D-3 (`[x]`) / D-4 (`[x]`).** D-3-cutover: "fältverifierad på iPhone (14,9 fps …)" är loggbaserat, ej artefakt i repot. D-4 vilar på fixturer (testade, gröna). Mindre allvarligt än ovan.

**2.6 Byggbarhet.** `npm ci` misslyckas: `package-lock.json` är osynkad med `package.json` (`npm install` ändrar lockfilen). Alla `[x]`-uppgifter som anger "build ren" kan inte reproduceras med `npm ci` i CI/ren miljö. Förslag: committa uppdaterad lockfil.

## 3. Milstolpar med passerat måldatum utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller datum (bara "Routine 1/2 — TBD"). Datumen bor i ROADMAP.md, som inte uppdaterats sedan 2026-07-07 (idag 2026-11-05):

**3.1 Beslutsfork 1: "D-3 fältkörd senast 2026-07-31"** — passerat 97 dagar. Ingen notering om utfall; se 1.3 (D-3 blev något annat). Trim-slider-fallbacken är varken byggd eller formellt avskriven.

**3.2 Beslutsfork 2: "G1-scopefrys senast 2026-08-15"** — passerat 82 dagar. M2-metriken (≥ 18/20 hands-free) är inte rapporterad; A-5 (`[ ]`) är inte gjord; samtidigt har betydande G1-funktionalitet tillkommit efter datumet (E-2, UI-1/UI-2, D-5 p2–4, impact-grind, frame-budget 32). M5 (Ström B: B-1..B-3 alla `[ ]`) har inte startat trots att scopefrysen skulle flytta all kapacitet dit. Förslag: bocka av/ändra forken och sätt nytt datum, eller notera att G1 fortsatt är prioriterat.

**3.3 M3/E-1 (`[ ]`)** — ROADMAP kallar den "riskfri" och "körs nu, villkorslöst"; fortfarande ogjord (`frameExtractor.ts:133` cappar fortfarande bara bredden till 1280). Delvis överspelad av E-2 (beskärning) och budget 32 — behöver omvärderas, inte nödvändigtvis byggas.

**3.4 PLAN.md "Routine 1/2 — TBD"** — beskrivning "tillkommer när routinen skapas"; denna konsistensrutin är en av dem men är inte inskriven.
