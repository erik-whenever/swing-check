# Datamodellen för skaftmätvärden

> Kod: [`src/lib/shaft/measure/`](../../src/lib/shaft/measure/). Schemat och punkternas
> definitioner: [annotation-spec.md](annotation-spec.md). Plattformsfrågan (native vs
> PWA) som lagret är byggt för att överleva: [oppna-fragor.md](../oppna-fragor.md) → *F6*.
>
> Den här filen beskriver **vad varje mätvärde är, vad det förutsätter, och vad som inte
> går att härleda ur två punkter i 2D.** Den sista listan är lika viktig som den första:
> ett mätvärde som inte finns är billigt att sakna och dyrt att låtsas ha.

---

## Varför lagret finns

Detektorn returnerar **punkter per bildruta**. Regler behöver **mätvärden per sving**,
med osäkerhet, i en form som överlever två byten vi redan vet kan komma:

- **Plattformsbyte.** Native iOS/Android i stället för PWA är obeslutat (*F6*). Ett
  rådatalager som rör `document`, `performance` eller `import.meta.env` följer inte med.
- **Detektorbyte.** Den levererande modellen är tvåpunkts (`shaft-v2.onnx`); schemat är
  fyrapunkts. En fyrapunktsmodell ska kunna släppas in utan att något ovanför ändras.

Därför tre lager med en tydlig riktning:

```
shaftSeries.ts    ren data — vad detektorn producerade för en sving
     ↓            (fromDetection.ts är enda sömmen tillbaka till runtime)
plausibility.ts   grinden — varje mätvärde lämnar den med en kvalitetsflagga
     ↓            (CheckedShaftSwingSeries går inte att förfalska utanför modulen)
derived.ts        de fem mätvärden som är ärliga i 2D, vart och ett med sina
                  förutsättningar som data
```

Regler ligger **ovanför** `derived.ts` och är inte skrivna än. Den här uppgiften bygger
inga regler, ingen UI och rör inte Vision-prompten.

---

## 1. Rådatalagret — `shaftSeries.ts`

En `ShaftSwingSeries` bär, per sving:

| Fält | Vad |
|---|---|
| `clipName`, `swingIndex` | vilken sving i vilket klipp |
| `cameraAngle` | `dtl`, `face-on` eller **`null`** när ingen fastställt vyn |
| `imageSize` | källbildens pixelrymd — den enda koordinatrymd som förekommer |
| `model` | `{ file, keypoints, provider }` — **vilken modellversion som producerade talen** |
| `frames[]` | analysbildrutorna, stigande i `tSec` |
| `producedAt`, `appVersion` | härkomst |

Och per bildruta (`ShaftFrameSample`):

| Fält | Vad |
|---|---|
| `tSec` | tid i klippet, samma klocka som `FrameMetadata.tSec` |
| `phase` | annoteringsspecens åtta faser |
| `butt`, `hosel`, `toe`, `heel` | punkt + **konfidens**, eller `null` |
| `shaftAngleDeg` | riktningen `butt → hosel` |
| `bladeAngleDeg` | riktningen `heel → toe` — **bärs, exponeras inte uppåt** |
| `body` | de sex MediaPipe-landmärken mätvärdena läser, i samma pixelrymd |

### Fyra val som är avsiktliga

**Lagret är rent data.** Inga beräkningar, inget beroende till `onnxruntime-web` eller
webbläsaren, inte ens ett typimport. En post ska kunna `JSON.parse`:as på en server, i ett
Node-test eller i en native-runtime. Sömmen mot detektorn ligger i `fromDetection.ts`, och
den importerar bara **typer** — modellens filnamn kommer in som argument i stället för via
`MODEL_FILE`, eftersom den konstanten hade dragit in hela detektormodulen i varje bundle.

**Vinklarna bärs som fält men räknas inte här.** Producenten fyller dem; matten står i
`angles.ts`. Att räkna om dem på fyra ställen är hur två av dem får olika wrap-konvention.

