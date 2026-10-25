# SwingCheck — Handoff (nuläge)

> Nuläge för en ny session, **max 60 rader**. Gjort/kvar: [BACKLOG.md](BACKLOG.md). Vad/varför: [../KONTEXT.md](../KONTEXT.md).
> Det som trängs ut härifrån flyttas till [archive/handoff-historik.md](archive/handoff-historik.md) (allt t.o.m.
> 2026-10-25 ligger där, inklusive webbappens tekniska kontext). Senast uppdaterad: 2026-10-25.

## Nu (2026-10-25, `stream-native`)
- **Betan är definierad och är iOS** (Erik 2026-10-25): design, uppladdning → bedömning, egna eller
  rekommenderade regler, livesession med feedback i hörlurarna, skälig kostnad och tid. Skär-lista och
  innehåll: [KONTEXT → Betan](../KONTEXT.md#betan-ios).
- **Ström N, ordning:** N-3.2-diagnosen → N-3.5 + N-3.6 (ren JS) → N-3.7 + N-3.8 (Mac) → N-3.4 och resten av
  iOS-kedjan. Android-prestandan (N-8) och skaft Android (N-3.3) är utanför betan.
- **N-3.2 `[~]`:** koden är klar, instrumenteringen för diagnosen också ([pose-android.md §9](native/pose-android.md)).
  Mätning 1 på Galaxy A16 4G: 4,55 fps, `inferMs` 183 ms i median, `convertMs` 5,7 ms, paritet på CPU 1,1e-5.
  Huvudmisstanke: Java-API:ts CPU-väg kör XNNPACK med en tråd. **Nästa:** Erik kör §9.4, sedan rotorsak med
  siffror. Fixen görs i N-8, inte nu.
- **N-3.5 `[~]` (dirigent 2026-10-25):** språk som parameter (prefix språkoberoende), `core/mediaRetention`
  (300 MB, video först), appens `coreSetup`/`mediaStore`. Workern ger 403 utan `Origin`; appen skickar
  `swingcheck://se.swingcheck.app`, som måste in i `ALLOWED_ORIGINS` före första analysen (`[?]` till Erik).
  Webbens historik följer nu samma MB-policy (`src/lib/historyRetention.ts`, `videoPurged`/`framesPurged` additivt i `SwingRecord`).
- **D-1 `[📱]`:** skissförslaget ligger i [design/d1/](design/d1/README.md); Erik granskar mot listan i README:n.
  Volt `#D6F03A` reserverad för det maskinen ser; livesessionen alltid mörk och läsbar på 3 m.
- **V-1 `[~]`:** verktyg och metod klara ([eval/v1-facit.md](eval/v1-facit.md)); väntar på Eriks urval och facit
  plus budgetgodkännande ($8 för 120 anrop). Inget kört. Live-körning vägrar om manifest/facit inte är committade.
- **N-7 `[x]`:** webben och appen hämtar pose-modellen från samma versionsadress och sha256 (`modules/pose/models.json`).
- **F-1 `[~]`:** ADR-0005 accepterad + `recommendRules` i core (oanvänd i appen). V-1-grinden tom tills facit finns.
  `lib-forward-shaft-lean` är taggad DTL fast den syns face-on — noterat, inte ändrat.
- **W-2 `[📱]`:** Worker-delen klar på `stream-native` men **ej deployad**: tak per installation (40 anrop /
  400 000 tokens/dygn, D1 `install_usage`, migrering 0003) + appens origin i `ALLOWED_ORIGINS`. D1-bindningen var fel
  (`swingcheck-logs`, koden läser `DB`) sedan `619e586` → loggar och globala taket har varit av i prod; rättat, slås på
  vid deploy. Erik kör deploy enligt [identitet-w2.md](native/identitet-w2.md#deploy-erik-kör-lokalt). Dev-klienten måste byggas om.
- **Blockerat:** N-3.2 `[📱]` (Eriks mätning), N-3.7/N-3.8 `[📱]` (Mac),
  N-4 `[📱]` (posedatan finns bara lokalt). Dirigenten 2026-10-25: inget oblockerat kvar i N/V/D/F/W-2.
- **N-3.7 `[~]`:** `.mlpackage` fp32/fp16 klara ([coreml-export.md](shaft/coreml-export.md)); pariteten väntar på Mac.
- **Nya spår (bara spec, BACKLOG):** V-1 facit för domkvalitet → V-2 modellval, D-1 design (skisser först),
  F-1 rekommenderat regelset, W-2 identitet per installation (före N-6). N-3.5 har fått språk som parameter och
  lagring efter MB. **Inget V-körs mot Claude utan Eriks budgetgodkännande.**

- **N-3.6 `[~]` (körning 5):** `src/ui/`, `src/state/`, `src/screens/` (sju rena skärmar inkl. Livesession), `src/app/` (React Navigation v7, entry `src/app/App`; DevScreen = långtryck på Historik i dev) och `src/tts/` (expo-speech, gemensam kö, "Läs upp" kopplad; Livesession på fliken Session utan pipeline) klara; `RuleLibraryScreen` finns ej inkopplad. Kvar: koppla biblioteket, uppladdningspipeline, livepipeline (N-3.4). **Dev-klienten måste byggas om** (screens, safe-area, expo-font, svg). Rotens `npm ci` i molnet kräver `PUPPETEER_SKIP_DOWNLOAD=1`; CI installerar `apps/mobile` före vitest.

## Arkitektur i en rad
`apps/mobile` (Expo 58 / RN 0.88 / VisionCamera 5 / Nitro 0.37) med egna Nitro-moduler `pose`, `shaft`
(och snart `capture`), domänlogik i `packages/core` (`@swingcheck/core`), Anthropic via Workern
(`worker/worker.ts`). Webben (PWA i `src/`) lever kvar som referens och för dataset-/annoteringsverktygen.

## Att veta innan du börjar
- **Kör bara en Metro åt gången** (spikens på 8081 gav iOS-kraschen i N-3.1). `apps/mobile` kör på 8082.
- **Verifiering:** rotens `npm test` (vitest), `npm run lint`, `npx tsc -b`, och `npx tsc --noEmit` i `apps/mobile`.
  CI kör samma fyra på push (`.github/workflows/ci.yml`). Lint är rent och `scripts/*.test.mjs` laddar sedan
  2026-10-25. `mp4Probe.local.test.ts` (bara lokalt) kan slå i 5 s-timeouten under full svit (8 228 småläsningar med `decodeMebx`); ej åtgärdat.
- **`origin/stream-native` har `ee746f9 " ka"`**, som lokalt ersattes av `98017c7` med identiskt träd. Push
  kräver att Erik väljer väg (merge `-s ours` eller `--force-with-lease`); ingen session pushar själv.
- **Tomma mappar** `C:\SwingCheck-{coreml,grab,pose}` från mergade worktrees kan tas bort när inget låser dem.
- **Lokala modellfiler och data** (`public/models/*.onnx`, `data/`) och `yt-dlp.exe` (klipphämtningen) är gitignorerade och finns bara på Eriks dator.

## Öppna frågor och horisont
- **F7–F9** (skaftets svikt, `hosel` som `occluded`, `club` som attribut) från batch-03: otriagerade, ingen
  implementering nu ([oppna-fragor.md](oppna-fragor.md)).
- Paketnamn `swingcheck-temp` / version `0.0.0` — städa inför TestFlight.
- [ROADMAP.md](ROADMAP.md) (2026-07) beskriver webbens ordning och är inaktuell för ström N.
