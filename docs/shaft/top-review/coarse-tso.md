# Grov läsning av toppens skaftriktning — den stabiliserar inte, och grinden blir sämre (S-41, diagnos)

> 2026-09-20, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering applicerad, inget skift infört, ingen ändring i S-30:s spärr
> och ingen produktionskod skriven.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är orörda — de är **importerade och anropade** genom
> [verdict_outcomes.ts](verdict_outcomes.ts), aldrig återimplementerade. S-39:s brygga och
> `verdict_sensitivity.py` är **oförändrade**: den här omgången skriver ingen egen brygga, den
> **importerar och anropar** deras `payload_for`, `load_dense`, `clip_landmarks`, `build_bridge`,
> `run_bridge` och `verdict`.
>
> **VAD "GROVT" ÄR, EXAKT.** Det är en **ometikettering av det produktionen redan svarat**, gjord
> i efterhand av [coarse_tso.py](coarse_tso.py). Bandet avgör fortfarande `on-plane` och spärren
> fortfarande `cannot-determine`, inne i `src/lib/shaft/measure/`, oförändrade. Det enda som
> händer är att utfall slås ihop till färre hinkar **innan de jämförs**. En sammanslagning kan
> därför per konstruktion bara **ta bort** byten, aldrig lägga till ett — skriptet **stannar** om
> någon rad byter grovt utan att byta fint, och den fina raden står utskriven bredvid varje grov.
>
> **FÖRUTSÄTTNING, lämnad i uppgiften och inte vald här: allt mäts VARMT** — på
> [run_pose_clip.py](run_pose_clip.py):s helklippsbanor, den konfiguration
> [e2-and-floor.md](e2-and-floor.md) §1 visade att produktionen kör. Den **kalla** körningen laddas
> för två ändamål, båda utskrivna: kontrollraden, och fråga 1:s kall/varm-störning, där den kalla
> spåraren är *störning* och inte facit.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md),
> [crossing-selection.md](crossing-selection.md), [multiswing.md](multiswing.md),
> [envelope-audit.md](envelope-audit.md), [e2-and-floor.md](e2-and-floor.md),
> [hard-core.md](hard-core.md), [verdict-sensitivity.md](verdict-sensitivity.md) och
> [windowed-tso.md](windowed-tso.md) lästes först, så risken här är inte mätfel — den är
> anpassning. Därför: **ingen parameter svept, ingen justerad, ingenting valt.** Den grova
> läsningen är uppgiftens egen; den fina är S-39:s egen `verdict`, anropad. E4 är
> [subframe.py](subframe.py):s egen bracket plus interpolation, oförändrad. Intervallen är
> bedömarnas egna.
>
> Skript: [coarse_tso.py](coarse_tso.py) (skriver bara till stdout). **Underlaget ligger nu under
> `data/shaft/top-review/`** (gitignorerat) i stället för i `<tmp>` — se *Kör om*.

## Kort svar

**1. Grovheten köper nästan ingenting.** Under de tre störningar S-39 mätte byter
`top-shaft-orientation` utfall på **9 → 9 av 100** (kall mot varm spårare), **12 → 11 av 91**
(spannets ändar) och **13 → 11 av 101** (E3 mot E4). Erik ensam: **11 → 11 av 93**. Lisa:
**11 → 10 av 95**. **Tvåvägsläsningen ger exakt samma täljare som trevägs i alla fem raderna.**
Och läst *bland de svarande* — läsningens egen nämnare — blir grovheten **sämre**: spannet går från
18,2 % (12 av 66) till **20,4 %** (11 av 54) trevägs och **20,8 %** (11 av 53) tvåvägs, därför att
nämnaren faller snabbare än täljaren.

**2. Hela den lilla vinsten kommer från EN sammanslagning, och det är inte den man tror.** En
kontrolläsning som slår ihop *bara tystnadsskälen* och låter `cannot-determine` stå kvar ger
**identiskt samma tal som den fina läsningen i varenda cell** (9 / 11 / 11 / 12 / 13). Att slå ihop
`phase-missing` med `camera-angle-mismatch` tar alltså bort **noll** byten. Allt som grovheten
vinner är att `cannot-determine` flyttas till tystnadssidan — och det är precis det som gör fråga
4:s svar negativt.

**3. Det instabila är varken kategoriupplösningen eller riktningen — det är tystnadskanten.**
**Rena teckenbyten across ↔ laid-off är 0 under samtliga fem störningar** (n = 100, 93, 95, 91,
101). Uppgiftens iakttagelse vid −1 ruta håller alltså mycket bredare än så. Men av spannets elva
kvarvarande grova byten går **nio mellan tystnad och en kallad riktning** och två mellan `across`
och `on-plane`. **Grovheten tar bort de byten som ligger mellan två sätt att tiga; den rör inte de
byten som ligger mellan att tiga och att tala, och det är de som är nästan alla.**

**4. Priset är 40 av 91 rader.** På E4:s egen ruta förlorar **40 av 91 rader i 33 av 73 klipp
(44 %)** en distinktion den fina kategorin bar: 20 rader var `cannot-determine`, 13
`phase-missing`, 7 `camera-angle-mismatch`. De tre betyder tre olika saker för en spelare — *"din
topp är för upprätt för att ha en sida"*, *"vi hittade inte klubban i bildrutan"* och *"du filmade
framifrån"* — och bara den första är en egenskap hos svingen. **Trevägs och tvävägs kostar exakt
lika mycket här**, eftersom `on-plane` aldrig inträffar på E4:s ruta (0 av 91) och bara på **20 av
1 756** besvarade kandidatrutor i hela rundan (1,1 %). **Mellankategorin är i praktiken tom.**

**5. Mot facit vinner grovheten 3 rader: 65 → 68 av 91 (71,4 % → 74,7 %), tvåvägs 69 (75,8 %).**
n = 91 rader i 73 klipp. Där E4 låg **inne** i spannet: 38 → 40 av 44 (86,4 % → 90,9 %). **Utanför:**
27 → 28 av 47 (57,4 % → 59,6 %), tvåvägs 29 (61,7 %). Kontrolläsningen med `cannot-determine` kvar
ger **65 av 91**, alltså oförändrat. Av de 23 rader som fortfarande skiljer sig är **4 riktiga
teckenoenigheter** (`S32-009`, `S32-012`, `S32-063`, `S32-100`) — samma fyra som S-39 fann.

