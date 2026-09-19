# Var E3:s enrutasförskjutning kvantisering? (S-33, mätspik)

> 2026-09-19, `stream-shaft`. **Read-only mätspik — ingen produktionskod ändrad, ingen tröskel
> satt, ingen kalibrering applicerad.** `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG`, teckenkonventionen och S-30:s spärr är orörda.
>
> **Facit var sett när det här skrevs.** [resultat.md](resultat.md) låg färdig och lästes först,
> så risken i den här omgången är inte mätfel — den är anpassning. Därför: **exakt de tre
> varianter som beställdes, ingen fjärde**, ingen parameter svept eller justerad, och varje
> anpassad storhet anpassad **leave-one-clip-out**. *Ingen parameter justerades mot utfallet.
> Hade någon gjort det hade det stått här.*
>
> Skript: [subframe.py](subframe.py) (skriver bara till stdout). Underlaget är S-32:s runda —
> **103 svingar i 81 oberoende klipp, 6 548 envelope-bildrutor**, Erik pass 1 och Lisa bedömda
> oberoende. **Klippet är den oberoende enheten** och n står som rader *och* klipp.

## Kort svar

**Ja, delvis — ungefär hälften.** Nollgenomgången i v_y ligger i median **0,43 bildrutor** efter
den ruta E3 väljer (n=91 rader / 73 klipp). Interpolerar man fram den och avrundar till närmaste
ruta stiger träffen mot det mänskliga spannet från E3:s **30 av 91** till **42 av 91**, utan att
något anpassas. Den förskjutning som S-32 mätte till −1,0 ruta krymper till **−0,24** i subrutor.

**Men det är hälften, inte alltihop, och det är bara mitten.** Ett skift anpassat på facit (LOCO)
lyfte E3 till **53 av 91** — interpolationen tar alltså hem **12 av de 23 rader** kalibreringen
tar hem. Resten av −1-rutan är inte kvantisering.

**Spridningen står i princip kvar.** p90 går från 3,0 till 2,2–2,8 rutor och **max är oförändrat**
(26,0 → 25,1). Svansen är exakt densamma svans. Kvantiseringen satt i mitten, inte i svansen.

**Efter interpolationen finns ingen konstant förskjutning kvar att kalibrera bort:** LOCO-skiftet
blir 0 hela rundan igenom och träffen rör sig inte (42 → 42). Det är det egentliga fyndet — E3:s
konstanta fel var till ungefär hälften rutnätet, och vad som blir kvar är spritt.

**Alla tre varianterna ligger inom 3 rader av varandra** (42 / 43 / 44–45 av 91). Med n=91 skiljer
inget dem åt. **Och alla ligger långt under människorna**, som träffar varandras intervall i
67–80 %. Den bästa varianten når 49 %.

---

## 0. Reproduktion — posebanorna fanns inte kvar

S-31:s poseutdata låg i en temp-katalog som är städad, och det venv som körde MediaPipe finns
inte längre. **Banorna kördes därför om från början** med `run_pose.py`, oförändrad, mot samma
`public/models/pose_landmarker_lite.task` och **`mediapipe` 1.0.1 — samma version S-31 körde**.
(`opencv-python`/`numpy` är nyare; vilka versioner S-31 hade går inte att läsa ut i efterhand.)

Att det blev samma banor är inte antaget utan kontrollerat, på två sätt:

1. **6 548 envelope-bildrutor** i 103 svingar — samma tal som S-28, S-31 och S-32.
2. **Kontrollraden**, som skriptet skriver ut före allt annat och som måste stämma med
   [resultat.md](resultat.md) innan något nedan får läsas:

| | E3 inne | E3 median | E2 inne | E2 p90 | E2 max |
|---|---:|---:|---:|---:|---:|
| mot Erik pass 1 (n=93/94 rader) | 23 | −1 | 36 | 30 | 205 |
| mot Lisa (n=95) | 27 | −1 | 42 | 28 | 205 |
| mot spannet (n=91) | 30 | −1 | 45 | 26 | 205 |

**Varenda siffra är identisk med resultat.md.** Skriptet kontrollerar dessutom per sving att
posebanans envelope-rutor är samma rutor i samma ordning som registrets `frameTimes` (värsta
observerade avvikelse 3,3 × 10⁻⁵ s, mot ett rutsteg på 1/30 s) och stannar annars.

