# Från bildrutefel till utfallsfel — och 3,0-buggens spridning (S-39, diagnos)

> 2026-09-19, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering applicerad, inget skift infört, ingen ändring i S-30:s
> spärr och ingen produktionskod skriven.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är orörda — de är **importerade och anropade**
> genom [verdict_outcomes.ts](verdict_outcomes.ts), aldrig återimplementerade. Det är hela
> skälet till att den här omgången har en TS-brygga: ett *utfall* är vad produktionskoden
> säger att det är, och en kopia av spärrarna hade mätt kopian.
>
> **FÖRUTSÄTTNING, lämnad i uppgiften och inte vald här: allt mäts VARMT** — på
> [run_pose_clip.py](run_pose_clip.py):s helklippsbanor, den konfiguration
> [e2-and-floor.md](e2-and-floor.md) §1 visade att produktionen kör. Den **kalla** körningen
> laddas för två ändamål, båda utskrivna: kontrollraden, och kontrollen i §1 där den kalla
> spåraren är *störning* och inte facit.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md),
> [crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md),
> [envelope-audit.md](envelope-audit.md), [e2-and-floor.md](e2-and-floor.md) och
> [hard-core.md](hard-core.md) lästes först, så risken här är inte mätfel — den är anpassning.
> Därför: **ingen parameter svept, ingen justerad, ingenting valt.** Skiften ±1/2/3/5 är
> uppgiftens egna. E4 är [subframe.py](subframe.py):s egen bracket plus interpolation,
> oförändrad. Intervallen är bedömarnas egna.
>
> Skript: [verdict_sensitivity.py](verdict_sensitivity.py) (skriver bara till stdout) och
> [verdict_outcomes.ts](verdict_outcomes.ts) (stdin → stdout). Underlaget är S-32:s runda —
> **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor** — med produktionens
> skaftdetektor (`shaft-v2.onnx`) körd på **varenda en av de 6 548 bildrutorna** och
> kroppsreferensen hämtad ur den varma helklippsbanan. **Klippet är den oberoende enheten**
> och n står som rader *och* klipp.

## Kort svar

**0. Först en invändning mot frågans form, och den är inte formell.** Av de tre toppankrade
mätvärdena har **exakt ett** ett pass/fail-liknande utfall i produktionskoden:
`top-shaft-orientation`, vars `category` är `across-the-line` / `on-plane` / `laid-off` /
`cannot-determine`. `shaft-position-p4` och `top`-hinken i `shaft-angle-by-phase` returnerar
**tal** — en kroppsrelativ position och en vinkelmedian — och det finns **ingen regel någonstans
i `src/` som läser något av dem**; `grep` på `shaftPositionAtP4`, `topShaftOrientation` och
`shaftAngleByPhase` ger `derived.ts` och dess egen test, ingenting annat. För de två finns alltså
inget utfall att byta utan att en tröskel först uppfinns, och uppgiften förbjuder det. Det som
mäts för dem är därför **det enda utfall koden faktiskt definierar: svar mot inget svar** (plus
kvalitetsnivån, redovisad separat). **Det är inte en urholkning av frågan — det är svaret på
den för två av tre mätvärden.**

**1. Ett bildrutefel är ett utfallsfel, och gränsen går redan vid en bildruta.** n = 101 rader i
79 klipp. Flyttas toppen **en** bildruta byter `top-shaft-orientation` utfall på **23 av 101
(−1)** respektive **22 av 101 (+1)**; minst ett av de två byter på **37 av 101 (37 %)**. Vid
±5 är det 68 av 101 (67 %). För `shaft-position-p4` och `top`-hinken — där bytet bara kan vara
svar↔tystnad — är samma tal **20 av 101 (20 %)** och **23 av 101 (23 %)** vid ±1.
**Och hälften av kategoribytena är riktiga omdömesbyten, inte bara tystnad:** vid −1 är 13 av
23 byten kallat utfall → ett *annat* kallat utfall. **Rena teckenbyten (across-the-line ↔
laid-off) vid ±1: 0 respektive 3.**

**2. Människornas eget spann räcker också, men bara för ett av mätvärdena.** Sätts toppen på
bedömarens **första** mot **sista** ruta byter `top-shaft-orientation` utfall på **11 av 93 hos
Erik (12 %)**, **11 av 95 hos Lisa (12 %)** och **12 av 91 mot unionen (13 %)** — bland de rader
där mätvärdet över huvud taget svarar är det 16–18 %. Intervallen är median **2 rutor** breda.
`shaft-position-p4` byter på 3–6 rader (3–6 %) och `top`-hinken på 4–6 (4–6 %), och **varenda ett
av de bytena är svar↔tystnad**. **Läsningen är otvetydig: `top-shaft-orientation` är för känslig
oavsett estimator.** Ingen estimator kan vara stabilare än den bildruta två eniga människor inte
kan enas om.

**3. Mot en topp satt mitt i människornas spann ger E4 samma utfall på 65 av 91 (71 %) för
`top-shaft-orientation` och 79 av 91 (87 %) för de två andra.** n = 91 rader i 73 klipp. Av de 26
rader där `top-shaft-orientation` skiljer sig är 14 kallat-mot-kallat och 12 svar↔tystnad —
**4 är rena teckenbyten**. Uppdelat på E4:s egen träff: där E4 låg **inne** i spannet stämmer
utfallet på 38 av 44 (86 %), där den låg **utanför** på 27 av 47 (57 %).

**4. De 4 oförklarade kärnraderna är `S32-009`, `S32-013`, `S32-023` och `S32-080`** (4 klipp), och
de ser inte ut som varandra. Två av dem (`S32-013`, `S32-080`) är
[crossing-selection.md](crossing-selection.md) §2:s yttersta rader, där E3/E4 väljer en **tidig**
växling 16–26 rutor före spannet fast den rätta finns. `S32-009` är motsatsen: rätt växling, rätt
ankare, och E4 landar **en ruta** utanför ett tvåruterspann på grund av avrundningen. `S32-023` är
en 4,1 s lång envelope där handleden rör sig **0,005 bildhöjder** över ett 17-rutersfönster runt
spannet — platån är brusnivå. **Beskrivning, inga slutsatser** (§4).

**5. 3,0-buggens spridning: 8 dokument, S-31 till S-38, samtliga rättade.** Etiketterna är utbytta
i texten, siffrorna orörda, och varje dokument bär nu ett rättelseblock som säger vad som ändrades
och varför. Inventering och exakt lista i §5.

