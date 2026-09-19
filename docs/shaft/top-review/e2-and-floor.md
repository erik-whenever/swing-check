# E2, ankaret och mätgolvet — och vilken konfiguration produktionen faktiskt kör (S-37, diagnos)

> 2026-09-19, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> kalibrering applicerad, inget skift infört, ingen ändring i S-30:s spärr och ingen
> produktionskod skriven.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är orörda. `src/lib/poseDetector.ts`,
> `src/lib/poseTrajectory.ts`, `src/lib/frameExtractor.ts`, `src/lib/livePoseLoop.ts`,
> `src/lib/poseEnvelope.ts`, `src/lib/dataset/datasetGate.ts` och `src/lib/dataset/slowmo.ts`
> är **lästa och citerade rad för rad** i fråga 1 och 5 — varken ändrade, reimplementerade
> eller poängsatta. Skriptet **stannar** om någon av de citerade raderna har flyttat, så
> påståendena om produktionen kan inte driva ifrån koden utan att det syns.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md),
> [crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md) och
> [envelope-audit.md](envelope-audit.md) lästes först, så risken här är inte mätfel — den är
> anpassning. Därför: **ingen parameter svept, ingen justerad, ingenting valt.** E2:s
> utjämningsfönster (3) och E3:s hysteres (0,10) är deras egna. Svanssnittet 26 rutor är
> [subframe.md](subframe.md) §7:s egen p90 och flyttas inte. De 16 klippen är S-35 del D:s
> egen lista.
>
> Skript: [e2_and_floor.py](e2_and_floor.py) (skriver bara till stdout). Underlaget är S-32:s
> runda — **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor** — plus S-36:s
> helklippskörning av samma posemodell över alla 81 klipp. **Klippet är den oberoende
> enheten** och n står som rader *och* klipp.

> **RÄTTELSE 2026-09-19 (S-39) — etiketten `slow-mo` i den här rapporten betyder
> `lång envelope (> 3,0 s)`.** Manifestets `slowmo` är `deriveSlowmo(envelopeDurationSec,
> 'auto')`, alltså **`envelopeDuration > 3,0 s`** och ingen mätning av filmhastighet — samma
> predikat som `suspectMultiSwing`, mätt identiskt på alla 103 svingar
> ([hard-core.md](hard-core.md) §5). **Varje siffra nedan står oförändrad; bara etiketten på uppdelningen
> ändras, och riktningen i varje slutsats håller.** Ordet är utbytt i texten nedan där det
> namnger en uppdelning; fältnamnet `slowmo`, konstanten `SLOWMO_ENVELOPE_THRESHOLD_SEC` och
> lägena `force-slowmo`/`force-normal` är kodnamn och står kvar som de är. Originalordalydelsen
> ligger i git-historiken före den här rättelsen. Inventering: [verdict-sensitivity.md](verdict-sensitivity.md) §5.

## Kort svar

**1. Produktionen kör den VARMA konfigurationen, och det betyder att samtliga tal i S-31 till
S-35 är mätta på en konfiguration produktionen inte kör.** `runningMode` är `VIDEO` — ett
spårningsläge — och landmarker-instansen återanvänds mellan rutor: `extractPoseTrajectory`
bygger en **kall** spårare **en gång per klipp** och kör sedan `detectForVideo` på samma
instans över hela klippet vid 15 fps. Det är precis `run_pose_clip.py`:s konfiguration.
`run_pose.py` — kall spårare per **sving**, avkodning från envelope − 0,6 s — motsvarar
ingenting i produktionen, och det är på den varenda siffra i S-31 till S-35 står. En
precisering av premissen: den *levererande* analysvägen strömmar inte kameran, den söker i ett
inspelat klipp; livevägen finns men är parallell och når inte analysen. Spåraren är varm i
båda fallen, så slutsatsen håller.

**2. E2:s försprång överlever golvet mot E3, men E2 är inte bättre än E4.** Mot spannet ligger
E2 inne på 45 av 91 mot E3:s 30 (kall) och 40 mot 27 (varm) — **+15 respektive +13 rader**, och
parvis på samma 91 rader: 27 rader är E2 ensam inne, 12 är E3 ensam. Mot **E4** är det +3 kallt
och **−4 varmt** — försprånget byter tecken och finns inte. E2:s förskjutning är **inte**
konstant: medianen är +0, klippmedianernas median är 0, och LOCO lyfter 45 → 45. Det finns
ingenting att kalibrera bort; felet är en ensidig svans **efter** spannet.

**3. E2:s ankare kan inte lagas med en fartregel, och på var femte rad kan det inte lagas alls.**
Mätt som *vilka rutor skulle fungera som ankare*: på **19 av 91 rader (21 %)** finns **ingen
ruta alls** i envelopen som E2:s bakåtsökning kan starta i och landa inne i spannet — 41 % bland
E2:s missar och 4 av 10 i svansen. Där mängden finns är den ett sammanhängande stycke på median
6 rutor (14 % av envelopen) mitt i envelopen (0,43–0,55), som slutar 0–7 rutor efter spannet och
ligger **4–12 rutor före** det detekterade nedslaget. Den går inte att peka ut på fart: i
träffarna sträcker den sig till **1,00 × toppfarten**, i missarna slutar den vid **0,31**.

