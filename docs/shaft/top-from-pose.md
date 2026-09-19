# Bär MediaPipes handledspunkter toppen, där skaftlinjen inte gör det? (S-31, spike)

> 2026-09-18, `stream-shaft`. **Spike — ingen produktionskod ändrad, ingen fix byggd, inget
> tröskelbeslut fattat.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är orörda.
>
> Frågan kommer ur att [top-from-signal.md](top-from-signal.md) (S-27),
> [top-from-dense-signal.md](top-from-dense-signal.md) (S-28) och
> [top-from-dropout.md](top-from-dropout.md) (S-29) alla föll på att skaftet är en **linje**
> som förkortas och försvinner i DTL-projektionen just vid toppen. En **punkt** — handleden —
> gör inte det på samma sätt. Facit är detsamma som i S-27–S-29:
> [phase-audit/review.md](phase-audit/review.md) och dess 32 bedömda rader.

> **RÄTTELSE 2026-09-19 (S-39) — etiketten `slow-mo` i den här rapporten betyder
> `lång envelope (> 3,0 s)`.** Manifestets `slowmo` är `deriveSlowmo(envelopeDurationSec,
> 'auto')`, alltså **`envelopeDuration > 3,0 s`** och ingen mätning av filmhastighet — samma
> predikat som `suspectMultiSwing`, mätt identiskt på alla 103 svingar
> ([top-review/hard-core.md](top-review/hard-core.md) §5). **Varje siffra nedan står oförändrad; bara etiketten på uppdelningen
> ändras, och riktningen i varje slutsats håller.** Ordet är utbytt i texten nedan där det
> namnger en uppdelning; fältnamnet `slowmo`, konstanten `SLOWMO_ENVELOPE_THRESHOLD_SEC` och
> lägena `force-slowmo`/`force-normal` är kodnamn och står kvar som de är. Originalordalydelsen
> ligger i git-historiken före den här rättelsen. Inventering: [top-review/verdict-sensitivity.md](top-review/verdict-sensitivity.md) §5.

## Svaret

**Ja — handleden bär en observerad topp där skaftlinjen inte gjorde det, men underlaget är
n = 6 bedömda toppar över 5 oberoende klipp och bär ingen tröskel.**

Grinden i steg 1 faller ut åt andra hållet än för skaftet: handleden tappas i praktiken aldrig.
**8 av 6 548** envelope-bildrutor saknar pose över huvud taget (0,12 %), medianen för `presence`
är **0,998**, och i **100 av 103** svingar finns ingen enda bildruta under 0,5. Runt alla sex
utpekade topparna finns pose i **7 av 7** bildrutor (±3), mot skaftets 0/1/7/7/1/4 i S-29.
Det som S-29 dödade hypotesen på finns alltså inte här.

Två av tre estimatorer landar sedan inom ett par bildrutor: **E3** (teckenväxling i vertikal
hastighet med hysteres) har medianavstånd **1,5 videobildrutor (0,050 s)** till Eriks
toppintervall och **E2** 1,9 rutor (0,062 s), mot skaftmetodens 0 av 6 träffar i S-28. **E1**
(högsta händer över hela envelopen) är fel konstruktion: händerna står högre i finishen än vid
toppen, så E1 landar i envelopens sista tiondel i 42 av 103 svingar.

Stabiliteten är också en annan: E3:s val flyttar sig **median 0 bildrutor** över hysteressvepet
(81 av 103 svingar står helt still), mot S-28:s median 8 bildrutor. **S-28 föll på instabilitet;
det gör inte det här.**

**Men:** E3 träffar inte *inne* i Eriks intervall mer än 1 gång av 6 — den ligger typiskt 1–2
bildrutor före. Två av de sex raderna är samma klipp (`093.mp4`), en (rad 12) är den enda
med **lång envelope (> 3,0 s)** bland de sex och är varje estimators sämsta rad, och 97 av de 103 körda
svingarna har inget facit alls. **Inget tal här bär en tröskel, och ingen extrapolering görs.**

## STEG 0 — inventering

### Vilka bedömda rader har lokal källvideo?

`data/shaft/clips/` innehåller 96 web-klipp och ett eget (`own/IMG_5427.MP4`). Av
[review.md](phase-audit/review.md):s **32 bedömda rader** har **15** en lokal källvideo — exakt
samma 15 som S-28 arbetade på, så resultaten är direkt jämförbara.

