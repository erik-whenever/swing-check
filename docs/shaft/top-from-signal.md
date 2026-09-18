# Bär skaftsignalen en observerad topp? (S-27, spike)

> 2026-09-18, `stream-shaft`. **Spike — ingen produktionskod ändrad, ingen fix byggd.**
> Premiss från S-23: `top` ska komma ur skaftdetektorns egen signal, inte ur en andel av
> envelopen. Innan `derivePhase` skrivs om ska det avgöras om signalen bär informationen.
> **Hypotes:** toppen är vändpunkten i skaftets vinkelbana — där vinkelhastigheten byter
> tecken mellan backswing och downswing.

## Svaret

**Nej — på envelope-bildrutorna bär skaftsignalen ingen observerad topp.** Bara 66 av 205
svingar ger en sammanhängande bana, och av dem ger metoden **noll** kandidater i 31 (47 %).
Rutorna ligger för glest: 44 % av stegen mellan intilliggande rutor är över 90°, så
vinkelhastighetens tecken går inte att läsa där, och runt toppen står skaftet på en platå där
stegen är lika stora som detektorns brus — vändpunkten flyttar sig med vilotröskeln. Mot Eriks
bedömningar träffar metoden exakt bildruta **2 av 5** gånger (**n för litet**), och på de 22
kandidaterna har den en åsikt om bara 4. Om en tät signal (varje videobildruta) bär toppen är
**inte** prövat här.

## Underlaget

Skaftsignalen fanns inte som bana i repot. `prelabel.xml` täcker bara träningsbatcharnas
bildrutor, och batcharna har **1–2 bildrutor per sving** (batch-02: 160 svingar med 1, 45 med 2;
batch-03: 158 med 1, 46 med 2) — det är stickprov, inte en bana. Därför kördes den skeppade
detektorn på **alla 1 435 envelope-bildrutor** i `data/shaft/exports/` (205 svingar × 7 rutor —
samma rutor som fasetiketten och granskningens `före`/`efter` sitter på):

- modell `public/models/shaft-v2.onnx` (`MODEL_FILE` i `shaftDetector.ts`), imgsz 960, CPU;
- produktionens trösklar: box-konfidens ≥ 0,25 (`CONF_THRESHOLD`), `butt`/`hosel` ≥ 0,5
  (`KEYPOINT_THRESHOLD`), och `MIN_SHAFT_FRACTION` 0,01 H mot kollapsade skaft;
- förbehandling och avkodning är `prelabel_batch.py`:s egna funktioner, importerade — inte
  omskrivna;
- vinkeln är produktionens `angleDeg(butt, hosel)` (riktad, (−180°, 180°]) och stegen
  `signedAngleDifference`, ur `src/lib/shaft/measure/angles.ts`.

Lokal körning, ingen kostnad. Koordinaterna skrivs till en temp-katalog, aldrig till repot.

Kör om, från repo-roten:

```sh
training/.venv/Scripts/python.exe docs/shaft/top-from-signal/run_detector.py <tmp>/out
node_modules/.bin/esbuild docs/shaft/top-from-signal/analyze.ts --bundle --platform=node --format=esm --outfile=<tmp>/analyze.mjs
node <tmp>/analyze.mjs <tmp> 5 90 strict   # ε=5°, stegtak 90°, strikt bana
node <tmp>/analyze.mjs <tmp> 5 90 relax    # luckor tillåtna (känslighetskontroll)
```

## 1. Vilka svingar har en sammanhängande bana

**Sammanhängande** = varje envelope-bildruta i svingen (≥ 5, i praktiken alltid 7) har en
detektion som klarar produktionens trösklar. En lucka var som helst diskvalificerar: en saknad
ruta mitt i svingen är just där vändpunkten kan ligga, och att interpolera över den vore att
rita den kurva hypotesen ska pröva.

| | Svingar |
|---|---:|
| Alla svingar i exporterna | 205 |
| **Sammanhängande bana** | **66 (32 %)** |
| Bortfall: 1 bildruta utan godkänd detektion | 52 |
| Bortfall: ≥ 2 bildrutor utan godkänd detektion | 87 |
| Bortfall: färre än 5 bildrutor | 0 (alla 205 har 7) |

Skälen per bildruta, över alla 1 435: **271 ingen detektion**, 81 keypoint under tröskeln,
2 degenererat skaft — 354 rutor (25 %). Luckorna ligger mest **inne i** svingen (251), inte
i ändarna (32 första, 71 sista), så att kapa ändarna hade inte räddat många.