**Vinkelkonventionen är Pythons.** `atan2(dy, dx)` i bildkoordinater (y nedåt), grader,
(-180, 180], riktade vektorer `butt → hosel` och `heel → toe` — värde för värde samma som
`angle_deg`/`ANGLES` i [`training/evaluate.py`](../../training/evaluate.py). En vinkel mätt
i webbläsaren och en mätt i utvärderingen är samma tal.

> **En avvikelse, med flit.** `angle_difference` i Python är
> `abs((a - b + 180) % 360 - 180)`. Det är rätt i Python, där `%` är modulo. JavaScripts
> `%` är en **rest** som behåller vänsteroperandens tecken, så samma uttryck ger 358 där
> det ska ge 2 — precis vid sömmen funktionen finns för. TS-versionen gör dubbel modulo.
> Buggen fanns i första utkastet och fångades av ett test; därav anteckningen.

**Sex landmärken, inte 33.** Att bära hela uppsättningen hade gjort posten till en kopia
av pose-trajektorian. De sex (axlar, höfter, handleder) är vad "skaftet relativt kroppen"
behöver. `left`/`right` är personens egna sidor och **säger ingenting om handedness**.

---

## 2. Rimlighetskontrollen — `plausibility.ts`

**Ett mätvärde når aldrig en regel utan att ha passerat kontrollen**, och det är
typsystemet som håller det: `derived.ts` tar en `CheckedShaftSwingSeries`, och
`checkShaftSeries` är det enda som producerar en. Den som vill kringgå kontrollen får
skriva en cast.

Varje bildruta får **två** flaggor — en för skaftvinkeln, en för bladvinkeln — på tre
nivåer:

- **`usable`** — ta talet.
- **`uncertain`** — talet finns och får användas, men en regel som agerar på det ska veta
  att det är mjukt. Uppgraderas aldrig tyst.
- **`rejected`** — använd inte talet.

**Ingenting förkastas tyst.** En förkastad bildruta ligger kvar i serien med sina
koordinater; det är flaggan som ändrats. Varje flagga som inte är `usable` bär minst ett
skäl, och `SeriesQuality.counts` summerar skälen, så en sving som tappade 18 av 20
bildrutor säger *varför* i stället för att bara komma ut tom.

### De tre mätta felmönstren

#### 1. Omkastade ändar — 150–180° mellan angränsande bildrutor

`toe` och `heel` byter plats och bladvinkeln hoppar ett halvt varv. Punkterna är
**ordnade**, så det är en verklig omkastning av en riktad vektor, inte en wrap-artefakt —
därför viks `angleDifference` aldrig vid 90°. En vikning hade fått mönstret att läsas som
0–30° vanlig rotation.

Tröskeln är **90°** (samma som `FLIP_DEG` i `measure_blade_stability.py`), lägre än det
mätta bandet, så att en omkastning sedd snett — där den projicerade vändningen är kortare
än ett halvt varv — också fångas.

Två pass, för ett räcker inte:

- En bildruta som är oense med **båda** sina grannar är den som vände. `endpoint-flip`,
  förkastad. Det är mönstret data faktiskt visar: ett byte, och tillbaka.
- Ett ensamt hopp där andra änden inte själv är en isolerad vändning är ett byte som
  **varar**, eller ett byte vid seriens kant. Vinklarna säger inte vilken sida som är
  klubban, så **båda** ändarna märks `endpoint-flip-ambiguous` och nedgraderas — ingen
  gissning.

> **`// OSÄKER:` i koden.** Ett byte som varar över flera bildrutor fångas bara vid sina
> två kanter, aldrig i sitt inre — det inre är överens med sig självt. Begränsas av
> serienivåkvoten nedan, och av att inget bladhärlett mätvärde exponeras alls.

#### 2. Bladvinkeln är orolig genomgående — kvot ~6

På täta tidssteg rör sig bladvinkeln med **71–78 °/s** i median mot skaftets **12 °/s** —
kvot ungefär **6**. Båda vektorerna sitter på samma stela kropp och måste rotera i
jämförbar takt. En sådan kvot är inte klubban som roterar, det är modellen som gissar.