| # | frame-id | klipp | sving | Eriks svar | `impactSec` | lång envelope |
|---:|---|---|---|---|---|:-:|
| 1 | `057-1d1b5748_s00_f02` | `057.mp4` | `057…_s00` | downswing | — | nej |
| 2 | `047-4d3e3909_s00_f01` | `047.mp4` | `047…_s00` | osäker | 2,524 | nej |
| 7 | `089-51f5ef4b_s00_f02` | `089.mp4` | `089…_s00` | finish | 4,342 | **ja** |
| 11 | `028-4f3f90e8_s00_f06` | `028.mp4` | `028…_s00` | finish (kontroll) | — | nej |
| 12 | `073-bd53202e_s01_f01` | `073.mp4` | `073…_s01` | backswing★ | — | **ja** |
| 15 | `095-b6402f36_s00_f01` | `095.mp4` | `095…_s00` | finish | — | **ja** |
| 16 | `093-2c11c3c0_s00_f02` | `093.mp4` | `093…_s00` | backswing★ | 5,400 | nej |
| 18 | `031-eda42b98_s00_f05` | `031.mp4` | `031…_s00` | osäker (kontroll) | — | **ja** |
| 19 | `009-1617ed23_s00_f01` | `009.mp4` | `009…_s00` | downswing | — | nej |
| 21 | `054-0d1b3ff3_s00_f00` | `054.mp4` | `054…_s00` | osäker (kontroll) | 4,996 | nej |
| 28 | `061-f51f439d_s00_f01` | `061.mp4` | `061…_s00` | **top** | 2,519 | nej |
| 29 | `055-c5e9ec1a_s00_f01` | `055.mp4` | `055…_s00` | backswing (kontroll) | 2,880 | nej |
| 30 | `045-224bdedb_s00_f01` | `045.mp4` | `045…_s00` | **top** | 2,667 | nej |
| 31 | `093-2c11c3c0_s01_f01` | `093.mp4` | `093…_s01` | backswing★ | 21,600 | nej |
| 32 | `068-db6f6eec_s00_f02` | `068.mp4` | `068…_s00` | backswing★ | 1,855 | nej |

**Oberoende klipp, inte rader.** De 15 raderna är **15 svingar** i **14 distinkta källklipp** —
`093.mp4` bidrar med två svingar (rad 16 och 31). De rader som bär en **utpekad topp** är sex
(12, 16, 28, 30, 31, 32) i **fem oberoende klipp**, eftersom 16 och 31 är samma klipp. Alla
siffror mot facit nedan står på det underlaget.

### Fanns det redan beräknade handledsbanor?

**Nej, inga som går att använda.** Det enda som finns i repot är
`src/lib/__fixtures__/*.json` — fyra rå landmärkesserier (`dtl-full`, `dtl-clipped`, `face-on`,
`session-multi`) exporterade ur dev-vyn för `poseEnvelopeRegression.test.ts`. **Inget av de
klippen är något av de 97 i `data/shaft/clips/`**, så ingen av dem går att koppla till en
bedömd rad. Ingen pose-utdata finns i `data/`. Alltså kördes MediaPipe per videobildruta.

### Körningen

Samma urval som S-28: alla svingar vars källklipp finns lokalt. **103 svingar** (102 `web` +
1 `own`) i **81 distinkta källklipp**. Urvalet är därmed **nästan helt konfunderat med källan**
på precis samma sätt som i S-28 — resultatet säger ingenting om eget material.

**10 102 avkodade bildrutor**, varav **6 548 inne i envelopen** — exakt samma tal som S-28
rapporterade för skaftet, vilket är en välkommen kontroll på att envelopefönstret är detsamma.
Utanför envelopen avkodas 0,6 s marginal åt vardera hållet, så ett ±0,5 s-fönster runt en topp
nära envelopekanten får plats. **8,2 minuter total väggtid**, ~20 ms per bildruta på CPU.
Körningen är lokal och kostnadsfri; inget API anropas.

## MODELLPARITET

| | Produktionskedjan (`poseTrajectory.ts` + `poseDetector.ts`) | Den här spiken |
|---|---|---|
| Modell | `public/models/pose_landmarker_lite.task` | **samma fil** |
| Körläge | `runningMode: 'VIDEO'` | `RunningMode.VIDEO` |
| Antal poser | `numPoses: 1` | `num_poses=1` |
| Indata | `<video>`-elementet i klippets **egen upplösning**, ingen skalning, ingen JPEG-omkodning | avkodad bildruta i samma upplösning, BGR→RGB, ingen skalning, **ingen** JPEG-omkodning |
| Graf | kall per klipp (`resetPoseLandmarker`) | kall per sving |
| Tidslinje | `round(t*1000)`, strikt växande, börjar om per klipp | samma |