**Och det som knyter ihop 1 och 3: utfallet är inte reproducerbart ens utan ett bildrutefel.**
Byts den kalla spåraren mot den varma — samma modell, samma vikter, samma bildrutor, den störning
[e2-and-floor.md](e2-and-floor.md) §4 mätte som *golvet* — byter `top-shaft-orientation` utfall på
**9 av 100 (9 %)**. E3 mot E4, som per konstruktion aldrig ligger mer än en ruta isär, ger
**13 av 101 (13 %)**. **Mot det är ±1-rutans 22 % inte en känslighetskurva som börjar högt — den
börjar redan över golvet vid noll.**

---

## 0. Reproduktion — kontrollraden

Posebanorna är S-38:s, oförändrade (`mediapipe` 1.0.1, `opencv-python` 5.0.0, `numpy` 2.4.6,
samma `public/models/pose_landmarker_lite.task`). Kontrollraden skriptet skriver före allt annat,
**på den kalla körningen**:

| | E1 inne | E2 inne | E3 inne (median) | E4 RND inne |
|---|---:|---:|---:|---:|
| mot Erik pass 1 (n=93) | 9 | 36 | 23 (−1) | 33 |
| mot Lisa (n=95) | 10 | 42 | 27 (−1) | 40 |
| mot spannet (n=91) | 10 | 45 | 30 (−1) | 42 |

**Identisk med [resultat.md](resultat.md) §3, [subframe.md](subframe.md) §3 och
kontrollraderna i [crossing-selection.md](crossing-selection.md),
[multiswing.md](multiswing.md), [envelope-audit.md](envelope-audit.md),
[e2-and-floor.md](e2-and-floor.md) och [hard-core.md](hard-core.md).** Den **varma** baslinjen
reproduceras också oförändrad: **E4 44, E2 40, E3 27, E1 6 av 91** ([hard-core.md](hard-core.md)
§1). Skriptet kontrollerar dessutom per sving att posebanans envelope-rutor är registrets
`frameTimes`, att `crossings()[0]` är `e3_signflip`:s svar, **och att detektorbanans rutor är
samma `frameTimes`**; stämmer något av det inte stannar det.

`score_round.py`, `subframe.py`, `crossing_selection.py`, `multiswing.py`, `envelope_audit.py`,
`e2_and_floor.py` och `hard_core.py` importeras och återanvänds; **ingenting är
återimplementerat.**

### Vad som är nytt i underlaget, och vad det kostar i paritet

Tidigare omgångar har bara behövt **posebanan**. Den här behöver också **skaftet**, eftersom det
är skaftpunkterna de tre mätvärdena räknar på. Därför:

- **`run_dense.py` (S-28) körs oförändrad** över alla 103 svingar: `shaft-v2.onnx` med
  produktionens egna trösklar på **varenda envelope-bildruta**. Resultat: **6 548 rader, samma
  6 548 bildrutor** som posebanan och registret — kontrollerat ruta för ruta, annars stannar
  skriptet.
- **Kroppsreferensen** (axlar och höfter, `fromDetection.ts`:s sex landmärken) hämtas ur den
  **varma** helklippsbanan med [e2_and_floor.py](e2_and_floor.py):s egen `build_warm`-konstruktion.
- **Serien** som produktionskoden får är svingens envelope-rutor, med faserna byggda runt
  kandidatrutan: `backswing` före, `top` (och `phaseSource: 'observed'`) på den,
  `downswing` efter. **Exakt en sak flyttar mellan två körningar av samma sving — vilken ruta som
  bär `top`.** Det är hela experimentet.
- **1 760 kandidatrutor** skickades till produktionskoden över 103 svingar.

> **Två val som är antaganden och inte mätningar, båda utskrivna här och i skriptet.**
>
> **(a) Händighet.** `handedness` står `unknown` på alla 103 svingar
> ([STATUS.md](../STATUS.md) §4), och `topShaftOrientation` **avvisar** en sving utan händighet
> innan den tittar på en bildruta. Med produktionens värde finns alltså **inget utfall att
> flytta** — mätningen hade varit 101 tysta rader. Körningen skickar därför `right`. Det är ett
> antagande. **Två svingar är bekräftat spegelvända** (`S32-075`, `S32-017`, båda `093.mp4`) och
> är fel under det; de är namngivna snarare än borttagna.
>
> **(b) Kameravinkel.** Serien får registrets `viewBucket`, alltså annotatörernas `view`.
> **Produktionen har den inte** — i appen är `cameraAngle` ofta `null`, och då blir
> `cameraGate` `uncertain` i stället för `rejected`. De **10 face-on-rader** som här är tysta med
> skälet `camera-angle-mismatch` skulle i appen i stället ge ett `shaft-position-p4`, flaggat.
> (`top-shaft-orientation` skulle ändå vara tyst där — den kräver händighet, som appen inte har.)
> Talen nedan står alltså på en *strängare* kameragrind än produktionens.

---

## 1. Bildrutefel → utfallsfel

**Populationen:** varje sving med ett E4-val och en detektorbana — **101 rader i 79 klipp**.
Den är större än de 91 med mänskligt spann, för fråga 1 behöver inget facit.

**Vad ett "utfall" är, per mätvärde:**

| mätvärde | utfall i produktionskoden | |
|---|---|---|
| `top-shaft-orientation` | `across-the-line` / `on-plane` / `laid-off` / `cannot-determine`, eller inget värde | **en riktig kategori** |
| `shaft-position-p4` | ett tal (kroppsrelativ position + `orientationDeg`), eller inget värde | **svar mot tystnad** |
| `shaft-angle-by-phase` → `top` | ett tal (cirkulär median), eller ingen hink | **svar mot tystnad** |

**Fördelningen på E4:s egen ruta** (n = 101), som är utgångsläget varje skift mäts mot:

| | |
|---|---|
| `top-shaft-orientation` | `laid-off` 38, `cannot-determine` 21, `across-the-line` 14, inget värde 28 (18 `phase-missing`, 10 `camera-angle-mismatch`) |
| `shaft-position-p4` | svar 73, inget värde 28 (18 + 10, samma rader) |
| `shaft-angle-by-phase` → `top` | svar 78, inget värde 23 (21 `shaft-point-missing`, 1 `degenerate-shaft`, 1 `no-usable-frames`) |

