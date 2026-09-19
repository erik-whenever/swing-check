# Skaftmätningen — kända begränsningar

> Vad mätvärdena i `src/lib/shaft/measure/` **inte** kan, mätt och inte antaget. Vad de kan,
> och varför de är byggda som de är, står i [datamodell.md](datamodell.md); vad som är gjort
> och kvar står i [../BACKLOG.md](../BACKLOG.md). Den här filen är för det som är känt fel
> eller känt osäkert och som en läsare av ett värde behöver veta **innan** hen litar på det.
>
> Senast uppdaterad: 2026-09-18 (S-32: toppomgången i §3 är byggd men inte körd — inga svar
> finns än, ingen siffra är mätt, spärren från S-30 står kvar).

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

**Hur ofta det händer är nu mätt: 13 av 22 — 59 %.** Den blinda omgången i
[phase-audit/](phase-audit/) (frö `0xfa5ec0de`, 22 kandidater + 10 kontroller) är körd och
utvärderad i [phase-audit/resultat.md](phase-audit/resultat.md). Av de 22 bildrutor
`topFrameIndex` faktiskt räknar på visar **13 inte toppen**; 6 (27 %) är bekräftat rätt och 2
(9 %) är rätt men går inte att skilja från grannbildrutan. Siffran bär: granskaren gick **7
rätt och 0 fel** på de tio kontrollerna och kallade `top` korrekt när en annoterad topp låg
framför honom, så talet mäter etiketten och inte ögat.

**Felet är systematiskt och har två ansikten.** Utan `impactSec` landar etiketten **för sent**
— 5 av 5 fel, alla på exakt envelope-andel **0,484**, alltså rena `FALLBACK_BOUNDS`-rader där
`top` ordagrant betyder "48,4 % in i envelopen". Med `impactSec` landar den **för tidigt**: 7
av 8 fel är `backswing`. **Inom den impact-ankrade delmängden** ligger varje fel-fas-rad på
envelope-andel ≤ 0,444 och varje rad ≥ 0,500 är något annat än fel — men den monotoniciteten
gäller *bara* där: fallback-raderna ligger alla på 0,484 och är fel rakt igenom.
Källklipp, klipplängd, fps och DTL/face-on säger ingenting i underlaget (n för litet,
konfunderat, eller noll varians — alla rader är `dtl` per konstruktion).

**Fixad 2026-09-18 (S-30) — genom att sluta svara, inte genom att hitta toppen.** Fasen bär
nu sin härkomst (`PhaseSource` på varje `ShaftFrameSample`: `observed`, `envelope-impact`,
`envelope-fallback`), och `shaft-position-p4`, `top-shaft-orientation` samt `top`-hinken i
`shaft-angle-by-phase` returnerar **inget tal** när toppen inte är observerad — nytt skäl
`top-phase-not-observed`, skilt från `phase-missing`. Kostnaden är mätt över alla 205
svingar: **43 (21 %) går från ett tal till tomt, 109 (53 %) svarar fortfarande, 53 var redan
tysta.** Men de 109 svarar bara därför att en människa annoterat delar av datasetet — **i
appen finns ingen annoterad fas, så där är alla 205 tysta**, vilket är avsikten.
[phase-trust.md](phase-trust.md).

**Problemet är alltså inneslutet, inte löst.** Ett värde med flaggan `usable` kan inte längre
vara räknat på fel ögonblick vid toppen; priset är att det inte räknas alls. Spärren kan bara
lyftas av en pålitlig toppkälla, inte av en tröskel.

**Skaftsignalen löser det inte på envelope-rutorna (S-27).** Vändpunkten i skaftvinkeln ger
noll kandidater i 31 av 66 hela banor och träffar 2 av 5 bedömda toppar (n för litet); toppen
ligger på en platå inom detektorbruset. Tät signal är oprövad. Se
[top-from-signal.md](top-from-signal.md). **Tät signal (S-28)** tar bort glesheten men inte problemet: 0 av 6 bedömda toppar
träffas, och 4 av 6 ligger i en detektionslucka. Se [top-from-dense-signal.md](top-from-dense-signal.md).
**Bortfallets läge (S-29)** bär inte toppen: luckorna är glesast vid 30–60 % av envelopen och lika
vanliga vid nedslaget; toppen ligger i längsta luckan i 3 av 6 (rättar S-28:s 4 av 6) och byter
rad under en annan luckdefinition. Se [top-from-dropout.md](top-from-dropout.md).

**Handleden bär däremot en observerad topp (S-31) — men bär ingen tröskel.** Samma MediaPipe-modell
som webben, körd per videobildruta på samma 103 svingar: **8 av 6 548** envelope-bildrutor saknar
pose (0,12 %), `presence` median 0,998, och runt alla sex utpekade topparna finns pose i **7 av 7**
bildrutor mot skaftets 0/1/7/7/1/4. Bortfallet är *minst* vid 40–60 % av envelopen, där topparna
ligger. Bästa estimatorn (teckenväxling i handledernas vertikala hastighet med hysteres) ligger
median **1,5 videobildrutor** från Eriks toppintervall och flyttar sig median **0** bildrutor över
hela hysteressvepet — mot S-28:s 0 av 6 träffar och median 8 bildrutors drift. **Men n = 6 toppar
i 5 oberoende klipp, den träffar *inne* i intervallet bara 1 gång av 6, och face-on samt verifierat
vänsterhänt material är omätt.** Spärren i det här avsnittet står därför kvar oförändrad: det som
skulle lyfta den är en kontrollrik toppomgång (S-32), inte det här underlaget. Se
[top-from-pose.md](top-from-pose.md).