Upplösningarna i materialet är klippens egna: 1080×1920 (67 svingar), 720×1280 (15) och 16
andra format ned till 360×614. Inget skalas.

**Avvikelser — nedskrivna, inte valda bort i tysthet:**

1. **Runtime-version.** Webben kör `@mediapipe/tasks-vision` **0.10.35**; här körs Python-paketet
   `mediapipe` **1.0.1**. `.task`-tillgången är densamma, men bindningarna är inte samma bygge.
2. **Delegat.** Produktionen försöker **GPU** först och faller tillbaka på CPU; här körs alltid
   **CPU**.
3. **Bildrutetakt.** `poseTrajectory.ts` samplar `SAMPLE_FPS = 15`; den här spiken kör **varje
   videobildruta** (30 fps i allt material). `VIDEO` är ett *spårningsläge* där varje bildruta
   sås med den föregåendes detektion, så takten är inte kosmetisk — den ändrar spårningen.
   Uppdraget bad om per videobildruta, och en tätare signal är också vad frågan handlar om, men
   det betyder att banorna här **inte är bit-för-bit det produktionen skulle producera**.
4. **Startpunkt.** Produktionen kör klippet från t = 0; här startas 0,6 s före envelopen, så
   spårningen har färre uppvärmningsbildrutor bakom sig.
5. **Avkodare.** Webbläsarens videoavkodare mot OpenCV/FFmpeg. Samma bildrutor, inte garanterat
   bit-identiska pixlar.

Ingen annan modell prövades, och ingen tröskel i modellkedjan rördes.

## STEG 1 — observerbarhet, GRIND före estimator

**Frågan S-29 ställde om skaftet, ställd om handleden: tappas punkten just där toppen ligger?**

### Över alla 103 svingar (6 548 envelope-bildrutor)

| Mått (sämsta av handled 15/16) | median per sving | p10 | p90 | extrem |
|---|---:|---:|---:|---:|
| `presence`, median | **0,998** | 0,996 | 0,999 | min 0,980 |
| `visibility`, median | 0,481 | 0,351 | 0,646 | min 0,070 |
| andel bildrutor `presence` < 0,5 | **0,000** | — | 0,000 | max 0,093 |
| andel bildrutor `visibility` < 0,5 | 0,643 | — | 0,912 | max 1,000 |
| längsta lucka helt utan pose | **0** | — | 0 | max **3** |
| längsta lucka `presence` < 0,5 | **0** | — | 0 | max 8 |
| längsta lucka `visibility` < 0,5 | 19 | — | 50 | max 94 |

**8 av 6 548 bildrutor (0,12 %) saknar pose över huvud taget.** I **100 av 103** svingar finns
ingen enda bildruta där någon handled har `presence` under 0,5. Jämför skaftet i S-28: **29 %**
av bildrutorna utan godkänd detektion och **0 av 103** svingar med full täckning.

**`presence` och `visibility` mäter olika saker och ska inte slås ihop.** `presence` säger att
landmärket finns i bilden, `visibility` att det inte är skymt. Den vänstra handleden är i DTL
skymd av kroppen stora delar av svingen, så i mediansvingen har **64 % av bildrutorna minst en
handled under 0,5** i `visibility` — men positionen levereras ändå, och det är positionen estimatorerna läser. **Grinden går på
`presence`.** Att rapportera `visibility` som om den vore en täckningsgrind vore att hitta på ett
bortfall som inte finns.

### Klumpar sig luckorna vid övergången? Nej — tvärtom

Andel bildrutor under tröskeln per tiondel av envelopen (0 → 100 %):

| tiondel | 0–10 | 10–20 | 20–30 | 30–40 | 40–50 | 50–60 | 60–70 | 70–80 | 80–90 | 90–100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `presence` < 0,5 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,02 |
| `visibility` < 0,5 | 0,81 | 0,73 | 0,65 | 0,46 | **0,28** | **0,27** | 0,42 | 0,68 | 0,81 | 0,82 |

