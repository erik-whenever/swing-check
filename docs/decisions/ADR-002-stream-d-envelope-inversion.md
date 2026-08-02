# ADR-002 — Ström D: envelope-inversion av pose-selektionen

- **Status:** Antagen
- **Datum:** 2026-07-14
- **Ström:** D (pose-estimering)
- **Ersätter:** fas-viktad-klustring som **primär** selektionsväg (commit 0c29f47).
  Se även [ADR-0001](../adr/0001-motion-based-swing-detection.md) (pixel-diff-vägen,
  orörd).

## Kontext

Pass 2 byggde fas-viktad frame-selektion ur handledsbanorna: härled
`{address, backswing, top, impact, follow-through}` och allokera merparten av
frame-budgeten till ett tätt kluster kring **impact**. Under tre rundor av
verkliga klipp krävdes upprepad heuristik-patchning:

1. Impact-detektorn fyrade på apex → sen på klippslutet.
2. Fallbacken kastade fas-fönstren och spred uniformt över `[backswingStart, spanEnd]`.
3. Impact-gate på nedåtrörelse (`vy > 0`) + minsta downswing-tid.

Varje fix blottlade nästa lager. Mönstret — inte den enskilda buggen — var problemet.

## Problem

**Fas-viktad klustring som PRIMÄR väg är skör.** Den satsar hela budgeten på ett
*exakt* ögonblick (impact) som härleds ur en kedja av tvådimensionella
turning-point-heuristiker på 15 fps. När någon länk brister kollapsar hela
selektionen till skräp (impact-frames saknas helt), och varje patch flyttar bara
sprödheten ett steg.

## Root cause

Global `min-y`-sökning för "top" **låser på follow-through-FINISHEN, inte
baksvingstoppen**. I en fullföljd golfsving slutar händerna högt — finishen är
klippets globala vertikala apex (minsta y). Detektorn tolkade den som "top", varpå
"impact efter top" hamnade vid klippslutet.

Nyckelinsikt (inverteringen): **finishen är den mest TILLFÖRLITLIGA landmarken, inte
den minst.** Den är per definition det globala min-y i en fullföljd sving, och den
är *inramad* (händerna hålls stilla högt en stund). Att behandla den som opålitlig
var felet.

## Beslut

**Invertera prioriteten:** gör envelope-detektion + uniform-inom-svingen till
robust baslinje; lägg impact-klustring ovanpå **endast** när impact-detektionen är
confident.

- **STEG 1 — envelope `[start, finish]`** (`lib/poseEnvelope.ts`, `detectSwingEnvelope`):
  - `start` = befintlig baksving-onset (sustained wrist-motion efter address-platå).
  - `finish` = globalt min-y efter start **med settle-krav** (låg wrist-hastighet
    efter apex). Finishen är ett *hållet* platå → vi tar **tidigaste** frame inom
    `APEX_PLATEAU_TOL` av globala min-y (rå argmin driver till sista platå-framen på
    flyttalsbrus allena och begraver finishen i en död svans).
  - **Avklippt-skydd:** hittas ingen settle-finish (video slutar mitt i rörelse) →
    envelope-slut = sista frame med signifikant wrist-rörelse, inte klippslut.
- **STEG 2 — uniform-inom-envelopen** (`lib/poseEnvelopeSelection.ts`,
  `selectEnvelopeFrames`): hela budgeten uniformt i **tid** över `[start, finish]`.
  Default-utdata. Garanterar sving-täckning inklusive impact-regionen. Ingen fas-viktning.
- **STEG 3 — impact-kluster som confident-only polish:** impact = snabbaste
  **nedåtrörelse** (`vy > 0`) tillbaka nära address-höjd, sökt inom envelopen före
  finishen; top = apex före den impacten (follow-through ligger efter impact och kan
  inte förorena). Är impact confident → omfördela `IMPACT_CLUSTER_BUDGET_FRAC` av
  budgeten till ett tätt kluster kring impact, behåll address-referens + finish-täckning.
  Annars → ren uniform baslinje. `impactClusterApplied` rapporterar vilket.

> Avvikelse från förslaget: "top = lokalt min-y före finishen" gav fel top när
> follow-through stiger **högre** än baksvingstoppen (det vanliga fallet) — då sitter
> min-y-före-finish i follow-through. Impact hittas därför direkt (nedåtpass nära
> address-höjd) och top härleds som apex *före impact*. Samma anda (begränsad, ej
> global sökning), korrekt landmärke.

## Konsekvens

- **(+) Värsta fall blir "uniform över svingen" (användbart), inte "missad impact"
  (värdelöst).** Sprödheten degraderar mjukt i stället för att kollapsa.
