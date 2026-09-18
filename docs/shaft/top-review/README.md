# Blind toppomgång (S-32) — metod och sammansättning

> Byggd 2026-09-18 av [`build_round.py`](build_round.py), ett **engångsverktyg som bara
> läser**. Ingen produktionskod är rörd: `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är oförändrade, ingen fix är byggd och ingen
> tröskel är satt. **Frön: `0x70bc0de5` (id), `0xe71c0de5` (Erik), `0x715a0de5` (Lisa).**

> **Läs den här filen EFTER att du bedömt, inte före** — samma regel som
> [phase-audit/README.md](../phase-audit/README.md). Den bär inga svar, men den bär rundans
> sammansättning: hur många kontroller det finns och vilka svingar som redan har ett facit.
> Vet man det, vet man ungefär vad man ska hitta, och då är bedömningen inte längre blind.
> Vill du bara köra omgången praktiskt: [KOR-OMGANGEN.md](KOR-OMGANGEN.md), som är skriven
> för att vara ofarlig att läsa i förväg.

## Frågan

[top-from-pose.md](../top-from-pose.md) (S-31) visade att handleden bär en observerad topp
där skaftlinjen inte gör det, och att **E3** — teckenväxling i handledernas vertikala
hastighet med hysteres — ligger median 1,5 videobildrutor från Eriks toppintervall och
flyttar sig median 0 bildrutor över hela hysteressvepet. **Men underlaget är 6 toppar i 5
oberoende klipp**, E3 träffar *inne* i intervallet bara 1 gång av 6, och de sex "intervallen"
är härledda ur en **fasetikett** — Erik bedömde vilken fas en bildruta visade, inte var
toppen låg. Ingen har ritat ett toppintervall i det här datasetet.

Den här omgången ritar dem. **Frågan är toppens bildruta, inte fasetiketten** — det är E3:s
utdata. Svaret är ett **intervall**: första och sista bildrutan som rimligen är toppen. Ett
enskilt val hade tvingat bedömaren att låtsas om en precision hen inte har; S-31 visade att
höjdplatån är 4–30 bildrutor bred och fartplatån 19–85.

## Vad som byggs

| | |
|---|---:|
| Svingar (alla med lokal källvideo i `data/shaft/clips/`) | **103** |
| Oberoende källklipp | **81** |
| Envelope-videobildrutor att stega igenom | **6 548** |
| Bildrutor per sving | min 34, median 49, max 286 |

6 548 är exakt samma tal som S-28 och S-31 rapporterade för samma envelope-fönster — en
välkommen kontroll på att omgången arbetar på samma bildrutor som spikarna gjorde.

Per sving skrivs varje avkodad videobildruta **inne i envelopen** som `001.jpg`, `002.jpg`, …
Ingen marginal utanför: frågan är var toppen ligger *inne i* envelopen, och en marginal hade
låtit bedömaren svara med en bildruta ingen estimator kan välja. Långsidan kapas vid 1280 px
(aldrig uppskalad — materialet går från 1080×1920 ned till 360×614) vid JPEG-kvalitet 92.

## Blindningen

**E1/E2/E3:s val finns inte någonstans i paketet.** `build_round.py` beräknar dem inte,
importerar inte `analyze_pose.py` och läser ingen posebana. De räknas först av
[`score_round.py`](score_round.py), efter att båda svarsfilerna ligger på plats. Ett val kan
inte läcka ur en fil som aldrig burit det.

**Svingnycklarna är utbytta mot ogenomskinliga id (`S32-001` … `S32-103`).** Skälet är
konkret: `045-224bdedb_s00` står som committad text i
[phase-audit/review.md](../phase-audit/review.md) *bredvid Eriks svar för den*. En mapp med
det namnet hade räckt facit till båda bedömarna på sex svingar och räckt Lisa Eriks tidigare
bedömning. Id-kartan ligger i registret, filen ingen öppnar förrän svaren är inne.

**Tre skilda frön, tre skilda blandningar.** Id-tilldelningen (`0x70bc0de5`), Eriks ordning
(`0xe71c0de5`) och Lisas (`0x715a0de5`) är oberoende Fisher-Yates-blandningar med
mulberry32 — samma generator som [phase-audit/select.ts](../phase-audit/select.ts), så
frönumren betyder samma sak i båda omgångarna. Ingen sving hamnar på samma plats hos de två
bedömarna. Fröet står utskrivet i varje bedömares egen vy.

**Bedömarvyn vet ett id och ett bildruteantal, ingenting annat.** Inte klippnamnet, inte
sekunderna, inte fps, inte slow-mo-flaggan, inte kameravinkeln, inte fasen, inte
envelopegränserna, inte nedslaget.

**Två bedömare, oberoende.** Erik och Lisa har var sin mapp, var sin ordning och var sin
svarsfil. Ingen ser den andras förrän båda är inne.

## Kontrollraderna

Samma mönster som S-23: en **kontroll** är en rad vars svar en oberoende människa redan
gett, inblandad **omarkerad**, så att omgången mäter bedömaren och inte bara estimatorn.

Här är det en sving där en CVAT-annotatör märkt **exakt en** exporterad envelope-bildruta som
`top`, där varje pass som rört den bildrutan är enigt, och där ingen annan bildruta i svingen
heter `top`. `batch-03/annotated-v1.zip` är utesluten: dess `phase` är `address` på alla 242
bildrutor, vilket är CVAT:s `default_value` — ett orört förval är inte en bedömning. Fyra
bildrutor i materialet har pass som säger emot varandra och räknas inte alls.

**45 kontrollsvingar i 39 klipp**, alltså 44 % av rundan. Kontrollen ligger på det **glesa
exportrutnätet** (upp till 7 bildrutor per sving), inte på videorutnätet, så den enda fråga
det rutnätet kan svara på är den som ställs: *är den annoterade bildrutan den exporterade
bildruta som ligger närmast bedömarens intervall?* Den frågan behöver ingen tolerans och
sätter därför ingen tröskel.

Den strängare regeln — en annoterad `backswing` före och en annoterad `downswing` efter, så
att vändningen är inklämd mellan två oberoende etiketter — håller för **3 av 103** svingar.
Den är registrerad per sving som `bracketed` och den är **inte** kontrollregeln: en
kontrollmängd på 3 mäter ingenting.

## De sex svingar som redan har ett facit

S-31:s sex rader med utpekad topp ligger med i rundan, **omarkerade och i den vanliga
ordningen**: `S32-071`, `S32-034`, `S32-066`, `S32-023`, `S32-075`, `S32-017` (fem klipp —
`093.mp4` bidrar med två). Det är själva poängen med dem: om Eriks nya intervall inte
innehåller hans eget gamla svar, var de sex aldrig det facit S-31 behandlade dem som.

**Två av dem är också kontroller, och de två källorna pekar inte på samma bildruta:**

| id | kontrollens ruta | Eriks tidigare svar | avstånd |
|---|---|---|---:|
| `S32-034` | exportruta 3, 2,320 s | ruta 2, 2,121 s (`top`) | 0,20 s |
| `S32-023` | exportruta 6, 10,646 s | ruta 2, 9,714 s (`backswing★`) | 0,93 s |

Det är **inte avgjort här och ska inte avgöras här**. `S32-023` är den slow-mo-sving vars
handhöjdsplatå S-31 mätte till 0,8 s bred — precis det fall där "toppen" betyder två olika
saker beroende på om man läser klubbhuvudet eller händerna. Konflikten står i registret;
omgången får svara på vilken av dem ett par ögon faktiskt landar på.

## Registrerat men aldrig visat för bedömaren

Per sving i registret: kameravinkel (annotatörens `view`, rå mängd **och**
`prelabel_batch.py`:s bucket), fps, slow-mo-flagga, misstänkt spegelvändning, källa
(`web`/`own`), gate, envelope, `impactSec`, `hasConfidentImpact`, klipp, upplösning och hela
tabellen bildruteindex → sekund.

| | |
|---|---|
| Kameravinkel | 93 `dtl`, 8 `face_on`, 2 svingar med båda vyerna annoterade |
| Slow-mo | 15 av 103 |
| Källa | 102 `web`, 1 `own` |
| Bekräftat spegelvänt | 2 svingar (`S32-075`, `S32-017`, båda ur `093.mp4`) |
| Utan säkert nedslag | 20 av 103 |
| Gate | 81 `production`, 22 `dataset-relaxed` |

**Face-on kan alltså brytas ut i efterhand** — det är den uppdelning S-31 inte kunde göra
alls, eftersom alla dess 32 bedömda rader var `dtl` per konstruktion.

**Spegelvändning är ingen mätning i det här repot, det är en lista över klipp någon faktiskt
tittat på.** `093.mp4` har spegelvänd bakgrundstext ([STATUS.md](../STATUS.md) §4). Alla
andra klipp står som `unknown`, **inte** som `false`: ingen har kontrollerat dem.

**Händighet står som `unknown` på varje sving.** Den finns inte i datamodellen, och den
gissas inte ur bilden här. Fältet finns för att uppdelningen ska gå att köra den dag någon
mäter den — [`score_round.py`](score_round.py) har redan uppdelningen, den kommer bara att
visa en enda hink tills dess.

## Var sakerna ligger

| | |
|---|---|
| Bildmaterial, bedömarvyer, svar, register | `data/shaft/top-round/` — **gitignorerat** (`data/shaft/*`) |
| Skript och rapport | `docs/shaft/top-review/` — committas |

Samma skäl som för `phase-audit/frames/` och `across-sign-candidates/`: identifierbara
personer, publiceras aldrig. Texten bredvid committas, bilderna aldrig. I en färsk klon
saknas de alltså — kör om skriptet, **samma frön ger samma 103 svingar i samma ordningar**.

Backloggen skriver `docs/shaft/top-review/`, uppgiften skriver `data/shaft/top-round/`. Båda
stämmer: den första är texten, den andra är bilderna.

## Kör om

Kräver ett venv med `opencv-python` (byggd med 5.0.0) och `data/shaft/clips/` på plats.
Från repo-roten:

```sh
<venv>/Scripts/python.exe docs/shaft/top-review/build_round.py --dry-run   # bara härledningen
<venv>/Scripts/python.exe docs/shaft/top-review/build_round.py             # bygger paketet (~1,3 GB)
```

Bygget **vägrar** skriva över en ifylld svarsfil utan `--force`. En ombyggd runda är en ny
ordning, och en svarsfil som hör till den gamla är tyst fel.

## Vad omgången inte kan svara på

- **Verifierat vänsterhänt, ospeglat material.** Det finns fortfarande inte. Två av de sex
  tidigare bedömda svingarna kommer ur det spegelvända `093.mp4`, och den vänsterhänta halvan
  av `ACROSS_THE_LINE_SIGN` är fortfarande en spegling per konstruktion. Rundan gör den här
  luckan **synlig**, inte mindre.
- **Eget material.** 102 av 103 svingar är `web`. Samma konfundering som S-28 och S-31:
  ingenting i rundan säger något om egna klipp.
- **De 102 svingar utan lokal källvideo.** De går inte att stega igenom och är inte med.
  Rundan gäller den lokala halvan av datasetet, inte datasetet.
- **Om E3 kan lyfta S-30:s spärr.** Det är nästa fråga, inte den här. Den här omgången
  producerar ett facit, inte en detektor, och ingen tröskel flyttas på den.
- **Paritetsavvikelserna mot webbkedjan.** Posebanorna kommer från S-31:s körning med dess
  fem nedskrivna avvikelser ([top-from-pose.md](../top-from-pose.md) → *Modellparitet*). De
  är oprövade där och blir inte prövade här.

## Så utvärderas den efteråt

[`score_round.py`](score_round.py) är skrivet men **inte kört** — det finns inga svar än. Det
mäter tre saker **åtskilt**, och räknar **oberoende klipp, inte rader** (103 svingar i 81
klipp; varje rubriksiffra är medianen över klipp av klippets median, med radsiffran utskriven
bredvid):

1. **Kontrollerna först** — omgångens eget felmått. Missar bedömarna dem, mäter resten
   bedömaren och inte estimatorn, och siffrorna nedanför ska inte tolkas.
2. **(a) Erik mot Lisa** — det mänskliga spannet i bildrutor: överlappsfrekvens, glapp,
   mittpunktsskillnad och varderas egen intervallbredd. Två personer som inte kan komma
   inom *k* bildrutor av varandra lägger ett golv under vad en estimator kan avkrävas.
3. **(b) varje estimator mot vardera annotatören**, aldrig mot en sammanslagen "sanning" —
   att slå ihop två bedömare till ett svar uppfinner en enighet ingen av dem gav.
4. **(c) E3:s systematiska förskjutning** — konstant eller spridd? En konstant förskjutning
   är en kalibrering, en spridd är brus som bär en median. De skiljs åt med
   **leave-one-clip-out**: skiftet anpassas på alla klipp utom ett och tillämpas på det
   undanhållna. Att anpassa skiftet och sedan redovisa dess egen förbättring hade bara mätt
   att aritmetik fungerar.
5. **Kovariater** beskrivande, uppdelade per vy, slow-mo, källa, spegelvändning, nedslag och
   fps. Grupperna är små och konfunderade med källan. **En skillnad där är en fråga, inte ett
   fynd.**

`osäker` är en **tredje kategori** överallt — aldrig en miss, aldrig en träff. Samma regel som
[phase-audit/README.md](../phase-audit/README.md) satte och
[across-sign-result.md](../across-sign-result.md) följde: ett intervall ingen kunde rita är
inte ett intervall en estimator missade.
