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
2. **hosel** — skaftets nedre ändpunkt, **där skaftets linje slutar vara rak** och huvudet
   tar vid

**Hoseln definieras av var den raka delen tar slut.** Följ skaftet nedåt och sätt punkten
där linjen upphör att vara rak. Alltså:

- **inte** mitt i huvudets suddfläck — huvudet är en klump, inte en ändpunkt,
- **inte** vid en ferrule, dekal eller annan markering högre upp på skaftet, hur tydlig den
  än är.

**Varför:** det är skaftets *riktning* som mäts, och riktningen definieras av den raka
delen. En punkt som ligger inne i huvudet eller uppe vid en ferrule vrider den linjen.

**Varför hosel, inte klubbhuvudets centrum:** hoseln är skaftets ändpunkt och flyttar sig inte
när bladet roterar. Klubbhuvudets centrum gör det (bladrotation genom impact) och skulle göra
punkten instabil som skaftreferens.

## Punktflaggor (CVAT)

*Skärpta 2026-09 efter kalibreringen — se [Kalibreringsutfall 2026-09](#kalibreringsutfall-2026-09).
Flaggan skilde i ~12 % av framesen per punkt, och nästan hela det felet låg mellan
`occluded` och `visible`.*

- **visible** (`normal` i CVAT) — du kan **se punkten själv** i bilden.
- **occluded** — du kan **inte** se punkten, men du kan se skaftets riktning och sluta dig
  till var punkten sitter. **Placera den** på det slutna läget.
- **outside** — du kan **varken** se punkten eller sluta dig till dess läge. **Placera den
  inte.**

**Nyckelmening: `occluded` handlar om punkten, inte om bilden.** Att bilden är rörig, mörk
eller suddig i stort avgör ingenting — frågan är bara om just den punkten syns. Ett tydligt
synligt skaft vars greppände försvinner bakom axeln ger alltså **`visible` hosel +
`occluded` butt**, inte `occluded` på båda.

**En punkt utanför bildkanten är `outside`.** Kan skaftet följas ut ur bild men ändpunkten
ligger utanför ramen, är den inte placerbar — flagga `outside` och gå vidare. Sträck inte
punkten till kanten.

Frames med en saknad punkt (`outside`) behålls i datasetet — masked keypoint i träning, inte
en anledning att kasta framen.

## Rörelseoskärpa
Skaftet är ett streak över exponeringen vid snabb rörelse (framför allt downswing/impact).
Markera **alltid streakets mittpunkt, aldrig en kant**. Gäller båda punkterna.

### `blur` — mät, gissa inte

*Skärpt 2026-09 efter kalibreringen — se [Kalibreringsutfall 2026-09](#kalibreringsutfall-2026-09).
Den gamla skalan var ord utan test och gav 78 % enighet.*

Klassificera på **skaftet**, inte på bilden som helhet:

| Värde | Regel |
|---|---|
| `none` | Skaftets kanter är skarpa. Du kan peka på **en enda skaftlinje**. |
| `mild` | Skaftet är mjukt i kanten men fortfarande **en linje**. |
| `severe` | Skaftet är ett streak eller flera överlappande skaftbilder — du kan **inte** peka på en enda linje. |

**Gränsen går vid "en linje eller flera", inte vid hur ful bilden är.** En grynig,
mörk, lågupplöst eller hårt komprimerad bild där skaftet ändå är en enda mjuk linje är
`mild`, inte `severe`. En i övrigt knivskarp bild där skaftet gått till dubbelexponering är
`severe`, inte `mild`. Kompressionsartefakter, brus och dålig belysning är egenskaper hos
bilden; `blur` beskriver bara vad som hänt med skaftet under exponeringen.

Skiljelinjen `none`/`mild` är kantskärpa på en linje som fortfarande är en; skiljelinjen
`mild`/`severe` är **antalet linjer**. Är du osäker på om det är en eller flera — zooma
(se *Zoomregel*) och räkna. Kan du fortfarande inte avgöra, är det `severe`: tvekan om
antalet linjer betyder i praktiken att det inte finns en entydig linje att peka på.

## Tvetydiga frames — gå till källan

När det inte går att avgöra vilken ände som är vilken — greppände eller huvud, klubba eller
arm, ett skaft eller två i samma streak — är **normal arbetsgång att gå till klippet**, inte
att gissa på stillbilden och gå vidare:

1. Slå upp frame-id:t i `manifest.json` (ligger i den exporterade ZIP:en).
2. Öppna klippet den kom ur i `data/shaft/clips/` — `clipName` i manifestet säger vilket.
3. Spola till `tSec` och **stega bildruta för bildruta** över den framen.

Rörelsen före och efter gör nästan alltid ändarna entydiga: greppänden rör sig långsammare
än huvudet, och riktningen är kontinuerlig mellan bildrutor även när en enskild bildruta är
ett streak. Det tar en halv minut och är billigare än en felvänd etikett i evalsetet.

Är framen fortfarande otydbar efter det — då är det just det svaret som ska in: `outside`
på den punkt som inte går att sluta sig till, eller `no_shaft` om ingen punkt går att sätta.
En medvetet satt `outside` är data; en gissning är brus.

## Frame-attribut
| Attribut | Sätts av | Värden |
|---|---|---|
| `view` | annotatören | `dtl` \| `face_on` \| `other` |
| `blur` | annotatören | `none` \| `mild` \| `severe` — se *[`blur` — mät, gissa inte](#blur--mät-gissa-inte)* |
| `phase` | **annotatören** | `idle` \| `address` \| `backswing` \| `top` \| `downswing` \| `impact` \| `through` \| `finish` |
| `no_shaft` | annotatören | bool — `true` = noll punkter placerade, behålls som negativt exempel |

### `phase` sätts av annotatören

**Fasen sätts av annotatören för hand** tills fashärledningen förbättrats — se
[öppen fråga F5](../oppna-fragor.md#f5--fashärledningen-från-envelope-har-50--felfrekvens).

Bakgrund: batch-01 visade att extraktorn satte fel fas på ungefär hälften av frames mot
manuell bedömning. Att förifylls ett fel värde gav fler rättningar än noll förifyllningar
och sparade ingen tid. Annotatören sätter därför `phase` direkt i CVAT som vilket annat
attribut som helst.

**Fasernas innebörd:**

- **`idle`** — spelaren håller i klubban utan att vara i eller direkt inför en sving: före
  uppställning, mellan slag, efter att svinget är avslutat och spelaren tagit ett steg.
  Skilj från `address` (spelaren i definierad uppställning inför ett *kommande* slag) och
  `finish` (slutposition omedelbart efter ett *genomfört* slag).
- **`address`** — definierad uppställning inför slag.
- **`backswing`** — uppsvingen.
- **`top`** — toppen av svingen.
- **`downswing`** — nedsvingen.
- **`impact`** — impact-zonen.
- **`through`** — genomsvingen efter impact (klubban i rörelse).
- **`finish`** — slutpositionen; klubban stillastående bakom huvudet.

**`phase` är ett viktningsattribut** — det styr hur frames fördelas i draget
(se *Fasfördelning — målvikter*) och hur utfall grupperas — det **tränas aldrig mot**. För
svingar utan verifierad impact (`hasConfidentImpact: false`) finns ingen top/impact att
ankra på och fasgränserna är en generisk svingform; se
*[Fasfördelning över körningen](#fasfördelning-över-körningen)*.

## Zoomregel
`blur=severe` annoteras på **minst 200 % zoom** — streakets mittpunkt går inte att sätta i
100 %.

Zooma också **när du klassificerar**: frågan *en linje eller flera?* (se *[`blur` — mät,
gissa inte](#blur--mät-gissa-inte)*) avgörs inte i 100 % zoom. Zoomen är alltså ett verktyg
för att ställa diagnosen, och ett krav när diagnosen blev `severe`.

## Fasfördelning — målvikter
Datasetets frames viktas mot **downswing**, inte jämnt över tiden. Skälet är var
skaftdetekteringen är *svår*: i downswing och impact är skaftet ett rörelsestreak vars
mittpunkt måste bedömas, och det är samtidigt svingens kortaste del — en tidsjämn
sampling underrepresenterar alltså precis de frames detektorn kommer att kämpa med.
Adress och finish är nästan gratis att annotera (stillastående, skarp klubba) och får
minsta andelarna.

| Fas | Målvikt |
|---|---|
| `idle` | 2 % |
| `address` | 6 % |
| `backswing` | 14 % |
| `top` | 10 % |
| `downswing` | **34 %** |
| `impact` | 18 % |
| `through` | 10 % |
| `finish` | 6 % |

Tabellen är den auktoritativa källan för träningsdata; `PHASE_TARGET_WEIGHTS` i
[`src/lib/dataset/phaseQuota.ts`](../../src/lib/dataset/phaseQuota.ts) speglar den och
ska hållas i synk för hand.

**Notering: kalibreringssetets fördelning skiljer sig från detta.** Se
*[Kalibreringsset](#kalibreringsset)* nedan.

## Kalibreringsset
100 frames (viktade mot downswing) annoteras **oberoende av båda annotatörerna** före
produktionsannotering. Målvärde: **medianavvikelse < 0,5 skaftbredd** — som visade sig inte
gå att utvärdera, se *[Kalibreringsutfall 2026-09](#kalibreringsutfall-2026-09)*. Setet blir därefter
permanent evalset och **tränas aldrig på**. Setet dras med
`scripts/build-calibration-set.mjs` — se *[Kalibreringssetet: dra, reservera,
respektera](#kalibreringssetet-dra-reservera-respektera)* längst ned.

**Fasfördelningen för kalibreringssetets** (downswing 40 %, impact 15 %, top 12 %, backswing 12 %,
through 9 %, address 7 %, finish 5 %) **skiljer sig avsiktligt från träningsfördelningen** (34 % / 18 % / 10 % / 14 % / 10 % / 8 % / 6 %).
Övervikten mot downswing är konservativ — en hårdare eval-set gör metriken mer konservativ, vilket är rätt
riktning. Se docs/oppna-fragor.md, B4.

## Kalibreringsutfall 2026-09

Mätt 2026-09-13 med `scripts/measure-calibration.mjs` (se *[Mäta
samstämmigheten](#mäta-samstämmigheten)*) på erik vs lisa, **97 av 100** frames annoterade
av båda — de tre återstående reserverade ids:en kom aldrig in i CVAT-tasken och är alltså
ännu inte mätta. Full rapport: `data/shaft/calibration/agreement.md` (gitignorad — persondata).
Det här avsnittet finns för att reglerna ovan ska gå att förstå bakåt: de skärptes av de
här siffrorna.

**Placeringen höll. Etiketterna gjorde det inte.**

| Mått | Median | p90 | Max | n |
|---|---:|---:|---:|---:|
| **Vinkel** (skaftets riktning, butt→hosel) | **0,3°** | 1,3° | 2,3° | 81 |
| `butt`, andel av bildhöjden | 0,17 % | 1,01 % | 2,79 % | 94 |
| `hosel`, andel av bildhöjden | 0,13 % | 0,33 % | 4,26 % | 83 |
| `butt`, px | 2,5 | 12,8 | 37,4 | 94 |
| `hosel`, px | 1,9 | 4,7 | 26,1 | 83 |

Vinkeln är huvudsiffran: reglerna mäter skaftvinklar, så ett fel *längs* skaftet kostar
ingenting medan samma fel *tvärs* skaftet kostar en regel. **0,3° i median** betyder att
själva handlaget — var man klickar när man väl vet vad man letar efter — inte är problemet.

**Attribut under 80 % enighet:**

| Attribut | Samma värde | Åtgärd |
|---|---:|---|
| `phase` | **56/97 (58 %)** | Annoteras inte längre för hand — fylls från manifestet. |
| `blur` | **76/97 (78 %)** | Ny regel: *en linje eller flera*, inte hur ful bilden är. |
| `view` | 92/97 (95 %) | Oförändrad — höll måttet. |

**Synlighetsflaggan** skilde i ~12 % per punkt (`butt` 85/97, `hosel` 84/97), och nästan
hela felet låg mellan `occluded` och `visible`: 10 av 12 oeniga `butt`-frames och 8 av 13
`hosel`-frames. Felet är dessutom **enkelriktat**: erik satte `occluded` på butt i 51 frames
mot lisas 43, och 8 av de 12 oenigheterna är erik `occluded` / lisa `visible`. Den rimliga
tolkningen — inte mätt, men den som passar mönstret — är att den ena läste `occluded` som
*"bilden är svår"* och den andra som *"punkten syns inte"*. Därav nyckelmeningen i
*Punktflaggor*.

**Vad som gick att förutsäga och inte.** `severe blur` stack ut precis som specen antog
(`butt`-median 0,56 % mot 0,14 % för `none`; vinkel 1,1° mot 0,2°) — svåra frames *är*
svårare, och zoomregeln är befogad. **`downswing` stack inte ut** — men den hinken innehöll
bara 6 frames, just för att fasetiketten var så omtvistad att de flesta downswing-frames
föll ur jämförelsen. Det är en icke-observation, inte ett friskintyg; frågan får ställas om
när `phase` kommer från manifestet och hinkarna blir hela.

**Målvärdet gick inte att utvärdera.** Specen sätter *medianavvikelse < 0,5 skaftbredd*, men
2-punktsschemat bär ingen bredd, så det finns inget att dividera med. Rapporten redovisar px
och andel av bildhöjden i stället. Antingen behöver målet formuleras om i de enheterna, eller
så måste en skaftbredd mätas för hand på ett urval frames innan tröskeln kan användas.

**Kvar att granska för hand:** rapportens avsnitt 5 (skaftlängd) och 7 (de 15 största
avvikelserna). Värst är `096-a36a587d_s00_f01` — 47 % skillnad i skaftlängd mellan
annotatörerna på samma bild, vilket betyder att någon satt en ändpunkt på fel sak.

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
inget som tränas mot. Utan verifierad impact (`hasConfidentImpact: false`, då selektionen
ändå faller till uniform baslinje, ADR-002) finns ingen top/impact att ankra på och
fasgränserna blir en generisk svingform.

**Manifestets `phase` är det härledda startvärdet.** Det sätts sedan av annotatören för
hand i CVAT — se *[`phase` sätts av annotatören](#phase-sätts-av-annotatören)*. Det
annoterade värdet är auktoritativt; `scripts/reconcile-phase.mjs` slår ihop dem och
skriver `phase-corrected.json` som träningspipelines ska läsa.

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

**Fasfördelning för kalibreringssetets** (summerar till 100, inte samma som specens målvikter — se *Fasfördelning — målvikter* ovan):

| `downswing` | `impact` | `top` | `backswing` | `through` | `address` | `finish` |
|---:|---:|---:|---:|---:|---:|---:|
| 40 | 15 | 12 | 12 | 9 | 7 | 5 |

Denna övervikning mot downswing är avsiktlig: kalibreringssetets uppdrag är att vara ett hårdare,
konservativt evalset där downswing — svingens svåraste fas — dominerar. Träningsdata dras i stället
från specens målvikter (34 %, 18 %, 10 % osv.).

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

---

## Mäta samstämmigheten

`scripts/measure-calibration.mjs` jämför de två oberoende annoteringarna av
kalibreringssetet och skriver rapporten som avgör om produktionsannoteringen får börja.

```powershell
# Default: data/shaft/calibration/{erik,lisa}.zip → .../agreement.md
node scripts/measure-calibration.mjs
node scripts/measure-calibration.mjs --a data/shaft/calibration/erik.zip --b data/shaft/calibration/lisa.zip
node scripts/measure-calibration.mjs --dry-run    # bara terminalsammanfattningen
```

Indata är CVAT:s **COCO Keypoints 1.0**-export *utan bilder* (en
`annotations/person_keypoints_default.json` i varje ZIP). Frames matchas på **frame-id**,
aldrig på COCO:s `image_id` — det senare är en räknare per task och två oberoende tasks
har ingen anledning att numrera likadant.

### Synlighetsflaggan avgör, aldrig koordinaten

COCO kodar `v=0` (ej annoterad), `v=1` (annoterad men ej synlig) och `v=2` (synlig). CVAT
skriver `outside`→0 och `occluded`→1, vilket motsvarar specens tre punktflaggor ovan.
**CVAT behåller koordinaterna för en `outside`-punkt** (senaste dragna läget ligger kvar i
exporten), så ett skript som avgör "är punkten satt?" på koordinaten i stället för flaggan
räknar in spökpunkter. Skriptet jämför en punkt endast när **båda** annotatörerna har
`v≥1`.

Mappningen är ett antagande om någon annans exportör, så den **verifieras mot filens
innehåll** i stället för att tas för given: värdemängden {0,1,2}, att `num_keypoints` är
lika med antalet punkter med `v>0` (COCO:s egen definition, alltså ett oberoende vittne om
vilka flaggor exportören anser vara placerade) och att `v=1` alls förekommer — en export
helt utan `v=1` gör `occluded`→1 **obekräftad**, inte bekräftad. Verdiktet står först i
rapporten, inte i en fotnot.

### Vad rapporten innehåller (`data/shaft/calibration/agreement.md`)

| Avsnitt | Innehåll |
|---|---|
| 0 | Verifiering av synlighetskodningen — ✅/⚠️/❌ per kontroll. |
| 1 | Täckning: frames båda annoterat, ensidiga, samt per punkt var bara en satt position. |
| 2 | Flaggsamstämmighet per punkt, 3×3-korstabell outside/occluded/visible. |
| 3 | Avstånd där båda placerat: median, p90, max — **px och normaliserat mot bildhöjden**. |
| 4 | Samma statistik uppdelad per `phase`, `view` och `blur`. |
| 5 | Skaftlängd butt–hosel per annotatör; de 10 största skillnaderna. |
| 6 | Vinkelavvikelse, totalt och per fas. |
| 7 | De 15 frames med störst avvikelse, med frame-id, för manuell granskning. |

**Varför två enheter.** Setet blandar 720×818 och 1080×1920, så samma pixelavvikelse är
olika stora fel i olika frames och en median i px vore ett medelvärde över ojämförbara
saker. Läs den normaliserade siffran; px står kvar för att det är vad man ser när man
öppnar framen igen.

**Varför vinkeln är huvudsiffran.** Reglerna mäter skaftvinklar. En punkt som ligger fel
*längs* skaftet kostar ingenting; samma fel *tvärs* skaftet kostar en regel. Avstånden i
avsnitt 3–5 är diagnostik för avsnitt 6. Vinkelskillnaden viks **inte** vid 90°: butt→hosel
är en riktad vektor eftersom punkterna är ordnade, så ombytta ändpunkter ska synas som
~180° i stället för att tyst absorberas som 0°.

**Varför skaftlängd är med.** Två annotatörer vars butt–hosel-*avstånd* skiljer kraftigt på
samma bild är inte oense om några pixlar — någon har satt en ändpunkt på fel sak
(händerna i stället för greppets ände, klubbhuvudets centrum i stället för hoseln).

**Attributen kan också vara annoterade.** `view` och `blur` sätts av annotatörerna, så de är
en egen källa till oenighet. Bara frames där **båda** satt samma värde hamnar i en hink i
avsnitt 4 — annars skulle samma frame ligga i två rader och varje hink bli en blandning.
Oenigheterna listas separat, och ett attribut under 80 % enighet får en varning: hinkarna
under det blir tunna, och slutsatsen är då att *attributet* behöver en skarpare definition,
inte att placeringen i en viss hink är bra eller dålig.

`phase` jämförs på samma sätt, men **fylls sedan 2026-09 från manifestet** och ska därför
vara identisk i båda exporterna (se *[`phase` annoteras inte för
hand](#phase-annoteras-inte-för-hand)*). Kontrollen står kvar just därför: dyker en
`phase`-oenighet upp i en framtida mätning är det inte annotatörerna som är oense, det är
ett tecken på att tasken skapades utan manifestvärdet eller att fältet gjordes redigerbart
av misstag.

**Skaftbreddsmålet går inte att utvärdera här.** Specen sätter medianavvikelse < 0,5
skaftbredd, men 2-punktsschemat bär ingen bredd. Rapporten redovisar px och andel av
bildhöjden och säger det uttryckligen i stället för att räkna om med en gissad bredd.

Skriptet skriver **aldrig utanför `data/shaft/`** (samma guard som draget) och lägger inga
nya beroenden till projektet — ZIP-läsningen är återanvänd från
`scripts/build-calibration-set.mjs`. Beräkningsfunktionerna är rena och enhetstestade i
`scripts/measure-calibration.test.mjs` (avstånd, percentiler mot numpys `linear`,
vinkelskillnad över ±180-sömmen, samt jämförelselogiken på syntetiska exporter).

---

## Träningsbatchar: dra, exkludera

Kalibreringssetet är evalset och tränas aldrig på. Allt annat i poolen är
annoteringsbart, och `scripts/build-training-batch.mjs` skär ut det i batchar.

```powershell
# Default: 150 frames → data/shaft/training/batch-01/
node scripts/build-training-batch.mjs
node scripts/build-training-batch.mjs --n 200 --out data/shaft/training/batch-02
node scripts/build-training-batch.mjs --dry-run    # pool + drag, skriver inget
```

### Exkludering är hela poängen

Skriptet läser **`data/shaft/calibration/reserved-ids.txt` och avbryter om den saknas.**
Det är avsiktligt hårt: en saknad lista ser ut precis som "inget att exkludera", och det
felet upptäcks först månader senare när evalsiffrorna är omotiverat bra. Ett reserverat id
i träningsdata gör varje evaltal till ett memoreringstal.

Utöver den läses **varje `data/shaft/training/*/ids.txt`** utom den katalog som just skrivs,
så en frame aldrig annoteras två gånger. Vilka filer som lästes står i batchens `summary.md`
under *Exkludering* — kontrollera den tabellen, den är hela skyddet. `--exclude <fil>` lägger
till fler listor, `--no-auto-exclude` stänger av den automatiska upptäckten.

Rapporteras en exkluderad id som **saknad i poolen** betyder det att exporten den kom ur
inte ligger i `data/shaft/exports/` — draget är fortfarande säkert, men poolen är inte den
pool kalibreringssetet drogs ur.

### Samma drag, egen seed

Urvalet är `selectCalibrationSet` från `build-calibration-set.mjs`, återanvänd rakt av —
samma spridning över svingar (max 1 per sving, taket höjs ett steg i taget), samma
web/own-balans, samma utfyllnad från `downswing` när en fas tar slut. Bara två saker
skiljer:

- **Faskvoterna** kommer från specens målvikter ovan, upplösta till hela frames med största
  resten (jämför [F4 i öppna frågor](../oppna-fragor.md) — kalibreringssetets kvoter gör
  det *inte*). För `--n 150`: downswing 51, impact 27, backswing 21, top 15, through 15,
  address 9, finish 9, idle 3.
- **Seeden** är `TRAINING_SEED`, skild från kalibreringens `SELECTION_SEED`. Delad seed
  hade korrelerat de två blandningarna, så träningsbatchen hade dragits mot just de frames
  som nätt och jämnt missade kalibreringsurvalet — träningsdata av evalsetets närmaste
  grannar.

### Utdata (`data/shaft/training/<batch>/`)

| Fil | Innehåll |
|---|---|
| `batch.zip` | `frames/<id>.jpg` + `manifest.json`, samma per-frame-format som exporterna plus `trainingBatch`. Manifestet bär `phase` per frame. |
| `ids.txt` | Ett id per rad. Läses automatiskt som exkludering av nästa batch. |
| `labels-frame-meta.json` | Etikettschemat taggen kräver. |
| `prefill-phase.xml` | **Skrivs ej** — förifyllning inaktiverad, se nedan. |
| `summary.md` | Exkludering, fas- och källfördelning, exporter, varningar. |

### Förifylld `phase` i CVAT — AVSTÄNGD

> ⚠️ **`prefill-phase.xml` skrivs inte av `build-training-batch.mjs` tills vidare.**
> Fashärledningen hade ~50 % felfrekvens mot manuell bedömning på batch-01 — fler
> rättningar än noll förifyllningar. Annotatören sätter `phase` för hand som vilket annat
> attribut som helst. Se [öppen fråga F5](../oppna-fragor.md#f5--fashärledningen-från-envelope-har-50--felfrekvens).

Förmågan att generera `prefill-phase.xml` finns kvar i `prefillPhaseXml()` i skriptet och
kan återaktiveras när fashärledningen är tillräckligt bra. Det verifierade formatet är:

```bash
cvat-cli task create "shaft batch-XX" \
  --labels labels-frame-meta.json \
  --annotation_path prefill-phase.xml \
  --annotation_format "CVAT 1.1" \
  local frames/
```

`prefill-phase.xml` är **CVAT for images 1.1**: ett `<image>` per frame med en
`<tag label="frame_meta">` som bär `<attribute name="phase">`. `<tag>` är CVAT:s
dokumenterade per-frame-annotering.

**Två fallgropar, båda verifierade i CVAT:s dokumentation:**

1. **Etikettschemat kan inte importeras.** *"Only label names can be imported this way,
   colors, attributes, and skeleton labels must be defined manually."* Attributet `phase`
   måste alltså finnas på tasken innan XML:en laddas upp — via `--labels` ovan eller för
   hand i etikettkonstruktorn. Utan `frame_meta`-etiketten tas taggarna tyst inte emot.
2. **`image/@name` måste matcha bildens namn i tasken.** Namnen i XML:en bär prefixet
   `frames/`, vilket matchar `batch.zip` (CVAT behåller relativa sökvägar ur ett uppladdat
   arkiv). Skapas tasken från en katalog med lösa JPEG:ar heter bilderna bara `<id>.jpg` —
   ta bort prefixet först.

**`phase` läggs som tag, inte som attribut på `shaft`-skelettet.** Ett attribut på skelettet
går bara att förifylla genom att skicka med ett skelettobjekt per frame, alltså förplacerade
punkter — precis den styrning annoteringen ska vara fri från. Följden är att `phase` i
exporten hamnar som en tagg-annotering och inte i `annotations[].attributes` där
`view`/`blur`/`no_shaft` sitter. `scripts/measure-calibration.mjs` läser `phase` därifrån och
får tomma fashinkar mot en batch med det här schemat; manifestet bär fasen oavsett.

Skriptet skriver **aldrig utanför `data/shaft/`** och lägger inga nya beroenden till
projektet. Exkludering, faskvoter och determinism är enhetstestade i
`scripts/build-training-batch.test.mjs`.