> `phase-missing` betyder här inte "ingen `top`-etikett" — den finns alltid, den är satt av
> experimentet. Den betyder att **kandidatrutan inte överlevde `plausibility.ts`**, så
> `topFrame()` inte hittade någon användbar `top`-ruta alls. Det är produktionens egen väg
> genom koden, inte en artefakt av uppställningen.

### Tabellen

Vänster block: alla rader med båda rutorna. Höger block: bara de rader där mätvärdet **faktiskt
svarar** på E4:s egen ruta — en rad som är tyst i båda ändarna kan per konstruktion inte byta
utfall och späder ut den vänstra andelen.

| skift | **TSO** byter / n | andel | TSO bland svarande | **P4** byter / n | andel | P4 bland svarande | **SABP-top** byter / n | andel | SABP bland svarande |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **−5** | 50 / 99 | 50,5 % | 36 / 72 (50,0 %) | 23 / 99 | 23,2 % | 9 / 72 (12,5 %) | 25 / 99 | 25,3 % | 10 / 77 (13,0 %) |
| **−3** | 43 / 99 | 43,4 % | 34 / 72 (47,2 %) | 17 / 99 | 17,2 % | 8 / 72 (11,1 %) | 18 / 99 | 18,2 % | 8 / 77 (10,4 %) |
| **−2** | 36 / 101 | 35,6 % | 27 / 73 (37,0 %) | 15 / 101 | 14,9 % | 6 / 73 (8,2 %) | 16 / 101 | 15,8 % | 7 / 78 (9,0 %) |
| **−1** | **23 / 101** | **22,8 %** | 16 / 73 (21,9 %) | **10 / 101** | **9,9 %** | 3 / 73 (4,1 %) | **11 / 101** | **10,9 %** | 4 / 78 (5,1 %) |
| **+1** | **22 / 101** | **21,8 %** | 19 / 73 (26,0 %) | **12 / 101** | **11,9 %** | 9 / 73 (12,3 %) | **14 / 101** | **13,9 %** | 9 / 78 (11,5 %) |
| **+2** | 29 / 101 | 28,7 % | 26 / 73 (35,6 %) | 14 / 101 | 13,9 % | 11 / 73 (15,1 %) | 15 / 101 | 14,9 % | 11 / 78 (14,1 %) |
| **+3** | 38 / 101 | 37,6 % | 31 / 73 (42,5 %) | 16 / 101 | 15,8 % | 9 / 73 (12,3 %) | 17 / 101 | 16,8 % | 9 / 78 (11,5 %) |
| **+5** | 48 / 101 | 47,5 % | 36 / 73 (49,3 %) | 20 / 101 | 19,8 % | 8 / 73 (11,0 %) | 24 / 101 | 23,8 % | 10 / 78 (12,8 %) |

*(n är 99 vid −5 och −3 därför att **2 rader** saknar rutan helt — E4 ligger så nära envelopens
början att den skiftade rutan hamnar utanför fönstret. Att mätvärdet då inte finns alls är också
ett utfallsbyte, men det räknas separat och inte in i täljaren.)*

**Kumulativt — minst ett av skiften inom ±k byter utfall:**

| | `top-shaft-orientation` | `shaft-position-p4` | `shaft-angle-by-phase` → `top` |
|---|---:|---:|---:|
| **inom ±1 ruta** | **37 av 101 (37 %)** | **20 av 101 (20 %)** | **23 av 101 (23 %)** |
| inom ±2 | 50 (50 %) | 27 (27 %) | 30 (30 %) |
| inom ±3 | 59 (58 %) | 32 (32 %) | 35 (35 %) |
| inom ±5 | 68 (67 %) | 39 (39 %) | 45 (45 %) |

### Vilken sorts byte det är

Ett byte kan vara två helt olika saker, och de väger inte lika. **(a)** kallat utfall → ett
*annat* kallat utfall: mätvärdet säger något annat om svingen. **(b)** svar → tystnad eller
tvärtom: mätvärdet slutar eller börjar svara.

| skift | byten totalt | (a) kallat → annat kallat | (b) svar ↔ tystnad | varav **teckenbyte** across ↔ laid-off |
|---:|---:|---:|---:|---:|
| −5 | 50 | 27 | 23 | **9** |
| −3 | 43 | 26 | 17 | 4 |
| −2 | 36 | 21 | 15 | 2 |
| **−1** | **23** | **13** | 10 | **0** |
| **+1** | **22** | **10** | 12 | **3** |
| +2 | 29 | 15 | 14 | 3 |
| +3 | 38 | 22 | 16 | 5 |
| +5 | 48 | 28 | 20 | 5 |

**Tre avläsningar.**

- **Majoriteten av bytena är riktiga omdömesbyten.** Vid −1 är 13 av 23 (57 %) kategori mot
  kategori. Det är inte ett mätvärde som blir försiktigt när rutan är fel — det är ett mätvärde
  som svarar lika självsäkert på något annat.
- **Teckenbytet, det grövsta felet mätvärdet kan göra, är sällsynt men inte noll.** 0 vid −1,
  3 vid +1, och 9 vid −5. Med n = 101 är 3 rader **3 %**; det är för litet för att bära en
  slutsats om orsak och för stort för att avfärda.
- **De två tysta mätvärdena rör sig hälften så mycket, och av en annan orsak.** Deras byten är
  per konstruktion bara svar↔tystnad, och de inträffar när grannrutan inte har en användbar
  skaftdetektion. 21 av de 23 tysta `top`-hinksraderna bär `shaft-point-missing`.

### Kontrollen: vad gör en störning som INTE är ett bildrutefel?

Det här är avsnittets viktigaste tabell, och den är inte en ny mätning — den är
[e2-and-floor.md](e2-and-floor.md) §4:s golv, läst i utfall i stället för i bildrutor.

| störning | rutan lika | `top-shaft-orientation` byter | `shaft-position-p4` | `shaft-angle-by-phase` → `top` |
|---|---:|---:|---:|---:|
| **E4 kall mot E4 varm** (samma modell, samma vikter, samma rutor) | 73 av 100 | **9 av 100 (9,0 %)** | 2 av 100 (2,0 %) | 2 av 100 (2,0 %) |
| **E3 mot E4** (E4 är E3:s egen bracket + interpolation; ≤ 1 ruta isär) | 45 av 101 | **13 av 101 (12,9 %)** | 6 av 101 (5,9 %) | 7 av 101 (6,9 %) |
| *jämför: **±1 ruta**, uppgiftens fråga* | — | *37 av 101 (37 %)* | *20 av 101 (20 %)* | *23 av 101 (23 %)* |

