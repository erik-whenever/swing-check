# Resultat av den blinda omgången

> 12 bildrutor bedömda för hand i
> [across-sign-blind.md](across-sign-blind.md) (frö `0x5ca1ab1e`),
> stämda mot [across-sign-blind-key.md](across-sign-blind-key.md). Sammanställd
> 2026-09-18 av `scripts/across-sign-candidates.ts --result`,
> som bara läser. Inga trösklar och ingen produktionskod är rörd.

## 1. Rad för rad

`skaftvinkel` är `lineOrientationDeg` för `butt → hosel`: beloppet är lutningen mot
bildens horisontal, tecknet är sidan om lodrätt (+ = klubbänden upp åt höger).

| # | frame-id | mitt svar | beräknat utfall | skaftvinkel | avstånd till 90° | sammanfaller |
|---:|---|---|---|---:|---:|---|
| 1 | `img-5385-1f59ec8d_s00_f01` | kan inte avgöra — för nära lodrätt | `across-the-line` | 75,8° | 14,2° | — (ej kallad) |
| 2 | `045-224bdedb_s00_f01` | kan inte avgöra — för nära lodrätt | `laid-off` | -82,2° | 7,8° | — (ej kallad) |
| 3 | `img-4949-218bb1b6_s00_f02` | `laid-off` | `laid-off` | -73,7° | 16,3° | **ja** |
| 4 | `img-5384-acea6a74_s00_f02` | kan inte avgöra — för nära lodrätt | `laid-off` | -73,9° | 16,1° | — (ej kallad) |
| 5 | `082-a6b3c908_s01_f02` | `laid-off` | `laid-off` | -79,1° | 10,9° | **ja** |
| 6 | `img-1558-8e59ca37_s02_f03` | kan inte avgöra — för nära lodrätt | `laid-off` | -80,5° | 9,5° | — (ej kallad) |
| 7 | `090-971827ab_s03_f03` | `across` | `across-the-line` | 30,6° | 59,4° | **ja** |
| 8 | `040-42b11ae6_s00_f03` | `laid-off` | `on-plane` | 2,1° | 87,9° | **NEJ** |
| 9 | `img-5425-f0abd4a8_s02_f02` | `laid-off` | `laid-off` | -73,9° | 16,1° | **ja** |
| 10 | `032-dc66dfc3_s00_f02` | kan inte avgöra — för nära lodrätt | `laid-off` | -80,8° | 9,2° | — (ej kallad) |
| 11 | `049-88216ea7_s00_f04` | `across` | `across-the-line` | 78,9° | 11,1° | **ja** |
| 12 | `img-3641-adde195e_s00_f02` | kan inte avgöra — fel fas, bildrutan är en finish (ser dessutom vänsterhänt ut) | `across-the-line` | 48,1° | 41,9° | — (ej kallad) |

**Fördelningen av svaren:** 6 kallade (2 `across`,
4 `laid-off`), 5 stoppade
på *för nära lodrätt*, 1 stoppad på annat skäl
(rad 12: fel fas, bildrutan är en finish (ser dessutom vänsterhänt ut)).

## 2. Teckenfrågan

Räknat **bara** på de rader som kallades `across` eller `laid-off`.
`kan inte avgöra` är inte ett svar om tecknet och räknas inte in.

**De kallade raderna är 6, inte 5.** Uppdraget sa fem; filen bär sex
(rad 3, rad 5, rad 7, rad 8, rad 9, rad 11). Siffrorna nedan är räknade på alla sex,
och eftersom den sjätte råkar vara just den avvikande står båda talen här: **5 av
6** med den, **5 av 5** utan den.

| | Antal |
|---|---:|
| Tecknet sammanfaller (ögats sida = `deviationDeg`-tecknet) | **5 av 6** |
| Tecknet avviker | 1 |
| Utfallet sammanfaller hela vägen (även `on-plane`-bandet) | 5 av 6 |

**Avvikande rad:** rad 8, `040-42b11ae6_s00_f03` — ögat `laid-off`, beräknat `on-plane` vid 2,1°.

### Är det en inversion?

**Nej.** En vänd `ACROSS_THE_LINE_SIGN` vänder *varenda* rad samtidigt — det är en konstant,
inte en per-bildruta-egenskap. Här står 5 rader rätt, och de står rätt **på
båda sidor om lodrätt**: 3 negativa
som ögat kallade `laid-off` och 2
positiva som ögat kallade `across`. En inversion hade fällt alla 6.

