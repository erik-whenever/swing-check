# Skaftannotering — spec

> Nytt spår, **parallellt med pose** (se [pose-detection.md](../pose-detection.md)). Rör inte
> pose-koden eller `frameExtractor.ts` för detta arbete.

## Syfte
2-punkts skaftdetektering på de ~20 frames/sving som `selectEnvelopeFrames` redan väljer
(se [pose-detection.md](../pose-detection.md) → *Arkitektur (pass 3)*). **Ej i rAF-loopen** —
ingen realtidskrav, bara på de redan uttagna analys-framesen.

## Klass
`shaft` — skeleton med **exakt 2 punkter**, fast ordning:

1. **butt** — greppets ände (klubbans övre ändpunkt, **INTE** händerna)
2. **hosel** — där skaftet går in i klubbhuvudet

**Varför hosel, inte klubbhuvudets centrum:** hoseln är skaftets ändpunkt och flyttar sig inte
när bladet roterar. Klubbhuvudets centrum gör det (bladrotation genom impact) och skulle göra
punkten instabil som skaftreferens.

## Punktflaggor (CVAT)
- **normal** — synlig och exakt placerad.
- **occluded** — skymd men positionen går att sluta sig till → placera ändå på gissad position.
- **outside** — går ej att avgöra → placera inte.

Frames med en saknad punkt (`outside`) behålls i datasetet — masked keypoint i träning, inte
en anledning att kasta framen.

## Rörelseoskärpa
Skaftet är ett streak över exponeringen vid snabb rörelse (framför allt downswing/impact).
Markera **alltid streakets mittpunkt, aldrig en kant**. Gäller båda punkterna.

## Frame-attribut
| Attribut | Värden |
|---|---|
| `view` | `dtl` \| `face_on` \| `other` |
| `blur` | `none` \| `mild` \| `severe` |
| `phase` | `address` \| `backswing` \| `top` \| `downswing` \| `impact` \| `through` \| `finish` |
| `no_shaft` | bool — `true` = noll punkter placerade, behålls som negativt exempel |

## Zoomregel
`blur=severe` annoteras på **minst 200 % zoom**.

## Fasfördelning — målvikter
Datasetets frames viktas mot **downswing**, inte jämnt över tiden. Skälet är var
skaftdetekteringen är *svår*: i downswing och impact är skaftet ett rörelsestreak vars
mittpunkt måste bedömas, och det är samtidigt svingens kortaste del — en tidsjämn
sampling underrepresenterar alltså precis de frames detektorn kommer att kämpa med.
Adress och finish är nästan gratis att annotera (stillastående, skarp klubba) och får
minsta andelarna.

| Fas | Målvikt |
|---|---|
| `address` | 8 % |
| `backswing` | 14 % |
| `top` | 10 % |
| `downswing` | **34 %** |
| `impact` | 18 % |
| `through` | 10 % |
| `finish` | 6 % |

Detta är kalibreringssetets *"viktade mot downswing"* uttryckt i siffror. Tabellen är
den auktoritativa källan; `PHASE_TARGET_WEIGHTS` i
[`src/lib/dataset/phaseQuota.ts`](../../src/lib/dataset/phaseQuota.ts) speglar den och
ska hållas i synk för hand.

## Kalibreringsset
100 frames (viktade mot downswing) annoteras **oberoende av båda annotatörerna** före
produktionsannotering. Målvärde: **medianavvikelse < 0,5 skaftbredd**. Setet blir därefter
permanent evalset och **tränas aldrig på**.

## Persondata
Datasetet innehåller identifierbara personer och **publiceras aldrig**. Bilder och exporter
lagras lokalt, gitignorade (`data/shaft/`).

## Export
COCO Keypoints 1.0.

---

## Verktyget: Dataset extractor (dev-only)

Frames plockas inte för hand. Vyn **"Dataset extractor"** (bakom `VITE_DEV_PREVIEW`)
kör produktionskedjan över videofiler och packar resultatet som en ZIP redo att
importeras i CVAT.

### Köra

```bash
VITE_DEV_PREVIEW=true npm run dev
```

Öppna appen, tryck **⚗︎ Dataset** (knappen nere till höger — logg-panelens knapp sitter
nere till vänster).

