# Varför ger 4613, 5063 och 5406 noll svingar i appens 15 fps-kedja? (S-49)

> 2026-10-23, `stream-shaft`. Bara diagnos. Ingen produktionskod och ingen tröskel ändrad.
> `poseSegments.ts`, `poseEnvelope.ts` och `poseTrajectory.ts` är importerade och anropade,
> aldrig ändrade.

## Svaret

| klipp | grind som fäller i appen (webbläsare, 15 fps) | webbläsare, native 30 fps | python, 15 fps | python, native 30 fps | orsak | missad envelope |
|---|---|---|---|---|---|---|
| `IMG_4613` | clipped tail (settle 1/3 sampel) | **accepterad** | clipped tail (1/3) | **accepterad** | **fps** | 3,27–4,80 s, impact ≈ 4,33. **Slag** (bollen ligger kvar vid 4,20 s och är i luften vid 4,40 s) |
| `IMG_5406` | clipped tail (settle 2/3 sampel) | **accepterad** | accepterad, men på en artefakt | accepterad, men på en artefakt | **fps**. Python klarar sig bara på en artefakt (se nedan) | 2,80–4,37 s, impact ≈ 3,93. **Slag** (bollen ligger kvar vid 3,85 s och är i luften vid 4,05 s) |
| `IMG_5063` | clipped tail (settle 0/3, passet hamnar i artefakt) | envelope 3,73 s > 3 s | **accepterad** | **accepterad** | **python↔JS (spåraren)**, inte fps | 16,13–17,27 s, impact ≈ 17,0. **Slag**: kort pitch, torvan lyfter vid 17,05 s och bollen syns inte efter träffen |

Alla tre missade envelopes är sannolikt riktiga slag. Tiderna står i tabellen om du vill
kontrollera själv. Bedömningen bygger på fem bildrutor per sving som jag tittat på (för 5063 också
en beskärning runt bollen). Jag har inte gått igenom bildruta för bildruta.

Kontrollen (fem klipp som ger svingar i appen) ger exakt 1 accepterad sving i alla fyra
konfigurationerna, och envelopegränserna skiljer högst 0,1 s mellan dem. 15 fps gör alltså inte
kedjan generellt sämre. Det som skiljer är **marginalen** vid finishen (§2).

## 1. Upplägg

Fyra konfigurationer per klipp. Alla matas genom **samma** JS-kedja, `detectSessionSwings(samples,
{})` importerad från Vite i en riktig webbläsarsida. Inget av klippen är sträckt.

| konfiguration | spårare | takt | hur |
|---|---|---|---|
| `browser15` | WASM-PoseLandmarker, VIDEO-läge, varm över klippet | 15 fps | `extractPoseTrajectory` självt, precis som `segment_clips.cjs` |
| `browserNative` | samma | native (30 fps) | en kopia av `extractPoseTrajectory`s sampelloop där `SAMPLE_FPS` bytts mot videons fps. Konstanten i modulen är inte ändrad, och kopian var enda sättet att byta takt utan att röra produktionskoden |
| `py15` | python-mediapipe 1.0.1, samma modell och optioner som `run_pose_clip.py` | var 2:a avkodade ruta | landmarkern ser bara 15 fps-sekvensen |
| `pyNative` | samma | alla rutor | = own-clips-stability-körningen |

Två kontroller av att uppställningen stämmer: `browser15` återger `segments.json` från S-45 (samma
kandidatfönster och samma skäl för alla tre), och `pyNative` återger own-clips-stability (1 sving
per klipp, och för 5063 samma två förkastade kandidater: ingen adressplatå och klippt svans).

Skript (committade): [`fps-missed/extract_browser.cjs`](fps-missed/extract_browser.cjs),
[`fps-missed/extract_python.py`](fps-missed/extract_python.py),
[`fps-missed/analyze.cjs`](fps-missed/analyze.cjs). Utdata (gitignorerat):
`data/shaft/fps-missed/samples/*.json` och `data/shaft/fps-missed/analysis.json`.

`analyze.cjs` loggar per kandidat grindens skäl, och för clipped tail även de värden som avgjorde
den. Värdena läses ur envelopens egen `debug`-spårning: om det finns ett nedsvingspass, och hur
lång den längsta löpningen under `SETTLE_SPEED_FRAC × peakSpeed` efter passet är, jämfört med
`FINISH_MIN_HOLD_FRAMES` = 3.

