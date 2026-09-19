# Den kontrollrika toppomgången: vad två par ögon och tre estimatorer sa (S-32)

> 2026-09-19, `stream-shaft`. **Mätning — ingen produktionskod ändrad, ingen tröskel satt,
> ingen kalibrering applicerad.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG`, `PhaseSource` och teckenkonventionen är orörda. S-30:s spärr ligger kvar.
>
> Omgången är byggd i [build_round.py](build_round.py) och beskriven i [README.md](README.md);
> så här kördes den: [KOR-OMGANGEN.md](KOR-OMGANGEN.md). **103 svingar i 81 oberoende klipp,
> 6 548 envelope-bildrutor** — samma 6 548 som S-28/S-31. Varje siffra nedan har n angivet som
> **rader och klipp**, och klippet är den oberoende enheten.
>
> **Underlaget:** Erik pass 1 (alla 103) och Lisa (alla 103), bedömda oberoende, olika frön och
> olika ordning. **Eriks två pass slås aldrig ihop** — pass 2 (35 svingar) redovisas separat som
> känslighetskontroll i avsnitt 7.

Kört från repo-roten mot S-31:s posebanor (utdatan från `top-from-pose/run_pose.py`):

```sh
python docs/shaft/top-review/score_round.py <poseDir> --section all
python docs/shaft/top-review/score_round.py <poseDir> --section pass2 \
    --answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-erik-pass2.json
python docs/shaft/top-review/score_round.py <poseDir> --section b \
    --answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-erik-pass2.json \
    --restrict data/shaft/top-round/svar-erik-pass2.json
