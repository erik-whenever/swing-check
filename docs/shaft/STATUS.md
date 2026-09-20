# Skaftmätningen — kända begränsningar

> Vad mätvärdena i `src/lib/shaft/measure/` **inte** kan, mätt och inte antaget. Vad de kan,
> och varför de är byggda som de är, står i [datamodell.md](datamodell.md); vad som är gjort
> och kvar står i [../BACKLOG.md](../BACKLOG.md). Den här filen är för det som är känt fel
> eller känt osäkert och som en läsare av ett värde behöver veta **innan** hen litar på det.
>
> Senast uppdaterad: 2026-09-20 (S-40: **att läsa toppen över ett fönster stabiliserar utfallet —
> men betalar 11 rätta rader för 1, och fönstret finns inte i produktionens rutnät.** Se §1, §2, §3
> och det nya §6. Spärren från S-30 står kvar oförändrad och ingen tröskel är satt, ingen bredd är vald.
> Föregående: S-39, en bildrutas fel byter `top-shaft-orientation`:s utfall på 22 % av raderna —
> men samma utfall byter på 9 % när ingenting alls ändras; och etiketten "slow-mo" rättad till
> "lång envelope" i S-31…S-38.)

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

**Bandets kant är mätt som rörlig (S-39).** Sätts toppen på första mot sista rutan i en bedömares
*eget* intervall byter **2 av 91 rader** mellan `across-the-line` och `on-plane` (`S32-027`,
`S32-060`) — alltså utan att någon estimator är inblandad. n = 2 rader i 2 klipp, och **bandet är
oförändrat**. [top-review/verdict-sensitivity.md](top-review/verdict-sensitivity.md) §2.

**Och kanten flyttar sig inte bort av att läsas över ett fönster (S-40).** Läses utfallet som
produktionens egen median över 3, 5 eller 7 bildrutor faller spannets byten från 12 av 91 till
10 / 10 / **5** — men av de fem som återstår vid bredd 7 är **fyra** `cannot-determine`↔`laid-off`,
alltså §2:s spärrkant och inte den här. **Bandet är fortfarande oförändrat**, och ingen bredd är
vald. [top-review/windowed-tso.md](top-review/windowed-tso.md) §1.

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

**Hur ofta det slår igenom är nu mätt (S-39).** Inom ett enda mänskligt intervall — första mot
sista ruta, median 2 rutor brett — korsar **5 av 91 rader** spärren i någon riktning, alltså
mellan `cannot-determine` och en kallad riktning (`S32-031`, `S32-034`, `S32-040`, `S32-045`,
`S32-084`). Flyttas toppen en bildruta från E4:s val är 13 av 23 byten kategori mot kategori.
**Spärren är oförändrad**; det som är mätt är att dess kant ligger inne i den upplösning både ögat
och estimatorn arbetar med. [top-review/verdict-sensitivity.md](top-review/verdict-sensitivity.md)
§1 och §2.

**Ett fönster tar inte bort kanten, det flyttar bara vilka rader som ligger på den (S-40).**
Med produktionens egen median över sju bildrutor byter spannets ändar utfall på 5 av 91 i stället
för 12 — men **bara 2 av de 5 är rader som bytte vid enrutsavläsning**; tre är rader fönstret
självt har brutit, och fyra av fem korsar den här spärren. På de raderna hamnade de två
medianerna dessutom **5–8 bildrutor isär**, alltså längre isär än de två mittrutor de utgick
från. [top-review/windowed-tso.md](top-review/windowed-tso.md) §1.

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
ligger i tiondel 8–9, median +59 rutor efter spannet, i 10 rader varav 6 med lång envelope) och att **de åtta
gemensamt missade kontrollerna är fall där bedömarna är eniga med varandra men inte med CVAT-facit**
— sju ser ut som ett för grovt exportrutnät, en (`054.mp4`) som en annan händelse.

**Och svansen är inte en felvald teckenväxling (S-34).**
[top-review/crossing-selection.md](top-review/crossing-selection.md) räknar varje växling E3:s egen
sökning kunnat returnera, inte bara den första. Av de **49 rader (40 klipp)** där E4 ligger utanför
spannet finns en **annan** växling som hade landat inne på **1 rad (2 %)**, och den valda är redan den
närmaste på **46 av 49 (94 %)**. **23 av 49 svingar har bara en enda kandidat i hela envelopen** —
E3 väljer inte, den tar det som finns. **Undantaget är de tre yttersta raderna** (−26, −16, −9
rutor), där en annan växling ligger 16–25 rutor närmare; de ligger tidigt i envelopen, har brantare
lutning och 2–8 gånger mindre amplitud efter sig — **3 rader i 3 klipp, ingen regel dras**. E6:s
klämning är inte heller en felkonstruerad bracket: den klämda handleden har alltid en egen växling,
i median **1 ruta** från bracketen. Diagnos, ingen ny estimator, ingen tröskel.