- **(+)** Impact-klustring blir en ren förbättring ovanpå en redan-bra baslinje, inte
  en förutsättning för att utdata ska duga.
- **(−)** När impact ej är confident får man inte den täta impact-upplösningen —
  medvetet pris; D-3 mäter hur ofta det inträffar.
- Allt bakom `VITE_DEV_PREVIEW`, A/B-toggle **even ↔ envelope** (default even).
  `frameExtractor.ts` orörd. Cutover till default-vägen = D-3, gated på Eriks
  manuella checkpoint-2-verifiering.

## Uppföljning: finish-kollaps (2026-08-02)

Fältkörning på ett verkligt DTL-klipp visade en ny kollaps: envelopen krympte till
`[6.98→7.38]` (0.40 s) — **bara baksvingen** — med loggen *"no descending pass near
address height"*.

**Root cause (djupare än ADR:ns ursprungliga formulering):** globalt min-y är inte
*ett* landmärke. En fullföljd sving har **TVÅ jämförbara hand-höjd-maxima** —
baksvingstoppen och follow-through-finishen (händerna uppe vid huvudet i båda).
Regeln "tidigaste frame inom `APEX_PLATEAU_TOL` av globalt min-y + kort settle"
snappade därför finishen **bakåt i tiden** till baksvingstoppen (inom höjd-tol, kort
settle i transitionen). Det bundna impact-sökfönstret (`i < finishIdx`) blev då tomt
→ ingen nedåtpassage → hela impact-detektionen dog.

**Fix (strukturell, inte geometrisk):** finishen definieras av **sekvensen**, inte av
att vara högst. Rätt ordning: baksvingstopp → **downswing-passage** (wrists ned nära
address-höjd) → **finish** (ihållande high-settle *efter* passagen). Vi hittar därför
downswing-passagen FÖRST (över hela post-start-spannet, ej bundet av finishen), och
sätter finish = första `FINISH_MIN_HOLD_FRAMES`-långa low-settle efter passagen.
Baksvingstoppen har bara en kort transition på ett fåtal frames och rensas ut av
hold-kravet; finishen poseras och hålls. Ingen downswing-passage → avklippt-skydd som
förut. `APEX_PLATEAU_TOL`/`SETTLE_MIN_FRAMES` utgår; `FINISH_MIN_HOLD_FRAMES` införs.

**Detta STÄRKER durabel princip #2, inte motsäger den.** Principen sa "härled
envelopen (start→finish) före fasdetektion; global min-y är opålitlig för *top*".
Uppföljningen visar att global min-y är opålitlig även för *finish* — av samma skäl
(två jämförbara maxima). Slutsatsen generaliseras: **bind fasgränser till
sving-SEKVENSEN, aldrig till ett geometriskt extremum** som har en tvilling någon
annanstans i banan.

## Uppföljning: start-fyrar-för-sent (2026-08-02)

Efter finish-fixen visade samma DTL-klipp en **spegelbild-bugg i andra änden**:
envelopen började mitt i baksvingen och missade take-away (första framen hade
klubban redan lyft).

**Root cause:** `start` = "onset av ihållande wrist-rörelse" använde en
**hastighetströskel** (`speedSm[i] ≥ ADDRESS_SPEED_FRAC × peak`). Take-away är
långsam och mjuk → wrist-hastigheten ligger under tröskeln tills baksvingen
accelererar, så starten hoppade in *efter* take-away. Exakt samma klass av fel som
finish-kollapsen: en långsam svingfas ligger under en hastighetströskel och kapas.

**Fix (strukturell):** `start` = **avfärden från address-platån**, inte onset av
snabb rörelse. Vi mäter address-platåns medel-Y (`addressY`) och sätter start till
första framen efter platån vars wrist-Y avviker mer än `ADDRESS_DEPART_TOL` (0.03,
normerad y) — handlederna *lämnar* den stilla adresspositionen. Ny tunbar konstant
`ADDRESS_DEPART_TOL`; downswing/finish-logiken orörd. `// OSÄKER:` vid
platå-avvikelse-heuristiken (enframs-avvikelse på den utjämnade serien).

**Generaliserar durabel princip #2 till BÅDA ändarna:** både start OCH finish måste
bindas till svingstrukturen (address-avfärd resp. downswing→settle), aldrig till
hastighetströsklar. De långsamma svingfaserna — take-away i starten, transition vid
toppen — ligger per definition under tröskel och kapas annars. En hastighetströskel
mäter *hur snabbt* det rör sig, men svinggränserna handlar om *vad* som händer i
sekvensen.

## Uppföljning: start-fyrar-för-tidigt (waggle) (2026-08-02)

