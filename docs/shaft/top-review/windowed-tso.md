# Fönsterläsning av toppen — vad aggregering köper, och vad den betalar (S-40, diagnos)

> 2026-09-20, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering applicerad, inget skift infört, **ingen bredd vald**, ingen
> ändring i S-30:s spärr och ingen produktionskod skriven.** `src/lib/shaft/measure/`,
> `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG` och teckenkonventionen är orörda — de är
> **importerade och anropade** genom [windowed_outcomes.ts](windowed_outcomes.ts), aldrig
> återimplementerade. Samma skäl som i S-39: ett *utfall* är vad produktionskoden säger att det
> är, och en kopia av spärrarna hade mätt kopian.
>
> **FÖRUTSÄTTNING, lämnad i uppgiften och inte vald här: allt mäts VARMT** — på
> [run_pose_clip.py](run_pose_clip.py):s helklippsbanor, den konfiguration
> [e2-and-floor.md](e2-and-floor.md) §1 visade att produktionen kör. Den **kalla** körningen
> laddas för två ändamål, båda utskrivna: kontrollraden, och fråga 1:s kall/varm-störning, där
> den kalla spåraren är *störning* och inte facit.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md),
> [crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md),
> [envelope-audit.md](envelope-audit.md), [e2-and-floor.md](e2-and-floor.md),
> [hard-core.md](hard-core.md) och [verdict-sensitivity.md](verdict-sensitivity.md) lästes först,
> så risken här är inte mätfel — den är anpassning. Därför: **ingen parameter svept, ingen
> justerad, ingenting valt.** Bredderna 3/5/7 är uppgiftens egna; **bredd 1 är kontrollen** och
> måste reproducera S-39 rad för rad. E4 är [subframe.py](subframe.py):s egen bracket plus
> interpolation, oförändrad. Intervallen är bedömarnas egna.
>
> Skript: [windowed_tso.py](windowed_tso.py) (skriver bara till stdout) och
> [windowed_outcomes.ts](windowed_outcomes.ts) (stdin → stdout). `verdict_outcomes.ts` och
> `verdict_sensitivity.py` är **orörda** — S-39 kör vidare på exakt den bryggan; den här omgången
> har en egen. Underlaget är S-32:s runda — **103 svingar i 81 oberoende klipp, 6 548
> envelope-bildrutor** — med produktionens skaftdetektor (`shaft-v2.onnx`) körd på varenda en av
> de 6 548 bildrutorna, och n står som rader *och* klipp.

## Kort svar

**1. Ja, fönstret stabiliserar utfallet — monotont med bredden, för varje störning.**
`top-shaft-orientation` byter utfall mellan **kall och varm spårare** på 9 → 7 → 2 → 2 av 100
(bredd 1/3/5/7), mellan **E3 och E4** på 13 → 10 → 5 → 2 av 101, och mellan **spannets första och
sista ruta** på 12 → 10 → 10 → 5 av 91 — bland de rader där mätvärdet svarar 18,2 % → 14,3 % →
12,7 % → **6,1 %**. Vid bredd 7 ligger alla tre störningarna på 2–5 rader. **Men mekanismen är
till största delen fönsteröverlapp, inte omröstning:** vid bredd 7 läser spannets två ändar
*samma bildruta* på **46 av 91** rader mot 3 av 91 vid bredd 1. Medianen röstade bort en riktad
avvikare på **0 / 0 / 6 / 9** av 101 fönster.

**2. Och kostnaden är entydig och enkelriktad: fönstret byter bort utfall som var rätt.** Mot
S-39:s egen referens — enrutsavläsningen vid en topp satt mitt i människornas spann — faller E4:s
överensstämmelse från **65 av 91 (bredd 1)** till 60 / 59 / **55**. Bokförd rad för rad:
fönstret **tappar 6 / 7 / 11** rader som var rätt och **rättar 1** på varje bredd — netto
**−5 / −6 / −10**. Fönstret flyttar dessutom referensen själv: vid människornas egen mittruta ger
bredd 7 ett *annat* utfall än enrutan på **35 av 91 (38 %)**. **Stabiliteten är alltså till stor
del att de två avläsningarna konvergerar mot samma ruta, inte mot rätt ruta.**

**3. Fönstret finns inte i produktionens rutnät, och uppgiftens "~20 rutor" är inaktuell.**
`ANALYSIS_FRAME_COUNT` är **32** sedan 2026-08-11 (höjd 10 → 20 → 32). De 32 blir median **27
picks** och **26 distinkta bildrutor**. Klustret ligger på **nedslaget** — klippvägen skickar inga
`clusterPhases` — så toppen får bara den uniforma baslinjen: steget mellan de två valda rutor som
omsluter E4 är median **3 bildrutor** (p90 6, max 16). **Rutnätet rymmer hela fönstret på 2 av 101
svingar vid bredd 3 och på 0 av 101 vid bredd 5 och 7.** Att detektera fönstret kostar median
**2 / 3 / 4** nya bildrutor per sving (p90 2 / 4 / 6), alltså 6 / 9 / 12 % av budgeten — och
budgeten är inte fri. **Och en djupare gräns: produktionen lokaliserar envelopen och varje fas på
en 15 fps-bana** (`SAMPLE_FPS` i `poseTrajectory.ts`), så ett fönster centrerat på en enskild
30 fps-bildruta är finare än den upplösning produktionen hittar något i.

