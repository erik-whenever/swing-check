# SwingCheck — Handoff / Överlämning

> Aktuell kontext för en ny session. Läs tillsammans med [BACKLOG.md](BACKLOG.md) (auktoritativ för gjort/kvar).
> Stabil arkitektur: [../KONTEXT.md](../KONTEXT.md). Senast uppdaterad: 2026-09-13.
>
> **Senast (2026-09-13, stream-shaft):** S-9 första träningsbatchen —
> `scripts/build-training-batch.mjs` drar 150 frames ur `data/shaft/exports/` med evalsetet
> exkluderat → `data/shaft/training/batch-01/` (`batch.zip`, `ids.txt`, `prefill-phase.xml`,
> `labels-frame-meta.json`, `summary.md`). **`reserved-ids.txt` saknas ⇒ exit 1**, avsiktligt hårt.
> Nästa batch plockar automatiskt upp varje `data/shaft/training/*/ids.txt`. Draget är
> `selectCalibrationSet` återanvänd, men med specens målvikter som kvoter och egen seed
> (`0x7ba7c0de`) — delad seed hade dragit batchen mot evalsetets närmaste grannar. **CVAT-
> förifyllningen av `phase` funkar:** *CVAT for images 1.1* med `<tag label="frame_meta">` per bild,
> plus `--labels`-schemat, i ett `cvat-cli task create`. Två fallgropar står i specen — schemat kan
> inte importeras (attribut måste finnas i förväg, annars tas taggarna tyst inte emot) och
> `image/@name` måste matcha bildnamnet i tasken. Verifierat: 150 frames / 150 svingar, alla
> faskvoter exakt, 75/75 web/own, tomt snitt mot `reserved-ids.txt`, omkörning bit-identisk.
> **Bifynd [F4](oppna-fragor.md):** kalibreringssetets `PHASE_QUOTAS` matchar inte specens
> målvikter — loggat, inte rättat (setet är redan annoterat evalset).
>
> **Tidigare samma dag (stream-shaft):** S-8 skärpta annoteringsregler — enbart dokumentation i
> [shaft/annotation-spec.md](shaft/annotation-spec.md), ingen kod. **`phase` annoteras inte längre
> för hand** (fylls från `manifest.json` vid tasksskapande — 58 % enighet var mätningens lägsta
> siffra och uppgiften är omöjlig på en stillbild). **`blur`** har fått en tillämpbar regel:
> gränsen går vid **en linje eller flera**, inte vid hur ful bilden är. **`occluded` vs `visible`**
> skärpt med nyckelmeningen *occluded handlar om punkten, inte om bilden* (synligt skaft + skymd
> greppände = `visible` hosel + `occluded` butt); punkt utanför bildkanten är `outside`.
> **Hoseln** är där skaftets linje slutar vara rak, inte mitt i huvudets suddfläck. Nytt avsnitt
> om att **gå till klippet** (`data/shaft/clips/` vid `tSec`, stega bildruta för bildruta) som
> normal arbetsgång vid tvetydiga frames, plus **"Kalibreringsutfall 2026-09"** med siffrorna bakom
> besluten. **Återstår i S-8:** manuell granskning av rapportens avsnitt 5 + 7, beslut om
> skaftbreddsmålet, och de 3 kalibreringsframes som aldrig kom in i CVAT-tasken.
>
> **Tidigare samma dag (stream-shaft):** S-7 samstämmighetsmätning —
> `scripts/measure-calibration.mjs` jämför de två CVAT-exporterna (`erik.zip`, `lisa.zip`) och
> skriver `data/shaft/calibration/agreement.md`. **Utfallet: punktplaceringen håller, etiketterna
> gör det inte.** Butt median 2,5 px (0,17 % av bildhöjden), hosel 1,9 px (0,13 %), vinkelmedian
> **0,3°** / p90 1,3° / max 2,3° över 81 frames — vinkeln är det som betyder något eftersom
> reglerna mäter vinklar. Men: `phase` samma värde i bara **56/97** frames och `blur` i 76/97,
> och synlighetsflaggan skiljer i ~12 % per punkt (mest `occluded` vs `visible`). `severe blur`
> sticker ut som väntat (butt-median 0,56 % mot 0,14 % för `none`, vinkel 1,1° mot 0,2°);
> **`downswing` gör det inte**, men den hinken är bara 6 frames just för att fasetiketten är så
> omtvistad. **Nästa steg innan produktionsannotering:** skärp `phase`- och `blur`-definitionerna
> och regeln för `occluded` vs `visible` i [shaft/annotation-spec.md](shaft/annotation-spec.md) —
> det är etikettdefinitionerna som är flaskhalsen, inte annotatörernas handlag. Topplistan i
> rapportens avsnitt 7 (15 frames) och skaftlängdslistan (avsnitt 5) är det underlag som ska
> granskas för hand; `096-a36a587d_s00_f01` är värst (47 % skillnad i skaftlängd).
>
> **Tidigare (2026-09-03, stream-shaft):** S-6 kalibreringsset —
> `scripts/build-calibration-set.mjs` drar 100 frames ur ZIP:arna i `data/shaft/exports/`
> (deterministiskt: id-sorterad pool + seedad PRNG, konstanten `SELECTION_SEED`; fasfördelning
> downswing 40/impact 15/top 12/backswing 12/through 9/address 7/finish 5; max 1 frame per sving;
> ~50/50 web/own) och skriver `data/shaft/calibration/` — `calibration.zip`, `reserved-ids.txt`
> och `summary.md`. **`reserved-ids.txt` är bindande:** de 100 ids:en är permanent evalset och
> får aldrig ingå i träningsdata. Körd på riktiga data: pool 1435 frames / 205 svingar → 100
> frames, alla fasmål exakt, 100 olika svingar, 50/50 källa.
>
> **Tidigare samma dag (stream-shaft):** S-4 egen acceptansgrind för datasetextraktion
> (`src/lib/dataset/datasetGate.ts` — `isSwing` orörd, den lösare grinden omprövar bara det
> produktionen förkastade; `clippedTail` och envelopes upp till 12 s släpps in, exkursionsgolvet
> kvar, >3 s taggas `suspectMultiSwing`) och S-5 faskvot som bär över mellan svingar
> (`PhaseQuotaState` in/ut, löpande underskott över hela exporten — annars får `finish` aldrig
> en frame). Se BACKLOG Ström S.
>
> **Tidigare (2026-08-13):** S-2 klipphämtare `scripts/fetch-reddit-clips.mjs`
> (r/GolfSwing publik JSON → `data/shaft/urls.txt` + `sources.json`, för `yt-dlp -a`) och
> S-3 automatisk slow-mo per sving (härledd ur envelope-varaktighet, tröskel 3,0 s;
> `slowmo`+`envelopeDurationSec`+`slowmoMode` i manifestet, override auto/force i UI).