Efter start-fixen ovan visade samma DTL-klipp (envelope `[1.60→8.38]`) att starten nu
fyrade för **TIDIGT**: de första ~3 framesen var waggle/småjustering vid adress, inte
take-away. **Root cause:** `ADDRESS_DEPART_TOL` (0.03) är en **enkel tröskel-passage** —
en kortvarig pre-sving-jitter som lämnar platån ett par frames och sedan återgår
triggade start. Exakt samma klass som finish-kollapsen: en enskild geometrisk händelse
(en tröskelpassage) är tvetydig när banan har en tvilling-händelse (waggle-blip vs äkta
take-away) i närheten.

**Fix (samma min-hold-anda som finish-fixen, andra änden):** kräv att avfärden är
**IHÅLLANDE OCH RIKTAD**, inte en blip. Start = första framen i en körning av
`START_MIN_SUSTAIN_FRAMES` på varandra följande frames där handleden ligger *över*
address-platån (take-away är uppåt → mindre y) med mer än `ADDRESS_DEPART_TOL`. En blip
som återgår inom fönstret nollställer körningen → räknas inte som start. Ny tunbar
konstant `START_MIN_SUSTAIN_FRAMES` (spegel av `FINISH_MIN_HOLD_FRAMES`); riktad i
stället för settlad. `// OSÄKER:` vid sustain-längden (mycket långsam take-away kan
fördröjas ett par frames).

**Stärker durabel princip #2 ytterligare:** en svinggräns får inte bindas till en enkel
tröskel-passage som transient jitter kan uppfylla — den måste bindas till ett *ihållande,
riktat* sving-skeende. Både start (sustained+riktad address-avfärd) och finish (sustained
high-settle efter downswing-passagen) kräver nu ett min-hold för att skilja det äkta
skeendet från dess kortvariga tvilling.

## Uppföljning: start-fyrar-för-sent igen (waggle-fixen överkorrigerade) (2026-08-02)

Waggle-fixen ovan (`START_MIN_SUSTAIN_FRAMES`) **överkorrigerade**. Starten fyrar nu
ALLDELES för sent — envelope-start ligger nära **toppen** av baksvingen (verifierat på
samma DTL-klipp: första framen har händerna nästan uppe vid toppen). Sämre än
waggle-buggen den skulle laga.

**Root cause:** kravet "sustained + riktad uppåt, nollställ vid varje avbrott" är för
strikt. Take-away vid 15 fps är **inte monoton frame-för-frame** — händerna
hackar/pausar tidigt — så sustain-räknaren nollställs upprepat tills den *snabba* delen
av baksvingen, nära toppen. Samma klass av fel som hastighetströskeln (långsam fas kapas),
men nu via en monotoni-inbyggd i sustain-kravet.