**4. De två tysta mätvärdena är inte stabilare — de ligger på samma tal som
`top-shaft-orientation` på den enda axel de delar.** På svar/tystnad byter alla tre på 2 av 100
(kall/varm), 5 av 91 (spannet) och 6 av 101 (E3 mot E4, där `top`-hinken har **en** rad till)
vid bredd 1, och 0–1 vid bredd 7. **Hela
`top-shaft-orientation`:s överskott av instabilitet ligger i kategorin** (9 / 13 / 12 mot 2 / 6 /
5), och kategorin är det en regel skulle läsa. **Att koppla dem kräver fyra saker, och den
bindande är inte händighet:** inget i `src/` anropar mätlagret alls; appens egen väg sätter
aldrig `phaseSource: 'observed'` (utskrivet i `fromDetection.ts`), så S-30:s spärr tystar dem på
varje sving; `shaft-position-p4` kräver dessutom en kameravinkel appen sällan har; och båda
returnerar tal **utan band** — en regel måste uppfinna en tröskel som ingen omgång har mätt.

**Och den läsning som binder ihop 1 och 2:** fönstret gör mätvärdet **mer självkonsekvent och
mindre förankrat**. Raderna som byter är inte heller samma rader mellan bredderna — av spannets
12 bytare vid bredd 1 är bara **2** kvar bland de 5 vid bredd 7; **3 av de 5 är rader fönstret
själv har brutit**. Det som återstår vid bredd 7 är fortfarande
`NEAR_VERTICAL_GATE_DEG`:s kant: 4 av 5 går mellan `cannot-determine` och `laid-off`.

---

## 0. Reproduktion — kontrollraden och bredd 1

Posebanorna kördes om från början i ett nytt venv: `run_pose.py` och `run_pose_clip.py`
oförändrade, samma `public/models/pose_landmarker_lite.task`, **`mediapipe` 1.0.1,
`opencv-python` 5.0.0, `numpy` 2.4.6** — samma versioner S-33 till S-39 körde.
`run_dense.py` (S-28) kördes oförändrad över samma 6 548 bildrutor.

Kontrollraden skriptet skriver före allt annat, **på den kalla körningen**:

| | E1 inne | E2 inne | E3 inne (median) | E4 RND inne |
|---|---:|---:|---:|---:|
| mot Erik pass 1 (n=93) | 9 | 36 | 23 (−1) | 33 |
| mot Lisa (n=95) | 10 | 42 | 27 (−1) | 40 |
| mot spannet (n=91) | 10 | 45 | 30 (−1) | 42 |

**Identisk med [resultat.md](resultat.md) §3, [subframe.md](subframe.md) §3,
[hard-core.md](hard-core.md) §0 och [verdict-sensitivity.md](verdict-sensitivity.md) §0.** Den
**varma** baslinjen reproduceras också oförändrad: **E4 44, E2 40, E3 27, E1 6 av 91**
([hard-core.md](hard-core.md) §1). 103 svingar har en kall posebana, 101 ett E3-val, 91 ett
mänskligt spann; 103 har en detektorbana *och* en varm kroppsreferens.

### Den andra kontrollen: bredd 1 måste vara S-39

Ett fönster på en ruta **är** enrutsavläsningen, så bredd 1 måste reproducera S-39 värde för
värde. Den gör det:

| | S-39 | här (bredd 1) |
|---|---|---|
| `top-shaft-orientation`, kall mot varm E4 | 9 av 100 | **9 av 100** |
| `top-shaft-orientation`, E3 mot E4 | 13 av 101 | **13 av 101** |
| `top-shaft-orientation`, Erik första mot sista | 11 av 93 (11 av 67 svarande) | **11 av 93 (11 av 67)** |
| `top-shaft-orientation`, Lisa | 11 av 95 (11 av 68) | **11 av 95 (11 av 68)** |
| `top-shaft-orientation`, spannet | 12 av 91 (12 av 66) | **12 av 91 (12 av 66)** |
| `shaft-position-p4`, Erik / Lisa / spannet | 3 / 6 / 5 | **3 / 6 / 5** |
| `top`-hinken, Erik / Lisa / spannet | 4 / 6 / 5 | **4 / 6 / 5** |
| fördelningen på E4:s ruta, `top-shaft-orientation` | `laid-off` 38, `cannot-determine` 21, tyst 18+10, `across` 14 | **identisk** |
| E4 mot mitten av spannet | 65 av 91 / 79 av 91 / 79 av 91 | **65 / 79 / 79** |

Skriptet stannar dessutom om posebanans envelope-rutor inte är registrets `frameTimes`, om
detektorbanans rutor inte är samma, om `windowed_outcomes.ts` inte längre bygger mot
`src/lib/shaft/measure/`, eller om medoiden och `shaftAngleByPhase`:s egen `top`-hink inte pekar
på samma vinkel.

`score_round.py`, `subframe.py`, `crossing_selection.py`, `envelope_audit.py`, `e2_and_floor.py`,
`hard_core.py` och **`verdict_sensitivity.py`** importeras och återanvänds — utfallsdefinitionen
(`verdict`) är S-39:s egen funktion, anropad, inte omskriven.

### Vad "median över fönstret" betyder här, exakt

Det är inte en ny aritmetik, och det är värt att stanna vid varför.

- **`shaftAngleByPhase` aggregerar redan.** Dess `top`-hink tar `circularMedianDeg` (`angles.ts`)
  över **varje tillåten, observerad `top`-ruta**. Märker man ett fönster av rutor som
  `top`/`observed` räknar alltså **produktionen själv** fram fönstrets median.
- **`circularMedianDeg` är en medoid** — dess svar är en av indatavinklarna. Fönstrets median
  **pekar därför ut en bildruta**, och den rutan lämnas tillbaka till produktionen som den enda
  observerade toppen. `top-shaft-orientation` och `shaft-position-p4` svarar på den genom sin
  egen, oförändrade väg: närlodrätt-spärren, on-plane-bandet, kameragrinden, händighetskravet
  och S-30:s `top-phase-not-observed` körs precis som de ligger.
