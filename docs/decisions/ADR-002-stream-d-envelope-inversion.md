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

## Durabla principer (gäller bortom denna ADR)

1. **Verifiera alltid vilken kodväg som faktiskt selekterar.** Pose var *overlay-only*
   tills nyligen — `frameExtractor.ts` (pixel-diff) valde de frames som gick till
   Claude. Anta aldrig att den kod du felsöker är den som kör.
2. **Global `min-y` är opålitlig för "top" i golf** — finishen är högre. Härled
   **envelopen (start→finish) före fasdetektion**; fasgränser inuti envelopen, aldrig
   globalt över klippet.
3. **Värsta-fall > bästa-fall för heuristiker.** Designa selektionen så att
   degradering ger något användbart, inte intet. En heuristik som är fantastisk när
   den träffar men värdelös när den missar är sämre än en som alltid är hyfsad.
