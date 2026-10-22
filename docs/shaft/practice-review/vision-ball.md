# Kan Vision avgöra "bollen träffad"? (S-45, steg 3)

> 2026-10-22, `stream-shaft`. Ingen produktionskod ändrad. Mäter om Vision, i produktionens
> konfiguration plus en enda låst fråga, kan skilja slag från provsving på de 81 svingarna med
> facit från [steg 1](README.md)/[steg 2](resultat.md). Godkänt: högst 90 riktiga anrop via Workern.

## Före körning (låst, committad innan något anrop gjordes)

### Konfiguration — produktionens sessionsväg

E-2-beskärningen finns bara i **sessionsvägen** (`useSessionCapture.runSwing`). Uppladdningsvägen
(`CameraView` → `extractFrames`) beskär inte och kör inte segmenteraren. Det är också sessionsvägen
där en provsving blir ett Vision-anrop (S-45 steg 2). Därför replikerar körningen den, inte
uppladdningen. Allt importeras från dev-appen ([`vision_ball.cjs`](vision_ball.cjs)):

| steg | modul (appens egen) | parametrar |
|---|---|---|
| svingar | `extractPoseTrajectory` → `readTimeStretch` → `detectSessionSwings` | hela klippet (som steg 1), inte livefönstret |
| bildurval | `selectEnvelopeFrames(envelope, ANALYSIS_FRAME_COUNT=32, start, finish, { clusterPhases })` | `clusterPhases` = reglernas faser, som `rulePhasesToSwingPhases` (privat, kopierad ordagrant) |
| beskärning | `computeLandmarkBounds(samples, start, finish)` + `grabFramesAtTimes(…, 0.8, { cropBounds, maxOutputSide: MAX_OUTPUT_SIDE })` | som `liveSwingDetector` + `runSwing` |
| anrop | `analyzeSwing(frames, rules, { cameraAngle, quickMode })` | `SYSTEM_PROMPT`, `buildSwingPrompt`, cache-brytpunkter och parsning orörda |
| inställningar | appens standardvärden (`settings.ts`) | `cameraAngle 'dtl'`, TTS på + `ttsMode 'quick'` → **quick-schemat**, `focusRuleId null` |
| regler | Eriks val: alla biblioteksregler som matchar DTL | 7 st: spine-angle, connected-takeaway, shoulder-rotation, club-alignment-top, inside-path, forward-shaft-lean, full-rotation-finish |
| modell | Workern pinnar `MODEL_ID` | `claude-sonnet-4-5` |

**Avvikelser, alla i transporten eller materialet, inte i det modellen ser:**
- `window.fetch` i sidan lämnar anropet till Node, som postar det till Workern med
  `Origin: http://localhost:5173` (dev-origin på Workerns allowlist; porten upptas lokalt av ett annat
  projekt). Workern rörs inte.
- Märkning: `metadata.user_id = "s45-vision-ball-<variant>-<id>#<rep>"`. Workern loggar inga
  enskilda anrop (bara dygnsräknaren `api_usage`, som inte kan märkas), så märkningen syns på
  Anthropic-sidan. Lokalt loggas varje POST i `data/shaft/practice-review/vision/calls.jsonl`
  **innan** det skickas, och skriptet vägrar skicka när filen har 90 rader.
- Reglerna får stabila id (`r-<libraryId>`) i stället för `uuid()`.
- **Produktionen skulle inte skicka alla 81.** `requireImpact` (standard på) hoppar över svingar
  utan bekräftad impact före Vision: 2 av de 10 falska (3656, 5056) och 6 av 71 slag. De körs
  ändå, och redovisas separat.

### Frågan

Två fält i quick-schemat, direkt före `"overall_assessment"`:

```
  "ball_struck": "yes" | "no" | "unclear",
  "ball_struck_reason": "max one short phrase",
```

och ett stycke direkt före `CONFIDENCE CALIBRATION:`, ordagrant:

```
BALL STRUCK (separate from the rules, never changes a rule verdict):
Judge whether this swing struck a golf ball.
- "yes": a ball is visible at address and is gone or moving after the club has passed it.
- "no": no ball was struck — no ball is visible at address, or the ball is still lying in place after the club has passed (a practice swing).
- "unclear": the frames do not show the ball area clearly enough at address and after impact to tell. Do not guess.
ball_struck_reason is written in Swedish, like every other free-text field.
```

Kriteriet är detsamma som i Eriks vy ("bollen syns före och är borta eller i rörelse efter").
Fältnamnen följer schemats snake_case (uppdraget skrev `ballStruck`). Båda tilläggen ligger i
det cachade promptblocket, som i en verklig schemaändring.

### Körplan och poängsättning (bestämt före körning)

1. **`ball`: alla 81, en gång, i id-ordning.** Ingen omkörning mot facit. Ett anrop körs om bara
   om det misslyckas tekniskt (HTTP-fel, ogiltig JSON), och omkörningen räknas mot budgeten.
2. **`base`: 3 svingar × 2 körningar utan frågan**, för att se om tillägget ändrar
   regelbedömningarna: P45-003, P45-004 och P45-006 (de tre första id:na som är realtid, har
   impact och kommer från olika klipp). Två körningar utan frågan visar hur mycket svaren varierar
   ändå, och skillnaden med/utan måste ställas mot det bruset.