- **Varför medoid och inte "medianen av avvikelsetalen".** `lineOrientationDeg` viks vid ±90°, så
  en rak median av två skaft på −89° och +89° — två grader isär i verkligheten — blir 0°, alltså
  vågrätt. Medoiden kan per konstruktion inte producera ett värde klubban aldrig hade. Det är
  samma argument `circularMedianDeg`:s egen docstring gör, och skälet att produktionen redan
  använder den.
- **Fönstret kapas mot envelopens kant.** En bildruta som inte finns kan inte detekteras.
  Kapning inträffar på 0 / 0 / 2 av 101 rader vid bredd 3 / 5 / 7.
- **När fönstret inte har någon tillåten ruta** finns ingen medianruta; avläsningen faller då på
  **mittrutan**, som också ligger i fönstret och alltså inte heller är tillåten — produktionen får
  svara med sin egen tystnad och sitt eget skäl i stället för att skriptet uppfinner ett.

> **Två val som är antaganden och inte mätningar, båda övertagna oförändrade från S-39 så att
> talen är jämförbara.**
>
> **(a) Händighet.** `handedness` står `unknown` på alla 103 svingar ([STATUS.md](../STATUS.md)
> §4), och `topShaftOrientation` avvisar en sving utan händighet innan den tittar på en bildruta.
> Körningen skickar `right` för att det ska finnas ett utfall att flytta. **Två svingar är
> bekräftat spegelvända** (`S32-075`, `S32-017`, båda `093.mp4`) och är fel under det; de är
> namngivna snarare än borttagna.
>
> **(b) Kameravinkel.** Serien får registrets `viewBucket`. **Produktionen har den inte** — i
> appen är `cameraAngle` ofta `null`, och då blir `cameraGate` `uncertain` i stället för
> `rejected`. De **10 face-on-rader** som här är tysta med `camera-angle-mismatch` skulle i appen
> i stället ge ett flaggat `shaft-position-p4`. Talen nedan står alltså på en *strängare*
> kameragrind än produktionens.

---

## 1. Byter utfallet mer sällan när det läses över ett fönster?

**Populationen:** varje sving med ett varmt E4-val och en detektorbana — **101 rader i 79 klipp**.
Störningarna är S-39:s egna, och ingen av dem är ett bildrutefel: de är golvet
[e2-and-floor.md](e2-and-floor.md) §4 och [verdict-sensitivity.md](verdict-sensitivity.md) §1
mätte.

### `top-shaft-orientation` — kategorin

| störning | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---:|---:|---:|---:|
| **E4 kall mot varm spårare** | **9 / 100 (9,0 %)** | 7 / 100 (7,0 %) | 2 / 100 (2,0 %) | **2 / 100 (2,0 %)** |
| **E3 mot E4** | **13 / 101 (12,9 %)** | 10 / 101 (9,9 %) | 5 / 101 (5,0 %) | **2 / 101 (2,0 %)** |
| Erik, första mot sista ruta | 11 / 93 | 10 / 93 | 9 / 93 | 5 / 93 |
| — bland de svarande | **11 / 67 (16,4 %)** | 10 / 72 (13,9 %) | 9 / 79 (11,4 %) | **5 / 83 (6,0 %)** |
| Lisa, första mot sista ruta | 11 / 95 | 6 / 95 | 8 / 95 | 4 / 95 |
| — bland de svarande | **11 / 68 (16,2 %)** | 6 / 71 (8,5 %) | 8 / 82 (9,8 %) | **4 / 86 (4,7 %)** |
| **spannet (unionen), första mot sista** | 12 / 91 | 10 / 91 | 10 / 91 | 5 / 91 |
| — bland de svarande | **12 / 66 (18,2 %)** | 10 / 70 (14,3 %) | 10 / 79 (12,7 %) | **5 / 82 (6,1 %)** |

**Tre saker måste stå bredvid de talen.**

1. **Nämnaren växer.** "Bland de svarande" går från 66 till 82 rader, därför att ett bredare
   fönster hittar en användbar bildruta oftare. En del av procentfallet är alltså att fler rader
   svarar, inte att färre byter. **Täljaren faller också** (12 → 5), så effekten finns — men den
   är mindre än procenttalen ensamma antyder.
2. **Lisa är inte monoton** (11 → 6 → 8 → 4). Med n = 95 och ensiffriga täljare är skillnaden
   mellan 6 och 8 inte ett fynd.
3. **Kall mot varm planar ut vid 2.** Bredd 5 och bredd 7 ger samma två rader (`S32-031`,
   `S32-099`). Golvet försvinner inte, det krymper.

### De två tysta mätvärdena

| störning | mätvärde | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---|---:|---:|---:|---:|
| E4 kall mot varm | `shaft-position-p4` | 2 / 100 | 1 / 100 | 0 / 100 | 0 / 100 |
| | `top`-hinken | 2 / 100 | 1 / 100 | 0 / 100 | 0 / 100 |
| E3 mot E4 | `shaft-position-p4` | 6 / 101 | 3 / 101 | 1 / 101 | 0 / 101 |
| | `top`-hinken | 7 / 101 | 3 / 101 | 1 / 101 | 0 / 101 |
| spannet | `shaft-position-p4` | 5 / 91 | 2 / 91 | 4 / 91 | 1 / 91 |
| | `top`-hinken | 5 / 91 | 2 / 91 | 4 / 91 | 1 / 91 |

För dem kan bytet per konstruktion bara vara **svar ↔ tystnad** — ingen regel i `src/` läser
deras tal, så det finns inget pass/fail att byta. Se §4.