**6. Grinden håller INTE lika bra grovt — den blir ungefär dubbelt så instabil och halverar
täckningen.** Svar/tystnad går från S-40:s **2 av 100 → 9 av 100**, **5 av 91 → 9 av 91** (tvåvägs
11) och **6 av 101 → 11 av 101**. Och den grova läsningen svarar på **52 av 101** rader mot den
finas 73 (51,5 % mot 72,3 %). Orsaken är mekanisk: `cannot-determine` ligger på tystnadssidan av
den grova grinden, så varje `cannot-determine ↔ riktning`-byte blir ett grindbyte. **Att skeppa
"observerad topp + grov TSO + tystnad där signalen inte räcker" skulle alltså skeppa en grind som
flippar på var tionde sving under störningar som inte betyder någonting.** §4 beskriver ändå vad
som skulle krävas, eftersom uppgiften ber om det.

**7. Och den bindande punkten är oförändrad: appen kan inte leverera en observerad topp alls.**
Det saknas inte en flagga — det saknas hela kedjan. `phaseSource`, `'observed'`, `DetectedFrame`,
`buildShaftSwingSeries` och `buildShaftMeasurements` har **noll träffar i `src/` utanför
`src/lib/shaft/measure/` och dess egna tester**: adaptern har ingen producent. De två faslägg­are
som finns (`labelPhase()`, `derivePhase()`) är båda tidsjämförelser mot `envelope.impact.topSec`,
och **`topSec` existerar bara i grenen med säkert nedslag** — i den här rundan **83 av 103 svingar
(80,6 %)**; på de övriga 20 finns ingen `top`-etikett över huvud taget. §5.

---

## 0. Reproduktion — kontrollraden och den fina läsningen

Posebanorna och detektorbanan **kördes om från noll** i ett nytt venv: `run_pose.py`,
`run_pose_clip.py` och `run_dense.py` oförändrade, samma
`public/models/pose_landmarker_lite.task` och samma `shaft-v2.onnx`, **`mediapipe` 1.0.1,
`opencv-python` 5.0.0, `numpy` 2.4.6** — samma versioner S-33 till S-40 körde. Detektorbanan blev
**103 svingar, 6 548 bildrutor**, samma tal som S-28, S-31 och S-39 rapporterade för samma
envelope-fönster.

Kontrollraden skriptet skriver före allt annat, **på den kalla körningen**:

| | E1 inne | E2 inne | E3 inne (median) | E4 RND inne |
|---|---:|---:|---:|---:|
| mot Erik pass 1 (n=93) | 9 | 36 | 23 (−1) | 33 |
| mot Lisa (n=95) | 10 | 42 | 27 (−1) | 40 |
| mot spannet (n=91) | 10 | 45 | 30 (−1) | 42 |

**Identisk med [resultat.md](resultat.md) §3, [subframe.md](subframe.md) §3,
[hard-core.md](hard-core.md) §0, [verdict-sensitivity.md](verdict-sensitivity.md) §0 och
[windowed-tso.md](windowed-tso.md) §0.** Den **varma** baslinjen reproduceras också oförändrad:
**E4 44, E2 40, E3 27, E1 6 av 91** ([hard-core.md](hard-core.md) §1). 103 svingar har en kall
posebana, 101 ett E3-val, 91 ett mänskligt spann; **103 har en detektorbana och en varm
kroppsreferens**, och **1 760 kandidatrutor** skickas till produktionskoden — samma 1 760 som S-39.

### Den andra kontrollen: den fina läsningen måste vara S-39

Den grova läsningen är en sammanslagning av den fina, så den fina måste reproducera S-39 värde för
värde. Den gör det:

| | S-39 | här (fin läsning) |
|---|---|---|
| `top-shaft-orientation`, kall mot varm E4 | 9 av 100 | **9 av 100** |
| `top-shaft-orientation`, E3 mot E4 | 13 av 101 | **13 av 101** |
| `top-shaft-orientation`, Erik första mot sista | 11 av 93 (11 av 67 svarande) | **11 av 93 (11 av 67)** |
| `top-shaft-orientation`, Lisa | 11 av 95 (11 av 68) | **11 av 95 (11 av 68)** |
| `top-shaft-orientation`, spannet | 12 av 91 (12 av 66) | **12 av 91 (12 av 66)** |
| svar/tystnad, kall/varm · spannet · E3/E4 | 2 / 100, 5 / 91, 6 / 101 | **2 / 100, 5 / 91, 6 / 101** |
| svar/tystnad, Erik · Lisa | 3 / 93, 6 / 95 | **3 / 93, 6 / 95** |
| E4 mot mitten av spannet | 65 av 91 | **65 av 91** |
| E4 inne i spannet / utanför | 38 av 44 / 27 av 47 | **38 av 44 / 27 av 47** |

Dessutom **stannar skriptet** om posebanans envelope-rutor inte är registrets `frameTimes`, om
detektorbanans rutor inte är samma, om `crossings()` och `e3_signflip` är oense om någon sving,
och — den här omgångens egen kontroll — **om någon grov läsning byter utfall på en rad där den fina
inte byter**. Den sista är inte kosmetisk: den är hela skälet till att en grov siffra går att läsa
som ett pris och inte som en annan mätning.

> **Två val som är antaganden och inte mätningar, båda övertagna oförändrade från S-39 och S-40 så
> att talen är jämförbara.**
>
> **(a) Händighet.** `handedness` står `unknown` på **alla 103** svingar ([STATUS.md](../STATUS.md)
> §4), och `topShaftOrientation` avvisar en sving utan händighet innan den tittar på en bildruta.
> Körningen skickar `right` för att det ska finnas ett utfall att flytta. **Två svingar är
> bekräftat spegelvända** (`S32-075`, `S32-017`, båda `093.mp4`) och är fel under det; de är
> namngivna snarare än borttagna.
>
> **(b) Kameravinkel.** Serien får registrets `viewBucket` (**dtl 93, face_on 10**).
> **Produktionen har den inte** — i appen är `cameraAngle` ofta `null`, och då blir `cameraGate`
> `uncertain` i stället för `rejected`. De **7 face-on-rader** som här är tysta med
> `camera-angle-mismatch` på E4:s ruta skulle i appen i stället ge ett flaggat värde. Talen nedan
> står alltså på en *strängare* kameragrind än produktionens.