**4. Golvet är 6–11 rader omsättning och ett netto på ±5 rader, för alla fyra estimatorerna.**
En störning som inte borde betyda något flyttar rutan på ungefär en tredjedel av svingarna (lika på
64–73 av ~103). **Sex slutsatser i S-31 till S-35 ligger under det och stryks** (§4); fyra som såg
lika små ut gör det inte och står kvar.
Det som överlever: E1:s underkännande, E3:s riktning, LOCO:s +23 rader, interpolationens +12
rader, E2:s försprång mot E3, och svansen som klass (9 av 10 rader är samma i båda körningarna).

**5. Nej — flaggorna bär ingen ny information, och det är en egenskap hos koden.**
`suspectMultiSwing` är `envelopeDuration > 3,0 s` (`datasetGate.ts:143`) och `slowmo` i
`auto`-läge är `envelopeDuration > 3,0 s` (`slowmo.ts:28`) — **samma storhet, samma konstant**.
Mätt: **identiska mängder på alla 103 svingar**, noll undantag. `clippedTail` sätter i sin tur
`impact = null` i produktionen (`poseEnvelope.ts:445`), så den är en **delmängd** av *utan säkert
nedslag* — mätt 7 av 7. Båda är alltså kovariater rundan splittat på sedan S-32. Det korsningen
*visar* är nytt: raderna med lång envelope är E2:s svans (6 av 10 mot 12 % i rundan) men **E3 går bättre
där** — inne på 6 av 11 med \|median\| 0, mot E2:s 1 av 11 med \|median\| 36.

---

## 0. Reproduktion — kontrollraden

Posebanorna är S-36:s, oförändrade: `run_pose.py` och `run_pose_clip.py` orörda, samma
`public/models/pose_landmarker_lite.task`, **`mediapipe` 1.0.1, `opencv-python` 5.0.0,
`numpy` 2.4.6**. Kontrollraden skriptet skriver före allt annat:

| | E1 inne | E2 inne | E3 inne (median) | E4 RND inne |
|---|---:|---:|---:|---:|
| mot Erik pass 1 (n=93) | 9 | 36 | 23 (−1) | 33 |
| mot Lisa (n=95) | 10 | 42 | 27 (−1) | 40 |
| mot spannet (n=91) | 10 | 45 | 30 (−1) | 42 |

**Identisk med [resultat.md](resultat.md), [subframe.md](subframe.md),
[crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md) och
[envelope-audit.md](envelope-audit.md).** 103 svingar har en posebana, 101 ett E3-val, 91 ett
mänskligt spann, och 103 har en bana ur **båda** körningarna. Skriptet kontrollerar dessutom per
sving att posebanans envelope-rutor är registrets `frameTimes` och att `crossings()[0]` är
`e3_signflip`:s svar; stämmer något av det inte stannar det i stället för att mäta vidare.

`score_round.py`, `subframe.py`, `crossing_selection.py`, `multiswing.py` och
`envelope_audit.py` importeras och återanvänds; **ingenting är återimplementerat.** E1/E2/E3
lyfts ur `analyze_pose.py` med samma AST-lyft som S-32.

---

## 1. Vilken konfiguration är produktionens?

**Frågan är inte en tolkning — den är kod.** Skriptet slår upp varje rad och stannar om någon
av dem har flyttat.

| fil | rad | |
|---|---:|---|
| `src/lib/poseDetector.ts` | 58 | `runningMode: 'VIDEO',` |
| `src/lib/poseDetector.ts` | 182 | `export async function resetPoseLandmarker()` |
| `src/lib/poseTrajectory.ts` | 15 | `const SAMPLE_FPS = 15;` |
| `src/lib/poseTrajectory.ts` | 69 | `await resetPoseLandmarker();` |
| `src/lib/poseTrajectory.ts` | 70 | `const landmarker = await getPoseLandmarker();` |
| `src/lib/poseTrajectory.ts` | 120 | `const result = landmarker.detectForVideo(video, tsMs);` |
| `src/lib/frameExtractor.ts` | 243 | `const { extractPoseTrajectory } = await import('./poseTrajectory');` |
| `src/lib/livePoseLoop.ts` | 289 | `const result = this.landmarker.detectForVideo(this.video, tsMs);` |

**Vad de säger:**

- **`runningMode` är `VIDEO`, och VIDEO är ett spårningsläge.** Det är inte min läsning:
  `poseDetector.ts`:s egen kommentar till `resetPoseLandmarker` skriver ut mekanismen och en
  mätning på den — *"each frame is seeded with the previous frame's detection (ROI tracking)
  instead of running the full detector"*, med `posesDetected` 924 / 929 / 924 över tre körningar
  av **ett** klipp och en `refSpeed`-svängning på ~11 %.
- **Instansen återanvänds mellan rutor.** `extractPoseTrajectory` hämtar **en** landmarker
  (rad 70) och anropar `detectForVideo` i slingan (rad 120). Inget i slingan bygger om den.
- **Den är kall exakt en gång per extraktion.** `resetPoseLandmarker()` ligger **först** i
  `extractPoseTrajectory` (rad 69) — alltså en gång per **klipp**, aldrig per sving.
- **Sampling: 15 fps över hela klippet från t = 0** (`SAMPLE_FPS`).

### Vilken av de två mätkonfigurationerna motsvarar det?

| | spårare | avkodning börjar | sampling |
|---|---|---|---|
| `run_pose.py` (**kall**) | en per **sving** | envelope − 0,6 s | varje videoruta, 30 fps |
| `run_pose_clip.py` (**varm**) | en per **klipp** | t = 0 | varje videoruta, 30 fps |
| **produktionen** | **en per klipp (per extraktion)** | **t = 0** | 15 fps |

