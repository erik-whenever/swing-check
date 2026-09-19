# Den varma baslinjen, den hårda kärnan och taket — och flaggbuggen (S-38, diagnos)

> 2026-09-19, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering applicerad, inget skift infört, ingen ändring i S-30:s
> spärr och ingen produktionskod skriven.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är orörda. `src/lib/dataset/datasetGate.ts`,
> `src/lib/dataset/slowmo.ts`, `src/lib/dataset/extractDataset.ts` och
> `src/lib/poseSegments.ts` är **lästa och citerade rad för rad** i fråga 5 — varken ändrade,
> reimplementerade eller poängsatta. Skriptet **stannar** om någon citerad rad har flyttat.
>
> **FÖRUTSÄTTNING, lämnad i uppgiften och inte vald här: allt mäts VARMT** — på
> [run_pose_clip.py](run_pose_clip.py):s helklippsbanor, den konfiguration
> [e2-and-floor.md](e2-and-floor.md) §1 visade att produktionen kör. Den **kalla** körningen
> laddas för exakt ett ändamål: kontrollraden. **Inget kallt tal redovisas som resultat** —
> med ett undantag som står utskrivet, kall/varm-jämförelsen i §1 och kärnans stabilitet i
> §2, där det kalla är *störning* och inte facit.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md),
> [crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md),
> [envelope-audit.md](envelope-audit.md) och [e2-and-floor.md](e2-and-floor.md) lästes först,
> så risken här är inte mätfel — den är anpassning. Därför: **ingen parameter svept, ingen
> justerad, ingenting valt.** E2:s utjämningsfönster (3) och E3:s hysteres (0,10) är deras
> egna. Fråga 3 redovisar separationen **en storhet i taget** och sätter ingen tröskel på
> någon av dem; det finns ingen sammanvägd poäng och ingen grind.
>
> Skript: [hard_core.py](hard_core.py) (skriver bara till stdout). Underlaget är S-32:s runda
> — **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor** — poängsatt på en
> helklippskörning av samma posemodell över alla 81 klipp. **Klippet är den oberoende
> enheten** och n står som rader *och* klipp.

## Kort svar

**1. Den varma baslinjen: E4 44 av 91, E2 40, E3 27, E1 6.** Mot spannet, n = 91 rader i 73
klipp. Bytet från den kalla körningen kostar E1 −4, E2 −5 och E3 −3 rader och ger E4 +2.
**E4 är den bästa estimatorn i rundan, inte E2** — och det är första gången ordningen mäts på
den konfiguration produktionen faktiskt kör.

**2. Kärnan är 31 av 91 rader (34 %) i 25 av 73 klipp — men den är inte hård.** På **19 av de
31 (61 %)** ligger den bästa av de fyra **1 bildruta** från spannet, på 29 av 31 (94 %) inom 3,
och bara **1 rad** ligger 10 rutor eller mer bort. **Golvet under mätningen är 1 bildruta**
([e2-and-floor.md](e2-and-floor.md) §4) och det mänskliga spannet är median 2 rutor brett.
**Kärnan är i huvudsak enrutesmissar, inte havererade svingar** — och som *radmängd* är den
inte reproducerbar: kall mot varm delar bara 23 av 31 rader (74 %), omsättning 15.

**Och ja, det är till stor del samma svingar som de två tidigare grupperna.** 25 av kärnans 31
(81 %) saknar helt en teckenväxling som överlappar spannet, och 19 av 31 (61 %) saknar en
tillåten ankarruta för E2. **Bara 4 rader av 31 har ingen av de två förklaringarna.** Men
förklaringarna är bredare än kärnan: 32 rader saknar växling inne, och bara 25 av dem är kärna.

**3. Nej — kärnan går inte att förutsäga utan facit.** Tolv storheter mätta var för sig, ingen
tröskel satt: **samtliga AUC ligger mellan 0,43 och 0,60.** Det bästa som finns är största
rutsteget och \|E2 − E4\|, båda på 0,60, med fördelningar som överlappar nästan helt.
**Oenighet mellan estimatorerna duger särskilt dåligt.** \|E3 − E4\| pekar åt **fel** håll
(AUC 0,43) och är per konstruktion kapad vid 1 ruta; \|E2 − E4\| har 74 % av kärnans rader inne
i restens egen IQR. Pose-presence är 1,000 i både kärnan och resten och skiljer ingenting.

**4. Taket, om kärnan kunde uteslutas perfekt: E4 73 % (44 av 60), E2 67 % (40 av 60).** Det
är inne i människornas 67–80 %. **Men täljaren är oförändrad** — en grind tar bara bort rader,
den lägger inte till träffar — och en perfekt grind skulle kasta bort 19 svingar som ligger
**en bildruta** fel. Fråga 3 visar att ingen sådan grind går att bygga på det som finns vid
körtid.

**5. Buggen: tre konstanter, två begrepp, ett värde — och `suspectMultiSwing` bär noll
information om produktionens eget material.** `MAX_ENVELOPE_SEC = 3.0`
(`poseSegments.ts:54`, 2026-08-06) är **produktionens avvisningsgräns**;
`SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0` (`slowmo.ts:28`, 2026-08-13) valdes **oberoende** för
ett annat begrepp; `MULTI_SWING_SUSPECT_SEC = 3.0` (`datasetGate.ts:56`, 2026-09-03) är en
**uttalad spegling** av den första. Följden: `suspectMultiSwing` kan per konstruktion aldrig
tända på en production-grindad sving (**0 av 81** mätt), och slow-mo-kvoten på 15 % mäter i
praktiken segmenteringsfel.

---