## Tech stack
- **Frontend:** React 19 + TypeScript + Vite 8, Tailwind v4, Zustand (vissa stores `persist`:ade).
- **Backend:** En Cloudflare Worker (`worker/worker.ts`) — proxy mot Anthropic + `/api/log` → D1.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching.
- **Lagring:** IndexedDB (`idb-keyval`) som källa till sanning; Supabase valfri metadataspegling.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`.

## Fungerar

- **Bildruteval via pose-envelope (Ström D, primär väg).** `frameExtractor.ts` → `selectViaPose`
  (`detectSwingEnvelope` + `selectEnvelopeFrames`). Pixel-diff (`selectViaMotion`) är **fallback**
  och triggar bara vid pose-fel eller `envelope.valid === false` — tyst för användaren, men loggad
  (`log.warn('Frame selection', {path:'pose'|'motion'})`) så fallback-frekvensen är mätbar i fält.
  **Fältverifierad på iPhone:** GPU-delegat, 14,9 fps, 18–21 ms inferens.
- Kamera/inspelning, Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- **Vidvinkel (0,5×)** — `settings.wideAngle` (persisterad) → `lib/cameraZoom.ts` sätter
  `zoom` på den **redan aktiva** videospårningen (ingen enhetsväxling; diagnostiken visar
  `min 0.5 / max 10` på bakre trippelkameran). Halverar ungefär nödvändigt avstånd på range.
  Appliceras i `useCamera` **bara när ingen inspelning pågår** — `applyConstraints` formar om
  exakt den spårning MediaRecorder läser, så ett linsbyte mitt i svingen skulle förstöra klippet.
  En växling under en session tappas inte utan **skjuts upp** till nästa inspelningsstart.
  Saknad zoom-capability = tyst hoppa över (WARN en gång). `Camera zoom applied` loggas på
  **WARN** med både begärt och faktiskt värde (`getSettings().zoom`) — Safari får acceptera
  constrainten och ändå behålla linsen, och `matched:false` är enda sättet att se det i fält.
  Toggle: `components/Camera/WideAngleToggle.tsx` (0.5× / 1×, i sökarens nedre högra hörn).
  Testad i `lib/cameraZoom.test.ts` (klampning, saknad capability, avvikande faktiskt värde).
- **Pose-styrd beskärning av analysbildrutor (E-2, sessionsvägen).** `lib/poseCropBox.ts`
  bygger **EN** låda för hela svingen — unionen av alla landmärken över envelopen, aldrig en
  låda per bildruta (rörlig inramning är svårare att bedöma, inte lättare). Marginal 20 % i
  sidled, 12 % topp, ned till markplanet via fotlandmärkena; klampad till bilden genom att
  **glida**, inte krympa.
  **Ingen aspektlåsning (2026-08-11).** Lådan låstes tidigare till källans 9:16, vilket
  gjorde beskärningen verkningslös i produktion: en golfare är hög och smal (kroppslåda
  ≈ 1142 px av 1280), och låst till 0,5625 tvingades bredden till ≈ 642 px av 720 → två
  svingar i rad med `cropAreaPct` 79,6 och 100, `cropReason 'box-too-large'`. Vision
  accepterar godtycklig aspekt; inget krävde ratiot. I stället gäller ett **golv på hur
  smal lådan får bli** — `MIN_WIDTH_TO_HEIGHT` 0,30 (bredd ≥ 0,30 × höjd), som ger klubban
  svängrum utan att dra in bakgrunden. En naturligt bredare låda lämnas orörd. Klampning
  sker per axel, så överhäng i sidled inte längre kostar höjd. **90 %-taket avvisar inte
  längre** — en låda som fyller bilden betyder bara att beskärningen inte ger något, så den
  klampas och används (`'box-too-large'` borttaget; 4 %-golvet och `'box-degenerate'` kvar).
  **Kvalitetsgrinden mäter skelettet, inte lådan:** båda axlarna, båda höfterna och minst
  en fot måste vara närvarande i ≥ 50 % av samplen och ha medelvisibility ≥ 0,6. Area
  grindar *inte* kvalitet — en liten låda är det önskade utfallet på stativavstånd — bara
  ett 4 %-nät under degenererade lådor och ett 90 %-tak. Faller något → hela bilden med
  `cropReason` + `gateDetail` loggat. `poseFrameGrab` beskär via `drawImage`-source-rect, långsida ≤ 900 px,
  quality 0,8. Per sving loggas
  `cropReason`/`cropBox`/`cropAreaPct`/`cropAspect`/`gateDetail`/`outputSize`/`savedPct` på
  `Session swing N analyzed`.
  **Klipp-vägen (`frameExtractor.ts`) är orörd** — den beskärs inte; E-1 (långside-cap) står kvar.
- **Visuell identitet "Club Cream" (2026-08-10).** Krämiga ytor, fairway-grön accent,
  pillerformer, Outfit (självhostat + precachat → identisk rendering offline). Tokens i
  `src/index.css`, primitiver i `src/components/ui/` (`Card`/`Button`/`Chip`/`Segmented`/
  `Toggle`/`ScoreRing`/`Sparkline`). Domfärger (`ok`/`bad`/`gold`/`chart-*`) är frikopplade
  från `data-accent` så "godkänd" förblir grön oavsett vald accent. Två klasser som
  användes men aldrig existerade är nu riktiga: `safe-top`/`safe-bottom` (+ `viewport-fit=cover`
  i `index.html` — utan den är `env(safe-area-inset-*)` alltid 0 på iOS) och `@keyframes fadeIn`.
  **Ej enhetsverifierad** — se [design-system.md](design-system.md) → *Kända avgränsningar*.
- **Kameravyns kontrollmodell (UI-2, 2026-08-11).** Skärmen bär tre saker: sökare,
  **ett** lägesval och inspelningsknappen. Lägesvalet är ett `Segmented`
  **"En sving | Session"** — det enda som ändrar vad inspelningsknappen gör — med en
  förklarande rad under. Att växla till "En sving" är också hur en session avslutas
  (den gamla dubbletten i actionraden är borta). Allt annat som styr *hur* en
  inspelning beter sig — nedräkning, uppläsning på/av + Kort/Detalj, hörlursstyrning —
  bor i `Camera/RecordSettingsSheet.tsx` bakom en kugge; kuggen tonas i accentfärg när
  något där inne avviker från standard. Sökaren visar bara **fångsttillstånd**
  (REC + svingantal), aldrig lägestillstånd.
  **"Hörlursläge" heter nu "Hörlursknappen styr inspelningen"** — `useRangeMode` är ren
  *inmatning* (tyst ljudloop → Media Session `play`/`pause`/`nexttrack`), inte ljud ut;
  det gamla namnet antydde motsatsen och blandades ihop med `ttsEnabled`. Switchen är
  låst på i sessionsläge eftersom `startSession()` tvingar på loopen ändå.
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst; serialiserad kö i sessionsläge.
- Kontinuerligt sessionsläge (D-5) — se *Pågående*.
- i18n (browser-/geo-detektering), tema + accentfärg, PWA-uppdateringsbanner.

### Regressionsharness — verifiera med `npm test`, inte för hand
Frysta landmark-fixturer i `src/lib/__fixtures__/` (`dtl-full`, `dtl-clipped`, `face-on`,
`session-multi`) körs genom exakt produktionskedjan av `poseEnvelopeRegression.test.ts`,
`poseSegments.test.ts` och `liveSwingDetector.test.ts` (golden envelope/impact/frameCount,
±2 frames tolerans). **Detta ersätter den gamla manuella klippverifieringen** — kör `npm test`
före varje ändring i pose-logiken. Nya fixturer exporteras med knappen i dev-previewen
(`FramePreview.tsx`, bakom `VITE_DEV_PREVIEW`). Dok: [pose-detection.md](pose-detection.md).

## Arkitekturbeslut som styr pose-arbetet

- **[ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md) — envelope som primär selektor.**
  Fas-viktad selektion var skör; envelopen (start = address-avfärd via hastighets-onset backad bakåt,
  finish = high-settle *efter* downswing-passagen) är primär. Värsta fall blir "uniform över svingen",
  aldrig "missad impact". **Impact är polish, aldrig bärande.**
- **[ADR-003](decisions/ADR-003-draft.md) — N svingar i en ström** (hela ADR:n byggd 2026-08-08).
  Segmentering (`poseSegments.ts`) wrappar envelope-logiken i stället för att skriva om den:
  stillnadsöar → burstar → `isSwing`-grind per kandidat. Tre bärande beslut:
  1. **Segmentering före envelope** — `detectSwingEnvelope` är singleton-tillstånd och kollapsar tyst
     över flera svingar; den körs oförändrat *per segment*.
  2. **Impact ingår inte i acceptanskriteriet** — grinden vilar på envelope-struktur
     (valid, ej clippedTail, varaktighet, exkursion, peak, cooldown).
  3. **Handpositionen är en visibility-viktad mittpunkt av båda handlederna.** `primary ?? backup`
     bytte handled per frame och injicerade avståndet mellan handlederna som skenbar hastighet —
     klippets högsta, tagen för impact efter varenda sving.

**Durabla principer** (dyrköpta, gäller framåt): bind gränser till svingsekvensen, aldrig till en
enkel tröskel-passage; varje gräns med ett minimum måste också ha ett maximum; kompensera aldrig en
trasig signal med lösare trösklar.

## Pågående

### Ström D — klar och mergad till `main`
Envelope-selektionen är i produktion, fältverifierad, enhetstestad och regressionsskyddad.
Detaljerad patch-för-patch-historik finns i [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md),
[ADR-003](decisions/ADR-003-draft.md) och [BACKLOG.md](BACKLOG.md) D-1…D-4 — den duplicerades inte hit.

### D-5 — kontinuerligt sessionsläge (ADR-003 §4 + §5)
- **Pass 1 klar** — `store/session.ts` bär `swings: SessionSwing[]`, en livscykel per sving.
  Den globala `isAnalyzing` är borta; det sessionsvida härleds via `selectAnySwingBusy`.
  Ett klipp = en session med exakt en sving → enkelsvingsflödet funktionellt oförändrat.
  `SwingRecord`-formatet orört, sparad historik läses som förut.
- **Pass 2 klar** — live-pose utan seek: `poseRingBuffer.ts` (bunden landmark-historik, ~30 s,
  konstant ~1,9 MB), `livePoseLoop.ts` (rAF + tvåstegstakt 5→15 fps vid rörelse),
  `liveSwingDetector.ts` (inkrementell `detectSessionSwings` + dedupe). Live ger **exakt** samma
  resultat som batch mot alla fixturer. Detektionskostnad 0,4 ms avg. Latens 0,6–1,1 s efter impact
  och det är strukturellt korrekt — grinden förkastar `clippedTail`, så finishen måste sätta sig först.
- **Pass 3 — pågående (kod committad `cbade28`, ej fältverifierad).** Kedjan
  `detektor (rAF)` → *klipp fönster ur chunk-ringen* → `analyskö (seriell)` → `TTS-kö (FIFO)`.
  `videoChunkRing.ts` (bundet ~30 s-fönster, **init-segmentet pinnas** — utan `ftyp`/`moov` är senare
  chunks obrukbara bytes), `analysisQueue.ts` (en sving i taget mot Vision, ett fel stoppar aldrig kön),
  `useSessionCapture.ts` (orkestrering), `Session/SessionSwingList.tsx` (rad per sving, status + latenskedja).
  **`// OSÄKER:`** fMP4-fönsterklippet är giltigt per konstruktion men **ej verifierat på iOS-hårdvara**
  — probe + `Session swing N captured`-loggen finns för att göra ett fel synligt i stället för tyst.
  **Kvar: Erik kör en session på iPhone, 3 svingar utan att stoppa inspelningen**, och läser talad
  feedback per sving, sessionsvyns rader, latenskedjan samt `windowMb`/`ringRetainedMb`.
  - **Avkodningsbugg fixad (2026-08-09).** Fältfallet `windowSec [3.25, 6.42] · chunks 3 ·
    headerPrepended true` gav 17 identiska adressbilder och "no visible swing movement" från Vision:
    `materialize()` valde bara de *överlappande* chunksen, och iOS Safaris ~1 s-chunks (oavsett
    `TIMESLICE_MS=100`) saknar egna nyckelbilder — de kräver kedjan från init-segmentet. Nu tas
    **alla** chunks från `chunks[0]` fram till fönstrets slut; `truncatedStart` betyder bara
    "starten är evict:ad". Kostnaden syns som `leadInChunks` i `Session swing N captured`.
    Retentionen (30 s) sätter fortfarande minnestaket.