### Vad de fyra läsningarna är

Alla fyra läser **samma** utfall ur produktionen och skiljer sig bara i hur utfallen namnges.

| läsning | across | on-plane | laid-off | cannot-determine | inget värde |
|---|---|---|---|---|---|
| **fin** (S-39:s egen `verdict`, kontrollen) | `across-the-line` | `on-plane` | `laid-off` | `cannot-determine` | **ett namn per skälmängd** |
| **grov 3-vägs** (uppgiftens) | `across-the-line` | `on-plane` | `laid-off` | → tystnad | → tystnad |
| *kontroll: `cd` kvar* | `across-the-line` | `on-plane` | `laid-off` | `cannot-determine` | → tystnad |
| **grov 2-vägs** (uppgiftens) | `across-the-line` | → tystnad | `laid-off` | → tystnad | → tystnad |

> **Varför `cannot-determine` hamnar i tystnaden och inte i `on-plane`.** Det är inget val, det är
> geometri i koden. `ON_PLANE_BAND_DEG` mäts från **horisontalen** (±10° kring den), och
> `NEAR_VERTICAL_GATE_DEG` från **vertikalen** (≤16° från den) — `derived.ts` skriver själv att
> *"the two bands sit at opposite ends of the same scale and answer different questions"*. En rad
> som är `cannot-determine` ligger alltså ≥74° från horisontalen och kan per konstruktion aldrig
> vara `on-plane`. Tystnad är den enda hink som återstår, och det är en **kostnad**, räknad i §2.
>
> **Kontrollraden *`cd` kvar* är inte en kandidat.** Den står här för att skilja grovhetens två
> sammanslagningar åt: den slår ihop tystnadsskälen men behåller `cannot-determine`. Utan den går
> det inte att säga vilken av de två som bär en eventuell stabilitetsvinst — och svaret visade sig
> vara entydigt (§1).

---

## 1. Byter utfallet mer sällan när det läses grovt?

**Populationen:** varje sving med båda ändarnas ruta inne i envelopen. Ingen av störningarna är ett
bildrutefel — de är golvet [e2-and-floor.md](e2-and-floor.md) §4 och
[verdict-sensitivity.md](verdict-sensitivity.md) §1 mätte.

### (a) Alla rader

| störning | n (rader / klipp) | **fin** | **grov 3-vägs** | *`cd` kvar* | **grov 2-vägs** |
|---|---|---:|---:|---:|---:|
| **E4 kall mot varm spårare** | 100 / 78 | **9 (9,0 %)** | **9 (9,0 %)** | *9* | **9 (9,0 %)** |
| Erik, första mot sista ruta | 93 / 75 | **11 (11,8 %)** | **11 (11,8 %)** | *11* | **11 (11,8 %)** |
| Lisa, första mot sista ruta | 95 / 75 | **11 (11,6 %)** | **10 (10,5 %)** | *11* | **10 (10,5 %)** |
| **spannet (unionen), första mot sista** | 91 / 73 | **12 (13,2 %)** | **11 (12,1 %)** | *12* | **11 (12,1 %)** |
| **E3 mot E4** | 101 / 79 | **13 (12,9 %)** | **11 (10,9 %)** | *13* | **11 (10,9 %)** |

**Tre avläsningar, och de pekar åt samma håll.**

1. **Vinsten är 0, 0, 1, 1 och 2 rader.** Med n mellan 91 och 101, och med klippet som oberoende
   enhet (73–79 klipp), är det inte en effekt som bär en slutsats. Den största — 13 → 11 på E3 mot
   E4 — är två rader.
2. **`cd`-kontrollen är identisk med den fina i varenda cell.** Att slå ihop `phase-missing` med
   `camera-angle-mismatch` och `shaft-point-missing` tar bort **noll** byten. Det är inte förvånande
   i efterhand: ett byte kräver att *båda* ändarna är tysta av *olika* skäl, och de rader som är
   tysta är i allmänhet tysta av samma skäl i båda ändarna. **Hela vinsten ligger alltså i
   `cannot-determine`-sammanslagningen**, och den betalas i §4.
3. **Tvåvägs är inte stabilare än trevägs.** Täljarna är identiska i alla fem raderna, av det enkla
   skälet att `on-plane` nästan aldrig inträffar (§2f). Att ta bort mellankategorin köper ingenting
   därför att det inte fanns något där att ta bort.

### (b) Bland de svarande — och nämnaren är läsningens egen

Den fina läsningen räknar `cannot-determine` som ett svar; det **är** ett resultat i koden
(`derived.ts`: *"a RESULT, not a failure"*). De grova gör det inte. **Nämnarna är alltså inte samma
nämnare och får inte jämföras rakt av** — båda står därför utskrivna.

| störning | **fin** | **grov 3-vägs** | *`cd` kvar* | **grov 2-vägs** |
|---|---:|---:|---:|---:|
| E4 kall mot varm | 9 / 74 (12,2 %) | 9 / 56 (**16,1 %**) | *9 / 74 (12,2 %)* | 9 / 56 (**16,1 %**) |
| Erik | 11 / 67 (16,4 %) | 11 / 56 (**19,6 %**) | *11 / 67 (16,4 %)* | 11 / 55 (**20,0 %**) |
| Lisa | 11 / 68 (16,2 %) | 10 / 54 (**18,5 %**) | *11 / 68 (16,2 %)* | 10 / 53 (**18,9 %**) |
| **spannet** | **12 / 66 (18,2 %)** | 11 / 54 (**20,4 %**) | *12 / 66 (18,2 %)* | 11 / 53 (**20,8 %**) |
| E3 mot E4 | 13 / 77 (16,9 %) | 11 / 60 (**18,3 %**) | *13 / 77 (16,9 %)* | 11 / 60 (**18,3 %**) |

