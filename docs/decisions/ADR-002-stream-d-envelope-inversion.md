# ADR-002 — Ström D: envelope-inversion av pose-selektionen

- **Status:** Antagen — **cutover genomförd (D-3, 2026-08-05)**: envelope-vägen är nu
  produktionens primära frame-selektor i `frameExtractor.ts`; pixel-diff är fallback.
- **Datum:** 2026-07-14 (cutover 2026-08-05)
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

## Uppföljning: wrist-Y mot platå-medel är OANVÄNDBAR för start — hastighet är rätt signal (2026-08-02)

Diagnostik-dump på DTL-klippet (144 frames) avgjorde vad fyra gissningar inte kunde. Datan:

- Svingen börjar `t≈6.85`. Före det: **6,9 s stillastående adress** där wrist-Y **DRIFTAR**
  `0.380 → 0.425` — en drift på 0.045, **större än `ADDRESS_DEPART_TOL` (0.03)** och större
  än varje rimlig TOL.
- Bidirektionellt `|y − addressY| > TOL` fyrar på **driften** vid `t=1.60` (fel).
- Riktat `addressY − y > TOL` kräver att händerna **STIGER** 0.03 → sker först `t=7.18`,
  mitt i baksvingen (fel).
- Wrist-**SPEED** separerar rent: `spd < 0.07` hela den döda perioden, sedan en monoton
  ramp `0.06 → 0.10 → 0.15 → 0.24 → 0.39` vid frames 102–107 (`t=6.78–7.12`).

**Root cause:** wrist-Y-**position** mot ett platå-*medel* är oanvändbar som start-signal —
under en lång adress vandrar handleden (hållnings-mikrojustering, kroppssvaj, MediaPipe-
brus) mer än varje TOL som är snäv nog att fånga take-away:n. Positionströskeln mäter *var*
handleden är; men "svingen börjar" handlar om att handleden **börjar RÖRA sig**, inte om att
den nått en viss höjd. Det är en hastighets-egenskap, inte en positions-egenskap.

**Fix:** `ADDRESS_DEPART_TOL`-logiken (både riktad och bidirektionell) utgår ur start-
detektionen. Start = **hastighetsbaserad onset** (den ursprungliga logiken som gav 6.98:
första framen ≥ `speedThresh` = `ADDRESS_SPEED_FRAC × peak`) **backad bakåt frame för frame**
så länge föregående frames `speedSm` > `START_QUIET_FLOOR` (ny tunbar, 0.04) — landar på
första framen i den sammanhängande rörelse-körningen = verklig avfärd från stillhet. På detta
klipp: onset ~frame 104–105, backning till **frame 102–103 (`t≈6.78–6.85`)**. Early bias
behållen (hellre ett par frames för tidigt än in i baksvingen). `poseEnvelope.ts` enbart;
downswing/finish orört. `ADDRESS_DEPART_TOL` behålls temporärt **enbart** för TEMP-
diagnostiken (som visar båda de felande Y-villkoren); tas bort med den.

**Bonus (samma pass): impact = korsning genom `addressY`, inte max-vy.** Impact-picket satt
på snabbaste nedåtframen (`passIdx`, idx 116, `y=0.288`) — mitt i nedåtpasset, några frames
*före* att händerna når address-höjd. Handlederna korsar `addressY` (0.38) först vid idx
117–118. Impact omdefinieras till första nedåtframen där `y` korsar tillbaka genom `addressY`
(från ovan), sökt framåt från `passIdx`. `passIdx` behålls för finish-sekvenseringen.

**Detta VÄNDER en tidigare formulering av princip #2 — medvetet.** Start-fixen (0aaf8bb) sa
"bind aldrig start till en hastighetströskel; take-away ligger under tröskel och kapas".
Det var rätt *observation* (en enkel hastighetströskel fyrar för sent) men fel *slutsats*
(byt till position). Rätt slutsats: **hastighet är rätt signal, men läs onset:en och backa
till rörelsens början** i st.f. att ta tröskel-passagen rakt av. Position mot platå-medel
misslyckas av en grundläggande orsak (drift), inte en avstämbar — ingen TOL räddar den.
Se uppdaterad princip #2.

## Uppföljning: falsk impact på avklippt klipp (2026-08-05)

Ett avklippt DTL-klipp (slutar FÖRE bollträff) gav `envelope [3.53→4.27] · clipped tail ·
**impact 4.27**` — impact exakt på envelope-slutet, den klassiska "pinnas till sista
framen". Klippet innehåller ingen träff → korrekt beteende (ADR-002 princip #3, confident-
only) är `impactClusterApplied = false`, ren uniform baslinje.

