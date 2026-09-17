# Var är bladvinkeln användbar?

Genererad 2026-09-15 21:30 UTC av `training/trace_swing.py --clips`.

| | |
|---|---|
| Vikter | `C:\SwingCheck\training\runs\shaft-v3\weights\best.pt` |
| Klipp | 10 |
| Bildrutor | 4766 |
| `imgsz` | 960 |
| Detektionströskel (`--conf`) | 0.25 |
| Punktströsklar | skaft 0.5 · blad 0.1 |
| Största tillåtna tidssteg (`--max-gap-sec`) | 1.0 s |
| Blur-etikettens räckvidd (`--blur-window-sec`) | ±0.1 s |
| Manifest | `batch-01`, `batch-02`, `batch-03` |

## 1. Frågan, och varför den ställs så här

På `002.mp4` är bladvinkeln slät medan klubban står still och taggig så snart huvudet rör sig. **Ett klipp kan inte skilja ett mönster hos modellen från ett mönster hos klippet**, och två förklaringar leder åt helt olika håll: är det **svingfasen** som styr är bladvinkeln användbar i svingens lugna delar och ingen annanstans, och ingen tröskel i världen ändrar det. Är det **modellens egen konfidens på `toe`/`heel`** som styr räcker en konfidensgrind — modellen vet då själv när den gissar.

**Skaftvinkeln är måttstocken i varje tabell.** `butt→hosel` och `heel→toe` sitter på samma stela kropp; över samma två bildrutor roterar de jämförbart mycket. En bladvinkel som rör sig en tiopotens snabbare är modellen som gissar, inte klubban som vänder. Därför mäts båda vinklarna **på samma steg**: ett steg kommer med i tabellerna bara när båda vinklarna finns i båda ändar.

**Det finns fortfarande inget facit för bladvinkeln** — kalibreringssetet är annoterat i tvåpunktsschemat. Det här mäter alltså inte träffsäkerhet utan rörlighet, precis som `measure_blade_stability.py`, men vid ~0,033 s i stället för ~0,3 s.

## 2. Urvalet av klipp

**Tio klipp, valda på annotatörernas egna etiketter — inte på hur graferna såg ut.**
Urvalet gjordes innan modellen kördes på ett enda av dem, av samma skäl som
evalsetet en gång reserverades: ett urval som plockas efter utfallet mäter
urvalet, inte modellen.

**Poolen.** `data/shaft/clips/` bär 97 klipp. Ett klipp är valbart bara om det har
minst en bildruta i en träningsbatch **och** den bildrutan är annoterad — utan
manifestpost finns ingen envelope att härleda svingfasen ur, utan annotering finns
ingen `view`/`blur` att dela upp på. Det ger **80 valbara klipp**.

**Vygrinden är den knappa resursen.** Av de 80 har bara **9** någon `face_on`-märkt
bildruta alls, och tre av dem (`048`, `072`, `IMG_5427`) blandar `face_on` och `dtl`
inom samma klipp. De fem valda face_on-klippen — `008`, `013`, `033`, `059`, `069` —
är alla **enhälligt** `face_on` i sina annoterade bildrutor, så vyraden i tabellerna
betyder en sak och inte två. Det sjätte enhälliga (`036`) ströks eftersom det inte
tillför något `059` inte redan bär. Fem `dtl` mot fem `face_on` är därmed en kraftig
**översampling** av face_on mot poolen, och det är avsiktligt: `face_on` är där
`shaft-v2` tappade 60 % av sina detektioner, och en jämn fördelning hade gett en
face_on-kolumn för tunn att läsa.

**Oskärpan är vald per cell, inte per klipp.** Målet var båda vyerna i både skarpt
och suddigt skick:

| | skarpt (`none` dominerar) | suddigt (`severe` finns) |
|---|---|---|
| `dtl` | `095`, `089` | `002`, `045`, `090` |
| `face_on` | `033`, `069` | `008`, `013`, `059` |

Över de tio klippen är **69 bildrutor annoterade**: 39 `none`, 10 `mild`, 20
`severe` — alltså ungefär **29 % `severe`**, mot 10,8 % i det annoterade materialet
som helhet. Även oskärpan är medvetet översamplad, av samma skäl som `face_on`.

