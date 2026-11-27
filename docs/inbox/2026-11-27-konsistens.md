# Konsistenskontroll 2026-11-27

Automatisk körning. Jämförde BACKLOG, PLAN, ROADMAP, STATUS, handoff och `docs/decisions/` mot `main`
@ `c9da692`. Repots läge: `vitest run` **206/206 gröna** (17 filer), `tsc -b` rent, `eslint .`
28 problem (20 fel, 8 varningar), 11 `// OSÄKER:`-markeringar i `src/` (alla redan nämnda i
handoff/BACKLOG). Här står bara avvikelserna. Inga dokument är ändrade.

---

## 1. Dokument som påstår något som koden motsäger

**1.1 `package-lock.json` saknar `@fontsource/outfit`, så `npm ci` fallerar.**
`package.json` har `@fontsource/outfit@^5.3.0` sedan `61a0b46` (UI-1), men lockfilen ändrades senast
i `c8e633a` och nämner inte paketet alls. Det betyder att `npm ci` avbryts med `EUSAGE … Missing:
@fontsource/outfit@5.3.0 from lock file`. UI-1 i `docs/BACKLOG.md` och handoff (*Fungerar → Club
Cream*) säger att Outfit är "självhostat + precachat" och att bygget är verifierat. Det stämmer bara
med `npm install`, inte med en ren CI-/Vercel-install. **Förslag:** kör `npm install` och committa
lockfilen. Om Vercel kör `npm ci` bör deploy-läget kontrolleras.

**1.2 Handoff anger fel default för `MAX_TOKENS` och har kvar quick modes gamla tak på 600.**
`docs/swingcheck-handoff.md` → *Miljövariabler* säger "`MAX_TOKENS` … Default 2000", och
*Säkerhetsmodell* punkt 3 säger "quick mode skickar 600". Koden säger något annat:
`worker/worker.ts:23` har `DEFAULT_MAX_TOKENS = 4096`, och `src/lib/api.ts:34` (`maxTokensFor`) skalar
quick till `200+120·n` (S-48). Samma föråldrade siffror står i W-1-texten i BACKLOG ("default 2000",
"600 → 600"), men den texten är historik. **Förslag:** uppdatera de två ställena i handoff till 4096
och `maxTokensFor`.

**1.3 Handoff beskriver inte Workerns nya `/log`-endpoint.**
`b3e217f` (2026-08-11) lade till en "batched remote debug sink" för native-byggen
(`isRemoteLogEndpoint` → `handleRemoteLog`, `worker/worker.ts:86`) och global felfångst i
`src/lib/logger.ts`. Handoff (*Tech stack*, *Komponentstruktur*, *Säkerhetsmodell*) beskriver
fortfarande Workern som "proxy mot Anthropic + `/api/log` → D1". BACKLOG har ingen uppgift för
ändringen. Endpointen har ingen egen auth, bara origin-allowlisten enligt kodkommentaren. Den är
alltså en del av säkerhetsytan och borde stå i säkerhetsmodellen. **Förslag:** lägg till endpointen i
handoff och en BACKLOG-rad i efterhand (Ström W eller en native-ström).

**1.4 STATUS.md är fryst sedan 2026-07-07 och motsäger koden.**
`STATUS.md` säger att Ström A, B och C är "redo att starta". I verkligheten är A-1, A-2, C-1, D-1…D-4,
E-2, UI-1, UI-2, W-1 och S-48 klara. Filen säger också att pose-estimering är "Horisont (ej
schemalagt) … fallback". I koden är pose/envelope den **primära** selektorn och pixel-diff fallbacken
(`frameExtractor.ts` → `selectViaPose`, D-3). Filen hänvisar dessutom till handoff → *Kritiskt
olöst*, ett avsnitt som inte längre finns. **Förslag:** skriv om *Nuvarande fokus* och *Horisont*
efter BACKLOG, eller låt STATUS bara peka vidare.