### Mekanismen: det är överlapp, inte omröstning

Ett fönster kan bara minska bytena på två sätt: de två störda valen får **samma medianruta**,
eller en avvikande ruta **röstas bort**. Det första är mätbart rakt av.

| störning | samma ruta, bredd 1 | bredd 3 | bredd 5 | bredd 7 | fönstrens överlapp (median rutor, bredd 1/3/5/7) |
|---|---:|---:|---:|---:|---|
| E4 kall mot varm | 73 / 100 | 76 / 100 | 81 / 100 | 77 / 100 | 1 / 3 / 5 / 7 |
| E3 mot E4 | 45 / 101 | 57 / 101 | 63 / 101 | 66 / 101 | 0 / 2 / 4 / 6 |
| Erik första mot sista | 24 / 93 | 39 / 93 | 47 / 93 | 57 / 93 | 0 / 2 / 4 / 6 |
| Lisa första mot sista | 14 / 95 | 37 / 95 | 45 / 95 | 54 / 95 | 0 / 2 / 4 / 6 |
| **spannet, första mot sista** | **3 / 91** | 24 / 91 | 35 / 91 | **46 / 91** | 0 / 2 / 4 / 6 |

**Läst rakt:** vid median 2 rutors intervallbredd delar ett sjurutersfönster runt första och sista
rutan **6 av 7 bildrutor**, och då hamnar medoiden på samma ruta i hälften av fallen. Det är inte
en robust skattning av toppen — det är två fönster som är nästan samma fönster.

Och medianen hade sällan något att rösta om:

| bredd | fönster med ≥ 1 riktad avvikare (> 90°) | avvikare totalt | spridning i fönstret, median | p90 |
|---:|---:|---:|---:|---:|
| 1 | 0 av 101 | 0 | 0,00° | 0,00° |
| 3 | **0 av 101** | 0 | 2,24° | 24,26° |
| 5 | 6 av 101 | 6 | 6,15° | 72,49° |
| 7 | **9 av 101** | 14 | 10,59° | **88,72°** |

`circularMedianDeg` arbetar i den **riktade** vinkelrymden (`butt → hosel`), där ett ombytt
punktpar syns som ~180° — precis den avvikare dess docstring säger att den finns för. **Vid bredd
3 finns ingen sådan alls**, så hela stabilitetsvinsten där är överlapp. Vid bredd 7 filtreras 14
rutor på 9 rader — men samma bredd har p90-spridning **88,7°**, alltså fönster där skaftet
svänger ett kvarts varv. **Ett brett fönster är inte en platå.**

### Raderna byts också ut, inte bara bort

| störning | bredd 1 | bredd 7 | av bredd 7:s rader fanns i bredd 1 |
|---|---|---|---|
| E4 kall mot varm | `S32-003, -010, -011, -031, -042, -079, -084, -099, -101` | `S32-031, -099` | 2 av 2 |
| E3 mot E4 | `S32-010, -011, -020, -026, -043, -068, -071, -079, -084, -086, -087, -090, -101` | `S32-054, -086` | 1 av 2 |
| **spannet** | `S32-011, -018, -027, -031, -034, -040, -045, -060, -066, -082, -084, -100` | `S32-029, -031, -040, -050, -081` | **2 av 5** |

För spannet: bredd 7 **tar bort 10** av bredd 1:s bytare och **lägger till 3 nya**. Nettot är
12 → 5, men det är inte en delmängd — fönstret bryter rader som var stabila.

De fem som återstår vid bredd 7:

| id | klipp | på spannets första ruta | på dess sista | rutorna fönstret valde |
|---|---|---|---|---|
| `S32-029` | 095.mp4 | `laid-off` | `cannot-determine` | 31 mot 37 |
| `S32-031` | 062.mp4 | `cannot-determine` | `laid-off` | 64 mot 70 |
| `S32-040` | 053.mp4 | `cannot-determine` | `laid-off` | 13 mot 18 |
| `S32-050` | 014.mp4 | `laid-off` | `cannot-determine` | 21 mot 29 |
| `S32-081` | 034.mp4 | inget värde (`phase-missing`) | `laid-off` | 22 mot 27 |

**Fyra av fem korsar `NEAR_VERTICAL_GATE_DEG`** — samma gräns [STATUS.md](../STATUS.md) §2
beskriver som "gränsens skärpa, inte dess läge". Och notera rutorna: på de här raderna hamnade de
två medianerna **5–8 bildrutor isär**, alltså *längre* isär än de två mittrutorna de utgick från.
Fönstret drog dem åt var sitt håll.

### Kontrollaggregatorn: majoritetsröst i stället för median

Inte en kandidat. Den står här för att visa om svaret hänger på vilken aggregator som valdes.
Varje fönsterrutas egen produktionsutfall röstar; oavgjort redovisas, aldrig brutet av en regel.

| störning (`top-shaft-orientation`) | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---:|---:|---:|---:|
| E4 kall mot varm | 9 / 100 | 8 / 100 | 7 / 100 | 3 / 100 |
| E3 mot E4 | 13 / 101 | 10 / 101 | 7 / 101 | 4 / 101 |
| spannet, första mot sista | 12 / 91 | 7 / 91 | 6 / 91 | 5 / 91 |

Oavgjorda röster på E4:s eget fönster: 0 / 5 / 8 / 2.

**Riktningen håller under båda aggregatorerna, och ingen av dem vinner överallt.** Vid bredd 7 är
rösten sämre på de två estimatorstörningarna (kall/varm 9 → 3 mot medianens 9 → 2; E3/E4 13 → 4
mot 13 → 2), men **bättre än medianen i mitten på spannet** (7 och 6 mot 10 och 10) och lika vid
bredd 7 (5). **Slutsatsen i §1 hänger alltså inte på valet av aggregator.**