## 0. Reproduktion — kontrollraden

Posebanorna kördes om från början i ett nytt venv: `run_pose.py` och `run_pose_clip.py`
oförändrade, samma `public/models/pose_landmarker_lite.task`, **`mediapipe` 1.0.1,
`opencv-python` 5.0.0, `numpy` 2.4.6** — samma versioner S-34 till S-37 körde. Kontrollraden
skriptet skriver före allt annat, **på den kalla körningen**:

| | E1 inne | E2 inne | E3 inne (median) | E4 RND inne |
|---|---:|---:|---:|---:|
| mot Erik pass 1 | 9 av 94 | 36 av 94 | 23 av 93 (−1) | 33 av 93 |
| mot Lisa | 10 av 95 | 42 av 95 | 27 av 95 (−1) | 40 av 95 |
| mot spannet | 10 av 91 | 45 av 91 | 30 av 91 (−1) | 42 av 91 |

**Identisk med [resultat.md](resultat.md) §3, [subframe.md](subframe.md) §3,
[crossing-selection.md](crossing-selection.md) §0, [multiswing.md](multiswing.md) §0,
[envelope-audit.md](envelope-audit.md) §0 och [e2-and-floor.md](e2-and-floor.md) §0.** 103
svingar har en posebana ur **båda** körningarna, 101 ett E3-val, 91 ett mänskligt spann.
Skriptet kontrollerar dessutom per sving att posebanans envelope-rutor är registrets
`frameTimes` och att `crossings()[0]` är `e3_signflip`:s svar; stämmer något av det inte
stannar det i stället för att mäta vidare.

> **En n-detalj som annars ser ut som en avvikelse.** Kontrollraden i tidigare omgångar
> restriktar till de 101 svingar som har ett E3-bracket och skriver därför `n=93` mot Erik för
> alla fyra. E1 och E2 behöver inget bracket och har svar på **94** rader. Tabellerna nedan ger
> varje estimator sitt **eget** n, precis som [resultat.md](resultat.md) §3 gör.

`score_round.py`, `subframe.py`, `crossing_selection.py`, `multiswing.py`, `envelope_audit.py`
och `e2_and_floor.py` importeras och återanvänds; **ingenting är återimplementerat.** E1/E2/E3
lyfts ur `analyze_pose.py` med samma AST-lyft som S-32, och E4 är `subframe.py`:s egen bracket
plus interpolation.

---

## 1. Den varma baslinjen — den enda som gäller framåt

Avstånd i envelope-bildrutor, **0 = inne**. Envelopens rutor är hämtade ur helklippsbanan ruta
för ruta på tid — [envelope_audit.py](envelope_audit.py):s egen konstruktion, som §1 där visade
ger **samma 6 548 rutor**.

### Mot vardera annotatören

| | n (rader/klipp) | inne | median | \|median\| | p90 | max | MAD | klippnivå \|median\| |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **E1** mot Erik | 94 / 76 | 5 (5,3 %) | +18,0 | 18,0 | 24,0 | 169,0 | 4,0 | 17,0 |
| **E2** mot Erik | 94 / 76 | 32 (34,0 %) | +0,0 | 1,0 | **47,0** | **205,0** | 1,0 | 1,2 |
| **E3** mot Erik | 93 / 75 | 23 (24,7 %) | −1,0 | 1,0 | 3,0 | 26,0 | 1,0 | 1,0 |
| **E4** mot Erik | 93 / 75 | **37 (39,8 %)** | +0,0 | 1,0 | 3,0 | 26,0 | 1,0 | 1,0 |
| **E1** mot Lisa | 95 / 75 | 5 (5,3 %) | +18,0 | 18,0 | 23,0 | 169,0 | 3,0 | 17,0 |
| **E2** mot Lisa | 95 / 75 | 36 (37,9 %) | +0,0 | 1,0 | **31,0** | **205,0** | 1,0 | 1,0 |
| **E3** mot Lisa | 95 / 75 | 24 (25,3 %) | −1,0 | 1,0 | 4,0 | 26,0 | 1,0 | 1,0 |
| **E4** mot Lisa | 95 / 75 | **40 (42,1 %)** | +0,0 | 1,0 | 3,0 | 26,0 | 1,0 | 1,0 |

### Mot det mänskliga spannet (n = 91 rader i 73 klipp)

| | inne | median | \|median\| | p90 | max | MAD | klippnivå \|median\| |
|---|---:|---:|---:|---:|---:|---:|---:|
| **E1** | 6 (6,6 %) | +18,0 | 18,0 | 23,0 | 169,0 | 4,0 | 16,0 |
| **E2** | 40 (44,0 %) | +0,0 | 1,0 | **30,0** | **205,0** | 1,0 | 1,0 |
| **E3** | 27 (29,7 %) | −1,0 | 1,0 | 3,0 | 26,0 | 1,0 | 1,0 |
| **E4** | **44 (48,4 %)** | +0,0 | 1,0 | 3,0 | 26,0 | 1,0 | 1,0 |

**Tre avläsningar.**

- **E4 är rundans bästa estimator, och E2 är det inte.** 44 mot 40 mot spannet, 37 mot 32 mot
  Erik, 40 mot 36 mot Lisa — samma tecken i alla tre, och i två av de tre är marginalen 4–5
  rader. [e2-and-floor.md](e2-and-floor.md) §4 strök redan "E2 är oftare inne än E4"; **här
  vänder det helt**, och det gör det på den konfiguration som räknas.
- **E2:s svans är värre varmt än kallt.** p90 mot Erik går 30 → 47 och mot spannet 26 → 30,
  medan max står still på 205. E3 och E4 rör sig inte alls i spridningsmåtten (\|median\| 1,0,
  p90 3,0, max 26,0 i båda körningarna).