**Läst rakt: bland de rader där mätvärdet faktiskt säger något är den grova läsningen sämre, inte
bättre, på fyra av fem störningar.** Nämnaren faller från 66 till 54 medan täljaren faller från 12
till 11. Det är samma nämnareffekt som [windowed-tso.md](windowed-tso.md) §1 varnade för, fast åt
andra hållet: där växte nämnaren och fick procenten att falla, här krymper den och får procenten
att stiga.

### (c) Rena teckenbyten: noll, under samtliga störningar

| störning | n | across ↔ laid-off |
|---|---:|---:|
| E4 kall mot varm | 100 | **0** |
| Erik, första mot sista | 93 | **0** |
| Lisa, första mot sista | 95 | **0** |
| spannet, första mot sista | 91 | **0** |
| E3 mot E4 | 101 | **0** |

**Uppgiftens iakttagelse håller, och bredare än den ställdes.** Teckenbytet var 0 vid −1 ruta i
S-39; här är det 0 under varenda störning som mätts. **Riktningen är det stabila i mätvärdet.**
Men — och det är hela svaret på fråga 1 — **att riktningen är stabil hjälper inte, eftersom nästan
inget byte går mellan två riktningar.**

### (d) Vad bytena faktiskt går mellan

Spannets elva kvarvarande grova byten, med det fina utfallet bredvid:

| id | klipp | grovt: första → sista | fint |
|---|---|---|---|
| `S32-018` | 089.mp4 | `laid-off` → tystnad | `laid-off` → `phase-missing` |
| `S32-027` | 074.mp4 | `across-the-line` → `on-plane` | oförändrat |
| `S32-031` | 062.mp4 | tystnad → `laid-off` | `cannot-determine` → `laid-off` |
| `S32-034` | 061.mp4 | `laid-off` → tystnad | `laid-off` → `cannot-determine` |
| `S32-040` | 053.mp4 | tystnad → `laid-off` | `cannot-determine` → `laid-off` |
| `S32-045` | 075.mp4 | tystnad → `laid-off` | `cannot-determine` → `laid-off` |
| `S32-060` | 090.mp4 | `on-plane` → `across-the-line` | oförändrat |
| `S32-066` | 068.mp4 | `laid-off` → tystnad | `laid-off` → `phase-missing` |
| `S32-082` | 096.mp4 | `laid-off` → tystnad | `laid-off` → `phase-missing` |
| `S32-084` | 054.mp4 | tystnad → `laid-off` | `cannot-determine` → `laid-off` |
| `S32-100` | 088.mp4 | tystnad → `across-the-line` | `phase-missing` → `across-the-line` |

**Nio av elva går mellan tystnad och en kallad riktning.** Fem av dem är
`NEAR_VERTICAL_GATE_DEG`:s kant (`cannot-determine` mot en riktning) och fyra är att `top`-rutan
inte överlevde `plausibility.ts` i den ena änden. De återstående två är `ON_PLANE_BAND_DEG`:s kant
(`S32-027`, `S32-060`) — och de överlever **båda** grovheten, eftersom `on-plane` är en egen hink
trevägs och blir tystnad tvåvägs, vilket i båda fallen fortfarande skiljer sig från grannen.

**Den enda rad grovheten räddar på spannet är `S32-011`** (`090.mp4`), och den är värd att titta
på, för den är hela grovhetens verkningssätt i en rad: fint `cannot-determine` i ena änden och
`phase-missing` i den andra ([verdict-sensitivity.md](verdict-sensitivity.md) §2), grovt tystnad i båda.
Direkt ur bryggan: ruta 14 ger `cannot-determine` med skälet `top-shaft-near-vertical`, ruta 16 ger
inget värde med skälet `phase-missing`. **Raden räddas alltså genom att grovheten slår ihop just de
två utfall §2 visar är olika besked** — "din topp är för upprätt" och "vi hittade inte rutan". Den
är ett byte fint och inget byte grovt, och båda läsningarna har rätt om sin egen fråga. **Det finns
exakt en sådan rad bland 91.**

---

## 2. Vad grovheten kostar

**Populationen:** de rader som har ett mänskligt spann, lästa på **E4:s egen ruta** —
**91 rader i 73 klipp**. "Förlorar en distinktion" betyder exakt: *den fina läsningen gav raden ett
annat namn än den grova ger den*. Det är en räkning, inte en tolkning.

### (a) Den fina fördelningen på E4:s ruta

| fint utfall | rader |
|---|---:|
| `laid-off` | 37 |
| `cannot-determine` | 20 |
| `across-the-line` | 14 |
| inget värde: `phase-missing` | 13 |
| inget värde: `camera-angle-mismatch` | 7 |
| **`on-plane`** | **0** |

### (b) Vad de grova läsningarna gör av den

| läsning | fördelning |
|---|---|
| **grov 3-vägs** | tystnad 40, `laid-off` 37, `across-the-line` 14 |
| *`cd` kvar* | `laid-off` 37, `cannot-determine` 20, tystnad 20, `across-the-line` 14 |
| **grov 2-vägs** | tystnad 40, `laid-off` 37, `across-the-line` 14 |

### (c) Hur många rader som förlorar en distinktion

| läsning | rader | klipp | andel |
|---|---:|---:|---:|
| **grov 3-vägs** | **40 av 91** | **33 av 73** | **44,0 %** |
| *`cd` kvar* | 20 av 91 | 18 av 73 | 22,0 % |
| **grov 2-vägs** | **40 av 91** | **33 av 73** | **44,0 %** |

Uppdelat på vilket fint namn som går förlorat:

| fint namn som slås ihop till `tystnad` | rader | klipp |
|---|---:|---:|
| `cannot-determine` | **20** | 17 |
| `phase-missing` | **13** | 12 |
| `camera-angle-mismatch` | **7** | 6 |

