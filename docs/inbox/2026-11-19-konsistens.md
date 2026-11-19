# Konsistenskontroll 2026-11-19

Automatisk jämförelse av BACKLOG, PLAN, ROADMAP, STATUS, handoff och `docs/decisions/` mot repots
tillstånd på `main` @ `c9da692` (S-48 mergad). Bara avvikelser listas nedan. Förslagen är inte genomförda.

**Repo-läge vid körningen:** `npx vitest run` gav 206/206 gröna (17 filer). `tsc -b` var rent. `eslint .`
gav 28 problem (20 fel): 18 av felen ligger i incheckade `dev-dist/workbox-*.js` och 2 i `src/`. Det är
samma baslinje som UI-2 anger. `npm ci` **misslyckas** (se fynd 1.1).

---

## 1. Dokument som påstår något koden motsäger

**1.1 `package-lock.json` saknar `@fontsource/outfit`, så `npm ci` fallerar.** BACKLOG UI-1
(`docs/BACKLOG.md` rad ~37–60) och handoff → *Fungerar* säger att Outfit är "självhostat + precachat"
och att build/test är verifierade. `package.json:20` deklarerar `@fontsource/outfit ^5.3.0`, men
lockfilen har inte paketet: `npm ci` avbryter med `EUSAGE … Missing: @fontsource/outfit@5.3.0 from lock
file`. Verifieringen fungerar alltså bara efter en `npm install`, som skriver om lockfilen.
*Förslag:* kör `npm install` och committa den uppdaterade `package-lock.json` som en egen fix-commit.

**1.2 STATUS.md är inaktuell på flera punkter.** `STATUS.md` (senast uppdaterad 2026-07-07) säger:
- *Nuvarande fokus* är tre strömmar som är "redo att starta". C-1 är klar och A-1/A-2 också.
- Arbetet har sedan dess gått i D, E, UI, W och S-48.
- Den "övergripande olösta" frågan uppges vara att rörelsedetektion inte är verifierad.
- Pose står under *Horisont* som en eventuell fallback.