Det är en egenskap hos **hela serien**, inte hos någon enskild bildruta, så den prövas på
serienivå: `UNREST_RATIO_MAX = 3` — mitt emellan "samma kropp" (1) och det uppmätta, så en
ny modell måste vara genuint bättre snarare än bara mindre dålig. Slår den till skrivs
`blade-unrest` på **varje** bladflagga som fortfarande stod, i stället för att talen tyst
uteblir.

#### 3. Solpunkterna är inte säkra — 0,26 i median mot 0,99–1,00

`toe`/`heel`-konfidensen når **max 0,55** och ligger på **median 0,26**. `butt`/`hosel`
ligger på **0,99–1,00**.

**Därför separata trösklar.** En gemensam ribba på 0,5 släpper in varje skaftpunkt och
**ingen** solpunkt alls — noll täckning; en gemensam ribba på 0,1 släpper in varje
skaftpunkt inklusive de dåliga. **En gemensam tröskel gör inte mätningen strängare, den
gör den tom** (eller gör den till skräp). Mätt på ett helt klipp i 30 fps: 0,5 på
solpunkterna gav 0 % täckning, 0,1 gav 80 %.

| | golv (`rejected` under) | ribba (`usable` vid och över) |
|---|---|---|
| `butt` / `hosel` | 0,25 | **0,50** |
| `toe` / `heel` | **0,10** | 0,50 |

Att bladets ribba är samma tal som skaftets är poängen, inte en slarvighet: det är
konstaterandet att de två punktklasserna lever på olika skalor, uttryckt som konstant.
Under den levererande modellen landar praktiskt taget varje bladmätvärde på `uncertain`
i bästa fall.

### Övriga kontroller

`shaft-point-missing` / `blade-point-missing` · `degenerate-shaft` / `degenerate-blade`
(ändpunkterna närmare varandra än 1 % av bilddiagonalen — vinkeln är då brus förstärkt av
en division) · `angle-missing` (båda punkterna funna men producenten lämnade vinkeln null
— ett producentfel som ska höras) · `model-lacks-blade-keypoints` (tvåpunktsmodell; **inte**
samma sak som att bildrutan var dålig) · `frames-out-of-order` · `sparse-usable-frames` ·
`no-usable-frames`. Grannpar längre isär än **1,0 s** jämförs inte alls — en klubba hinner
vart som helst på en sekund.

---

## 3. De härledda mätvärdena — `derived.ts`

**Varje mätvärde bär sina förutsättningar som data**, i tabellen
`MEASUREMENT_ASSUMPTIONS`: vilken kameravinkel det gäller från, **om det är en projektion
snarare än en 3D-storhet**, vilka punkter och landmärken det lutar sig mot, om det behöver
handedness, vilka faser det kräver. En konsument kan läsa en tabell; en konsument kan inte
läsa en kommentar. Det är hela skälet till att förutsättningarna ligger i typen.

**Projektion är regeln, inte undantaget.** Alla fem är projektioner. En projicerad
skaftvinkel *är inte* skaftvinkeln — den är skaftvinkeln sedd från där telefonen råkade
stå, och den ändras när telefonen flyttas fast svingen inte gjorde det.

### Enhet: torsolängder

Kroppsrelativa värden uttrycks med origo i **mitthöften** och **en isotropisk skala:
torsolängden** (mittaxel → mitthöft). Axlarna är **bildens**, inte kroppens.

- *Varför inte axelbredd* — det självklara valet och fel här: `dtl` visar axlarna nästan
  på kant, så bredden kollapsar mot noll och normeringen exploderar på precis den vy de
  flesta mätvärdena är definierade från. Torsolängden överlever båda vyerna.
- *Varför inte rotera axlarna på axellinjen* — det hade vikt in kamerans roll i varje tal.

### Tabellen

| Mätvärde | Vad det är | Vy | Förutsätter |
|---|---|---|---|
| `shaft-angle-by-phase` | cirkulär median av riktad `butt → hosel`-vinkel per fas | båda | `butt`, `hosel` |
| `shaft-position-p2` | skaftets läge relativt kroppen vid P2, i torsolängder | **`dtl`** | `butt`, `hosel`, axlar + höfter, fas `backswing` |
| `shaft-position-p4` | samma vid toppen | **`dtl`** | d:o, fas `top` |
| `top-shaft-orientation` | across-the-line / on-plane / laid-off | **`dtl`** | d:o + **handedness** |
| `clubhead-path` | klubbhuvudets bana i bild, i torsolängder | båda | `hosel`, axlar + höfter |
| `swing-plane-tilt` | svingplanets lutning som projektion | båda | `hosel`, axlar + höfter |