**Läst rakt:** en störning som inte borde betyda någonting — bytet av spårartillstånd —
flyttar `top-shaft-orientation`:s utfall på var elfte sving. Valet mellan E3 och E4, två
estimatorer som per konstruktion inte kan vara oense om mer än avrundningen, flyttar det på var
åttonde. **Kurvan börjar inte vid noll när bildrutefelet är noll.**

### Och kvalitetsnivån, den andra utfallsaxeln i koden

`usable` / `uncertain` / `rejected` är den enda andra utfallsliknande storhet produktionen bär.
Den byter på ungefär hälften så många rader som kategorin:

| skift | TSO och P4 | SABP-top (hinkens egen nivå) |
|---:|---:|---:|
| −5 | 24 / 99 | 26 / 99 |
| −3 | 20 / 99 | 20 / 99 |
| −2 | 17 / 101 | 18 / 101 |
| **−1** | **11 / 101** | **12 / 101** |
| **+1** | **14 / 101** | **16 / 101** |
| +2 | 15 / 101 | 17 / 101 |
| +3 | 19 / 101 | 21 / 101 |
| +5 | 30 / 101 | 33 / 101 |

TSO och P4 är identiska här, som de ska vara: båda ärver samma bildrutas `shaftAngle`-flagga.

### Duger E4?

**Frågan har nu ett mätt svar, och det är att frågan är felställd.** E4:s uppmätta fel mot
människorna är **\|median\| 1 bildruta** ([hard-core.md](hard-core.md) §1). En bildruta byter
`top-shaft-orientation`:s utfall på **22 % av raderna**. Men samma mätvärde byter utfall på
**9 %** när ingenting alls ändras utom spårartillståndet, och på **13 %** när man byter mellan
två estimatorer som delar bracket. **Det är inte E4 som är för dålig — det är mätvärdet som inte
har en reproducerbar utgångspunkt att vara bra mot.** En estimator som läser den här posebanan
ärver alltså ett utfallsgolv på **9 %** från spårartillståndet ensamt, innan den gjort något fel
alls. Vad ett *annat* sorts underlag skulle ge är omätt.

---

## 2. Samma test mot människorna

Ingen estimator inblandad. Toppen sätts på bedömarens **första** och **sista** ruta, och frågan
är om utfallet skiljer sig mellan de två. Räcker en bedömares eget spann för att vända ett utfall
är mätvärdet för känsligt oavsett estimator.

| intervall | mätvärde | n rader | byter | andel | bland de svarande | intervallbredd (median) |
|---|---|---:|---:|---:|---:|---:|
| **Erik** | `top-shaft-orientation` | 93 | **11** | **11,8 %** | 11 av 67 (16,4 %) | 2 |
| | `shaft-position-p4` | 93 | 3 | 3,2 % | 3 av 67 (4,5 %) | 2 |
| | `shaft-angle-by-phase` → `top` | 93 | 4 | 4,3 % | 3 av 72 (4,2 %) | 2 |
| **Lisa** | `top-shaft-orientation` | 95 | **11** | **11,6 %** | 11 av 68 (16,2 %) | 2 |
| | `shaft-position-p4` | 95 | 6 | 6,3 % | 6 av 68 (8,8 %) | 2 |
| | `shaft-angle-by-phase` → `top` | 95 | 6 | 6,3 % | 6 av 73 (8,2 %) | 2 |
| **spannet (unionen)** | `top-shaft-orientation` | 91 | **12** | **13,2 %** | 12 av 66 (18,2 %) | 2 |
| | `shaft-position-p4` | 91 | 5 | 5,5 % | 5 av 66 (7,6 %) | 2 |
| | `shaft-angle-by-phase` → `top` | 91 | 5 | 5,5 % | 5 av 71 (7,0 %) | 2 |

**Nämnaren har ett hål som måste stå bredvid talen:** **24 av Eriks 93 rader, 14 av Lisas 95 och
3 av unionens 91** har ett intervall på **en enda ruta**, och de kan per konstruktion inte byta
någonting. Erikssiffran är alltså räknad på en nämnare där en fjärdedel är utesluten på förhand —
vilket gör 11 av 93 till en **underskattning**, inte tvärtom.

### Raderna, mot unionen (n = 12)

| id | klipp | utfall på spannets första ruta | på dess sista | bredd |
|---|---|---|---|---:|
| S32-011 | 090.mp4 | `cannot-determine` | inget värde (`phase-missing`) | 3 |
| S32-018 | 089.mp4 | `laid-off` | inget värde (`phase-missing`) | 2 |
| S32-027 | 074.mp4 | **`across-the-line`** | **`on-plane`** | 2 |
| S32-031 | 062.mp4 | `cannot-determine` | `laid-off` | 6 |
| S32-034 | 061.mp4 | `laid-off` | `cannot-determine` | 3 |
| S32-040 | 053.mp4 | `cannot-determine` | `laid-off` | 3 |
| S32-045 | 075.mp4 | `cannot-determine` | `laid-off` | 3 |
| S32-060 | 090.mp4 | **`on-plane`** | **`across-the-line`** | 2 |
| S32-066 | 068.mp4 | `laid-off` | inget värde (`phase-missing`) | 8 |
| S32-082 | 096.mp4 | `laid-off` | inget värde (`phase-missing`) | 2 |
| S32-084 | 054.mp4 | `cannot-determine` | `laid-off` | 2 |
| S32-100 | 088.mp4 | inget värde (`phase-missing`) | `across-the-line` | 2 |

**Fem av tolv går mellan `cannot-determine` och en kallad riktning, i båda riktningarna**
(`S32-031`, `S32-034`, `S32-040`, `S32-045`, `S32-084`). Det är precis den gräns
[STATUS.md](../STATUS.md) §2 beskriver som *"gränsens skärpa, inte dess läge"*:
`NEAR_VERTICAL_GATE_DEG` är en skarp linje genom ett brusband, och två rutor räcker för att korsa
den. **Två rader byter mellan `across-the-line` och `on-plane`** (`S32-027`, `S32-060`) —
`ON_PLANE_BAND_DEG`:s kant, samma problem i andra änden av skalan. De återstående **fem** går
mellan svar och tystnad. **Ingen enda rad byter tecken** inom ett mänskligt intervall; det kräver
mer än två rutor.

