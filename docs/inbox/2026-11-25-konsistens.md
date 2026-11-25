# Konsistenskontroll 2026-11-25

Nattlig routine. Jämförda dokument: `docs/BACKLOG.md`, `docs/PLAN.md`, `docs/ROADMAP.md`,
`STATUS.md`, `docs/swingcheck-handoff.md`, `docs/decisions/` (+ refererade `docs/oppna-fragor.md`,
`docs/pose-detection.md`). Repo-läge: `main` @ `c9da692` (S-48, 2026-10-23). `vitest run`
206/206 gröna, `tsc -b` rent, `eslint .` 28 problem (= baslinjen som UI-2 anger). Elva
`// OSÄKER:`-markeringar i `src/lib/` — alla redan nämnda i handoff/ADR, inga nya avvikelser där.
Endast avvikelser listas; förslag görs, inga ändringar.

## 1. Dokument som påstår något koden motsäger

**1.1 Bildrutebudgeten — ADR-002 och pose-detection.md säger 20/10, koden säger 32.**
`docs/decisions/ADR-002-stream-d-envelope-inversion.md:387` anger `ANALYSIS_FRAME_COUNT = 20`;
`docs/pose-detection.md:119` säger produktionens `count` är 10 och `:173`/`:241` säger 10 resp. 20.
`src/lib/frameExtractor.ts:67` är `ANALYSIS_FRAME_COUNT = 32` (höjd 2026-08-11, `b3b5097`), vilket
handoffen redan beskriver korrekt. *Förslag:* lägg en uppföljningsrad i ADR-002 *Kostnadsavvägning*
(20 → 32, motiv: beskärningen sänkte priset per bildruta) och rätta siffrorna i pose-detection.md.

**1.2 Handoffens miljövariabeltabell och säkerhetsmodell beskriver `max_tokens` som före S-48.**
`docs/swingcheck-handoff.md` (tabellen *Miljövariabler*) säger `MAX_TOKENS` default 2000, och
*Säkerhetsmodell* punkt 3 säger "quick mode skickar 600". Koden: `worker/worker.ts:23`
`DEFAULT_MAX_TOKENS = 4096`, `worker/wrangler.toml:33` `MAX_TOKENS = "4096"`, och `src/lib/api.ts:34`
`maxTokensFor()` skickar `200+120·n` (quick) / `400+250·n` (detaljerat). Handoffens egen *Öppna trådar*
(S-48) säger rätt sak, så dokumentet motsäger sig självt. *Förslag:* uppdatera tabellraden till 4096
och punkt 3 till "klienten skalar `max_tokens` med regelantal via `maxTokensFor`".

**1.3 STATUS.md beskriver läget per 2026-07-07.**
`STATUS.md` säger att Ström A/B/C är "redo att starta", att rörelsebaserad detektering är det
olösta, och listar pose som "horisont (ej schemalagt)". Verkligheten: A-1/A-2/C-1 klara, Ström D
(pose) är primär frame-selektor sedan D-3 (`frameExtractor.ts` → `selectViaPose`, pixel-diff är
fallback), D-5 pågår, UI/E-2/W-1/S-48 levererade. *Förslag:* skriv om *Nuvarande fokus* till D-5
pass 3-fältverifiering + A-3, och stryk pose ur *Horisont*.

**1.4 oppna-fragor.md: B1 och F1 motsägs av D-3-cutovern.**
`docs/oppna-fragor.md` B1 ("rörelsebaserad detektering framför pose-estimering") står som gällande
BESLUT och F1 ("håller den rörelsebaserade detekteringen?") som ÖPPEN. Koden har pose som primär väg
och motion som fallback. BACKLOG D-3:s acceptans kräver uttryckligen att utfallet "skrivs in i
ROADMAP (beslutsfork 1) + `docs/oppna-fragor.md` (stänger F1-komplexet)" — det har inte gjorts.
*Förslag:* markera B1 som ersatt av ADR-002 och stäng F1 med hänvisning till D-3 och
`log.warn('Frame selection', {path})` som fältsignal.

**1.5 ROADMAP säger att arkitekturreviewen saknas — den finns.**
`docs/ROADMAP.md` *Källnot*: "`docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` … finns inte i repot".
Filen finns nu och BACKLOG W-1 + handoffen länkar till den (R2 markerad åtgärdad). *Förslag:* ta
bort/uppdatera källnoten och reconcila mot *Beslutsforkar*, som noten själv begär.