**Den omgången är nu körd och utvärderad (S-32) — och spärren står ändå kvar.**
[top-review/resultat.md](top-review/resultat.md). Erik och Lisa bedömde **alla 103 svingar i 81
oberoende klipp** var för sig, blint, med intervall som svar; Eriks andra pass på 35 svingar
redovisas separat och slås aldrig ihop med det första. **Kontrollerna bär rundan:** Erik 31 rätt /
10 fel / 4 osäker, Lisa **36 / 9 / 0** av 45, båda med median 0 exportrutors avvikelse — men
**åtta kontroller missas av båda**, vilket är omgångens egentliga felmått. Eriks två pass missar
**samma fem svingar och inga nya**: det är materialet, inte trötthet.

**Det mänskliga golvet finns nu, och det är smalt.** Av 91 svingar i 73 klipp där båda svarade
**överlappar 90 (99 %)**, mittpunkterna ligger median **0** bildrutor isär utan systematisk
riktning, och spannet (unionen av de två intervallen) är **2 bildrutor**. Det är golvet S-31
saknade när den kallade resten av avståndet fel.

**E3 mot det golvet: inne i spannet i 30 av 91 (33 %)**, inne hos båda bedömarna samtidigt i 19
(21 %), med **|median| 1 bildruta** mot vardera. E1 är bekräftat fel konstruktion (median +18
rutor, n=94); E2 träffar oftare (45 av 91) men bär p90 28–30 och max 205. **E3:s förskjutning är
riktningskonstant** — 89 % respektive 88 % av missarna ligger *före* — och **överlever
leave-one-clip-out**: ett skift på −1 ruta anpassat utan det egna klippet lyfter träffen 23→44 och
27→53. **Men MAD står kvar på 1,0, och även skiftad ligger E3 inne i under hälften av raderna.**
Förskjutningen är en konstant *ovanpå* en spridning, inte i stället för den — **och inget skift är
applicerat, ingen tröskel satt.**

**Mätt men inte avgjort:** oenighet och breda intervall förutsäger ingenting om E3, men på de **5
svingar där båda bedömarna teg** ligger E3 och E2 **9,5 bildrutor isär** mot 1,0 i resten, och E3
gav inget val alls på 2 av 103 svingar — båda sådana där minst en människa också teg. n = 5.
Kameravinkeln säger ingenting (face-on = dtl, men bara 7 svingar med svar från båda) och **inte
heller nedslaget**: E3 mäter lika bra på de 20 svingar utan säkert nedslag som på de 83 med,
alltså även på `FALLBACK_BOUNDS`-fallen där den fasderiverade vägen är som sämst. Sämsta cellen är
bekräftad spegelvändning (3,5–4,0 rutor) — **2 svingar i ett enda klipp**.

**Ungefär hälften av E3:s enrutasförskjutning var rutnätet (S-33).**
[top-review/subframe.md](top-review/subframe.md) interpolerar fram nollgenomgången i v_y i stället
för att välja en bildruta. Den ligger median **0,43 rutor** efter E3:s val, och mot spannet stiger
träffen från 30 av 91 till **42–45 av 91** — utan att något anpassas, men fortfarande långt under
människornas 67–80 %. De tre varianterna (E4/E5/E6) ligger inom 3 rader av varandra och **ingen av
dem väljs**. **Efter interpolationen finns ingen konstant helrutesförskjutning kvar att kalibrera
bort**, men mot vardera bedömaren för sig ligger restskiftet precis på halvrutan — det är mellan 0
och −1, inte robust noll. **Spridningen är orörd**: p90 går 3,0 → 2,1–2,8 och max 26,0 → 25,1, det
vill säga precis den halvruta en interpolation kan flytta. Kvantiseringen satt i mitten, aldrig i
svansen. Samma omgång visar att **E2:s svans är ett trasigt ankare** (envelopens snabbaste bildruta
ligger i tiondel 8–9, median +59 rutor efter spannet, i 10 rader varav 6 slow-mo) och att **de åtta
gemensamt missade kontrollerna är fall där bedömarna är eniga med varandra men inte med CVAT-facit**
— sju ser ut som ett för grovt exportrutnät, en (`054.mp4`) som en annan händelse.

**Spärren i det här avsnittet står kvar oförändrad.** Vad rundan gav är ett mått, inte ett beslut:
E3:s avstånd till ögat är nu mätt mot 91 svingar i stället för skattat på sex, och vad som är nära
nog är fortfarande obestämt. **Punkt 3 i S-32:s spec — verifierat vänsterhänt, ospeglat material —
är fortfarande obesvarad**, och händighet står `unknown` på alla 103 svingar (§4 nedan).

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