**Och det är inte flera svingar i samma envelope heller — men segmenteringen tappar svingar (S-35).**
[top-review/multiswing.md](top-review/multiswing.md) lägger en flersvingsflagga på handledsbanan i
alla 103 envelopes (utflykter över adresshöjd, återvändningar till den, prominens — räkningar, inte
trösklar). Den tänder på **7 av 103**, och bara **en** (`S32-092`, `005.mp4`) tänder på mer än ett
kriterium — samma sving som har rundans största rutsteg i banan, så *två svingar* och *ett spår som
hoppar* går inte att skilja åt. **Bland de 23 rader som saknar armad växling är flaggandelen lägst i
hela tabellen (4 %)**: svansen är inte flersvingsklipp. Vad som däremot skiljer E2:s svans är
**banans stabilitet** — dess p90 för största rutsteget är 0,197 mot rundans 0,092. **Armningen
filtrerade ingenting:** på 22 av de 23 finns ingen teckenväxling alls i v_y inne i människornas
intervall, och den närmaste är E3:s egen, 2 rutor (median) bort. **Det motsatta felet är det
verkliga:** 16 av 81 klipp har en vändning utanför varenda envelope som når klippets egen referens,
12 av dem minst lika stor som klippets största registrerade sving. `054.mp4`:s missade sving ligger
vid 10,9 s; **värre är `001.mp4`, vars enda envelope slutar en sekund innan toppen** — samma sving
där båda bedömarna satte osäker och E3 inte gav något svar alls.

**Och människorna och estimatorn såg samma bildrutor — men talen har ett golv (S-36).**
[top-review/envelope-audit.md](top-review/envelope-audit.md) kör om båda avkodningarna ruta för
ruta: bedömarvyn och estimatorn får **samma rutor på 103 av 103 svingar**, största tidsskillnad
**0,000e+00 s**, samma 6 548 rutor i registret, på disk och i posebanan. **Hela E3-mätningen är
alltså jämförd mot rätt underlag.** Samma omgång klassar S-35:s 16 klipp: **7 missad sving** (1
marginell), **4 finishtopp utanför envelopen** — finishen, som står högre än toppen, inte en missad
sving — **2 kapad kant på själva toppen** (`001.mp4`, `011.mp4`), 2 rörelse utanför svingen och 1 ej
avgörbar. Nedströmsfelen sitter inte där: av de 22 rader utan någon växling alls ligger **3 (18 %)**
i ett av de 16, lägst i tabellen. Fönstren slutar inte mitt i rörelsen — farten vid envelopens sista
ruta är median 0,055 × toppfarten mot finishregelns 0,20 — **men banan stiger fortfarande där på
48 % av de 16 mot 26 % i de övriga**, och på 4 av 5 av deras svingar med lång envelope. Produktionen bär
dessutom egna flaggor som ingen omgång läst: `clippedTail` 7 av 103 och `suspectMultiSwing` 15 av
103.

**Det viktigaste ur S-36 är ett golv under varje siffra ovan.** En varm spårare i stället för en
kall — samma modell, samma vikter, samma bildrutor — flyttar E3:s ruta på **36 av 102 svingar**
(lika på 66, inom 1 ruta på 88, max 19) och rubriksiffran från **30 till 27 av 91**, med **7 rader
in→ut och 4 ut→in**. **E3:s hela uppmätta fel mot människorna är |median| 1 bildruta, och 1 bildruta
är precis vad den meningslösa störningen flyttar.** Riktningen (−1), LOCO:s +23 rader och
interpolationens +12 rader överlever. **Ligger i bruset: E4/E5/E6:s inbördes 3 rader, S-34:s "1 rad
av 49" och S-33:s restförskjutning på −0,24 subrutor.**

**Och samtliga siffror ovan är mätta på fel spårare (S-37) — här är de rätta (S-38).**
`runningMode: 'VIDEO'` är ett spårningsläge och `extractPoseTrajectory` bygger en kall spårare
**en gång per klipp**, inte per sving: **produktionen kör den varma**
([top-review/e2-and-floor.md](top-review/e2-and-floor.md) §1). Den varma baslinjen mot spannet
(n = 91 rader i 73 klipp) är **E4 44, E2 40, E3 27, E1 6** — mot Erik 37 / 32 / 23 / 5 och mot
Lisa 40 / 36 / 24 / 5 ([top-review/hard-core.md](top-review/hard-core.md) §1). **Den ersätter
E3:s 30 av 91 och E2:s 45 ovan, och E4 är rundans bästa estimator, inte E2.** Resten av kedjan
(LOCO, interpolationens +12 rader, kandidatanalysen, svansraderna) är **inte** omräknad varmt
och står kvar på en konfiguration produktionen inte kör. Kvar oprövat även varmt: 15 fps mot
30, delegat, avkodare.