**Medianen är en medoid**, aldrig ett aritmetiskt medelvärde: medelvärdet av 179° och
−179°, två vinklar 2° isär, är 0° — rakt åt andra hållet. En medoid kan inte producera ett
värde klubban aldrig hade, vilket också gör den rätt för ett litet urval som råkar
innehålla en vänd bildruta.

**P2 hittas som den `backswing`-bildruta vars skaftlinje ligger närmast bildens horisontal.**
Ryggsvingen korsar horisontalen exakt en gång, så minimum *är* korsningen; `top` utesluts
ur sökningen just för att skaftet passerar nära horisontellt även där. Det är ett
**projicerat P2**: "parallellt med marken" är ett 3D-villkor, och det som lokaliseras är
bildrutan där dess projektion är närmast uppfylld. Från `face-on` är samma ögonblick
förkortat — därför bara `dtl`.

**P4 är den sista bildruta fasmärkningen kallar `top`** — inte den första och inte den med
högst händer. Toppen är en vändning som fasmärkningen redan lokaliserat ur
svingenveloppen; att ta den sista lägger avläsningen så nära övergången som märkningen
tillåter utan att händelsen härleds om här.

**Klubbhuvudets bana spårar `hosel`, inte huvudet.** Solpunkterna *är* huvudets utsträckning
och de är just det mätvärde lagret inte litar på. Hoseln ligger på 0,99–1,00 och **flyttar
sig inte när bladet roterar** — samma skäl som specen valde den framför huvudets centrum.
Den är förskjuten från det verkliga klubbhuvudet med ungefär ett halvt huvud, en konstant
bias som en formjämförelse inte bryr sig om och en absolut position hade brytt sig om.

**Svingplanet är två linjeanpassningar** (ryggsving och nedsving var för sig), med
principalaxel i stället för minsta kvadrat — vanlig MK anpassar `y` som funktion av `x` och
sprängs på ett nästan lodrätt nedsvingsförlopp. Ett plan i rymden projiceras till en linje i
bilden **bara när kameran ligger i planet**. Det gör den aldrig exakt, så
`rmsResidualTorsoLengths` är inte en störterm: den är hur långt ifrån linjelik banan
faktiskt var. Ett stort residualvärde betyder att lutningen beskriver en kurva, inte ett plan.

### Vy som saknas och vy som är fel är två olika fel

- **`camera-angle-mismatch`** — klippet är `face-on` och mätvärdet gäller bara `dtl`:
  värdet vore fel → **förkastat, `value: null`**.
- **`camera-angle-unknown`** — ingen har fastställt vyn: värdet kan vara rätt →
  **beräknas, märks `uncertain`**.

Att slå ihop dem hade antingen kastat bort hälften av de användbara klippen eller skickat
kända felaktiga tal uppåt.

### Teckenkonventionen för across-the-line — verifierad mot **en** bildruta

`ACROSS_THE_LINE_SIGN` säger att för en **högerhänt spelare filmad `dtl`** är en skaftlinje
som lutar moturs på skärmen vid toppen *across-the-line*, och spegelvänt för vänsterhänt.
Fram till 2026-09-17 var det en **angiven** konvention, och mätvärdet hölls därför aldrig
högre än `uncertain`. Nu är tecknet **prövat**, och både `// OSÄKER:`-markeringen och
skälet `sign-convention-unverified` är borta — kategorin bär numera kameragrinden och
bildrutans egen flagga, inget mer.

