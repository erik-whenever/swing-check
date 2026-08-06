# ADR-003 (UTKAST) — Kontinuerligt sessionsläge: från "ett klipp = en sving" till N svingar i en ström

- **Status:** **Utkast / ej beslutad.** Underlag för beslut. Ingen kod ändrad.
- **Datum:** 2026-08-06
- **Ström:** D (pose-estimering) + ny ström för sessionsfångst
- **Bygger på:** [ADR-002](ADR-002-stream-d-envelope-inversion.md) (envelope som primär selektor,
  cutover D-3), [ADR-0001](../adr/0001-motion-based-swing-detection.md) (pixel-diff, nu fallback).
- **Rör inte:** envelope-logikens *inre* kontrakt. Utkastet föreslår att `detectSwingEnvelope`
  behålls oförändrad och **wrappas**, inte skrivs om.

---

## Kontext

Produktvisionen: golfaren står kvar vid tee, kameran spelar in kontinuerligt, appen hittar
varje sving automatiskt och ger feedback direkt efteråt. Ingen tap-to-start, ingen röst-trigger
per slag. Röst blir **sessionskontroll** ("starta session", "avsluta"), inte per-slag-trigger.

Dagens kedja antar **ett klipp = en sving** i varje led:

```
MediaRecorder (hela klippet i RAM)
  → extractPoseTrajectory (hela blobben, seek-per-sampel, cap 240 sampel)
  → detectSwingEnvelope (EN envelope över hela spannet)
  → selectEnvelopeFrames (20 frames uniformt över den envelopen)
  → analyzeSwing (ett Vision-anrop)
  → EN currentAnalysis i session-store
```

Sessionsläget som finns idag (`sessionActive`, `autoRecordPending`) automatiserar bara
*omstarten* av en klipp-per-sving-loop. Det är inte kontinuerlig fångst.

## Problem

`detectSwingEnvelope` letar **en** envelope över hela spannet och har inget begrepp om
"ingen sving här" eller "flera svingar här". Mätt (probe mot `__fixtures__/dtl-full.json`,
144 sampel, envelope `[6.78 → 8.38]`, impact 7.85):

| Indata | Resultat | Kommentar |
| --- | --- | --- |
| 1 sving | `[6.78 → 8.38]`, impact 7.85, confident | korrekt |
| 2 svingar (samma fixtur ×2) | `[6.78 → 8.38]`, impact 7.85, `valid: true` | **sving 2 försvinner tyst** |
| 3 svingar (×3) | `[6.78 → 28.41]`, impact 27.87, `downswingSec = 20.36`, "confident" | **envelopen spänner över alla tre; 20 frames ≈ 1 fps** |

Det farliga är inte att det blir fel — det är att det blir **tyst** fel: `valid: true`,
`impactReason: "confident"`, ingen fallback triggar, `path: 'pose'` loggas som lyckad.

## Root cause

Envelope-detektorn är byggd på **globala** statistikmått och **singleton-tillstånd**:
en `peakSpeed` normaliserar alla trösklar, en address-platå, en `startIdx`, en `passIdx`,
en `finishIdx`, ett `addressY`. Alla dessa är korrekta *inom en sving* och meningslösa
över en ström. Dessutom saknas **övre** gränser genomgående (`MIN_DOWNSWING_SEC` finns,
ingen `MAX`; envelope-varaktigheten är obegränsad) — därför kan en 20-sekunders "downswing"
passera som confident.

Sekundär root cause i pipelinen ovanför: `MAX_SAMPLES = 240` i `poseTrajectory.ts` gjorde att
en 4-minutersström samplades i **1 Hz** — en hel golfsving blev 1–2 sampel.
**Åtgärdad 2026-08-06** (se *Genomfört* nedan): taket är nu tidsbaserat
(`MAX_ANALYSIS_SEC = 300`) och samplingstakten ligger fast på 15 fps oavsett klipplängd.

## Beslut (föreslaget)

**Wrappa, skriv inte om.** Inför ett *segmenteringssteg före* envelope-detektionen och
behåll `detectSwingEnvelope` som den är — den får då exakt det kontrakt den redan
uppfyller (en adress, en sving, en finish).

```
rullande PoseSample-ringbuffert (live)
  → segmentSwingCandidates()      ← NY: stillhet/hastighet, ren funktion
  → per segment: detectSwingEnvelope()   ← OFÖRÄNDRAD
  → isSwing() kvalitetsgrind       ← NY: förkastar bollplock/waggle/gester
  → per accepterad sving: selectEnvelopeFrames + grab + analyzeSwing
  → kö av per-sving-resultat i store
```