Två saker att läsa försiktigt. Medianen konvergerar mot samma ruta (tabellen ovan); rösten har
ingen motsvarande mekanism, så dess tal är inte samma sorts tal. Och rösten kan svara
`oavgjort` — på E4:s egna fönster gör den det på 0 / 5 / 8 / 2 rader — och två `oavgjort` i båda
ändarna räknas som "inget byte". **Vilken del av röstens siffror det står för är inte mätt.**

---

## 2. Vad aggregeringen kostar

**Referensen är S-39:s egen och den flyttar sig inte med bredden:** enrutsavläsningen vid en topp
satt **mitt i människornas spann** (`SPAN_mid`, unionens mitt, halv-upp avrundad). n = **91 rader i
73 klipp**.

> **Vad "rätt" kan betyda här, och vad det inte kan.** Det finns **ingen bedömd
> across/laid-off-etikett per sving** i det här datasetet. Bedömarna ritade toppens *bildruta*,
> inte dess kategori. Det enda som finns är [across-sign-result.md](../across-sign-result.md):s
> **sex** handkallade rader — och de duger inte som facit här: de ligger på det glesa
> exportrutnätet, de är kallade på en *annan* bildruta än E4:s val, och fem av elva kandidater
> stoppades av ögat självt som "för nära lodrätt". **"Rätt" nedan betyder därför exakt: vad
> enrutsavläsningen vid människornas mittruta säger.** Det är S-39:s referens, oförändrad, och
> inget mer.

### (a) Fönstret flyttar referensen själv

Fönstret vid `SPAN_mid` mot enrutan på samma ställe:

| mätvärde | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---:|---:|---:|---:|
| `top-shaft-orientation` | 0 / 91 | 9 / 91 (10 %) | 20 / 91 (22 %) | **35 / 91 (38 %)** |
| `shaft-position-p4` | 0 / 91 | 7 / 91 | 14 / 91 | 21 / 91 (23 %) |
| `shaft-angle-by-phase` → `top` | 0 / 91 | 7 / 91 | 14 / 91 | 21 / 91 (23 %) |

**Sätt en människas egen mittruta som topp och läs över sju rutor: på 38 % av raderna säger
mätvärdet något annat än det sade på den rutan.** Det är inte brus som jämnas ut — det är en
annan avläsning.

### (b) E4 mot referensen

| mätvärde | referens | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---|---:|---:|---:|---:|
| `top-shaft-orientation` | **enrutan vid `SPAN_mid`** | **65 / 91** | 60 / 91 | 59 / 91 | **55 / 91** |
| | *samma bredd vid `SPAN_mid`* | *65 / 91* | *67 / 91* | *68 / 91* | *82 / 91* |
| `shaft-position-p4` | **enrutan vid `SPAN_mid`** | **79 / 91** | 74 / 91 | 73 / 91 | **71 / 91** |
| | *samma bredd vid `SPAN_mid`* | *79 / 91* | *81 / 91* | *85 / 91* | *90 / 91* |
| `top`-hinken | **enrutan vid `SPAN_mid`** | **79 / 91** | 74 / 91 | 73 / 91 | **71 / 91** |
| | *samma bredd vid `SPAN_mid`* | *79 / 91* | *81 / 91* | *85 / 91* | *90 / 91* |

**De kursiva raderna är cirkulära och står här bara för att inte utelämnas.** När båda sidorna
läses över samma bredd delar de 6 av 7 bildrutor på en typisk rad, så 82 av 91 mäter
fönsteröverlapp och inte träffsäkerhet. **Den raden som svarar på frågan är den feta:** mot en
fast referens *faller* överensstämmelsen med bredden, på alla tre mätvärdena.

### (c) Bokföringen, rad för rad

Bland de rader där **enrutsavläsningen på E4 redan gav referensens utfall** — hur många tappar
fönstret, och hur många rättar det?

| mätvärde | bredd | n | rätt vid bredd 1 | tappade | rättade | netto |
|---|---:|---:|---:|---:|---:|---:|
| `top-shaft-orientation` | 3 | 91 | 65 | 6 | 1 | **−5** |
| | 5 | 91 | 65 | 7 | 1 | **−6** |
| | 7 | 91 | 65 | **11** | 1 | **−10** |
| `shaft-position-p4` | 3 | 91 | 79 | 6 | 1 | −5 |
| | 5 | 91 | 79 | 7 | 1 | −6 |
| | 7 | 91 | 79 | 9 | 1 | −8 |
| `top`-hinken | 3 | 91 | 79 | 6 | 1 | −5 |
| | 5 | 91 | 79 | 7 | 1 | −6 |
| | 7 | 91 | 79 | 9 | 1 | −8 |

**Kvoten är 6:1, 7:1 och 11:1 mot fönstret.** På varje bredd rättar det exakt **en** rad.

Raderna som byts bort, `top-shaft-orientation`:

| bredd | rader |
|---:|---|
| 3 | `S32-050`, `S32-068`, `S32-078`, `S32-087`, `S32-097`, `S32-103` |
| 5 | de sex ovan **+ `S32-037`** |
| 7 | de sju ovan **+ `S32-024`, `S32-025`, `S32-054`, `S32-071`** |

**Mängden är nästlad** — varje bredd tappar allt den smalare tappade och lite till. Det är ett
rent, enkelriktat pris, inte en slumpmässig omsättning. (Jämför §1, där bytarmängden *inte* är
nästlad; de två sakerna mäter olika ting och beter sig olika.)