**Slutsatsen är oberoende av varje estimator.** Två människor som är eniga om svingen ger olika
utfall beroende på vilken ruta i sitt *eget* intervall man frågar, på 12–18 % av raderna. **Det
är ett tak för vad `top-shaft-orientation` kan avkrävas, och det ligger ovanför E4:s fel.**

---

## 3. E4 mot facit, i utfall

Toppen sätts på **mitten av det mänskliga spannet** (unionens mitt, halv-upp avrundad — den
generösaste läsningen av "mitt i människornas intervall") och jämförs med E4:s varma val.
n = **91 rader i 73 klipp**.

| mätvärde | samma utfall | andel |
|---|---:|---:|
| `top-shaft-orientation` | **65 av 91** | **71,4 %** |
| `shaft-position-p4` | **79 av 91** | **86,8 %** |
| `shaft-angle-by-phase` → `top` | **79 av 91** | **86,8 %** |

**Uppdelat på om E4 låg inne i spannet** (uppdelningen är gjord på svaret, inte på något som
mättes efteråt):

| mätvärde | E4 | n | samma utfall | andel |
|---|---|---:|---:|---:|
| `top-shaft-orientation` | **inne** | 44 | 38 | **86,4 %** |
| | utanför | 47 | 27 | **57,4 %** |
| `shaft-position-p4` | inne | 44 | 40 | 90,9 % |
| | utanför | 47 | 39 | 83,0 % |
| `shaft-angle-by-phase` → `top` | inne | 44 | 40 | 90,9 % |
| | utanför | 47 | 39 | 83,0 % |

**Tre saker måste stå bredvid 71 % och 87 %, annars läses de fel.**

1. **Det är inte ett bättre betyg på E4 än 48 %.** Det är ett *annat* mått. Att ligga utanför
   spannet och ändå ge samma utfall betyder bara att mätvärdet var okänsligt just där — i
   `cannot-determine`-zonen, eller på en rad som är tyst i båda ändarna. **Där mätvärdet *är*
   känsligt faller träffen till 57 %.**
2. **12 av de 26 skiljande raderna för `top-shaft-orientation` är svar↔tystnad**, inte fel
   riktning. 14 är kallat mot kallat, och **4 av dem är rena teckenbyten** (`S32-009`,
   `S32-012`, `S32-063`, `S32-100` — across-the-line mot laid-off). **4 av 91 är 4 %**, och
   det är den siffra ett nedströmsråd faktiskt skulle bära.
3. **För `shaft-position-p4` och `top`-hinken är *varenda* skiljande rad svar↔tystnad.** De 12
   raderna är identiska mellan de två mätvärdena. 87 % betyder alltså "lika ofta tyst", inte
   "lika ofta rätt" — och det är allt de två mätvärdena kan säga utan en tröskel.

### `top-shaft-orientation`: de 26 raderna

| id | klipp | E4:s utfall | mitt i spannet | rutor isär |
|---|---|---|---|---:|
| S32-009 | 082.mp4 | **`across-the-line`** | **`laid-off`** | −2 |
| S32-011 | 090.mp4 | `cannot-determine` | inget värde | −1 |
| S32-012 | 037.mp4 | **`across-the-line`** | **`laid-off`** | −3 |
| S32-017 | 093.mp4 | `across-the-line` | inget värde | −4 |
| S32-018 | 089.mp4 | `laid-off` | inget värde | −1 |
| S32-027 | 074.mp4 | `across-the-line` | `on-plane` | −1 |
| S32-028 | 046.mp4 | inget värde | `across-the-line` | −4 |
| S32-029 | 095.mp4 | `cannot-determine` | inget värde | +3 |
| S32-034 | 061.mp4 | `laid-off` | `cannot-determine` | −2 |
| S32-042 | 032.mp4 | `across-the-line` | inget värde | −4 |
| S32-043 | 002.mp4 | `cannot-determine` | `across-the-line` | +1 |
| S32-044 | 092.mp4 | `laid-off` | inget värde | −4 |
| S32-045 | 075.mp4 | `cannot-determine` | inget värde | −1 |
| S32-060 | 090.mp4 | `cannot-determine` | `across-the-line` | −3 |
| S32-063 | 090.mp4 | **`across-the-line`** | **`laid-off`** | −3 |
| S32-066 | 068.mp4 | `laid-off` | inget värde | −5 |
| S32-075 | 093.mp4 | `across-the-line` | inget värde | −4 |
| S32-079 | 095.mp4 | `laid-off` | inget värde | +2 |
| S32-080 | 080.mp4 | `laid-off` | `cannot-determine` | −17 |
| S32-082 | 096.mp4 | `laid-off` | inget värde | −1 |
| S32-084 | 054.mp4 | `cannot-determine` | `laid-off` | −1 |
| S32-086 | 088.mp4 | `cannot-determine` | `on-plane` | −3 |
| S32-096 | 090.mp4 | `cannot-determine` | `across-the-line` | −3 |
| S32-098 | 007.mp4 | `cannot-determine` | `across-the-line` | −3 |
| S32-100 | 088.mp4 | **`laid-off`** | **`across-the-line`** | −3 |
| S32-101 | 087.mp4 | `cannot-determine` | `across-the-line` | +1 |

**Sju av de 26 ligger en enda ruta isär** (`S32-011`, `S32-018`, `S32-027`, `S32-043`,
`S32-045`, `S32-082`, `S32-101`), och fyra av dem byter mellan tystnad och ett kallat utfall. `090.mp4` bidrar med tre rader och `093.mp4`, `095.mp4` och `088.mp4` med två var — 9 av
26 rader i fyra klipp, vilket är skälet till att klippet är den oberoende enheten.
**`S32-017` och `S32-075` är de två bekräftat spegelvända raderna**, där den antagna
högerhändigheten är fel; båda skiljer sig genom tystnad och inte genom riktning, så antagandet
bär ingen av dem.

---

## 4. De 4 oförklarade raderna i kärnan

Kärnan (31 rader), ankarmängden (23) och växlingsmängden (32) är
[hard_core.py](hard_core.py):s och [e2_and_floor.py](e2_and_floor.py):s egna funktioner,
**importerade — ingenting är omräknat här**. Kvar utan någon av de två förklaringarna:
**4 rader i 4 klipp — `S32-009`, `S32-013`, `S32-023`, `S32-080`.**