**`002.mp4` är med för kontinuitetens skull.** Det är klippet vars trace väckte hela
frågan (slät bladvinkel medan klubban står still, taggig så snart huvudet rör sig),
och det ska gå att läsa den observationen i samma tabeller som de nio andra.

**Flera svingar per klipp togs där de fanns** (`095` och `090` bär fyra vardera,
`045` och `089` tre) — svingar, inte klipp, är det fas-tabellerna delas upp på, och
ett klipp med fyra svingar ger fyra envelopes att placera bildrutorna i.

**Vad urvalet inte är.** Det är inte slumpmässigt och inte representativt för
poolen; det är en *täckning* av fyra celler med det material som finns. Andelarna i
rapporten beskriver därför de här tio klippen och ska inte läsas som andelar över
alla 97.

| Klipp | Bildrutor | Detektion | Skaftvinkel | Bladvinkel | Båda | Svingar i manifest | `view` (annoterat) | `blur` (annoterat) |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `002.mp4` | 222 | 85 % | 80 % | 79 % | 79 % | 1 | dtl 4 | none 1 · severe 3 |
| `008.mp4` | 220 | 35 % | 34 % | 17 % | 17 % | 1 | face_on 3 | mild 1 · severe 2 |
| `013.mp4` | 173 | 68 % | 62 % | 54 % | 54 % | 1 | face_on 4 | none 2 · severe 2 |
| `033.mp4` | 457 | 84 % | 84 % | 60 % | 60 % | 1 | face_on 3 | none 3 |
| `045.mp4` | 948 | 95 % | 89 % | 89 % | 89 % | 3 | dtl 10 | mild 3 · none 1 · severe 6 |
| `059.mp4` | 478 | 44 % | 44 % | 22 % | 22 % | 2 | face_on 7 | mild 3 · none 2 · severe 2 |
| `069.mp4` | 332 | 75 % | 74 % | 72 % | 72 % | 1 | face_on 3 | none 3 |
| `089.mp4` | 485 | 67 % | 66 % | 66 % | 66 % | 3 | dtl 9 | none 9 |
| `090.mp4` | 856 | 93 % | 91 % | 91 % | 91 % | 4 | dtl 12 | mild 3 · none 4 · severe 5 |
| `095.mp4` | 595 | 94 % | 93 % | 92 % | 92 % | 4 | dtl 14 | none 14 |

`view`/`blur` är annotatörernas etiketter på de **enstaka** bildrutor ur klippet som dragits in i en träningsbatch — de beskriver klippet, de täcker det inte.

### Höll mönstret från `002.mp4` i de andra nio?

Ett klipp per rad, och kvoten i två kolumner: inuti svingarna och mellan dem. Det är den uppdelning frågan föddes ur — bladvinkeln såg lugn ut medan klubban stod still och taggig när huvudet rörde sig.

| Klipp | Steg i sving | Blad median | Skaft median | Kvot i sving | Kvot mellan svingar | Blad-hopp > 90° |
|---|---:|---:|---:|---:|---:|---:|
| `002.mp4` | 75 | 153.9 | 25.4 | 6.06 | 5.44 | 3 (4 %) |
| `008.mp4` | 12 | 81.2 | 96.0 | 0.85 | 4.63 | 2 (17 %) |
| `013.mp4` | 30 | 303.5 | 159.6 | 1.90 | 8.28 | 3 (10 %) |
| `033.mp4` | 55 | 183.7 | 159.4 | 1.15 | 2.73 | 3 (5 %) |
| `045.mp4` | 281 | 58.4 | 14.6 | 4.00 | 4.73 | 2 (1 %) |
| `059.mp4` | 57 | 569.7 | 402.8 | 1.41 | 4.04 | 6 (11 %) |
| `069.mp4` | 38 | 526.4 | 243.9 | 2.16 | 6.41 | 6 (16 %) |
| `089.mp4` | 185 | 136.0 | 77.3 | 1.76 | 3.81 | 0 (0 %) |
| `090.mp4` | 164 | 284.4 | 117.3 | 2.43 | 2.80 | 5 (3 %) |
| `095.mp4` | 366 | 196.1 | 72.0 | 2.72 | 10.69 | 6 (2 %) |