E1/E2/E3 plockas ur `analyze_pose.py` med samma AST-lyft som `score_round.py` använder — inte
kopierade — så S-31, S-32 och S-33 poängsätter bevisligen samma estimatorer.

---

## 1. Varianterna — och de två tolkningsval som måste stå i klartext

Alla tre sitter på **E3:s egen bracket**. E3 letar upp första `−→+`-växlingen i v_y med hysteres
0,10 och backar till sista rutan `j` där v_y ≤ 0; nollgenomgången ligger alltså i `[j, j+1]`.
Varianterna ändrar inte var bracketen hamnar — de ändrar bara **var i den** svaret läggs. Det är
med flit: så mäter de kvantiseringen och ingenting annat.

| | vad den gör |
|---|---|
| **E4** | linjär interpolation av nollgenomgången i `[j, j+1]` på **rå** (outjämnad) v_y |
| **E5** | samma nollgenomgång på **utjämnad** v_y — **E3:s eget fönster 3**, inte ett nytt |
| **E6** | E4 på en **enskild handled** i stället för mittpunkten |

**Tolkningsval 1 — E4 mot E5.** `e3_signflip` *utjämnar redan* v_y med fönster 3. En bokstavlig
läsning hade alltså gjort E4 och E5 till samma estimator. De hålls isär på det enda sätt som inte
uppfinner en ny parameter: **E4 interpolerar på den råa serien, E5 på fönster-3-serien E3
trösklar på.** Bracketen är E3:s i båda, så exakt en sak skiljer dem. Inget nytt fönster infördes.

**Tolkningsval 2 — vilken handled är E6?** **E3 läser i dag mittpunkten mellan handled 15 och 16**
(`analyze_pose.py`, `mid`), så bytet går *från* mittpunkt *till* enskild handled — inte tvärtom.
Vilken enskild handled går inte att motivera: `handedness` står `unknown` på alla 103 svingar
([STATUS.md](../STATUS.md) §4), så det finns ingen ledande handled att peka ut. **Båda redovisas
därför sida vid sida och ingen av dem väljs.** Att plocka den bättre efter att ha sett talen vore
precis den anpassning rundan ska undvika.

**Tre svarsformer redovisas för varje variant**, eftersom ett subrutesvar och ett helrutesintervall
inte har någon självklar konvention och att tyst välja den snällaste vore också anpassning:

- **SUB** — svaret i subrutor, strikt: *inne* betyder `lo ≤ p ≤ hi`.
- **RND** — samma svar avrundat till närmaste hela ruta (halvor uppåt).
- **GEN** — subrutesvaret mot `[lo−0,5, hi+0,5]`, alltså rutan som ett intervall.

**RND och GEN ger identisk träffandel överallt** — det är aritmetik, inte ett sammanträffande:
`avrundning(p) ∈ [lo, hi]` är samma påstående som `lo−0,5 ≤ p ≤ hi+0,5`. De två konventionerna
är alltså inte ett val som behöver göras. **RND är också den enda formen som är direkt jämförbar
med E3**, som alltid ligger på en hel ruta.

---

## 2. Kvantiseringen själv — var i bracketen ligger nollgenomgången?

Fraktionen är `svar − E3:s ruta`, alltså hur långt in i tvårutersbracketen nollgenomgången faller.
**0,0 betyder att E3 redan låg rätt; 0,5 att E3 är en halv ruta för tidig av rutnätet.**

| variant | n (svingar) | fraktion, median | p10 | p90 | klämd mot bracketen | utan värde |
|---|---:|---:|---:|---:|---:|---:|
| **E4** rå v_y | 101 | **0,36** | 0,00 | 0,87 | **29** | 0 |
| **E5** utjämnad v_y | 101 | **0,44** | 0,09 | 0,88 | **0** | 0 |
| **E6** handled 15 | 101 | 0,48 | 0,00 | 1,00 | **33** | 0 |
| **E6** handled 16 | 101 | 0,49 | 0,00 | 1,00 | **45** | 0 |

*(På de 91 rader som har ett mänskligt spann: E4 0,43 och E5 0,44.)*

**Medianen ligger nära en halv ruta, vilket är precis vad hypotesen förutsäger.** E3 väljer
underkanten av bracketen; nollgenomgången ligger i median mitt i den.