**Beskrivning, inga slutsatser.** Varje rad visar handledsmittpunktens `y` (andel av bildhöjden;
*lägre* = händerna högre upp i bild) och den oglättade `v_y`, i ett fönster som sträcker sig fyra
rutor utanför spannet åt vardera hållet. `###` markerar spannet.

### `S32-009` — `082.mp4`, 42 rutor (1,367 s), spann **15–16**, kontroll

E1 14 (−1) · E2 17 (+1) · E3 14 (−1) · E4 14 (−1) · ankarrutor 14–15 · växling `j=13` → `[14,15]`, **inne**

| ruta | 11 | 12 | 13 | 14 | **15** | **16** | 17 | 18 | 19 | 20 | 21 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| y | 0,2521 | 0,2173 | 0,2101 | **0,2049** | 0,2093 | 0,2106 | 0,2135 | 0,2144 | 0,2190 | 0,2543 | 0,3305 |
| v_y | −0,585 | −0,630 | −0,186 | −0,013 | +0,086 | +0,063 | +0,058 | +0,083 | +0,598 | +1,673 | +1,545 |
| spann | | | | | ### | ### | | | | | |

**Vad som händer:** allt fungerar. Växlingen finns, den överlappar spannet, ankaret finns, och
E3/E4 väljer den. Minsta `y` — den högsta handpositionen — ligger på **ruta 14**, en ruta före
Lisas intervall och två före Eriks. Interpolationen landar mellan 14 och 15 och rundar till 14.
**Raden är i kärnan därför att E2 ligger +1 och de tre andra −1 kring ett spann som är två rutor
brett.** Erik svarade `16–16`, Lisa `15–16`; hade Erik tagit med ruta 15 hade E2 träffat, hade
avrundningen gått åt andra hållet hade E3/E4 träffat. Mätvärdena svarar: `across-the-line`,
och båda talen finns.

### `S32-013` — `057.mp4`, 69 rutor (2,267 s), spann **29–30**, utan säkert nedslag

E1 28 (−1) · E2 58 (+28) · E3 3 (**−26**) · E4 3 (**−26**) · ankarrutor 28–29 · **sju** oarmade växlingar, varav `j=27` → `[28,29]` är den inne

| ruta | 25 | 26 | 27 | 28 | **29** | **30** | 31 | 32 | 33 | 34 | 35 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| y | 0,3664 | 0,3595 | 0,3567 | **0,3439** | 0,3545 | 0,3607 | 0,3535 | 0,3595 | 0,3673 | 0,4281 | 0,5027 |
| v_y | −0,165 | −0,146 | −0,234 | −0,032 | +0,252 | −0,016 | −0,017 | +0,207 | +1,029 | +2,030 | +1,479 |
| spann | | | | | ### | ### | | | | | |

**Vad som händer:** den rätta växlingen finns vid `j=27`, direkt vid spannets kant, och E2:s
ankarmängd pekar på 28–29. Men E3 armar och löser ut **26 rutor tidigare**, vid `j=2` — och
`e3_signflip` returnerar den **första** växling som klarar hysteresen, inte den största. Det är
[crossing-selection.md](crossing-selection.md) §2:s yttersta rad, oförändrad varmt. Notera också
vad banan gör inne i spannet: händerna står högst vid **28**, sjunker till **30** (y 0,3439 →
0,3607), **stiger igen till 31** (0,3535) och sjunker sedan. `v_y` byter tecken tre gånger på
fyra rutor: +0,252 · −0,016 · −0,017 · +0,207.
Mätvärdena svarar `laid-off` och båda talen, på ruta 3 — 26 rutor från där människorna tittade.

### `S32-023` — `073.mp4`, 124 rutor (4,100 s), spann **78–85**, lång envelope, utan säkert nedslag, kontroll

E1 76 (−2) · E2 105 (+20) · E3 77 (−1) · E4 77 (−1) · ankarrutor 77–90 (14 st) · växling `j=76` → `[77,78]`, **inne**

| ruta | 74 | 75 | 76 | 77 | **78** | **81** | **85** | 86 | 88 | 90 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| y | 0,4863 | 0,4866 | **0,4860** | 0,4861 | 0,4861 | 0,4863 | 0,4879 | 0,4882 | 0,4890 | 0,4914 |
| v_y | −0,006 | −0,004 | −0,009 | +0,002 | +0,004 | +0,009 | +0,013 | +0,007 | +0,022 | +0,024 |

**Vad som händer:** ingenting mätbart. Över hela fönstret på 17 rutor varierar `y` med **0,0054
bildhöjder** — jämför `S32-009`:s 0,1256 och `S32-080`:s 0,1846 i lika breda fönster. `v_y` ligger
på ±0,01, alltså i storleksordningen tusendelar av en bildhöjd per sekund. **Det här är
[top-from-pose.md](../top-from-pose.md):s rad 12 — handhöjdsplatån på 0,8 s, sedd i tal:** samma
sving, samma platå. Växlingen vid `j=76` är formellt inne och E4 landar på 77 — en ruta före
Lisas 78 och fem före Eriks 82. **Ankarmängden är 14 rutor** mot rundans median 6 ([e2-and-floor.md](e2-and-floor.md) §3), och
E2 landar ändå +20. Mätvärdena svarar **ingenting**: kandidatrutan bär ingen användbar skaftdetektion
(`shaft-point-missing`), så `topFrame()` faller på `phase-missing`.

### `S32-080` — `080.mp4`, 57 rutor (1,867 s), spann **31–33**

E1 48 (+15) · E2 20 (−11) · E3 14 (**−17**) · E4 15 (**−16**) · ankarrutor 30–35 (6 st) · fyra oarmade växlingar, varav `j=30` → `[31,32]` är den inne

| ruta | 27 | 28 | 29 | 30 | **31** | **32** | **33** | 34 | 35 | 36 | 37 | 38 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| y | 0,3087 | 0,3038 | 0,2611 | 0,2479 | **0,2443** | 0,2471 | 0,2536 | 0,2707 | 0,3060 | 0,3578 | 0,4268 | 0,4289 |
| v_y | −0,508 | −0,714 | −0,838 | −0,252 | −0,013 | +0,140 | +0,355 | +0,785 | +1,306 | +1,812 | +1,067 | +0,451 |

