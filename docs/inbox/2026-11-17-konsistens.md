# Konsistenskontroll 2026-11-17

Nattlig routine. Underlag: `docs/BACKLOG.md`, `docs/PLAN.md`, `docs/ROADMAP.md`, `STATUS.md`,
`docs/swingcheck-handoff.md`, `docs/decisions/` mot `main` @ `c9da692` (senaste commit 2026-10-23).
Repo-läge: `npx vitest run` 206/206 grönt, `tsc -b` rent, `eslint .` 28 problem (20 fel, 8 varningar),
11 `OSÄKER`-markeringar i `src/`. Endast avvikelser listas. Inga dokument är ändrade.

## 1. Dokument som påstår något koden motsäger

**1.1 `npm ci` går inte igenom, lockfilen saknar `@fontsource/outfit`.**
`package.json` har `@fontsource/outfit ^5.3.0` (tillagd i `61a0b46`, UI-1), men `package-lock.json`
nämner den inte. `npm ci` avbryter med `EUSAGE … Missing: @fontsource/outfit@5.3.0 from lock file`.
Handoff (*Fungerar → Club Cream*) och BACKLOG UI-1/UI-2 säger att build är verifierad och att Outfit är
självhostat. Det gäller bara en `node_modules` som installerats med `npm install`; en ren CI- eller
deploy-installation fallerar. **Förslag:** kör `npm install` och committa den uppdaterade lockfilen.

**1.2 Handoff och README anger fel Worker-default för `MAX_TOKENS`.**
`docs/swingcheck-handoff.md:289` och `README.md:44` säger *"Default 2000"*. Koden har
`DEFAULT_MAX_TOKENS = 4096` (`worker/worker.ts:23`) och `wrangler.toml` sätter `"4096"`.
`docs/swingcheck-handoff.md:310` säger också att *"quick mode skickar 600"*, men `api.ts` skickar nu
`maxTokensFor()` (quick `200+120·n`) efter S-48. **Förslag:** ändra raderna till 4096 och
`maxTokensFor` i handoff och README.

**1.3 Endpointen `/log` och `VITE_REMOTE_LOG` (commit `b3e217f`) finns inte i någon doc, och koden
pekar på en uppgift som inte finns.** `worker/worker.ts:4-7` beskriver tre ansvar och hänvisar till
*"BACKLOG F-0"*, och `src/lib/logger.test.ts:1` till *"Ström F, F-0"*. BACKLOG har varken Ström F
eller F-0. Handoff (*Tech stack*, *Komponentstruktur*, *Miljövariabler*, *Säkerhetsmodell*) och
`KONTEXT.md:28` (*"Två ansvar"*) beskriver bara proxyn och `/api/log`. Det nya `/log` har ingen egen
auth (bara origin-allowlist, 100 KB-tak och en rate limit per isolate), och det bör stå i
säkerhetsmodellen. **Förslag:** lägg till F-0 i BACKLOG, `/log` i handoffens säkerhetsmodell och
`VITE_REMOTE_LOG` i env-tabellen.

**1.4 BACKLOG W-1 listar `ALLOWED_ORIGINS` som kvar för Erik, men den är satt.**
I *"Kvar för Erik"* under W-1 står att `ALLOWED_ORIGINS` ska sättas till prod-origin. `619e586`
(2026-08-11) satte den i `worker/wrangler.toml` till `https://swing-check-henna.vercel.app/,…`
(det avslutande snedstrecket tolereras, `worker/worker.ts:103-116`). **Förslag:** stryk den punkten.
D1-migreringen och kontrollen av `cache_read_input_tokens` efter deploy står kvar.

**1.5 `STATUS.md` beskriver läget per 2026-07-07.**
Filen säger *"Tre isolerade strömmar redo att starta (A/B/C)"* och *"rörelsebaserad svingdetektering
… ännu inte verifierad"*. Den hänvisar också till handoffens avsnitt *Kritiskt olöst*, som inte finns
längre. I verkligheten är pose-envelopen primär selektor sedan D-3 (`frameExtractor.ts` → `selectViaPose`)
och pixel-diff bara fallback. D-4, D-5 p1–p4, E-2, W-1, UI-1/2 och S-48 har tillkommit. Horisontraden
*"Pose-estimering som fallback"* är alltså omvänd mot koden. **Förslag:** skriv om *Nuvarande fokus*
efter BACKLOG och handoff, och ta bort länken till *Kritiskt olöst*.