`shaft-position-p4` och `top`-hinken tappar samma rader utom `S32-071` och `S32-024` vid bredd 7 —
för dem kan förlusten bara vara att en tyst rad börjat svara på något annat, eller tvärtom.

---

## 3. Vad fönstret motsvarar i produktionens rutnät

Rutnätet är inte beskrivet här, det är **kört**: `selectEnvelopeFrames()` med
`ANALYSIS_FRAME_COUNT`, båda **importerade** från `src/`, på varje svings egen envelope ur
registret. Allt räknas i **bildrutor** — en vald tidpunkt hamnar på den avkodade bildruta som
ligger närmast (`grabFramesAtTimes`), så två val inne i samma bildruta *är* samma ruta. Det tar
bort varje tolerans ur räkningen. n = **101 svingar**.

> **En rättelse till uppgiftens premiss.** `ANALYSIS_FRAME_COUNT` är **32**, inte ~20. Den höjdes
> 10 → 20 (2026-08-06) och 20 → 32 (2026-08-11, efter att poseklippningen gjorde en bildruta
> billigare). Alla tal nedan står på 32.
>
> **Och en till.** Klippvägen skickar **inga** `clusterPhases` — `frameExtractor.ts` och
> `shaftPreview.ts` anropar `selectEnvelopeFrames` bart — så förvalet gäller: **klustret läggs på
> nedslaget**, inte på toppen. Toppen får bara den uniforma baslinjen.

### Vad produktionen faktiskt väljer

| | |
|---|---|
| picks efter selektorns egen dedupe | median **27** (min 25, max 32) av budgeten 32 |
| **distinkta bildrutor** de landar på | median **26** (min 22, max 32) |
| kluster på nedslaget tillämpat | 83 av 101 svingar |
| steg mellan två valda grannrutor, hela rutnätet | median **2** bildrutor (p10 1, p90 4) |
| **steget där toppen ligger** (de två valda rutor som omsluter E4) | median **3** bildrutor (p10 2, p90 6, max 16), n = 62 |
| E4:s egen ruta är en av produktionens valda | **39 av 101** |
| valda rutor inne i människornas spann | median **1** (noll på 15 av 91 rader) |

Medianen på 2 för hela rutnätet är klustret. Räknat ur de importerade konstanterna:
`IMPACT_CLUSTER_BUDGET_FRAC = 0,4` ger **13 klustrade picks** med `IMPACT_CLUSTER_SPACING_SEC =
0,033` (en videobildruta) runt nedslaget, och **19 uniforma** över hela envelopen. **Toppen ligger
bland de 19.** Vid toppen är rutnätet alltså tre gånger glesare än videon, medan det vid nedslaget
är lika tätt.

### Rymmer rutnätet fönstret?

| bredd | sekunder | valda rutor i fönstret | rader med ≥ 2 | **rader med alla w** |
|---:|---:|---|---:|---:|
| 1 | 0,000 | median 0 | 0 av 101 | 39 av 101 |
| 3 | 0,067 | median 1 | 27 av 101 | **2 av 101** |
| 5 | 0,133 | median 2 | 73 av 101 | **0 av 101** |
| 7 | 0,200 | median 3 | 89 av 101 | **0 av 101** |

**Ett treruters fönster finns i dag på 2 av 101 svingar. Ett fem- eller sjuruters finns på noll.**
Frågan "vad motsvarar fönstret i produktionens rutnät" har alltså ett kort svar: **ingenting.**

### Vilka rutor som faktiskt skulle behöva detekteras

Exakt räkning: de bildrutor i fönstret som **inte redan** är en av produktionens valda rutor.

| bredd | nya rutor per sving | p90 | som andel av budgeten 32 | totalt över 101 svingar |
|---:|---:|---:|---:|---:|
| 1 | median 1 | 1 | 3 % | 62 |
| 3 | median **2** | 2 | 6 % | 183 |
| 5 | median **3** | 4 | 9 % | 298 |
| 7 | median **4** | 6 | 12 % | 409 |

**Bredd 1 kostar redan något.** På 62 av 101 svingar ligger inte ens E4:s egen ruta i rutnätet —
den enruta som S-39 mätte på finns inte där heller.

**Och budgeten är inte fri.** `fittable()` i `poseEnvelopeSelection.ts` kapar redan de begärda
picksen mot vad envelopen rymmer vid `DEDUPE_SEC`, och flera picks landar på samma bildruta
(median 27 picks → 26 distinkta rutor). Extrarutorna måste därför antingen tas **utöver** budgeten
— vilket är en ny kostnad i avkodning och detektion — eller **ätas ur** den uniforma baslinjen,
vilket tar täckning från resten av svingen. **Ingen av de två vägarna är gratis, och den här
omgången väljer ingen av dem.**

### Den gräns som ligger under bildrutebudgeten

Produktionens envelope, dess `impactSec` och varje fasetikett härleds ur en posebana som körs vid
**15 fps** (`SAMPLE_FPS` i `poseTrajectory.ts`), och `PHASE_LABEL_TOL_SEC` golvas på just den
`sampleDt`. **Ett fönster centrerat på en enskild 30 fps-bildruta är alltså finare än den
upplösning produktionen hittar toppen i över huvud taget.** Att lägga till bildrutor runt en
punkt som själv är lokaliserad på ett dubbelt så grovt rutnät flyttar inte den gränsen.

### Och kostnaden som inte är bildrutor

| identifierare | var den anropas i `src/`, utanför `src/lib/shaft/measure/` |
|---|---|
| `buildShaftMeasurements` | **ingenstans** |
| `buildShaftSwingSeries` | **ingenstans** |
| `checkShaftSeries` | **ingenstans** |
| `detectShaft` | `shaft/shaftDetector.ts` (definitionen), `shaft/shaftPreview.ts` (**dev-only**, `VITE_DEV_PREVIEW`) |