- **E1 är fortfarande fel konstruktion.** Median +18 rutor, inne i 1 av 15.

### Vilka tal detta ersätter

Varje siffra i vänsterkolumnen är publicerad som `inne` i en tidigare omgång. **Den högra
ersätter den.**

| mot | est | inne KALL (publicerad) | inne VARM (gäller framåt) | netto |
|---|---|---:|---:|---:|
| Erik | E1 | 9 av 94 | **5 av 94** | −4 |
| Erik | E2 | 36 av 94 | **32 av 94** | −4 |
| Erik | E3 | 23 av 93 | **23 av 93** | ±0 |
| Erik | E4 | 33 av 93 | **37 av 93** | +4 |
| Lisa | E1 | 10 av 95 | **5 av 95** | −5 |
| Lisa | E2 | 42 av 95 | **36 av 95** | −6 |
| Lisa | E3 | 27 av 95 | **24 av 95** | −3 |
| Lisa | E4 | 40 av 95 | **40 av 95** | ±0 |
| spannet | E1 | 10 av 91 | **6 av 91** | −4 |
| spannet | E2 | 45 av 91 | **40 av 91** | −5 |
| spannet | E3 | 30 av 91 | **27 av 91** | −3 |
| spannet | E4 | 42 av 91 | **44 av 91** | +2 |

**Namngivet, dokument för dokument:** [resultat.md](resultat.md) §3 (E1/E2/E3 mot båda
bedömarna och mot spannet), [subframe.md](subframe.md) §3 (E4 RND), och kontrollraderna i
[crossing-selection.md](crossing-selection.md) §0, [multiswing.md](multiswing.md) §0,
[envelope-audit.md](envelope-audit.md) §0 och [e2-and-floor.md](e2-and-floor.md) §0 och §2.
Dessutom ersätts **[e2-and-floor.md](e2-and-floor.md) §3:s rubriksiffra** "19 av 91 (21 %) utan
tillåten ankarruta" av **23 av 91 (25 %) i 19 klipp** (§2 nedan).

**Vad som INTE ersätts, och varför det är viktigt.** Allt annat som byggdes på den kalla
körningen är **inte omräknat här**: LOCO-skiftet, interpolationens +12 rader, kandidatanalysen
i [crossing-selection.md](crossing-selection.md), svansraderna i [subframe.md](subframe.md) §7,
ankarmängdens form och läge. De står kvar **omräknade på en konfiguration produktionen inte
kör**, precis som [e2-and-floor.md](e2-and-floor.md) §1 konstaterade. Den här omgången byter
baslinjen, inte hela biblioteket.

**Människorna rörs inte.** De är inte mätta på en posebana: Eriks mittpunkt inne i Lisas
intervall **73 av 91 (80 %)**, Lisas inne i Eriks **61 av 91 (67 %)**
([resultat.md](resultat.md) §2). Det är jämförelsetalet i fråga 4.

---

## 2. Den hårda kärnan

**Definitionen är lämnad i frågan och inte vald här:** kärnan är de rader med ett mänskligt
spann där **ingen** av E1, E2, E3, E4 hamnar inne i spannet. Mätt varmt. En estimator utan svar
räknas som *inte inne*.

### Storleken

| | rader | klipp |
|---|---:|---:|
| **kärnan** | **31 av 91 (34 %)** | **25 av 73** |
| resten | 60 | 54 |

Hur många av de fyra som träffar, rad för rad:

| | rader | andel |
|---|---:|---:|
| 0 av 4 inne (**kärnan**) | 31 | 34 % |
| 1 av 4 | 21 | 23 % |
| 2 av 4 | 22 | 24 % |
| 3 av 4 | 16 | 18 % |
| 4 av 4 | 1 | 1 % |

**Kärnan hänger inte på E1.** Definierad på bara E2/E3/E4 är den **31 rader — exakt samma**.
E1 är ensam inne på **0** rader i hela rundan.

### Hur hård är den? Nästan inte alls

`bästa` = den av de fyra med minst \|avstånd\|. Det är **inte** "den rätta", och ingenting väljs
på den — ren beskrivning.

| | n | median | p75 | p90 | max | ≤1 ruta | ≤2 | ≤3 | ≥10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **kärnan** | 31 | **1** | 2 | 3 | **11** | **19 (61 %)** | 25 (81 %) | 29 (94 %) | **1** |
| resten | 60 | 0 | 0 | 0 | 0 | 60 (100 %) | 60 | 60 | 0 |

**Det här är omgångens viktigaste tal, och det talar emot att kalla gruppen en kärna.** På 19
av 31 rader ligger någon estimator **en bildruta** utanför ett spann som i median är **två**
rutor brett — och en bildruta är precis vad en meningslös störning flyttar
([e2-and-floor.md](e2-and-floor.md) §4, [envelope-audit.md](envelope-audit.md) §6). Bara **en**
rad i hela kärnan ligger 10 rutor eller mer bort.

### Överlever kärnan som klass mätgolvet? Nej

Samma störning som [e2-and-floor.md](e2-and-floor.md) §4 — kall spårare i stället för varm,
samma modell, samma bildrutor. **De kalla talen används inte som resultat; de används för att
se om kärnan är samma rader.**

| | rader |
|---|---:|
| kärnan kall | 30 |
| kärnan varm | 31 |
| **gemensamma** | **23 (74 % av den varma)** |
| bara kall / bara varm | 7 / 8 |
| **omsättning** | **15 rader** |

