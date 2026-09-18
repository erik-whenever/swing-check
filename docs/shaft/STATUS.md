# Skaftmätningen — kända begränsningar

> Vad mätvärdena i `src/lib/shaft/measure/` **inte** kan, mätt och inte antaget. Vad de kan,
> och varför de är byggda som de är, står i [datamodell.md](datamodell.md); vad som är gjort
> och kvar står i [../BACKLOG.md](../BACKLOG.md). Den här filen är för det som är känt fel
> eller känt osäkert och som en läsare av ett värde behöver veta **innan** hen litar på det.
>
> Senast uppdaterad: 2026-09-18 (S-24: fasrevisionen i §3 har ett mätpaket).

## 1. Den blinda fläcken vid horisontalen (`top-shaft-orientation`)

**Vid ett vågrätt skaft kan mätvärdet inte skilja across-the-line från laid-off, och det
vet inte om det.** `ON_PLANE_BAND_DEG` döljer problemet snarare än löser det.

**Fyndet.** I den blinda bedömningsomgången ([across-sign-result.md](across-sign-result.md))
kallade ögat `040-42b11ae6_s00_f03` **laid-off**. Mätvärdet svarar `on-plane` med
`deviationDeg` **+2,1°** — alltså inte bara en annan etikett utan **motsatt tecken** mot vad
ögat läste. Det var den enda av sex kallade rader som inte sammanföll.

**Varför, och varför det inte är en bugg.** Skaftet ligger 2,1° från horisontalen — klubban
står i praktiken parallell med marken vid toppen. Där avgörs across/laid-off av vart klubban
pekar i **horisontalplanet**, till höger eller vänster om mållinjen, och den riktningen ligger
i **djupled**. Båda lägena projiceras till ungefär samma vågräta streck i bilden.
`lineOrientationDeg` mäter lutningen i bildplanet och kan per konstruktion inte bära svaret.
Ögat kan, för det läser förkortning, klubbhuvudets läge mot kroppen och bollinjen — data som
mätvärdet kastar.

**Vad som gäller i dag.** `ON_PLANE_BAND_DEG = 10` gör att mätvärdet svarar `on-plane` och
alltså **inte påstår någon riktning** inom 10° från horisontalen. Det är vad som räddar
utfallet här, och det är första gången bandet kan visas göra ett arbete. **Bandet är
oförändrat:** underlaget är **n = 1**, en bildruta, en observatör, och en tröskel flyttas inte
på det.

**Vad som skulle avgöra saken:** flera blint bedömda toppar med skaftet inom ~15° från
horisontalen, spridda över båda riktningarna. Går ögat och mätvärdet isär systematiskt där,
är bandet för smalt — eller, troligare, är det ett mätvärde som borde svara
`cannot-determine` nära horisontalen på samma sätt som det redan gör nära lodrätt.

**Läs därför `on-plane` som "ingen riktning uttalad", aldrig som "skaftet låg på planet".**

## 2. Nära lodrätt svarar mätvärdet inte alls (avsiktligt)

`NEAR_VERTICAL_GATE_DEG = 16`: inom 16° från lodrätt blir utfallet `cannot-determine` med
skälet `top-shaft-near-vertical`, och tecknet beräknas aldrig. Det är **inte** en brist utan
den mätta gränsen för vad som går att läsa — se [datamodell.md](datamodell.md) →
*Närlodrätt-spärren*. Kostnaden är mätt: **6 av 63** `dtl`-toppbildrutor i
[across-sign-candidates.md](across-sign-candidates.md) går från kallat utfall till
`cannot-determine`.

Begränsningen att vara medveten om är **gränsens skärpa, inte dess läge**: ögats egen gräns
överlappar (10,9°–16,1°), och tre bildrutor ligger 0,08–0,26° utanför spärren. Vid den
lutningen är ett kallat utfall alltså inte fel, men det är inte heller reproducerbart.

## 3. Fasen `top` är ofta en proportion, inte en mätning

**Den bildruta mätvärdet räknar på behöver inte vara toppen.** `topFrameIndex` läser
`frame.phase === 'top'` och kan inte se var etiketten kommer ifrån. När manifestet saknar
säkert nedslag härleds fasen ur *typsvingens* proportioner (`FALLBACK_BOUNDS` i
`src/lib/dataset/datasetPhase.ts`), så `top` betyder då **"omkring 48 % in i svingens
envelope"**.

**Mätt:** av de 63 `dtl`-toppbildrutorna vilar **30** helt eller delvis på manifestets fas (26
utan användbar annoterad fas, 4 där annotatören säger emot manifestet), och **22 av dem är
produktionsvägens val** — den bildruta `topFrameIndex` faktiskt skulle räkna på. Ett bekräftat
fall: `img-3641-adde195e_s00_f02` bär `top` ur manifestet men visar en genomsving (bollen
ligger kvar på peggen 6,576 s och är borta 7,572 s; bildrutan är tagen 7,107 s).

`plausibility.ts` mäter punkternas rimlighet, inte fasens, och har **inget test som fångar
det här**. Ett värde med flaggan `usable` kan alltså vara räknat på fel ögonblick.
**Egen uppgift — fasderiveringen är inte rörd av spärrarbetet ovan.**

**Hur ofta det händer är fortfarande okänt, men det mäts nu.** De 22 bildrutorna ligger i ett
blint granskningspaket, [phase-audit/](phase-audit/) (frö `0xfa5ec0de`): 22 kandidater plus 10
kontroller med annoterad fas, oidentifierade och blandade. **Ingen fix är byggd** — siffran ska
finnas först. Så länge `phase-audit/review.md` är obesvarad är den enda mätta punkten
fortfarande de 4 rader där en människa säger emot manifestet, plus det enda bevisade fallet
ovan. Läs inte `phase-audit/facit.md` innan review är ifylld.

## 4. Händighet finns inte i datamodellen, och spegelvända klipp går inte att skilja från vänsterhänt spel

`handedness` måste anges av anroparen; varken manifestet eller CVAT-attributen bär den.
Värre: **minst ett klipp i datasetet är spegelvänt** (`093-2c11c3c0` — rangeskyltarna läser
`TIH`/`ƎM`, distansmarkeringen `00Ɛ`). En spegelvänd inspelning av en högerhänt spelare är i
bilden en vänsterhänts sving, och **det är bilden detektorn och mätvärdet arbetar i**. Utfallet
blir det motsatta utan att något i kedjan märker det.

Ett andra klipp, `img-3641-adde195e`, visar bollen på vänster sida om spelaren — mönstrets
spegelbild — men saknar både läsbar bakgrundstext och synlig boll i den bedömda bildrutan, så
vänsterhänt spelare och spegelvänd inspelning **går inte att skilja åt där**.

Ingen **verifierat** vänsterhänt, ospeglad bildruta är bedömd. Den vänsterhänta halvan av
`ACROSS_THE_LINE_SIGN` är fortfarande en spegling per konstruktion.

## 5. Bladvinkeln bärs men används inte

`bladeAngleDeg` finns i rådatalagret och mäts fullt ut av kontrollen, men **inget härlett
mätvärde läser den**. Skälet är mätt och står i [datamodell.md](datamodell.md) och
[../../training/blade-usability.md](../../training/blade-usability.md): `toe`/`heel` har
median 0,26 i konfidens mot skaftets 0,99, och bladvinkeln bär ett brusgolv som ingen tröskel
tar bort.