**Mätlagret körs inte i produktion i dag.** Skaftdetektorn körs bara i dev-förhandsvisningen, och
de tre mätvärdena beräknas ingenstans utanför sin egen mapp och sina egna tester. Kostnaden för
ett fönster är därför inte bara extra bildrutor — den ligger ovanpå en kedja som ännu inte finns.

---

## 4. De två tysta mätvärdena

### (a) Vad som läser dem i dag: ingenting

| identifierare | träffar i `src/` utanför `src/lib/shaft/measure/` |
|---|---|
| `shaftPositionAtP4` | **inga** |
| `topShaftOrientation` | **inga** |
| `shaftAngleByPhase` | **inga** |
| `MeasurementId` | **inga** |
| `buildShaftMeasurements` | **inga** |

Det gäller alltså alla tre, inte bara de två tysta. `top-shaft-orientation` har en *kategori* i
koden; ingen läser den heller.

### (b) Vad som skulle krävas för att koppla dem — fyra saker, i ordning

Läst ur koden, inte antaget.

1. **En konsument måste finnas.** `buildShaftMeasurements` anropas inte. Det är inte en spärr att
   lyfta, det är kod som inte är skriven.

2. **En OBSERVERAD topp. Det här är den bindande.** `fromDetection.ts` skriver det själv i en
   docstring: *"The app's own path derives every phase, so it passes `envelope-impact` or
   `envelope-fallback` — never `observed`."* S-30:s `top-phase-not-observed` tystar därför både
   `shaft-position-p4` och `top`-hinken på **varje** sving i appen — precis som
   [phase-trust.md](../phase-trust.md) mätte: 109 av 205 svarar i datasetet bara därför att en
   människa annoterat delar av det, och **i appen är alla 205 tysta**. Den här omgången kringgår
   spärren genom att sätta etiketten i experimentet, och det står i uppställningen — inte som ett
   fynd.

3. **För `shaft-position-p4` dessutom en kameravinkel och en kroppsreferens.**
   `MEASUREMENT_ASSUMPTIONS` säger `cameraAngle: 'dtl'` och fyra landmärken (axlar + höfter). I
   rundan är 10 rader tysta på `camera-angle-mismatch`; i appen är `cameraAngle` ofta `null`, och
   då blir grinden `uncertain` i stället för `rejected` — alltså ett **flaggat tal** där rundan
   har tystnad. Det gör spärren mildare i appen, inte hårdare.
   **Händighet är däremot inte en spärr för de två tysta** — bara för `top-shaft-orientation`,
   som avvisar `unknown` på alla 103 svingar.

4. **Ett band. Det finns inget.** `shaft-position-p4` returnerar en kroppsrelativ position i
   *torso-längder* plus en `orientationDeg`; `top`-hinken returnerar en cirkulär median i grader.
   Ingen av dem har en kalibrerad gräns någonstans i repot, och ingen omgång har mätt en.
   `top-shaft-orientation` har ett band (`ON_PLANE_BAND_DEG`) och en spärr
   (`NEAR_VERTICAL_GATE_DEG`) — och §1 visar att båda kanterna ligger inne i mätbruset. **Att ge
   de två tysta ett band är alltså inte en mindre uppgift än den som redan är olöst för det
   tredje.**

### (c) Är deras svar/tystnad-utfall stabilare än `top-shaft-orientation`:s?

**Nej — de är identiska.** Kollapsat till svar mot tystnad, det enda utfall alla tre har:

| störning | mätvärde | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---|---:|---:|---:|---:|
| E4 kall mot varm | `top-shaft-orientation` (svar/tyst) | 2 / 100 | 1 / 100 | 0 / 100 | 0 / 100 |
| | `shaft-position-p4` | 2 / 100 | 1 / 100 | 0 / 100 | 0 / 100 |
| | `top`-hinken | 2 / 100 | 1 / 100 | 0 / 100 | 0 / 100 |
| | **`top-shaft-orientation` (KATEGORI)** | **9 / 100** | **7 / 100** | **2 / 100** | **2 / 100** |
| E3 mot E4 | `top-shaft-orientation` (svar/tyst) | 6 / 101 | 3 / 101 | 1 / 101 | 0 / 101 |
| | `shaft-position-p4` | 6 / 101 | 3 / 101 | 1 / 101 | 0 / 101 |
| | `top`-hinken | 7 / 101 | 3 / 101 | 1 / 101 | 0 / 101 |
| | **`top-shaft-orientation` (KATEGORI)** | **13 / 101** | **10 / 101** | **5 / 101** | **2 / 101** |
| spannet, första mot sista | `top-shaft-orientation` (svar/tyst) | 5 / 91 | 2 / 91 | 4 / 91 | 1 / 91 |
| | `shaft-position-p4` | 5 / 91 | 2 / 91 | 4 / 91 | 1 / 91 |
| | `top`-hinken | 5 / 91 | 2 / 91 | 4 / 91 | 1 / 91 |
| | **`top-shaft-orientation` (KATEGORI)** | **12 / 91** | **10 / 91** | **10 / 91** | **5 / 91** |

(Erik och Lisa var för sig ger samma bild: 3 / 3 / 2 / 0 respektive 6 / 1 / 3 / 1 på svar/tystnad,
mot kategorins 11 / 10 / 9 / 5 och 11 / 6 / 8 / 4.)