### 1. Segmentering (ny, ren funktion — `poseSegments.ts`)

1. Bygg wrist-serien exakt som idag (tracked wrist, interpolate, smooth) men med en
   **robust global referenshastighet** `refSpeed = p95(speedSm)` i stället för `max`.
   (`max` låter strömmens hårdaste driver sätta tröskeln för alla efterföljande chip.)
2. Klassa varje frame QUIET/MOVING mot `refSpeed × ADDRESS_SPEED_FRAC`.
3. Hitta **stillnadsöar** ≥ `MIN_ADDRESS_SEC`.
4. Kandidatsegment = rörelse-burst mellan två stillnadsöar, plus padding
   (`MIN_ADDRESS_SEC` före, `~1 s` efter) så segmentet innehåller den adress och den
   settle-finish envelope-detektorn kräver.
5. Grovgallra bursts på varaktighet (`0.7–3.0 s`) och topphastighet (`≥ 0.4 × refSpeed`).

### 2. Per-segment envelope

`detectSwingEnvelope(samples.slice(segStart, segEnd))` — oförändrad. Alla globala mått
blir per-segment-mått automatiskt, vilket är precis vad de ska vara.

### 3. Kvalitetsgrind `isSwing(envelope)` (ny)

Förkastar allt som inte är en sving:

| Test | Gräns | Fångar |
| --- | --- | --- |
| `valid === true` | — | otolkbart |
| `clippedTail === false` | — | rörelse utan fullföljd |
| `addressY − apexY ≥ MIN_VERTICAL_EXCURSION` | 0.08 | **bollplock** (händer går NED, inte upp) |
| envelope-varaktighet | 0.7–3.0 s | **waggle** (för kort), gå-runt (för långt) |
| `impact.downswingSec` | 0.12–0.6 s | **NY övre gräns** — stänger 20.36 s-buggen |
| `peakSpeed ≥ k × refSpeed` | k ≈ 0.4 | gester, vinkning |
| `visibleFrac` per segment | ≥ 0.5 | golfaren ur bild |
| cooldown mot föregående accepterad impact | ≥ 2 s | dubbelräkning |

**Ny durabel princip (fortsättning på ADR-002:s):** *varje gräns som har ett minimum måste
också ha ett maximum.* Ett ensidigt intervall degraderar inte — det kollapsar tyst.

### 4. Strömmande bearbetning (ersätter seek-and-grab för detektion)

- Pose körs på **live-videon** (`detectForVideo` mot `<video>`-elementet i en rAF-loop),
  inte genom att seeka en dold `<video>`. Seek är den dyra delen.
- Landmarks hålls i en **ringbuffert** (~30 s), inte hela sessionen.
- Video hålls i en **chunk-ringbuffert** från `MediaRecorder` (tidsstämplade `ondataavailable`-
  chunks), så bara ~10 s runt varje detekterad sving materialiseras till en blob.
- Två-stegs vakt för batteri/termik: låg takt (~5 fps pose eller den befintliga pixel-diff-
  metriken) som vakt, höj till 15 fps först när rörelse detekteras.

### 5. Feedback per sving

- Frame-grab + Vision-anrop **per accepterad sving**, i en kö (sving N+1 får detekteras
  medan N analyseras).
- Session-store: `currentAnalysis: SwingAnalysis | null` → `swings: SessionSwing[]` med
  status `detected | extracting | analyzing | done | failed`.
- TTS serialiseras — två svar får aldrig tala samtidigt.

## Genomfört (delvis, i förväg)

Utkastet är i övrigt obeslutat, men **en förutsättning är redan byggd** eftersom den
blockerade insamlingen av testdata:

- **`MAX_SAMPLES = 240` → `MAX_ANALYSIS_SEC = 300`** (`poseTrajectory.ts`, 2026-08-06,
  branch `stream-d`). Taket flyttat från *antal sampel* till *analyserad varaktighet*, så
  samplingstakten ligger fast på `SAMPLE_FPS` (15) oavsett klipplängd. Bortom taket
  **trunkeras** klippet (första 300 s analyseras) och det loggas på WARN med
  `droppedSec` — i stället för att tunna ut hela klippet, vilket är precis den tysta
  degraderingen som ska bort.
