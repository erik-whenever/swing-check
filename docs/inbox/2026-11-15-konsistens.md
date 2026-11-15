# Konsistenskontroll 2026-11-15

Automatisk körning mot `main` @ `c9da692` (senaste commit 2026-10-23, S-48). Läst: `docs/BACKLOG.md`,
`docs/PLAN.md`, `docs/ROADMAP.md`, `STATUS.md`, `docs/swingcheck-handoff.md`, `docs/decisions/`.
Repo-läge: `npx vitest run` **206/206** gröna (17 filer), `tsc -b` rent, `npm run lint` 28 problem
(20 fel, 18 av dem i incheckade `dev-dist/`, samma som UI-2:s baslinje), 11 `// OSÄKER:`-markeringar i
`src/`. Bara avvikelser listas nedan. Föreslagna ändringar är **inte** gjorda.

---

## 1. Dokument som påstår något koden motsäger

**1.1 `npm ci` misslyckas: lockfilen saknar `@fontsource/outfit`.** `docs/BACKLOG.md` UI-1 och
`docs/swingcheck-handoff.md` → *Fungerar* ("Outfit (självhostat + precachat)") säger att build är
verifierad. `package.json:20` har `@fontsource/outfit ^5.3.0`, och `src/index.css:5-9` importerar det, men
`package-lock.json` har inte rörts sedan `c8e633a` (D-2). Därför avbryts `npm ci` med *"Missing:
@fontsource/outfit@5.3.0 from lock file"*. Bygget fungerar bara med `npm install`, som skriver om lockfilen.
**Förslag:** kör `npm install` och committa `package-lock.json` (+36 rader, bara `@fontsource/outfit`).

**1.2 Handoffens miljövariabeltabell anger fel standardvärde för `MAX_TOKENS`.**
`docs/swingcheck-handoff.md` → *Miljövariabler* säger "Default 2000". *Säkerhetsmodell* punkt 3 säger
att "quick mode skickar 600". I koden gäller `worker/worker.ts:23` `DEFAULT_MAX_TOKENS = 4096`,
`worker/wrangler.toml:33` `MAX_TOKENS = "4096"` och `src/lib/api.ts:34` `maxTokensFor()`
(quick `200+120·n`). Det finns inget fast 600 längre. S-48 uppdaterade *Öppna trådar* men inte tabellen.
**Förslag:** ändra till "Default 4096" och "quick mode skickar `200+120·antal regler`".

**1.3 Handoffen nämner fortfarande ett 90 %-tak i beskärningens kvalitetsgrind.**
`docs/swingcheck-handoff.md` → *Fungerar* → E-2 säger "bara ett 4 %-nät under degenererade lådor och ett
90 %-tak". Några rader tidigare i samma stycke står "90 %-taket avvisar inte längre". I
`src/lib/poseCropBox.ts` finns ingen `MAX_AREA_FRAC` och ingen `'box-too-large'` (se kommentaren på rad 414).
**Förslag:** stryk "och ett 90 %-tak".

**1.4 Supabase beskrivs som aktiv spegling, men lagret är avstängt i koden.**
`docs/swingcheck-handoff.md` säger i *Tech stack* "Supabase valfri metadataspegling" och i *Fungerar*
"valfri Supabase-spegling av metadata". *Öppna trådar* säger att RLS saknar policies och att läsningar
"faller tyst tillbaka till IndexedDB". `src/lib/supabase.ts:22` har dock `SUPABASE_DISABLED = true`
sedan 2026-08-09, vilket BACKLOG (Ström B, ⚠️-rutan) dokumenterar. Ingen spegling körs alls.
**Förslag:** skriv i handoffen att Supabase är avstängt via `SUPABASE_DISABLED` tills B-1/B-2.

**1.5 Handoffen säger "Pass 3 — pågående", BACKLOG säger "Pass 3 KLAR".** `docs/swingcheck-handoff.md`
→ *D-5* säger "Pass 3 — pågående (kod committad `cbade28`, ej fältverifierad)". `docs/BACKLOG.md` D-5 säger
"Pass 3 KLAR (2026-08-08)". Pass 4 och de senare passen bygger på pass 3. Det som återstår är fältverifiering.
**Förslag:** ändra handoffen till "klar, ej fältverifierad", så som pass 4 formuleras.