**Det är den varma.** Och då ska det stå i klartext:

> **Samtliga tal i S-31, S-32, S-33, S-34 och S-35 är mätta på `run_pose.py` — en kall spårare
> per sving, en konfiguration produktionen inte kör någonstans.** Den enda körning som
> motsvarar produktionens spårningstillstånd är S-36:s helklippskörning, och den har hittills
> bara använts som *störning* för att mäta ett golv, aldrig som huvudunderlag.

Det gäller också **envelopesen själva**: `src/lib/dataset/extractDataset.ts:201` anropar
`extractPoseTrajectory` **en gång per klipp** inne i klippslingan, så varje envelope i registret
är producerad av en varm spårare vid 15 fps — medan varje estimatorsiffra mot dem är
poängsatt på en kall vid 30 fps.

### Två preciseringar som hör till svaret

**a) Den levererande vägen strömmar inte kameran.** Analysen går
`CameraView → extractFrames → selectViaPose → extractPoseTrajectory`, alltså en sökning i det
*inspelade* klippet. Livevägen (`livePoseLoop.ts`) kör mycket riktigt strömmande på enheten med
en egen instans som lever hela inspelningen — **ännu varmare** — men `useLiveSwingDetection.ts`:s
egen kommentar säger att den är parallell: *"It never touches frameExtractor.ts, the recorded
blob, the session store or the Vision call"*, och *"Frame grab and analysis per live swing are
pass 3"*. Slutsatsen ändras inte av vilken av dem man menar: **båda har varm spårare**, och
livevägen längre än klippvägen.

**b) Den varma körningen är inte heller produktionen.** Kvar står **15 fps mot 30**,
WASM/GPU-delegat i webbläsaren mot python-CPU, och sökning per sampel mot sekventiell
avkodning — utöver de fem paritetsavvikelser [top-from-pose.md](../top-from-pose.md) redan
listar. Att byta till den varma körningen rättar **en** axel, inte pariteten. **Ingen av de
övriga är mätt.**

---

## 2. E2, mätt i samma detalj som E3

E2 är `analyze_pose.e2_slowest` oförändrad. Avstånd i envelope-bildrutor, 0 = inne.

### (a) Mot vardera annotatören och mot spannet

| | n (rader/klipp) | inne | median | \|median\| | p90 | max | MAD | klippnivå \|median\| |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **E2** mot Erik | 94 / 76 | **36** | +0 | 1,0 | **30** | **205** | 1,0 | 1,0 |
| E3 mot Erik | 93 / 75 | 23 | −1 | 1,0 | 3 | 29 | 1,0 | 1,0 |
| **E2** mot Lisa | 95 / 75 | **42** | +0 | 1,0 | **28** | **205** | 1,0 | 1,0 |
| E3 mot Lisa | 95 / 75 | 27 | −1 | 1,0 | 4 | 26 | 1,0 | 1,0 |
| **E2** mot spannet | 91 / 73 | **45** | +0 | 1,0 | **26** | **205** | 1,0 | **0,0** |
| E3 mot spannet | 91 / 73 | 30 | −1 | 1,0 | 3 | 26 | 1,0 | 1,0 |

**De två mäter samma sak lika bra i mitten och helt olika i svansen.** \|median\| är 1,0 för
båda mot båda bedömarna; p90 skiljer en faktor 7–9 och max en faktor 8. På klippnivå är E2:s
\|median\| **0,0** mot E3:s 1,0 — E2 ligger typiskt *rätt*, E3 ligger typiskt *en ruta före*.

### (b) Är E2:s förskjutning konstant eller spridd?

Samma procedur som [resultat.md](resultat.md) §4: skiftet ett klipp bedöms med är medianen av
de **andra** klippens medianer (LOCO).

| | IQR | p10…p90 | ej inne: före / efter | klippmedianernas median | naivt skift | **LOCO** |
|---|---|---|---|---:|---|---|
| **E2** mot Erik | +0…+6 | −1…+28 | 21 / **37** (64 %) | **+0** | 36 → 36 av 94 | **36 → 36** |
| **E2** mot Lisa | +0…+5 | −2…+28 | 18 / **35** (66 %) | **+0** | 42 → 42 av 95 | **42 → 42** |
| **E2** mot spannet | +0…+6 | −1…+26 | 13 / **33** (72 %) | **+0** | 45 → 45 av 91 | **45 → 45** |
| E3 mot spannet | −2…+0 | −3…+0 | **54** / 7 (89 %) | −1 | 30 → 53 av 91 | 30 → 53 |

**E2 har ingen konstant att kalibrera bort.** Medianen är 0, klippmedianernas median är 0, och
LOCO flyttar inte en enda rad — mot E3:s +23. Riktningen på det som *inte* ligger inne är
däremot lika ensidig som E3:s, bara åt andra hållet: **72 % ligger efter spannet** mot E3:s
89 % före. E2:s fel är alltså en **ensidig svans utan mitt­förskjutning**, E3:s en
**mittförskjutning ovanpå en spridning**. De är två olika feltyper, och ingen av dem åtgärdas av
det som åtgärdar den andra.

### (c) Överlever försprånget på 15 rader?

Parvis, på **exakt samma 91 rader** — netto döljer omsättningen, så båda står:

| | båda inne | bara E2 | bara den andra | ingen | netto | omsättning |
|---|---:|---:|---:|---:|---:|---:|
| **E2 mot E3** | 18 | **27** | 12 | 34 | **+15** | 39 |
| **E2 mot E4** | 28 | 17 | 14 | 32 | +3 | 31 |