3. Budget: 81 + 6 = **87** av 90.
4. Mått mot `svar-erik.json` (via `key.json`):
   - **fångade** = `no` på de 10 falska
   - **dyraste felet** = `no` på något av de 71 slagen
   - `unclear`: andel och fördelning (slag/falska, kameravinkel, beskärning, sträckta)
   - tokens och cache med och utan frågan

**Sett före körningen** (bildrutorna är extraherade, inga anrop gjorda): 81/81 svingar, 22–30
bildrutor efter dedupe, 80 med E-2-beskärning och 1 hel (`landmarks-low-confidence`). På P45-012
(bakifrån) slutar beskärningen vid klubbhuvudet vid adress, och bollen syns inte i bild. Om det
gäller brett mäter körningen beskärningen mer än Vision. Protokollet ändras inte för det.

## Resultat: avbruten efter 4 anrop, och frågan är inte besvarad

**Körningen avbröts på Eriks beslut efter 4 av 90 anrop.** Bollfrågan fick inget mätbart svar. Den
stoppades av ett fynd som gäller produktionen: **med 7 DTL-regler klipps Visions svar vid
`max_tokens` i båda produktionslägena**, så JSON blir ogiltig och `analyzeSwing` kastar.

### De fyra anropen

Alla gäller P45-001 (slag, IMG_3569, sträckt Slo-Mo, 28 bildrutor) utom det sista. Kostnaden är
räknad med `api.ts` prislista.

| # | variant | läge | stop | input | output | cache-skrivning | cache-läsning | svarslängd | kostnad |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | med frågan | quick | `max_tokens` | 7 695 | **600** | 2 153 | 0 | 1 609 tecken | $0,040 |
| 2 | **utan frågan (= produktionen)** | quick | `max_tokens` | 7 695 | **600** | 1 989 | 0 | 1 664 tecken | $0,040 |
| 3 | med frågan | detaljerat | `max_tokens` | 7 695 | **2 000** | 1 715 | 0 | 6 037 tecken | $0,060 |
| 4 | med frågan (P45-002) | detaljerat | svaret förlorat | | | | | | ~$0,06 |

Anrop 4 skickades men dess svar gick förlorat, eftersom körningen stoppades medan det pågick. Det
räknas mot budgeten. Totalt ~$0,20.

**Anrop 2 är kontrollen Erik bad om:** exakt produktionens anrop, utan tillägg, klipps likadant.
Klippningen kommer alltså inte från frågan. I quick-läge tog sju regler slut mitt i den sjunde, före
`overall_assessment`.

### Avvikelse från förregistreringen

Planen var quick-läge (appens standard). Efter anrop 1 och 2 flyttade Erik körningen till
detaljerat läge (`max_tokens` 2000), med samma fråga ordagrant förankrad före
`"overall_assessment": "2-3 sentence summary"` i det schemat. Anrop 3 klipptes också, men senare:
alla 7 regler och **`ball_struck` besvarades** innan svaret klipptes i `overall_assessment`.
Svaret var `"yes"`, med motiveringen "Boll synlig vid address, borta efter klubbpassage", och det
stämmer med facit (slag). En sving är inget resultat. Den visar bara att frågan går att besvara på
de här bilderna när svaret hinner fram.

### Vad som går att säga

- **Om bollfrågan: ingenting än.** n = 1.
- **Tokens, kostnad och cache:** tillägget gör det cachade promptblocket 164 tokens större
  (cache-skrivning 2 153 mot 1 989 i quick-läge). Det betyder en ny cachepost en gång och sedan
  cache-läsning som förut. Bildkostnaden är oförändrad (input 7 695 i alla tre). Svaret blir ett par
  dussin tokens längre, och de tokens tas från samma `max_tokens`-tak som redan inte räcker.
- **Om tillägget påverkar regelbedömningarna:** inte mätt (base-körningarna gjordes aldrig).
- **Beskärningen** (sett på P45-012 före körning): bakifrån kan E-2-lådan sluta vid klubbhuvudet, så
  bollen hamnar utanför bild. Det kvarstår som en risk för frågan och är inte mätt.

### Om körningen tas upp igen

Klippningen måste lösas först, annars mäter körningen `max_tokens` och inte Vision. Två vägar som
inte ändrar frågan: lösa produktionens tak (S-48), eller läsa `ball_struck` ur råtexten även när
JSON klipps, eftersom fälten kommer före `overall_assessment`. Det senare gör att en klippning
efter fältet inte längre räknas som ett fel. Budgeten som återstår av Eriks godkännande är 86
anrop, och nya anrop kräver nytt godkännande.

## Filer

| repo (`docs/shaft/practice-review/`) | gitignorerat (`data/shaft/practice-review/vision/`) |
|---|---|
| `vision_ball.cjs`: `frames` (gratis) och `call` (betald, budgetspärr) | `frames/P45-xxx.json`: de 81 svingarnas bildrutor, beskärning, faser |
| | `calls.jsonl`: varje skickat anrop (4) |
| | `raw/*.json`: prompt + råsvar per anrop (3), `results-*.jsonl` |
