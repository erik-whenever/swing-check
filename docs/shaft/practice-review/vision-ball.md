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

## Resultat

*(fylls i efter körningen)*