Och under varm/kall-störningen (§4):

| | kall | varm | netto | inne→utanför | utanför→inne |
|---|---:|---:|---:|---:|---:|
| **E2** | 45 | 40 | **−5** | 8 | 3 |
| E3 | 30 | 27 | −3 | 7 | 4 |
| E4 | 42 | **44** | +2 | 4 | 6 |

**Mot E3: ja.** Försprånget är +15 kallt och **+13 varmt**, och parvis är E2 ensam inne på mer
än dubbelt så många rader som E3 (27 mot 12). Golvets eget netto är ≤ 5 rader och dess
omsättning 10–11. Ett försprång på 13–15 rader i båda körningarna ligger över det.

**Mot E4: nej — det finns inte.** +3 kallt, **−4 varmt** (40 mot 44). Tecknet byter, och 3 rader
av 91 var redan under golvet. **Påståendet "E2 är oftare inne än den interpolerade E3" ska
strykas** (§4).

### (d) Stabilitet

| | ruta lika | inom 1 ruta | \|skillnad\| p90 | max |
|---|---:|---:|---:|---:|
| **E2** | 64 av 103 | 84 av 103 | 3 | **95** |
| E3 | 66 av 102 | 88 av 102 | 2 | 19 |

E2:s ruta flyttar sig alltså på 38 % av svingarna, och **max 95 rutor** — svansraderna är
enskilt inte reproducerbara. Svansen som **klass** är det däremot: 9 av 10 rader ligger över
snittet i båda körningarna (§4).

---

## 3. E2:s ankare — vad skulle det behöva vara?

Frågan ställs som en **mätning**, inte som ett förslag. E2:s bakåtgående sökning hålls
**oförändrad** och bara **startrutan** varieras, ruta för ruta genom envelopen. En **tillåten
ankarruta** är en ruta där E2:s egen sökning bakåt landar inne i det mänskliga spannet.
**Ingen estimator föreslås, ingen tröskel sätts, ingenting väljs.**

> **Kontroll:** startar man i envelopens snabbaste ruta reproduceras `subframe.e2_walk` exakt på
> varje sving, annars stannar skriptet. Och den rutan är tillåten på **45 av 91** — samma tal
> som E2:s träff i [resultat.md](resultat.md) §3. Mätningen är alltså bevisligen E2:s egen regel.

### Det första svaret är att på var femte rad finns inget ankare alls

| grupp | n (rader/klipp) | **ingen tillåten ankarruta alls** |
|---|---|---:|
| alla med spann | 91 / 73 | **19 (21 %)** |
| E2 inne (träffarna) | 45 / 40 | 0 (0 %) |
| E2 utanför | 46 / 38 | **19 (41 %)** |
| **E2:s svans** | 10 / 9 | **4 (40 %)** |

**Det sätter ett tak på vad ett byte av ankare kan ge.** På 19 av 91 rader når E2:s
bakåtsökning aldrig det mänskliga spannet, oavsett var den startar — där är det inte ankaret
som är fel utan regeln *"gå bakåt till första lokala fartminimum"*. I svansen är det 4 av 10,
och det är de fyra största: `S32-092` (+205), `S32-103` (+82), `S32-062` (+56), `S32-037` (+46).

### Där mängden finns: vad den ser ut som

| grupp | n med mängd | antal rutor (median) | andel av envelopen | sammanhängande |
|---|---:|---:|---:|---:|
| alla med spann | 72 | **6** (p10 2, p90 10, max 23) | **14 %** | **72 av 72** |
| E2 inne | 45 | 7 (p10 6, p90 10) | 16 % | 45 av 45 |
| E2 utanför | 27 | 5 (p10 1, p90 13) | 5 % | 27 av 27 |
| E2:s svans | 6 | 4 (p10 2, p90 9) | 4 % | 6 av 6 |

**Mängden är alltid ett enda stycke** — 72 av 72 rader. Ett ankare behöver alltså inte välja
mellan åtskilda fönster; det finns ett fönster, och frågan är bara om man träffar det.

**Var det ligger, i tre mätbara referensramar:**

| | läge i envelopen (0 = första rutan, 1 = sista) | mot spannets slut | mot detekterat nedslag |
|---|---|---|---|
| alla med spann (n=72) | första **0,43** (p10 0,30, p90 0,53) → sista **0,55** (p10 0,37, p90 0,66) | första **−1** ruta (p10 −3, p90 +0), sista **+4** (p90 +7) | n=60: första **−10**, sista **−4** rutor |
| E2 inne (n=45) | 0,44 → 0,58 | −1 → +5 | n=40: −10 → −4 |
| E2 utanför (n=27) | 0,40 → 0,45 | −1 → +3 | n=20: −12 → −12 |
| **E2:s svans** (n=6) | **0,29 → 0,33** | −1 → +2 | n=4: **−40 → −36** |

**I mätbara termer skulle ankaret behöva vara:** en ruta i envelopens mitt — **0,43 till 0,55**
av fönstret — som börjar **vid spannets slut** (−1 ruta) och sträcker sig **0–7 rutor** efter
det, och som i de svingar där ett säkert nedslag finns ligger **4 till 12 rutor före
nedslaget**. Det vill säga: en ruta i **nedsvingen**, före bollen — precis det E2:s
konstruktion antar och precis det den inte får.

### Och det går INTE att peka ut på fart