**Vad som händer:** banan är läroboksmässig kring spannet — monotont uppåt till ruta 31, minsta
`y` exakt på spannets första ruta, sedan monotont nedåt. Växlingen vid `j=30` ligger precis rätt.
Men E3 armar och löser ut vid `j=13`, **17 rutor tidigare**, på en tidigare vändning som
[crossing-selection.md](crossing-selection.md) §2 beskrev som brantare och med 2–8 gånger mindre
amplitud efter sig. Samma mekanism som `S32-013`. Mätvärdena svarar `laid-off` och båda talen —
på ruta 15.

### Vad de fyra har gemensamt, sagt utan att dra en slutsats

**Två mönster, två rader var, och de är varandras motsatser.** `S32-013` och `S32-080` har en
korrekt växling som E3 aldrig når, därför att sökningen tar den *första* armade och inte den
närmaste. `S32-009` och `S32-023` har rätt växling **och** rätt val — de ligger i kärnan därför
att spannet är två rutor brett och avrundningen respektive brusnivån äter upp marginalen.
**n = 4 rader i 4 klipp. Ingen regel dras, ingen estimator föreslås, och ingen har öppnat en enda
bildruta ur något av de fyra klippen.**

---

## 5. 3,0-buggens spridning — var etiketten är fel, och vad som rättades

### Först: reproduktionen av identiteten

Innan en etikett rättas måste påståendet som motiverar rättelsen stå. Samma mätning som
[hard-core.md](hard-core.md) §5, på samma 103 svingar — **skriptet stannar om den inte
reproducerar**:

| | |
|---|---:|
| `slowmo` | **15** av 103 |
| `suspectMultiSwing` | **15** |
| envelope > 3,0 s | **15** |
| `slowmo` == `suspectMultiSwing` | **JA** |
| `slowmo` == (envelope > 3,0 s) | **JA** |

`deriveSlowmo(envelopeDurationSec, 'auto')` är `envelopeDurationSec > SLOWMO_ENVELOPE_THRESHOLD_SEC`
(`slowmo.ts:28`, `:57`), och registret tar `slowmo` rakt ur exportmanifestet
(`build_round.py:165`). **Varje uppdelning någon runda gjort på `slow-mo` är alltså en uppdelning
på `envelopeDuration > 3,0 s`.**

### Var det står, dokument för dokument

Åtta rapporter, S-31 till S-38. Varje rad nedan är ett ställe där ordet namngav en **uppdelning**
(inte ett kodkonstantnamn). **Alla är rättade; siffrorna är orörda.**

| dokument | S | rättade ställen | vad som ändrades |
|---|---|---:|---|
| [top-from-pose.md](../top-from-pose.md) | S-31 | **6** | tabellrubrik i kandidattabellen; "den enda slow-mo-svingen bland de sex" (×2); "n = 1 slow-mo bland sex"; kovariatposten *Slow-mo* → *Lång envelope (> 3,0 s)*; "ett slow-mo står för hela den dåliga svansen" |
| [resultat.md](resultat.md) | S-32 | **7** | uppdelningsraden i §2:s tabell; "Slow-mo vidgar spannet"; `S32-074`-parentesen i §5; uppdelningsraden i §6:s tabell; "Slow-mo ser bättre ut än det är"; pass 2:s sammansättning; breddförändringen |
| [subframe.md](subframe.md) | S-33 | **7** | kolumnrubriken i §7:s svanstabell; "6 av 10 är slow-mo"; "Att slow-mo dominerar"; tre klippparenteser i §8:s kontrolltabell; "båda slow-mo … slow-mo är just där spannet är bredast" |
| [crossing-selection.md](crossing-selection.md) | S-34 | **5** | kolumnrubriken i §3:s kovariattabell; "Slow-mo samlas i *ingen kandidat träffar*"; tre klippparenteser i §4:s tabell |
| [multiswing.md](multiswing.md) | S-35 | **8** | `S32-092`:s beskrivning i kort svar; tre klippparenteser i del A:s tabell; "Fem utflykter i en 8,5 s slow-mo-envelope"; "svansen är slow-mo-tung"; `S32-074`:s envelopeparentes; punktlistan om `001.mp4` |
| [envelope-audit.md](envelope-audit.md) | S-36 | **12** | "de 16:s slow-mo-svingar" + "i slow-mo är stillhet och toppen samma avläsning"; `sm`-förklaringen; **två** avsnittsrubriker *Slow-mo, utbrutet*; två tabellrubriker; två tabellrader; "Slow-mo lutar åt kantfallen"; "en slow-mo-inspelning där händerna lyfts"; "I slow-mo är mekanismen läsbar"; "En slow-mo-baksving"; "Men slow-mo är inte i sig felet" |
| [e2-and-floor.md](e2-and-floor.md) | S-37 | **6** | kort svar 5; strykpost 5 i §4; "samma 6 rader som slow-mo fångar"; "samma aritmetik resultat.md §6 skrev om slow-mo"; "`suspectMultiSwing` ÄR slow-mo-flaggan" + "Slow-mo har rundan splittat på"; "alla slow-mo eller kapad svans" i §5 |
| [hard-core.md](hard-core.md) | S-38 | **7** | fem flaggceller i §2:s kärntabell; den binära kovariatraden i §3; kovariatmeningen under den |
| [STATUS.md](../STATUS.md) | — | **2** | S-33- och S-36-sammanfattningarna i §3 (samma uppdelningar, refererade) |

**Varje dokument har fått ett rättelseblock** direkt efter sitt huvud, som säger vad etiketten
betyder, att siffrorna står, och var originalordalydelsen finns (git-historiken före den här
rättelsen). **Ingen historik är raderad.**

### Vad som INTE ändrades, och varför

- **Kodnamn.** `slowmo` (fältet), `SLOWMO_ENVELOPE_THRESHOLD_SEC`, `SLOWMO_FRAME_CAP_FRAC`,
  `slowmoMode`, `force-slowmo`/`force-normal`. De heter så i koden och ska citeras så.
- **[hard-core.md](hard-core.md) §5 självt.** Det är diagnosen av buggen; där *ska* ordet
  "slow-mo" stå, eftersom hela avsnittet handlar om att det är fel namn.
- **Commit-titeln `derive slow-motion per swing from envelope duration`** i §5:s
  tidslinjetabell. Den är ett citat.