**Men `klämd mot bracketen` är en varning som måste läsas med.** Den räknar de svingar där den
serie varianten interpolerar på **inte byter tecken inne i E3:s bracket** — då finns ingen
nollgenomgång att interpolera och svaret faller tillbaka på en ändpunkt. För **E5 händer det
aldrig** (0 av 101), vilket följer av konstruktionen: E3:s bracket är definierad på just den
serien. För **E4 händer det i 29 av 101** och för **E6 i 33 respektive 45 av 101** — på handled 16
är alltså nästan varannan sving inget subrutesvar alls, utan E3:s ruta eller nästa. **E6:s siffror
nedan vilar därmed på en halvt degenererad estimator.**

---

## 3. Huvudmåttet — andel val inne i bedömarens intervall

Mot vardera annotatören för sig, och mot **spannet** = unionen av de två intervallen på de svingar
där båda svarade. *Inne i spannet* betyder *inne i det ingen av dem uteslöt*; ingen sammanslagen
sanning används någonstans.

### Mot det mänskliga spannet (n = 91 rader i 73 klipp)

| | inne, SUB | inne, **RND/GEN** | |
|---|---:|---:|---|
| **E3** | 30 (33 %) | **30 (33 %)** | |
| **E4** | 28 (31 %) | **42 (46 %)** | |
| **E5** | 25 (27 %) | **43 (47 %)** | |
| **E6** handled 15 | 30 (33 %) | **44 (48 %)** | |
| **E6** handled 16 | 32 (35 %) | **45 (49 %)** | |
| *människorna inbördes* | — | *67–80 %* | *(mittpunkt inne hos den andra)* |

### Mot vardera annotatören för sig

| | mot Erik pass 1 (n=93 / 75 klipp) | mot Lisa (n=95 / 75 klipp) |
|---|---|---|
| **E3** | 23 (25 %) | 27 (28 %) |
| **E4** RND | **33 (35 %)** | **40 (42 %)** |
| **E5** RND | 34 (37 %) | 40 (42 %) |
| **E6** handled 15 | 35 (38 %) | 41 (43 %) |
| **E6** handled 16 | 34 (37 %) | 44 (46 %) |

**Alla tre varianterna lyfter träffen, och de lyfter den lika mycket.** Mot spannet skiljer 3 rader
av 91 mellan den sämsta och den bästa — det är inte en skillnad man kan bygga på, och **ingen av
de tre utses till vinnare här.** Att E6 ser marginellt bäst ut ska dessutom läsas mot att den är
klämd mot bracketen på en tredjedel till hälften av svingarna (avsnitt 2).

**Jämförelsen som gör siffran läsbar:** människorna ligger inne hos varandra i 67–80 %. Den bästa
varianten når 49 % mot spannet och 46 % mot en enskild bedömare. **Kvantiseringen stänger ungefär
en tredjedel av gapet mot människorna, inte gapet.**

Rad för rad mot E3, på exakt de rader båda gav ett värde (mot spannet, n=91):

| | närmare | längre bort | oförändrat | **in i intervallet** | **ut ur det** |
|---|---:|---:|---:|---:|---:|
| E4 (RND) | 26 | 5 | 60 | **15** | 3 |
| E5 (RND) | 28 | 3 | 60 | **15** | 2 |
| E6 h15 (RND) | 26 | 6 | 59 | **16** | 2 |
| E6 h16 (RND) | 28 | 7 | 56 | **17** | 2 |

**Interpolationen rör inte 6 av 10 rader alls** (fraktionen avrundar tillbaka till E3:s ruta), och
där den rör dem vinner den 5 gånger så ofta som den förlorar. Den är inte en omkastning av E3 —
den är en halvrutas skjuts på de rader där skjutsen behövs.

---

## 4. Kvarstående förskjutning — konstant eller spridd? (LOCO)

Samma procedur som [resultat.md](resultat.md) §4 och `score_round.py`: skiftet ett klipp bedöms
med är medianen av **de andra** klippens medianer. En konstant förskjutning överlever det; ett
brus som bär en median gör det inte.

| mot spannet (n=91 / 73 klipp) | LOCO-skift | inne före → efter |
|---|---|---:|
| **E3** | **−1 ruta**, samma på alla klipp | 30 → **53** |
| **E4** RND | **0**, samma på alla klipp | 42 → **42** |
| **E5** RND | **0**, samma på alla klipp | 43 → **43** |
| **E6** h15 / h16 RND | **0**, samma på alla klipp | 44 → 44 / 45 → 45 |