Medianerna är °/s. Ett klipp utan manifestpost har inga steg i sving alls.

## 3. Anmärkningar

- 9 frames är flaggade `no_shaft` av annotatören och utelämnas — där finns ingen klubba att vara stabil om.
- `view`/`blur` från `batch-01/annotated-v2.zip`, `batch-02/annotated-v1.zip`, `batch-03/annotated-v1.zip`.

## 4. Bladvinkelns rörlighet mot modellens konfidens på `toe`/`heel`

Hinken bestäms av **den svagaste av `toe` och `heel` i stegets båda ändar** — en vinkel är inte bättre än sin sämsta punkt, och en tröskel betyder att *varje* bildruta som används klarar den.

| toe/heel-konfidens | Steg | Blad median | Blad p90 | Skaft median | Skaft p90 | Kvot blad/skaft | Blad-hopp > 90° |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0.1-0.2 | 851 | 134.6 | 1150.2 | 39.4 | 387.0 | 3.42 | 38 (4 %) |
| 0.2-0.3 | 1543 | 100.2 | 873.3 | 24.5 | 290.8 | 4.08 | 20 (1 %) |
| 0.3-0.4 | 965 | 26.0 | 360.4 | 8.8 | 86.3 | 2.94 | 3 (0 %) |
| 0.4-0.5 | 26 | 90.7 | 263.3 | 41.2 | 131.9 | 2.20 | 0 (0 %) |
| 0.5-0.6 | 1 | 930.3 | 930.3 | 2.8 | 2.8 | 327.80 | 0 (0 %) |

Alla hastigheter i °/s.

Totalt över alla hinkar: 3386 steg, blad median 76.5 °/s mot skaft 21.0 °/s (kvot 3.65).

**Hur mycket spann finns det att gradera på?** Över de 3403 bildrutor som bär en bladvinkel ligger min(`toe`, `heel`) på median 0.26, p90 0.35, max 0.55 — mot skaftets min(`butt`, `hosel`) median 0.99, p90 1.00, max 1.00 över dess 3683 bildrutor. Hinkar ovanför bladets spann står tomma därför att modellen aldrig är så säker på klubbhuvudet, inte därför att urvalet saknar sådana bildrutor.

## 5. Samma sak per svingfas

Fasen kommer ur `envelopeSec`/`impactSec` i batchmanifesten — production-pose körd en gång, aldrig om. **`start`, `impact` och `finish` är mätta; toppen är det inte** (manifestet bär ingen), så gränsen backsving/nedsving är typsvingens proportion ur `datasetPhase.ts` utsträckt över de mätta tiderna. Läs fasraderna som grova hinkar, inte som en fasdetektor.

| Fas | Steg | Blad median | Blad p90 | Skaft median | Skaft p90 | Kvot blad/skaft | Blad-hopp > 90° |
|---|---:|---:|---:|---:|---:|---:|---:|
| address | 125 | 77.1 | 696.1 | 17.9 | 91.6 | 4.30 | 0 (0 %) |
| backswing | 429 | 189.2 | 1084.8 | 71.3 | 544.5 | 2.66 | 10 (2 %) |
| top | 68 | 143.3 | 641.5 | 76.6 | 378.2 | 1.87 | 0 (0 %) |
| downswing | 153 | 373.9 | 1347.8 | 162.4 | 672.5 | 2.30 | 5 (3 %) |
| impact | 32 | 240.8 | 1488.1 | 99.1 | 1307.7 | 2.43 | 4 (12 %) |
| through | 139 | 179.1 | 1420.5 | 106.0 | 408.4 | 1.69 | 4 (3 %) |
| finish | 200 | 110.3 | 877.8 | 36.7 | 206.7 | 3.01 | 2 (1 %) |
| (blandad) | 153 | 168.1 | 942.1 | 113.5 | 935.8 | 1.48 | 12 (8 %) |
| (utanför sving) | 2087 | 43.0 | 540.0 | 10.3 | 103.3 | 4.16 | 24 (1 %) |

Alla hastigheter i °/s.