| grupp | långsammaste tillåtna (× toppfart) | snabbaste tillåtna | mittvärdet |
|---|---:|---:|---:|
| alla med spann (n=72) | 0,07 (p10 0,02) | **1,00** (p90 1,00) | 0,25 |
| E2 inne (n=45) | 0,06 | **1,00** | 0,32 |
| E2 utanför (n=27) | 0,07 | **0,31** (p90 0,85) | 0,13 |
| E2:s svans (n=6) | 0,07 | **0,25** (p90 0,48) | 0,12 |

**Den tillåtna mängden spänner två tiopotenser i fart och överlappar helt mellan träff och
miss.** I träffarna når den 1,00 × toppfarten — per konstruktion, eftersom den snabbaste rutan
*är* tillåten där. I missarna slutar den vid 0,31. Det finns alltså ingen fartnivå som skiljer
"rätt ankare" från "fel ankare"; samma fartandel är tillåten på en rad och otillåten på nästa.
**Det som skiljer är läget, inte farten.**

### Var den snabbaste rutan hamnar när den inte duger

| grupp | n | avstånd till närmaste tillåtna | den tillåtna ligger **före** / efter | snabbaste rutans läge |
|---|---:|---:|---:|---:|
| alla med spann | 27 | median **11** rutor (p90 53, max 108) | **26** / 1 | 0,67 (p10 0,49, p90 0,93) |
| **E2:s svans** | 6 | median **46** rutor (p90 108, max 108) | **6** / 0 | **0,91** (p10 0,63, p90 0,95) |

**På 26 av 27 rader ligger det som skulle ha fungerat *före* envelopens snabbaste ruta.** Det är
samma sak [subframe.md](subframe.md) §7 mätte som "den snabbaste rutan ligger i tiondel 8–9 och
median +59 rutor efter spannet", nu sagt från motsatt håll: ankaret skulle behöva ligga **11
rutor tidigare i median över alla missar och 46 rutor tidigare i svansen.**

### Svansen rad för rad

| id | klipp | E2 | envelope-rutor | tillåtna ankarrutor | deras läge | deras fart | snabbaste rutans läge |
|---|---|---:|---:|---:|---|---|---:|
| S32-092 | 005.mp4 | +205 | 257 | **0** | — | — | 0,91 |
| S32-078 | 095.mp4 | +112 | 151 | 9 | 0,18–0,23 | 0,03–0,48 | 0,95 |
| S32-103 | 089.mp4 | +82 | 110 | **0** | — | — | 0,93 |
| S32-085 | 036.mp4 | +58 | 101 | 5 | 0,30–0,34 | 0,15–0,37 | 0,93 |
| S32-062 | 095.mp4 | +56 | 92 | **0** | — | — | 0,95 |
| S32-010 | 056.mp4 | +52 | 86 | 5 | 0,27–0,32 | 0,02–0,41 | 0,94 |
| S32-037 | 083.mp4 | +46 | 78 | **0** | — | — | 0,90 |
| S32-041 | 040.mp4 | +36 | 118 | 3 | 0,35–0,37 | 0,07–0,11 | 0,69 |
| S32-013 | 057.mp4 | +28 | 69 | 2 | 0,41–0,43 | 0,07–0,10 | 0,90 |
| S32-055 | 022.mp4 | +26 | 72 | 2 | 0,17–0,18 | 0,09–0,12 | 0,63 |

**n = 10 rader i 9 klipp, och fyra av dem har ingen tillåten ankarruta alls.** Den delmängd ett
byte av ankare *skulle* kunna nå är alltså **6 rader i 6 klipp**, med 2–9 tillåtna rutor var.
Ingen ersättare prövas här, och ingen föreslås.

---

## 4. Mätgolvet

Samma störning som [envelope-audit.md](envelope-audit.md) §6, nu körd på alla fyra:
en **varm** spårare i stället för en kall, samma modell, samma vikter, **samma bildrutor**
(envelope-audit §1). Ingenting är anpassat; bara underlaget byts.

| | ruta lika | inom 1 ruta | inne kall / varm | netto | **omsättning** | max \|skillnad\| |
|---|---|---|---|---:|---:|---:|
| **E1** | 68 av 103 | 88 av 103 | 10 / 6 | −4 | **6** | 72 |
| **E2** | 64 av 103 | 84 av 103 | 45 / 40 | −5 | **11** | **95** |
| **E3** | 66 av 102 | 88 av 102 | 30 / 27 | −3 | **11** | 19 |
| **E4** | 73 av 102 | 87 av 102 | 42 / 44 | +2 | **10** | 20 |

*(E3:s rad är identisk med envelope-audit §6, som den ska vara.)*

**Golvet är alltså: ett netto på ±5 rader av 91, en omsättning på 6–11 rader, och en ruta som
flyttar sig på en tredjedel av svingarna.** Det gäller lika för alla fyra estimatorerna — det
är inte en egenskap hos E3.

**Rubrikmåtten rör sig mindre än raderna.** Samma mått, samma svar, bara underlaget bytt
(n = 91 rader i 73 klipp, avstånd till spannet i hela rutor):

| | \|median\| kall / varm | p90 kall / varm | max kall / varm |
|---|---|---|---|
| E1 | 18,0 / 18,0 | 24,0 / 23,0 | 169,0 / 169,0 |
| **E2** | 1,0 / 1,0 | **26,0 / 30,0** | 205,0 / 205,0 |
| E3 | 1,0 / 1,0 | 3,0 / 3,0 | 26,0 / 26,0 |
| E4 | 1,0 / 1,0 | 3,0 / 3,0 | 26,0 / 26,0 |