**Efter interpolationen finns ingen konstant helrutesförskjutning kvar.** LOCO hittar skiftet 0 på
varje utelämnat klipp och träffen rör sig inte en enda rad. Det är den skarpaste formuleringen av
fyndet: den konstant som S-32 mätte var till stor del rutnätet självt, och den är borta nu.

**Men det är inte hela sanningen, och det som inte stämmer ska stå här.** Mot **Erik** och **Lisa**
var för sig ligger E4:s LOCO-skift precis på gränsen — klippmedianerna landar på **−0,5** (Erik)
respektive **−0,75 … −0,25** (Lisa). Mot Erik skickar Pythons `round` en −0,5 till **0** (banker's
rounding, halvor till jämnt); mot Lisa avrundas somliga klipp till −1 och andra till 0, och träffen
står ändå still (40 → 40). **Restförskjutningen är alltså inte robust noll — den är någonstans
mellan 0 och −1, precis som "halva felet var kvantisering" förutsäger.** Avrundningen är ärvd från
`score_round.py` och inte något som infördes här, men den är en myntkastning vid exakt en halv ruta
och det ska inte döljas.

På **subrutesskalan** finns en liten rest kvar som går att kalibrera: ett kontinuerligt LOCO-skift
flyttar E4 från 28 → 33 inne och |median| 0,60 → 0,43, E5 från 25 → 31 och 0,57 → 0,34. **Den är
mindre än en halv ruta och inget beslut tas på den här.**

---

## 5. Minskar spridningen?

Mot spannet, n = 91 rader i 73 klipp. Avstånd i envelope-bildrutor.

| | median | \|median\| | **p90** | **max** | MAD |
|---|---:|---:|---:|---:|---:|
| **E3** | −1,00 | 1,00 | **3,00** | **26,00** | 1,00 |
| **E4** SUB | −0,24 | 0,60 | 2,82 | 25,63 | 0,43 |
| **E4** GEN | +0,00 | 0,10 | **2,32** | **25,13** | 0,10 |
| **E5** SUB | −0,26 | 0,57 | 2,66 | 25,60 | 0,35 |
| **E5** GEN | +0,00 | 0,07 | **2,16** | **25,10** | 0,07 |
| **E6** h15 GEN | +0,00 | 0,02 | 2,12 | 25,09 | 0,02 |
| **E6** h16 GEN | +0,00 | 0,01 | 1,92 | 25,50 | 0,01 |

**Mitten krymper, svansen gör det inte.** p90 går från 3,0 till 2,1–2,8 — ungefär en halv till en
ruta — och **max går från 26,0 till 25,1, alltså exakt den halva ruta interpolationen kan flytta
ett svar.** De rader som låg 25 rutor fel ligger fortfarande 25 rutor fel. Det som var kvantisering
var hela tiden en halvruta, och en halvruta hjälper inte den som är 25 rutor ifrån.

**MAD-talen ska läsas försiktigt.** E3 mäts på ett heltalsrutnät, så dess MAD kan inte anta något
annat värde än ett helt tal; att den faller från 1,00 till 0,10 när svaret blir kontinuerligt är
till stor del att rutnätet släpper taget, inte att felet blir mindre. **p90 och max är de ärliga
spridningsmåtten här**, och de säger: en halv ruta bättre, inget mer.

---

## 6. Hur mycket av E3:s fel var kvantisering?

Två oberoende räkningar, som landar på samma svar:

1. **I bildrutor.** E3:s förskjutning mot spannet är **−1,00** ruta. Nollgenomgången ligger
   **0,43** rutor senare än den ruta E3 väljer (median, n=91). Kvar efter interpolation:
   **−0,24** rutor. **Kvantiseringen förklarar ungefär 0,4 av 1,0 ruta, alltså ~43 %.**
   *(Medianer adderas inte, så 1,00 − 0,43 ≠ 0,24 exakt — de tre talen är tre medianer, inte en
   uppställning.)*