**Vad som är kvar när alla fyra missar: 31 av 91 rader (34 %) i 25 klipp — men det är
±1-rutesbandet, inte en klass svåra svingar.** På 19 av 31 ligger bästa estimatorn **en
bildruta** fel, 94 % inom 3, max 11; som radmängd delar kall och varm bara 23 av 31 (74 %).
**Den går inte att peka ut vid körtid:** tolv storheter mätta var för sig — pose-presence,
rutsteg, envelopelängd, monotoni vid slutet, amplitud, antal växlingar och estimatorernas egen
oenighet — ger **AUC 0,43–0,60**, och \|E3−E4\| pekar åt fel håll eftersom E4 är E3:s egen
bracket. **Taket för en perfekt grindad lösning är E4 73 % / E2 67 %** mot människornas
67–80 %, men täljaren är oförändrad och grinden går inte att bygga.

**Flaggorna är dessutom samma flagga (S-38 §5):** `MAX_ENVELOPE_SEC` (produktionens
avvisningsgräns, 2026-08-06), `SLOWMO_ENVELOPE_THRESHOLD_SEC` (2026-08-13) och
`MULTI_SWING_SUSPECT_SEC` (2026-09-03) är alla **3,0 s på envelopens varaktighet**, så
`slowmo` och `suspectMultiSwing` är identiska mängder på alla 103 svingar. **Varje tal ovan
som delats på "slow-mo" är delat på "lång envelope"** — riktningen håller, orsaksnamnet inte —
och `suspectMultiSwing` tänder aldrig på en production-grindad sving (0 av 81).

**Och nu är kostnaden mätt i UTFALL och inte i bildrutor (S-39).**
[top-review/verdict-sensitivity.md](top-review/verdict-sensitivity.md) flyttar toppen ±1/2/3/5
bildrutor från E4:s varma val och läser vad **produktionskoden** svarar — `src/lib/shaft/measure/`
importerat och anropat, aldrig kopierat, med `shaft-v2.onnx` körd på alla 6 548 envelope-bildrutor.
**Vid ±1 ruta byter `top-shaft-orientation` utfall på 37 av 101 rader (37 %)** i 79 klipp; 57 % av
bytena vid −1 är kategori mot kategori och inte tystnad. `shaft-position-p4` och `top`-hinken byter
på 20 respektive 23 av 101 — men för dem kan bytet bara vara **svar↔tystnad**, eftersom ingen regel
i `src/` läser deras tal och det alltså inte finns något pass/fail att byta. **Men talet som
avgör läsningen är kontrollen:** byts bara spårartillståndet — kall mot varm, samma modell, samma
vikter, samma bildrutor — byter `top-shaft-orientation` utfall på **9 av 100**, och E3 mot E4, som
per konstruktion aldrig ligger mer än en ruta isär, på **13 av 101**. **Mätvärdet har alltså inte
en reproducerbar utgångspunkt att vara bra mot**, och frågan "duger estimatorn" är felställd innan
det är åtgärdat.

**Människornas eget spann räcker också för att vända utfallet.** Sätts toppen på bedömarens
**första** mot **sista** ruta byter `top-shaft-orientation` på **11 av 93 (Erik)**, **11 av 95
(Lisa)** och **12 av 91 (unionen)** — 16–18 % bland de rader där mätvärdet svarar, vid median
**2 rutors** intervallbredd. Fem av unionens tolv korsar `NEAR_VERTICAL_GATE_DEG` (§2), två korsar
`ON_PLANE_BAND_DEG` (§1), fem går mellan svar och tystnad, och **ingen byter tecken**. Mot en topp
satt mitt i spannet ger E4 samma utfall på **65 av 91 (71 %)**, men bara **27 av 47 (57 %)** på de
rader där den låg utanför spannet; **4 av 91 är rena teckenbyten**. **Ingen tröskel är satt och
ingen produktionskod är rörd** — och 22 %-talet är ett mått på mätvärdet, inte på produkten, för
ingen regel läser något av de tre värdena ännu.