**En estimators spridningsmått är alltså inte samma sak som dess enskilda rader.** E3:s och
E4:s är oförändrade in i sista decimalen medan 23 respektive 15 rader byter avstånd; E2:s p90 är
det enda som rör sig, och det rör sig 4 rutor. **Det är skälet till att listan nedan skiljer på
vad som är mätt och vad som bara ser litet ut.**

### Vad som överlever golvet

| | storlek | |
|---|---|---|
| E1 är fel konstruktion (median +18, inne 10 → 6 av 91) | ~18 rutor | **överlever** |
| S-32: LOCO-skiftet lyfte E3 30 → 53 av 91 | +23 rader | **överlever** |
| S-33: interpolationen lyfte E3 30 → 42 av 91 | +12 rader | **överlever** |
| S-32: E3:s förskjutning har **tecknet** −1 (median −1 i båda körningarna) | riktning | **överlever** |
| **E2:s försprång mot E3** (45/30 kallt, 40/27 varmt; parvis 27 mot 12) | +13…15 rader | **överlever** |
| Svansen som klass (E2:s p90-snitt: 9 av 10 rader samma i båda körningarna) | — | **överlever** |

Svansens stabilitet, per estimator, med varderas egen kalla p90 som snitt:

| | snitt (p90) | kall svans | varm svans | gemensamma |
|---|---:|---:|---:|---:|
| E1 | 24 rutor | 11 | 9 | 9 (82 %) |
| **E2** | 26 rutor | 10 | 11 | **9 (90 %)** |
| E3 | 3 rutor | 12 | 13 | 10 (83 %) |
| E4 | 3 rutor | 10 | 11 | **10 (100 %)** |

### Vad som ligger under golvet och ska strykas

1. **S-33 §3: "alla tre varianterna ligger inom 3 rader av varandra" (E4 42 / E5 43 / E6 44–45
   av 91).** Tre rader mot en omsättning på 10. *Redan flaggat i S-36 §6; står kvar som struket.*
2. **S-33 §4: restförskjutningen −0,24 subrutor och slutsatsen att restskiftet "ligger någonstans
   mellan 0 och −1".** En fjärdedels ruta mot ett golv där 36 % av rutorna flyttar sig alls.
   *Redan flaggat i S-36 §6; står kvar som struket.*
3. **S-34 §2: "en annan växling hade legat inne" på 1 rad av 49.** En rad. *Redan flaggat i
   S-36 §6; står kvar som struket.*
4. **Nytt: "E2 är oftare inne än E4" (45 mot 42 av 91).** +3 kallt, **−4 varmt** — tecknet byter.
   Skillnaden finns inte. **Stryk**, och stryk med den varje formulering som ställer E2:s
   träffandel mot den interpolerade E3:s.
5. **S-32 §6: kovariatcellerna som skiljer sig med ≤ 1 ruta** — face-on 1,0 mot dtl 1,0, lång
   envelope 0,0 mot 1,0, med/utan säkert nedslag 1,0 mot 1,0. Ingen av dem är skild från golvet.
   **Stryk som skillnader**; de står kvar som redovisade celler.
6. **S-32 §4 / S-33 §6: beloppet i "E3 är 1 ruta för tidig" och MAD 1,0.** Riktningen överlever,
   **beloppet gör det inte med bättre upplösning än en ruta**. *Redan flaggat i S-36 §6.*

**Fyra som INTE ska strykas — och två av dem trodde jag skulle strykas.**

- **S-32 §5:s tystnadstal på 9,5 bildrutor håller.** Det går att räkna om utan facit, eftersom
  \|E3 − E2\| inte behöver ett spann: **median 9,5 i båda körningarna** på de 4 svingar där båda
  teg (p90 43 kallt, 30 varmt), mot 1,0 i resten i båda. **Talet är reproducerbart; det som
  begränsar det är n = 4, inte körningsbruset.**
- **S-33 §5:s spridningsvinst är inte prövad här och stryks inte.** Den lever på
  **subrutesskalan** (E4 GEN p90 2,32, max 25,13), och den här störningen är mätt på hela rutor.
  På helrutesskalan rör sig spridningsmåtten inte alls: E3 och E4 ligger båda på \|median\| 1,0,
  p90 3,0 och max 26,0 i **både** kall och varm körning. **Rubrikmåtten är alltså stabilare än
  de enskilda raderna** — det är E2 som skiljer ut sig, med p90 26 → 30.
- **S-34 §2:s tre yttersta rader** (−26, −16, −9) är *avstånd*, inte skillnader mellan körningar,
  men E3:s egen max-skillnad mellan körningarna är **19 rutor** — av samma storleksordning som
  två av de tre. **Att de tre är just de tre är inte visat vara stabilt, och det är inte mätt
  här.**
- **`054.mp4`-fallet** ([subframe.md](subframe.md) §8) är 36 videorutor, långt över allt i
  tabellen.

**Detta är fortfarande en undre gräns, inte en felmarginal.** Det är **en** störning, av det slag
som är lätt att mäta. Vad 15 fps mot 30, delegat och avkodare gör är omätt, och de flyttar
rimligen minst lika mycket.

---

## 5. De oanvända flaggorna

Produktionen bär `clippedTail` (**7 av 103**) och `suspectMultiSwing` (**15 av 103**) i
exportmanifestet. Frågan är om de bär information rundorna räknat fram på annat håll.

### Svaret står i koden, och det är mätt på rundan