**Storleken är stabil, radmängden är det inte.** Det följer av tabellen ovan: när 61 % av
kärnan ligger en ruta fel avgörs medlemskapet av precis det brus golvet mäter.

### Är det samma svingar som de två tidigare grupperna?

Båda grupperna är **omräknade varmt**, på alla 91 rader med spann.

| | rader | klipp | tidigare publicerat |
|---|---:|---:|---|
| **(a)** ingen tillåten ankarruta för E2 alls | 23 (25 %) | 19 | 19 av 91 (21 %) **kallt**, [e2-and-floor.md](e2-and-floor.md) §3 |
| **(b)** ingen teckenväxling som **överlappar** spannet | 32 (35 %) | 26 | — |
| (b′) samma, S-34:s striktare test `lo ≤ j+1 ≤ hi` | 63 (69 %) | 52 | 22 av 23 **kallt**, inom en delmängd |
| (b) med E3:s egen hysteres (armade kandidater) | 32 (35 %) | — | — |

> **Varför (b) och (b′) skiljer sig så mycket, och varför (b) är rätt fråga.** En växling vid
> bracket `j` ligger **mellan** ruta `j+1` och `j+2`. S-34/S-35 testade `lo ≤ j+1 ≤ hi`, vilket
> missar varje växling vars interpolerade svar rundar till `j+2` — och det är precis så E4 kan
> ligga inne på en rad det strikta testet kallar tom. **Därför är (b), att `[j+1, j+2]` skär
> spannet, den avsedda frågan.** S-34/S-35:s "22 av 23" räknades dessutom kallt **och bara inom
> de 23 rader där E4 låg utanför och svingen hade exakt en armad kandidat**; det är ett annat
> bråk, inte samma tal med annan nämnare.

**Snitten:**

| | kärnan | gruppen | snittet | av kärnan | av gruppen |
|---|---:|---:|---:|---:|---:|
| kärnan mot **(a)** ingen ankarruta | 31 | 23 | **19** | 61 % | **83 %** |
| kärnan mot **(b)** ingen växling inne | 31 | 32 | **25** | **81 %** | 78 % |
| alla tre samtidigt | — | — | **17** | 55 % | — |

**Svaret är ja, med en reservation.** **25 av kärnans 31 rader (81 %) saknar en teckenväxling
som överlappar spannet**, och **19 av 31 (61 %) saknar en tillåten ankarruta** — bara **4 rader
av 31** har ingen av de två förklaringarna. Åt andra hållet är **83 % av (a)** kärna. Men (b)
är bredare än kärnan: 7 av dess 32 rader ligger utanför, alltså svingar där ingen växling
överlappar spannet och ändå någon estimator hamnade inne. **Grupperna är inte utbytbara, men de
beskriver i allt väsentligt samma svingar.**

### Känslighet: kärnan mot vardera annotatören

Spannet är **unionen** och därmed det generösaste målet — en kärna mot en enskild bedömare kan
bara bli större:

| mål | kärnan | klipp |
|---|---:|---:|
| spannet (unionen) | 31 av 91 (34 %) | 25 |
| mot Erik pass 1 | 40 av 91 (44 %) | 30 |
| mot Lisa | 38 av 91 (42 %) | 32 |

### Kärnan rad för rad

Avstånd i bildrutor, + = efter spannet. `ank` = finns någon tillåten ankarruta; `vax` = finns
någon växling som överlappar spannet.

| id | klipp | E1 | E2 | E3 | E4 | spann | ank | vax | flaggor |
|---|---|---:|---:|---:|---:|---|:-:|:-:|---|
| S32-001 | 072.mp4 | −3 | −2 | −3 | −2 | 63–64 | nej | nej | utan nedslag |
| S32-006 | 043.mp4 | −1 | +5 | −2 | −2 | 22–24 | ja | nej | – |
| S32-009 | 082.mp4 | −1 | +1 | −1 | −1 | 15–16 | ja | ja | – |
| S32-013 | 057.mp4 | −1 | +28 | **−26** | **−26** | 29–30 | ja | ja | utan nedslag |
| S32-017 | 093.mp4 | +22 | +3 | −3 | −3 | 20–21 | ja | nej | – |
| S32-023 | 073.mp4 | −2 | +20 | −1 | −1 | 78–85 | ja | ja | slow-mo, utan nedslag |
| S32-028 | 046.mp4 | −2 | −2 | −2 | −2 | 34–37 | nej | nej | – |
| S32-029 | 095.mp4 | +20 | +1 | +1 | +2 | 33–35 | ja | nej | utan nedslag |
| S32-030 | 008.mp4 | +18 | +4 | −2 | −1 | 18–19 | ja | nej | utan nedslag |
| S32-039 | 017.mp4 | −1 | +1 | −2 | −1 | 26–27 | ja | nej | – |
| S32-041 | 040.mp4 | +67 | +35 | +3 | +3 | 41–43 | nej | nej | slow-mo |
| S32-042 | 032.mp4 | +21 | −4 | −3 | −3 | 30–31 | nej | nej | – |
| S32-044 | 092.mp4 | +18 | −2 | −3 | −3 | 19–21 | nej | nej | – |
| S32-047 | 015.mp4 | +21 | −2 | −5 | −5 | 28–29 | nej | nej | – |
| S32-048 | 027.mp4 | +22 | −2 | −2 | −1 | 24–25 | nej | nej | – |
| S32-057 | 010.mp4 | +19 | −1 | −2 | −1 | 18–19 | nej | nej | – |
| S32-060 | 090.mp4 | +18 | −1 | −2 | −2 | 18–19 | nej | nej | – |
| S32-062 | 095.mp4 | +18 | +56 | +1 | +1 | 24–25 | nej | nej | slow-mo, utan nedslag |
| S32-063 | 090.mp4 | +19 | +1 | −2 | −2 | 15–16 | nej | nej | – |
| S32-068 | 091.mp4 | +16 | +6 | −2 | −1 | 17–18 | nej | nej | – |
| S32-069 | 085.mp4 | −2 | −1 | −2 | −1 | 20–22 | nej | nej | – |
| S32-075 | 093.mp4 | −2 | +1 | −3 | −3 | 20–21 | ja | nej | – |
| S32-079 | 095.mp4 | +20 | +1 | +1 | +2 | 28–29 | ja | nej | utan nedslag |
| S32-080 | 080.mp4 | +15 | −11 | **−17** | **−16** | 31–33 | ja | ja | – |
| S32-086 | 088.mp4 | +21 | −2 | −4 | −3 | 23–23 | nej | nej | – |
| S32-090 | 024.mp4 | +5 | +6 | **−10** | −9 | 24–25 | ja | nej | – |
| S32-092 | 005.mp4 | +169 | **+205** | −4 | −3 | 19–20 | nej | nej | slow-mo |
| S32-095 | 039.mp4 | +20 | −1 | −1 | −1 | 20–22 | nej | ja | utan nedslag |
| S32-096 | 090.mp4 | +21 | −2 | −2 | −2 | 17–18 | nej | nej | – |
| S32-100 | 088.mp4 | +21 | −1 | −3 | −2 | 22–23 | nej | nej | – |
| S32-103 | 089.mp4 | +20 | +82 | −1 | −1 | 17–17 | nej | ja | slow-mo |