- **Pass 4 klar (2026-08-09) — sessionssammanfattning.** `lib/sessionStats.ts` (ren
  modul-singleton, ingen ny store) samlar under sessionen och loggar **en WARN-rad
  `Session summary`** vid `endSession()`: `durationSec`, `swingsDetected/Analyzed/Failed`,
  `detectedMs`/`framesMs`/`visionMs` som `{median, p95}`, `spokenMedianMs`, `poseDetectionRate`,
  `achievedFpsMedian`, `ringEvicted`, `maxWindowMb`, `totalCostUsd`, `quickMode`,
  `medianOutputTokens`, `medianInputTokens`, `activeRuleCount`, `failureReasons`.
  **Det är raden att utvärdera ett fälttest mot** — de per-sving-rader som redan finns är rätt
  granularitet för en sving och fel för en 20-minuterssession. Livscykeln ligger i storen
  (`startSession`→`begin()`, `endSession`→`end()`, `lastSummary` för UI:t) eftersom `endSession`
  anropas från tre ställen. Additivt: `api.ts` `options.onUsage` (kostnaden var beräknad men
  aldrig returnerad) och `useLiveSwingDetection.onStats` (vidarebefordrar `LivePoseLoop.onStats`).
  Samma siffror visas på kameravyn efter avslutad session via `Session/SessionSummaryCard.tsx`.