2. **I träffar.** Ett skift anpassat på facit (LOCO) lyfter E3 från 30 till 53 av 91 — det är
   taket för vad en ren förskjutningskorrigering kan ge. Interpolationen lyfter till 42 utan att
   anpassa någonting. **12 av 23 rader, alltså ~52 %.**

**Svaret är alltså "ungefär hälften".** Den andra hälften av den konstanta enrutasförskjutningen är
inte rutnätet, och vad den *är* svarar den här mätningen inte på.

**Och spridningen var aldrig kvantisering.** S-32 skrev att förskjutningen är "en konstant *ovanpå*
en spridning, inte i stället för den". Det står sig: konstanten var till hälften rutnätet,
spridningen är orörd.

---

## 7. E2:s svans — en igenkännbar klass, eller utspridd?

**Diagnos, ingen ny estimator.** E2 låg inne i 45 av 91 men med p90 26–30 rutor och max 205.
Svansen definieras som `|avstånd| ≥ p90 av |avstånd| = 26 rutor` — en **kvantil av utfallet**,
inte en vald gräns, och den flyttas inte. **Svansen är 10 rader i 9 klipp.**

### Den är en klass, och den är skarpt avgränsad

**Alla 10 ligger *efter* spannet. Inte en enda tidig vändning.**

| id | klipp | avstånd | tiondel | slow-mo | vy | nedslag | steg bakåt |
|---|---|---:|---:|:-:|---|:-:|---:|
| S32-092 | 005.mp4 | +205 | 8 | **ja** | dtl | ja | 10 |
| S32-078 | 095.mp4 | +112 | 9 | **ja** | dtl | nej | 3 |
| S32-103 | 089.mp4 | +82 | 8 | **ja** | dtl | ja | 3 |
| S32-085 | 036.mp4 | +58 | 8 | **ja** | face_on | ja | 4 |
| S32-062 | 095.mp4 | +56 | 8 | **ja** | dtl | nej | 6 |
| S32-010 | 056.mp4 | +52 | 8 | – | dtl | ja | 4 |
| S32-037 | 083.mp4 | +46 | 8 | – | dtl | ja | 4 |
| S32-041 | 040.mp4 | +36 | 6 | **ja** | dtl | ja | 3 |
| S32-013 | 057.mp4 | +28 | 8 | – | dtl | nej | 4 |
| S32-055 | 022.mp4 | +26 | 5 | – | dtl | ja | 6 |

**7 av 10 landar i envelopens åttonde tiondel**, mot resten som samlas i tiondel 3–5. **6 av 10 är
slow-mo — mot 5 av 81 (6 %) i resten.** Ett klipp (`095.mp4`) bidrar med två av raderna.

### Felet sitter i ankaret, inte i sökningen

E2 går **bakåt** från envelopens snabbaste bildruta till första lokala minimum. Den konstruktionen
har två delar, och bara den ena är trasig:

| | steg bakåt (median) | **den snabbaste rutans tiondel** | **snabbaste rutan, rutor efter spannets slut** |
|---|---:|---|---:|
| **svans** (n=10) | 4 (p90 10) | **6:2  8:2  9:6** | **median +59** (p90 +215) |
| **resten** (n=81) | 5 (p90 9) | 3:2 4:11 5:28 6:26 7:11 8:3 | median +5 (p90 +13) |

**Bakåtgåendet är lika långt i svansen som i resten** — 4 steg mot 5. **Det som skiljer är var den
börjar.** I resten ligger envelopens snabbaste bildruta i tiondel 4–6, ~5 rutor efter det
mänskliga spannet — det vill säga i nedsvingen, precis som E2 antar. I svansen ligger den i
tiondel 8–9 och i median **59 bildrutor** efter spannet.

**E2:s svans är alltså inte ett gafsel i sökningen utan ett brutet antagande:** "den snabbaste
bildrutan i envelopen är nedsvingen" håller inte i de här klippen, och när ankaret ligger i
genomsvinget landar första lokala minimum bakåt därifrån där också.

**Det är däremot inte samma sak som "val i finishen" i nedslagets mening.** Av de 10 ligger bara
**3 efter det detekterade nedslaget** (S32-010, S32-041, S32-055); 4 ligger före det och 3 har
inget säkert nedslag alls. Valet ligger sent **i envelopen**, inte nödvändigtvis efter bollen.