## 2. Mekanismen bakom fps-fallen (4613, 5406)

Finishen kräver **3 sampel i rad** under `0,2 × peakSpeed` efter nedsvingspasset
(`poseEnvelope.ts`). Båda delarna beror på samplingstakten:

1. **`peakSpeed` krymper i 15 fps, men hastigheten efter finishen gör det inte.** Nedsvinget tar
   ~0,15 s. I 15 fps täcker det 2–3 sampel, och `SMOOTH_HALF = 1` sampel jämnar ut över 0,2 s
   i stället för 0,067 s. På de sex rena klippen är toppen i 15 fps **0,57–0,70 × toppen i native**.
   Att klubban sänks efter finishen är en långsam rörelse (~0,2–0,3) och påverkas inte. Tröskeln
   sjunker alltså under den rörelsen. 4613: tröskeln 0,188 i 15 fps mot 0,285 i native. Hastigheten
   efter finishen ligger på 0,24–0,33, och bara ett sampel (4,96 s: 0,188) kommer under.
2. **Hållkravet räknas i sampel.** 3 sampel är 0,2 s i 15 fps men 0,1 s i 30 fps.

| klipp | topp 15 / native (webbläsare) | längsta settle 15 fps | längsta settle native |
|---|---:|---:|---:|
| 4603 (kontroll) | 0,81 / 1,26 | 6 | 18 |
| 4617 (kontroll) | 1,19 / 1,91 | 7 | 19 |
| 5073 (kontroll) | 0,88 / 1,26 | 11 | 37 |
| 5383 (kontroll) | 0,79 / 1,24 | 6 | 13 |
| 5411 (kontroll) | 0,97 / 1,71 | 11 | 24 |
| **4613** | 0,94 / 1,43 | **1** | 15 |
| **5406** | 1,29 / 1,93 | **2** | 9 |

4613 och 5406 har en **kort hållen finish**. I 4613 börjar klubban sänkas ~0,2 s efter finishen,
och klippet slutar 1 s senare. I 5406 går händerna vidare uppåt efter ~0,25 s, och sedan rubbas
kameran (bilden tippar mot marken vid ~5,9 s). Kontrollklippen håller finishen längre och klarar
15 fps med 6–11 sampel.

Python och webbläsaren ger nästan samma värden i 15 fps för 4613 (topp 0,92 mot 0,94, settle 1 mot
1). Där är orsaken alltså bara fps.

### 5406 i python: rätt antal av fel skäl

Python accepterar 5406 i båda takterna, men inte svingens egen finish. Kameran rubbas efter
~4,9 s, och spåraren tappar personen (py: 4,87–4,93 och 5,17–6,0 s utan pose). Mitt i tappet läser
python ett snabbt "fall" (topp 2,77 i 15 fps och 4,93 i native, mot svingens ~1,3–1,9). Det fallet
blir både `peakSpeed` och nedsvingspasset (5,00 s). Efter det står serien still eftersom
interpolationen klampar, och stillheten läses som finish (5,10–5,20 s). Envelopen 2,80–5,10 s börjar
rätt men slutar i kamerarörelsen. Webbläsaren i native hittar den riktiga finishen (4,37 s,
impact 3,93 s). **Python-körningens "1 sving" i 5406 är alltså inte belägg för att svingen är lätt
att läsa i native fps.** Det belägget kommer från `browserNative`.

## 3. 5063: spåraren, inte fps

Svingen (en kort pitch, händerna når bara 0,16 över adress) ligger 16,1–17,3 s. Efter den går
golfaren ur bild, och pose saknas ~18,3–19,7 s i alla fyra konfigurationerna. Skillnaden är vad
spåraren hittar på i tappet:

| konfiguration | detektioner inne i 18,3–19,7 s (handhöjd y) |
|---|---|
| `py15` | inga |
| `pyNative` | inga |
| `browser15` | 18,87 (0,39), 18,93 (0,35) |
| `browserNative` | 18,50 (0,33), 18,83 (0,39), 19,50 (0,33), 19,53 (0,39) |