```

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

**Det mänskliga spannet är smalt: två personer som aldrig sett varandras svar överlappar i 90 av
91 svingar och ligger median 0 bildrutor isär i mittpunkt.** Golvet S-31 saknade finns alltså nu,
och det är ungefär **2 bildrutor brett** (unionens median).

**E3 ligger median 1 bildruta från vardera bedömaren och landar inne i det mänskliga spannet i 30
av 91 svingar (33 %).** Förskjutningen är **riktningskonstant** — 89 % (Erik) respektive 88 %
(Lisa) av de rader som inte ligger inne ligger *före* — och överlever leave-one-clip-out: ett
skift på −1 ruta anpassat utan det egna klippet lyfter träffen 23→44 (Erik) och 27→53 (Lisa).
**Men MAD står kvar på 1,0.** Skiftet flyttar mitten, det tar inte bort spridningen, och även
skiftad ligger E3 inne i under hälften av raderna. **Ingen tröskel och ingen kalibrering beslutas
här.**

**Det enda stället där något verkligen skiljer sig är där människorna teg.** På de 5 svingar där
båda satte *osäker* ligger E3 och E2 **9,5 bildrutor** isär (mot 1,0 i resten), och E3 gav inget
val alls på en av dem. n = 5. Det säger att en tystnadsregel skulle ha något att stå på — inte
var den skulle gå.

---

## 1. Kontrollerna — omgångens eget felmått

45 kontrollsvingar i 39 klipp (en annoterad, enigt bedömd `top` som ligger omarkerad i rundan).
Träff = den annoterade exportrutan är närmast bedömarens intervall.

| | rätt | fel | osäker | avstånd, median | p90 | max |
|---|---:|---:|---:|---|---:|---:|
| Erik pass 1 | 31 | 10 | 4 | 0 exportrutor (n=41 rader / 36 klipp) | 1 | 2 |
| Lisa | **36** | 9 | **0** | 0 exportrutor (n=45 rader / 39 klipp) | 1 | 2 |

**Lisa går bättre och tvekar aldrig på en kontroll.** Avståndsfördelningen är däremot identisk:
median 0, p90 1, max 2 exportrutor för båda. När de svarar svarar de lika bra; skillnaden ligger
i hur ofta Erik avstår.

**Intervallbredd och osäker-andel (hela rundan, inte bara kontrollerna):**

| | bredd median | p90 | max | andel 1-rutors svar | osäker |
|---|---:|---:|---:|---:|---:|
| Erik pass 1 | 2 rutor (n=94 / 76 klipp) | 4 | 15 | 27 % | 9 av 103 (8,7 %) |
| Lisa | 2 rutor (n=95 / 75 klipp) | 3 | 10 | 15 % | 8 av 103 (7,8 %) |

Lisa är alltså **något försiktigare i bredden** (färre enrutessvar, lägre p90 och max) och
**något mindre benägen att säga osäker**. Det är två olika sätt att hantera samma tvekan.

### Missar hon samma kontroller som Erik?

Eriks upprepade missar (fel i **båda** hans pass): **046, 062, 015, 054, 063**.
Lisas missar: **015, 029, 032, 040, 054, 062, 063, 073, 089**.

**Fyra av de fem är gemensamma — 015, 054, 062, 063 — och de pekar på materialet.** Undantaget är
**046, som Lisa träffar.** Det är dessutom rundans **enda sving där de två intervallen inte
överlappar alls**: Erik satte en enda ruta (34), Lisa satte 35–37. På 046 är Erik ensam, och det
är bedömaren, inte klippet.

Totalt missade **båda** åtta kontroller (015, 032, 040, 054, 062, 063, 073, 089), **bara Erik** två
(046, 082) och **bara Lisa** en (029). **Åtta gemensamma missar av 45 kontroller är omgångens
egentliga felmått**: på de klippen är facit självt inte något två oberoende ögon hittar.

### Drift över den egna ordningen

Varje bedömare hade sin egen blandning, så "sista tredjedelen" är **olika svingar** för de två —
talen ligger bredvid varandra, de är inte ett test.

| | tredjedel 1 | tredjedel 2 | tredjedel 3 |
|---|---|---|---|
| Erik, osäker | 2 av 34 (5,9 %) | 1 av 34 (2,9 %) | **6 av 35 (17,1 %)** |
| Erik, kontroller rätt | 11 av 12 | 11 av 15 | **9 av 18** (+ 4 osäkra) |
| Lisa, osäker | 1 av 34 (2,9 %) | 3 av 34 (8,8 %) | 4 av 35 (11,4 %) |
| Lisa, kontroller rätt | 9 av 14 | 14 av 17 | **13 av 14** |
| bredd median, båda | 2 | 2 | 2 |

**Osäker-andelen stiger mot slutet hos båda.** Men kontrollträffen gör det inte: Eriks faller
(11/12 → 9/18), **Lisas stiger** (9/14 → 13/14). Intervallbredden rör sig inte hos någon av dem.
Att två personer med olika ordning båda tvekar mer mot slutet men bara den ene träffar sämre
pekar bort från ren trötthet — och avsnitt 7 avgör det för Eriks del.

**Kontrollerna bär alltså siffrorna nedan**, med reservationen att de åtta gemensamt missade
kontrollerna säger att facit inte är perfekt heller.

---

## 2. Det mänskliga spannet (a) — Erik pass 1 mot Lisa

Båda gav ett intervall på **91 svingar i 73 klipp**. På 7 var exakt en osäker, på 5 var båda det.

| mått | rader (n=91) | klipp (n=73) |
|---|---|---|
| intervallen överlappar alls | **90 av 91 (99 %)** | — |
| glapp mellan intervallen | median 0, p90 0, **max 1** | median 0 |
| mittpunktsskillnad (Erik→Lisa) | median +0,0, \|median\| **0,5**, p90 1,0, max 4,5 | \|median\| 0,2 |
| union av båda (**det mänskliga spannet**) | median **2** rutor, p90 4, max 12 | median 2 |
| Eriks mittpunkt inne i Lisas intervall | **73 av 91 (80 %)** | — |
| Lisas mittpunkt inne i Eriks intervall | **61 av 91 (67 %)** | — |

**Ingen systematisk riktning:** av de 91 ligger 42 mittpunkter exakt lika, 26 är Lisa senare, 23
är Lisa tidigare. Det är brus, inte två sätt att läsa toppen — och därför sätts ingen korrigering
på det. Asymmetrin i mittpunkt-inne-i-intervall (80 % mot 67 %) följer av bredden: Erik svarar
"exakt den här rutan" i 27 % av fallen mot Lisas 15 %, och ett enrutesintervall är svårare att
träffa mitten av.

**Enda icke-överlappet är 046** (Erik 34, Lisa 35–37) — samma sving som avviker i kontrollerna.

### Uppdelningar

| delmängd | n (svingar/klipp) | överlapp | \|mittpunktsdiff\| median | union median | p90 | max |
|---|---|---:|---:|---:|---:|---:|
| alla | 91 / 73 | 99 % | 0,5 | 2 | 4 | 12 |
| **lång envelope** | 11 / 9 | 100 % | 0,5 (p90 **3,0**, max 4,5) | **3** | **10** | **12** |
| normal takt | 80 / 68 | 99 % | 0,5 | 2 | 3 | 8 |
| **face-on** | 7 / 6 | **100 %** | **0,0** (max 0,5) | 2 | 4 | 4 |
| dtl | 84 / 67 | 99 % | 0,5 | 2 | 4 | 12 |
| **Erik bred i pass 1** (≥4 rutor) | **9** / 8 | 100 % | **1,0** (p90 4,5) | **6** | **12** | 12 |
| Erik smal (<4 rutor) | 82 / 67 | 99 % | 0,5 | 2 | 3 | 4 |

**Lång envelope vidgar spannet, det försämrar inte enigheten.** Överlappet är 100 %, men unionen är 3
rutor i median mot 2 och har p90 10. Fler rutor visar samma ögonblick, så platån blir bredare —
det är materialet, inte oenighet.

**Face-on är rundans tätaste grupp**: 7 svingar där båda svarade, mittpunkterna identiska i
median och som mest 0,5 rutor isär, och Eriks mittpunkt ligger inne i Lisas intervall i **7 av
7**. Det är det första underlaget alls på face-on (S-31 hade noll) — men det är 7 svingar i 6
klipp och bär ingen slutsats.

**De 9 svingar Erik satte breda (≥4 rutor, hans egen p90) är den svåra svansen**, och Lisa ser det
också: unionen är 6 rutor i median mot 2 för resten, och mittpunkterna ligger 1,0 rutor isär i
median mot 0,5. Båda överlappar ändå i 9 av 9. **Bredden är alltså en egenskap hos svingen, inte
en egenhet hos Erik.** (Definitionen ≥4 rutor är Eriks egen p90 i pass 1 och är ett *namn* på den
delmängden, inte en kvalitetsgräns.)

### Eriks intra-spann som referens

Från avsnitt 7, på de 29 svingar han gav intervall båda gångerna: **överlapp 29 av 29 (100 %),
glapp max 0, mittpunktsskillnad median 0,0 och \|median\| 0,0 (max 2,5).**

**Den siffran ska inte läsas som ett golv för vad en människa klarar.** Passen ligger ~14 timmar
isär (2026-09-18 20:12 → 2026-09-19 10:10), bilderna är exakt desamma, och det enda som byttes var
ordningen — **igenkänning kan ha bidragit hur mycket som helst och går inte att skilja ut här**.
Dessutom täcker pass 2 bara hans sista tredjedel, alltså hans svagaste. Den står här som referens,
inte som mått.

---

## 3. Estimatorerna (b) — var för sig, mot vardera annotatören

Avstånd i envelope-bildrutor till bedömarens intervall; **0 = inne i intervallet**. Bedömarna
hålls åtskilda, och ingen sammanslagen sanning används.

| | mot Erik (n=94 svarade) | mot Lisa (n=95 svarade) |
|---|---|---|
| **E1** högsta händer | inne **9 av 94**; median +18, \|median\| 18, p90 25, max 169 | inne **10 av 95**; median +18, p90 24, max 169 |
| **E2** fartminimum | inne **36 av 94**; median +0, \|median\| 1, p90 **30**, max **205** | inne **42 av 95**; \|median\| 1, p90 28, max 205 |
| **E3** teckenväxling i v_y | inne **23 av 93**; median **−1**, \|median\| 1, p90 3, max 29 | inne **27 av 95**; median **−1**, \|median\| 1, p90 4, max 26 |

(E3 saknar val på 1 av de 94 svingar Erik besvarade — se avsnitt 5. Klippmedianerna är identiska
med radmedianerna genomgående: 75–76 klipp, samma tal.)

**E1 är fel konstruktion, nu på n=94 i stället för n=6:** median 18 bildrutor efter intervallet,
inne i 1 av 10. Finishen står högre än toppen, precis som S-31 sa.

**E2 träffar oftast inne men har en svans som inte går att bo i:** p90 på 28–30 rutor och max 205.
Medianen (1 ruta) och p90 (30 rutor) beskriver två olika estimatorer på olika svingar.

**E3 är den enda som är både nära och tät:** \|median\| 1 ruta och p90 3–4 mot båda bedömarna
oberoende av varandra, med max 26–29 på svansen.

### Mot det mänskliga spannet — rundans poäng

Spannet = **unionen** av de två intervallen på de 91 svingar där båda svarade (73 klipp). Det är
ingen sammanslagen sanning: *inne i spannet* betyder **inne i det ingen av dem uteslöt**.

| | inne i spannet (n=91) | median | \|median\| | p90 | max | inne hos **båda samtidigt** |
|---|---:|---:|---:|---:|---:|---:|
| E1 | 10 (11 %) | +18 | 18 | 24 | 169 | 8 |
| E2 | **45 (49 %)** | +0 | 1 | 26 | 205 | **32** |
| E3 | **30 (33 %)** | **−1** | 1 | 3 | 26 | 19 |

**E3 ligger inne i det mänskliga spannet i en tredjedel av svingarna och inne hos båda samtidigt i
19 av 91 (21 %).** Den typiska missen är **en bildruta**, och den är riktad (avsnitt 4). E2 är
oftare inne men betalar med svansen; de två mäter olika saker och slås inte ihop.

Jämförelsen som gör siffran läsbar: **människorna ligger inne hos varandra i 67–80 % av
svingarna.** E3:s 33 % mot spannet ska läsas mot det, inte mot 100 %.

---

## 4. E3:s förskjutning (c) — konstant eller spridd?

| | mot Erik (93 rader / 75 klipp) | mot Lisa (95 rader / 75 klipp) |
|---|---|---|
| median | **−1,0** | **−1,0** |
| MAD | 1,0 | 1,0 |
| IQR | −2,0 … 0,0 | −2,0 … 0,0 |
| p10…p90 | −3,0 … 0,0 | −4,0 … 0,0 |
| av raderna som inte ligger inne | 70 st: **62 före, 8 efter (89 %)** | 68 st: **60 före, 8 efter (88 %)** |
| naivt skift med klippmedianen (−1) | träff 23 → **44** av 93 | träff 27 → **53** av 95 |
| **LOCO** (skift anpassat utan det egna klippet) | träff 23 → **44** av 93 | träff 27 → **53** av 95 |
| oskiftad, klippnivå | median −1,0, \|median\| 1,0 | median −1,0, \|median\| 1,0 |
| LOCO-skiftad, klippnivå | median +0,0, \|median\| **0,0** | median +0,0, \|median\| **0,0** |

**Riktningen är konstant, storleken är ~1 ruta, och den överlever leave-one-clip-out.** LOCO ger
exakt samma träff som det naiva skiftet (44 respektive 53) — skiftet som anpassas *utan* det egna
klippet duger lika bra på det, vilket är vad en kalibrering ska göra och vad ett brus som bär en
median inte gör. Två bedömare som aldrig sett varandras svar ger samma tecken och samma storlek.

**Men spridningen ligger kvar.** MAD är 1,0 före, och radernas \|median\| är 1,0 efter; det är
klippmedianerna som kryper ihop till 0,0, inte raderna. Även skiftad ligger E3 inne i **44 av 93**
respektive **53 av 95** — under hälften. **Förskjutningen är alltså en konstant *ovanpå* en
spridning, inte i stället för den.** Att rätta den skulle flytta mitten och lämna svansen.

**S-31:s sex rader, omräknade mot den här rundans svar:** median −2,0 mot Erik och −3,5 mot Lisa
(5 klipp). Samma tecken som nu, större belopp — **n=6 överdrev storleken men fick riktningen
rätt.**

**Inget skift appliceras. Ingen tröskel sätts.** Det här beskriver vilken sorts fel det är.

---

## 5. Tystnad — kan E3 förutsäga var människorna inte kan svara?

Grupperna är skurna **på svaren, aldrig på E3**. `oense` = mittpunkterna ≥1 hel ruta isär
(rutnätets eget steg), `brett spann` = union ≥4 rutor (över båda bedömarnas p90 på 3). De två
överlappar med flit och redovisas var för sig.

| grupp | n (svingar/klipp) | E3 inne, Erik | E3 inne, Lisa | \|E3\| median (Erik / Lisa) | **\|E3 − E2\|** |
|---|---|---:|---:|---:|---:|
| **båda osäkra** | 5 / 5 | — inget intervall | — inget intervall | — | **9,5** (n=4) |
| en osäker | 7 / 7 | 1 av 2 | 0 av 4 | 14,5 / 2,5 | 2,0 (n=6) |
| oense (≥1 ruta) | 16 / 15 | 5 av 16 (31 %) | 8 av 16 (50 %) | 1,0 / 0,5 | 1,0 |
| brett spann (≥4 rutor) | 11 / 10 | 3 av 11 (27 %) | 6 av 11 (55 %) | 1,0 / 0,0 | 3,0 |
| **resten** (ense och smalt) | 71 / 58 | 16 av 71 (23 %) | 18 av 71 (25 %) | 1,0 / 1,0 | 1,0 |

**E3:s avstånd är inte sämre där människorna tvekar.** \|median\| står på 1 ruta i varje grupp, och
träffandelen är om något *högre* på de breda och oeniga svingarna — vilket är ren aritmetik: ett
brett intervall är lättare att landa i. **Oenighet och bredd förutsäger alltså ingenting om E3.**

**Det som skiljer är tystnaden.** På de 5 svingar där ingen av de två kunde svara ligger E3 och E2
**9,5 bildrutor isär** mot 1,0 i resten — två estimatorer byggda på olika storheter som slutar vara
överens precis där ögat slutar svara. Den breda gruppen ligger på 3,0, mittemellan.

**E3 tiger själv på 2 av 103 svingar** — `S32-074` (`001.mp4`, lång envelope, **båda osäkra**) och
`S32-053` (`033.mp4`, **Lisa osäker**). Båda är svingar där minst en människa också teg. n = 2.

**Detta sätter ingen tröskel och föreslår ingen regel.** Det säger att en tystnadsregel skulle ha
något att stå på, mätt på **5 svingar i 5 klipp** — vilket är för lite för att bygga på och
tillräckligt för att motivera att mäta det igen.

---

## 6. Kovariater — registrerade, aldrig visade för bedömaren

\|E3\| = medianen av det absoluta avståndet i bildrutor.

| uppdelning | svingar / klipp | \|E3\| mot Erik | \|E3\| mot Lisa |
|---|---|---|---|
| **kameravinkel** dtl | 93 / 73 | 1,0 (n=86) | 1,0 (n=88) |
| **kameravinkel** face_on | 10 / 9 | 1,0 (n=7) | 1,0 (n=7) |
| **lång envelope** | 15 / 13 | 1,0 (n=13) | **0,0** (n=11) |
| normal takt | 88 / 72 | 1,0 (n=80) | 1,0 (n=84) |
| **spegelvänd, bekräftad** | **2 / 1** | **3,5** (n=2) | **4,0** (n=2) |
| spegelvändning okänd | 101 / 80 | 1,0 (n=91) | 1,0 (n=93) |
| **säkert nedslag: ja** | 83 / 69 | 1,0 (n=76) | 1,0 (n=79) |
| säkert nedslag: nej | 20 / 16 | 1,0 (n=17) | 1,0 (n=16) |
| fps 30 | 103 / 81 | 1,0 | 1,0 |
| händighet `unknown` | 103 / 81 | — omätt — | — omätt — |

**Vinkeln säger ingenting:** face-on ger samma \|E3\| som dtl. Det är första gången face-on ens
kan jämföras (S-31 hade noll), men n=7 svarade per bedömare.

**Lång envelope ser bättre ut än det är:** Lisas 0,0 kommer av att det mänskliga spannet är bredast just
där (union median 3, max 12, avsnitt 2). E3 har inte blivit noggrannare, målet har blivit större.

**Spegelvändning är rundans sämsta cell** — 3,5–4,0 rutor mot 1,0 — men det är **2 svingar i ett
enda klipp** (`093.mp4`, samma klipp som bar två av S-31:s sex rader). Det är en fråga, inte ett
fynd, och **S-32:s spec punkt 3 är fortfarande obesvarad**: verifierat vänsterhänt, ospeglat
material finns inte i datasetet.

**Nedslaget säger ingenting**, vilket är värt att notera: E3 mäter lika bra på de 20 svingar som
saknar säkert nedslag som på de 83 som har det. Det är precis de svingarna där den fasderiverade
vägen (`FALLBACK_BOUNDS`) är som sämst.

Grupperna är små och konfunderade med källan — **102 av 103 svingar är `web`, och all fps är 30**.

---

## 7. Pass 2 — känslighetskontroll, separat redovisad

Erik bedömde om **de 35 svingar som låg på plats 69–103 i hans egen ordning**, i en ny blandning
med eget frö (`build_pass2.py`); `svar-erik.json` rördes aldrig. 18 av de 35 är kontroller, 6 har
lång envelope, 2 är av S-31:s sex. **Passen slås inte ihop någonstans i den här rapporten.**

**Erik mot Erik** (29 svingar med intervall båda gångerna, 27 klipp): överlapp **29 av 29**, glapp
max 0, mittpunktsskillnad median 0,0 / \|median\| 0,0 / max 2,5. Bredd median 2 i båda passen;
breddförändringen är 0 i median (lång envelope +1, n=5).

**Kontrollerna:** pass 1 gav 9 rätt / 5 fel / 4 osäkra av de 18; pass 2 gav 10 / 5 / 3.

| pass 1 → pass 2 | rätt | fel | osäker |
|---|---:|---:|---:|
| rätt | **9** | 0 | 0 |
| fel | 0 | **5** | 0 |
| osäker | 1 | 0 | 3 |

**Samma fem svingar missas båda gångerna — 046, 062, 015, 054, 063 — och ingen ny miss tillkommer.**
Osäker i 6 av 35 mot 5 av 35, varav 5 samma svingar. **Det är materialet, inte trötthet.** Lisa
träffar fyra av de fem ändå (avsnitt 1), så "materialet" är olika svårt för olika ögon — men Eriks
fall i sista tredjedelen är inte utmattning.

**Estimatorerna på exakt samma 35 svingar** (`--restrict`, så passen jämförs på samma underlag):

| | mot pass 1 (29 rader / 27 klipp) | mot pass 2 (30 rader / 28 klipp) |
|---|---|---|
| E1 inne | 4 av 29 | 5 av 30 |
| E2 inne | 11 av 29 | 14 av 30 |
| **E3 inne** | **7 av 29**, median −1,0, p90 5, max 29 | **9 av 30**, median −1,0, p90 4, max 28 |

**Slutsatserna rör sig inte när Eriks andra läsning ersätter hans första.** Samma tecken, samma
median, samma storleksordning.

**En varning ur samma körning:** på den här delmängden ger LOCO *sämre* träff än oskiftat för pass
1 (7 → 5) medan pass 2 ger 9 → 14. Orsaken är inte E3 utan anpassningen: på 27 klipp hamnar
leave-one-out-medianen på en halvruta och avrundas till −2 för 14 klipp och −1 för 13. **Skiftet är
instabilt vid små n** — vid full n (75 klipp) är det stabilt, avsnitt 4. Tolka inte LOCO på
delmängder.

---

## Vad som INTE mättes

- **Händighet.** `unknown` på alla 103 svingar; den finns inte i datamodellen och gissas inte ur
  bilden ([STATUS.md](../STATUS.md) §4). **S-32:s spec punkt 3 — verifierat vänsterhänt, ospeglat
  material — är fortfarande obesvarad.** Paketet gör luckan synlig, det fyller den inte.
- **Fler än två par ögon.** Ett annotatörspar, ett upprepat pass av den ena. Ingen tredje bedömare,
  ingen upprepning av Lisa. Det mänskliga spannet är mätt på *dessa två personer*.
- **Igenkänningens bidrag till Eriks intra-spann.** Samma bilder, ~14 timmar isär. Inte utskiljbart.
- **Face-on som grupp.** 10 svingar i 9 klipp, 7 med svar från båda. Utbruten, inte avgjord.
- **Spegelvändning.** 2 svingar i 1 klipp. Den sämsta cellen i rundan vilar på ett enda klipp.
- **Källa och fps.** 102 av 103 `web`, en enda `own`; all fps 30. Inget av det är varierat.
- **Kontrollernas upplösning.** Kontrollen frågar *valde bedömaren samma **exporterade** bildruta*,
  på det glesa exportrutnätet (upp till 7 rutor per sving) — inte rutexakt enighet på videorutnätet.
  Den frågan behöver ingen tolerans och sätter därför ingen tröskel, men den är grövre än
  intervallen i avsnitt 2.
- **De åtta gemensamt missade kontrollerna.** Att båda missar samma facit är mätt, inte utrett —
  ingen har tittat på vad som är fel i de klippen.
- **De 5 svingar där båda teg.** Ingen estimator kan poängsättas där; de finns bara i avsnitt 5.
- **E3 mot `poseEnvelope.ts`:s `impact.topSec`.** Produktionens egen handledsbaserade topp jämförs
  inte här. Den kräver säkert nedslag, alltså just det som saknas där felet är värst.
- **Om exportens envelope-rutnät motsvarar vad produktionen skulle plocka.** Rundan ligger på samma
  6 548 rutor som S-28/S-31 — det är en kontroll på att fönstret är detsamma, inte på att det är rätt.
- **Ingen tröskel, ingen kalibrering, inget skift applicerat, ingen produktionskod läst eller
  skriven.** Vad som är nära nog är ett beslut för en annan dag.

## Reproducerbarhet

`score_round.py` skriver bara till stdout. E1/E2/E3 plockas vid poängsättningen ut ur
`top-from-pose/analyze_pose.py` genom att modulen parsas och bara de namngivna rena funktionerna
körs — inte kopieras — så S-31 och S-32 poängsätter bevisligen samma estimatorer; byter någon namn
på dem stannar skriptet i stället för att tyst mäta något annat. Estimatorvalen beräknades först
efter att båda svarsfilerna låg på plats; registret bär inget estimatorvärde och `build_round.py`
importerar aldrig poängsättningen.

Tillagt i den här omgången: kontrollernas per-sving-utfall och drift över egen ordning,
mittpunkt-inne-i-intervall och uppdelningarna i avsnitt 2, estimatorerna mot det mänskliga spannet,
`--section silence` och `--restrict`.