**Referensen:** `049-88216ea7_s00_f05` (batch-03, `dtl`, högerhänt), en topp av baksvingen
som **Erik bedömt manuellt** som *lätt across the line* — skaftet pekar svagt höger om
mållinjen sett bakifrån. Körd genom produktionsvägen (`buildShaftSwingSeries` →
`checkShaftSeries` → `buildShaftMeasurements`) ligger greppet på (126,0, 194,8) och hoseln
på (155,5, 67,0) — klubbänden upp och till **höger** om greppet på skärmen,
`lineOrientationDeg` = **+77,0°**. Med tabellen som den står blir det `across-the-line`,
samma etikett som ögat gav. Tecknet står alltså kvar.

> **Bildrutans egna faser ljuger, ögat gör det inte.** Manifestet kallar bildrutan `impact`
> och CVAT-attributet `address`; klippet är `suspectMultiSwing` utan säker `impactSec`, så
> den automatiska fasmärkningen är inte att lita på här. Bilden visar en topp. Det är
> Eriks avläsning som använts, inte manifestets.
>
> **Vikterna.** `shaft-v3` (fyrapunkts) finns inte på maskinen — `training/runs/` är
> gitignorerat och tomt. Körningen gjordes på `public/models/shaft-v2.onnx`, och den
> ger `butt`/`hosel` **identiska med den manuella annoteringen** (126,03/194,82 resp.
> 155,47/67,02, konfidens 1,00 och 1,00). Skaftlinjen är alltså densamma vilken av de två
> källorna man väljer, och `toe`/`heel` används inte av det här mätvärdet över huvud taget
> — en fyrapunktsmodell kan inte ändra tecknet, bara punkternas precision.

**En bildruta är tunt underlag, och det är hela underlaget.** Den fastställer tecknet och
ingenting annat:

- Referensskaftet ligger **77° från horisontalen, 13° från vikningen vid ±90°** som
  `lineOrientationDeg` gör. En topp vars skaft passerar lodrätt byter tecken på mätvärdet
  utan varning — referensen ligger därmed i den svagaste änden av intervallet.
- **Ingen laid-off-bildruta är bedömd alls.** Den halvan av uppdelningen är spegelbilden av
  den verifierade halvan *per konstruktion*, inte per observation. Detsamma gäller
  vänsterhänt spel.
- **`ON_PLANE_BAND_DEG` rörs inte av det här.** Referensen landar på 77°, långt utanför
  bandet, och säger därför ingenting om var bandet hör hemma.

**Vad som skulle stärka den:** en manuellt bedömd across-the-line-topp vars skaft ligger
närmare horisontalen (bort från vikningen), en manuellt bedömd laid-off-topp, och en
vänsterhänt bildruta. Tills dess är `derived.test.ts` det som håller tecknet på plats:
referensens egna pixlar och deras spegelbild, så att en vänd tabell fäller testsviten.

Referensriktningen är **bildens horisontal**, eftersom det är vad mållinjen projiceras till
i en down-the-line-bild. Det förutsätter att telefonen står ungefär i våg och ungefär på
mållinjen. Båda är angivna, ingen är mätt — och referensbildrutans kamera står bakom
spelaren snett mot green, inte exakt på linjen.

---

## Bladvinkeln: mätt, buren, inte exponerad

`bladeAngleDeg` har en plats i rådatalagret med flit — att kasta mätvärdet hade gjort
beslutet **ofalsifierbart**, och en fyrapunktsmodell hade inte haft någonstans att landa.
Kontrollen fortsätter mäta den fullt ut: en kontroll som inte kan falla är ingen kontroll,
och den dag en fyrapunktscheckpoint kommer är kvoten och täckningen vad som säger om den är
bättre.

**Men inget härlett mätvärde bygger på den, och `MEASUREMENT_ASSUMPTIONS` nämner varken
`toe` eller `heel`** — beslutet är synligt i datamodellen, inte bara argumenterat här.

Tre oberoende fynd, alla mätta, vart och ett tillräckligt:

1. Konfidensen når max 0,55 och ligger på median 0,26 mot 0,99–1,00 för skaftpunkterna.
2. Vinkeln rör sig 71–78 °/s mot skaftets 12 °/s — kvot ~6 på två vektorer på samma stela
   kropp.
3. Ändarna kastas om mellan angränsande bildrutor med 150–180°.

Ett mätvärde som faller på alla tre är inte en svag signal att använda med försiktighet.
Det är brus med en enhet.

