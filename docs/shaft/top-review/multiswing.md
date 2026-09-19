# Flera svingar i en envelope — och svingar utan envelope (S-35, diagnos)

> 2026-09-19, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> kalibrering applicerad, ingen produktionskod läst eller skriven.** `src/lib/shaft/measure/`,
> `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen och S-30:s spärr är orörda.
>
> **Facit var sett.** [resultat.md](resultat.md), [subframe.md](subframe.md) och
> [crossing-selection.md](crossing-selection.md) låg färdiga och lästes först, så risken här är
> inte mätfel — den är anpassning. Därför: **ingen parameter svept, ingen justerad, ingenting
> valt.** Hysteresen 0,10 och fönstret 3 är E3:s egna och är oförändrade. Flaggan i del A är
> räkningar (prominens, utflykter, återvändningar), inte trösklade storheter, och varje nivå
> redovisas vid tre värden bredvid varandra så att ingen av dem är privilegierad.
>
> **Ingen sving är utesluten, ingen rad struken och ingen siffra i resultat.md, subframe.md eller
> crossing-selection.md omräknad.** Del A är en diagnos, precis som beställt.
>
> Skript: [multiswing.py](multiswing.py) (del A, A2, B, C) och [clip_swings.py](clip_swings.py)
> med [run_pose_clip.py](run_pose_clip.py) (del D) — alla skriver bara till stdout utom
> `run_pose_clip.py`, som skriver posebanor till den katalog den får som argument. Underlaget är
> S-32:s runda: **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor**, Erik pass 1 och
> Lisa bedömda oberoende. **Klippet är den oberoende enheten** och n står som rader *och* klipp.

> **RÄTTELSE 2026-09-19 (S-39) — etiketten `slow-mo` i den här rapporten betyder
> `lång envelope (> 3,0 s)`.** Manifestets `slowmo` är `deriveSlowmo(envelopeDurationSec,
> 'auto')`, alltså **`envelopeDuration > 3,0 s`** och ingen mätning av filmhastighet — samma
> predikat som `suspectMultiSwing`, mätt identiskt på alla 103 svingar
> ([hard-core.md](hard-core.md) §5). **Varje siffra nedan står oförändrad; bara etiketten på uppdelningen
> ändras, och riktningen i varje slutsats håller.** Ordet är utbytt i texten nedan där det
> namnger en uppdelning; fältnamnet `slowmo`, konstanten `SLOWMO_ENVELOPE_THRESHOLD_SEC` och
> lägena `force-slowmo`/`force-normal` är kodnamn och står kvar som de är. Originalordalydelsen
> ligger i git-historiken före den här rättelsen. Inventering: [verdict-sensitivity.md](verdict-sensitivity.md) §5.

## Kort svar

**A. Flersvingsflaggan tänder på 7 av 103 envelopes, och bara en av dem tänder på mer än ett
kriterium.** Den är `S32-092` (`005.mp4`, 8,5 s envelope, lång envelope): fem separata utflykter över
adresshöjd, fem återvändningar till adresshöjd, sex vändningar med halva toppens prominens. **Fem
av de sex övriga** tänder bara på återvändningskriteriet, med extrautflykter 0,000–0,059 höga mot
toppens 0,124–0,305 — kanter, inte svingar. **Den sjätte (`S32-074`, `001.mp4`) har en enda utflykt
och tänder för att dess högsta topp har prominens 0,0008**: envelopen slutar innan toppen, vilket
del D visar oberoende. **`S32-092` är också den sving vars handledsbana har
rundans största enskilda rutsteg** (0,197 mot rundans median 0,048), så flaggan kan inte skilja
*två svingar* från *en bana som hoppar*. Ingen har tittat på klippet.

**A2. Svansen är inte flersvingsklipp.** I E2:s svans (10 rader, 9 klipp) är 2 flaggade, och av
E4:s 49 utanför-rader är 4 flaggade (8 %) mot 2 % bland de 42 som ligger inne. **Bland de 23 som
saknar armad växling är 1 flaggad (4 %) — lägst i hela tabellen.** *"Ingen kandidat"* är alltså
inte ett flersvingsfenomen; de 23 är korta envelopes (median 1,6 s) med exakt en vändning var.
**Det som däremot skiljer E2:s svans är banans stabilitet:** dess p90 för det största rutsteget är
**0,197 mot rundans 0,092**, och fyra av rundans fem största rutsteg ligger i svansen.

**B. Armningen filtrerade ingenting.** På **22 av de 23** raderna finns **ingen teckenväxling
alls** i v_y inne i människornas intervall — inte ens en oarmad. Den närmaste oarmade växlingen
är på alla 22 **E3:s egen**, och den ligger median **2 rutor** (max 5) före eller efter
intervallet. Bara `S32-038` (`064.mp4`) har en oarmad växling inne i intervallet, och den föll på
den negativa sidan: den negativa löpan nådde **−0,002** mot grinden −0,10, på **en enda ruta**.
**Hysteresen är alltså inte det som saknas — mittpunktens v_y byter helt enkelt inte tecken där
ögat pekar.** Ingen ny tröskel sätts och ingen föreslås.

**C. `054.mp4` — se [subframe.md §8](subframe.md), som är omskriven.**
Kort: inom `S32-084` gör handledsbanan **två fullständiga utflykter över adresshöjd**. Bedömarnas
rutor 17–18 ligger på toppen av den **första** (prominens 78 % av lyftet); facit 53,5 ligger 2–6
rutor in i nedgången från den **andra**, som är den högsta (ruta 47). Appens egen exportfas kallar
ruta 49 `top`. CVAT-etiketten `f00 @ 3,327 s backswing` ligger **mellan** de två utflykterna, med
händerna nära adresshöjd och på väg ned (v_y +0,493) — förenlig med att den andra utflykten är
baksvingen, oförenlig med en topp vid 17–18. **Vad den första utflykten är går inte att avgöra ur
banan, och ingen har öppnat klippet.**

**D. Det motsatta felet finns, och det är vanligare än `054`.** Av 81 klipp har **16** minst en
vändning utanför varenda envelope som når klippets egen referens, och i **12** av dem är den minst
lika stor som klippets **största** registrerade sving. `054.mp4`:s missade sving syns som en
vändning vid **10,9 s** (1,05 × den största registrerade). **Det värsta fallet är `001.mp4`:** dess
enda envelope (4,067–8,333 s) täcker en sträcka vars prominentaste vändning är **0,0017**, medan
klippets riktiga vändningar ligger vid **9,4 s (0,131)** och **14,9 s (0,104)** — alltså **efter**
envelopens slut. **Envelopen tar slut innan toppen.** Det är precis den sving (`S32-074`) där båda
bedömarna satte *osäker* och där E3 inte gav något svar alls (resultat.md §5).

---

## 0. Reproduktion — samma posebanor, plus en ny helklippskörning

Envelopebanorna är **S-34:s**, oförändrade: samma `run_pose.py`, samma
`public/models/pose_landmarker_lite.task`, `mediapipe` 1.0.1, `opencv-python` 5.0.0, `numpy`
2.4.6. Kontrollraden som `multiswing.py` skriver före allt annat:

| | E3 inne | E3 median | E4 RND inne |
|---|---:|---:|---:|
| mot Erik pass 1 (n=93) | 23 | −1 | 33 |
| mot Lisa (n=95) | 27 | −1 | 40 |
| mot spannet (n=91) | 30 | −1 | 42 |

**Identisk med [resultat.md](resultat.md), [subframe.md](subframe.md) och
[crossing-selection.md](crossing-selection.md).** Stämmer inte den raden har posebanorna drivit
och inget nedan gäller. Skriptet kontrollerar dessutom per sving att posebanans envelope-rutor är
samma rutor i samma ordning som registrets `frameTimes` och stannar annars, och det stannar om
`crossings()[0]` inte är `e3_signflip`:s svar. **103 svingar har en posebana; 101 har ett E3-val**
(`S32-074` och `S32-053` saknar det, precis som resultat.md §5 skrev).

E1/E2/E3 plockas ur `analyze_pose.py` med samma AST-lyft som `score_round.py`; `multiswing.py`
återanvänder `score_round.py`:s statistik och `subframe.py`:s `e3_bracket`/`rnd` samt
`crossing_selection.py`:s `crossings`/`shape`. **Ingenting är återimplementerat.**

### Del D kräver en andra körning, och den avviker

Frågan *"finns det en sving inget segment fångar?"* går inte att svara på med bildrutor
envelopen redan valt, så [run_pose_clip.py](run_pose_clip.py) kör **samma modell över hela
klippet**: 81 klipp, 28 800 bildrutor, ~16 minuter lokalt. `run_pose.py` är **inte** ändrad, så
S-31/S-33/S-34 kör fortfarande på exakt det skript de körde på.

**Avvikelsen, utskriven i stället för gömd:** `run_pose.py` skapar en **kall** spårare per sving
och börjar avkoda 0,6 s före envelopen; helklippskörningen skapar en per **klipp** och börjar vid
t = 0, så inne i envelopen har spåraren sett en längre historia. Vad det gör:

| | |
|---|---|
| handledernas y skiljer, per bildruta (n=6 535) | median **0,0009**, p90 0,0046, p99 0,024, max 0,32 |
| E3:s ruta ur de två körningarna | **lika på 67 av 103**; inom 1 ruta på **89 av 103**; max 19 rutor |

**Del A, A2, B och C ligger helt på envelopekörningen** och rörs inte av det här. **Del D ligger
på helklippskörningen**, och dess tal ska läsas med att banan inne i envelopen inte är bitvis
identisk med den S-32–S-34 mätte på. Talet som spelar roll i del D är storleken på en vändning,
inte vilken ruta den ligger på, och medianskillnaden i landmärke är 0,0009 — men det är en
förklaring, inte ett bevis.

---

## A. Flersvingsflaggan — tre räkningar, ingen tröskel

`h` = −y för mittpunkten mellan handled 15 och 16, alltså handhöjd med **upp = större**. Det är
samma bana E1/E2/E3 läser, bara med ombytt tecken. **Adresshöjden är envelopens egen första
ruta** — ingen vald nivå.

| | vad den räknar | vad en enda sving ger |
|---|---|---|
| **K1** | separata **utflykter** över adresshöjd med full amplitud (utflyktens höjd över adress ≥ q × den största utflyktens) | 1 eller 2 |
| **K2** | **återvändningar** till adresshöjd inne i envelopen: rutor i följd med h ≤ adresshöjd som inte rör envelopens ändar | 0 eller 1 |
| **K3** | vändningar med topografisk **prominens** ≥ q × den högsta toppens; oberoende av adressrutan | 1 eller 2 |

**Varför basnivån är två och inte ett.** En golfsving passerar adresshöjd två gånger i höjdled:
upp i toppen och upp i finishen. Det är inte ett antagande — resultat.md §3 mätte redan att
**finishen står högre än toppen** (E1 ligger median 18 rutor *efter* intervallet). Prominens
behöver ingen parameter alls; den är en egenskap hos banan. **Tre är alltså det första talet en
enda sving inte kan ge.**

### Fördelningarna, hela (n = 103 svingar i 81 klipp, rå bana)

| | fördelning | ≥ 3 (resp. ≥ 2) |
|---|---|---|
| **K1**, q = 0,3 | 1:81  2:21  5:1 | 1 sving i 1 klipp |
| **K1**, q = 0,5 | 1:82  2:20  5:1 | 1 sving i 1 klipp |
| **K1**, q = 0,7 | 1:84  2:18  5:1 | 1 sving i 1 klipp |
| **K2** | 0:70  1:27  2:3  3:1  4:1  5:1 | **≥2:** 6 svingar i 6 klipp |
| **K3**, q = 0,3 | 1:80  2:18  3:3  4:1  6:1 | 5 svingar i 5 klipp |
| **K3**, q = 0,5 | 1:85  2:16  4:1  6:1 | 2 svingar i 2 klipp |
| **K3**, q = 0,7 | 1:90  2:11  3:1  4:1 | 2 svingar i 2 klipp |

*(På den utjämnade banan, E3:s fönster 3: K1 ≥3 på 1, K2 ≥2 på 3, K3 ≥3 på 1–2. Samma bild,
färre småtoppar.)*

**Fördelningarna är i princip tvåvärda.** 82 av 103 har en enda utflykt, 20 har två, och **en har
fem**. Nivån q flyttar en handfull rader och flyttar inte slutsatsen — det är därför tre nivåer
står här i stället för en.

### Kandidaterna, med utlösande kriterium

Hela rundans jämförelsetal, per sving: rutsteget i h har median **0,0068** (p90 0,0116), det
**största** rutsteget har median **0,048** (p90 0,092, max 0,197), och den lägsta handledens
`visibility` har median 0,43 (p10 0,31).

| id | klipp | K1 (.3/.5/.7) | K2 | K3 (.3/.5/.7) | längd | största rutsteg | utflykternas höjd över adress | kriterium |
|---|---|---|---:|---|---:|---:|---|---|
| **S32-092** | 005.mp4 *(lång env)* | **5/5/5** | **5** | **6/6/4** | 8,5 s | **0,197** | 0,216 · 0,225 · 0,004 · 0,192 · 0,253 · 0,188 | **K1+K2+K3** |
| S32-005 | 048.mp4 | 2/2/1 | 2 | 2/2/1 | 1,8 s | 0,084 | **0,000** · 0,136 · 0,238 | K2 |
| S32-030 | 008.mp4 | 2/2/1 | 2 | 1/1/1 | 1,7 s | 0,052 | 0,085 · **0,008** · 0,124 | K2 |
| S32-041 | 040.mp4 *(lång env)* | 2/2/2 | 2 | 1/1/1 | 3,9 s | 0,035 | 0,106 · **0,018** · 0,114 | K2 |
| S32-074 | 001.mp4 *(lång env)* | 1/1/1 | 0 | 4/4/3 | 4,3 s | 0,003 | 0,115 | K3 |
| S32-058 | 022.mp4 | 2/1/1 | 4 | 2/1/1 | 1,6 s | 0,058 | **0,000** · 0,178 · **0,003** · 0,055 | K2 |
| S32-080 | 080.mp4 | 1/1/1 | 3 | 2/1/1 | 1,9 s | 0,092 | 0,045 · 0,059 · **0,007** · 0,305 | K2 |

**Bara `S32-092` tänder på mer än ett kriterium, och den tänder på alla tre.** **Fem av de sex
övriga tänder på K2**, och deras extra utflykter är 0,000–0,059 höga mot den största utflyktens
0,124–0,305 — alltså banan som skrapar mot adressnivån en extra gång vid envelopens kant, inte en
andra sving. **K2 är parameterfri och betalar för det med att den räknar även triviala
återvändningar; det syns i tabellen i stället för att vara bortstädat.**

**`S32-074` (`001.mp4`) är ett annat slags falsklarm, och det pekar rakt på del D.** Den har **en
enda utflykt**, som täcker hela envelopen (rutor 1–128), och banan stiger monotont fram till
**envelopens sista ruta, som också är dess högsta**. Dess prominentaste vändning har prominens
**0,00084** — en tusendel av rundans typiska — så fyra mikrovågor når halva den, och K3 blir 4.
**Flaggan säger alltså inte att envelopen bär flera svingar; den säger att den inte bär någon
vändning alls.** Del D mäter samma sak från andra hållet: klippets riktiga topp ligger **efter**
envelopens slut. Det är också en av de två svingar där E3 inte gav något svar och en av de fem där
båda bedömarna satte osäker.

**`S32-092` ska läsas med en varning.** Den har rundans **största enskilda rutsteg** (0,197 mot
median 0,048) och en `visibility` på 0,32, i understa tiondelen. Fem utflykter i en 8,5 s
lång envelope kan vara fem vändningar eller ett spår som tappar handlederna och hittar dem
igen. **Räkningen kan inte skilja dem åt, och ingen har öppnat klippet.** `S32-092` är dessutom
E2:s värsta rad i hela rundan (+205 rutor, subframe.md §7).

**Registret har 15 klipp med mer än en registrerad sving** (022, 041, 045, 054, 059, 064, 072,
073, 077, 082, 088, 089, 090, 093, 095). Det är ett annat påstående än flaggan — det säger att
klippet bär flera svingar, inte att en envelope gör det.

---

## A2. Flaggan korsad mot E2:s svans och mot E4:s utanför-rader

`flaggad` = K1 ≥ 3 **eller** K2 ≥ 2 **eller** K3 ≥ 3 på den råa banan (q = 0,5). De tre slås ihop
till en grupp bara för att grupperna är små. **Ingen rad är struken och ingen siffra omräknad.**

| grupp | n (rader) | klipp | flaggade | andel | största rutsteg, p90 |
|---|---:|---:|---:|---:|---:|
| **E2:s svans** (subframe.md §7) | 10 | 9 | 2 | **20 %** | **0,197** |
| **E4 utanför spannet** | 49 | 40 | 4 | 8 % | 0,115 |
| — därav **ingen armad kandidat** | 23 | 18 | **1** | **4 %** | 0,073 |
| — därav kandidater finns | 26 | 23 | 3 | 12 % | 0,168 |
| E4 inne i spannet | 42 | 36 | 1 | 2 % | 0,079 |
| *alla med spann* | *91* | *73* | *5* | *5 %* | *0,092* |
| *alla med posebana* | *103* | *81* | *7* | *7 %* | *0,092* |

**Svaret på frågan: nästan ingenting av "ingen kandidat" är flersvingsklipp.** Den gruppen har
**lägst** flaggandel i hela tabellen (4 %, en enda rad: `S32-030`), och dess envelopes är korta —
median 1,6 s, max 4,7 s. **20 av de 23 har exakt en utflykt, och alla 23 har exakt en prominent
vändning** (K3 = 1).

**Det som däremot skiljer E2:s svans är banans stabilitet, inte antalet svingar.** Svansens p90
för det största rutsteget är **0,197 mot rundans 0,092**, och **fyra av rundans fem största
rutsteg ligger i svansen** (`S32-092` 0,197, `S32-037` 0,170, `S32-013` 0,168, `S32-062` 0,152).
Det är en ny observation och den är inte mätt mot något: **n = 10 rader i 9 klipp, och att den
stämmer med att svansen är tung på långa envelopes är inte en förklaring utan en andra
observation.**

### E2:s svans, rad för rad

| id | klipp | K1 | K2 | K3 | längd | största rutsteg | kandidater | E4 | grupp i crossing-selection §2 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| **S32-092** | 005.mp4 | **5** | **5** | **6** | 8,5 | **0,197** | 6 | −3 | kandidater finns |
| S32-078 | 095.mp4 | 1 | 0 | 2 | 5,0 | 0,115 | 3 | +1 | kandidater finns |
| S32-103 | 089.mp4 | 2 | 1 | 2 | 3,7 | 0,053 | 2 | −1 | kandidater finns |
| S32-085 | 036.mp4 | 1 | 0 | 2 | 3,3 | 0,046 | 3 | 0 | E4 inne |
| S32-062 | 095.mp4 | 1 | 0 | 2 | 3,1 | 0,152 | 2 | +1 | kandidater finns |
| S32-010 | 056.mp4 | 1 | 1 | 2 | 2,9 | 0,060 | 2 | −1 | kandidater finns |
| S32-037 | 083.mp4 | 1 | 0 | 2 | 2,6 | 0,170 | 2 | −1 | kandidater finns |
| **S32-041** | 040.mp4 | 2 | **2** | 1 | 3,9 | 0,035 | 2 | +1 | kandidater finns |
| S32-013 | 057.mp4 | 1 | 1 | 2 | 2,3 | 0,168 | 3 | **−26** | kandidater finns |
| S32-055 | 022.mp4 | 1 | 0 | 2 | 2,4 | 0,047 | 2 | 0 | E4 inne |

**8 av 10 har K1 = 1–2 och K3 = 1–2, alltså en enda sving.** E2:s svans är inte
flersvingsklipp — den är det subframe.md §7 redan sa den var: ett ankare som hamnar i
genomsvinget. `S32-013`, raden som bär crossing-selection §2:s −26, är inte flaggad.

---

## B. Armningen — finns en OARMAD teckenväxling inne i människornas intervall?

En **oarmad växling** är ett `−→+`-teckenbyte i E3:s egen utjämnade v_y **utan hysteres alls**:
`v_y[j] ≤ 0 < v_y[j+1]`. Det är inte en ny estimator och ingenting returnerar den — **det är
mängden E3 söker inne i, innan 0,10-grinden tar bort det mesta av den.** *Inne i intervallet*
betyder att växlingens egen svarsruta (`j+1`, E3:s konvention) ligger i bedömarnas union.

| grupp | n (rader / klipp) | oarmad växling **inne** | samma med **1 rutas marginal** | närmaste oarmade växlings \|avstånd\| |
|---|---|---:|---:|---|
| **de 23 utan armad kandidat** | 23 / 18 | **1 (4 %)** | 10 (43 %) | median **2**, p90 3, max 5 |
| de övriga utanför-raderna | 26 / 23 | 3 (12 %) | 14 (54 %) | median 1, p90 4, max 6 |
| *alla utanför-rader* | *49 / 40* | *4 (8 %)* | *24 (49 %)* | *median 2, p90 3, max 6* |
| raderna där E4 ligger **inne** | 42 / 36 | 27 (64 %) | **42 (100 %)** | median **0**, p90 1, max 1 |

**Den avgörande raden är den första.** På **22 av de 23** finns det **ingen teckenväxling alls**
inne i intervallet — varken armad eller oarmad. Och på **alla 22** är den närmaste oarmade
växlingen **E3:s egen**: den som redan valdes, 1–5 rutor (median 2) före eller efter intervallet.

**Det betyder att hysteresen inte filtrerade bort någonting där.** Det finns inget att filtrera.
Mittpunktens v_y byter helt enkelt inte tecken i den ruta ögat pekar på — den byter tecken ett par
rutor tidigare, och det är precis den förskjutning S-32 mätte till −1 ruta och S-33 till −0,24
subrutor.

### Den enda raden där en oarmad växling faktiskt låg inne

| id | klipp | växlingens ruta | spann | negativa löpan | positiva löpan | vad som stoppade den |
|---|---|---:|---|---|---|---|
| **S32-038** | 064.mp4 | 28 | 26–28 | min **−0,002**, längd **1 ruta** | max +0,546, längd 21 rutor | **amplitud, negativa sidan** |

**Grinden armar vid −0,10; löpan nådde −0,002 och var en enda ruta lång.** Den positiva sidan
hade räckt med marginal (+0,546 mot +0,10). **n = 1.** Det säger vad som hände på den raden och
ingenting om vad en annan hysteres skulle göra — det vore ett svep mot ett sett facit, och det
görs inte här. **Ingen ny tröskel sätts och ingen föreslås.**

### Kontrollen som gör siffrorna läsbara

På de 42 rader där E4 ligger **inne** ligger den närmaste oarmade växlingen **0 rutor** från
intervallet i median, och med en rutas marginal finns en på **42 av 42**. Serien har alltså en
växling där ögat pekar när E4 träffar, och saknar den när E4 missar. **Det är samma sak som
crossing-selection §2 sa med armade växlingar, nu sagt utan hysteresen inblandad.**

---

## C. `054.mp4` — se [subframe.md §8](subframe.md)

Mätningen inuti `S32-084` står i [subframe.md](subframe.md) §8, som är omskriven i den här
omgången: slutsatsen att `054` är ett genuint bedömningsfel står kvar som **ohanterad**, den
förklaras **inte** av flera svingar i samma envelope, och talen och historiken är oförändrade.
Det som är nytt där är tre mätningar — var handledsbanans vändningar ligger, vad som händer vid
ruta 53,5, och om CVAT-etiketten `f00 backswing` är förenlig med en topp vid 17–18.

**Ingen kontroll stryks, inget kontrollmått räknas om, [resultat.md](resultat.md) §1 och §7 står
orörda.**

---

## D. Det motsatta felet — svingar som inget segment fångar

En **vändning** är ett lokalt maximum av handhöjd med en topografisk **prominens**. Hur stor den
måste vara för att räknas tas ur **klippets egna registrerade svingar**: den minsta prominens
någon av klippets registrerade toppar har, mätt på samma helklippsbana. Frågan är alltså *"finns
det en vändning utanför varenda envelope som är minst lika stor som den minsta vändning rundan
redan kallat en sving i just det klippet?"* — **en jämförelse mot rundans egna svingar, inte mot
ett tal jag valt.** Hela fördelningen står nedan så att jämförelsen går att flytta.

*(Referensen är den **prominentaste vändningen inne i envelopen**, inte envelopens högsta ruta.
Den högsta rutan är oftast finishen, och den ligger ofta på envelopens kant där händerna
fortfarande stiger — då har den ingen egen prominens.)*

| | |
|---|---|
| klipp med en referens | **81 av 81** |
| klipplängd | median **8,7 s** |
| envelopetäckning av klippet | median **24 %** |
| klipp med ≥1 vändning utanför alla envelopes som når referensen | **16 av 81** |
| — därav med en vändning ≥ klippets **största** registrerade sving | **12** |
| totalt antal sådana vändningar | 41 |

### Klipp för klipp

`ref` är minsta och `max` största registrerade prominens i klippet; `pose` är hur stor andel av
±0,5 s runt vändningen som faktiskt bar en pose.

| klipp | längd | täckn | reg. svingar | ref | max | kand | de största kandidaterna |
|---|---:|---:|---:|---:|---:|---:|---|
| **001.mp4** | 32,8 s | 13 % | 1 | **0,0017** | 0,0017 | 23 | **9,4 s (77×)**, 14,9 s (61×), 31,3 s (13×), 17,7 s (7,8×) |
| 056.mp4 | 10,6 s | 27 % | 1 | 0,154 | 0,154 | 1 | 8,3 s (1,71×) — **pose på bara 7 % av ±0,5 s** |
| 011.mp4 | 6,8 s | 17 % | 1 | 0,160 | 0,160 | 1 | 3,4 s (1,41×) |
| 008.mp4 | 7,3 s | 23 % | 1 | 0,099 | 0,099 | 1 | 2,9 s (1,37×) |
| 059.mp4 | 15,9 s | 22 % | 2 | 0,138 | 0,191 | 2 | 2,0 s (1,21×), 2,7 s (1,17×) |
| 045.mp4 | 31,6 s | 34 % | 3 | 0,137 | 0,164 | 3 | 15,2 s (1,09×), 11,0 s (0,95×), 14,5 s (0,88×) |
| 073.mp4 | 17,1 s | 33 % | 2 | 0,153 | 0,154 | 1 | 3,9 s (1,07×) |
| **054.mp4** | 23,9 s | 20 % | 2 | 0,249 | 0,254 | **1** | **10,9 s (1,05×)** |
| 039.mp4 | 41,5 s | 4 % | 1 | 0,297 | 0,297 | 1 | 16,7 s (1,04×) |
| 012.mp4 | 19,5 s | 8 % | 1 | 0,185 | 0,185 | 1 | 16,5 s (1,04×) — pose på 55 % |
| 033.mp4 | 15,2 s | 10 % | 1 | 0,120 | 0,120 | 1 | 4,0 s (1,02×) |
| 057.mp4 | 41,3 s | 5 % | 1 | 0,294 | 0,294 | 1 | 17,6 s (1,01×) |
| 064.mp4 | 16,9 s | 19 % | 2 | 0,159 | 0,164 | 1 | 1,7 s (0,97×) |
| 082.mp4 | 7,3 s | 44 % | 2 | 0,163 | 0,197 | 1 | 4,5 s (0,89×) |
| 089.mp4 | 16,1 s | 39 % | 3 | 0,093 | 0,138 | 1 | 9,0 s (0,85×) |
| 072.mp4 | 19,7 s | 31 % | 3 | 0,022 | 0,228 | 1 | 6,0 s (0,12×) |

*(Kvoterna är mot klippets **största** registrerade sving. Fördelningen: median 1,29, p90 6,29,
max 77,5, n = 41. Vid ≥0,5 × den största: 40 vändningar i 15 klipp; vid ≥1,0 ×: 35 i 12 klipp;
vid ≥1,5 ×: 18 i 2 klipp. **65 klipp har ingen sådan vändning alls.**)*

### `054.mp4` — raden frågan ställdes om

| | |
|---|---|
| längd | 23,9 s, envelopetäckning 20 % |
| registrerad: `S32-084` | prominentaste vändning **t 4,07 s**, prominens 0,2535 |
| registrerad: `S32-099` | prominentaste vändning **t 21,10 s**, prominens 0,2492 |
| **kandidat utanför alla envelopes** | **t 10,90 s**, prominens 0,2659 = **1,05 ×** den största registrerade, pose på 100 % av ±0,5 s |

**Den saknade svingen finns och är lika stor som de två som registrerades.** Frågan ställdes om
en sving vid ~9 s; banans vändning ligger vid 10,9 s, alltså toppen av den svingen och inte dess
start. Det är ett klipp, och ingen har öppnat det.

### Det värsta fallet är inte `054`

**`001.mp4` är kvalitativt annorlunda.** Dess enda envelope (`S32-074`, 4,067–8,333 s, lång envelope)
täcker en sträcka där handhöjden stiger monotont hela vägen till envelopens slut: den
prominentaste vändningen *inne* i envelopen har prominens **0,0017**, medan klippets riktiga
vändningar ligger vid **9,4 s (0,131)** och **14,9 s (0,104)** — ungefär **en sekund efter** att
envelopen tagit slut, och sedan igen. **Envelopen slutar innan toppen.**

Det är inte en ny gissning om varför:

- `S32-074` är en av de **två svingar där E3 inte gav något svar alls** (resultat.md §5);
- den är en av de **fem där båda bedömarna satte osäker** (resultat.md §5);
- den har lång envelope (> 3,0 s), den saknar säkert nedslag (`impact: None`), och den är
  inte en kontroll.

**Fyra oberoende ting pekar åt samma håll på samma sving, och det tredje är nytt här.** n = 1
klipp. **Ingen ändring i segmenteringen föreslås**, och ingen har tittat på klippet.

> **Tillagt 2026-09-19 (S-36), inget tal här ändrat.** De 41 vändningarna i 16 klipp är nu
> **klassade** i [envelope-audit.md](envelope-audit.md) §2, på banans form i stället för dess
> amplitud: **7 klipp missad sving** (1 marginell), **4 finishtopp utanför envelopen** — alltså
> finishen, som står högre än toppen, inte en missad sving — **2 kapad kant på själva toppen**
> (`001.mp4`, `011.mp4`), 2 rörelse utanför svingen (1 marginell) och 1 ej avgörbar. **Kolumnen
> `kand` för `001.mp4` (23) är en följd av dess degenererade referens 0,0017**, precis som texten
> ovan säger; 22 av de 23 är klassade `ej avgörbar` av det skälet. Samma omgång visar att
> bedömarvyn och estimatorn fick **samma bildrutor på 103 av 103 svingar**, och att produktionen
> redan bär egna flaggor för det här: `clippedTail` 7 av 103 och **`suspectMultiSwing` 15 av 103**
> — den senare tänder på tre av del A:s sju.

### Vad som talar emot att läsa tabellen som 16 missade svingar

- **`056.mp4`:s kandidat har pose på 7 % av ±0,5 s runt sig** — en ensam bildruta mellan luckor
  gör en hög "vändning" av ingenting. Samma varning i mindre grad för `012.mp4` (55 %).
- **MediaPipe spårar den som syns.** En vändning utanför en envelope kan vara en provsving, en
  waggle, någon som plockar upp en boll eller en kamera som bärs. **Ingen har öppnat en enda
  bildruta**, och det här räknar kandidater — det identifierar dem inte.
- **Täckningen är låg i hela rundan** (median 24 % av klippet), så det finns gott om tid utanför
  envelopen där vad som helst kan hända. Det är inte samma sak som att segmenteringen missade en
  sving.

---

## Vad som INTE mättes

- **Ingen ny estimator, ingen tröskel, ingen kalibrering, inget skift, ingen produktionskod.**
  S-30:s spärr ligger kvar. Vad som är nära nog är fortfarande ett beslut för en annan dag.
- **Ingen parameter rörd.** Hysteresen 0,10 och fönstret 3 är E3:s egna. Del A:s q redovisas vid
  tre nivåer just för att slippa välja en, och ingen av dem används till något annat än att
  namnge en grupp.
- **Vad de flaggade envelopesen faktiskt visar.** Flaggan räknar vändningar på en bana. Den kan
  inte skilja två svingar från en provsving, en waggle eller ett spår som tappar handlederna —
  och `S32-092`, den enda som tänder på allt, har rundans största rutsteg. **Ingen har öppnat ett
  enda klipp.**
- **Om en annan hysteres hade hittat växlingen i del B.** Inte prövat. Det vore ett svep mot ett
  sett facit.
- **Vad den första utflykten i `S32-084` är.** Mätt att den finns och hur hög den är; inte vad
  den visar.
- **Om `001.mp4`:s envelope går att laga.** Diagnosen säger att den slutar innan toppen. Vad som
  skulle flytta den är en ändring i segmenteringen och ligger utanför den här omgången.
- **Del D:s kandidater, en och en.** 41 vändningar i 16 klipp är räknade, inte identifierade.
- **Paritet mot webbkedjan.** Samma fem avvikelser som [top-from-pose.md](../top-from-pose.md)
  listar gäller oförändrat, plus `opencv`/`numpy`-versionerna, plus **den varma spåraren i del D**
  (§0). Kontrollraden i §0 är allt som talar för att det första inte spelar roll; för det sista
  står skillnaden mätt i §0 och är inte noll.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena.
- **De 4 svingar där båda teg.** Ingen estimator kan poängsättas där.
- **Händighet.** `unknown` på alla 103 svingar, oförändrat sedan S-32.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1) och `opencv-python`, samt
`public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna (envelopebanorna behover dem)
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. envelopebanorna, ~15 min for 103 svingar (lokalt, kostnadsfritt, inget API)
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. del A, A2, B och C (--section: flag | cross | arming | c054 | all)
python docs/shaft/top-review/multiswing.py <tmp>/pose --section all

# 4. helklippsbanorna for del D, ~16 min for 81 klipp
<venv>/Scripts/python.exe docs/shaft/top-review/run_pose_clip.py <tmp>/clippose

# 5. del D, med avvikelsekontrollen mot envelopekorningen
python docs/shaft/top-review/clip_swings.py <tmp>/clippose --envPoseDir <tmp>/pose
```

`multiswing.py` och `clip_swings.py` skriver bara till stdout; `run_pose_clip.py` skriver bara
under den katalog den får som argument. **Läs kontrollraden överst i `multiswing.py`:s utdata
först:** stämmer den inte med [resultat.md](resultat.md), [subframe.md](subframe.md) och
[crossing-selection.md](crossing-selection.md) har posebanorna drivit och inget gäller.