`presence`-bortfallet är noll i nio tiondelar av tio och 2 % i den sista (finishen). Och
`visibility` är **som bäst** vid 40–60 % av envelopen — där de sex utpekade topparna ligger
(39–56 %). Båda måtten pekar alltså åt samma håll: **handleden är som mest observerbar just vid
toppen**, medan skaftet i S-29 var som kortast där (0,23–0,65 av sin vanliga längd).

### De bedömda raderna, ±0,5 s runt Eriks topp

| # | sving | `presence` median | `visibility` median | rutor `presence`<0,5 | rutor `visibility`<0,5 | längsta `presence`-lucka |
|---:|---|---:|---:|---:|---:|---:|
| 12 | `073…_s01` | 0,998 | 0,678 | **0** / 30 | 7 / 30 | 0 |
| 16 | `093…_s00` | 1,000 | 0,616 | **0** / 30 | 10 / 30 | 0 |
| 28 | `061…_s00` | 0,998 | 0,661 | **0** / 30 | 8 / 30 | 0 |
| 30 | `045…_s00` | 0,999 | 0,498 | **0** / 31 | 16 / 31 | 0 |
| 31 | `093…_s01` | 1,000 | 0,661 | **0** / 30 | 6 / 30 | 0 |
| 32 | `068…_s00` | 0,998 | 0,622 | **0** / 30 | 9 / 30 | 0 |

Och i S-29:s eget mått, **±3 bildrutor runt toppen**, direkt jämförbart:

| # | skaftet (S-29) | handleden (här) |
|---:|---:|---:|
| 12 | **0** av 7 | **7** av 7 |
| 16 | 1 av 7 | **7** av 7 |
| 28 | 7 av 7 | 7 av 7 |
| 30 | 7 av 7 | 7 av 7 |
| 31 | 1 av 7 | **7** av 7 |
| 32 | 4 av 7 | **7** av 7 |

**Hypotesen överlever grinden.** Det som dödade S-28/S-29 — att signalen inte finns vid
övergången — gäller inte handleden. De fyra rader där skaftet var borta har full pose-täckning.

## STEG 2 — tre estimatorer, hållna åtskilda

Ingen sammanvägning, ingen tröskel satt efter att ha sett facit. Alla tre läser **mittpunkten
mellan handled 15 och 16** i normerade bildkoordinater (y växer nedåt, så högsta händer =
minsta y). Standardvärdena nedan skrevs in i skriptet innan någon rad jämfördes mot facit; steg 4
sveper dem.

- **E1 — extremum i handled-y** (högsta händer) inom envelopen. Fritt: utjämningsfönster
  (standard 1, alltså ingen utjämning).
- **E2 — minimum i handledens 2D-hastighet mellan baksving och nedsving.** "Mellan baksving och
  nedsving" definieras utan att titta på facit: den snabbaste bildrutan i envelopen är
  nedsvingen (händerna är snabbast kring nedslaget); gå **bakåt** därifrån till första lokala
  minimum. Den svackan är övergången. Fritt: utjämningsfönster (standard 3).
- **E3 — teckenväxling i vertikal hastighet med hysteres.** Baksvingen har v_y < −h (händerna
  stiger), nedsvingen v_y > +h. Vald bildruta är korsningen före den **första** −→+ -växlingen.
  Fritt: hysteresband h (standard 0,10 bildhöjder/s) och utjämningsfönster (standard 3).

### Var landar de, över alla 103 svingar?

Antal svingar per tiondel av envelopen (0 → 9):

| | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | inget val |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **E1** | 2 | 0 | 0 | 8 | 13 | 7 | 8 | 7 | 16 | **42** | 0 |
| **E2** | 0 | 0 | 0 | 19 | **40** | 22 | 8 | 3 | 10 | 1 | 0 |
| **E3** | 2 | 4 | 12 | 24 | **42** | 10 | 5 | 2 | 0 | 0 | 2 |

**E1 är fel konstruktion och det syns utan facit.** Händerna står **högre i finishen än vid
toppen** — det är precis vad `poseEnvelope.ts` själv dokumenterar om sin `apexY` — så ett
extremum över hela envelopen landar i sista tiondelen i 42 av 103 svingar. E2 och E3 samlar sig
i stället kring 30–60 %, där topparna ligger.

## STEG 3 — mot facit

`review.md` ger fas per bildruta, inte topp-tidpunkt, så de två frågorna mäts åtskilt.