Koden säger motsatsen: `frameExtractor.ts` använder pose/envelope som primär väg och pixel-diff som
fallback (D-3), och sessionsläget (D-5) bygger helt på pose. Länken till handoff → *Kritiskt olöst*
pekar dessutom på en rubrik som inte finns i `docs/swingcheck-handoff.md`.
*Förslag:* skriv om *Nuvarande fokus*/*Horisont* efter handoffens *Pågående* (D-5 pass 3 fältverifiering,
A-3 nästa) och ta bort den döda ankarlänken.

**1.3 Handoff → Miljövariabler: `MAX_TOKENS` default 2000.** `docs/swingcheck-handoff.md` (tabellen
*Miljövariabler*) anger "Default 2000". `worker/worker.ts:23` har `DEFAULT_MAX_TOKENS = 4096` och
`worker/wrangler.toml:33` sätter `MAX_TOKENS = "4096"`. Handoffens egen öppna tråd om S-48 nämner 4096,
så tabellen är kvar från före S-48.
*Förslag:* ändra defaulten i tabellen till 4096.

**1.4 Handoff → Säkerhetsmodell: "quick mode skickar 600".** Lager 3 i `docs/swingcheck-handoff.md`
säger att klienten får be om mindre och att "quick mode skickar 600". Efter S-48 räknar
`src/lib/api.ts:34` (`maxTokensFor`) ut värdet som `200+120·n` i quick och `400+250·n` i detaljerat
läge, med tak 4096. Något fast 600 finns inte längre (kommentaren på `api.ts:28` säger det rakt ut).
*Förslag:* ersätt parentesen med en hänvisning till `maxTokensFor`.

**1.5 Workerns `/log`-endpoint och `VITE_REMOTE_LOG` saknas i dokumenten, och koden hänvisar till en
uppgift som inte finns.** Commit `b3e217f` (2026-08-11, mergad via #21) lade till:
- ett tredje ansvar i Workern: `POST …/log`, en batchad debug-sink utan auth, skyddad bara av
  origin-allowlisten,
- `VITE_REMOTE_LOG` i `src/lib/logger.ts`.

Handoffen beskriver fortfarande Workern som "proxy mot Anthropic + `/api/log` → D1" (*Tech stack*,
*Komponentstruktur*). *Säkerhetsmodell* nämner bara de vägarna, och env-tabellen saknar
`VITE_REMOTE_LOG`. `worker/worker.ts` (huvudkommentaren) och `handleRemoteLog` hänvisar till
"BACKLOG F-0" och ett "native/Capacitor build". Ingen F-0 finns i `docs/BACKLOG.md`, och repot har
ingen Capacitor-konfiguration (`capacitor.config.*`, `ios/` och `android/` saknas, och paketet finns
inte i `package.json`).
*Förslag:* lägg till F-0 i BACKLOG (eller ta bort hänvisningen) och dokumentera `/log` +
`VITE_REMOTE_LOG` i handoffens *Säkerhetsmodell* och env-tabell. Funktionen är obokförd i BACKLOG, så
den bryter mot regeln att aldrig lämna BACKLOG osynkad.

**1.6 ROADMAP påstår att arkitekturreviewen inte finns.** `docs/ROADMAP.md` (*Källnot*, rad ~6) säger
att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` "finns inte i repot". Filen finns, och BACKLOG W-1
och handoffen länkar till den. ROADMAP ber själv om en avstämning mot *Beslutsforkar* när reviewen
dyker upp, och den avstämningen är inte gjord.
*Förslag:* ta bort källnoten och stäm av beslutsforkarna mot reviewen.

**1.7 ROADMAP M3 beskriver frame-pipelinen som den såg ut före E-2.** `docs/ROADMAP.md` M3 (rad ~47)
och prompt 2 säger: "Frames skickas idag i upp till 1080×1920 (10 st) → ~1 800 input-tokens/frame".
Koden skickar `ANALYSIS_FRAME_COUNT = 32` (`src/lib/frameExtractor.ts:68`). Sessionsvägen beskärs till
en långsida ≤ 900 px (E-2), och handoffen anger 213–231 tokens per bild. M3:s utgångsläge och
klar-metrik (≥ 40 % färre tokens) är därmed inaktuella. Klipp-vägen (E-1) är fortfarande obeskuren.
*Förslag:* uppdatera M3 med det nya utgångsläget, eller markera att E-2 delvis ersatt M3 för
sessionsvägen.

**1.8 ADR-003 heter fortfarande "UTKAST" trots att hela ADR:n är byggd.** I
`docs/decisions/ADR-003-draft.md` säger både rubriken (rad 1) och filnamnet "UTKAST"/"draft". Status
(rad 3) säger samtidigt "Hela ADR:n är byggd (2026-08-08)", och handoffen behandlar den som gällande
beslut.
*Förslag:* sätt status till Accepterad och byt namn på filen (uppdatera länkarna i BACKLOG/handoff).

**1.9 `docs/oppna-fragor.md` F1 står som ÖPPEN, trots att D-3 skulle stänga den.** BACKLOG D-3
(*Acceptans/beslut*) säger att utfallet ska skrivas in i ROADMAP fork 1 och i `docs/oppna-fragor.md`
("stänger F1-komplexet"). D-3 är bockad. `oppna-fragor.md:28–29` har ändå F1 som **ÖPPEN**, och frågan
gäller rörelsedetektionen, som nu bara är fallback.
*Förslag:* stäng F1 med en hänvisning till D-3/ADR-002, eller formulera om den till en fråga om
fallback-frekvensen (`Frame selection path:'motion'`).

**1.10 PLAN.md beskriver routinerna som TBD.** `docs/PLAN.md` säger "Routine 1 — TBD" och
"Routine 2 — TBD". Minst en routine körs (den här konsistenskontrollen, som skriver till `docs/inbox/`).
*Förslag:* fyll i beskrivningen för den här routinen.

---

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 D-2 är bockad `[x]`, men blocket börjar med "Delvis" och acceptansen gäller en modul som inte
finns.** `docs/BACKLOG.md` D-2 (rad ~329) öppnar med "**Delvis (Pass 2, del b klar)**". Acceptansen
kräver att "posePhases ger fyra timestamps på normalklipp" och att markörerna syns i previewen.
`src/lib/posePhases.ts` finns inte; den ersattes av `poseEnvelope.ts` (ADR-002). Offline-kravet
("noll jsDelivr-requests") är bara byggverifierat; texten säger "ej browser-/offline-fältverifierad".
Koden har inga `jsdelivr`-referenser kvar, vilket stämmer med bygget, men själva offline-körningen är
overifierad.
*Förslag:* skriv om acceptansen så att den speglar envelope-arkitekturen och notera offline-testet
som återstående, eller markera D-2 `[~]` tills offline-testet är gjort.

**2.2 W-1 är bockad, men en del av acceptansen ("appen oförändrad … i prod med
`cache_read_input_tokens` > 0") står själv som kvar för Erik.** BACKLOG W-1 listar under *Kvar för Erik*:
deploy, `d1 migrations apply --remote` och bekräftelse av cache-reads i prod. `ALLOWED_ORIGINS` är nu
satt i `wrangler.toml` (commit `619e586`). Varken repot eller dokumenten visar att migrationen eller
cache-kontrollen i prod är gjord.
*Förslag:* lägg till en rad med datum och utfall när prod-kontrollen är gjord, eller flytta prod-delen
till en egen obockad punkt.

**2.3 S-48 är bockad, men den gäller inte i produktion förrän Workern deployas.** BACKLOG S-48 och
handoffens öppna tråd säger båda att `wrangler deploy` krävs för att taket 4096 ska gälla. Ingenting i
repot visar att deployen är gjord. Upp till 7 regler i detaljerat läge ryms under 2000, men 8+ klipps
fortfarande i prod tills deployen är gjord.
*Förslag:* notera deploydatum i S-48 när det skett (eller lägg en egen punkt "S-48 deploy").

**2.4 D-3 är bockad trots att dess beslutsfork aldrig skrevs in.** D-3:s *Acceptans/beslut* kräver att
utfallet förs in i ROADMAP beslutsfork 1 och i `oppna-fragor.md`. Inget av det är gjort (se 1.9 och
3.1). Själva cutovern är verifierbar i koden (`frameExtractor.ts` → `selectViaPose`, fallback
`selectViaMotion`), men dokumentationskravet är inte uppfyllt.
*Förslag:* se 3.1.

---

## 3. Milstolpar vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller **inga** milstolpar eller måldatum, så den kategorin är tom för PLAN.md.
De daterade beslutspunkterna ligger i `docs/ROADMAP.md`, och två av dem har passerat:

**3.1 Beslutsfork 1 (pose vs trim-slider): deadline 2026-07-31.** `docs/ROADMAP.md` → *Beslutsforkar*
§1 säger att om D-3-metriken (≥ 80 % av 20 klipp inom ±150 ms) inte är fältkörd senast 2026-07-31 ska
en trim-slider byggas och pose degraderas till overlay. Det som faktiskt hände (BACKLOG D-3,
2026-08-05) var en cutover till pose som primär väg på 3 klipp, utan 20-klippsmetriken och efter
datumet. ROADMAP:s sista rad kräver att filen uppdateras "när en beslutsfork avgörs (datum + utfall)",
men forken står kvar i sin ursprungliga form.
*Förslag:* skriv in utfallet (2026-08-05, pose primär, fältinstrumentering ersätter 20-klippsmetriken)
under fork 1.

**3.2 Beslutsfork 2 (G1-scopefrys): senast 2026-08-15.** ROADMAP §2 säger att ingen ny G1-funktionalitet
läggs till efter M2-metriken eller 2026-08-15, och att all kapacitet sedan går till M5→M6 (Ström B).
Läget per 2026-11-19:
- M2 (≥ 18/20 hands-free) är inte rapporterad uppnådd.
- A-3, A-5 och C-2 är obockade.
- Ström B har inte påbörjats, och `SUPABASE_DISABLED = true` (`src/lib/supabase.ts:22`).
- Arbetet efter datumet är G1-orienterat: S-48 (2026-10-23) och, enligt S-48, `stream-shaft`/S-45.
  S-45 finns inte i BACKLOG.

ROADMAP har ingen statusändring om att frysen inträtt, skjutits upp eller övergetts.
*Förslag:* besluta och skriv in utfallet för fork 2 (frys inträdd / ny deadline / övergiven), och
lägg till S-45/`stream-shaft` i BACKLOG om strömmen är aktiv.