| | produktionens definition | rad |
|---|---|---|
| `suspectMultiSwing` | `envelope.finishSec - envelope.startSec > MULTI_SWING_SUSPECT_SEC` (**3,0 s**) | `datasetGate.ts:143`, `:56` |
| `slowmo` (auto) | `envelopeDurationSec > SLOWMO_ENVELOPE_THRESHOLD_SEC` (**3,0 s**) | `slowmo.ts:28` |
| `clippedTail` → nedslag | `if (impactIdx >= 0 && (atEnvelopeEnd \|\| clippedTail)) impactIdx = -1;` | `poseEnvelope.ts:445` |

**Samma storhet, samma konstant.** Och mätt på rundan, inte antaget ur koden:

| | |
|---|---|
| `slowmo` | **15** svingar |
| `suspectMultiSwing` | **15** svingar |
| **identiska mängder?** | **JA** — noll bara i den ena, noll bara i den andra, på alla 103 |
| utan säkert nedslag | 20 svingar |
| `clippedTail` | 7, varav **7** ligger i den mängden — **delmängd: JA** |

**`suspectMultiSwing` ÄR `slowmo`-flaggan**, ruta för ruta, av konstruktion (de kan bara skilja
sig om ett klipp körts med `force-normal`/`force-slowmo`, och inget har det). Lång envelope har
rundan splittat på sedan [resultat.md](resultat.md) §2 och §6, och [subframe.md](subframe.md) §7
namngav den redan som svansens starkaste signal. **`clippedTail` är en delmängd av *utan säkert
nedslag*** — 7 av de 20 — också en kovariat rundan redan splittat på ([resultat.md](resultat.md)
§6: "nedslaget säger ingenting").

### Korsningen, grupp för grupp

n = rader med mänskligt spann. `clippedTail` har **3** sådana rader i 2 klipp och
`suspectMultiSwing` **11** i 9 klipp.

| grupp | rader | klipp | clippedTail | suspectMultiSwing | \|E2\| median | \|E3\| median |
|---|---:|---:|---:|---:|---:|---:|
| alla med spann | 91 | 73 | 3 (3 %) | 11 (12 %) | 1,0 | 1,0 |
| E2 inne i spannet | 45 | 40 | 1 (2 %) | **1 (2 %)** | 0,0 | 1,0 |
| E2 utanför spannet | 46 | 38 | 2 (4 %) | **10 (22 %)** | 6,0 | 1,0 |
| **E2:s svans (≥26)** | 10 | 9 | **2 (20 %)** | **6 (60 %)** | **54,0** | 1,0 |
| E3 inne i spannet | 30 | 28 | 1 (3 %) | **6 (20 %)** | 0,0 | 0,0 |
| E3 utanför spannet | 61 | 51 | 2 (3 %) | **5 (8 %)** | 1,0 | 1,0 |
| E4 utanför spannet | 49 | 40 | 2 (4 %) | 6 (12 %) | 1,0 | 2,0 |
| utan armad kandidat | 23 | 18 | **0** | 1 (4 %) | 1,0 | 2,0 |
| **utan växling alls inne** | 22 | 17 | **0** | **1 (5 %)** | 1,0 | 2,0 |
| rader i de 16 klippen | 23 | 14 | **0** | 4 (17 %) | 1,0 | 1,0 |

Och från andra hållet:

| | n (rader/klipp) | E2 inne | \|E2\| median | E3 inne | \|E3\| median |
|---|---|---:|---:|---:|---:|
| `clippedTail` | 3 / 2 | 1 av 3 | 56,0 | 1 av 3 | 1,0 |
| `suspectMultiSwing` | 11 / 9 | **1 av 11** | **36,0** | **6 av 11** | **0,0** |
| ingen av flaggorna | 79 / 67 | 43 av 79 | 0,0 | 24 av 79 | 1,0 |

**Tre avläsningar, i ordning:**

- **Flaggan pekar på E2:s svans och bara den.** 6 av 10 svansrader är flaggade mot 12 % i
  rundan, och 10 av E2:s 46 missar mot 1 av 45 träffar. Men det är **samma 6 rader som `slowmo`
  fångar** — korsat: `slowmo` tar 6 av 10, `suspectMultiSwing` 6 av 10, båda tillsammans 6, och
  utanför svansen tänder vardera på 5 av 81. **Identiska, för att mängderna är identiska.**
- **För E3 går flaggan åt fel håll.** 20 % av E3:s träffar är flaggade mot 8 % av dess missar,
  och på de flaggade raderna ligger E3 inne på 6 av 11 med \|median\| **0,0** — bättre än sitt
  eget snitt. Det är samma aritmetik [resultat.md](resultat.md) §6 redan skrev om lång envelope:
  spannet är bredast just där (union median 3, max 12), så målet är större. **E3 har inte blivit
  noggrannare.**
- **På de 22 utan någon växling alls säger flaggorna ingenting.** 0 `clippedTail` och 1
  `suspectMultiSwing` (5 %) — den lägsta andelen i tabellen, precis som
  [envelope-audit.md](envelope-audit.md) §3 fick för de 16 klippen. Gruppen är
  [multiswing.md](multiswing.md) §B:s: korta envelopes med exakt en vändning. **Ingen av
  flaggorna beskriver den.**

### Mot S-35 del A:s egen flagga

| | antal | överlapp med `suspectMultiSwing` | överlapp med `clippedTail` |
|---|---:|---:|---:|
| del A:s flagga (K1/K2/K3) | 7 | **3** | 2 |

