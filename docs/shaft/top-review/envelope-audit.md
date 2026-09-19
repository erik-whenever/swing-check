# Envelopesegmenteringen — såg människorna och estimatorn samma rutor? (S-36, diagnos)

> 2026-09-19, `stream-shaft`. **Read-only diagnos — ingen produktionskod ändrad, ingen tröskel
> satt, ingen kalibrering applicerad, ingen ändring i S-30:s spärr och ingen ändring i
> envelopelogiken.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`
> och teckenkonventionen är orörda. `src/lib/poseEnvelope.ts` och `src/lib/poseSegments.ts` är
> **lästa** i fråga 5 — för att kunna namnge den regel som avslutar ett fönster — och varken
> ändrade, reimplementerade eller poängsatta.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md),
> [crossing-selection.md](crossing-selection.md) och [multiswing.md](multiswing.md) lästes
> först, så risken här är inte mätfel — den är anpassning. Därför: **ingen parameter svept,
> ingen justerad, ingenting valt.** Varje band som används för att döpa en grupp är antingen en
> konstant lyft ur produktionen (`SETTLE_SPEED_FRAC`, `ADDRESS_SPEED_FRAC`, `MIN_ADDRESS_SEC`,
> `MAX_ENVELOPE_SEC`) eller en storhet tagen ur **klippets egna registrerade svingar**. De två
> band som är mina — posegolvet 50 % och kvoten 1,0 mot klippets svagaste registrerade
> nedsving — står utskrivna på varje rad de påverkar, och känsligheten redovisas.
>
> Skript: [envelope_audit.py](envelope_audit.py) (skriver bara till stdout). Underlaget är
> S-32:s runda — **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor** — plus en
> helklippskörning av samma posemodell över alla 81 klipp. **Klippet är den oberoende enheten**
> och n står som rader *och* klipp.

## Kort svar

**1. Ja — bedömarvyn och estimatorn fick exakt samma bildrutor, ruta för ruta, på alla 103
svingar.** Antalet rutor, första rutan och sista rutan är identiska på 103 av 103, och den
största tidsskillnaden på någon ruta i någon sving är **0,000e+00 s** mot ett rutsteg på
0,0333 s. Samma 6 548 rutor i registret, samma 6 548 JPEG på disk, samma 6 548 i posebanan.
**E3-mätningen är alltså inte jämförd mot fel underlag.** Vad som *inte* är samma är
bildpunkterna: bedömaren fick JPEG kvalitet 92 med långsidan kapad vid 1280 px (75 av 103
nedskalade), estimatorn den råa avkodade rutan. Det är en skillnad i bildkvalitet, inte i
ögonblick, och den är inte mätt.

**2. De 16 klippen är inte 16 missade svingar.** Klassade per klipp på den prominentaste
vändningen utanför varje envelope: **7 missad sving** (varav 1 marginell), **4 finishtopp
utanför envelopen** — alltså inte en missad sving alls utan finishen, som står högre än toppen
och råkar ligga strax utanför fönstret — **2 kapad kant på själva toppen** (`001.mp4`,
`011.mp4`), **2 rörelse efter/utanför svingen** (varav 1 marginell) och **1 ej avgörbar** (pose
på 7 % av ±0,5 s). Delningen mellan *kapad topp* och *finishtopp* är den som gör skillnad:
utan den hade `kapad kant` tyst svalt exakt det fel som sänkte E1.

**3. B:s slutsats håller — den är inte en artefakt.** Av E4:s 49 utanför-rader ligger 10 (25 %)
i ett av de 16 klippen mot 19 % bland alla 91 rader med spann, och av de **22 utan någon
växling alls** ligger bara **3 (18 %)** där — den lägsta andelen i tabellen. **Noll rader ligger
i ett klipp där fönstren skiljer sig, eftersom inga fönster skiljer sig.**

**4. `001.mp4`: envelopen slutar 1,03 s innan toppen, och den kapar själva toppen.** Handhöjden
stiger monotont från 4,1 s till klippets högsta vändning vid **9,37 s**; envelopen slutar vid
**8,33 s**, mitt i uppgången, utan att banan någonsin gått tillbaka till adresshöjd däremellan.
Manifestet bär redan `clippedTail: true` och `suspectMultiSwing: true`. n = 1, ingen slutsats.

**5. Fönstret slutar inte mitt i rörelsen — det slutar för att rörelsen är långsam.** Farten vid
envelopens sista ruta är median **0,055 × klippets toppfart** i hela rundan och 0,046 i de 16:
finishregelns villkor (under 0,20) är uppfyllt i princip överallt, och fördelningarna överlappar.
**Det enda som skiljer är riktningen:** banan **stiger fortfarande** vid envelopens sista ruta på
**48 % av de 16:s envelopes mot 26 % i de övriga**, och på **80 % (4 av 5) av de 16:s
slow-mo-svingar**. `001.mp4`:s envelopeslut ligger inne i en **1,90 s lång tyst ö** — i slow-mo
är "stillhet" och "toppen av en långsam sving" samma avläsning.

**6. Instabiliteten mellan två körningar är av samma storlek som E3:s uppmätta fel, och det ska
stå i klartext.** En störning som inte borde betyda något — varm i stället för kall spårare,
samma modell, samma bildrutor — flyttar E3:s ruta på **36 av 102 svingar** (lika på 66, inom 1
ruta på 88, max 19) och rubriksiffran från **30 av 91 till 27 av 91**. Nettot −3 döljer
omsättningen: **7 rader går från inne till utanför och 4 från utanför till inne, 23 rader byter
avstånd.** **E3:s hela uppmätta fel mot människorna är |median| 1 bildruta — och 1 bildruta är
precis vad en meningslös störning flyttar.** Det sätter ett golv under varenda tidigare siffra:
**allt som vilar på ≤ 3 rader av 91 eller på ≤ 1 bildruta är inte skilt från körningsbrus.**

---

## 0. Reproduktion — och kontrollraden

Posebanorna kördes om från början med `run_pose.py`, oförändrad, mot samma
`public/models/pose_landmarker_lite.task`, **`mediapipe` 1.0.1, `opencv-python` 5.0.0,
`numpy` 2.4.6** — samma versioner S-34 och S-35 körde. Helklippsbanorna med
[run_pose_clip.py](run_pose_clip.py), också oförändrad. Kontrollraden skriptet skriver före
allt annat:

| | E3 inne | E3 median | E4 RND inne |
|---|---:|---:|---:|
| mot Erik pass 1 (n=93) | 23 | −1 | 33 |
| mot Lisa (n=95) | 27 | −1 | 40 |
| mot spannet (n=91) | 30 | −1 | 42 |

**Identisk med [resultat.md](resultat.md), [subframe.md](subframe.md),
[crossing-selection.md](crossing-selection.md) och [multiswing.md](multiswing.md).** 103 svingar
har en posebana, 101 ett E3-val, 91 ett mänskligt spann. Skriptet kontrollerar dessutom per
sving att posebanans envelope-rutor är registrets `frameTimes`, att `crossings()[0]` är
`e3_signflip`:s svar, och — nytt här — **att urvalet i fråga 2 reproducerar S-35 del D:s 16
klipp namn för namn**; stämmer något av det inte stannar det i stället för att mäta vidare.

`score_round.py`, `subframe.py`, `crossing_selection.py` och `multiswing.py` återanvänds;
ingenting är återimplementerat.

---

## 1. Såg människorna och estimatorn samma bildrutor?

**Frågan är inte trivial, och det är därför den ställdes.** De två vägarna söker till olika
punkt i filen:

| | söker till | behåller | vad estimatorn räknar på |
|---|---|---|---|
| **bedömarvyn** (`build_round.extract`) | envelopens **start** | `[start, finish]` | — |
| **estimatorn** (`run_pose.py`) | **start − 0,6 s** | `[start−0,6, finish+0,6]` | `inEnv = [start, finish]` |

En `cap.set(CAP_PROP_POS_MSEC, …)` landar på en nyckelruta och avkodar framåt därifrån, så två
olika sökpunkter *kan* ge två olika rutnät. Båda avkodningarna kördes därför om, ruta för ruta,
per sving. **Ingen posemodell behövs:** MediaPipe kan inte ändra vilka rutor avkodaren lämnar ut.

### Resultatet, alla 103 svingar

| | |
|---|---:|
| svingar där **antalet** rutor skiljer | **0** |
| svingar där **första** rutan skiljer | **0** |
| svingar där **sista** rutan skiljer | **0** |
| svingar med någon ruta > 1 ms isär | **0** |
| största tidsskillnad på någon ruta i någon sving | **0,000e+00 s** (rutsteg 0,0333 s) |

Och mot de två tredjeparter som också ska vara samma rutor:

| | antal skiljer | största tidsavvikelse |
|---|---:|---|
| registret (det bedömarvyn byggdes av) | 0 svingar | 3,333e−05 s |
| posebanans `inEnv`-rutor (det estimatorn fick) | 0 svingar | 0,000e+00 s |

De 3,3 × 10⁻⁵ s är `round(t, 4)` i `build_round.py`, inte en ruta.

**Summa bildrutor: vy 6 548, estimator 6 548, register 6 548, JPEG på disk 6 548, posebana
6 548.** Antalet JPEG-filer på disk är antalet avkodade rutor på **103 av 103** svingar.

**Svaret är alltså: samma fönster, samma rutor, samma ordning, på varenda sving.** Hela
E3-mätningen är jämförd mot rätt underlag, och den här förklaringen till avståndet är utesluten.

### Vad som däremot INTE är samma

- **Bildpunkterna.** Bedömaren fick JPEG kvalitet 92 med långsidan kapad vid 1280 px —
  **75 av 103 svingar är nedskalade**, 28 ligger i klippets egen upplösning men är ändå
  JPEG-omkodade. Estimatorn fick den råa avkodade rutan utan omkodning. **Det är en skillnad i
  bildkvalitet, inte i vilket ögonblick som visades, och den är inte mätt här.**
- **Sparningens historia.** Estimatorn avkodar median **36** marginalrutor (min 15, max 36)
  utanför envelopen som bedömaren aldrig såg. Ingen estimator läser dem — E1/E2/E3 kör på
  `inEnv` — men spåraren har sett dem. Vad det gör mäts i avsnitt 6, från andra hållet.

---

## 2. De 16 klippen med en vändning utanför varje envelope

Urvalet är **S-35 del D:s eget**, oförändrat: en vändning räknas när dess topografiska prominens
når den **minsta** prominens någon av klippets egna registrerade toppar har. Skriptet stannar om
det inte reproducerar del D:s 16 klipp namn för namn — det gör det. **41 vändningar i 16 klipp.**

### Klassningsregeln, skriven före raderna lästes

1. Vändningen och en envelopekant ligger i **samma utflykt** över envelopens adresshöjd — banan
   går aldrig tillbaka till adress mellan dem. Rent geometriskt, ingen nivå vald av mig. **Två
   fall, och de måste skiljas åt:**
   - **`kapad kant (toppen)`** om banan inte heller går ned till adress mellan envelopens
     **egen** registrerade vändning och den här — allt är en utflykt, och fönstret kapade
     själva toppen.
   - **`finishtopp utanför envelopen`** om den gör det — då är vändningen en **senare** utflykt
     i samma sving, och den senare utflykten i en golfsving är **finishen**. [resultat.md](resultat.md)
     §3 mätte att finishen står **högre** än toppen; utan den delningen hade `kapad kant` tyst
     svalt E1:s gamla misstag.
2. Annars är vändningen en egen utflykt, och frågan är om den har en **svings form**: är
   nedgången efter den minst lika snabb som nedgången efter klippets **egna svagaste**
   registrerade topp? Ja → `missad sving`. Nej → `rörelse efter/utanför svingen`.
3. `ej avgörbar` när posen är för gles för att mäta en form, eller när klippets egen referens är
   degenererad.

**Amplitud är med flit inte det som skiljer** — det var precis amplitud som sänkte E1. Nedgången
mäts från vändningen till dess egen högra prominensminimum, alltså parameterfritt och lokalt,
och läses **bara som en kvot mot klippets egna registrerade svingar**, så ingen hastighet av mig
går in i klassningen.

### Klipp för klipp

`kvot` = nedgången efter vändningen delat med nedgången efter klippets svagaste registrerade
topp. `sm` = slow-mo.

| klipp | sm | kand | ref | största vändning | prominens | avstånd till kant | kvot | pose | **klass** |
|---|:-:|---:|---:|---:|---:|---|---:|---:|---|
| **001.mp4** | ja | 23 | **0,0017** | 9,37 s | 0,1313 | 1,03 s efter `S32-074` slut | 9,23 | 100 % | **kapad kant (toppen)** |
| 008.mp4 | – | 1 | 0,0987 | 2,90 s | 0,1356 | 0,29 s efter `S32-030` slut | 0,53 | 100 % | finishtopp utanför |
| **011.mp4** | – | 1 | 0,1596 | 3,37 s | 0,2251 | **0,15 s** efter `S32-002` slut | 0,55 | 100 % | **kapad kant (toppen)** |
| 012.mp4 | – | 1 | 0,1852 | 16,50 s | 0,1918 | 8,97 s efter `S32-033` slut | 0,58 | **55 %** | rörelse efter/utanför |
| 033.mp4 | – | 1 | 0,1203 | 3,97 s | 0,1225 | 4,18 s före `S32-053` start | 1,58 | 100 % | **missad sving** |
| 039.mp4 | – | 1 | 0,2971 | 16,70 s | 0,3087 | 14,90 s efter `S32-095` slut | **1,01** | 100 % | **missad sving** *(marginell)* |
| 045.mp4 | ja | 3 | 0,1366 | 15,20 s | 0,1778 | 5,13 s efter `S32-014` slut | 8,24 | 100 % | **missad sving** |
| 054.mp4 | – | 1 | 0,2492 | 10,90 s | 0,2659 | 5,51 s efter `S32-084` slut | **0,92** | 100 % | rörelse efter/utanför *(marginell)* |
| 056.mp4 | – | 1 | 0,1542 | 8,33 s | 0,2632 | 1,55 s efter `S32-010` slut | 0,55 | **7 %** | ej avgörbar |
| 057.mp4 | – | 1 | 0,2944 | 17,57 s | 0,2985 | 15,03 s efter `S32-013` slut | 1,31 | 100 % | **missad sving** |
| 059.mp4 | – | 2 | 0,1382 | 2,03 s | 0,2301 | 7,70 s före `S32-052` start | 3,25 | 100 % | **missad sving** |
| 064.mp4 | – | 1 | 0,1590 | 1,73 s | 0,1600 | 1,53 s före `S32-038` start | 1,69 | 100 % | **missad sving** |
| 072.mp4 | – | 1 | 0,0223 | 5,97 s | 0,0285 | 0,57 s efter `S32-001` slut | 0,58 | 100 % | finishtopp utanför |
| 073.mp4 | ja | 1 | 0,1532 | 3,87 s | 0,1650 | **0,07 s** efter `S32-054` slut | 1,51 | 100 % | finishtopp utanför |
| 082.mp4 | – | 1 | 0,1625 | 4,53 s | 0,1757 | 0,38 s före `S32-089` start | 3,76 | 100 % | **missad sving** |
| 089.mp4 | ja | 1 | 0,0934 | 8,97 s | 0,1170 | **0,02 s** efter `S32-024` slut | 0,68 | 100 % | finishtopp utanför |

### Sammanräknat

| per klipp (n = 16) | | per vändning (n = 41) | |
|---|---:|---|---:|
| **missad sving** | **7** | missad sving | 9 |
| finishtopp utanför envelopen | 4 | finishtopp utanför envelopen | 5 |
| **kapad kant (toppen)** | **2** | kapad kant (toppen) | 2 |
| rörelse efter/utanför svingen | 2 | rörelse efter/utanför svingen | 2 |
| ej avgörbar | 1 | ej avgörbar | **23** |

**De 23 "ej avgörbar" per vändning ligger i två klipp**: 22 av dem i `001.mp4`, vars referens är
**0,0017 mot rundans median 0,1699 registrerad prominens** — en tusendel. Med en sådan referens
släpper urvalet igenom varje mikrovåg i banan, precis som del D redan skrev. **De 22 är en
egenskap hos referensen, inte 22 missade svingar.** (Bandet "referens < 0,1 × rundans median" är
mitt; `001.mp4` är det enda klipp det fångar, och nästa lägsta referens är `072.mp4`:s 0,0223.)

**Svaret på delfrågan "samma sving kapad i kanten, eller en annan sving i klippet?":**

- **samma sving, kapad i kanten:** 2 klipp (`001`, `011`) där toppen själv ligger utanför, och
  4 klipp (`008`, `072`, `073`, `089`) där **finishen** ligger utanför. I `089` ligger vändningen
  **0,02 s** efter envelopens slut och i `073` **0,07 s** — det är en till två bildrutor.
- **en annan sving i klippet:** 7 klipp, där vändningen är en egen utflykt med en nedgång
  1,0–8,2 gånger klippets svagaste registrerade. **Tre av dem** (`033`, `059`, `064`) ligger
  **före** den första envelopen och en (`082`) mellan två; resten efter den sista.
- **rörelse efter finishen / annat:** 2 klipp, och **båda är svaga** — `012` har pose på bara
  55 % och `054` ligger på kvot 0,92, alltså inne i marginalbandet.

### Känslighet — bandet 1,0 är mitt

| band | vändningar som skulle heta `missad sving` (av de 41 som når dit) |
|---|---:|
| 0,50 | 40 |
| 0,75 | 34 |
| **1,00** (den här rapporten) | **32** |
| 1,25 | 31 |
| 1,50 | 29 |

Fördelningen av kvoten: median 2,90, p10 0,58, p90 7,81, min 0,45, max 9,23 (n = 41).
**Två rader ligger inom 0,8–1,25 och vänder med bandet: `039.mp4` (1,01) och `054.mp4` (0,92).**
De är utmärkta som marginella på varje rad de står på. Ingenting annat flyttar sig mellan 0,75
och 1,25.

### Slow-mo, utbrutet

| | n klipp | slow-mo | andel |
|---|---:|---:|---:|
| de 16 med en vändning utanför | 16 | **4** | **25 %** |
| rundan i stort (klipp med helklippsbana) | 81 | 13 | 16 % |
| de 65 utan en sådan vändning | 65 | 9 | 14 % |

**25 % mot 16 % är 4 klipp mot 13 — det bär ingenting.** Klassningen inom grupperna:

| | n | klasser |
|---|---:|---|
| slow-mo | 4 | finishtopp 2, kapad kant (toppen) 1, missad sving 1 |
| normal takt | 12 | missad sving 6, finishtopp 2, rörelse 2, kapad kant (toppen) 1, ej avgörbar 1 |

**Slow-mo lutar åt kantfallen** (3 av 4 är kapad topp eller finishtopp) och normal takt åt
missade svingar (6 av 12). **n = 4 klipp. Det är en observation, inte ett mönster.**

---

## 3. Ligger nedströmsfelen i de felplacerade klippen?

Grupperna är [crossing-selection.md](crossing-selection.md) §2:s och [multiswing.md](multiswing.md)
B:s, oförändrade. Ingen rad struken, ingen siffra omräknad.

| grupp | rader | klipp | **i de 16** | i ett `missad sving`-klipp | i ett `kapad topp`-klipp | i ett `finishtopp`-klipp | **fel fönster** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **E4 utanför spannet** | 49 | 40 | **10 (25 %)** | 4 | 0 | 3 | **0** |
| — därav ingen armad kandidat | 23 | 18 | 4 (22 %) | 2 | 0 | 2 | **0** |
| — därav **ingen växling alls inne** | 22 | 17 | **3 (18 %)** | 1 | 0 | 2 | **0** |
| E4 inne i spannet | 42 | 36 | 7 (19 %) | 3 | 1 | 3 | **0** |
| *alla med spann* | *91* | *73* | *14 (19 %)* | *6* | *1* | *4* | ***0*** |

**Kolumnen `fel fönster` är noll överallt därför att fråga 1 kom ut tom** — det finns inget klipp
där bedömarvyn och estimatorn fick olika rutor.

**B:s slutsats håller.** De 22 rader där handledssignalen inte har någon teckenväxling alls inne
i människornas intervall har den **lägsta** andelen felplacerade klipp i hela tabellen — 3 av 22
(18 %) mot 19 % bland alla rader med spann. Av de tre är **två `finishtopp`-klipp** (`008`,
`072`), alltså klipp där det som ligger utanför är finishen och inte en missad sving, och **ett**
är `039.mp4`, den marginella raden. **Ingen av de 22 ligger i ett klipp där toppen själv är
kapad.**

De 10 utanför-rader som ligger i ett av de 16 klippen, rad för rad:

| id | klipp | E4 | teckenväxlingskandidater i envelopen | klippets klass |
|---|---|---:|---:|---|
| S32-001 | 072.mp4 | −2 | 1 | finishtopp utanför |
| S32-009 | 082.mp4 | −1 | 2 | missad sving |
| S32-010 | 056.mp4 | −1 | 2 | ej avgörbar |
| **S32-013** | 057.mp4 | **−26** | 3 | missad sving |
| S32-030 | 008.mp4 | −1 | 1 | finishtopp utanför |
| S32-033 | 012.mp4 | −1 | 2 | rörelse efter/utanför |
| S32-038 | 064.mp4 | +1 | 1 | missad sving |
| S32-084 | 054.mp4 | −2 | 3 | rörelse efter/utanför |
| S32-095 | 039.mp4 | −1 | 1 | missad sving |
| S32-099 | 054.mp4 | −2 | 3 | rörelse efter/utanför |
| S32-103 | 089.mp4 | −1 | 2 | finishtopp utanför |

**Åtta av elva ligger på 1–2 rutor.** Den enda stora raden är `S32-013` (−26), och `057.mp4`:s
missade sving ligger vid **17,57 s**, alltså 15 s efter envelopen — den kan inte förklara ett fel
inne i en envelope som slutar vid 2,53 s. **Felplacerade envelopes förklarar alltså inte E4:s
svans.**

---

## 4. `001.mp4` — beskrivning, n = 1, ingen slutsats

Klippet: **32,8 s, 30 fps, 986 avkodade rutor, 1 registrerad sving.** **Pose saknas på 0 av
986 rutor.**

`S32-074`: envelope **4,067–8,333 s**, 13 % av klippet, 129 envelope-rutor.

**Manifestets egna flaggor** — produktionens, aldrig visade för någon bedömare:
`clippedTail = true`, `suspectMultiSwing = true`, `hasConfidentImpact = false`,
`gate = dataset-relaxed`, `slowmo = true`.

**Exportrutorna och deras fas:** `f00 @ 4,067 s address`, `f01 @ 5,030 backswing`,
`f02 @ 6,131 **top**`, `f03 @ 6,406 downswing`, `f04 @ 6,957 downswing`, `f05 @ 7,094 impact`,
`f06 @ 7,507 through`. **Båda bedömarna satte osäker. E3 gav inget val.**

**Handhöjden över hela klippet** (h = −y för handledsmittpunkten, upp = större):

| | h, min..max | |
|---|---|---|
| 0–4 s | −0,383 … −0,372 | still, händerna nere |
| **4–8 s** | **−0,371 … −0,260** | **envelopen — monoton uppgång hela vägen** |
| 8–10 s | −0,259 … −0,252 | **klippets högsta läge; vändningen ligger vid 9,37 s** |
| 10–12 s | −0,378 … −0,256 | nedgången |
| 13–16 s | −0,305 … −0,274 | en andra, lägre utflykt, vändning vid 14,93 s |
| 17–32 s | −0,390 … −0,336 | långsamt sjunkande, små rörelser |

**Klippets vändningar, störst prominens först:** 9,37 s (0,1313), 14,93 s (0,1039),
31,27 s (0,0218), 17,73 s (0,0132) — **ingen av dem ligger inne i envelopen.** Den prominentaste
vändningen *inne* i envelopen har prominens **0,0017**.

**Var envelopen slutar, mätt:**

| | |
|---|---|
| slutar vid | t **8,333 s** (ruta 250 av 986) |
| farten där | 0,015 = **0,064 × klippets toppfart** (finishregeln kräver under 0,20) |
| farten där mot refSpeed (p95) | **0,131** (segmenteraren kallar under 0,15 för QUIET) |
| tyst ö runt envelopeslutet | **1,90 s** (segmenteraren bryter en burst vid 0,3 s) |
| handhöjd där | −0,255; adresshöjd (envelopens första ruta) −0,371 |
| **stiger banan fortfarande där?** | **ja** |

**Beskrivningen, utan slutsats:** en slow-mo-inspelning där händerna lyfts under fyra sekunder,
når sitt högsta läge en sekund efter att fönstret tagit slut, och där fönstrets slutpunkt ligger
mitt i en nästan två sekunder lång sträcka som mäts som stillhet. Klassningen i avsnitt 2 kallar
den **kapad kant (toppen)**: det finns ingen återvändning till adresshöjd mellan envelopens slut
och vändningen vid 9,37 s, så det är samma utflykt.

Om påståendet att mer än halva klippet ligger efter finishen: **envelopen täcker 13 % av
klippet, och klippets sista stora vändning ligger vid 14,93 s — alltså ligger 54 % av klippet
(17,9 s av 32,8) efter den.** Vad som händer där är inte identifierat. **Ingen har öppnat en enda
bildruta ur `001.mp4`.** n = 1 klipp.

---

## 5. Vad avslutar fönstret?

**Regeln är läst, inte reimplementerad, och den har två steg.**

`src/lib/poseSegments.ts` (ADR-003) delar **först** sessionen i burstar: `refSpeed` = p95 av
farten, allt under `ADDRESS_SPEED_FRAC` (**0,15**) × refSpeed är QUIET, och en tyst ö på minst
`MIN_ADDRESS_SEC` (**0,3 s**) **bryter** bursten. `detectSwingEnvelope` ser sedan bara det som
ligger inne i en burst. `src/lib/poseEnvelope.ts` lägger **sedan** envelopens slut på
`finish onset` — första rutan i första följden av `FINISH_MIN_HOLD_FRAMES` (**3**) rutor med fart
under `SETTLE_SPEED_FRAC` (**0,20**) × toppfarten, räknat framåt från `downswing pass`. Hittas
ingen sådan följd sätts `clippedTail = true`.

> **Varning som inte korrigeras bort:** talen nedan är mätta på 30 fps-banan i det här repot, inte
> på produktionens 15 fps-bana, och utjämningen är samma antal sampel men inte samma tid. Bara
> **kvoter mot klippets egen toppfart respektive p95** läses.

### Envelopens sista ruta, mätt

| grupp | n (rader/klipp) | fart / toppfart | fart / p95 | tyst ö | **banan stiger där** | slutet över adress | envelopelängd |
|---|---|---:|---:|---:|---:|---:|---:|
| alla envelopes | 103 / 81 | 0,055 (p90 0,123) | 0,126 | 0,10 s | **32 %** | 89 % | 1,60 s |
| **i de 16 klippen** | 27 / 16 | 0,046 (p90 0,113) | 0,129 | 0,10 s | **48 %** | 81 % | 1,67 s |
| — klass `missad sving` | 12 / 7 | 0,046 | 0,149 | 0,05 s | **58 %** | 92 % | 1,63 s |
| — klass `kapad kant (toppen)` | **2 / 2** | 0,121 | 0,236 | **0,95 s** | **100 %** | 100 % | 2,70 s |
| — klass `finishtopp utanför` | 9 / 4 | 0,033 | 0,081 | 0,17 s | 33 % | 78 % | 1,67 s |
| — klass `rörelse efter` | 3 / 2 | 0,060 | 0,128 | 0,13 s | 33 % | 67 % | 1,93 s |
| i de övriga klippen | 76 / 65 | 0,058 (p90 0,135) | 0,126 | 0,12 s | **26 %** | 92 % | 1,60 s |

**Fönstret slutar inte mitt i rörelsen.** Finishregelns villkor (fart under 0,20 × toppfarten) är
uppfyllt i median med god marginal överallt — 0,055 i hela rundan, 0,046 i de 16 — och
**fördelningarna överlappar helt**. p90 är 0,113 mot 0,135; de 16 ligger om något *lugnare* vid
sitt slut än resten.

**Det enda som skiljer mätbart är riktningen.** Banan **stiger fortfarande** vid envelopens sista
ruta på **48 % av de 16:s envelopes mot 26 % i de övriga**, och på **100 % av de två kapade
topparna**. En envelope som slutar medan händerna går upp har per definition inte sett toppen.

### Slow-mo, utbrutet

| grupp | n (rader/klipp) | fart / toppfart | fart / p95 | tyst ö | **stiger där** | envelopelängd | över `MAX_ENVELOPE_SEC` |
|---|---|---:|---:|---:|---:|---:|---:|
| **slow-mo, i de 16** | **5 / 4** | 0,033 | **0,081** | **0,27 s** | **80 %** | **4,13 s** | **5 av 5** |
| slow-mo, i de övriga | 10 / 9 | 0,064 | 0,127 | 0,10 s | 30 % | 4,59 s | 10 av 10 |
| normal takt, i de 16 | 22 / 15 | 0,049 | 0,134 | 0,05 s | 41 % | 1,57 s | 0 |
| normal takt, i de övriga | 66 / 57 | 0,058 | 0,126 | 0,12 s | 26 % | 1,53 s | 0 |

**I slow-mo är mekanismen läsbar, i normal takt är den det inte.** De fem slow-mo-svingarna i de
16 klippen slutar sitt fönster medan händerna går **upp** i 4 av 5 fall, vid en fart på 0,081 ×
p95 — **under segmenterarens QUIET-gräns 0,15** — och med en tyst ö på median 0,27 s, alltså vid
gränsen 0,3 s som bryter en burst. **En slow-mo-baksving rör sig långsammare än 0,15 × p95, och
då är "stillhet" och "toppen av en långsam sving" samma avläsning.** `001.mp4` är extremfallet:
tyst ö **1,90 s**, fart 0,131 × p95, banan stiger.

**Men slow-mo är inte i sig felet:** slow-mo-svingarna i de *övriga* 65 klippen har samma
envelopelängd (4,59 s), ligger också alla över `MAX_ENVELOPE_SEC`, och stiger vid sitt slut i
bara 30 %. **n = 5 rader i 4 klipp mot 10 i 9. Det är för lite för att bygga något på.**

### Produktionens egna flaggor, som ingen tidigare omgång har läst

De ligger i exportmanifestet, en per sving.

| flagga | antal | i de 16 klippen | i de övriga |
|---|---:|---:|---:|
| `clippedTail` | **7 av 103** | 2 | 5 |
| `suspectMultiSwing` | **15 av 103** | 5 | 10 |

`clippedTail`: `S32-074` (001), `S32-067` (009), `S32-058` (022), `S32-076` (031), `S32-035`
(072), `S32-078` och `S32-062` (095).

`suspectMultiSwing`: `S32-074` (001), `S32-092` (005), `S32-076` (031), `S32-085` (036),
`S32-041` (040), `S32-014` och `S32-051` (045), `S32-088` (049), `S32-072` (052), `S32-031`
(062), `S32-093` (070), `S32-023` (073), `S32-103` (089), `S32-078` och `S32-062` (095).

**`clippedTail` skiljer inte grupperna** (2 av 27 mot 5 av 76). Men två saker är värda att
skrivas ned:

- **`001.mp4` bär redan `clippedTail: true`.** Produktionen visste att det fönstret inte hittade
  någon hållen finish. Ingen omgång hittills har läst flaggan.
- **Produktionen har en egen flersvingsflagga**, `suspectMultiSwing`, på 15 av 103 svingar.
  [multiswing.md](multiswing.md) §A byggde en ny och fick 7. **De överlappar på 3**
  (`S32-074`, `S32-092`, `S32-041`). Vad de två flaggorna mäter är inte samma sak och det är
  inte utrett här.

---

## 6. E3:s ruta ur två körningar — vilket golv sätter det?

Skillnaden mellan körningarna är en **varm spårare**: `run_pose.py` skapar en kall spårare per
sving och börjar avkoda 0,6 s före envelopen, `run_pose_clip.py` en per klipp från t = 0. Samma
modell, samma vikter, **samma bildrutor** (fråga 1). **Det är en störning som inte borde betyda
något — och det är precis därför den duger som måttstock.**

### Hur mycket rör sig valet?

103 av 103 svingar har en bana ur båda körningarna.

| | |
|---|---:|
| E3:s ruta **lika** | **66 av 102** |
| inom 1 ruta | 88 av 102 |
| tappar respektive får ett val | 1 och 1 |
| av de 34 som skiljer | median +0, \|median\| **1**, p90 3, max **19** rutor |
| över alla 100 med värde i båda | \|skillnad\| median 0, p75 **1**, p90 **2**, max 19 |

### Vad det gör med rubriksiffrorna

Ingenting är anpassat; bara underlaget byts.

| | E3 inne (n=91) | median | E4 RND inne (n=91) | median |
|---|---:|---:|---:|---:|
| **kall** (den körning alla tidigare omgångar står på) | **30** | −1 | **42** | +0 |
| **varm** (helklippskörningen) | **27** | −1 | **44** | +0 |

**Nettot döljer omsättningen, och omsättningen är golvet:**

| | netto | inne → utanför | utanför → inne | rader som byter avstånd alls |
|---|---:|---:|---:|---:|
| E3 | −3 | **7** | 4 | **23** |
| E4 RND | +2 | 4 | **6** | 15 |

### Vad det sätter för golv — i klartext

| tidigare rapporterad effekt | storlek | mot körningsbruset (netto ±3 rader, omsättning 11 rader) |
|---|---|---|
| S-33: interpolationen lyfte E3 30 → 42 av 91 | **+12 rader** | ~4 × nettot, **överlever** |
| S-32: LOCO-skiftet lyfte 30 → 53 av 91 | **+23 rader** | **överlever** |
| S-33: E4 / E5 / E6 ligger inom **3 rader** av varandra | 3 rader | **ligger i bruset** |
| S-34: "en annan växling hade legat inne" på 1 rad av 49 | 1 rad | **ligger i bruset** |
| S-32/S-33: E3:s förskjutning −1,0 ruta, rest −0,24 subrutor | 1 respektive 0,24 rutor | **se nedan** |

**Och här är det som måste stå rakt ut: instabiliteten är lika stor som E3:s uppmätta fel.**
E3:s hela avstånd till människorna är **|median| 1,00 bildruta** ([resultat.md](resultat.md) §4).
En störning som inte borde betyda någonting flyttar rutan **1 bildruta i median på de 34 svingar
där den flyttar den alls**, och 1 ruta vid p75 över hela rundan. **Storheten som mäts och
störningen som inte ska betyda något är alltså av samma storleksordning.**

Det gäller särskilt:

- **S-33:s restförskjutning på −0,24 subrutor** och dess slutsats att restskiftet "ligger
  någonstans mellan 0 och −1" — det är en fjärdedels ruta, långt under körningsbruset.
- **S-32:s MAD på 1,0** och alla uttalanden om huruvida E3 är "1 ruta för tidig": riktningen
  överlever (medianen står på −1 i båda körningarna), **beloppet gör det inte med bättre
  upplösning än en ruta.**
- **Varje jämförelse mellan två estimatorer som skiljer ≤ 3 rader av 91.**

Vad som *inte* faller: **riktningen** (−1 i båda körningarna), **skiftets storleksordning**
(LOCO +23 rader), och **interpolationens vinst** (+12 rader).

**Det här är en undre gräns, inte en felmarginal.** Det är en enda störning, av ett slag som är
lätt att mäta. Vad de fem oprövade paritetsavvikelserna mot webbkedjan
([top-from-pose.md](../top-from-pose.md)) gör är fortfarande omätt, och de flyttar rimligen minst
lika mycket.

---

## Vad som INTE mättes

- **Ingen ny estimator, ingen tröskel, ingen kalibrering, inget skift, ingen ändring i
  produktionskoden, ingen ändring i envelopelogiken och ingen ändring i S-30:s spärr.**
  `poseEnvelope.ts` och `poseSegments.ts` är lästa och citerade; de är inte reimplementerade och
  ingen siffra här är poängsatt mot dem.
- **Om bildkvaliteten spelar roll.** Fråga 1 visar att bedömaren och estimatorn såg samma
  *ögonblick*. Att bedömaren såg en nedskalad JPEG på 75 av 103 svingar och estimatorn den råa
  rutan är oprövat.
- **Vad de 41 vändningarna faktiskt visar.** De är klassade ur banans form, inte identifierade.
  **Ingen har öppnat en enda bildruta ur något av de 16 klippen.** MediaPipe spårar den som syns,
  och en vändning kan vara en provsving, en waggle, en boll som plockas upp eller en kamera som
  bärs.
- **De två marginella raderna.** `039.mp4` (kvot 1,01) och `054.mp4` (0,92) vänder klass med
  bandet. `054.mp4`:s vändning vid 10,9 s har alltså en nedgång **inom 8 %** av klippets svagaste
  registrerade nedsving — den går inte att skilja från en sving på den här mätningen, och den
  kallas `rörelse` bara för att bandet ligger där det ligger.
- **`056.mp4`.** Pose på 7 % av ±0,5 s runt vändningen. Klassad `ej avgörbar` och ingenting mer
  sägs om den.
- **`001.mp4`:s 22 mikrovändningar.** De är en följd av en degenererad referens (0,0017), inte
  22 rörelser. Vad som händer i klippets sista 18 sekunder är obeskrivet.
- **Om envelopen går att laga.** Diagnosen säger var fönstren slutar och vad som kännetecknar de
  som slutar för tidigt. Vad som skulle flytta dem är en ändring i segmenteringen och ligger
  utanför den här omgången.
- **Vad `suspectMultiSwing` mäter.** Produktionens egen flagga är läst och räknad, inte utredd,
  och den är inte jämförd med [multiswing.md](multiswing.md) §A:s flagga bortom att de överlappar
  på 3 av 7.
- **Paritet mot webbkedjan.** Samma fem avvikelser som [top-from-pose.md](../top-from-pose.md)
  listar gäller oförändrat, plus `opencv`/`numpy`-versionerna, plus den varma spåraren. Avsnitt 6
  mäter den sista; de andra är fortfarande oprövade.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena.
- **Händighet.** `unknown` på alla 103 svingar, oförändrat sedan S-32.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1), `opencv-python` (5.0.0) och `numpy` (2.4.6),
samt `public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. envelopebanorna, ~15 min for 103 svingar (lokalt, kostnadsfritt, inget API)
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. helklippsbanorna, ~30 min for 81 klipp
<venv>/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py <tmp>/clippose

# 4. den har matningen
#    (--section: window | outside | downstream | c001 | why | stability | all)
python docs/shaft/top-review/envelope_audit.py <tmp>/pose \
    --clipPoseDir <tmp>/clippose --section all
```

`envelope_audit.py` skriver bara till stdout. **Läs kontrollraden överst:** stämmer den inte med
[resultat.md](resultat.md), [subframe.md](subframe.md), [crossing-selection.md](crossing-selection.md)
och [multiswing.md](multiswing.md) har posebanorna drivit och inget här gäller. Skriptet stannar
också om urvalet i avsnitt 2 inte reproducerar S-35 del D:s 16 klipp namn för namn.