Den riktiga handhöjden på båda sidor om tappet är ~0,65. Webbläsarens WASM-PoseLandmarker ger
alltså enstaka falska detektioner när personen är borta. Python ger inga. Kedjan interpolerar
linjärt mellan dem, och det blir en snabb skenrörelse: 1,13 i 15 fps mot svingens egen topp 0,67 i
`py15`. Den skenrörelsen

- blir `peakSpeed`, så settle-tröskeln höjs,
- ger det snabbaste fallande sampel nära adresshöjd, så nedsvingspasset hamnar i artefakten
  (19,33 s i 15 fps, 19,63 s i native) i stället för vid träffen (16,93 s),
- följs av rörelse till klippets slut. I 15 fps blir det därför **clipped tail (0 settle-sampel efter
  passet)**. I native hittas en settle vid 19,80 s, men envelopen blir då 16,07–19,80 = **3,73 s >
  `MAX_ENVELOPE_SEC` 3,0**.

Python saknar artefakten och läser svingen rent i båda takterna (envelope 16,07/16,13–17,17/17,27 s,
nedsving 0,40 s). Fps spelar ingen roll här. Det som fäller svingen är att webbläsarspåraren
detekterar något som inte finns.

## 4. Vad det här inte säger

- **n = 3 missade + 5 kontroller, alla 30 fps-klipp från samma mobil.** Det är en mekanism, inte
  en frekvens. Hur många av appens 81 svingar som ligger nära 3-sampelsgränsen är inte mätt. Den
  längsta settle-löpningen i 15 fps finns i `analysis.json` för de klipp som körts här, inte för
  alla 70.
- Slag/provsving bygger på fem bildrutor per sving och är ingen blind bedömning.
- Ingen tröskel är prövad. Kandidaterna finns i §2: ett tidsbaserat hållkrav, eller en settle-
  tröskel som inte skalar med en topp som själv beror på fps. För 5063 gäller i stället
  interpolation över långa pose-tapp. Valet är ditt, och en ändring i `poseEnvelope.ts` (låst)
  kräver regressionsharnessen.

## 5. Fixen: design, låst före första körningen (2026-10-23)

> Skriven och committad **innan** något är kört mot den nya koden. Värdena är härledda ur
> dagens beteende i native 30 fps, inte ur de tre missade klippen. Ingen iteration mot facit:
> stämmer inte mätningen (c) eller (d) stannar arbetet och värdena ändras inte.

Bara **finishgrinden** i `poseEnvelope.ts` ändras: settle-tröskelns referenstopp, serien som
jämförs mot den, och hållkravet. Allt annat är orört: `SMOOTH_HALF`, adressplatå, start,
nedsvingspass, impact, `lastMotion`-skyddet, `SETTLE_SPEED_FRAC` = 0,2, och det rapporterade
`envelope.peakSpeed` (det jämförs mot `refSpeed` i `poseSegments.ts`/`datasetGate.ts` och måste
vara byggt som förut).

**(1) Hållkravet i sekunder.** `FINISH_MIN_HOLD_FRAMES = 3` ersätts av
`FINISH_MIN_HOLD_SEC = 0,1` (= 3 sampel × 1/30 s, dagens krav i native 30 fps). Antal sampel =
`max(2, round(FINISH_MIN_HOLD_SEC / sampleDt))`, samma idiom som `MIN_ADDRESS_SEC`. Ger 3 i
30 fps (även 29,97: 2,997 → 3) och 2 i 15 fps (0,133 s). Golvet 2 betyder att ett ensamt sampel
aldrig räknas som hållen finish.

**(2) Finishgrindens fartserie med samma tidsutjämning som i 30 fps.** Dagens `speedSm` är
glidande medel över 3 sampel på positionen → differens → glidande medel över 3 sampel på farten.
Som filter på hastigheten har kedjan tidsvariansen `2·(2/3)·dt² + dt²/12 = (17/12)·dt²`
(två 3-tapsmedel + differensens låda). I 30 fps är σ = 0,040 s; i 15 fps är den dubbelt så stor,
vilket är en av de två orsakerna till att toppen krymper (§2). Finishgrinden får en egen serie
`finishSpeed`, byggd med samma kedja men med kärnan `[a, 1−2a, a]` där `a` väljs så att
variansen blir 30 fps-värdet:

```
4a·dt² + dt²/12 = (17/12)·(1/30)²   →   a = ((17/12)·(1/30 / dt)² − 1/12) / 4,  klampat till [0, 1/3]
```

- 30 fps: `a` = 1/3 → kärnan är dagens 3-sampelsmedel. Vid `a ≥ 1/3` används `speedSm` själv,
  alltså exakt dagens kod. (29,97 fps ger `a` = 0,3328, kärnvikter som skiljer < 0,2 %.)
- 15 fps: `a` = 13/192 ≈ 0,068 → mindre utjämning, samma effektiva tidsfönster som 30 fps.
- Över 30 fps: klampat, dagens sampelbaserade beteende (ingen produktion kör där).
- Kanter: vikterna normaliseras med summan av vikterna inom serien (som `smooth` idag).

Referenstoppen för settle = `max(finishSpeed)`, och settle-löpningen räknas på `finishSpeed`
(samma serie för tröskel och jämförelse). Det som inte går att återvinna är undersamplingen: ett
nedsving på ~0,15 s har 2–3 sampel i 15 fps oavsett utjämning. Fixen tar bort utjämningens del
av krympningen, inte samplingens.

**Kända sampelberoenden som lämnas:** `IMPACT_END_MARGIN_FRAMES` (2) och `SMOOTH_HALF` i resten
av kedjan. De styr inte finishgrinden.

**Mätning (låst):** samma sving = accepterade envelopes som överlappar med minst 50 % av den
kortares längd. (a) alla 70 egna klipp, webbläsaren, 15 och 30 fps, före/efter. (b) 4613 och
5406 accepterade i 15 fps. (c) mot S-45-facit (`key.json` + `svar-erik.json`): inget av de 71
slagen försvinner, antalet accepterade falska ≤ 10, nya envelopes listas. (d) webbklippen bakom
S-32:s 103 svingar, 15 fps, datasetvägen (`detectSessionSwings` + `collectDatasetSwings`, frysta
klipp → ej sträckta) och produktionsvägen: varje ändrad envelope redovisas. (e) 3587.
Dessutom: 30 fps-utfallet före/efter (ska vara oförändrat eller nära), regressionsharnessens
goldens och `npm test`.

## 6. Resultat: (a)–(c) håller, (d) och (e) gör det inte. Stoppat, ingen produktionskod ändrad

> 2026-10-23. Designen i §5 kördes oförändrad, i en körning och utan iteration. Enligt
> stoppregeln är **värdena inte ändrade och koden inte committad**. Ändringen ligger som
> [`fps-missed/finish-gate-s49.patch`](fps-missed/finish-gate-s49.patch) (`git apply`).
> `poseEnvelope.ts` är oförändrad i repot.

Upplägg: pose extraherad **en gång** i dev-appens webbläsarkedja (varm WASM, VIDEO-läge):
70 egna klipp i 15 fps (`extractPoseTrajectory`) och 30 fps (kopia av loopen), och de 80
webbklipp som bär S-32:s svingar i 15 fps ([`extract_rates.cjs`](fps-missed/extract_rates.cjs)).
Samma sampel matades till `detectSessionSwings` (och för webb även `collectDatasetSwings`) i
webbläsaren, först med gamla och sedan med nya `poseEnvelope.ts`
([`run_segmenter.cjs`](fps-missed/run_segmenter.cjs), [`compare_fix.py`](fps-missed/compare_fix.py)).
Utdata (gitignorerat): `data/shaft/fps-missed/fix/`. Kontroller av uppställningen: före-körningen
i 15 fps återger S-45 exakt (81 svingar, 0 nya, 10 falska), och datasetvägen återger alla 102
webbsvingar ur S-32 (den 103:e är `IMG_5427`, ett eget klipp).