Underlag: [`training/measure_blade_stability.py`](../../training/measure_blade_stability.py)
(stabilitet per sving över alla tre batchar) och
[`training/trace_swing.py`](../../training/trace_swing.py) (varje bildruta i ett klipp, ~0,033 s
tidssteg). **Notera:** rapporterna de skriver (`training/blade-stability.md`,
`training/trace-*.png/.csv`) är genererade och ligger inte i repot; körningen med
fyrapunktsvikter återstår (de finns inte på maskinen).

---

## Vad som **inte** går att härleda ur två punkter i 2D

Den här listan är lika viktig som tabellen ovan. Ingen av posterna blockeras av en tröskel,
en bättre checkpoint eller mer träningsdata. De blockeras av **geometri**, och det enda som
ändrar dem är en annan sensor.

### Klubbladsvinkel (face angle) — öppen/stängd i grader

**Går inte.** Två punkter definierar en **linje**. En linje bär ingen **rullning kring sig
själv**. Bladvinkeln är exakt den rullningen: skaftet kan stå precis likadant i bild med
bladet öppet, kvadrerat eller stängt, och `butt`/`hosel` står still genom hela rotationen —
vilket är själva skälet till att specen valde hoseln som skaftreferens.

`heel → toe` är tillagt i schemat för att bära bladets rotation, och den vektorn är precis
den som mätningarna ovan underkänner. Även med en perfekt fyrapunktsmodell återstår ett
hårt problem: pekar huvudet rakt mot eller från kameran blir solan **en punkt i
projektion**, och två punkter ovanpå varandra är ingen vinkel.

**Det som skulle krävas:** en modell som bär bladets *plan* (fler punkter på huvudet, eller
en 3D-pose av klubban), eller två kameror.

### Klubbväg i grader in-to-out

**Går inte.** Klubbvägen är klubbhuvudets rörelseriktning **i horisontalplanet** vid
träffen, mätt mot mållinjen. Det är en vinkel i ett plan som ligger **in i bilden**.

En kamera projicerar bort djupet. I `dtl` är in-to-out-axeln nästan exakt kamerans
siktlinje — den axel som kollapsar till noll pixlar. I `face-on` är den vinkelrät mot
bilden på samma sätt. Ingen av vyerna bär den. Det som *kan* mätas är banans projektion
(`clubhead-path`), och den lever i bildplanet, inte i horisontalplanet.

**Det som skulle krävas:** djup — stereo, en kalibrerad markreferens plus en känd
klubblängd, eller en uppmätt kameraposition relativt mållinjen.

### Anfallsvinkel (angle of attack)

**Går inte.** Anfallsvinkeln är klubbhuvudets bana i **vertikalplanet längs mållinjen** vid
träffen, i grader upp eller ner. Två hinder, båda hårda:

1. **Djup igen.** Vinkeln mäts mot mållinjens riktning, som pekar in i bilden i `dtl`. En
   projicerad vertikalkomponent utan sin djupkomponent är inte samma vinkel.
2. **Tidsupplösningen.** Det är en tangent vid *ett ögonblick*. Analysbildrutorna är ~20 per
   sving, valda av `selectEnvelopeFrames`; ett nedsving passerar på ~0,25 s. Vid 30 fps och
   130 km/h rör sig huvudet flera decimeter mellan bildrutor. Även om geometrin funnes vore
   samplingen fel med en storleksordning.

**Det som skulle krävas:** djup **och** höghastighetsvideo (typiskt ≥240 fps). Det är en
hårdvarufråga, inte en modellfråga.

### Kort sagt

| Storhet | Blockerad av | Ändras av |
|---|---|---|
| Klubbladsvinkel | en linje bär ingen rullning kring sig själv | fler punkter på huvudet / 3D-pose av klubban |
| Klubbväg in-to-out | axeln ligger i djupled och projiceras bort | stereo eller kalibrerad djupreferens |
| Anfallsvinkel | djupled **och** tidsupplösning | djup + ≥240 fps |

Det som **går** står i tabellen i avsnitt 3 — och varje post där bär `projection: true`,
eftersom även den ärliga halvan är en projektion.