Oförändrat från [envelope-audit.md](envelope-audit.md) §5. **Del A:s flagga räknar vändningar i
banan; produktionens räknar sekunder.** Att de överlappar på 3 av 7 är vad två olika frågor om
samma 103 svingar ger, och vilken som är den riktiga flersvingsflaggan är fortfarande inte utrett.

### Raderna, en och en

| id | klipp | cT | sM | E2 | E3 | i de 16 | grupp |
|---|---|:-:|:-:|---:|---:|:-:|---|
| S32-014 | 045.mp4 | – | ja | +8 | **+0** | ja | E4 inne |
| S32-023 | 073.mp4 | – | ja | +19 | **+0** | ja | E4 inne |
| S32-031 | 062.mp4 | – | ja | **+0** | −3 | – | ingen växling |
| S32-041 | 040.mp4 | – | ja | +36 | +1 | – | E2-svans, E4 utanför |
| S32-051 | 045.mp4 | – | ja | +25 | **+0** | ja | E4 inne |
| S32-062 | 095.mp4 | **ja** | ja | +56 | +1 | – | E2-svans, E4 utanför |
| S32-067 | 009.mp4 | **ja** | – | **+0** | −1 | – | E4 inne |
| S32-078 | 095.mp4 | **ja** | ja | +112 | **+0** | – | E2-svans, E4 utanför |
| S32-085 | 036.mp4 | – | ja | +58 | **+0** | – | E2-svans |
| S32-088 | 049.mp4 | – | ja | +17 | **+0** | – | E4 inne |
| S32-092 | 005.mp4 | – | ja | +205 | −4 | – | E2-svans, E4 utanför |
| S32-103 | 089.mp4 | – | ja | +82 | −1 | ja | E2-svans, E4 utanför |

**Sju av de tolv har E3 inne i spannet medan E2 ligger +8 till +205 rutor bort.** Det är den
tydligaste bilden i hela omgången av att E2 och E3 felar på olika svingar — men det är **12
rader i 11 klipp**, och de är alla lång envelope eller kapad svans. **Ingen slutsats dras av dem.**

---

## Vad som INTE mättes

- **Ingen ny estimator, ingen tröskel, ingen kalibrering, inget skift, ingen produktionskod
  skriven.** S-30:s spärr ligger kvar. Vad som är nära nog är fortfarande ett beslut för en
  annan dag. Ankarmätningen i §3 beskriver vilka rutor som **skulle** fungera; den föreslår
  ingen regel för att hitta dem.
- **Rundan är inte omräknad på den varma körningen.** §1 visar att den kalla konfigurationen
  inte är produktionens, och §4 visar hur mycket bytet flyttar. **Men ingen siffra i S-31 till
  S-35 är ersatt här** — det vore en ny omgång, inte en diagnos, och den skulle behöva sin egen
  kontrollrad. De varma talen ovan står som störning, inte som facit.
- **De övriga paritetsavvikelserna.** 15 fps mot 30, WASM/GPU mot python-CPU, sökning mot
  sekventiell avkodning, plus [top-from-pose.md](../top-from-pose.md):s fem. **Ingen av dem är
  mätt**, och golvet i §4 är därför en undre gräns.
- **Om de 22 utan växling är samma 22 i den varma körningen.** Grupperna i §5 är byggda på den
  kalla körningen, som alla tidigare omgångar. Att de reproducerar S-34:s och S-35:s tal är
  kontrollerat; att de skulle vara samma rader varmt är **inte** mätt.
- **Varför 19 av 91 saknar tillåten ankarruta.** Mätt att de gör det, inte vad banan gör där.
- **Vad E2:s svansklipp faktiskt visar.** Samma begränsning som hela spåret: **ingen har öppnat
  en enda bildruta** ur något av de 9 klippen. `054.mp4`:s 86 rutor ligger utrullade sedan S-34
  och är fortfarande otittade.
- **Om `force-normal`/`force-slowmo` någonsin använts.** Identiteten `suspectMultiSwing` =
  `slowmo` är mätt på de 103 svingarna och följer av koden i `auto`-läge; att inget klipp kördes
  med override är slutsatsen av att mängderna är identiska, inte en avläsning av en logg.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena. Oförändrat sedan
  S-32.
- **Händighet, spegelvändning, face-on, eget material, fps.** Oförändrat sedan S-32: `unknown`
  på alla 103, bekräftad spegelvändning 2 svingar i 1 klipp, face-on 10 svingar i 9 klipp, 102
  av 103 `web`, all fps 30.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1), `opencv-python` (5.0.0) och `numpy` (2.4.6),
samt `public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. envelopebanorna (den KALLA korningen), ~15 min for 103 svingar
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. helklippsbanorna (den VARMA), ~30 min for 81 klipp
<venv>/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py <tmp>/clippose

# 4. den har matningen
#    (--section: config | e2 | anchor | floor | flags | all)
python docs/shaft/top-review/e2_and_floor.py <tmp>/pose \
    --clipPoseDir <tmp>/clippose --section all
```

`e2_and_floor.py` skriver bara till stdout. **Läs kontrollraden överst:** stämmer den inte med
[resultat.md](resultat.md), [subframe.md](subframe.md), [crossing-selection.md](crossing-selection.md),
[multiswing.md](multiswing.md) och [envelope-audit.md](envelope-audit.md) har posebanorna drivit
och inget här gäller. Skriptet stannar också om någon av de citerade produktionsraderna i §1 och
§5 har flyttat, och om `walk_from` i §3 inte reproducerar `subframe.e2_walk` på varje sving.