- **Token-/kostnadsdata synlig i fält (2026-08-11).** `analyzeSwing response received` och
  `💰 Analysis cost` gick från INFO till **WARN** — logpanelen på telefonen visar bara WARN, så
  effekten av varje token-/latensoptimering var osynlig just där den mäts. Båda kör en gång per
  sving. Svarsraden bär nu även `activeRuleCount`, `frameCount` och `tokensPerFrame`
  (= `inputTokens / frameCount`; prompt + system ligger före cache-brytpunkten, så `inputTokens`
  är i praktiken bildkostnaden) bredvid befintliga `visionMs`/`outputTokens`/`maxTokens`/`quickMode`
  — generering dominerar anropet, och output skalar med regelantal och det schema `quickMode`
  väljer, så latens går inte att förklara utan requestens form. `AnalysisUsage` utökad med samma
  fyra fält; `sessionStats.recordCost(usd)` → **`recordUsage(usage)`**, och sammanfattningen bär
  `quickMode`/`medianOutputTokens`/`medianInputTokens`/`activeRuleCount` (medianer av samma skäl som
  `visionMs`; requestens form är sista sedda värdet, eftersom den kan ändras mitt i en session).
  Ingen logikändring — bara loggnivå och loggfält. `npm test` 149/149, build + lint rena.
