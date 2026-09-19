# Är E3/E4:s svans en felvald teckenväxling? (S-34, diagnos)

> 2026-09-19, `stream-shaft`. **Read-only diagnos — ingen ny estimator, ingen tröskel, ingen
> kalibrering applicerad, ingen produktionskod läst eller skriven.** `src/lib/shaft/measure/`,
> `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen och S-30:s spärr är orörda.
>
> **Facit var sett.** [resultat.md](resultat.md) och [subframe.md](subframe.md) låg färdiga och
> lästes först, så risken här är inte mätfel — den är anpassning. Därför: **ingen parameter svept,
> ingen justerad, ingenting valt.** Hysteresen 0,10 och fönstret 3 är E3:s egna och är oförändrade.
> Varje tal nedan är en räkning eller en kvantil av den runda som redan ligger.
>
> Skript: [crossing_selection.py](crossing_selection.py) (skriver bara till stdout). Underlaget är
> S-32:s runda — **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor**, Erik pass 1 och
> Lisa bedömda oberoende. **Klippet är den oberoende enheten** och n står som rader *och* klipp.

## Kort svar

**Nej. Hypotesen håller inte för huvuddelen, och den håller för de tre yttersta raderna.**

Av de **49 rader (40 klipp)** där E4 ligger utanför det mänskliga spannet finns det en **annan**
teckenväxling som E3 kunnat välja, och som hade landat inne, på **1 rad av 49 (2 %)**. Mot Erik
ensam: **0 av 60**. Mot Lisa ensam: **1 av 55**. Den valda växlingen är **redan den som ligger
närmast spannet på 46 av 49 rader (94 %)**.

**Det är inte "fel växling vald". På nästan hela svansen finns ingen växling att välja i stället.**
På **23 av 49 rader (47 %, 18 klipp)** har svingen bara *en* kandidat i hela envelopen — E3 hade
inget val alls. På **25 av 49 (51 %, 22 klipp)** finns flera, men ingen av dem träffar heller.

**De tre rader där en annan växling ligger närmare är exakt de tre som ligger längst bort.**
S32-013 (−26 rutor, en kandidat 1 ruta från spannet), S32-080 (−16, en kandidat inne) och S32-090
(−9, en kandidat 7 rutor bort). Nästa rad i ordningen ligger −5, och från och med den är den valda
växlingen alltid den närmaste, utan undantag. **Den yttersta svansen — de rader som drar max till
25–26 — ser ut som ett växlingsval; resten av missarna gör det inte.** n = 3 rader i 3 klipp.

**E6:s klämning är inte en felkonstruerad bracket.** Där en enskild handled klämdes hade den
handleden alltid en egen armad växling någon annanstans i envelopen, i median **1 ruta** från E3:s
bracket, och den låg utanför bracketen på 18–21 %. De klämda raderna är dessutom **inte sämre** än
de oklämda (|avstånd| median 1 mot 0). Bracketen ligger rätt inom en ruta; det är handledens serie
som inte byter tecken där, inte bracketen som pekar fel.

---

## 0. Reproduktion — posebanorna fanns inte kvar, igen

Samma sak som i [subframe.md](subframe.md) §0: S-33:s poseutdata låg i en temp-katalog som är
städad och det venv som körde MediaPipe finns inte kvar. **Banorna kördes om från början** med
`run_pose.py`, oförändrad, mot samma `public/models/pose_landmarker_lite.task` och **`mediapipe`
1.0.1 — samma version S-31 och S-33 körde.** `opencv-python` 5.0.0 och `numpy` 2.4.6 i det nya
venv:et; vilka versioner S-33 hade går inte att läsa ut i efterhand, så att de är desamma är **inte
verifierat** — det är kontrollraden som talar för att det inte spelar roll.

Skriptet kontrollerar per sving att posebanans envelope-rutor är samma rutor i samma ordning som
registrets `frameTimes` och stannar annars, och skriver kontrollraden före allt annat:

| | E3 inne | E3 median | E4 RND inne |
|---|---:|---:|---:|
| mot Erik pass 1 (n=93) | 23 | −1 | 33 |
| mot Lisa (n=95) | 27 | −1 | 40 |
| mot spannet (n=91) | 30 | −1 | 42 |

**E3-talen är identiska med [resultat.md](resultat.md) och E4-talen identiska med
[subframe.md](subframe.md).** Stämmer inte den raden har posebanorna drivit och inget nedan gäller.

**101 av 103 svingar (79 klipp) har en posebana och ett E3-val.** De två som saknar val är
`S32-074` och `S32-053`, precis som resultat.md §5 skrev.

E1/E2/E3 plockas ur `analyze_pose.py` med samma AST-lyft som `score_round.py`;
`crossing_selection.py` återanvänder dessutom `subframe.py`:s `e3_bracket`, `crossing_fraction`,
`vy_from_y`, `wrist_track` och `rnd` — ingenting är återimplementerat.

## Vad en "kandidat" är

Frågan *"finns det en annan teckenväxling?"* är bara meningsfull om alternativen är sådant E3
faktiskt kunnat returnera. Därför är kandidatmängden **E3:s egen sökning, med stoppet borttaget**:
`e3_signflip` armar när den utjämnade v_y faller under −0,10 och returnerar **första** rutan över
+0,10, tillbakabackad till sista rutan med v_y ≤ 0. `crossings()` kör samma slinga men **samlar
varje armad växling i stället för att returnera den första**, och armar om vid nästa dipp under
−0,10. **E3:s svar är alltid kandidat nr 1** — skriptet jämför mot `e3_signflip` per sving och
stannar om de är oense, så det är kontrollerat och inte antaget.

Varje kandidat får sitt svar med **E4:s regel** (linjär interpolation av nollgenomgången på rå v_y
inne i den kandidatens bracket), avrundat till hel ruta. **E4 är referensen och inte E3**, eftersom
frågan gäller den svans som överlevde S-33:s interpolation; E3:s eget in/ut står bredvid överallt.

---

## 1. Hur många teckenväxlingar finns det per sving?

| | median | p90 | max | fördelning |
|---|---:|---:|---:|---|
| **E3-kandidater** (armade −→+, hysteres 0,10) | **1** | 2 | **6** | 1:56  2:35  3:7  4:2  6:1 |
| alla nollgenomgångar (båda hållen, ingen hysteres) | 4 | 11 | 25 | — |

n = 101 svingar i 79 klipp.

**Den viktigaste siffran i tabellen är att 56 av 101 svingar har exakt en kandidat.** På drygt
hälften av rundan finns ingen alternativ växling överhuvudtaget — E3 väljer inte, den tar det enda
som finns. Hysteresen gör mycket av det arbetet: utan den finns i median 4 teckenbyten, med den 1.

### Delat på om E4 ligger inne i spannet

n = 91 rader i 73 klipp har ett mänskligt spann; de övriga 10 har minst en osäker och kan inte delas
så här alls (se §3).

| | n (rader / klipp) | kandidater, median | max | fördelning |
|---|---|---:|---:|---|
| **E4 inne** | 42 / 36 | 1 | 3 | 1:26  2:14  3:2 |
| **E4 utanför** | 49 / 40 | **2** | **6** | 1:23  2:19  3:5  4:1  6:1 |

*(Samma delning på E3:s egen ruta: inne n=30, kandidater median 1, max 3; utanför n=61, median 1,
max 6.)*

**De som missar har fler kandidater — men skillnaden är en halv kandidat i median**, och 23 av de
49 som missar har fortfarande bara en. Antalet växlingar skiljer alltså grupperna svagt, och det är
inte samma sak som att den rätta finns bland dem. Det avgörs i §2.

---

## 2. Finns det en annan växling som ligger inne i intervallet?

Det här är frågan som skiljer **"fel växling vald"** från **"ingen växling finns där"**. En kandidat
räknas som inne om dess E4-svar avrundat till hel ruta ligger i intervallet; det oavrundade
subrutesvaret (strikt) ger samma tal överallt och står bredvid, aldrig i stället för.

### Mot det mänskliga spannet (n = 91 rader i 73 klipp; E4 utanför på 49 rader i 40 klipp)

| | rader | andel | klipp |
|---|---:|---:|---:|
| **en ANNAN kandidat ligger inne** | **1 av 49** | **2 %** | 1 |
| ingen annan kandidat **finns** alls (svingen har bara en) | 23 av 49 | 47 % | 18 |
| kandidater finns men **ingen** av dem träffar | 25 av 49 | 51 % | 22 |

### Mot vardera annotatören för sig

| | E4 utanför | en annan kandidat inne | ingen kandidat finns | ingen träffar |
|---|---|---:|---:|---:|
| mot **Erik pass 1** (n=93 / 75 klipp) | 60 rader / 47 klipp | **0 (0 %)** | 31 (52 %) | 29 (48 %) |
| mot **Lisa** (n=95 / 75 klipp) | 55 rader / 45 klipp | **1 (2 %)** | 27 (49 %) | 27 (49 %) |

**Hypotesen faller på den här raden.** Den ena träffande kandidaten är nr 2 i ordningen på
`S32-080` (`080.mp4`) och är samma rad mot Lisa och mot spannet. **Det finns ingen andra växling
att flytta till på 48 av 49 rader.**

### Hur nära kommer den bästa kandidaten, när ingen träffar?

*Tillagt efter att raden ovan kom tillbaka nästan tom.* `bästa` är bara kandidaten med minst
|avstånd| — **det är inte "den rätta"**, och ingenting väljs på den. Ren beskrivning.

| | median | p90 | max |
|---|---:|---:|---:|
| **bästa** kandidatens \|avstånd\| (n=49) | 1 | 3 | **7** |
| den **valda** kandidatens \|avstånd\| | 2 | 4 | **26** |

- **Den valda är redan den bästa på 46 av 49 rader (94 %).**
- Bästa kandidaten ligger ≤1 ruta från spannet på 26 av 49 (53 %).

**De tre rader där en annan kandidat ligger närmare är exakt de tre som ligger längst bort:**

| id | klipp | vald | närmaste | avstånd, vald | avstånd, närmaste | kandidater |
|---|---|---:|---:|---:|---:|---:|
| **S32-013** | 057.mp4 | ruta 3,4 | 28,1 | **−26** | −1 | 3 |
| **S32-080** | 080.mp4 | 14,7 | 31,1 | **−16** | **0** (inne) | 3 |
| **S32-090** | 024.mp4 | 14,5 | 32,0 | **−9** | +7 | 2 |

Nästa rad i ordningen ligger −5 rutor bort, och från och med den är den valda växlingen den
närmaste på varenda rad. **Uppdelat på avstånd:**

| grupp | \|avstånd\| median | p90 | max | n |
|---|---:|---:|---:|---:|
| fel växling vald | 16 | 16 | 16 | **1** |
| ingen kandidat alls | 1 | 2 | 5 | 23 |
| ingen kandidat träffar | 2 | 4 | **26** | 25 |

**Slutsatsen i två meningar:** den typiska missen är 1–2 rutor och har ingen alternativ växling
alls — den är inte ett val. Den yttersta svansen, de tre rader som drar maxtalet till 25–26, är
däremot ett val, och där ligger den andra växlingen 16–27 rutor bort. **n = 3 rader i 3 klipp,
och det är för lite för att bygga något på.**

---

## 3. Är de felvalda en klass?

**Gruppen "fel växling vald" är en enda rad.** Den kan per definition inte vara en klass, och
uppdelningen nedan är därför gjord på de två grupper som faktiskt bär svansen. Grupperna är skurna
på **svaret** (E4 inne/utanför) och på kovariater registret redan bär; ingen grupp är skuren på
något som mättes efteråt.

| | n (rader/klipp) | slow-mo | utan säkert nedslag | face-on | spegelvänd | kontroll | Erik bred (≥4) |
|---|---|---:|---:|---:|---:|---:|---:|
| **E4 inne** | 42 / 36 | 12 % | 17 % | 10 % | 0 | 45 % | 12 % |
| fel växling vald | **1** / 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| **ingen kandidat alls** | 23 / 18 | **4 %** | **26 %** | 9 % | 0 | 52 % | **17 %** |
| **ingen kandidat träffar** | 25 / 22 | **20 %** | **12 %** | 4 % | **2 (8 %)** | 40 % | **0 %** |
| alla utanför | 49 / 40 | 12 % | 18 % | 6 % | 2 (4 %) | 45 % | 8 % |
| *alla med spann* | *91 / 73* | *12 %* | *18 %* | *8 %* | *2 (2 %)* | *45 %* | *10 %* |

**De två missgrupperna lutar åt olika håll, och det är den enda strukturen i tabellen.**

- **Slow-mo samlas i "ingen kandidat träffar"** (20 % mot 4 % i "ingen kandidat alls"). Det är
  väntat aritmetiskt: fler bildrutor per rörelse ger fler dippar under −0,10 och därmed fler
  kandidater. n = 5 rader i 4 klipp.
- **Svingar utan säkert nedslag samlas i "ingen kandidat alls"** (26 % mot 12 %) — alltså just de
  svingar där den fasderiverade vägen (`FALLBACK_BOUNDS`) är som sämst, och där envelopen är
  bredast. n = 6 rader i 5 klipp. Det är motsatsen till vad man skulle gissa: den lösare envelopen
  ger *färre* kandidater, inte fler.
- **De 9 svingar Erik satte breda ligger alla i "ingen kandidat alls"** (4 av 23) eller inne —
  **noll av dem i "ingen kandidat träffar"**. Där ögat ser en bred platå finns bara en växling.
- **Båda de bekräftat spegelvända svingarna** (`S32-017`, `S32-075`, samma klipp `093.mp4`) ligger
  i "ingen kandidat träffar", båda 3 rutor före spannet med 2 kandidater. **2 svingar i 1 klipp**
  — samma enda klipp som bar rundans sämsta cell i resultat.md §6. Det är en fråga, inte ett fynd.
- **Face-on och andelen kontrollsvingar skiljer inget** mellan grupperna.

### De svingar där någon satte Osäker

**De har inget mänskligt spann och kan därför inte ligga i någon grupp ovan** — det är inte en
utelämning, det är hur spannet är definierat. De poängsätts här mot den bedömare som faktiskt
svarade; de där båda teg poängsätts inte alls.

| | id | klipp | E4 | kandidater | träffar |
|---|---|---|---:|---:|---|
| **exakt en osäker** (6 svingar i 6 klipp) | S32-070 | 029.mp4 | −3 | 1 | – |
| | S32-076 | 031.mp4 *(slow-mo)* | **−29** | 1 | – |
| | S32-020 | 044.mp4 | −1 | 2 | – |
| | S32-026 | 064.mp4 | −5 | 1 | – |
| | S32-093 | 070.mp4 *(slow-mo)* | 0 | 1 | nr 1 |
| | S32-003 | 077.mp4 | −2 | 1 | – |
| **båda osäkra** (4 svingar i 4 klipp) | S32-058 | 022.mp4 | — | 2 | — |
| | S32-072 | 052.mp4 *(slow-mo)* | — | 4 | — |
| | S32-035 | 072.mp4 | — | 1 | — |
| | S32-032 | IMG_5427.MP4 | — | 1 | — |

**E4 ligger inne på 1 av de 6.** `S32-076` är en −29-rad som inte syns någonstans i §2 eftersom
den saknar spann — och den har **en enda kandidat**, alltså ingen alternativ växling heller.
**n = 6 respektive 4. Ingen slutsats dras av dem.**

---

## 4. Vad skiljer den valda växlingen från den rätta?

**Den primära jämförelsen har n = 1**, eftersom §2 bara hittade en rad där en annan kandidat ligger
inne. Den raden är `S32-080` (`080.mp4`), och den redovisas som en rad, inte som en fördelning:

| | vald | rätt |
|---|---:|---:|
| svar (ruta i envelopen) | 14,7 | 31,1 |
| lutning i bracketen (1/s²) | **14,12** | 6,07 |
| amplitud före (mest negativa v_y) | **−0,010** | **−1,523** |
| amplitud efter (max v_y) | 0,726 | 1,395 |
| negativ löpa före, rutor | 3 | **13** |
| positiv löpa efter, rutor | 4 | 8 |
| läge i envelopen (0–1) | 0,23 | 0,54 |
| fraktion i bracketen | 0,66 | 0,08 |

**En rad bär ingenting.** Den står här för att frågan ställdes och för att talen ska finnas.

### 4b. Samma jämförelse mot den *närmaste* kandidaten

*Tillagt efter att 4 visade sig ha n=1.* `närmaste` är kandidaten med minst |avstånd| till spannet
— **det är inte "den rätta", bara den minst fel**, och ingenting väljs på den. Bara rader där den
närmaste inte redan är den valda: **n = 3 rader i 3 klipp** (de tre i §2:s tabell).

| | vald, median | närmaste, median | närmaste större på |
|---|---:|---:|---:|
| lutning i bracketen (1/s²) | **6,85** | **2,19** | 0 av 3 |
| amplitud före (mest negativa v_y) | −0,479 | −0,748 | 1 av 3 |
| **amplitud efter (max v_y)** | **0,211** | **1,395** | **3 av 3** |
| negativ löpa före, rutor | 3 | **13** | 2 av 3 |
| **positiv löpa efter, rutor** | **4** | **8** | **3 av 3** |
| **läge i envelopen (0–1)** | **0,23** | **0,54** | **3 av 3** |
| fraktion i bracketen | 0,52 | 0,11 | 1 av 3 |

Den närmaste ligger i median **16 rutor** närmare spannet (max 25).

**Alla kandidater i de tre svingarna, rad för rad** — så att beskrivningen går att kontrollera mot
talen i stället för att tros:

| sving | # | svar | avstånd | lutning | amp före | amp efter | neg. löpa | pos. löpa | läge | fraktion |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **S32-090** `024.mp4` | **1 vald** | 14,52 | **−9** | 3,65 | −0,514 | 0,123 | 14 | 6 | 0,25 | 0,52 |
| | **2 närmast** | 32,00 | +7 | 1,01 | −0,145 | 0,905 | 11 | 8 | 0,59 | **1,00** |
| **S32-013** `057.mp4` *(utan säkert nedslag)* | **1 vald** | 3,37 | **−26** | 6,85 | −0,479 | 0,211 | 3 | 3 | 0,03 | 0,37 |
| | **2 närmast** | 28,11 | −1 | 2,19 | −0,748 | 1,656 | 22 | 9 | 0,40 | 0,11 |
| | 3 | 50,03 | +20 | 6,80 | −1,156 | 0,497 | 13 | 4 | 0,72 | 0,03 |
| **S32-080** `080.mp4` | **1 vald** | 14,66 | **−16** | 14,12 | −0,010 | 0,726 | 3 | 4 | 0,23 | 0,66 |
| | **2 närmast** | 31,08 | **0** | 6,07 | −1,523 | 1,395 | 13 | 8 | 0,54 | 0,08 |
| | 3 | 47,66 | +15 | 11,79 | −1,172 | 0,265 | 8 | 10 | 0,82 | 0,66 |

**Beskrivningen, utan val.** Tre saker går åt samma håll i alla tre svingarna:

- **läget** — den valda ligger på 0,03–0,25 av envelopen, den närmaste på 0,40–0,59;
- **amplituden efter** — den valda 0,12–0,73, den närmaste 0,91–1,66, alltså **2–8 gånger större**;
- **lutningen i bracketen** — **högre hos den valda i alla tre** (3,65 mot 1,01, 6,85 mot 2,19,
  14,12 mot 6,07). Den brantare växlingen är alltså *inte* den riktiga här, tvärtom mot vad man
  kunde gissa.

**Löporna och amplituden före gör det inte.** Den negativa löpan är längre hos den närmaste i 2 av
3 (S32-090 har 14 mot 11 åt andra hållet), och amplituden före är djupare hos den närmaste i 2 av 3.
Och den närmaste är inte alltid en snygg växling: på **S32-090 ligger den på fraktion 1,00**, alltså
klämd mot bracketkanten.

**Ingen av de storheterna vägs ihop, ingen gräns sätts, ingenting väljs.** Med n = 3 rader i 3
klipp är det en beskrivning av tre svingar, inte ett mönster.

---

## 5. E6:s klämning — är bracketen felkonstruerad?

E3:s bracket är definierad på **mittpunktens** utjämnade v_y. E6 interpolerar en **enskild handleds**
råa v_y i samma bracket, och *klämd* betyder att den handledens serie inte byter tecken där alls, så
svaret faller på en bracketkant. Frågan är var den handledens **egen** växling ligger i stället —
ligger den utanför bracketen är det bracketen som är fel för den handleden, inte växlingsvalet.
Handledens egen växling hittas med **E3:s egen sökning och E3:s egen hysteres**; ingen ny estimator.

| | n (svingar/klipp) | klämd | har en egen växling någon annanstans | dess avstånd från bracketen | **ligger utanför bracketen** (>1 ruta) |
|---|---|---:|---:|---:|---:|
| **handled 15** | 101 / 79 | 33 i 29 klipp | **33 av 33 (100 %)** | median **+1** ruta (p10 −1, p90 +2) | **7 av 33 (21 %)** |
| **handled 16** | 101 / 79 | 45 i 37 klipp | **45 av 45 (100 %)** | median **+1** ruta (p10 −1, p90 +3) | **8 av 45 (18 %)** |

*(33 respektive 45 av 101 är exakt subframe.md §2:s klämningstal.)*

**Svaret är nej — bracketen ligger rätt inom en ruta.** Varje klämd handled har en egen armad
växling, och den ligger i median **en ruta** från E3:s bracket, alltså precis intill. På 18–21 % av
dem ligger den mer än en ruta bort, men aldrig på ett sätt som pekar ut bracketen som systematiskt
felplacerad — medianen är +1, inte +10.

**Och klämningen kostar nästan ingenting.** Mot spannet:

| | klämda | ej klämda |
|---|---|---|
| **handled 15** | n=27, \|avstånd\| median 1, p90 3, max **9**; inne **11** (41 %) | n=64, median 0, p90 3, max 26; inne 33 (52 %) |
| **handled 16** | n=39, median 1, p90 3, max **26**; inne **15** (38 %) | n=52, median 0, p90 2, max 10; inne 30 (58 %) |

De klämda ligger en ruta sämre i median och träffar inne i 38–41 % mot 52–58 %. Byter man ut det
klämda svaret mot handledens **egen** växling ändras träffen knappt: 11 → 13 (handled 15) och
15 → 16 (handled 16), på 27 respektive 39 rader. **Klämningen är alltså en verklig degenerering av
E6, men den är inte det som gör E6 fel — och att laga den flyttar ingenting.**

---

## 6. `054.mp4` — bildrutorna ligger ute, ingen bedömning här

De 86 bildrutorna i `S32-084`:s envelope (2,531–5,395 s) ligger nu som bildfiler under
**`data/shaft/top-round/054-inspekt/`**, i klippets egen upplösning (1080×1920, JPEG 95), en fil per
ruta, namngivna `fNNN_t<sekund>s.jpg`. Skript: [render_envelope.py](render_envelope.py).

**Ingenting är markerat i bild** — ingen ruta, ingen pil, ingen utpekad bildruta. Det som är
registrerat om svingen ligger i `RUTOR.txt` bredvid, som en lista:

- båda bedömarna, och Eriks pass 2, satte **rutor 17–18 (3,067–3,100 s)** — tre oberoende svar, alla
  identiska;
- kontrollens facit `f02 @ 4,282 s` ligger vid **ruta 53,5** i den numreringen;
- exportrutnätet: `f00 @ 3,327 s` (CVAT-etikett `backswing`, ruta 24,8), `f01 @ 4,122 s` (ingen
  CVAT-etikett, ruta 48,7), `f02 @ 4,282 s` (CVAT-etikett `top`, ruta 53,5), därefter `f03`–`f06`;
- nedslag 4,996 s, normal takt, dtl, källa `web`;
- klippet bär två svingar i rundan — den här och `S32-099` (envelope 19,783–21,715 s), alltså inte
  överlappande.

Utrullningen är kontrollerad mot registret: skriptet stannar om de avkodade rutornas tider inte är
registrets `frameTimes`, ruta för ruta. **Ingen har tittat på bilderna och ingen slutsats dras om
dem här.** Katalogen ligger under `data/shaft/*` och är gitignorerad.

---

## Vad som INTE mättes

- **Ingen ny estimator, ingen tröskel, ingen kalibrering, inget skift, ingen produktionskod.**
  S-30:s spärr ligger kvar. Vad som är nära nog är fortfarande ett beslut för en annan dag.
- **Ingen parameter rörd.** Hysteresen 0,10 och fönstret 3 är E3:s egna. Inget svep, ingen
  justering efter att ett tal var sett. Två saker lades till *efter* att §2 kom tillbaka nästan
  tom — avståndet till den **närmaste** kandidaten och jämförelsen i **4b** — och båda är märkta
  som tillägg på plats. De väljer ingenting och flyttar inget tal ovanför sig.
- **Varför kandidaten saknas.** Mätt att 23 av 49 missar bara har en växling; **inte** varför
  handledens v_y inte byter tecken vid den ruta ögat pekar på. Det kräver att någon tittar på
  banan, inte på räkningen.
- **Om en annan hysteres eller ett annat fönster skulle skapa den saknade kandidaten.** Inte
  prövat — det vore ett svep, och ett svep mot ett sett facit är anpassning.
- **Svansen, bortom att den beskrivs.** De tre yttersta raderna ser ut som ett växlingsval. Vad
  som skulle välja rätt bland dem är inte mätt och skulle vara en ny estimator.
- **Vilken enskild handled E6 borde vara.** Oförändrat sedan S-33: `handedness` är `unknown` på
  alla 103 svingar, båda handlederna redovisas, ingen väljs.
- **E2:s svans.** Rörs inte här; [subframe.md](subframe.md) §7 står oförändrad.
- **De 4 svingar där båda teg.** Ingen estimator kan poängsättas där; de står i §3 som en lista.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena. Erik pass 2 används
  bara i `RUTOR.txt` för `054.mp4`.
- **Spegelvändning, face-on, eget material, fps.** Oförändrat sedan S-32: 102 av 103 svingar är
  `web`, all fps är 30, face-on är 10 svingar i 9 klipp, bekräftad spegelvändning är 2 svingar i
  ett klipp. Att båda de spegelvända hamnar i samma missgrupp är 2 rader i 1 klipp.
- **Paritet mot webbkedjan.** Samma fem avvikelser som [top-from-pose.md](../top-from-pose.md)
  listar gäller oförändrat, plus att `opencv`/`numpy` nu är nyare än S-31:s (och att de är samma
  som S-33:s är inte verifierat). Kontrollraden i §0 är allt som talar för att det inte spelar roll.
- **`054.mp4` på bild.** Rutorna är utrullade. **Ingen har tittat på dem**, och §6 säger ingenting
  om vad de visar.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1) och `opencv-python`, samt
`public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna (posebanorna behover dem)
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. handledsbanorna, ~15 min for 103 svingar (lokalt, kostnadsfritt, inget API)
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. den har matningen (--section: counts | alternatives | class | contrast | clamp | all)
python docs/shaft/top-review/crossing_selection.py <tmp>/pose --section all

# 4. bildrutorna for 054.mp4 (behover bara opencv, ingen pose)
training/.venv/Scripts/python.exe docs/shaft/top-review/render_envelope.py \
    S32-084 data/shaft/top-round/054-inspekt
```

`crossing_selection.py` skriver bara till stdout; `render_envelope.py` skriver bara under den
katalog den får som argument. **Läs kontrollraden överst i utdatan först:** stämmer den inte med
[resultat.md](resultat.md) och [subframe.md](subframe.md) har posebanorna drivit och inget gäller.