- **Inga siffror.** Inte en enda. Den enda ändring som rör något annat än ett ord är
  [envelope-audit.md](envelope-audit.md) §5:s mening *"ligger också alla över
  `MAX_ENVELOPE_SEC`"*, som fått en bisats om att de **måste** ligga där — flaggan *är* den
  gränsen. Iakttagelsen var sann och tom; nu står det varför.

### Vad rättelsen gör med slutsatserna

**Riktningen håller överallt, orsaksnamnet gör det inte.** Två ställen läser annorlunda efteråt,
och båda nämns för att en läsare annars drar fel växel:

1. **[subframe.md](subframe.md) §7: "svansens starkaste signal är slow-mo" är ett påstående om
   envelopelängd.** E2 går bakåt från envelopens snabbaste ruta; en **lång** envelope har fler
   rutor efter nedslaget att gå bakåt ifrån. Sambandet är nästan mekaniskt när etiketten är rätt,
   och det var det inte när etiketten löd "filmhastighet".
2. **[envelope-audit.md](envelope-audit.md) §5:s "slow-mo är inte i sig felet"** var redan rätt
   slutsats av fel skäl. Att de långa envelopesen i de övriga 65 klippen *"också alla ligger över
   `MAX_ENVELOPE_SEC`"* är inte en observation — det följer av definitionen.

**Ingen fix föreslås.** Vilket av de två begreppen som borde byta storhet, och vilket värde det i
så fall skulle ha, är fortfarande inte utrett — precis som [hard-core.md](hard-core.md) §5 skrev.

---

## Vad som INTE mättes

- **Ingen ny estimator, ingen tröskel, ingen klassificerare, ingen kalibrering, inget skift,
  ingen produktionskod skriven.** S-30:s spärr ligger kvar. Fråga 1–3 mäter utfallsbyten och
  sätter ingen gräns på något; fråga 4 beskriver fyra rader och drar ingen slutsats.
- **Två av tre mätvärden har inget pass/fail att byta.** `shaft-position-p4` och `top`-hinken
  returnerar tal som ingen regel i `src/` läser. Allt som kan mätas för dem utan att uppfinna en
  tröskel är svar↔tystnad, och det är vad som står. **Den dag en regel skrivs ovanpå dem måste
  den här mätningen göras om**, och då med regelns egen gräns.
- **Produktionsvägen kör inte detektorn tätt.** `shaftDetector.ts` är byggd för de ~20 bildrutor
  `selectEnvelopeFrames` redan valt, inte för varje videobildruta. **Ett ±1-rutors skift är inte
  ens representerbart på det rutnätet** — där är grannrutan flera rutor bort, alltså närmare
  ±3/±5-raderna i §1. Den här omgången kör `run_dense.py`:s konfiguration (S-28), inte
  produktionens, och det är en avvikelse utöver dem som redan står listade.
- **Plausibilitetens grannskapstest arbetar på ett tätare rutnät än produktionens.**
  `MAX_GAP_SEC = 1,0` och `FLIP_MIN_DEG = 90` är skrivna för serier med ~0,3 s mellan rutor; här
  är avståndet 0,033 s. Flaggningsregimen är alltså en annan än appens. **Inte mätt hur mycket.**
- **Händighet och kameravinkel är antaganden**, båda utskrivna i §0. `right` på alla 103 (två
  bekräftat spegelvända rader är fel under det), och registrets `viewBucket` där produktionen
  ofta har `null`.
- **De övriga paritetsavvikelserna står kvar.** 15 fps mot 30, WASM/GPU-delegat mot python-CPU,
  sökning per sampel mot sekventiell avkodning, `run_dense.py`:s JPEG-omkodning per bildruta,
  plus [top-from-pose.md](../top-from-pose.md):s fem. **Ingen av dem är mätt.**
- **Vad ett utfallsbyte kostar användaren.** Det finns ingen regel, inget råd och ingen yta som
  läser något av de tre mätvärdena. Att 22 % av raderna byter kategori vid en bildrutas fel är ett
  mått på mätvärdet, **inte** ett mått på produkten — den kopplingen finns inte att mäta än.
- **Resten av det kalla biblioteket är fortfarande inte omräknat.** LOCO-skiftet, interpolationens
  +12 rader, kandidatanalysen, svansraderna, tystnadstalet. Oförändrat sedan
  [hard-core.md](hard-core.md).
- **Ingen har öppnat en enda bildruta.** Samma begränsning som hela spåret. `054.mp4`:s 86 rutor
  ligger utrullade sedan S-34 och är fortfarande otittade, och inget av de fyra klippen i §4 är
  sett.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena. Oförändrat sedan
  S-32.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1), `opencv-python` (5.0.0), `numpy` (2.4.6) och
**`onnxruntime` (1.30.0)**, samt `public/models/pose_landmarker_lite.task`
(`npm run pose:model`), `public/models/shaft-v2.onnx` och `node_modules/` (`npm install` — TS-bryggan
byggs med `node_modules/.bin/esbuild`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. envelopebanorna (den KALLA korningen) -- kontrollraden och golvkontrollen i section 1, ~15 min
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. helklippsbanorna (den VARMA) -- huvudunderlaget, ~30 min for 81 klipp
<venv>/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py <tmp>/clippose

# 4. skaftdetektorn pa varje envelope-bildruta, ~9 min for 6 548 rutor
training/.venv/Scripts/python.exe docs/shaft/top-from-dense-signal/run_dense.py <tmp>/dense \
    --manifests <tmp>/export_manifests.json

# 5. den har matningen (--section: f1 | f2 | f3 | f4 | f5 | all)
<venv>/Scripts/python.exe docs/shaft/top-review/verdict_sensitivity.py <tmp>/pose \
    --clipPoseDir <tmp>/clippose --denseDir <tmp>/dense --work <tmp>/work --section all
```

`verdict_sensitivity.py` skriver bara till stdout; `--work` används för TS-bryggan och dess
indata. **Läs kontrollraden överst:** stämmer den inte med [resultat.md](resultat.md),
[subframe.md](subframe.md), [crossing-selection.md](crossing-selection.md),
[multiswing.md](multiswing.md), [envelope-audit.md](envelope-audit.md),
[e2-and-floor.md](e2-and-floor.md) och [hard-core.md](hard-core.md) har underlaget drivit och
inget här gäller. Skriptet stannar också om detektorbanan inte är registrets egna `frameTimes`,
om `verdict_outcomes.ts` inte längre bygger mot `src/lib/shaft/measure/`, eller om
flaggidentiteten i §5 inte reproducerar.