- **Impact-grind i sessionsläget (2026-08-11).** `runSwing` analyserar bara svingar vars
  envelope bär en **bekräftad impact** (`envelope.impact !== null`) — saknas den hoppas
  bildruteextraktion, Vision-anrop och tal över helt. Fältdatan som fällde beslutet: en falsk
  detektion (någon gick förbi kameran) gav `impactSec null · verticalExcursion 0,088 ·
  peakSpeed 0,72` och kostade **$0,0408 — mer än en riktig sving**, eftersom det utsträckta
  envelope:t gav en beskärningslåda på 93,9 % av bilden. Den lade sig dessutom i den seriella
  kön framför riktiga svingar och lästes upp i hörlurarna. Samtliga falska detektioner i
  dagens loggar har `impactSec null`; riktiga svingar har bekräftad impact.
  Ny sving-status **`skipped`** (skild från `failed` — inget gick fel), nytt
  sammanfattningsfält **`swingsSkippedNoImpact`** (räknas inte som fel och syns inte under
  `failureReasons`), och WARN-raden `Session swing skipped — no confident impact` bär
  `swingIndex`/`envelopeSec`/`envelopeDurationSec`/`verticalExcursion`/`peakSpeed`
  (+ `impactReason`/`clippedTail`) — datan som avgör den **öppna** frågan om grinden avvisar
  riktiga svingar på rangen. Avstängbar via ny inställning `requireImpact` (default `true`) i
  settings-storen; ingen UI, den sätts från storen. **Klipp-vägen i `AnalysisView` är orörd** —
  där har användaren uttryckligen bett om en analys (worst-case-wins). `npm test` 164/164,
  build ren, lint 0 nya.