**Tabellen säger samma sak som kvantilerna.** Tre rader bär hela avståndet — S32-013, S32-080,
S32-090, och det är [crossing-selection.md](crossing-selection.md) §2:s tre yttersta rader,
oförändrade varmt. Resten är −1 till −5 och +1 till +6. **Fyra klipp återkommer:** `090.mp4`
och `095.mp4` med tre rader var, `093.mp4` och `088.mp4` med två var — 10 av kärnans 31 rader
ligger i fyra klipp, vilket är skälet till att klippet och inte raden är den oberoende enheten.

---

## 3. Går kärnan att förutsäga utan facit?

Varje storhet finns vid **körtid**: den läses ur posebanan, ur envelopen eller ur
estimatorernas inbördes oenighet — **aldrig ur en annotering**. Separationen redovisas **en
storhet i taget**. **Ingen tröskel sätts, ingen klassificerare byggs, ingen sammanvägd poäng
räknas.**

> **Vad AUC är här.** Sannolikheten att en slumpvis kärnrad rankar över en slumpvis restrad,
> lika värden räknade som halva. Det är **hela ROC-kurvan avläst utan att välja en punkt på
> den** — ett separationsmått, inte en regel. 0,50 = fördelningarna ligger helt omlott;
> 0 eller 1 = de överlappar inte alls.

| storhet | n (kärna/rest) | kärnan median (p25–p75) | resten median (p25–p75) | **AUC** |
|---|---|---|---|---:|
| pose-presence (andel rutor med pose) | 31 / 60 | 1,000 (1,000–1,000) | 1,000 (1,000–1,000) | **0,51** |
| största rutsteg i banan (bildenheter) | 31 / 60 | 0,0800 (0,0567–0,1196) | 0,0617 (0,0522–0,0859) | **0,60** |
| envelopelängd (rutor) | 31 / 60 | 50 (44–58) | 47 (42–59) | **0,57** |
| envelopelängd (s) | 31 / 60 | 1,67 (1,46–1,92) | 1,53 (1,40–1,93) | **0,56** |
| stigande run vid fönstrets slut (rutor) | 31 / 60 | 0 (0–1) | 0 (0–1) | **0,54** |
| fart vid sista rutan / envelopens toppfart | 31 / 60 | 0,065 (0,042–0,129) | 0,069 (0,040–0,121) | **0,51** |
| amplitud (vertikal exkursion) | 31 / 60 | 0,194 (0,154–0,254) | 0,188 (0,159–0,235) | **0,54** |
| antal **armade** växlingar (E3:s kandidater) | 31 / 60 | 1 (1–2) | 1 (1–2) | **0,50** |
| antal **oarmade** teckenbyten | 31 / 60 | 2 (2–3) | 2 (2–3) | **0,58** |
| \|E2 − E4\| (rutor) | 31 / 60 | 3,0 (1,0–9,0) | 1,0 (0,0–8,0) | **0,60** |
| \|E3 − E4\| (rutor) | 31 / 60 | 0,0 (0,0–1,0) | 1,0 (0,0–1,0) | **0,43** |
| spridning E1–E4, max−min (rutor) | 31 / 60 | 23,0 (17,0–27,0) | 20,5 (15,0–25,0) | **0,58** |
| spridning E2/E3/E4, max−min (rutor) | 31 / 60 | 3,0 (1,0–9,0) | 1,0 (1,0–8,0) | **0,58** |

De binära storheterna, som andelar:

| | kärnan | resten |
|---|---:|---:|
| banan stiger vid envelopens sista ruta | 14 av 31 (45 %) | 20 av 60 (33 %) |
| slow-mo (produktionens egen flagga) | 5 av 31 (16 %) | 6 av 60 (10 %) |
| utan säkert nedslag | 8 av 31 (26 %) | 8 av 60 (13 %) |