**Eriks topp som punkt och intervall** (samma konvention som S-29): `top` (rad 28, 30) = den
bedömda bildrutan; `backswing★` (rad 12, 16, 31, 32) = hans skäl är att klubbhuvudet hänger mer
i **nästa** bildruta, så toppen ligger i intervallet `[bedömd ruta, nästa envelope-ruta]`.

### (a) Diskriminering — väljer estimatorn en bildruta Erik bedömt som icke-topp?

**Grupp A** — rader där Erik svarade något annat än `top` och ingen topp ligger intill
(rad 1, 7, 11, 15, 19, 29). En träff = estimatorn väljer just den bildrutan.

| | grupp A | rader |
|---|---:|---|
| E1 | **1** av 6 | 7 |
| E2 | **0** av 6 | — |
| E3 | **0** av 6 | — |

**Grupp B** — stjärnraderna (12, 16, 31, 32). Där är den bedömda rutan **underkanten** på Eriks
toppintervall, så ett val där är högst en envelope-ruta för tidigt och inte ett fel av samma
slag: E1 2 av 4, E2 1 av 4, E3 3 av 4. Redovisas för sig just därför.

De tre `osäker`-raderna (2, 18, 21) går inte att bedöma mot och räknas inte någonstans.

### (b) Avstånd till Eriks topp

Avstånd till **intervallet** (0 = inne i det). Videobildrutor à 1/30 s.

| # | Eriks svar | E1 | E2 | E3 |
|---:|---|---:|---:|---:|
| 12 | backswing★ | +0,452 s | +1,186 s | +0,386 s |
| 16 | backswing★ | **0,000 s** | +0,078 s | **0,000 s** |
| 28 | top | +0,712 s | +0,046 s | +0,012 s |
| 30 | top | +0,700 s | −0,033 s | −0,067 s |
| 31 | backswing★ | +0,777 s | +0,144 s | −0,034 s |
| 32 | backswing★ | −0,035 s | −0,002 s | −0,068 s |
| | **inne i intervallet** | 1 av 6 | 0 av 6 | 1 av 6 |
| | **median \|dt\|** | 0,576 s / 17,3 rutor | 0,062 s / **1,9 rutor** | 0,050 s / **1,5 rutor** |
| | **max \|dt\|** | 0,777 s | 1,186 s | 0,386 s |

**n = 6 över 5 oberoende klipp.** Jämförelsen med S-28 är den som betyder något: skaftmetodens
vändpunkt träffade **0 av 6** exakt och hade bara **1 av 6** ens bland sina kandidater. E3 ligger
median **1,5 videobildrutor** från Eriks intervall och aldrig mer än 0,386 s fel; E2 median 1,9
rutor men med en rad 19× värre än medianen.

**Rad 12 är varje estimators sämsta rad, och den är särskild på två sätt.** Den är den **enda
med lång envelope (> 3,0 s) bland de sex**, och dess handhöjdsplatå är 0,8 s bred: y rör sig bara mellan
0,4861 och 0,4917 från 9,90 till 10,73 s, med sitt minimum vid 10,43. Erik läser toppen på
klubbhuvudet vid 9,71–9,98 s; händerna fortsätter stiga omärkligt en halv sekund till. **Det är inte ett detektionsfel utan två olika
definitioner av topp** — och med n = 1 lång envelope bland sex går det inte att säga vilket av de två
som förklarar raden.

**Hur brett är det val estimatorn gör?** Bredden på platån varje estimator måste plocka en enda
bildruta ur:

| # | höjdplatå (< 1 % av bildhöjden från min) | fartplatå (< 20 % av maxfart) | fart vid Eriks topp |
|---:|---:|---:|---:|
| 12 | 30 rutor | 85 rutor | 0,04 av max |
| 16 | 10 rutor | 19 rutor | 0,15 |
| 28 | 13 rutor | 29 rutor | 0,05 |
| 30 | 4 rutor | 19 rutor | 0,05 |
| 31 | 5 rutor | 19 rutor | 0,13 |
| 32 | 13 rutor | 21 rutor | 0,12 |

Toppen ligger på en platå även här — men en **mycket smalare** platå än skaftets, och
hastighetens *teckenväxling* (E3) har en kant i den där höjden inte har någon.

## STEG 4 — stabilitet

Varje estimators fria parameter sveps; siffran är hur många videobildrutor det valda svaret
flyttar sig mellan svepets ytterlägen. **S-28 föll på just detta: median 8 bildrutor.**