- **Bildrutebudget 20 → 32 + fasklustring (2026-08-11).** `ANALYSIS_FRAME_COUNT` höjd
  eftersom priset per bildruta flyttat sig: 20 sattes vid 1 229 tokens/bild, efter
  beskärningen mäter en bild 213–231. Vid ~220 blir 32 bilder ~7 000 input-tokens —
  **mindre än den dyraste sving vi mätt vid 20 bildrutor**, så budgeten är köpt ur
  beskärningen, inte lagd ovanpå. Samtidigt lade selektionen alltid klustret på impact,
  medan regler om **downswing-sekvensering** (startar höften före axlarna?) utspelar sig i
  övergången topp→downswing där nästan inga bildrutor hamnade — användaren fick
  `cannot_determine` på just den regeln i produktion. `selectEnvelopeFrames` tar nu
  `options.clusterPhases`: klusterbudgeten (fortsatt 0,4-andel) delas jämnt över de
  distinkta faser de aktiva reglerna tittar på, var och en centrerad på fasens mittpunkt i
  envelopen. **Utan `clusterPhases` är beteendet bit för bit som förut** (kluster på impact
  när impact är bekräftad) — klipp-vägen skickar inget och står därmed orörd.
  Klusterspacing 0,06 → **0,033** och `max(…, sampleDt)`-golvet borttaget: placeringen
  *härleds* ur pose (15 fps, dt 0,067) men bildrutan *hämtas* ur videon (30 fps), så golvet
  slängde halva källans tidsupplösning. Faslabel-toleransen behåller `sampleDt`-golvet — den
  frågan (*är den här rutan i toppen?*) begränsas av pose. Nytt per sving i loggen:
  `framesRequested`, `framesAfterDedupe`, `clusterPhases`, `clusterAllocation`, `allocation`.
  Ny `poseEnvelopeSelection.test.ts` (9 test); regressionsgoldens omräknade (26/25/26).
  `npm test` 187/187, build ren, lint 0 nya.

### Ström A — Voice-start
A-1 + A-2 klara (`useMicTrigger`, `EnergyTrigger` + `useEnergyTrigger`): adaptiv amplitud-trigger med
cooldown, kalibrering och TTS-ack. **Ej enhets-/fältverifierad** (mäts i A-5). Nästa: A-3 (röststart i
sessionsläge + `swingStartTimestamp`). Detaljer: [voice-start.md](voice-start.md).
> Notera: ADR-003 omdefinierar röst till **sessionskontroll** ("starta session"), inte per-slag-trigger.

### Ström S — Skaftdetektering (dataset)
S-1 klar (2026-08-12): dev-vyn **⚗︎ Dataset extractor** (`src/components/Dev/`, bakom
`VITE_DEV_PREVIEW`) kör produktionskedjan över valda videofiler och exporterar en ZIP med
frames + `manifest.json` för CVAT-annotering. Produktionskedjan är oförändrad — **två** steg är
dev-only: den lösare grinden (S-4) och cullen till 7 frames/sving mot specens fasvikter (S-5).

S-4 (2026-09-03): `datasetGate.ts` accepterar det produktionen förkastar när `envelope.valid`,
varaktigheten ligger i [0,6 s, 12,0 s] och topphastigheten klarar 0,4 × refSpeed — alltså
`clippedTail`, dålig synlighet, långa nedsving och cooldown. Exkursionsgolvet (0,08) är kvar:
bollplock är inga svingar. Envelopes > 3 s taggas `suspectMultiSwing` i stället för att delas.
`gate`/`clippedTail`/`hasConfidentImpact`/`suspectMultiSwing` per frame i manifestet.
**Kompromiss:** tre av produktionens trösklar är modulprivata och speglas i `datasetGate.ts`
(filen är låst för Ström S) — driften bevakas av bisektionstester mot riktiga `isSwing`.

S-5 (2026-09-03): faskvoten balanseras över hela exporten via `PhaseQuotaState` som trådas
in och ut ur `cullToPhaseTargets`; per sving går det inte, `finish` (6 % av 7) avrundas då
alltid till noll. Mätt över 10 svingar: max 0,9 pe från målen.

**Ej körd på riktiga klipp än.** Spec + körinstruktion:
[shaft/annotation-spec.md](shaft/annotation-spec.md); status: [BACKLOG.md](BACKLOG.md) Ström S.

## Öppna trådar