**Och fönsterläsning löser det inte — den byter ett problem mot ett annat (S-40).**
[top-review/windowed-tso.md](top-review/windowed-tso.md) läser de tre mätvärdena över 1 (kontroll),
3, 5 och 7 bildrutor med **produktionens egen** `circularMedianDeg`, körd av `shaftAngleByPhase`
själv; medoiden pekar ut en ruta som lämnas tillbaka som enda observerade topp, så varje spärr
körs oförändrad. **Utfallet blir stadigare** — kall mot varm spårare 9 → 2 av 100, E3 mot E4
13 → 2 av 101, spannets ändar 12 → 5 av 91 — **men det är fönsteröverlapp, inte omröstning:** vid
bredd 7 läser spannets två ändar samma bildruta på 46 av 91 mot 3 av 91, och medianen röstade bort
en riktad avvikare på bara 9 av 101 fönster. **Och priset är enkelriktat:** mot en topp satt mitt
i spannet faller E4:s överensstämmelse från 65 av 91 till 60 / 59 / **55**, med **11 tappade rätta
rader mot 1 rättad** vid bredd 7. Fönstret ger däremot mer **täckning**: `shaft-position-p4`
svarar 73 → 86 av 101 och `top`-hinken 78 → 92, med `phase-missing` 18 → 5. **Ingen bredd är vald
och ingen spärr rörd.**

**Och fönstret finns inte i produktionen (S-40 §3).** `ANALYSIS_FRAME_COUNT` är **32** (inte ~20,
höjd 10 → 20 → 32 den 2026-08-11), klustret ligger på **nedslaget** eftersom klippvägen inte
skickar `clusterPhases`, och steget mellan de två valda rutorna kring toppen är median **3
bildrutor**. **Rutnätet rymmer hela fönstret på 2 av 101 svingar vid bredd 3 och på 0 av 101 vid
bredd 5 och 7**; E4:s egen ruta är en vald ruta på bara 39 av 101. Kostnaden är median 2 / 3 / 4
nya bildrutor per sving. Under allt det ligger en hårdare gräns: **envelopen och varje fas
lokaliseras på en 15 fps-bana** (`SAMPLE_FPS`), så ett fönster centrerat på en 30 fps-bildruta är
finare än den upplösning toppen hittas i.

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

## 6. Inget läser mätvärdena, och mätlagret körs inte i produktion

**`buildShaftMeasurements` anropas ingenstans i `src/`.** Inte heller `buildShaftSwingSeries`
eller `checkShaftSeries`. `detectShaft` körs på ett enda ställe utanför sin egen modul —
`src/lib/shaft/shaftPreview.ts`, som är **dev-only** (`VITE_DEV_PREVIEW`). Mätt, inte antaget:
[top-review/windowed-tso.md](top-review/windowed-tso.md) §3 och §4 skriver ut sökningen.

**Det betyder att varje siffra i §1–§3 är ett mått på mätvärdet, inte på produkten.** När S-39
skriver att en bildrutas fel byter utfall på 22 % av raderna är det 22 % av något ingen användare
ser. Det gör inte siffran mindre viktig — den är villkoret för att koppla in mätvärdet — men den
får inte läsas som en felfrekvens i appen.

**Fyra saker måste falla innan ett tal når en regel**, i ordning, och händighet är inte den
bindande (den gäller bara `top-shaft-orientation`):

1. **En konsument måste skrivas.** Det finns ingen regel att laga; det finns ingen regel.
2. **En OBSERVERAD topp.** `fromDetection.ts` skriver det själv: *"The app's own path derives
   every phase, so it passes `envelope-impact` or `envelope-fallback` — never `observed`."*
   S-30:s `top-phase-not-observed` tystar därför `shaft-position-p4`, `top-shaft-orientation`
   och `top`-hinken på **varje** sving i appen ([phase-trust.md](phase-trust.md): alla 205).
   **Det här är den bindande spärren, och den lyfts bara av en pålitlig toppkälla.**
3. **För `shaft-position-p4` dessutom kameravinkel och kroppsreferens** (`cameraAngle: 'dtl'`
   plus axlar och höfter). I appen är `cameraAngle` ofta `null`, och då blir grinden `uncertain`
   i stället för `rejected` — ett **flaggat tal** där en bedömningsrunda har tystnad.
4. **Ett band.** `shaft-position-p4` returnerar torso-längder, `top`-hinken grader. **Ingen av
   dem har en kalibrerad gräns någonstans i repot**, och ingen omgång har mätt en. Det tredje
   mätvärdet *har* band (`ON_PLANE_BAND_DEG`, `NEAR_VERTICAL_GATE_DEG`) — och §1 och §2 visar att
   båda kanterna ligger inne i mätbruset. **Att ge de två tysta ett band är alltså inte en mindre
   uppgift än den som redan är olöst för det tredje.**

**Och de två tysta är inte robustare än det tredje — de har mindre att säga.** På svar/tystnad,
den enda axel alla tre har, byter de på samma tal (2 av 100 vid kall mot varm spårare, 5 av 91
mellan spannets ändar). Hela `top-shaft-orientation`:s överskott ligger i **kategorin** (9 av 100
respektive 12 av 91), och det är kategorin en regel skulle läsa.
