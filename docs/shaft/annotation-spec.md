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
permanent evalset och **tränas aldrig på**. Setet dras med
`scripts/build-calibration-set.mjs` — se *[Kalibreringssetet: dra, reservera,
respektera](#kalibreringssetet-dra-reservera-respektera)* längst ned.

## Persondata
Datasetet innehåller identifierbara personer och **publiceras aldrig**. Bilder och exporter
lagras lokalt, gitignorade (`data/shaft/`).

## Export
COCO Keypoints 1.0.

---

## Källmaterial: hämta klipp från r/GolfSwing

`scripts/fetch-reddit-clips.mjs` bygger en klipplista ur subredditens **publika
JSON-listning** (ingen auth, ingen API-nyckel). Den paginerar med `after`, väntar minst
2 s mellan requests och **avbryter vid 429**. Endast native Reddit-video behålls;
korspostar, externa länkar, bilder och borttagna poster hoppas över.

```powershell
# Klipplista (default: sort=top, time=year, pages=5 → data/shaft/urls.txt)
node scripts/fetch-reddit-clips.mjs
# Flaggor: --sort top|new|hot  --time all|year|month  --pages N  --out data/shaft/urls.txt
node scripts/fetch-reddit-clips.mjs --sort top --time all --pages 10
```

Skriptet skriver **bara** i `data/shaft/`:

- `urls.txt` — en permalink per rad, för `yt-dlp -a`.
- `sources.json` — per post `{id, permalink, title, created_utc, duration}`, så en frame i
  manifestet kan spåras till Reddit-tråden den kom från.

Ladda sedan ner videorna med `yt-dlp` (Windows/PowerShell):

```powershell
yt-dlp.exe -f bv -a data/shaft/urls.txt -o "%(id)s.mp4"
```

`-f bv` tar bästa video-only-strömmen (ingen ljudmux behövs för frame-extraktion) och
`%(id)s.mp4` namnger filen efter Reddit-post-id:t, samma id som `sources.json` bär.
Klippen är personidentifierbara — de stannar lokalt och gitignoras (se *Persondata*).

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
`maxFramesPerSwing`, `slowmoThresholdSec`, `phaseTargets`, `relaxedEnvelopeSecRange`,
`multiSwingSuspectSec`, `swingsByGate`, antal) plus `frames: []` med ett objekt per bild:

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
  "envelopeDurationSec": 1.6,
  "slowmoMode": "auto",
  "gate": "production",
  "clippedTail": false,
  "hasConfidentImpact": true,
  "suspectMultiSwing": false,
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

### Acceptansgrind

Extraktorn har en **egen, lösare grind** än produktionens `isSwing`
(`src/lib/dataset/datasetGate.ts`). Skälet är att ekonomin är omvänd: ett falskt positiv i
analysen kostar ett Vision-anrop och feedback på ett bollplock, medan en bortkastad sving
i datasetet är en sving ingen kan annotera — och precis de svingar produktionen vägrar
analysera är de kantfall en skaftdetektor måste överleva. `isSwing` är **orörd**; den
lösare grinden körs efter och tar upp det produktionen förkastade.

En kandidat accepteras när `envelope.valid`, envelope-varaktigheten ligger i
**[0,6 s, 12,0 s]** och topphastigheten klarar produktionens tröskel (0,4 × refSpeed).
Alltså släpps `clippedTail`, dålig handledssynlighet, nedsvingsgränserna och cooldown.
Kvar står den **vertikala exkursionen** (0,08) — händer som aldrig gick upp är ett
bollplock, och ett bollplock är ingen sving hur hungrigt datasetet än är.

Envelopes över **3,0 s** (produktionens en-svings-tak) kan spänna över flera svingar. De
körs vidare oförändrat och taggas `suspectMultiSwing: true` i stället för att delas här —
att dela dem hade betytt att implementera om segmenteringen i dev-lagret. Annotatören
kontrollerar dem i CVAT.

Varje frame bär `gate` (`production` | `dataset-relaxed`), `clippedTail`,
`hasConfidentImpact` och `suspectMultiSwing`, så kvaliteten på de lösare fallen kan mätas
separat när annoteringarna kommer tillbaka. Körsammanfattningen visar hur många svingar
varje grind bidrog med.

### Fasfördelning över körningen

Faskvoten balanseras över **hela exporten**, inte per sving. Per sving går det inte: en
fas så lätt som `finish` (6 % av 7 frames = 0,42) avrundas till noll i varje enskild
sving, och en körning på 50 svingar exporterar då noll finish-frames. Underskottet bärs
i stället framåt mellan svingar tills fasen vinner en tilldelning. Mätt över 10 svingar
med en realistisk 32-framesselektion ligger varje fas inom **0,9 procentenheter** från
sitt mål (finish 5,7 % mot 6 %).

### Gränser

ZIP:en skrivs utan komprimering (JPEG är redan entropikodad) och byggs i minnet — inget
nytt beroende, men inte heller ZIP64: arkiv över 4 GiB **vägras** i stället för att
skrivas trasiga. Ligger inte i närheten för en handannoteringsomgång.