- **Beskärningen är ej fältverifierad efter borttaget aspektlås (2026-08-11).** Första
  fältdatan fällde själva geometrin, inte grinden — se *Fungerar* ovan. Läs `cropReason` i
  sessionsloggen: allt annat än `ok` betyder att hela bilden skickades, och `gateDetail`
  säger vilken kroppsdel som fällde den (med siffror, även vid pass). `cropAreaPct`,
  `cropAspect` och `savedPct` visar vilka värden riktiga svingar landar på — en down-the-line-
  sving ska nu ge en hög smal låda nära golvet 0,30; kommer aspekten tillbaka nära källans
  0,5625 är det något som fortfarande fyrkantar lådan. Grindens trösklar (0,3 / 0,5 / 0,6)
  och `MIN_WIDTH_TO_HEIGHT` är valda på resonemang och ska tunas mot den datan.
- **Impact-grinden är ej fältverifierad (2026-08-11).** Den avvisar allt utan bekräftad
  impact i sessionsläge, valt på att *varje* falsk detektion i dagens loggar saknade impact —
  men inte på data om hur ofta riktiga svingar saknar den på rangen. Läs
  `Session swing skipped — no confident impact` och sammanfattningens `swingsSkippedNoImpact`:
  ligger antalet nära antalet verkliga slag är grinden för strikt → sätt `requireImpact: false`
  i settings-storen och granska `impactReason` i de skippade raderna.
- **Termik vid långa sessioner otestad.** Live-inferens + analysanrop delar GPU; ingen mätning finns
  av vad 10–20 minuters kontinuerlig session gör med telefonens temperatur och takt.
  `Live pose stats` (WARN, var 5:e sek) loggar `achievedFps`/`saturated` för just detta.
- **Pose körs två gånger per klipp** — en gång för selektionen (`poseTrajectory`) och en gång för
  skelett-overlayen i previewen. Dubbelkostnaden är känd och inte adresserad.
- **Supabase: RLS på `swing_records` är på men saknar policies** → alla läsningar nekas och faller
  tyst tillbaka till IndexedDB. **Ingen autentisering** — rader har `user_id = null`. (Ström B)
- **Namnkrock: branchen `stream-e`** användes för D-5-arbetet, men `stream-e` i BACKLOG är
  **Ström E — Vision-kostnad** (E-1 resolution-cap). Döp om branchen eller strömmen innan E-1 startar.
- **iOS Safari PWA ej verifierad** (installation/standalone/splash/safe-area). (Ström C)
- Takt-trösklarna i live-vägen är härledda ur **klipp-fixturer, inte live-kamerabrus** — `// OSÄKER:`-märkta.
- `analysisAngle` ligger fortfarande globalt, inte per sving.

## Bakgrund: varför pixel-diff inte räcker (fallback-vägen)
> Gäller nu **enbart** fallbacken. Full historik: [ADR-0001](adr/0001-motion-based-swing-detection.md).

En pixel-diff-metrik **kan inte se ballträffen**: vid impact rör sig bara en tunn, snabb klubba, så
impact ligger i en motion-*dal* medan follow-throughs kroppsrotation dominerar kurvan. "Motion-toppen
= impact" är därför fundamentalt fel. Fallbacken ankrar i stället på **address-stillheten** (längsta
stilla sekvensen; impact ≈ första rörliga bildrutan efter) och tar ett ±1,2 s-fönster runt den.
Tunables överst i `frameExtractor.ts`. Detta är precis begränsningen som motiverade Ström D.

**Verifiering:** `npm run dev` (aldrig en build — SW-cache serverar gammal kod).
`VITE_DEV_PREVIEW=true` ger bildrute-preview, segmenteringsvy, ⚗︎ Dataset extractor och
🐞 Logs-panelen (visar WARN).

## Komponentstruktur
> Endast de mest centrala filerna; full karta finns i koden.

- `src/App.tsx` — vy-routing via `session`-storens `view` (ingen router).
- `src/store/` — `session` (`swings: SessionSwing[]`, ADR-003 §5.4), `settings`, `rules`, `onboarding`, `toast`.
- `src/hooks/` — `useCamera` (`RecordMode`: klipp **och** session/chunk-ring), `useHistory`, `useRangeMode`,
  `useMicTrigger`/`useEnergyTrigger` (Ström A), `useLiveSwingDetection` (D-5 p2), `useSessionCapture` (D-5 p3).
- `src/lib/` — `frameExtractor`, `api`, `prompt`, `cameraAngle`, `cameraZoom`, `supabase`, `tts`, `i18n`, `logger`, `geo`,
  `audioTrigger`; pose: `poseDetector`/`poseTrajectory`/`poseConnections`/`poseEnvelope`/
  `poseEnvelopeSelection`/`poseSegments`/`poseFrameGrab`/`poseCropBox`; live: `poseRingBuffer`/`livePoseLoop`/
  `liveSwingDetector`; session: `videoChunkRing`/`analysisQueue`/`sessionStats`;
  `dataset/` (dev-only, skaftannotering: `extractDataset`/`datasetGate`/`phaseQuota`/`datasetPhase`/`zip`).