**Svaret är nej, och det är inte nära.** Den högsta separationen i hela tabellen är **0,60** —
två storheter når dit, största rutsteget och \|E2 − E4\|. Ingen kommer i närheten av att skilja
grupperna. **Pose-presence säger ingenting alls:** medianen är 1,000 med IQR 1,000–1,000 i båda
grupperna — modellen returnerar en pose på varenda ruta, i kärnan lika mycket som i resten, så
den förklaring som låg närmast till hands är utesluten. **Antalet armade växlingar ligger på
exakt 0,50.** De tre kovariaterna med störst *relativ* skillnad — utan säkert nedslag 26 % mot
13 % (8 rader mot 8), slow-mo 16 % mot 10 % (5 mot 6), stigande slut 45 % mot 33 % (14 mot 20)
— vilar alla på skillnader om **2–6 rader**, mot en omsättning på 6–11 rader i
[e2-and-floor.md](e2-and-floor.md) §4:s golv. Ingen av dem är skild från körningsbruset.

### Särskilt: är oenighet mellan estimatorerna en indikator?

Det är de enda storheterna i tabellen som jämför två **svar** med varandra i stället för att
beskriva banan — en grind byggd på dem skulle inte kräva facit. **Den frågan förtjänar ett rakt
svar: nej, och det är den sämsta av kandidaterna.**

| | p10 | p25 | median | p75 | p90 | max | kärnans rader inne i **restens IQR** |
|---|---:|---:|---:|---:|---:|---:|---:|
| \|E2 − E4\| kärnan (n=31) | 0,0 | 1,0 | 3,0 | 9,0 | 55,0 | 209,0 | **23 av 31 (74 %)** |
| \|E2 − E4\| resten (n=60) | 0,0 | 0,0 | 1,0 | 8,0 | 32,0 | 111,0 | — |
| \|E3 − E4\| kärnan | 0,0 | 0,0 | **0,0** | 1,0 | 1,0 | **1,0** | **31 av 31 (100 %)** |
| \|E3 − E4\| resten | 0,0 | 0,0 | **1,0** | 1,0 | 1,0 | **1,0** | — |
| spridning E2/E3/E4 kärnan | 1,0 | 1,0 | 3,0 | 9,0 | 55,0 | 210,0 | **19 av 31 (61 %)** |
| spridning E2/E3/E4 resten | 0,0 | 1,0 | 1,0 | 8,0 | 33,0 | 112,0 | — |

- **\|E3 − E4\| pekar åt fel håll och kan inte bära någonting.** AUC **0,43**: kärnan har
  *lägre* medianavvikelse än resten. Det är inte en upptäckt utan aritmetik — E4 är E3:s egen
  bracket med interpolation, så måttet är per konstruktion kapat vid **1 ruta** i båda
  grupperna. Två estimatorer som delar bracket kan inte vara oense om något annat än
  avrundningen.
- **\|E2 − E4\| är det bästa av de tre och räcker inte.** AUC 0,60, och **74 % av kärnans rader
  ligger inne i restens egen IQR**. En grind skulle alltså i första hand kasta ut rader som
  ligger inne.
- **Spridningen över alla fyra är dominerad av E1**, som är ~18 rutor fel överallt; att den
  ligger på 0,58 säger mer om E1 än om kärnan.

**Slutsats: separationen finns inte.** Inte i banans egenskaper, inte i envelopens, och inte i
estimatorernas oenighet. Det är förenligt med §2: när 61 % av kärnan ligger **en bildruta** från
spannet finns det ingenting i signalen som skulle kunna peka ut den — skillnaden mellan en rad
i kärnan och en i resten är i huvudsak en bildruta, och en bildruta är golvet.

---

## 4. Taket

Om kärnan utesluts: hur stor andel ligger varje estimator inne på **resten**?

| | på resten (n=60) | på alla rader med spann (n=91) |
|---|---|---|
| E1 | 6 av 60 (**10,0 %**) | 6 av 91 (6,6 %) |
| **E2** | 40 av 60 (**66,7 %**) | 40 av 91 (44,0 %) |
| E3 | 27 av 60 (**45,0 %**) | 27 av 91 (29,7 %) |
| **E4** | 44 av 60 (**73,3 %**) | 44 av 91 (48,4 %) |

Klippnivå: resten ligger i **54 klipp**, kärnan i 25, hela rundan i 73.

**Jämförelsen:** Eriks mittpunkt inne i Lisas intervall **73 av 91 (80 %)**, Lisas inne i Eriks
**61 av 91 (67 %)** — räknade på **alla 91 rader**, inte på en delmängd. Jämförelsen med
kolumnen *på resten* är alltså i estimatorernas favor och inte tvärtom.

**Tre saker måste stå bredvid talet, annars är det inte läsbart.**

1. **Täljaren är oförändrad.** 44 är 44 i båda kolumnerna. En grind lägger inte till en enda
   träff; den krymper bara nämnaren. Kärnan är **definierad** som de rader där ingen estimator
   är inne, så att stryka den lyfter andelen **mekaniskt**.
2. **Taket förutsätter en perfekt grind, och fråga 3 visar att ingen sådan går att bygga.**
   Högsta separation 0,60. Talen 73 % och 67 % är alltså **en övre gräns för en grind som kände
   facit**, inte en prognos.
3. **En perfekt grind skulle kasta bort 19 svingar som ligger en bildruta fel.** Kärnan är inte
   en mängd omöjliga svingar (§2) — det är i huvudsak ±1-rutesbandet. Att grinda bort dem är
   att grinda bort mätgolvet, vilket också är varför kärnan bara är 74 % reproducerbar mellan
   två körningar.

**Läst rakt:** taket för E4 är 73 %, vilket ligger **mitt i** människornas 67–80 %. Men på
hela underlaget är E4 48 %, och avståndet mellan 48 % och 73 % ägs helt av en grind som ingen
uppmätt storhet kan realisera.