Exporten läser produktionskoden och matar aldrig tillbaka i den: ingen store-skrivning,
inget Vision-anrop, ingen `SwingRecord`. `frameExtractor.ts`, `poseEnvelope.ts`,
`poseSegments.ts` och `poseEnvelopeSelection.ts` är oförändrade.

---

## Kalibreringssetet: dra, reservera, respektera

`scripts/build-calibration-set.mjs` drar de 100 frames som utgör kalibreringssetet ur
de exporterade ZIP:arna i `data/shaft/exports/`. Setet har två liv, i den ordningen:

1. **Annotatörsöverenskommelse.** Båda annotatörerna sätter sina två punkter på samma
   100 bilder, oberoende av varandra, *innan* produktionsannoteringen börjar. Utfallet
   mäts mot målvärdet ovan (medianavvikelse < 0,5 skaftbredd). Punkter som systematiskt
   glider isär betyder att specen är otydlig, inte att någon annoterar slarvigt — då
   skärps specen och setet annoteras om.
2. **Permanent evalset.** Efter kalibreringen är samma 100 frames det setet varje
   skaftdetektor mäts på. Därför får de **aldrig ingå i träningsdata**.

### `reserved-ids.txt` är bindande

`data/shaft/calibration/reserved-ids.txt` innehåller ett frame-id per rad — exakt de
frames som ligger i kalibreringssetet. **All framtida träningsdatabyggnad måste läsa
filen och filtrera bort dessa ids.** En frame som både tränats på och mäts på ger ett
memoreringsvärde, inte ett generaliseringsvärde, och det syns inte på siffran: den blir
bara omotiverat bra. Ids är stabila och härledda (`frameId`, se
[`src/lib/dataset/datasetTypes.ts`](../../src/lib/dataset/datasetTypes.ts)), så
filtreringen fungerar även mot en ny export av samma klipp.

### Så dras setet

```bash
node scripts/build-calibration-set.mjs
node scripts/build-calibration-set.mjs --dry-run            # pool + urval, skriver inget
node scripts/build-calibration-set.mjs --exports <dir> --out <dir>
```

Skriptet läser alla `.zip` i `data/shaft/exports/` (`frames/` + `manifest.json` ur var
och en) och slår ihop manifesten till en pool. **Dubbletter av `id` avbryter körningen**
och listas: samma klipp har då extraherats i två exporter, och de två bildernas bytes är
inte garanterat identiska eftersom selektionen kan ha ändrats mellan körningarna — en
frame i evalsetet vars pixlar inte matchar metadatan är precis det reservationslistan
finns för att förhindra. Ta bort den äldre exporten och kör om.

**Fasfördelning** (summerar till 100, samma viktning mot downswing som tabellen ovan):

| `downswing` | `impact` | `top` | `backswing` | `through` | `address` | `finish` |
|---:|---:|---:|---:|---:|---:|---:|
| 40 | 15 | 12 | 12 | 9 | 7 | 5 |

Räcker inte en fas till fylls bristen från `downswing`. Räcker inte `downswing` heller
tas resten från övriga faser — det loggas som en **varning i `summary.md`** och betyder
att poolen är för liten för ett spec-enligt set.

**Urvalet är deterministiskt.** Poolen sorteras på `id` och blandas med en seedad PRNG
(`SELECTION_SEED`, konstant i filen), så samma indata alltid ger samma 100 ids oavsett
vilken ordning ZIP:arna lästes i. Ändra **inte** seeden efter att annoteringen startat:
reservationslistan skulle byta innehåll och redan annoterade evalframes bli
träningsbara. Fler exporter i `exports/` ändrar däremot draget — det är väntat, och
skälet till att utdatan är en artefakt som sparas snarare än något som regenereras vid
behov.

**Spridning.** Max **1 frame per sving** när poolen tillåter det — två frames ur samma
sving är nästan samma bild och köper en bråkdel av vad två frames ur olika svingar köper
i en överensstämmelsemätning. Har poolen färre svingar än setet behöver frames höjs taket
ett steg i taget i stället för att släppas helt. `source` balanseras mot ungefär hälften
`web`, hälften `own`: webbklipp och egna klipp skiljer sig i kamera, bildutsnitt och
kompression, och en kalibreringssiffra dragen ur bara det ena säger lite om det andra.

### Utdata (`data/shaft/calibration/`)

| Fil | Innehåll |
|---|---|
| `calibration.zip` | `frames/<id>.jpg` + `manifest.json` — samma metadataformat per frame som indata, plus `calibration: true` (och `exportFile`, vilket arkiv bilden lyftes ur). |
| `reserved-ids.txt` | Ett id per rad. Listan över frames som är bannlysta från träning. |
| `summary.md` | Faktisk fas- och källfördelning, antal svingar, poolens storlek, vilka exporter som ingick, samt varningar när draget inte kunde följa specen. |

Skriptet skriver **aldrig utanför `data/shaft/`** (kontrolleras före varje skrivning) och
lägger inga nya beroenden till projektet: ZIP läses med `node:zlib` och skrivs med samma
store-metod-skrivare som [`src/lib/dataset/zip.ts`](../../src/lib/dataset/zip.ts).
Urvalsfunktionen är ren och enhetstestad i `scripts/build-calibration-set.test.mjs`
(determinism, fasfördelning, max 1 per sving).