**Klippen är mest stillestånd.** 1263 av 3386 steg ligger inuti en envelope, 2123 mellan svingarna. Inom svingen rör sig bladet 173.1 °/s mot skaftets 71.7 °/s (kvot 2.42); mellan svingarna 42.6 mot 10.3 (kvot 4.11). Att kvoten är HÖGRE när klubban står still är väntat och värt att läsa rätt: nämnaren krymper — skaftet står stilla — medan bladets brusgolv ligger kvar.

### Hur bra är härledningen? Mätt, inte påstått

Manifestet bär redan en `phase` per sampel, skriven av `datasetPhase.ts` vid exporten **med toppen tillgänglig**. Den här porten får bara `[start, finish]` och impact tillbaka. Körda mot varandra på manifestens egna 650 bildrutor håller de med varandra i **577 (89 %)**.

| Manifestets fas | Den här porten | Bildrutor |
|---|---|---:|
| top | backswing | 33 |
| downswing | top | 21 |
| top | downswing | 9 |
| downswing | backswing | 5 |
| downswing | impact | 4 |
| through | impact | 1 |

Läs tabellen som var osäkerheten sitter: den gräns porten saknar är toppen, och avvikelserna hamnar där toppen hade avgjort.

### Samma uppdelning efter en konfidensgrind på 0.3

Om fasen fortfarande styr efter grinden är konfidensen inte hela svaret; faller skillnaden ihop är den det. Ingen tröskel når ända fram (avsnitt 7), så grinden här är den strängaste som fortfarande bär 30 steg — det hårdaste prov konfidensen kan få av det här materialet.

| Fas | Steg | Blad median | Blad p90 | Skaft median | Skaft p90 | Kvot blad/skaft | Blad-hopp > 90° |
|---|---:|---:|---:|---:|---:|---:|---:|
| address | 83 | 50.6 | 347.1 | 15.5 | 72.7 | 3.26 | 0 (0 %) |
| backswing | 59 | 54.8 | 444.2 | 32.0 | 277.2 | 1.71 | 0 (0 %) |
| top | 5 | 296.3 | 361.2 | 53.2 | 305.7 | 5.57 | 0 (0 %) |
| downswing | 9 | 29.8 | 899.7 | 161.2 | 361.8 | 0.19 | 0 (0 %) |
| impact | 11 | 38.4 | 124.1 | 19.7 | 611.3 | 1.95 | 0 (0 %) |
| through | 34 | 134.2 | 445.2 | 77.4 | 242.8 | 1.73 | 0 (0 %) |
| finish | 52 | 34.2 | 390.3 | 10.9 | 120.6 | 3.14 | 0 (0 %) |
| (blandad) | 35 | 82.0 | 430.5 | 24.5 | 232.0 | 3.35 | 0 (0 %) |
| (utanför sving) | 704 | 19.6 | 322.6 | 6.2 | 53.2 | 3.16 | 3 (0 %) |

Alla hastigheter i °/s.

## 6. Samma sak per `blur`

Etiketten sitter på **en** annoterad bildruta och sträcker sig ±0.1 s därifrån, inte längre: rörelseoskärpa ändras inom en tiondels sekund kring träffen, och ett bredare fönster hade köpt steg genom att hitta på etiketter. Steg där två etiketter inom fönstret säger olika saker hamnar i `(blandad)`.

| `blur` | Steg | Blad median | Blad p90 | Skaft median | Skaft p90 | Kvot blad/skaft | Blad-hopp > 90° |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 143 | 271.2 | 1433.8 | 130.0 | 646.3 | 2.09 | 7 (5 %) |
| mild | 34 | 360.0 | 1087.1 | 54.3 | 366.4 | 6.63 | 1 (3 %) |
| severe | 43 | 364.1 | 1169.8 | 282.1 | 1726.4 | 1.29 | 4 (9 %) |
| (blandad) | 94 | 255.6 | 1511.6 | 208.1 | 894.5 | 1.23 | 10 (11 %) |
| (ingen etikett nära) | 3072 | 64.7 | 687.6 | 16.6 | 194.8 | 3.89 | 39 (1 %) |

Alla hastigheter i °/s.

## 7. Var ska gränsen gå?