- Mätt kostnad för ett 4-minutersklipp (3 600 sampel): **~15 MB heap** (4,3 kB/sampel,
  uppmätt) och **~6,8 MB** som exporterad fixture-JSON. Bearbetningstiden är den bindande
  kostnaden, inte minnet — se *Risker* punkt 7.
- Beteendet är **bit-identiskt för klipp under 16 s**, alltså varenda klipp appen är
  verifierad på; `poseEnvelopeRegression.test.ts` är oförändrad och grön (10/10). Fixturerna
  går aldrig genom `extractPoseTrajectory`, så harnessen är per konstruktion oberoende av
  den här konstanten.

## Alternativ som övervägts

**A. Behåll klipp-per-sving; röst/knapp klipper strömmen.** Billigast, ingen ny detektion,
återanvänder Ström A. Men bryter mot produktvisionen (trigger per slag) och röst-triggern är
redan känd svag i range-brus (A-2-anteckningen). *Bra fallback om B blir för dyr i fält.*

**B. Segmentering i pose-domänen (ovan).** Rekommenderas. Återanvänder hela envelope-
investeringen, testbar som ren funktion mot befintliga fixturer, degraderar till A.

**C. Efterbearbeta hela sessionsklippet i efterhand.** Enklast att bygga (ingen live-pose,
ingen ringbuffert) men ger *ingen* direkt feedback och kraschar sannolikt på minne
(3 min 720p ≈ 150–350 MB i `chunksRef` + blob i store). Bra som **testverktyg** för de
klipp Erik samlar nu, inte som produkt.

**D. Ljud som segmenterare (klubbträffen är en distinkt transient), pose som verifierare.**
Billigast i CPU och ger nästan exakt impact-tid. Men rangebrus (andras slag på bås bredvid)
gör den ensam otillförlitlig. *Kandidat som billig vakt i steg 4, inte som primär.*

## Risker

1. **Termik/batteri.** Live-pose 15 fps i 30 min på iPhone → varm telefon, kameran kan
   throttlas. Största enskilda risken. Mitigering: två-stegs vakt.
2. **Minne.** Ringbuffertarna måste faktiskt vara bounded; en läcka dödar tabben i iOS Safari.
3. **Kostnad.** 20 frames × N svingar. 6 svingar/session = 120 Vision-frames.
   **E-1 (långside-cap 1024) blir en förutsättning, inte en optimering.**
4. **Tyst feldetektion.** Falska positiv (bollplock som sving) är värre än missar — de kostar
   pengar och förvirrar. Grinden ska vara *strikt*; hellre missa en sving.
5. **Regressionsrisk mot D-3.** Segmenteringen får inte ändra beteendet för enkelklipp.
   Mitigering: `poseEnvelopeRegression.test.ts` måste förbli grön med segmentering påslagen
   (ett segment in → identiskt resultat ut).
6. **Ny fixturklass behövs.** De tre befintliga fixturerna är enkelsvingar. Erik samlar nu
   2–4-minutersklipp — de blir `session-*.json`-fixturer med manuellt etiketterade
   svingtider, och grinden mäts som precision/recall mot dem. **Storlek:** ~6,8 MB per
   4-minutersfixture (mätt) mot ~0,3 MB för dagens enkelsvingar. Två–tre sådana är
   hanterbart i git; en hel svit är det inte — överväg gles export (bara wrist-landmarks
   15/16, eller bara segmenteringsfönstren) om det växer.
7. **Bearbetningstid på långa klipp (INFÖRD 2026-08-06).** Med det tidsbaserade taket kan
   pose-vägen nu göra upp till 4 500 inferenser (~2–5 min på CPU-delegat) på ett långt
   klipp, mot tidigare max 240. Det är avsiktligt för fixture-insamling, men det gör
   *uppladdning* av ett långt klipp i produktion långsamt — och faller envelopen ändå
   igenom körs pixel-diff-fallbacken över hela klippet ovanpå det. Mitigering när det blir
   verkligt: duration-gate på pose-vägen i `frameExtractor.selectViaPose`, inte ett lägre
   `MAX_ANALYSIS_SEC` (det återinför takt-förlusten).

## Öppet innan beslut

- Vilken takt räcker vakten på? (5 fps pose vs pixel-diff vs ljud.)
- Ska sessionsvideo sparas alls, eller bara per-sving-segmenten? (Lagring + integritet.)
- Ska analysen köas eller strypas (t.ex. max 1 analys per 20 s) vid snabb slagtakt?