**Vad rad 8 (`040-42b11ae6_s00_f03`) är i stället.** Skaftet ligger 2,1° från
horisontalen — klubban står i praktiken **parallell med marken** vid toppen, alltså
87,9° från lodrätt och rakt i den andra änden av skalan än vikningen.
Där är beloppet (2,1°) mindre än `ON_PLANE_BAND_DEG` = 10,
så mätvärdet **påstår ingenting**: det svarar `on-plane`, inte `across-the-line`. Ögat kunde
ändå kalla den, och det är upplysande — vid ett vågrätt skaft avgörs across/laid-off av vart
klubban pekar i **horisontalplanet**, till höger eller vänster om mållinjen, och den
riktningen ligger i djupled. En 2D-projektion av skaftets lutning i bilden bär den inte:
båda lägena projiceras till ungefär samma vågräta streck. Ögat läser förkortning,
klubbhuvudets läge mot kroppen och bollinjen — data som `lineOrientationDeg` per konstruktion
kastar.

**Vad raden därför visar:** inte ett fel i tecknet, utan att mätvärdets blinda fläck sitter
vid **horisontalen**, inte bara vid vikningen. `ON_PLANE_BAND_DEG` är det som hindrar den
från att svara fel där — och den här raden är det första mätta belägget för att bandet gör
ett arbete. Ett (1) fall räcker inte för att flytta bandet, och ingen tröskel har rörts.

## 3. Gränsen mellan kallade och stoppade

Ögats stopp *"för nära lodrätt"* mot de kallade raderna, i lutning mot horisontalen
(90° = lodrätt skaft):

| | Antal | Intervall \|vinkel\| | Motsvarar avstånd till 90° |
|---|---:|---|---|
| Kallade | 6 | 2,1° – 79,1° | 10,9° – 87,9° |
| Stoppade (*för nära lodrätt*) | 5 | 73,9° – 82,2° | 7,8° – 16,1° |

**Inget rent snitt — intervallen överlappar.**
Överlappet går från **73,9° till 79,1°** mot horisontalen — motsvarande **10,9°–16,1° från lodrätt** — och i det bandet finns både kallade och stoppade rader. Skarpaste fallet: 73,9° förekommer på **båda** sidor om gränsen (rad 9 kallades, rad 4 stoppades — samma vinkel, olika svar).

Rent under överlappet (< 73,9°): 3 rader, alla kallade.
Rent över (> 79,1°): 3 rader, alla stoppade.

**Vad det säger.** Gränsen är ingen skarp vinkel, och den kan inte bli en tröskel: ögat
stannade på 73,9° i en bildruta och kallade 79,1° i en annan.
Det som skiljer raderna i bandet åt är alltså inte skaftvinkeln utan bildrutans egen tydlighet
— klubbhuvudets synlighet, suddigheten, hur mycket av mållinjen som syns. Men zonen ligger
**vid lodrätt**, exakt där vikningen i `lineOrientationDeg` gör tecknet ömtåligt: där
mätvärdet är som skörast vägrar ögat svara. Det är den mest användbara överensstämmelsen i
hela omgången, och den går åt rätt håll — ingen av de 5 stoppade raderna
motsäger tecknet, de säger att en människa inte heller kan avgöra det där.

## 4. Rad 12 — `img-3641-adde195e_s00_f02`

**Fasen den bär, enligt källorna:**

| Källa | Värde |
|---|---|
| Manifestets `phase` (`batch.zip` → `manifest.json`) | `top` |
| Annotatörens `phase` (CVAT-attribut) | **ingen användbar** — bildrutans export bär ett konstant förval, och fasen därifrån är kastad |
| Klipp / sving | `IMG_3641.MP4`, sving 00 |
| Vy | `dtl` (unionerad över annotatörerna) |
| Flagga | `usable` |
| Skaftvinkel | 48,1° mot horisontalen |

**Urvalsregeln som släppte in den:** *produktionsvägens val*. Bildrutan kom in därför att
**manifestets** fas säger `top` och ingen annoterad fas fanns att ställa mot den. Det är inte
bara kandidatlistans regel — raden är produktionsvägens val, alltså exakt den bildruta
`topFrameIndex` i `derived.ts` hade valt för `top-shaft-orientation` på den här svingen.
Regeln läser `frame.phase === 'top'` och har ingen aning om var den fasen kommer ifrån.

**Och här kommer den ifrån en proportion.** Svingens envelope är
`[6,111, 8,170]` och `impactSec` är
**null** — utan mätt nedslag faller `derivePhase` tillbaka
på `FALLBACK_BOUNDS` i `src/lib/dataset/datasetPhase.ts`, som är *typsvingens* proportioner
och ingenting annat. Klippets tre bildrutor i datasetet landar exakt där den tabellen säger:

| frame-id | `tSec` | andel av envelopen | manifestets fas | `FALLBACK_BOUNDS`-fönster |
|---|---:|---:|---|---|
| `img-3641-adde195e_s00_f01` | 6,576 | 0,226 | `backswing` | 0,03–0,45 → `backswing` |
| `img-3641-adde195e_s00_f02` **← raden** | 7,107 | 0,484 | `top` | 0,45–0,52 → `top` |
| `img-3641-adde195e_s00_f05` | 7,572 | 0,710 | `impact` | 0,68–0,73 → `impact` |

Etiketten `top` på den här bildrutan betyder alltså **"48,4 % in i envelopen"**, inte "här
vänder klubban". Ingen mätning i kedjan har tittat på klubban innan ordet `top` sattes.

**Vad bildrutorna visar i stället.** I `img-3641-adde195e_s00_f01` (6,576 s) ligger bollen
kvar på peggen; i `img-3641-adde195e_s00_f05` (7,572 s) är den borta. Nedslaget ligger alltså
mellan dem, och raden själv (7,107 s) ligger i det intervallet —
någonstans mellan sen baksving och strax efter nedslag. Ögats
"genomsving" är förenlig med bilderna; `top` är det inte, och **ingenting mätt stöder den
etiketten**.

**Om att den ser vänsterhänt ut — och varför det inte går att avgöra här.** I `img-3641-adde195e_s00_f01` ligger
bollen på bildens **vänstra** sida om spelaren. I varje högerhänt `dtl`-bildruta som granskats
i det här arbetet ligger den till **höger**. Det är spegelbilden av mönstret, vilket betyder
antingen en vänsterhänt spelare eller en spegelvänd inspelning — och till skillnad från
`093-2c11c3c0`, där bakgrundsskyltarna läste `TIH`/`ƎM` och avgjorde saken, finns det
**ingen läsbar text och ingen annan hållpunkt i det här klippet**. Frågan är öppen.
*Rättelse till [across-sign-blind-key.md](across-sign-blind-key.md):* där står att varje
insläppt bildruta är kontrollerad mot spegling och att bara klipp 093 var vänt. För den här
bildrutan var kontrollen i själva verket **utan resultat**, och bollens sida pekar åt andra
hållet. Den påstådda kontrollen var starkare än underlaget.

**Följden för omgången:** ingen. Raden kallades `kan inte avgöra` och ligger utanför
teckensiffran — både fasfelet och händighetsfrågan är alltså ofarliga *här*. Följden för
mätvärdet är större: en felfasad bildruta ger `top-shaft-orientation` ett värde med
`usable`-flagga, räknat på ett skaft som inte står vid toppen. Kontrollen i
`plausibility.ts` mäter punkternas rimlighet, inte fasens — den har inget test som kan
upptäcka det här, och inget av detta är en bugg i `derived.ts`: regeln gör vad den säger,
på en etikett som inte betyder vad den heter.

### Hur många fler kan bära samma fel

Av de **63** `dtl`-toppbildrutorna i kandidattabellen:

| Hur bildrutan kom in | Antal | Vad etiketten är värd |
|---|---:|---|
| Annotatören sa `top` | 33 | En människa såg bildrutan och kallade den topp |
| Bara manifestet sa `top`, ingen användbar annoterad fas | 26 | Härledd fas, oemotsagd och oberörd av någon människa |
| Bara manifestet sa `top`, annotatören sa något annat | 4 | Manifestet motsägs av en människa som sett bildrutan |
| **Summa** | **63** | |

**30 rader vilar alltså helt eller delvis på manifestets
fas**, och det är den population där samma fel kan sitta — 22 av dem är
dessutom *produktionsvägens val*, alltså den bildruta `topFrameIndex` faktiskt hade räknat på.
Andelen är inte överraskande: `batch-03/annotated-v1.zip` bär CVAT:s orörda förval på alla sina
bildrutor och ger därför ingen användbar fas alls, vilket rapporten
[across-sign-candidates.md](across-sign-candidates.md) redan mäter.

**Hur stor del av dem som verkligen är felfasade vet ingen** — det kräver att någon tittar på
dem, precis som här. Den enda mätta punkten är att 4 rader har en människa som säger emot manifestet, och den bland de 20 granskade bildrutorna
som visade sig vara en genomsving (`img-4982-23afcab9_s00_f02`) ligger i just den gruppen.