| Estimator / svep | median | p90 | max | står helt still | flyttar > 10 rutor | utan val |
|---|---:|---:|---:|---:|---:|---:|
| E1, utjämning 1–9 rutor | 2 | 4 | 74 | 8 / 103 | 7 | 0 |
| E2, utjämning 1–9 rutor | 4 | 27 | 84 | 1 / 103 | 28 | 0 |
| **E3, hysteres 0,02–0,40** | **0** | 19 | 104 | **81 / 103** | 15 | 2 |
| E3, utjämning 1–9 rutor | 1 | 4 | 25 | 21 / 103 | 6 | 2 |
| *S-28, skaftets ε 0,5–12°* | *8* | — | — | *19 / 89* | *38* | — |

**E3 är okänslig för sin hysteres i 81 av 103 svingar** — valet rör sig inte en enda bildruta
när bandet ändras 20×. Det är den tydligaste enskilda skillnaden mot S-28. E2 är den mest
instabila av de tre (28 svingar flyttar sig mer än 10 bildrutor).

På de sex raderna med utpekad topp, antal bildrutor valet flyttar sig:

| # | E1 (utjämning) | E2 (utjämning) | E3 (hysteres) | E3 (utjämning) |
|---:|---:|---:|---:|---:|
| 12 | 2 | 4 | **0** | 1 |
| 16 | 27 | 8 | 6 | 1 |
| 28 | 2 | 2 | **0** | 1 |
| 30 | 1 | 1 | **0** | **0** |
| 31 | 3 | 4 | 7 | 7 |
| 32 | 2 | 10 | **0** | 1 |

**Bär någon parameter i svepet rätt svar?** Bästa parametern träffar Eriks intervall i 2 av 6 för
E1, 2 av 6 för E2 och 2–3 av 6 för E3. **Att svepets bästa punkt är bättre än standardvärdet är
inget resultat** — det är att välja parameter efter facit på sex rader, och det görs inte här.

### Sidokontroll: håller estimatorerna med varandra där det inte finns facit?

E2 mot E3 över de 101 svingar där båda ger ett val: median **1 bildruta** isär, inom 3 rutor i
**63**, inom 10 i **76**. **25 svingar är mer än 10 bildrutor oense.** Samstämmighet är inte
korrekthet — men två oberoende konstruktioner som pekar på samma bildruta i ungefär två
tredjedelar av ett material utan facit säger att det finns *en händelse* att peka på, vilket är
mer än skaftsignalen kunde visa.

### Post hoc, och märkt som sådant: det finns redan en sådan estimator i koden

Efter att E1:s finish-bias var synlig prövades E1 **begränsad till `[envelope-start, impactSec]`**.
Det är ingen ny idé — det är exakt `impact.topSec` i `src/lib/poseEnvelope.ts`, som redan i dag
räknas fram ur samma handledsmittpunkt. **Detta är inte en av de tre pre-registrerade
estimatorerna och redovisas för att det är en observation om befintlig kod, inte som ett
resultat:**

| # | val | `impactSec` | dt mot Eriks intervall |
|---:|---:|---:|---:|
| 16 | 4,833 s | 5,400 | **0,000 s** / 0,0 rutor |
| 28 | 2,167 s | 2,519 | +0,046 s / +1,4 rutor |
| 30 | 2,333 s | 2,667 | −0,067 s / −2,0 rutor |
| 31 | 21,067 s | 21,600 | **−0,000 s** / −0,0 rutor |
| 32 | 1,400 s | 1,855 | −0,035 s / −1,1 rutor |

Alla fem inom ±2 bildrutor. **Men den kräver ett säkert nedslag**, och rad 12 — den enda av de
sex utan `impactSec` — kan den inte svara på alls. Det är samma population som
[phase-audit/resultat.md](phase-audit/resultat.md) §4 pekar ut som värst: de 32 svingar vars
`top` kommer ur `FALLBACK_BOUNDS`, där 5 av 5 bedömda rader var fel fas. **Den vägen hjälper
alltså inte där problemet är störst.** E3 kräver inget nedslag.

## Vad som INTE mättes

- **`face_on`.** Alla 32 bedömda rader är `dtl` **per konstruktion** (urvalskravet i
  [phase-audit/README.md](phase-audit/README.md)), så noll face-on-rader har ett facit att mäta
  mot. Vyn står inte i exportmanifestet, så vy-blandningen bland de 103 körda svingarna är
  **omätt här** — inget tal i dokumentet gäller face-on.