**n = 10 rader i 9 klipp.** Att slow-mo dominerar (6 av 10 mot 6 % i resten) är den starkaste
signalen i tabellen, men det är sex svingar. **Ingen ny estimator föreslås och ingen regel sätts.**

---

## 8. De åtta kontroller som båda missade — facit eller svingen?

Detta sätter taket för hela rundan: ingen estimator kan mätas förbi den punkt där facit självt
inte är vad två oberoende par ögon ser.

**I alla åtta är de två bedömarna eniga med varandra.** Intervallen överlappar i 8 av 8, och båda
pekar på **samma andra exportruta**, åt samma håll. **Oenigheten går alltså mellan människoparet
och CVAT-facit — inte mellan människorna.** Det är inte vad "tvetydig sving" betyder.

| kontroll | klipp | facit (exportruta) | Erik | Lisa | båda pekar på | mittpunkt från facit |
|---|---|---|---|---|---|---:|
| S32-091 | 063.mp4 | f02 @ 6,455 s | rutor 16–17 (6,367–6,400) | 16–17 | exportruta **1** | **−2** videorutor |
| S32-018 | 089.mp4 | f03 @ 13,863 s | 18–19 (13,733–13,767) | 18–19 | **2** | **−3** |
| S32-047 | 015.mp4 | f02 @ 1,741 s | 28–29 (1,900–1,933) | 28–29 | **3** | **+5** |
| S32-023 | 073.mp4 *(slow-mo)* | f05 @ 10,646 s | 82–85 (10,433–10,533) | 78–85 | **4** (Lisa 3–4) | −5 / −7 |
| S32-042 | 032.mp4 | f02 @ 4,915 s | 30–31 (5,100–5,133) | 31 | **3** | +6 / +7 |
| S32-041 | 040.mp4 *(slow-mo)* | f03 @ 5,702 s | 41–43 (5,300–5,367) | 43 | **2** | −11 / −10 |
| S32-031 | 062.mp4 *(slow-mo)* | f02 @ 3,719 s | 65–70 (3,267–3,433) | 67 | **1** | −11 / −12 |
| **S32-084** | **054.mp4** | f02 @ 4,282 s | 17–18 (3,067–3,100) | 17–18 | **0** | **−36** |

### Sju av åtta ser ut som ett för grovt rutnät

**I sju av de åtta motsäger bedömarna bara facitrutan själv** — ingen *annan* CVAT-etikett i samma
sving säger emot dem. Och exportrutnätet är grovt: stegen mellan exportrutor går från 1 till 54
videorutor, och runt facitrutan ligger de på 2–17 rutor. Tre av de sju (063, 089, 073) är
**2–7 videorutor** från facit, alltså en nästan-oavgjord fråga som kontrollen avgör till facits
fördel bara för att rutnätet är glest. **Där är det rimligaste att facit ligger en exportruta fel,
inte att svingen är tvetydig** — men ingen kontroll märks om här, och ingen har öppnat klippen.

Två av dem (040 och 062, båda slow-mo) ligger 10–12 videorutor fel. Det är mer än ett
avrundningsfel på rutnätet, men fortfarande en enda exportruta, och slow-mo är just där det
mänskliga spannet är bredast (resultat.md §2: union median 3, max 12).

### Den åttonde är något annat

**S32-084 (`054.mp4`) är inte samma sorts miss.** Båda bedömarna sätter toppen vid **3,07–3,10 s**,
medan facit ligger på **4,282 s** — **36 videorutor, 1,2 sekunder** isär, och två exportrutor bort.
Och här motsäger de **en andra, oberoende CVAT-etikett**: exportruta f00 vid **3,33 s är märkt
`backswing`**, alltså *efter* det intervall båda bedömarna satte. **De två placerar toppen före en
bildruta som CVAT säger fortfarande är baksving.** Klippet bidrar dessutom med två svingar till
rundan.

**Det är den enda av de åtta som ser ut som ett genuint annat ögonblick** — två personer som läser
en annan händelse i samma envelope, inte en ruta fel på ett glest rutnät. Vad det beror på
(inövningssving, två svingar i samma envelope, en felplacerad envelopegräns) **är inte utrett här:
ingen har tittat på klippet.**

### Vad det sätter för tak