---

## 5. Buggen: samma uttryck bär två skilda begrepp

**Frågan är kod.** Skriptet slår upp varje rad och stannar om någon har flyttat.

### Var i koden

| fil | rad | |
|---|---:|---|
| `src/lib/poseSegments.ts` | 54 | `const MAX_ENVELOPE_SEC = 3.0;` |
| `src/lib/poseSegments.ts` | 441 | `if (envSec > MAX_ENVELOPE_SEC) return no(…'(not one swing)')` |
| `src/lib/dataset/datasetGate.ts` | 56 | `export const MULTI_SWING_SUSPECT_SEC = 3.0;` |
| `src/lib/dataset/datasetGate.ts` | 142–143 | `isSuspectMultiSwing` → `envelope.finishSec - envelope.startSec > MULTI_SWING_SUSPECT_SEC` |
| `src/lib/dataset/datasetGate.ts` | 158, 178 | båda grindarna sätter `suspectMultiSwing` |
| `src/lib/dataset/slowmo.ts` | 28 | `export const SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0;` |
| `src/lib/dataset/slowmo.ts` | 37 | `export const SLOWMO_FRAME_CAP_FRAC = 0.15;` |
| `src/lib/dataset/slowmo.ts` | 57, 66 | `deriveSlowmo` → `envelopeDurationSec > SLOWMO_ENVELOPE_THRESHOLD_SEC` |
| `src/lib/dataset/extractDataset.ts` | 238 | `const slowmo = deriveSlowmo(envelopeDurationSec, clip.slowmoMode);` |
| `src/lib/dataset/extractDataset.ts` | 327, 355, 358 | `slowmoSummary`, `slowmoThresholdSec`, `multiSwingSuspectSec` i manifestet |

**Tre konstanter, två begrepp, ett värde:**

- `MAX_ENVELOPE_SEC = 3.0` är **produktionens avvisningsgräns** — över den är envelopen
  `not one swing`.
- `MULTI_SWING_SUSPECT_SEC = 3.0` är en **uttalad spegling** av den (kommentaren i
  `datasetGate.ts` säger det rakt ut), använd som **flagga** i stället för avvisning.
- `SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0` är ett **oberoende hårdvalt** värde för ett **annat
  begrepp**: filmhastighet.

Båda flaggorna räknas på **samma storhet** (envelopens varaktighet) och jämförs med **samma
tal**. `suspectMultiSwing` och `slowmo` i `auto`-läge är därför **samma predikat**. Den enda väg
där de kan skilja sig är overridelaget `force-normal`/`force-slowmo`, som rör `slowmo` men
**inte** `suspectMultiSwing`.

### Sedan när

| datum | commit | vad som hände |
|---|---|---|
| **2026-08-06** | `3d04351` — *D-4 segmentering för kontinuerligt sessionsläge* | `MAX_ENVELOPE_SEC = 3.0` införs i `poseSegments.ts`. Ett begrepp, en gräns. |
| **2026-08-13** | `b4e95db` — *derive slow-motion per swing from envelope duration* | `slowmo.ts` skapas. Commit-meddelandet: *"thresholds on envelope duration (3.0 s named constant)"*. **Värdet väljs oberoende och sammanfaller från och med nu med produktionens avvisningsgräns.** |
| **2026-09-03** | `9c95296` — *relaxed extraction gate and run-wide phase quota* | `datasetGate.ts` skapas. Commit-meddelandet: *"Envelopes past 3 s may hold more than one swing … tagged suspectMultiSwing"* och *"Three of production's thresholds … are mirrored in datasetGate.ts"*. **Från och med nu finns två flaggor med identiskt predikat.** |

**Ingen av de två commits nämner den andra.** Kollisionen med produktionens
segmenteringsgräns är alltså **tre veckor äldre** än de dubblerade flaggorna: `slowmo` var
redan `envelopeDuration > MAX_ENVELOPE_SEC` i praktiken den 13 augusti, och den 3 september fick
samma predikat ett andra namn.

### Mätt på rundan, inte antaget ur koden

| | |
|---|---|
| `slowmo` | **15** av 103 svingar |
| `suspectMultiSwing` | **15** |
| envelope > 3,0 s | **15** |
| identiska mängder `slowmo` == `suspectMultiSwing`? | **JA** — 0 bara i den ena, 0 bara i den andra |
| `suspectMultiSwing` == (envelope > 3,0 s)? | **JA** |
| `suspectMultiSwing` ⊂ `dataset-relaxed`? | **JA** — 15 av 22 relaxed bär den; **production-grindade som bär den: 0 av 81** |
| `clippedTail` | 7, varav 7 utan säkert nedslag — **delmängd: JA** |

Envelopelängderna närmast gränsen: 2,324 · 2,391 · 2,592 · 2,730 · 2,858 · 2,864 · **3,000** ·
3,072 · 3,334 · 3,674 · 3,800 · 3,947 · 4,067 · 4,126 s. **`>` är strikt på alla tre ställena**,
så raden på exakt 3,000 s är varken `slowmo` eller `suspectMultiSwing` och accepteras av
produktionens `isSwing` — reglerna är eniga även i randen.

### Vad som går sönder nedströms

1. **Slow-mo-kvoten mäter segmenteringsfel.** `SLOWMO_FRAME_CAP_FRAC = 0.15` varnar när över
   15 % av rutorna kommer från slow-mo och ber om ombalansering. Eftersom flaggan i praktiken
   är *lång envelope* räknas varje misslyckad segmentering in i den kvoten, och en
   ombalansering som följer varningen tar bort **fel rutor**. *(På den här rundan bär 2 202 av
   6 548 rutor flaggan — 33,6 % — men rundan är en medvetet berikad granskningsomgång och inte
   en produktionskörning av extraktorn, så andelen säger inget om ett riktigt datasetlopp.)*