1. **Välj klipp** — en eller flera videofiler. Ingen kamera, inget capture-flöde.
2. **Märk varje klipp innan körning:** `source` (`web` | `own`), `slowmo` (bool) och en
   valfri fritextnotis. Attributen beskriver *materialet*, inte extraktionen, och en
   körning kostar minuter av pose-inferens — därför sätts de före, inte efter.
3. **Extract** — kör klippen i tur och ordning. Ett klipp som faller loggas och körningen
   fortsätter. **Stop** avbryter; det som hunnit extraheras är fortfarande nedladdningsbart.
4. **Download ZIP.**

### Vad kedjan är

Exakt produktionens, oförändrad — det är hela poängen: en skaftdetektor kommer att köra
på de frames produktionen faktiskt skickar, så datasetet måste dras ur samma selektion.

```
extractPoseTrajectory()      pose-sampel för hela klippet
  → detectSessionSwings()    ett segment per sving, grindat (ADR-003)
    → selectEnvelopeFrames(envelope, ANALYSIS_FRAME_COUNT)
      → cullToPhaseTargets(…, 7)      ← ENDA dev-steget
        → grabFramesAtTimes(0.92, full frame)
```

`cullToPhaseTargets` **tar bort** frames, den väljer aldrig andra: selektionen ger 32
frames per sving, vilket är långt fler än en människa hinner sätta två punkter på, så
setet skärs till **max 7 per sving** efteråt. Vilka 7 avgörs av målvikterna ovan —
frames delas ut en i taget till den fas som ligger längst under sin målandel och
fortfarande har frames kvar. Saknar en sving frames i en fas (ingen verifierad impact,
avklippt svans) flyter den andelen till nästa fas i stället för att gå förlorad, vilket
är varför totalen för en körning kan avvika från måltalen även när varje sving är exakt.

**Full upplösning, ingen beskärning**, JPEG-kvalitet 0,92. Ström E:s pose-crop är rätt
för Vision-anropet (det betalar per pixel) och fel här: att placera två punkter med
sub-skaftbredds-noggrannhet är precis vad en nedskalning kastar bort.

### ZIP-innehåll

```
frames/<id>.jpg
manifest.json
```

`manifest.json` har en toppnivå (`appVersion`, `extractedAt`, `frameQuality`,
`maxFramesPerSwing`, `phaseTargets`, antal) plus `frames: []` med ett objekt per bild:

```json
{
  "id": "dtl-range-3f2a91c4_s00_f03",
  "clipName": "DTL range.mov",
  "swingIndex": 0,
  "frameIndex": 3,
  "tSec": 7.612,
  "phase": "downswing",
  "envelopeSec": [6.78, 8.38],
  "impactSec": 7.85,
  "source": "own",
  "slowmo": false,
  "notes": ""
}
```

**`id` är stabilt och härlett** ur `clipName` + `swingIndex` + `frameIndex`, aldrig
slumpat: `<slug>-<FNV-1a av filnamnet>_s<sving>_f<frame>`. Samma fil in ger samma id ut,
så annoteringar går att matcha mot frames efter en omkörning. Hashen finns för att två
klipp med snarlika namn annars kan sluga till samma sträng och tyst skriva över varandras
frames i arkivet.

`phase` härleds ur svingens envelope och är **ungefärlig** — den är ett viktningsattribut,
inget som tränas mot. Utan verifierad impact (då selektionen ändå faller till uniform
baslinje, ADR-002) finns ingen top/impact att ankra på och fasgränserna blir en generisk
svingform. Annotatören ser framen och rättar i CVAT.

### Gränser

ZIP:en skrivs utan komprimering (JPEG är redan entropikodad) och byggs i minnet — inget
nytt beroende, men inte heller ZIP64: arkiv över 4 GiB **vägras** i stället för att
skrivas trasiga. Ligger inte i närheten för en handannoteringsomgång.

Exporten läser produktionskoden och matar aldrig tillbaka i den: ingen store-skrivning,
inget Vision-anrop, ingen `SwingRecord`. `frameExtractor.ts`, `poseEnvelope.ts`,
`poseSegments.ts` och `poseEnvelopeSelection.ts` är oförändrade.