Per vy: **alla 66 är `dtl`** (66 av 179 `dtl`-svingar); **0 av 24 `face_on`** har en hel bana.
Per `impactSec`: 55 av 165 med, **11 av 40 utan**.

## 2. Kandidattopp per sving

**Metod, i en mening:** kandidaten är bildrutan där tecknet på vinkelsteget till nästa ruta
vänder, eftersom det är den direkta läsningen av "vinkelhastigheten passerar noll" och den
enda som inte antar någon svingform. Två regler som underlaget tvingade fram, båda synliga i
utdatan:

- **Steg över 90° har inget läsbart tecken** och bryter kedjan. Första körningen utan den
  regeln gav kandidater på nästan varje sving — av skräp: **64 av 66** banor har minst ett
  steg över 90° (address → sen baksving och topp → impact vrider typiskt 150–180° mellan två
  envelope-rutor), och "kortaste vägen" väljer då tecken på måfå.
- **Steg under ε = 5° är vila** och bär föregående tecken. Stillastående rutor darrar 1–3°
  (rad 18 i granskningen: stegen 6, 1, −1, 0, 1 på rutor Erik kallar "så gott som
  identiska"), och utan golv blir brus till vändpunkter.

Utfall på de 66 banorna:

| Kandidater | ε = 2° | **ε = 5°** | ε = 10° |
|---|---:|---:|---:|
| 0 | 21 | **31 (47 %)** | 41 |
| 1 | 41 | **31 (47 %)** | 24 |
| 2 eller fler | 4 | **4 (6 %)** | 1 |

**Noll-fallen är huvudfyndet, inte en rest.** Stegfördelningen över de 66 banorna (396 steg):
**174 (44 %) över 90°**, 68 mellan 20° och 90°, 88 mellan 5° och 20°, **66 (17 %) under 5°**.
Rörelsen genom en sving sker alltså i två-tre jättekliv mellan envelope-rutor, och runt toppen
står skaftet på en **platå** av rutor inom några grader från varandra (rad 2: −129, −113, −114,
−114, −113; rad 22: −127, −119, −117, −120, −123). Där passerar vinkelhastigheten noll — men
det gör den över tre-fyra rutor samtidigt, och vilken ruta vändningen tillskrivs avgörs av
bruset och av ε, inte av svingen. Tabellen visar det: 10 av 66 svingar byter mellan "en" och
"ingen" kandidat när ε går från 2° till 5° (nettot; det faktiska antalet byten är minst det).

**Flera kandidater (4)** är antingen två vändningar på platån (rad 23: f02 och f03) eller
detektorbrus i finishen (se rad 11 nedan).

## 3. Validering mot de 32 bedömda raderna

Av de 32 raderna i [phase-audit/review.md](phase-audit/review.md) ligger **10** i en sving med
sammanhängande bana. Övriga 22 är bortfall — 16 av de 22 kandidaterna och 6 av de 10
kontrollerna. `rel` är metodens kandidat minus den bedömda rutan (`+1` = metoden säger att
toppen är en ruta senare).

| # | rad | Eriks bedömning | metodens kandidat (ε = 5°) | stämmer? |
|---:|---|---|---|---|
| 2 | kandidat | `osäker` (utan motivering) | **noll** | går inte att bedöma |
| 3 | kontroll | `downswing` | **noll** | — rutan är inte toppen, men svingens topp hittas inte heller |
| 6 | kandidat | `backswing` — "efter-bilden är absoluta toppen" | f02, `+1` | **ja, exakt** |
| 8 | kandidat | `osäker` — bilden och nästa visar båda toppen | **noll** | — |
| 9 | kontroll | `top` | **noll** | **nej** — missad topp |
| 11 | kontroll | `finish` — "alla bilder är i finish" | f05, `−1` | **nej** — svingen har ingen topp; kandidaten är brus (vinklarna 47, −99, 49, −116, 39, 54, 42) |
| 14 | kandidat | `top` | f03, `+1` | **nej** |
| 23 | kandidat | `backswing★` (nästa ruta är toppen) | f02 `=` och f03 `+1` (flera) | första kandidaten **nej**; den andra stämmer |
| 24 | kandidat | `top` | f02, `=` | **ja** — men `+1` vid ε = 2° |
| 25 | kontroll | `downswing` | f01, `−3` | riktningen förenlig; f01 är inte bedömd |

Jämförelserna, med n:

- **Exakt bildruta**, där Erik pekat ut toppen (rad 6, 9, 14, 23, 24): **2 träff av 5**.
  **n för litet.** Och av de två träffarna försvinner rad 6 vid ε = 10° och rad 24 flyttar
  sig vid ε = 2° — ingen av dem håller över tröskelvalet.
- **Kontroller med annoterad `top`** (4 i rundan): 1 har bana (rad 9), och där ger metoden
  noll. **n = 1, n för litet.**
- **Noll kandidater** på bedömda rader: 4 av 10 (rad 2, 3, 8, 9).
- **Stjärnraderna** (★, "nästa ruta är toppen"): 1 av 6 har bana (rad 23), och där ger metoden
  två kandidater varav den första är manifestets. **n = 1, n för litet.**

Ingenting här extrapoleras till de 56 banor som inte är bedömda.

## 4. Mot nuvarande etikett, på de 22 kandidaterna

| | Strikt bana (primär) | Luckor tillåtna (känslighet) |
|---|---:|---:|
| Kandidater med en åsikt från metoden | **4** (rad 6, 14, 23, 24) | 9 |
| — pekar på **annan** ruta än manifestet | **2** | 6 |
| — varav **åt Eriks håll** | **1** (rad 6) | 2 (rad 6, 10) |
| — varav **mot Eriks bedömning** | **1** (rad 14: Erik säger att manifestet har rätt) | 4 (rad 7, 14, 26, 28) |
| — pekar på **samma** ruta som manifestet | 2 (rad 23: Erik säger fel; rad 24: Erik säger rätt) | 3 (rad 23 fel; 24, 30 rätt) |
| Noll kandidater | 2 (rad 2, 8) | 13 |
| Bortfall (lucka i banan) | 16 | 0 |

**n för litet** i båda kolumnerna. En sak syns ändå och står här som observation, inte som
fynd: i den lösa varianten flyttar metoden **alltid en ruta senare** när den avviker (6 av 6),
också på rad 7 och 26 där Erik säger att etiketten redan ligger för sent (`finish`). Det är
vad en platå med brus ger — inte en läsning av svingen.

## 5. Kräver metoden nedslag (`impactSec`)?

**Nej, inte som indata.** Metoden läser bara detektionerna och bildrutornas ordning;
`impactSec` används inte någonstans i `analyze.ts`.

**Men den är inte visad att lösa halvan utan `impactSec`, och det ska stå utskrivet.** Två
skäl:

- **Rutnätet den läser på beror på `impactSec`.** Med nedslag lägger `selectEnvelopeFrames`
  rutorna efter fasmål kring pose-kedjans `topSec`; utan faller den tillbaka på ett jämnt
  rutnät. Metoden ärver alltså den upplösning nedslaget ger eller inte ger.
- **På fallback-raderna finns inget underlag.** Av de 5 kandidaterna utan `impactSec` (rad 1,
  12, 15, 19, 26 — de 5 av 5 som var fel) har **ingen** en sammanhängande bana. I den lösa
  varianten ger metoden en åsikt om en (rad 26), och den går `+1` — åt fel håll, eftersom Erik
  säger att rutan redan är efter toppen. Över hela datamängden: 11 banor utan `impactSec`,
  varav 6 noll, 5 en kandidat — obedömda.

Metoden kräver alltså inte nedslag, men den löser inte heller den mindre halvan — den är inte
visad att lösa någon av dem.

## Vad som inte är prövat

- **En tät signal.** `training/trace_swing.py` kör detektorn på varje videobildruta (steg
  ~0,033 s i stället för 0,2–0,7 s). Där borde toppen synas som en rörelse snarare än en platå,
  men det är en annan fråga: den kräver källklippet (11 av 22 kandidater saknar klipp i repot)
  och en detektorkörning per videobildruta, och den är inte vad fasetiketten sitter på i dag.
- **Klubbhuvudet.** Eriks stjärnrader läser toppen på att klubbhuvudet "hänger mer" i nästa
  ruta. Den skeppade modellen har två punkter och ingen åsikt om klubbhuvudet.
- **`face_on`.** Ingen av 24 `face_on`-svingar har en hel bana; ingen `face_on`-ruta är bedömd.

## Slutsats

Skaftsignalen på envelope-rutorna bär ingen observerad topp: två tredjedelar av svingarna har
ingen hel bana, och av resten ger vändpunktsmetoden noll kandidater i nästan hälften. Toppen
ligger på en platå där stegen är lika små som detektorns brus, så den ruta metoden väljer
bestäms av vilotröskeln och inte av svingen. Mot Eriks bedömningar träffar den 2 av 5 — n för
litet, och ingen av träffarna överlever ett ändrat tröskelval. Den kräver inte `impactSec`, men
den är inte visad att fungera varken med eller utan. En omskrivning av `derivePhase` mot den
här signalen har alltså inget att stå på; om en tät signal gör det är en egen, oprövad fråga.