- `src/components/ui/` — delade primitiver (`Card`, `Button`, `Chip`/`VerdictDot`, `Segmented`,
  `Toggle`, `ScoreRing`, `Sparkline`/`VerdictBars`). Allt kortformat/pillerformat går via dessa.
- `src/components/` — `Camera/`, `Analysis/`, `Session/`, `Rules/`, `History/`, `Home/`, `Settings/`, `Onboarding/`,
  `Dev/` (dev-only: `DatasetExtractorView`, bakom `VITE_DEV_PREVIEW`).
  `Camera/RecordSettingsSheet.tsx` håller allt som styr *hur* en inspelning beter sig;
  `CameraView` håller bara lägesvalet och inspelningsknappen (UI-2).
- `worker/worker.ts` — Anthropic-proxy + `/api/log` (D1).

## Miljövariabler
| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Cross-device-historik (med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Bildrute-preview, segmenteringsvy, ⚗︎ Dataset extractor + 🐞 Logs-panel. |
| `VITE_APP_VERSION` | nej | Sätts av bygget (`<paketversion>+<git sha>`); skrivs i skaftdatasetets `manifest.json`. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |
| `ALLOWED_ORIGINS` | **ja i prod** (Worker) | Kommaseparerad origin-allowlist. Osatt → endast localhost-origins ⇒ prod 403:ar. |
| `MODEL_ID` | nej (Worker) | Modellen proxyn pinnar till. Default `claude-sonnet-4-5`. |
| `MAX_TOKENS` | nej (Worker) | Tak för `max_tokens`. Default 2000. |
| `BODY_MAX_BYTES` | nej (Worker) | Body över detta → 413. Default 30 MB. |
| `DAILY_CALL_CAP` | nej (Worker) | Proxy-anrop per UTC-dygn före 429. Default 300. |

> Worker-vars sätts i `worker/wrangler.toml` (`[vars]`); secrets med
> `npx wrangler secret put <NAMN>`. Nya D1-tabellen `api_usage` kräver
> `npx wrangler d1 migrations apply swingcheck-logs --remote`.

## Säkerhetsmodell (Worker)
Worker-URL:en ligger i klartext i PWA-bundeln, så proxyn är **inte** en passthrough (W-1, stänger
[R2](reviews/ARCHITECTURE_REVIEW_2026-07.md)). Fyra lager i `worker/worker.ts`, billigast först:

1. **Origin-allowlist.** `Origin` matchas exakt mot `ALLOWED_ORIGINS` och eko:as tillbaka i
   `Access-Control-Allow-Origin` bara vid träff — annars 403 utan ACAO-header. `Vary: Origin` på
   allt; preflight följer samma regel; gäller även `/api/log`. Undantag: `GET /api/log` utan
   `Origin` (curl) släpps igenom, vaktad av `LOG_READ_KEY` i stället. **Fail-closed:** osatt
   `ALLOWED_ORIGINS` ⇒ bara localhost tillåts, prod 403:ar. Lägg in appens egen origin även när app
   och Worker delar domän — webbläsare skickar `Origin` på same-origin-POST också.
2. **Storleksgräns.** `Content-Length` och sedan faktiskt antal bytes mot `BODY_MAX_BYTES`, **före**
   `JSON.parse` → 413.
3. **Server-side-pinning.** Klientens `model` ignoreras (`MODEL_ID` används); `max_tokens` **klampas**
   till `MAX_TOKENS` (klienten får be om mindre — quick mode skickar 600 — aldrig mer).
   `system`/`messages`/`cache_control` skickas vidare **byte-för-byte**: prompt-cachningen nycklar på
   exakt prefix, så minsta omskrivning där gör varje analys till en cache-*write*. Regressionsvakt:
   `worker/worker.test.ts`.
4. **Dagligt tak.** `api_usage(day, calls)` i D1, upsert per proxy-anrop; över `DAILY_CALL_CAP` → 429
   utan upstream-anrop. **Saknad eller trasig DB → warn + släpp igenom** (avsiktligt fail-open —
   taket skyddar plånboken men får aldrig vara det som stoppar en svinganalys).

Ingen auth i proxyn — den är onödig för G1 (en användare, känd origin). För G2 (delade konton) blir
origin-kollen otillräcklig och behöver kompletteras med Supabase-session, se Ström B.

> **Pose-assets:** `public/wasm/` + `public/models/*.task` är gitignorade och byggs av
> `npm run pose:assets` (körs som `prebuild`). Saknas de i en deploy dör pose-init på båda delegaterna.