| | före | efter |
|---|---|---|
| (a) egna klipp där 15 och 30 fps ger olika svingar | 7 av 70 (81 mot 82 svingar) | **4 av 70** (84 mot 82) |
| 30 fps-utfallet | – | **oförändrat i alla 70** |
| (b) 4613 / 5406 i 15 fps | 0 / 0 | **3,29–4,83 / 2,87–4,40** (= native-envelopen inom 0,07 s) |
| 5063 | 0 | 0 (spåraren, som väntat) |
| (c) S-45-slag som försvinner | – | **0 av 71** |
| (c) accepterade falska | 10 | **10** |
| (c) nya envelopes | – | 3: `IMG_4613` 3,29–4,83, `IMG_5406` 2,87–4,40, `juli132025-1134fm` 7,83–9,23 (den sista accepteras redan i 30 fps före fixen) |
| (d) datasetvägen, webbsvingar | 102 | **101**: `072` 17,71–19,71 (S-32-sving) faller på `vertical excursion 0,054 < 0,08` |
| (d) envelopes med ändrad finish (webb, dataset) | – | **90 av 101** (85 tidigare, 5 senare), median **−0,067 s** (1 sampel), 20 flyttar > 0,2 s |
| (d) produktionsvägen, webb | 80 | 84 (`009`, `040`, `054`, `083` går från dataset-relaxed till produktion) |
| (e) 3587 i 15 fps | 12,18–17,04, impact 15,58 | **12,18–15,51, ingen impact** (= 30 fps-utfallet: topp som finish) |
| `npm test` | 406/406 | **405/406**: `poseSegments.test.ts` session-multi, sving 2 finish 33,13 → 32,99 (2,05 rutor, tol ±2). `poseEnvelopeRegression` gröna |

Kvar i (a): `IMG_3656`, `IMG_5186`, `IMG_5360` (bara 15 fps) och `IMG_5356` 54,43–56,07 (bara 30 fps).

**Varför (d) inte håller.** Fixen gör det den skulle i 15 fps: finishen hittas lika tidigt som i
30 fps. Men det betyder också att 30 fps-beteendet med **toppvila som finish** följer med in i
produktionens 15 fps-kedja. Hållkravet på 3 sampel i 15 fps (0,2 s) var det som skyddade mot det
(kommentaren i `poseEnvelope.ts`: "a top would clear a 1–2 frame settle but not this"). Med 2 sampel
och mindre utjämning:

- **Finish före den gamla impacten** (envelopen slutar vid toppen eller i nedsvinget, impact
  försvinner): `062` 5,79 → 4,32 (impact var 4,39), `070` 13,65 → 10,52 (10,85), `3587`
  17,04 → 15,51 (15,58). `040` och `005` tappar också impact.
- `054` byter nedsvingspass (impact 5,00 → 3,46), och `072`:s tredje sving krymper så mycket att
  händerna inte hinner upp (exkursion 0,054).
- De flesta stora flyttarna behåller impact och kortar en finish som förut gick ut i sänkningen
  efter svingen (t.ex. `022` 4,19 → 3,06 med impact 2,52, `IMG_5269` 2,73 → 1,67). Det kan vara en
  förbättring, men det är inte bedömt mot bild.
- Det systematiska skiftet på −1 sampel i ~85 % av envelopes kommer av att löpningen nu startar på
  ett sampel som förut låg strax över tröskeln. Frame-id i den annoterade datan beror på
  envelopen. En omextraktion av frysta klipp (`frozenClips.ts` fryser bara sträckflaggan) skulle
  inte längre återge exporternas `tSec`.

**Vad det säger om designen.** Att låsa till native 30 fps-beteendet var fel ankare för
hållkravet. 30 fps har redan toppvila-som-finish (3587, S-44), och 15 fps var den robusta
konfigurationen just där. Peak-delen och hållkravs-delen har inte prövats var för sig. Det hade
varit iteration mot facit, och designen var låst som en enhet.

**Ditt beslut.** Det jag ser som möjligt, men som inte är prövat:
- **(i)** Ankra i 15 fps i stället: hållkravet i sekunder = 0,2 s (dagens 15 fps), och peak-
  utjämningen tidsankrad till 15 fps. Då skulle 30 fps ändras i stället för produktionen.
- **(ii)** Bara peak-delen (§5 (2)), med hållkravet kvar på 3 sampel.
- **(iii)** Låt det vara. 4613/5406 är 2 av 71 slag, och produktionen kör alltid 15 fps.

Varje variant behöver en ny förregistrering och samma körning (a)–(e). Sampeldatan finns kvar, så
en omkörning tar några minuter.