**1.6 W-1:s "Kvar för Erik" är delvis redan gjort.** `docs/BACKLOG.md` W-1 säger "sätt `ALLOWED_ORIGINS`
till prod-origin i `worker/wrangler.toml` (utan den 403:ar prod)". Commit `619e586` (2026-08-11) har redan
lagt in `https://swing-check-henna.vercel.app/` på `worker/wrangler.toml:25`. Raden skiljer inte heller på
vad som är incheckat och vad som är deployat. D1-migrationen och `wrangler deploy` (se även S-48) kan inte
verifieras från repot.
**Förslag:** bocka av origin-delen. Behåll deploy och migration som kvar.

**1.7 Ny Worker-endpoint `/log` saknas i handoffens säkerhetsmodell.** Commit `b3e217f` (2026-08-11,
"batched remote logging for native builds") lade till `handleRemoteLog` i `worker/worker.ts`. Det är en
separat POST-endpoint med egen gräns på 100 KB och en rate limit på 60/min per `sessionId`, och logger.ts
batchar till den. Varken `docs/swingcheck-handoff.md` (*Tech stack* "proxy + `/api/log`", *Säkerhetsmodell*
"Fyra lager") eller BACKLOG nämner endpointen eller "native builds". Commiten har ingen BACKLOG-uppgift, vilket
bryter arbetsregeln "lämna aldrig BACKLOG osynkad".
**Förslag:** lägg till en uppgift i efterhand (t.ex. W-2) och ett stycke om endpointen i *Säkerhetsmodell*.

**1.8 Namnkrocken med `stream-e` står kvar som öppen tråd utan åtgärd.** `docs/swingcheck-handoff.md` →
*Öppna trådar* säger att branchen `stream-e` användes för D-5 och ska döpas om "innan E-1 startar".
`origin/stream-e` finns kvar, och BACKLOG Ström E anger fortfarande "egen branch `stream-e`".
**Förslag:** byt branchnamn i BACKLOG Ström E (t.ex. `stream-vision-cost`) eller radera/döp om den gamla
branchen.

**1.9 ROADMAP säger att arkitekturreviewen saknas, men den finns.** `docs/ROADMAP.md` → *Källnot* säger
"`docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` … finns inte i repot", och "Dyker reviewen upp: reconcila".
Filen finns och används av BACKLOG Ström W (R2). Ingen reconciliation finns noterad.
**Förslag:** Erik uppdaterar källnoten och gör reconciliationen. Agenten får inte redigera ROADMAP.

**1.10 STATUS.md är fyra månader gammal och beskriver ett passerat läge.** `STATUS.md` (senast uppdaterad
2026-07-07) säger "Tre isolerade strömmar redo att starta (A/B/C)" och att "rörelsebaserad svingdetektering
… ännu inte verifierad". Under *Horisont* listas pose-estimering "som fallback". Pose-envelopen är i själva
verket primär väg sedan D-3 (`frameExtractor.ts` → `selectViaPose`), pixel-diff är fallback, och D-1…D-4,
E-2, UI-1/2, W-1 och S-48 är klara.
**Förslag:** skriv om *Nuvarande fokus* (D-5-fältverifiering, A-3, Ström B) och stryk pose ur *Horisont*.