Varje rad är *alla* steg där båda ändar klarar tröskeln. **Andelen bildrutor** räknas mot samtliga avkodade bildrutor i de 10 klippen, inte mot dem som redan har en bladvinkel — frågan är vad som återstår av ett klipp efter grinden.

| Tröskel | Steg | Blad median | Skaft median | Kvot | Blad-hopp > 90° | Bildrutor över tröskeln | Andel av alla | Andel av detekterade |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.1 | 3386 | 76.5 | 21.0 | 3.65 | 61 (2 %) | 3403 | 71 % | 90 % |
| 0.2 | 2535 | 59.7 | 15.3 | 3.91 | 23 (1 %) | 2692 | 56 % | 71 % |
| 0.3 | 992 | 28.2 | 9.1 | 3.09 | 3 (0 %) | 1112 | 23 % | 29 % |
| 0.4 | 27 | 92.5 | 34.8 | 2.66 | 0 (0 %) | 54 | 1 % | 1 % |
| 0.5 | 1 | 930.3 | 2.8 | 327.80 | 0 (0 %) | 5 | 0 % | 0 % |
| 0.6 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % | 0 % |
| 0.7 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % | 0 % |
| 0.8 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % | 0 % |
| 0.9 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % | 0 % |

**Ingen tröskel klarar gränsen.** Ingen rad ovan når kvot ≤ 1.5 med minst 30 steg bakom sig. Bladvinkeln blir alltså inte jämförbar med skaftvinkeln någonstans på konfidensskalan i det här materialet, och en konfidensgrind är därmed inte det som saknas.

### Samma svep, men bara på steg inuti en sving

Grinden ska bära i en sving, inte i pausen mellan två. Här räknas andelen mot de 1731 bildrutor som ligger inom en envelope.

| Tröskel | Steg | Blad median | Skaft median | Kvot | Blad-hopp > 90° | Bildrutor över tröskeln | Andel av bildrutorna i sving |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.1 | 1263 | 173.1 | 71.7 | 2.42 | 36 (3 %) | 1284 | 74 % |
| 0.2 | 887 | 150.6 | 61.4 | 2.45 | 11 (1 %) | 1006 | 58 % |
| 0.3 | 272 | 62.8 | 26.8 | 2.34 | 0 (0 %) | 338 | 20 % |
| 0.4 | 11 | 100.7 | 74.0 | 1.36 | 0 (0 %) | 26 | 2 % |
| 0.5 | 0 | -- | -- | -- | 0 (--) | 3 | 0 % |
| 0.6 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % |
| 0.7 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % |
| 0.8 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % |
| 0.9 | 0 | -- | -- | -- | 0 (--) | 0 | 0 % |

**Inte heller inom en sving finns en tröskel som klarar kvotgränsen.** Konfidensgrinden räddas alltså inte av att stillestånden räknas bort.


### Den andra frågan: var slutar `toe` och `heel` byta plats?

Ett hopp över 90° är ingen brusnivå som jämnar ut sig — det är bladvinkeln vänd ett halvt varv, samma fel som kostade `shaft-v1` dess face_on-bildrutor. En grind som stoppar omkastningarna är därför värd något även om medianen stannar över skaftets, och de två svaren hålls isär.

**Inom en sving faller omkastningarna under 1 % vid `--kpt-conf-blade 0.3`** — 0 av 272 steg, mot 3 % i den lägsta hinken. Kvoten där är fortfarande 2.34, alltså *inte* jämförbar med skaftet: grinden gör bladvinkeln mindre farlig, inte användbar.

Båda gränserna (1.5 för kvoten, 1 % för omkastningarna) är val, inte mätningar. Svepen står kvar i sin helhet just därför: flytta linjen och läs av vad den kostar i bildrutor.

## 8. Vad som inte mäts här

- **Träffsäkerhet.** Utan fyrapunktsfacit går bara rörlighet att mäta. En bladvinkel kan vara fullkomligt stabil och konsekvent fel.
- **Steg utan båda vinklarna.** 7 steg förkastades för lucka > 1.0 s och 0 för tidssteg ≤ 0. Bildrutor där bara den ena vinkeln fanns bildar inget steg alls.
- **Bildrutor utan fas.** 0 av 4766 bildrutor ligger i klipp utan manifestpost och 3035 mellan två svingar i ett klipp som har det.