**Trevägs och tvåvägs kostar exakt lika mycket**, och det är inte en slump — det är §2f.

### (d) Vilka distinktioner som försvinner, i coachingtermer

Det här går att avgöra ur koden, för `derived.ts` säger själv vad varje utfall betyder.

**`cannot-determine` (20 rader, 17 klipp) — den distinktion som kostar mest.** Kommentaren i
`derived.ts` är otvetydig: det är *"a RESULT, not a failure: the frame was measured, and what the
measurement found is that this top cannot be called either way"*, och skälet
`top-shaft-near-vertical` beskrivs som *"a property of the SWING, not of the recording or the
detector: **nothing about the footage could be improved to make this frame answerable**"*.
Översatt till vad en spelare skulle få höra: *"din topp ligger inom 16° från lodrätt — den har
ingen sida att tala om"*. Det är ett **svar** om svingen, och det är dessutom det enda utfall som
aktivt **inte** ska leda till en omtagning. Slås det ihop med tystnad blir samma rad *"vi kunde inte
läsa den"*, vilket är osant och dessutom inbjuder till precis den omtagning som inte kan hjälpa.

**`phase-missing` (13 rader, 12 klipp).** `topFrame()` hittade ingen användbar `top`-ruta: rutan
överlevde inte `plausibility.ts`. Det är ett fel i **inspelningen eller detektionen**, och det är
åtgärdbart — filma om, bättre ljus, klubban i bild. En användarvänd formulering finns inte i koden,
men riktningen gör det: det här är den tystnad som *ska* leda till en omtagning.

**`camera-angle-mismatch` (7 rader, 6 klipp).** `cameraGate` avvisade: `top-shaft-orientation`
antar `cameraAngle: 'dtl'` (`MEASUREMENT_ASSUMPTIONS`), och rundan har 10 face-on-klipp. Åtgärden
är en annan än för `phase-missing` och lika konkret: **filma bakifrån, längs mållinjen.**

**Sammanfattat: tre olika besked med tre olika åtgärder — "ingenting att göra", "filma om", "filma
bakifrån" — blir ett enda blankt.** Det är priset, och det är 40 av 91 rader.