**Åtta av 45 kontroller, alltså 18 %, är svingar där facit inte är det två oberoende ögon ser.**
Sju av dem ser ut som rutnätets grovhet; en ser ut som fel händelse. Det betyder att
kontrollavsnittet i [resultat.md](resultat.md) §1 — "Lisa 36 rätt, Erik 31" — har ett tak som
ligger under 45, och att omgångens egentliga felmått på bedömarna är mindre än det ser ut.
**Det ändrar inget i avsnitt 2–6 ovan**, som mäter mot bedömarnas intervall och inte mot
kontrollfacit. **Ingen kontroll märks om, och ingen siffra i resultat.md räknas om här.**

---

## Vad som INTE mättes

- **Ingen tröskel, ingen kalibrering applicerad, inget skift infört, ingen produktionskod läst
  eller skriven.** Vad som är nära nog är fortfarande ett beslut för en annan dag, och S-30:s
  spärr ligger kvar.
- **Ingen fjärde variant.** E4, E5 och E6 är de som beställdes. Ingen parameter sveptes, och
  ingen justerades efter att ett tal var sett.
- **Vilken enskild handled E6 "borde" vara.** Båda redovisas, ingen väljs. `handedness` är
  `unknown` på alla 103 svingar, så det finns inget att välja på.
- **E6 på en serie som faktiskt byter tecken.** Handled 15 är klämd mot bracketen på 33 av 101
  svingar och handled 16 på 45 av 101 — E6:s tal vilar delvis på en estimator som inte har någon
  nollgenomgång att interpolera.
- **Varför den andra halvan av E3:s förskjutning finns.** Mätt att den finns, inte vad den är.
- **Svansen.** Varken E3:s eller E2:s svans rörs av något här. E3:s max står kvar på 25–26 rutor.
- **Om E2:s trasiga ankare går att laga.** Diagnosen pekar på "envelopens snabbaste ruta är inte
  alltid nedsvingen"; ingen ersättare prövas, och det vore en ny estimator.
- **De åtta kontrollerna, på bild.** Diagnosen står helt på registret och svarsfilerna. **Ingen
  har öppnat ett enda av de åtta klippen.** Att `054.mp4` ser ut som en annan händelse är en
  slutsats av etiketter, inte av att någon sett svingen.
- **Fler än två par ögon.** Samma begränsning som S-32: ett annotatörspar, ett upprepat pass av
  den ena. Erik pass 2 används inte alls här.
- **Face-on, spegelvändning, eget material, fps.** Oförändrat sedan S-32: 102 av 103 svingar är
  `web`, all fps är 30, face-on är 10 svingar i 9 klipp, bekräftad spegelvändning är 2 svingar i
  ett klipp. Inget av det är uppdelat på nytt här.
- **Paritet mot webbkedjan.** Samma fem avvikelser som [top-from-pose.md](../top-from-pose.md)
  listar (runtime-version, CPU-delegat, 30 fps mot produktionens 15, startpunkt, avkodare) gäller
  oförändrat. Att `opencv`/`numpy` nu är nyare än S-31:s är en sjätte, oprövad — kontrollraden i
  avsnitt 0 är allt som talar för att den inte spelar roll.

## Kör om

Kräver ett venv med `mediapipe` (kört på 1.0.1) och `opencv-python`, samt
`public/models/pose_landmarker_lite.task` (`npm run pose:model`). Från repo-roten:

```sh
# 1. manifesten ur exportzip:arna (posebanorna behover dem)
python docs/shaft/top-from-pose/rows_from_review.py <tmp>/export_manifests.json <tmp>/review_rows.json

# 2. handledsbanorna, ~8 min for 103 svingar (lokalt, kostnadsfritt, inget API)
<venv>/Scripts/python.exe docs/shaft/top-from-pose/run_pose.py <tmp>/pose \
    --manifests <tmp>/export_manifests.json

# 3. den har matningen (--section: e456 | tail | controls | all)
python docs/shaft/top-review/subframe.py <tmp>/pose --section all
```

`subframe.py` skriver bara till stdout. Den importerar [score_round.py](score_round.py) och
återanvänder dess `interval`, `point_to_interval`, `by_clip`, `control_outcome` och
estimatorlyftet — ingenting är återimplementerat, så S-32 och S-33 mäter bevisligen mot samma
svar med samma konventioner. **Läs kontrollraden överst i utdatan först:** stämmer den inte med
[resultat.md](resultat.md) har posebanorna drivit och inget nedan gäller.