**1.6 E-1:s och ROADMAP M3:s premiss är inaktuell.**
`docs/BACKLOG.md` E-1 och `docs/ROADMAP.md` M3 motiverar uppgiften med "porträttvideo 1080×1920 …
~1 800 tokens/frame × 10". Sedan dess: sessionsvägen beskärs (E-2, ~213–231 tokens/bild) och
budgeten är 32. Koden (`frameExtractor.ts:133`) har fortfarande bara bredd-cap 1280 i klipp-vägen,
så E-1 är inte gjord — men måttet "≥ 40 % färre tokens" och baslinjen gäller inte längre för
sessionsvägen. *Förslag:* omspecificera E-1 till enbart klipp-vägen med ny baslinje, eller stryk
den om klipp-vägen också ska få pose-beskärning.

**1.7 `package-lock.json` saknar `@fontsource/outfit` — ren installation fallerar.**
`package.json` har `@fontsource/outfit ^5.3.0` (inlagd i `61a0b46`, UI-1), men lockfilen är inte
uppdaterad sedan `c8e633a` (2026-08-05). `npm ci` avbryter med "package.json and package-lock.json
… not in sync". BACKLOG UI-1 anger build som verifierad, vilket bara håller mot en redan installerad
`node_modules`. *Förslag:* kör `npm install` och committa lockfilen i en egen commit.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 A-1 — "Fungerar i iOS standalone PWA efter en tap".** `docs/BACKLOG.md` A-1 är `[x]` men
avbockningsraden säger själv "ej enhetsverifierad på iOS". Inget test eller logg i repot belägger
det. *Förslag:* `[~]` med "iOS-verifiering kvar (A-5/C-2)", eller flytta kriteriet till A-5.

**2.2 A-2 — "<300 ms", "två snabba ljud → en trigger", "60 s tystnad → ingen trigger".**
`[x]`, men det finns inget `audioTrigger.test.ts` (inga tester för `EnergyTrigger` alls) och raden
säger "ej fältverifierad". De två sista kriterierna är rena logikegenskaper som borde gå att
enhetstesta. *Förslag:* lägg till enhetstest för cooldown/tystnad; latenskravet flyttas till A-5.

**2.3 C-1 — "Manifest validerar (inga Lighthouse-varningar). Maskable korrekt i preview."**
`[x]`, men avbockningen nämner bara att "build genererar korrekt manifest" — ingen Lighthouse-körning
eller maskable-preview är dokumenterad (`docs/pwa-checklist.md` refereras). *Förslag:* kör Lighthouse
mot en build och notera resultatet, annars `[~]`.

**2.4 D-3 — formell metrik ersatt, dokumentkrav ej uppfyllda.** `[x]` med ärligt angiven avvikelse
(3 klipp i stället för ≥ 80 % av 20 inom ±150 ms). Men acceptansens andra halva — utfallet skrivet
i ROADMAP beslutsfork 1 och `oppna-fragor.md` — är ogjord (se 1.4, 3.1), och ingen data om
fält-fallback-frekvensen (`path:'motion'`) är redovisad sedan 2026-08-05. *Förslag:* för in beslutet
i ROADMAP/oppna-fragor och notera senaste kända fallback-frekvens.

**2.5 W-1 — "appen oförändrad … i prod med `cache_read_input_tokens` fortfarande > 0".**
`[x]`, men raden listar själv deploy, D1-migrering och prod-kontroll av cache som "kvar för Erik".
`ALLOWED_ORIGINS` är satt i `worker/wrangler.toml:25` (`619e586`), men att deploy + migrering körts
går inte att se i repot. Samma gäller S-48:s 4096-tak, som enligt handoffen gäller först efter
`wrangler deploy`. *Förslag:* `[~]` tills deploy är bekräftad, eller en rad i handoffen med
deploy-datum.

## 3. Milstolpar i PLAN.md vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller måldatum (bara två TBD-routines), så kategorin är
tom för PLAN.md. Närliggande, i `docs/ROADMAP.md`:

**3.1 Beslutsfork 1 (2026-07-31) och 2 (2026-08-15) passerade utan att ROADMAP uppdaterats.**
Fork 1: D-3 avgjordes 2026-08-05 (pose primär), men forken står oförändrad trots filens egen regel
"uppdatera när en beslutsfork avgörs (datum + utfall)". Fork 2: G1-scopefrysen "senast 2026-08-15"
— M2-metriken (18/20) är inte rapporterad, och G1-arbete har fortsatt efter datumet (E-2 beskärning,
UI-2, impact-grind, S-48). Ingen notering om att frysen skjutits eller avbrutits; M5/Ström B är
inte påbörjad. *Förslag:* skriv in utfall för fork 1, och ett explicit beslut för fork 2 (frys
genomförd/skjuten till datum X/struken).