**1.6 `docs/oppna-fragor.md` F1 är fortfarande ÖPPEN och utgår från pixel-diff som primär väg.**
Texten säger *"Om den missar svingen är nästa steg pose-estimering"*. Det steget är taget (ADR-002,
cutover D-3). Dokumentkravet i BACKLOG D-3 sa att utfallet skulle skrivas in här och att
F1-komplexet skulle stängas. **Förslag:** formulera om F1 till fältfrågan om pose-fallback-frekvens,
eller stäng den med en hänvisning till ADR-002.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 D-3 är `[x]` utan acceptansmetriken.**
Acceptansen i `docs/BACKLOG.md` D-3 är *"≥ 80 % inom ±150 ms på 20 klipp"*, med utfallet inskrivet i
ROADMAP beslutsfork 1 och `oppna-fragor.md`, samt en resultattabell i `pose-detection.md`. BACKLOG
säger själv att cutover gjordes på 3 klipp och att metriken *"ersätts i praktiken av
fält-instrumenteringen"*. Ingen sådan fältmätning (fallback-frekvens från `Frame selection {path}`)
finns dokumenterad, och ROADMAP och `oppna-fragor.md` är oförändrade. **Förslag:** markera `[~]`
eller lägg till en ny uppgift som läser `path`-andelen ur D1-loggen och skriver in beslutet.

**2.2 W-1 är `[x]`, men acceptanspunkten om prod går inte att verifiera ur repot.**
Acceptansen kräver *"appen oförändrad … i prod med `cache_read_input_tokens` fortfarande > 0"*. BACKLOG
listar själv deploy, D1-migrering och prod-kontroll som kvar. Ingenting i repot visar att de är gjorda.
S-48 (*"kräver `wrangler deploy`"*) har samma beroende. **Förslag:** `[~]` tills deploy är bekräftad,
eller flytta prod-punkten till en egen deploy-uppgift.

**2.3 UI-1:s lint-påstående stämmer inte med UI-2 eller med dagens läge.**
UI-1 säger *"de 2 kvarvarande [lint-felen] är pre-existerande"*. UI-2 säger *"28 problem, identiskt med
baslinjen"*, och i dag ger `eslint .` 28 problem, varav 20 fel. Båda kan inte vara baslinjen.
**Förslag:** rätta UI-1 till 28, eller lägg in en uppgift som tar `npm run lint` till 0 fel.

## 3. Milstolpar vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller datum, bara routine-stubbar (*"TBD"*). Inget fynd där.
De daterade grindarna finns i `docs/ROADMAP.md`, som är oförändrad sedan 2026-07-07:

**3.1 ROADMAP beslutsfork 1, tidsgräns 2026-07-31.**
Om D-3-metriken missas *eller* inte är fältkörd senast 2026-07-31 ska trim-slider-fallback (F-1)
byggas. Datumet har passerat och metriken är inte körd (se 2.1). Varken F-1 eller ett ändrat beslut
finns i ROADMAP. M4 står kvar som öppen. **Förslag:** skriv in i ROADMAP att forken avgjordes
annorlunda, via D-3-cutover och fältinstrumentering, och stäng M4.

**3.2 ROADMAP beslutsfork 2, G1-scopefrys senast 2026-08-15.**
Efter datumet har mer G1-funktionalitet tillkommit: D-5, E-2, UI-1/2 och bildrutebudgeten i augusti,
S-48 i oktober, och BACKLOG nämner pågående S-45 på `stream-shaft`. M5 (Ström B, B-1…B-3) är inte
påbörjad. ROADMAP har ingen notering om att frysen hävts eller skjutits upp. **Förslag:** skriv in i
ROADMAP om frysen gäller och i så fall från vilket datum. Fyll i routine-beskrivningarna (*TBD*) i
PLAN.md.