**Och tvåvägs kostar en fjärde distinktion, i teorin:** `on-plane` är ett positivt besked (*"skaftet
låg på plan i toppen"*), inte ett uteblivet. Att göra det till tystnad byter ett beröm mot ett
ingenting. **I den här rundan kostar det dock exakt 0 rader**, eftersom mellankategorin är tom på
E4:s ruta.

### (e) Skillnaden mellan de två grova läsningarna

**0 av 91 rader.** Per konstruktion är det exakt `on-plane`-raderna, och de är noll.

### (f) Hur ofta mellankategorin alls uppstår

Räknat över **varje kandidatruta produktionen svarade på i hela rundan** — alla etiketter, alla
svingar, inte bara E4:s ruta:

| fint utfall | av 1 756 besvarade kandidatrutor |
|---|---:|
| `laid-off` | 762 (43,4 %) |
| inget värde: `phase-missing` | 346 (19,7 %) |
| `cannot-determine` | 277 (15,8 %) |
| `across-the-line` | 195 (11,1 %) |
| inget värde: `camera-angle-mismatch` | 156 (8,9 %) |
| **`on-plane`** | **20 (1,1 %)** |

**`on-plane` inträffar på 1,1 % av rutorna.** Det är inte ett fynd om banden är rätt satta — det är
geometri: `ON_PLANE_BAND_DEG` är ±10° kring **horisontalen**, och ett skaft i toppen står sällan
vågrätt. **Den praktiska följden är att uppgiftens trevägsläsning och tvåvägsläsning är samma
läsning på det här underlaget**, och att den distinktion tvåvägs skulle offra i princip inte finns.

---

## 3. E4 grovt mot facit

**Referensen är S-39:s och S-40:s egen och den är oförändrad:** enrutsavläsningen vid en topp satt
**mitt i människornas spann** (`SPAN_mid`, unionens mitt, halv-upp avrundad), **läst med samma
läsning som E4**. n = **91 rader i 73 klipp**; E4 låg **inne** i spannet på 44 och utanför på 47.

> **Vad "facit" kan betyda här, och vad det inte kan.** Det finns **ingen bedömd
> across/laid-off-etikett per sving** i det här datasetet — bedömarna ritade toppens *bildruta*,
> inte dess kategori. [across-sign-result.md](../across-sign-result.md):s sex handkallade rader
> duger inte: de ligger på det glesa exportrutnätet, de är kallade på en annan bildruta än E4:s
> val, och fem av elva kandidater stoppades av ögat självt som "för nära lodrätt". **"Rätt" nedan
> betyder därför exakt: vad enrutsavläsningen vid människornas mittruta säger.** Inget mer.

| läsning | alla (n=91) | E4 **inne** (n=44) | E4 **utanför** (n=47) |
|---|---:|---:|---:|
| **fin (S-39)** | **65 (71,4 %)** | **38 (86,4 %)** | **27 (57,4 %)** |
| **grov 3-vägs** | **68 (74,7 %)** | **40 (90,9 %)** | **28 (59,6 %)** |
| *`cd` kvar* | *65 (71,4 %)* | *38 (86,4 %)* | *27 (57,4 %)* |
| **grov 2-vägs** | **69 (75,8 %)** | **40 (90,9 %)** | **29 (61,7 %)** |

**Tre saker måste stå bredvid de talen.**

1. **Vinsten är 3 respektive 4 rader av 91**, och den kommer uteslutande från
   `cannot-determine`-sammanslagningen — `cd`-kontrollen ger exakt den fina siffran. Tre rader i 73
   klipp är inom det som en annan uppsättning klipp skulle kunna flytta.
2. **Mönstret från S-39 håller:** där mätvärdet *är* känsligt — E4 utanför spannet — ligger träffen
   på 57–62 %, mot 86–91 % där E4 låg inne. Grovheten flyttar inte den skillnaden, den lyfter båda
   sidor lika lite.
3. **Att "träffa" kan här betyda "tiga på båda ställena".** Det är samma invändning S-39 gjorde mot
   sina 87 %, och den blir **starkare** grovt, eftersom tystnadshinken nu är dubbelt så stor
   (40 av 91 rader mot 20).

### De 23 rader som fortfarande skiljer sig (grov 3-vägs)

Uppdelat på bytets art:

| E4 säger | mitten av spannet säger | rader |
|---|---|---:|
| `laid-off` | tystnad | 7 |
| tystnad | `across-the-line` | 6 |
| `across-the-line` | tystnad | 3 |
| **`across-the-line`** | **`laid-off`** | **3** |
| tystnad | `laid-off` | 1 |
| `across-the-line` | `on-plane` | 1 |
| tystnad | `on-plane` | 1 |
| **`laid-off`** | **`across-the-line`** | **1** |

**Fyra av 91 rader (4 %) är riktiga teckenoenigheter** — `S32-009`, `S32-012`, `S32-063` och
`S32-100`, exakt de fyra S-39 namngav. **Det är den siffra ett nedströmsråd faktiskt skulle bära**,
och grovheten rör den inte alls: den kan per konstruktion inte laga ett byte mellan två riktningar.
Arton av de 23 går mellan tystnad och ett svar; fem går mellan två kallade riktningar.

---

## 4. Grinden — håller svar/tystnad lika bra grovt?

**Nej. Den blir ungefär dubbelt så instabil, och täckningen halveras.**

Den fina grinden räknar `cannot-determine` som ett svar; den grova lägger den på tystnadssidan.
**Det är två olika grindar**, och båda står här.

| störning | n | **fin grind** (S-40) | **grov 3-vägs** | **grov 2-vägs** |
|---|---:|---:|---:|---:|
| E4 kall mot varm spårare | 100 | **2 (2,0 %)** | **9 (9,0 %)** | **9 (9,0 %)** |
| spannet, första mot sista | 91 | **5 (5,5 %)** | **9 (9,9 %)** | **11 (12,1 %)** |
| E3 mot E4 | 101 | **6 (5,9 %)** | **11 (10,9 %)** | **11 (10,9 %)** |
| Erik, första mot sista | 93 | 3 (3,2 %) | 9 (9,7 %) | 11 (11,8 %) |
| Lisa, första mot sista | 95 | 6 (6,3 %) | 8 (8,4 %) | 10 (10,5 %) |

Och täckningen, på E4:s egen ruta (n = 101 rader i 79 klipp):

| läsning | svarar |
|---|---:|
| fin (S-39) | **73 av 101 (72,3 %)** |
| grov 3-vägs | **52 av 101 (51,5 %)** |
| *`cd` kvar* | *73 av 101 (72,3 %)* |
| grov 2-vägs | **52 av 101 (51,5 %)** |

**Mekanismen är rakt igenom `cannot-determine`.** Räknat: de två ändarna skiljer sig fint *och* en
av dem är `cannot-determine` på **7 av 100** (kall/varm), **6 av 91** (spannet), **9 av 101**
(E3/E4), 6 av 93 (Erik) och 4 av 95 (Lisa). Det är precis de byten som den fina grinden inte såg
(de låg inne i svarssidan) och som den grova grinden måste se.

**Den strukturella läsningen:** `NEAR_VERTICAL_GATE_DEG` är satt medvetet brett just för att
*hellre* svara `cannot-determine` än att kalla fel sida (`derived.ts`: *"Conservative here means
MORE `cannot-determine`, not fewer"*). Den grova läsningen tar det utfallet — som spärren
producerar **ofta och avsiktligt** — och lägger det på tystnadssidan av en grind. **Då ärver
grinden spärrens egen kantkänslighet**, den som [STATUS.md](../STATUS.md) §2 beskriver som
"gränsens skärpa, inte dess läge". Grovhetens enda vinst i §1 och dess hela förlust här är **samma
sammanslagning, läst från två håll**.

### Skulle det gå att skeppa "observerad topp + grov TSO + tystnad", utan att någon tröskel ändras?

**Tröskelmässigt: ja. Kvalitetsmässigt: talen ovan säger nej.** Uppgiften ber om beskrivningen
ändå, så här är den — **inget av det är implementerat, och ingenting nedan är ett förslag.**

Kollapsen i sig kräver **ingen** tröskeländring. Den är en ometikettering i konsumenten:
`topShaftOrientation.value.category` läses, `across-the-line` / `on-plane` / `laid-off` får var sin
text, och allt annat (`cannot-determine` plus `value === null`) ger ingen text.
`ON_PLANE_BAND_DEG`, `NEAR_VERTICAL_GATE_DEG`, `cameraGate` och S-30:s spärr rörs inte.

Vad som **däremot** måste finnas, läst ur koden (§5 har räkningen):

1. **En konsument.** `buildShaftMeasurements` anropas ingenstans. Det är inte en spärr att lyfta,
   det är kod som inte är skriven — och den skulle behöva en textkarta för tre kategorier plus en
   tystnad.
2. **En observerad topp.** Den bindande punkten, och den är **inte** en tröskel. `observed` betyder
   i dag att en människa har sett rutan ([phase-trust.md](../phase-trust.md)); ingen kodväg kan
   skapa flaggan. Att låta en estimator sätta den är **en omdefinition av vad flaggan betyder**, och
   den omdefinitionen är hela S-30:s fråga. Den kan inte smygas in som en konsumentändring.
3. **Händighet.** `top-shaft-orientation` avvisar `unknown` innan den läser en bildruta, och
   `handedness` är `unknown` på **103 av 103** svingar. Appen måste fråga eller härleda det.
4. **Kameravinkel.** `cameraAngle: 'dtl'` i `MEASUREMENT_ASSUMPTIONS`. I appen är den ofta `null` →
   `uncertain`, alltså **ett flaggat svar där rundan har tystnad**. Grinden blir alltså **mildare** i
   appen än talen ovan, inte strängare — vilket gör instabiliteten större, inte mindre.
5. **Detektorn i produktionsvägen.** `detectShaft` körs bara i `shaftPreview.ts` bakom
   `VITE_DEV_PREVIEW`.

**Och det som talen säger om att göra det:** grinden skulle flippa på **9 av 91** svingar mellan två
bildrutor två eniga människor inte kan välja mellan, och på **9 av 100** när ingenting alls ändras
utom spårartillståndet. Den skulle tiga på **48 %** av svingarna. **Det är sämre på båda axlarna än
den fina läsning som redan finns och som redan är för känslig.** Ingen rekommendation dras här —
men avvägningen är inte "grovt är stabilare men säger mindre". Den är **"grovt säger mindre och är
mindre stabilt på den axel som skulle styra om något visas"**.

---

## 5. Vad som saknas för att appen ska kunna leverera en observerad topp alls

`fromDetection.ts` skriver det själv i sin docstring om `phaseSource`: *"The app's own path derives
every phase, so it passes `envelope-impact` or `envelope-fallback` — **never `observed`**."* Här är
vad det betyder exakt, läst ur koden och räknat på rundan. **Diagnos, ingen fix.**

### (a) Det saknas inte en flagga — det saknas en producent

Sökningen i hela `src/`, med `src/lib/shaft/measure/` och testfilerna undantagna:

| identifierare | träffar |
|---|---|
| `phaseSource` | **inga** |
| `'observed'` | **inga** |
| `DetectedFrame` | **inga** |
| `buildShaftSwingSeries` | **inga** |
| `buildShaftMeasurements` | **inga** |
| `derivePhaseWithSource` | `src/lib/dataset/datasetPhase.ts` (definitionen) |
| `derivePhase` | `src/lib/dataset/datasetPhase.ts`, `src/lib/dataset/extractDataset.ts` (dev-only) |

**Adaptern har ingen anropare.** Frågan "hur sätter appen `phaseSource: 'observed'`?" har alltså ett
led före sig: appen bygger aldrig en `DetectedFrame[]` över huvud taget. `phaseSource` är ett
obligatoriskt fält utan default (medvetet — `fromDetection.ts` skriver att en default *"would answer
the question on the caller's behalf in the direction that costs the most"*), så den som skriver
producenten **måste** ta ställning, och det är där beslutet ligger.

### (b) Var ett `top` alls kan uppstå, och vad det hänger på

De två faslägg­arna i `src/` är båda tidsjämförelser mot `envelope.impact.topSec`:

- `poseEnvelopeSelection.ts` → `labelPhase()` — brickornas 6-värdesetikett
- `src/lib/dataset/datasetPhase.ts` → `derivePhase()` — datasetattributets 7-värdesetikett (dev)

Och `derivePhaseWithSource()` returnerar **per konstruktion** `envelope-impact` eller
`envelope-fallback`, aldrig `observed` — returtypen säger det i varje gren.

**Under dem ligger en hårdare gräns: `topSec` finns bara när envelopen har ett säkert nedslag.** I
`poseEnvelope.ts` sätts `impact = { topSec, timeSec, downswingSec }` **enbart** i den grenen, och
`topIdx` är minsta `y` **före** `impactIdx` — utan nedslag exekverar loopen inte och `topIdx`
degenererar till `startIdx`, varpå hela `impact` blir `null`.

| | |
|---|---:|
| svingar i rundan med säkert nedslag (`hasConfidentImpact`) | **83 av 103 (80,6 %)** |
| svingar **utan** — ingen `topSec`, alltså ingen `top`-etikett alls | **20 av 103** |

**På de 20 faller mätvärdet på `phase-missing` innan S-30:s spärr ens läses.** En observerad topp
där kräver en toppkälla som inte är bunden till nedslaget — och det är exakt vad E1–E4 är, och exakt
vad ingen av dem är kopplad som.

### (c) Upplösningen toppen kan lokaliseras i

Konstanterna citerade ur filerna:

| konstant | värde | fil |
|---|---|---|
| `POINT_TOL_SEC` | `0.06` | `src/lib/dataset/datasetPhase.ts` |
| `SAMPLE_FPS` | `15` | `src/lib/poseTrajectory.ts` |
| `ANALYSIS_FRAME_COUNT` | `32` | `src/lib/frameExtractor.ts` |
| `NEAR_VERTICAL_GATE_DEG` | `16` | `src/lib/shaft/measure/derived.ts` |
| `ON_PLANE_BAND_DEG` | `10` | `src/lib/shaft/measure/derived.ts` |

Toleransen som avgör vilka rutor som får heta `top` är `max(POINT_TOL_SEC, envelope.sampleDt)`, och
`sampleDt` kommer från en posebana vid **15 fps**, så golvet är **1/15 s ≈ 2 videobildrutor vid
30 fps**. **Toppen lokaliseras alltså på ett dubbelt så grovt rutnät som den bildruta ett utfall
läses på** — samma gräns [windowed-tso.md](windowed-tso.md) §3 beskrev, och den ligger under varje
bildrutediskussion i S-39 och S-40.

### (d) Och rutan måste ha avkodats

En topp kan bara observeras på en bildruta produktionen faktiskt hämtade.
[windowed-tso.md](windowed-tso.md) §3 mätte att **E4:s egen ruta är en av produktionens 32 valda på
39 av 101 svingar** — den räkningen upprepas inte här, den citeras. På de övriga 62 finns rutan inte
i rutnätet, så även med en pålitlig toppkälla skulle en ruta till behöva avkodas och detekteras.

### (e) De två sista spärrarna, räknade på rundan

| | |
|---|---|
| `viewBucket` | dtl **93**, face_on **10** |
| `handedness` | `unknown` på **103 av 103** |

I appen finns ingen av de två: `cameraAngle` är ofta `null`, vilket gör `cameraGate` `uncertain` i
stället för `rejected` (**mildare**, inte strängare — ett flaggat tal där rundan har tystnad), och
`handedness: null` gör att `top-shaft-orientation` **avvisas rakt av**.

### Den bindande listan, i ordning

1. **En producent av `DetectedFrame[]` i appen.** Finns inte. Utan den finns ingen `phaseSource`
   att sätta.
2. **En toppkälla vars etikett får kallas `observed`.** Det är en definitionsfråga, inte en
   tröskelfråga, och det är S-30:s öppna fråga.
3. **En topp som inte kräver ett säkert nedslag.** 20 av 103 svingar har ingen `topSec`.
4. **Att toppens ruta finns bland de avkadade 32.** I dag 39 av 101 för E4.
5. **Händighet och kameravinkel** (bara för `top-shaft-orientation`; de två tysta mätvärdena bryr
   sig inte om händighet).
6. **En konsument som läser kategorin.** Finns inte.

**Punkt 1 och 6 är kod som inte är skriven. Punkt 2 är ett beslut. Punkt 3, 4 och 5 är mätta
brister med kända tal.** Ingen av dem är en tröskel.

---

## Vad som inte mättes

- **Ingenting är valt, föreslaget eller kalibrerat.** Den grova läsningen är uppgiftens, den fina är
  S-39:s. `ON_PLANE_BAND_DEG` och `NEAR_VERTICAL_GATE_DEG` är **lästa, aldrig ändrade**; S-30:s
  spärr är orörd.
- **Ingen annan kollaps är prövad.** Till exempel `cannot-determine` som en egen synlig
  användartext, eller en fyrvägsläsning där tystnadsskälen skiljs åt mot användaren. Kontrollraden
  *`cd` kvar* är den enda varianten utöver uppgiftens två, och den står som kontroll, inte kandidat.
- **Inget facit för kategorin finns.** Referensen i §3 är enrutsavläsningen vid människornas
  mittruta, inte en bedömd `across`/`laid-off`-etikett. En sådan omgång är inte körd — och
  [across-sign-result.md](../across-sign-result.md):s sex rader duger inte som ersättning (§3).
- **`on-plane` är mätt som sällsynt, inte som felplacerad.** 20 av 1 756 säger att bandet nästan
  aldrig nås; det säger **ingenting** om huruvida ±10° kring horisontalen är rätt band. Att flytta
  det vore en tröskeländring och är förbjudet här.
- **Face-on är tyst rakt igenom** (7 rader på E4:s ruta, 156 kandidatrutor totalt,
  `camera-angle-mismatch`). Uppdelningen face-on mot dtl går inte att göra på utfallen.
- **Händighet är antagen `right`** på alla rader. `S32-075` och `S32-017` är bekräftat spegelvända
  och fel under antagandet.
- **De två tysta mätvärdena** (`shaft-position-p4`, `top`-hinken) är **inte** mätta grovt. De har
  ingen kategori att göra grov — se [windowed-tso.md](windowed-tso.md) §4.
- **Fönsterläsning är inte kombinerad med grov läsning.** S-40 avskrev fönstret; den här omgången
  läser en ruta. Korsningen av de två är omätt.
- **Ingen har öppnat en bildruta.** Varje namngiven rad i den här rapporten är namngiven ur tal.
- **Kvar oprövat även varmt**, oförändrat från S-38: 15 fps mot 30, delegat, avkodare. Livevägen som
  strömmar kameran är fortfarande inte mätt alls.

---

## Kör om

**Underlaget ligger nu under `data/shaft/top-review/`** (gitignorerat via `data/shaft/*`) i stället
för i `<tmp>`, så nästa omgång inte behöver bygga om det. Ingenting av det committas.

```
data/shaft/top-review/
  .venv/         mediapipe 1.0.1, opencv-python 5.0.0.93 (cv2 5.0.0), numpy 2.4.6
  manifests/     export_manifests.json, review_rows.json
  pose/          103 KALLA envelopebanor      (run_pose.py)
  clippose/      81 VARMA helklippsbanor      (run_pose_clip.py)
  dense/         103 detektorbanor, 6 548 rutor (run_dense.py, shaft-v2.onnx)
  work/          TS-bryggans bundle och indata
```

Bygg om det bara om det saknas eller om kontrollraden inte stämmer:

```sh
# 0. venv (en gang)
python -m venv data/shaft/top-review/.venv
data/shaft/top-review/.venv/Scripts/python.exe -m pip install \
    "mediapipe==1.0.1" "opencv-python==5.0.0.93" "numpy==2.4.6"

# 1. manifesten ur exportzip:arna
data/shaft/top-review/.venv/Scripts/python.exe docs/shaft/top-from-pose/rows_from_review.py \
    data/shaft/top-review/manifests/export_manifests.json \
    data/shaft/top-review/manifests/review_rows.json

# 2. envelopebanorna (den KALLA korningen) -- kontrollraden
data/shaft/top-review/.venv/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py \
    data/shaft/top-review/pose \
    --manifests data/shaft/top-review/manifests/export_manifests.json

# 3. helklippsbanorna (den VARMA) -- huvudunderlaget
data/shaft/top-review/.venv/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py \
    data/shaft/top-review/clippose

# 4. skaftdetektorn pa varje envelope-bildruta, 6 548 rutor
training/.venv/Scripts/python.exe docs/shaft/top-from-dense-signal/run_dense.py \
    data/shaft/top-review/dense \
    --manifests data/shaft/top-review/manifests/export_manifests.json

# 5. den har matningen (--section: f1 | f2 | f3 | f4 | f5 | all)
data/shaft/top-review/.venv/Scripts/python.exe docs/shaft/top-review/coarse_tso.py \
    data/shaft/top-review/pose \
    --clipPoseDir data/shaft/top-review/clippose \
    --denseDir data/shaft/top-review/dense \
    --work data/shaft/top-review/work --section all
```

`coarse_tso.py` skriver bara till stdout; `--work` används för TS-bryggan och dess indata
(`npm install` krävs för esbuild). **Läs kontrollraden och den fina läsningen först:** stämmer de
inte med [resultat.md](resultat.md), [subframe.md](subframe.md), [hard-core.md](hard-core.md),
[verdict-sensitivity.md](verdict-sensitivity.md) och [windowed-tso.md](windowed-tso.md) har
underlaget drivit och inget här gäller. Skriptet stannar också om posebanans eller detektorbanans
rutor inte är registrets egna `frameTimes`, om `crossings()` och `e3_signflip` är oense, eller om
**någon grov läsning byter utfall där den fina inte byter**.