**Värsta-fall styr designen (durabel princip #3):** för STARTEN är för-tidig **billig**
(några adress-frames slösas, försvinner i frame-budgeten) men för-sen **KATASTROFAL**
(hela take-away tappas). Alltså: bias:a starten **TIDIGT**. Den strikta symmetrin med
finish-fixens min-hold var fel — start och finish har olika värsta-fall (finishen tål
ett hold-krav; starten gör det inte, eftersom take-away inte är monoton).

**Fix (tolerant lookahead i st.f. strikt sustain):** `START_MIN_SUSTAIN_FRAMES` utgår;
`WAGGLE_LOOKAHEAD_FRAMES` (3) införs. Start = **första** framen som avviker från platån
i take-away-riktning (`addressY − y > ADDRESS_DEPART_TOL`), **såvida inte** handleden är
tillbaka på platå-nivå vid *slutet* av ett kort lookahead-fönster. Hack och pauser inom
fönstret tillåts — inget krav på monoton uppåtrörelse — så en långsam, hackig take-away
räknas. Bara en verklig **återgång-till-adress** (waggle-blip som är tillbaka på platån i
fönstrets slut) filtreras bort. Fönstret hålls kort så att bara en äkta waggle-retur,
inte en pausande take-away, avvisas. `poseEnvelope.ts` enbart; downswing/impact/finish
orört.

**Nyansering av durabel princip #2:** min-hold är rätt för finishen men fel för starten.
Att kräva ett *ihållande* skeende antog att skeendet är monotont; take-away är det inte.
Rätt formulering: skilj det äkta skeendet från dess kortvariga tvilling med **det
billigaste testet som räcker** — för starten är det "återvänder blippen till adress?"
(en lookahead-retur), inte "håller rörelsen i N frames?". Bind till sekvensen, men låt
värsta-fallet (princip #3) välja hur strikt gränsen dras: tidigt för start, hållet för finish.

## Uppföljning: waggle-filtret revert:as — Y-only funkar inte i DTL (2026-08-02)

Den toleranta lookaheaden ovan (`WAGGLE_LOOKAHEAD_FRAMES`) gjorde starten **katastrofalt
sen igen** — envelope `[7.18→8.38]`, första framen mitt i baksvingen. Alltså tredje
varvet av samma symptom, nu från waggle-filtrets *return-check* i st.f. sustain-räknaren.

**Root cause (djupare än föregående varv):** i DTL rör sig händerna i take-away nästan
rakt **BAKÅT**, inte uppåt. Y-ändringen är minimal och kryper knappt över
`ADDRESS_DEPART_TOL`. **Vilket som helst Y-baserat waggle-test** — sustain ELLER
lookahead-retur — läser då den långsamma, grunt-avvikande take-away:n som en
waggle-retur (handleden ser ut att vara "tillbaka på platån" i fönstrets slut, eftersom
den aldrig steg tydligt) och förkastar den. **Y-only är fel signal för take-away-start i
DTL.** Ett bättre test skulle behöva en riktnings-/avstånds-signal i planet (t.ex.
horisontell avfärd), inte bara y.

**Beslut: revert:a filtret helt.** `WAGGLE_LOOKAHEAD_FRAMES` utgår; inget waggle-filter.
Start = **första** address-avfärden (`addressY − y > ADDRESS_DEPART_TOL`), ofiltrerad.
Det ger `[1.60→8.38]` = hela svingen med ~3 tidiga adress-frames — **accepterat** (princip
#3: en tidig start slösar några billiga adress-frames; en sen tappar hela take-away).
Den early-biasade oflitrerade starten är den antagna lösningen tills vi har en signal
bättre än y. `poseEnvelope.ts` enbart; downswing/impact/finish orört.

**Sensmoral (skärper princip #2):** att skilja waggle från take-away kräver rätt
*signal*, inte bara rätt *filterform*. När den enda signalen (y) inte separerar de två
skeendena är varje filter på den signalen antingen blint eller överkorrigerande — då är
det ärligare att inte filtrera och låta värsta-fallet (princip #3) styra: bias:a starten
tidigt och acceptera några adress-frames.

## Durabla principer (gäller bortom denna ADR)

1. **Verifiera alltid vilken kodväg som faktiskt selekterar.** Pose var *overlay-only*
   tills nyligen — `frameExtractor.ts` (pixel-diff) valde de frames som gick till
   Claude. Anta aldrig att den kod du felsöker är den som kör.
2. **Global `min-y` är opålitlig för BÅDE "top" och "finish" i golf** — baksvingstopp
   och finish är två jämförbara hand-höjd-maxima. Härled **envelopen (start→finish)
   före fasdetektion** och bind varje gräns till sving-**sekvensen** (top → downswing-
   passage → finish), aldrig till ett geometriskt extremum som har en tvilling i
   banan. Se *Uppföljning: finish-kollaps*.
   **Motsvarande för hastighetströsklar:** bind aldrig en svinggräns till en
   hastighetströskel — långsamma faser (take-away i starten, transition vid toppen)
   ligger under tröskel och kapas. Start = address-avfärd, inte backsving-fart. Se
   *Uppföljning: start-fyrar-för-sent*.
   **Och: bind aldrig en gräns till en enkel tröskel-passage** — transient jitter
   (waggle) uppfyller den. Skilj det äkta skeendet från dess kortvariga tvilling —
   MEN med **det billigaste testet som räcker**, inte reflexmässigt ett min-hold.
   Ett min-hold antar att skeendet är monotont; det gäller finishen (sustained
   high-settle) men INTE take-away (hackig/pausande vid 15 fps → ett sustain-krav
   fyrar för sent, nära toppen). Se *Uppföljning: start-fyrar-för-tidigt (waggle)* +
   *start-fyrar-för-sent igen*.
   **Slutligen: ett filter är bara så bra som sin signal.** Både sustain och tolerant
   lookahead byggde på handledens **y**. I DTL rör sig take-away nästan rakt bakåt →
   y kryper knappt över tröskeln, och varje y-baserat waggle-test läser den långsamma
   take-away:n som en waggle-retur och kapar den. När signalen inte separerar de två
   skeendena: **filtrera inte** — bias:a starten tidigt (princip #3) och acceptera några
   adress-frames tills en bättre signal (riktning/avstånd i planet) finns. Start =
   **första** address-avfärden, ofiltrerad. Se *Uppföljning: waggle-filtret revert:as*.
   Låt värsta-fallet (princip #3) välja hur gränsen dras — tidigt för start
   (för-sen tappar take-away), hållet för finish.
3. **Värsta-fall > bästa-fall för heuristiker.** Designa selektionen så att
   degradering ger något användbart, inte intet. En heuristik som är fantastisk när
   den träffar men värdelös när den missar är sämre än en som alltid är hyfsad.