2. **Det finns ingen åtgärd som skiljer dem åt.** `datasetGate.ts` säger att
   `suspectMultiSwing` finns för att *"a human can catch them in CVAT"*. Ett sådant utlåtande
   har ingenstans att ta vägen och ändrar inte `slowmo`-biten. Den enda spak som finns,
   `slowmoMode`, flyttar `slowmo` men **inte** `suspectMultiSwing` — mängderna kan alltså bara
   skilja sig åt genom ett manuellt ingrepp, aldrig genom en mätning.
3. **Båda felen är tysta.** En äkta slow-mo-sving under 3,0 s får **ingen** av flaggorna; en
   normalfilmad envelope med två repetitioner får **båda**. Manifestet bär dem som två kolumner
   som ser oberoende ut, med var sin dokumenterad tröskel (`slowmoThresholdSec` och
   `multiSwingSuspectSec`) — två tal, samma tal.
4. **Varje analys som delat rundan på `slow-mo` har delat på `lång envelope`.** Det gäller
   [resultat.md](resultat.md) §6, [subframe.md](subframe.md) §7,
   [envelope-audit.md](envelope-audit.md) §5 och [e2-and-floor.md](e2-and-floor.md) §5.
   **Riktningen i de slutsatserna ändras inte — men namnet på orsaken gör det.** "Spannet är
   bredast i slow-mo" och "svansens starkaste signal är slow-mo" är uttalanden om
   **envelopelängd**, inte om filmhastighet, och den som läser dem som ett påstående om
   exponeringstid läser fel.
5. **`suspectMultiSwing` bär noll information om produktionens eget material.** Den kan per
   konstruktion aldrig tända på en production-grindad sving, eftersom produktionen redan
   **avvisar** envelopes över samma 3,0 s — mätt: **0 av 81**. För den 79 % av rundan som
   produktionen själv släpper igenom är flaggan konstant falsk.

**Diagnos, ingen fix.** Vilket av de två begreppen som borde byta storhet, och vilket värde det
i så fall skulle ha, är inte utrett här och ingenting föreslås.

---

## Vad som INTE mättes

- **Ingen ny estimator, ingen tröskel, ingen klassificerare, ingen kalibrering, inget skift,
  ingen produktionskod skriven.** S-30:s spärr ligger kvar. Fråga 3 mäter separation och sätter
  ingen gräns på någon storhet; fråga 4 räknar ett tak och bygger inte grinden.
- **De övriga paritetsavvikelserna.** Den varma körningen rättar **en** axel. Kvar står
  **15 fps (produktionen) mot 30 (båda körningarna)**, WASM/GPU-delegat i webbläsaren mot
  python-CPU, sökning per sampel mot sekventiell avkodning, plus
  [top-from-pose.md](../top-from-pose.md):s fem. **Ingen av dem är mätt**, och golvet i
  [e2-and-floor.md](e2-and-floor.md) §4 är därför fortfarande en undre gräns.
- **Resten av det kalla biblioteket är inte omräknat.** LOCO-skiftet, interpolationens +12
  rader, kandidatanalysen, svansraderna, ankarmängdens form och läge, tystnadstalet 9,5 — alla
  står kvar på den kalla körningen. §1 ersätter rubriksiffrorna, inte allt som byggts på dem.
- **Varför kärnans rader är kärna.** Mätt att 25 av 31 saknar en växling som överlappar spannet
  och att 19 av 31 saknar ankarruta — **inte vad banan gör där**, och inte varför.
- **De 4 raderna utan någon förklaring** (kärna, men både ankarruta och växling finns):
  oundersökta.
- **Ingen har öppnat en enda bildruta.** Samma begränsning som hela spåret. `054.mp4`:s 86
  rutor ligger utrullade sedan S-34 och är fortfarande otittade, och inget av kärnans 25 klipp
  är sett.
- **Om `force-normal`/`force-slowmo` någonsin använts.** Identiteten är mätt på de 103
  svingarna och följer av koden i `auto`-läge; att inget klipp kördes med override är
  slutsatsen av att mängderna är identiska, inte en avläsning av en logg.
- **Vad flaggbuggen gjort med ett riktigt datasetlopp.** Rundan är en granskningsomgång, inte
  en extraktorkörning; 33,6 %-talet är rundans sammansättning och inte ett kvotbrott.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena. Oförändrat sedan
  S-32.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1), `opencv-python` (5.0.0) och `numpy` (2.4.6),
samt `public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. envelopebanorna (den KALLA korningen) -- behovs BARA for kontrollraden, ~15 min
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. helklippsbanorna (den VARMA) -- det har ar underlaget, ~30 min for 81 klipp
<venv>/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py <tmp>/clippose

# 4. den har matningen
#    (--section: baslinje | karna | forutsag | taket | bugg | all)
python docs/shaft/top-review/hard_core.py <tmp>/pose \
    --clipPoseDir <tmp>/clippose --section all
```

`hard_core.py` skriver bara till stdout. **Läs kontrollraden överst:** stämmer den inte med
[resultat.md](resultat.md), [subframe.md](subframe.md),
[crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md),
[envelope-audit.md](envelope-audit.md) och [e2-and-floor.md](e2-and-floor.md) har posebanorna
drivit och inget här gäller. Skriptet stannar också om någon av de citerade produktionsraderna
i §5 har flyttat.