**Läsningen är entydig.** De tre mätvärdena tystnar och börjar svara på i praktiken **samma
rader** — de ärver samma bildrutas `shaftAngle`-flagga, precis som S-39 noterade. (Den enda
avvikelsen i hela tabellen är `top`-hinkens **7 mot 6** vid E3 mot E4, bredd 1. Hinkens
svarsmängd är inte riktigt de andras: den är `cameraAngle: 'any'` och går inte genom
`topFrame()`, så den svarar på de 10 face-on-raderna men tiger på 21 rader med
`shaft-point-missing` — 78 svarande mot 73. En rads skillnad i bytena är inte ett fynd, men
mängderna är inte identiska och ska inte skrivas som om de vore.) Skillnaden är att
`top-shaft-orientation` dessutom kan byta *kategori*, och **hela dess överskott av instabilitet
ligger där**: 9 mot 2, 13 mot 6, 12 mot 5. **De två tysta mätvärdena är inte robustare — de har
mindre att säga.** Den dag ett band sätts på deras tal blir de lika känsliga som det tredje, av
samma skäl: en tröskel genom ett brusband korsas av en bildruta.

### (d) Vad fönstret gör med deras täckning

| mätvärde | bredd 1 | bredd 3 | bredd 5 | bredd 7 |
|---|---:|---:|---:|---:|
| `shaft-position-p4` svarar | 73 / 101 | 83 | 84 | **86** |
| `top`-hinken svarar | 78 / 101 | 89 | 90 | **92** |
| `top-shaft-orientation` svarar | 73 / 101 | 83 | 84 | **86** |

Tystnadsskälen faller i takt: `phase-missing` 18 → 8 → 7 → 5, och `shaft-point-missing` för
`top`-hinken 21 → 11 → 10 → 8. De 10 `camera-angle-mismatch` rör sig inte — de är
kameragrinden, inte bildrutan.

**Det här är fönstrets enda oomstridda vinst:** ett bredare fönster hittar en användbar
skaftdetektion oftare, så mätvärdet svarar oftare. **Men §2 mäter vad det svarar**, och där är
kvoten 11 tappade mot 1 rättad. **Mer täckning av något som är mindre förankrat är inte
självklart en förbättring, och den avvägningen görs inte här.**

---

## Vad som inte mättes

- **Ingen bredd är vald, ingen tröskel satt, ingen estimator föreslagen.** 3/5/7 är uppgiftens
  egna, och 1 är kontrollen.
- **Bara udda bredder.** En median över ett jämnt antal är tvetydig, och `circularMedianDeg`
  bryter oavgjort på sin egen kostnadsfunktion — det hade blivit en konstruktion utan mening här.
  Bredder över 7 är inte mätta.
- **Inget facit för kategorin finns.** Referensen i §2 är enrutsavläsningen vid människornas
  mittruta, inte en bedömd `across`/`laid-off`-etikett. En sådan omgång är inte körd.
- **Fönstrets mittpunkt kommer fortfarande från en estimator.** Ett fönster runt fel topp är
  fortfarande fel; det enda som mäter det är §2, och bara mot den referensen.
- **Face-on är tyst rakt igenom** (10 rader, `camera-angle-mismatch`). Uppdelningen face-on mot
  dtl går inte att göra på utfallen.
- **Händighet är antagen `right`** på alla rader. `S32-075` och `S32-017` är bekräftat
  spegelvända och fel under antagandet.
- **Produktionens rutnät är återspelat**, inte observerat: envelopen och `impactSec` kommer ur
  registret, och `topSec` matas in från E4 **enbart** för att `labelPhase` ska ha ett värde. Den
  kan per konstruktion inte flytta en picks tidpunkt, bara vad den heter — men den är ändå ett
  estimatorvärde i en produktionsfunktion, och det står här.
- **Ingen har öppnat en bildruta.** Varje namngiven rad i den här rapporten är namngiven ur tal.
- **Kvar oprövat även varmt**, oförändrat från S-38: 15 fps mot 30, delegat, avkodare. Och den
  livevägen som strömmar kameran är fortfarande inte mätt alls.

---

## Kör om

Underlaget är gitignorerat och byggs om från klippen. `mediapipe` 1.0.1, `opencv-python` 5.0.0,
`numpy` 2.4.6 i ett venv; `training/.venv` för detektorn; `npm install` för esbuild.

```sh
# 1. manifesten ur exportzip:arna
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. envelopebanorna (den KALLA korningen) -- kontrollraden, ~15 min
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. helklippsbanorna (den VARMA) -- huvudunderlaget, ~30 min for 81 klipp
<venv>/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py <tmp>/clippose

# 4. skaftdetektorn pa varje envelope-bildruta, 6 548 rutor
training/.venv/Scripts/python.exe docs/shaft/top-from-dense-signal/run_dense.py <tmp>/dense \
    --manifests <tmp>/export_manifests.json

# 5. den har matningen (--section: f1 | f2 | f3 | f4 | all)
<venv>/Scripts/python.exe docs/shaft/top-review/windowed_tso.py <tmp>/pose \
    --clipPoseDir <tmp>/clippose --denseDir <tmp>/dense --work <tmp>/work --section all
```

`windowed_tso.py` skriver bara till stdout; `--work` används för TS-bryggan och dess indata.
**Läs kontrollraden och bredd 1 först:** stämmer de inte med [resultat.md](resultat.md),
[subframe.md](subframe.md), [hard-core.md](hard-core.md) och
[verdict-sensitivity.md](verdict-sensitivity.md) har underlaget drivit och inget här gäller.
Skriptet stannar också om detektorbanan inte är registrets egna `frameTimes`, om
`windowed_outcomes.ts` inte längre bygger mot `src/lib/shaft/measure/`, om per-rute-kvaliteten
visar sig bero på fasetiketten, eller om medoiden och `shaftAngleByPhase`:s egen `top`-hink pekar
på olika vinklar.