**1.11 ROADMAP och BACKLOG E-1 räknar med 10 bildrutor.** `docs/ROADMAP.md` M3 ("upp till 1080×1920
(10 st)") och `docs/BACKLOG.md` E-1 ("~1 800 tokens/frame × 10") bygger kostnadsresonemanget på 10 bildrutor.
D-3-noten säger `count`=10. `src/lib/frameExtractor.ts:68` har `ANALYSIS_FRAME_COUNT = 32`. Bredd-cappen
1280 på rad 133 stämmer fortfarande. E-1:s mål på ≥ 40 % och M3:s tokenkalkyl behöver därför räknas om.
**Förslag:** räkna om E-1 och M3 för 32 bildrutor (klippvägen beskärs inte).

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 D-2 [x]: acceptansen gäller en modul som inte längre finns.** Acceptansen säger "posePhases ger
fyra timestamps på normalklipp; markörer i preview". `lib/posePhases.ts` ersattes av `poseEnvelope.ts`
(ADR-002), som returnerar `[start, finish]` och en impact som bara sätts när den är säker, inte fyra
fastider. Avbockningen bygger i praktiken på checkpoint 2 och regressionsharnessen, inte på den skrivna
acceptansen. Delen "noll jsDelivr-requests offline" anges som "ej browser-/offline-fältverifierad".
**Förslag:** skriv om acceptansen till det som faktiskt levererades, eller markera `[~]` för
offlineverifieringen.

**2.2 D-3 [x]: den formella metriken byttes ut och beslutsforken stängdes aldrig.** Acceptansen var
"≥ 80 % inom ±150 ms på 20 klipp → … utfallet skrivs in i ROADMAP (beslutsfork 1) + `docs/oppna-fragor.md`
(stänger F1)". Cutovern gjordes efter 3 klipp. Det står ärligt som avvikelse, men utfallet finns varken i
ROADMAP eller i `docs/oppna-fragor.md`, där F1 fortfarande har "**Status:** ÖPPEN" med ADR-0001-formuleringen.
Fält-instrumenteringen som skulle ersätta metriken (`Frame selection {path}`) har ingen redovisad mätning.
**Förslag:** stäng F1 med D-3:s beslut och för in utfallet i ROADMAP fork 1, eller markera D-3 `[~]`.

**2.3 W-1 [x] och S-48 [x]: acceptansen kräver en prod-deploy som inte är bekräftad.** W-1:s acceptans
omfattar "appen oförändrad … i prod med `cache_read_input_tokens` fortfarande > 0". S-48 kräver
`wrangler deploy` för taket 4096. Båda listar deployen som kvar för Erik, och inget i repot visar att den
gjorts. Koden och de offline-tester som körts (`worker.test.ts`) är gröna.
**Förslag:** markera prod-delen `[~]`, eller notera datum för deployen när den är gjord.

**2.4 A-1 [x], C-1 [x], UI-1 [x], UI-2 [x]: iOS- och Lighthouse-kriterier har aldrig körts.**
A-1 kräver "Fungerar i iOS standalone PWA efter en tap", men noten säger "ej enhetsverifierad på iOS".
C-1 kräver "Manifest validerar (inga Lighthouse-varningar)", men ingen Lighthouse-körning redovisas.
UI-1 och UI-2 anges "Ej sedd på en iPhone" (safe-area). Inget av detta kan verifieras i en CI-miljö.
**Förslag:** samla de manuella iPhone-punkterna i C-2:s checklista, så att de inte bara bor i stängda
uppgifter.

**2.5 D-4 [x] och D-5 pass 2–4: perceptuell verifiering och fältverifiering står fortfarande som
"Kvar för Erik".** ADR-003-draftens status säger "Obekräftat i fält: Eriks perceptuella verifiering av
session-multis tre svingar och av face-ons nya finish (4,70), termikmätningen, och fMP4-fönsterklippet på
iPhone-hårdvara". Inget i repot har ändrats sedan 2026-10-23 som visar att det gjorts. D-5 är korrekt `[~]`,
men D-4 är `[x]` trots att finish-golden 4,83 → 4,70 bara verifierats av koden själv.
**Förslag:** lägg en rad i D-4 om att face-ons finish fortfarande väntar på Eriks perceptuella kontroll.

## 3. Milstolpar i PLAN.md vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller måldatum, bara två routine-platshållare markerade "TBD".
Kategorin är tom för PLAN.md. Det betyder att PLAN.md inte beskriver någon plan, och att även routinerna
står som "TBD" fast de körs (se de tidigare `claude/konsistens-*`-branscherna).

Datumsatta beslut finns i stället i `docs/ROADMAP.md`. Två av dem har passerat utan statusändring:

**3.1 ROADMAP fork 1 (2026-07-31):** "om D-3 inte är fältkörd senast 2026-07-31 … byggs manuell
trim-slider". D-3 gjordes 2026-08-05 utan 20-klippsmetriken (se 2.2). ROADMAP har ingen notering om
utfallet, trots egen regel: "Uppdatera denna fil när en beslutsfork avgörs (datum + utfall)".

**3.2 ROADMAP fork 2 (2026-08-15), G1-scopefrys:** "frys vid M2-metriken, senast 2026-08-15". M2
(A-5, C-2) är inte påbörjad och A-3 (M1) är fortfarande `[ ]`, men G1-arbete (D-5, E-2, UI-2) fortsatte
efter datumet och M5 (Ström B) har inte startat. Fork 2 saknar beslutsnotering, och A-4:s villkor
("stryks vid G1-scopefrysen") är inte avgjort.

**Förslag (för Erik, ROADMAP redigeras inte av agenten):** för in utfallet för fork 1 och 2 med datum.
Alternativt flyttar du in milstolparna i PLAN.md, så att den här kontrollen får något att mäta mot.