**Root cause:** impact-crossing-fixen (föregående uppföljning) hade kvar en **fallback**:
`let impactIdx = passIdx;` — hittades ingen korsning tillbaka genom `addressY` föll impact
tillbaka på `passIdx` (snabbaste nedåtframen), som på ett avklippt klipp ligger vid tail:en.
Ett avklippt klipp lämnar handlederna *fortfarande på väg ned* — de korsar aldrig tillbaka
genom address-höjd — så varje impact-värde där är en **detektionsartefakt**, inte en träff.

**Fix (tre lager, alla → impact null):**
1. **Ingen fallback.** `impactIdx` startar på `-1` och sätts BARA av en faktisk korsning
   tillbaka genom `addressY` på nedåtpasset, sökt inom envelopen (`< finishIdx`). Ingen
   `passIdx`/max-vy/sista-frame-fallback.
2. **`clippedTail = true` ⇒ aldrig verifierad impact.** Är svansen avklippt fullföljdes inte
   svingen; varje nära-slutet-korsning förkastas → impact null ovillkorligt.
3. **Slut-marginal** `IMPACT_END_MARGIN_FRAMES` (2): en korsning på (eller inom marginalen
   från) envelope-slutet är en cutoff-artefakt → förkasta.

Verifierat med syntetiska banor (esbuild + node): en **full** sving (rise → korsning tillbaka
genom address → hög settle) ger `confident impact`; en **avklippt** sving (slutar mitt i
nedåtpasset, ingen korsning) ger `clippedTail=true`, `impact=null` ("clipped tail: swing ends
before the wrists cross back through address"). `poseEnvelope.ts` enbart; start/downswing/finish
orört; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda.

**Stärker princip #3:** "confident-only" måste vara verkligt confident — en impact som bara
kan *pinnas* (fallback, sista frame) är per definition inte confident och ska degradera till
uniform baslinje. En detektor får aldrig ha en tyst fallback som gör en icke-detektion till en
falsk detektion; hellre `null` (ärligt "vet inte" → baslinje) än ett artefakt-värde.

## Uppföljning: impact missar på face-on — exakt korsning för strikt (2026-08-05)

Ett **face-on**-klipp gav `envelope [3.35→4.83] · uniform baseline · no impact` ("no crossing
back through address height before envelope end"). Envelopen fångade hela svingen korrekt —
baslinjen var rätt — men impact-*polishen* uteblev.

**Root cause:** kravet på en **exakt korsning tillbaka genom `addressY`** är för strikt.
`addressY` är address-platåns medel-Y, mätt i just detta klipps kameravinkel. I face-on
återvänder handlederna **inte exakt** till den höjden vid träff (annan vinkel → annan
wrist-bana i Y än i DTL), så korsningsvillkoret (`y` går från `< addressY` till `≥ addressY`)
missar knappt trots en ren sving. Samma klass av fel som drift-buggen i start: ett *exakt*
geometriskt villkor på en brusig/vinkelberoende signal är skört.

**Fix:** exakt korsning ersätts med **nearest-approach inom tolerans**. Över nedåtpasset
`[passIdx, finishIdx)` tas framen där `y` kommer **NÄRMAST** `addressY`; är minsta avståndet
inom `IMPACT_ADDRESS_TOL` (ny tunbar, 0.05) → impact = den framen, annars ingen impact.
`IMPACT_ADDRESS_TOL` (0.05) är **snävare** än `IMPACT_HEIGHT_TOL` (0.12, som bara grindar
nedåtpasset) — närmandet måste vara genuint nära, så toleransen inte gör impact "alltid sann".

**Alla befintliga skydd oförändrade (fortsatt → `impact=null` → uniform baslinje):**
1. Nedåtpasset måste finnas (`passIdx ≥ 0`); ingen fallback till max-vy/sista frame.
2. `clippedTail = true` ⇒ aldrig verifierad impact (överrider toleransen — ett avklippt klipp
   vars svans råkar nå inom 0.05 ger ändå ingen impact).
3. Slut-marginal `IMPACT_END_MARGIN_FRAMES` (2): närmande vid envelope-slutet = artefakt.

Verifierat syntetiskt (esbuild + node), inga regressioner: **full** sving (korsar `addressY`) →
confident impact; **face-on** (närmar sig 0.03, ingen korsning) → **nu confident impact**;
**avklippt** → `impact=null`; **avklippt men närmande inom tolerans utan settle** →
`clippedTail=true`, `impact=null` (spärr 2 överrider toleransen). `poseEnvelope.ts` enbart;
start/downswing/finish orört; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda.

**Nyansering (mönster genom hela ADR:n):** exakta geometriska villkor — global min-y, exakt
tröskel-passage, exakt korsning — är genomgående för sköra på 2D-pose vid 15 fps och
varierande kameravinkel. Rätt form är nästan alltid **närmande/sekvens inom tolerans**, med
värsta-fallet (princip #3) som väljer hur strikt: här hellre en missad polish (uniform baslinje
duger) än en falsk impact, men en ren face-on-sving ska inte tappa polishen på en hårsmån.

## Cutover (D-3, 2026-08-05) — envelope blir produktionens primära selektor

Checkpoint 2 godkänd (DTL, DTL avklippt, face-on) + enhetstest gröna → envelope-vägen
görs till produktionsvägen i `frameExtractor.ts` (D-3). Detta upphäver den tidigare
regeln *"Ström D rör INTE `frameExtractor.ts`"* — pose var isolerad tills den bevisat sig;
nu är den bevisad.

**Vad ändrades:**

- **`frameExtractor.ts` — pose/envelope PRIMÄR, pixel-diff FALLBACK.** `extractFrames`
  försöker först `selectViaPose` (dynamisk `import('./poseTrajectory')` → håller
  @mediapipe ur huvudbundeln; verifierat: `poseTrajectory` byggs som egen lazy chunk,
  huvud-index-chunken oförändrad). Den kör pose, `detectSwingEnvelope`, `selectEnvelopeFrames`
  med produktionens `count` (`ANALYSIS_FRAME_COUNT`, se *Kostnadsavvägning* nedan). **Fallback (`selectViaMotion`, den orörda pixel-diff-logiken)
  körs endast när** (a) pose ej kan köra (dynamisk import / inferens-fel) **eller** (b)
  `envelope.valid === false` (låg visibilitet, ingen address-platå, ingen rörelse). Fallbacken
  är **tyst för användaren men loggad**: `log.warn('Frame selection', { path: 'pose'|'motion', … })`
  (WARN surfar även i prod) → fält-fallback-frekvens mätbar.
- **`selectEnvelopeFrames` anropas med produktionens `count`, inte dev-budgeten.**
  `ENVELOPE_FRAME_BUDGET` (dev-preview-only) borttagen — selektionen använder samma
  `count` (`ANALYSIS_FRAME_COUNT`) som skickas till Claude. Vision-anropet + `SwingRecord`-formatet **orörda**.
- **A/B-toggeln (even ↔ envelope) + "even"-vägen borttagna ur `FramePreview.tsx`.** Selektionen
  sker nu i `extractFrames` och är därmed **flagg-oberoende by construction**: `CameraView`
  kallar `extractFrames(blob, ANALYSIS_FRAME_COUNT)` oavsett `VITE_DEV_PREVIEW`; flaggan avgör bara om
  preview-skärmen visas. Dev-previewen renderar produktionens frames (store-meta) + skelett-overlay
  + en **read-only** `EnvelopeSummary` (recomputad `detectSwingEnvelope`, driver inte selektion) —
  samma envelope produktionen byggde på (eller `valid=false` → motion-fallback). `poseFrameGrab.ts`
  (dev A/B-grabbern) inte längre konsumerad.

**Verifiering (Eriks):** samma tre klipp genom NORMALA flödet (utan `VITE_DEV_PREVIEW`) ger
samma envelopes som dev-previewen — läs `[FrameExtractor] Frame selection`-WARN (`path`,
`envelopeSec`, `impactSec`) i konsolen och jämför med previewens `EnvelopeSummary`. Identiska
by construction (samma `extractFrames`). Build + lint (ändrade filer) + test rena.

## Kostnadsavvägning: frame-antal 10 → 20 (2026-08-06)

Frame-antalet som skickas till Claude Vision höjt **10 → 20**. **Motiv:** kvaliteten
verifierades i checkpoint 2 vid 20 frames; vid 10 blir samplingen glesare inom *samma*
envelope, och 8–10 frames har tidigare visat sig otillräckligt för full svinganalys
(setup → follow-through kräver flera frames per fas). **Medveten kostnadsavvägning:** ~2×
Vision-input per sving accepteras. Vision-promptens innehåll + `SwingRecord`-formatet orörda
— endast antalet.

**Implementering:** EN namngiven, exporterad konstant `ANALYSIS_FRAME_COUNT = 20`
(`frameExtractor.ts`) — enda källan. `extractFrames` defaultar till den; `CameraView.tsx`
importerar den (minimal ändring i Ström A:s konfliktzon: en import + ett argument). Inga
hårdkodade `10`:or kvar. Envelope-allokeringen skalar parametriskt: impact-klustret
`round(20 · IMPACT_CLUSTER_BUDGET_FRAC 0.4) = 8`, resten 12 uniformt över `[start, finish]`
(endpoints → address-referens + finish-täckning behållna). Verifierat via bundle-probe.

**Rapporterat (ej åtgärdat) — dedup tappar frames vid tät envelope:** vid `budget = 20`
ger en kort DTL-envelope färre än 20 *unika* frames (reproducerat: span 1.58 s, impact 7.2,
finish 8.38 → **16/20**). **Mekanism:** `selectEnvelopeFrames` lägger 12 uniforma baslinje-
frames + 8 impact-kluster-frames, sorterar och kör `dedupe` (`DEDUPE_SEC = 0.03`). I en KORT
envelope är den uniforma spacingen liten (1.58 s / 11 ≈ 0.144 s) och impact-klustret (~0.46 s
brett, spacing ≈ 0.067 s) överlappar den i tid → 3–4 baslinje-frames hamnar inom 0.03 s från en
kluster-frame och slås ihop. Loss:en skalar **omvänt med envelope-spannet**: bundle-probe gav
kort envelope (1.58 s) → 16–17/20, brett envelope (6.78 s, uniformΔ 0.616 s) → 19/20. Det är
i grunden *korrekt* beteende (nära-dubbletter till Claude undviks), men den effektiva frame-
tätheten är < 20 på korta envelopes. **Ej åtgärdat** (per instruktion). Om full 20-täthet
önskas vid korta envelopes: minska baslinjen där ett kluster läggs på (baslinje över `[start,
finish]` MINUS kluster-fönstret), inte via `DEDUPE_SEC` (den skyddar mot äkta dubbletter).

## Durabla principer (gäller bortom denna ADR)

1. **Verifiera alltid vilken kodväg som faktiskt selekterar.** Pose var *overlay-only*
   tills nyligen — `frameExtractor.ts` (pixel-diff) valde de frames som gick till
   Claude. Anta aldrig att den kod du felsöker är den som kör.
2. **Global `min-y` är opålitlig för BÅDE "top" och "finish" i golf** — baksvingstopp
   och finish är två jämförbara hand-höjd-maxima. Härled **envelopen (start→finish)
   före fasdetektion** och bind varje gräns till sving-**sekvensen** (top → downswing-
   passage → finish), aldrig till ett geometriskt extremum som har en tvilling i
   banan. Se *Uppföljning: finish-kollaps*.
   **Finish** binds till sekvensen (top → downswing-passage → settle), aldrig till
   globalt min-y. Se *Uppföljning: finish-kollaps*.
2b. **START: hastighet är rätt signal — men läs ONSET:en och backa till rörelsens
   början.** Detta korsades fram genom fyra fellösningar och en diagnostik-dump;
   slutsatsen motsäger mellansteg som står kvar i historiken ovan. Kedjan:
   - En **enkel hastighetströskel** (`speedThresh`) fyrar några frames *in* i take-away
     (den mjuka starten ligger under tröskel). Rätt observation.
   - **Fel slutsats då:** "byt till POSITION — start = wrist-Y-avfärd från platå-medel."
     Wrist-Y-position mot ett platå-medel är **fundamentalt** oanvändbar: under en lång
     adress **driftar** handleden (mikrojustering/svaj/brus) mer än varje TOL snäv nog att
     fånga take-away:n (DTL: drift 0.045 > TOL 0.03). Bidirektionellt fyrar på driften
     (`t=1.60`), riktat (kräver att händerna stiger) fyrar mitt i baksvingen (`t=7.18`).
     **Ingen TOL räddar en drift-signal** — och därför inte heller något filter ovanpå den
     (sustain/lookahead byggde alla på y). Det var därför de tre waggle-varven aldrig
     kunde funka.
   - **Rätt slutsats:** behåll hastighet, men ta inte tröskel-passagen rakt av — **backa
     bakåt frame för frame från onset:en så länge rörelsen är över `START_QUIET_FLOOR`**,
     och landa på första framen i den sammanhängande rörelse-körningen = avfärd från
     stillhet. "Svingen börjar" = handleden börjar RÖRA sig (hastighet), inte når en viss
     höjd (position). Se *Uppföljning: wrist-Y ... är oanvändbar för start*.
   Låt värsta-fallet (princip #3) välja hur gränsen dras — tidigt för start (för-sen tappar
   take-away, så backa hellre ett par frames för långt), hållet för finish.
3. **Värsta-fall > bästa-fall för heuristiker.** Designa selektionen så att
   degradering ger något användbart, inte intet. En heuristik som är fantastisk när
   den träffar men värdelös när den missar är sämre än en som alltid är hyfsad.