**1.5 KONTEXT.md, ADR-0001 och oppna-fragor B1/F1 beskriver fortfarande motion som primär metod.**
`KONTEXT.md:42` säger "Rörelsebaserad bildruteval, ingen pose-estimering". `docs/oppna-fragor.md` B1
säger "Rörelsebaserad … framför pose-estimering" med status BESLUT, och F1 ("håller den
rörelsebaserade detekteringen?") står som ÖPPEN. `docs/adr/0001-…md` har status "Antagen". ADR-002
(status Antagen, cutover 2026-08-05) har sedan dess gjort pose primär. BACKLOG D-3 kräver
uttryckligen att utfallet skrivs in i `docs/oppna-fragor.md` och att F1 stängs, men det har inte
gjorts. **Förslag:** markera ADR-0001 som "Delvis ersatt av ADR-002 (endast fallback)", uppdatera B1
och stäng eller omformulera F1. KONTEXT.md behöver en rad om att pose är primär.

**1.6 ROADMAP:s källnot och M3-underlag är föråldrade.**
`docs/ROADMAP.md` säger att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` "finns inte i repot". Filen
finns nu och refereras av W-1 och handoff. M3 (och E-1-prompten) räknar med "upp till 1080×1920
(10 st)" bildrutor. Koden har `ANALYSIS_FRAME_COUNT = 32` (`frameExtractor.ts:68`), och sessionsvägen
beskärs redan till långsida ≤ 900 (`MAX_OUTPUT_SIDE`, `poseCropBox.ts:137`). E-1:s premiss gäller
alltså bara klipp-vägen (`frameExtractor.ts:133`, breddcap 1280), och där med 32 rutor i stället för
10. **Förslag:** uppdatera källnoten och M3/E-1 med dagens frameantal och avgränsa E-1 till
klipp-vägen.

**1.7 S-45 och `stream-shaft` refereras men saknas i BACKLOG.**
S-48 i `docs/BACKLOG.md` och `docs/vision-max-tokens/README.md` säger att felet "upptäcktes … på
`stream-shaft` (S-45 steg 3)". Branchen `stream-shaft` finns på origin, men BACKLOG (som är
auktoritativ) har ingen S-45 eller Ström S, och handoff nämner inte strömmen under *Pågående*.
Samma sak gäller branchen `stream-native` och `dirigent/N-*`-branchar, som saknar strömmar i BACKLOG.
**Förslag:** lägg in de pågående strömmarna i BACKLOG med status `[~]`, eller notera att de lever
utanför.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 D-2 `[x]`: acceptansen gäller en modul som inte finns.**
Acceptansen i `docs/BACKLOG.md` (D-2) säger: "posePhases ger fyra timestamps på normalklipp;
markörer i preview; … noll jsDelivr-requests efter första laddning". `src/lib/posePhases.ts` finns
inte. Den ersattes av `poseEnvelope.ts` (ADR-002), som inte returnerar `{address, top, impact,
followThrough}`. Offline-delen står själv som "ej browser-/offline-fältverifierad". Bocken speglar
alltså ett ersatt mål, inte den skrivna acceptansen. **Förslag:** skriv om acceptansen till det som
faktiskt levererades (envelope + självhost) och markera offline-verifieringen som kvar, eller sätt
uppgiften till `[~]`.

**2.2 D-3 `[x]`: den formella metriken är aldrig körd.**
D-3 säger själv att cutovern gjordes på 3 klipp och inte på metriken ≥ 80 % av 20 klipp inom
±150 ms, och att fält-instrumenteringen (`path`-loggen) "ersätter i praktiken" metriken. Inget
dokument redovisar någon uppmätt fallback-frekvens från fält. Kvalitetskriteriet går därmed inte att
verifiera. **Förslag:** för in en mätpunkt (andel `path:'motion'` över N fältsvingar) i
`docs/pose-detection.md` eller i ROADMAP fork 1.

**2.3 W-1 `[x]`: prod-delen av acceptansen är oavklarad.**
Acceptansen kräver att "appen [är] oförändrad … i prod med `cache_read_input_tokens` fortfarande
> 0". Under *Kvar för Erik* står samma sak plus D1-migreringen `api_usage --remote`. Ingenting i
repot visar att någon av dem är gjord. `ALLOWED_ORIGINS` är satt (`worker/wrangler.toml:25`), så
den punkten är löst. S-48 i sin tur kräver `wrangler deploy` för att taket 4096 ska gälla.
**Förslag:** bryt ut "deploy + verifiera prod" som en egen öppen punkt, eller sätt W-1 till `[~]`.

**2.4 UI-1, UI-2 och E-2 `[x]` är "ej sedda på iPhone", och kodens lintläge stämmer inte med UI-1.**
UI-1 säger "0 nya fel — de 2 kvarvarande är pre-existerande". UI-2 säger 28 problem som baslinje,
och `eslint .` ger nu 28 (20 fel). Siffran i UI-1 går alltså inte att återskapa. Safe-area-ändringen
(UI-1), sveparket (UI-2) och beskärningsgeometrin efter borttaget aspektlås (E-2, handoff *Öppna
trådar*) har ingen enhetsverifiering. **Förslag:** rätta lint-siffran i UI-1 och samla
iPhone-verifieringen i C-2:s checklista, så att den inte bara lever som fotnoter.

## 3. Milstolpar i PLAN.md vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller måldatum, bara två routines markerade TBD. Därför
finns inga fynd mot PLAN.md. Två relaterade avvikelser:

**3.1 Daterade beslutsforkar i ROADMAP har passerat utan att utfallet skrivits in.**
`docs/ROADMAP.md` fork 1 ("D-3 … fältkörd senast **2026-07-31**", annars trim-slider) och fork 2
("G1-scopefrys … senast **2026-08-15**") har båda passerat. Filen är oförändrad sedan 2026-07-07,
trots slutraden "Uppdatera denna fil när en beslutsfork avgörs (datum + utfall)". Fork 1 avgjordes
i praktiken genom D-3:s cutover 2026-08-05 (efter fristen, och utan metriken). Fork 2 nämns inte
någonstans. M1 (A-3) och M2 (A-5/C-2) är fortfarande obockade i BACKLOG, så G1-frysens villkor
(18/20) är inte uppnått och datumet har passerat. **Förslag:** skriv in datum och utfall för fork 1
och 2 i ROADMAP (av Erik, eftersom routinen inte får redigera filen).

**3.2 PLAN.md:s routine-beskrivningar är fortfarande TBD.**
`docs/PLAN.md` säger "Routine 1/2 — TBD: beskrivning tillkommer när routinen skapas". Den här
konsistensroutinen har kört flera gånger (branchar `claude/konsistens-2026-10-27`, `-10-29`,
`claude/consistency-2026-10-31` på origin). **Förslag:** fyll i beskrivningen av routinen.