- **Vänsterhänt spel.** `handedness` finns inte i datamodellen (se [STATUS.md](STATUS.md) §4).
  `093.mp4` är det **spegelvända** klippet och bidrar med **två av de sex** raderna med utpekad
  topp (16 och 31). Ingen av de tre estimatorerna läser händighet — händerna stiger i baksvingen
  oavsett — men ingen verifierat vänsterhänt, ospeglad sving är bedömd, så påståendet är oprövat.
- **Lång envelope (> 3,0 s).** 15 av de 103 svingarna är `slowmo: true` — vilket är
  `envelopeDuration > 3,0 s` och inte en mätning av filmhastighet. **En av de sex** raderna
  med utpekad topp bär flaggan (rad 12), och den är varje estimators sämsta rad. Med n = 1 är det en
  observation, inte ett samband.
- **Eget material.** 102 av 103 svingar är `web`. Samma konfundering som S-28; ingenting här
  säger något om egna klipp.
- **97 av 103 svingar har inget facit.** Alla siffror mot Eriks bedömning står på 6 rader i 5
  klipp. Fördelningarna över 103 svingar (steg 2 och 4) mäter estimatorernas **beteende**, inte
  deras korrekthet.
- **Paritetsavvikelserna 1–5 ovan är oprövade.** Hur mycket en GPU-delegat, 15 fps i stället för
  30, eller en annan avkodare flyttar banorna är inte mätt.
- **Höger mot vänster handled var för sig.** Allt räknas på mittpunkten; ingen känslighetsanalys
  på att välja en av dem är gjord.
- **Kostnaden i webbläsaren.** Inte mätt. Till skillnad från S-28 är det här ingen ny
  inferenskedja: `extractPoseTrajectory` körs redan på varje klipp. Vad *täthet* (30 fps mot
  dagens 15) skulle kosta är däremot omätt.

## Slutsats

**Handleden bär en observerad topp där skaftlinjen inte gjorde det.** Grinden som fällde
S-28/S-29 finns inte här: 0,12 % av envelope-bildrutorna saknar pose, `presence` har median
0,998, 100 av 103 svingar har ingen bildruta under 0,5, och vid alla sex utpekade topparna finns
pose i 7 av 7 bildrutor mot skaftets 0/1/7/7/1/4. Bortfallet klumpar sig inte vid övergången —
det är som minst just där.

Av de tre estimatorerna är **E1 fel konstruktion** (finishen står högre än toppen; 42 av 103 val
i sista tiondelen), medan **E3** ligger median **1,5 videobildrutor** från Eriks toppintervall,
väljer aldrig en av de sex rader Erik entydigt kallade icke-topp, och **flyttar sig median 0
bildrutor** när hysteresen sveps 20× — mot skaftmetodens 0 av 6 träffar och median 8 bildrutors
drift i S-28. E2 träffar nästan lika bra men är klart mer parameterkänslig.

**Det här är en öppning, inte ett svar.** E3 träffar inte *inne* i Eriks intervall mer än 1 gång
av 6 — den ligger typiskt 1–2 bildrutor före — och de sex raderna är fem klipp, varav ett
spegelvänt bidrar med två och en lång envelope står för hela den dåliga svansen. Ingen tröskel sätts
här, ingen produktionskod rörs, och S-30:s spärr ligger kvar: **ett mätvärde svarar fortfarande
inte utan observerad fas.** Vad som skulle krävas för att lyfta den är en kontrollrik omgång i
[phase-audit/](phase-audit/):s anda — blint bedömda toppar i tillräckligt många oberoende klipp,
med face-on och verifierat vänsterhänt material, så att E3:s avstånd till ögat kan mätas i
stället för att skattas på sex rader.

## Kör om

Kräver ett venv med `mediapipe` (körd på 1.0.1) och `opencv-python`, samt
`public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna + de bedömda raderna ur review.md
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. handledsbanorna, ~8 min för 103 svingar
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. analysen (--section: 1 | 23 | 4 | x | b | all)
python docs/shaft/top-from-pose/analyze_pose.py <tmp>/pose \
    --reviewRows <tmp>/review_rows.json --section all
```

Skripten ligger i [top-from-pose/](top-from-pose/): `rows_from_review.py` (indata),
`run_pose.py` (MediaPipe per videobildruta) och `analyze_pose.py` (steg 1–4 + sidokontroller).
