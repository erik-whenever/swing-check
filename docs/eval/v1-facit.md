# V-1 — Facit för domkvalitet

> 2026-10-25, `dirigent/V-1` (från `stream-native`). **Förberedelse: inga Claude-anrop är gjorda.**
> Verktyg: [`scripts/eval/`](../../scripts/eval/). Rådata (gitignorerat, lokalt): `data/eval/v1/`.
> Committas: `docs/eval/v1/manifest.json` (urvalet, sha256) och `docs/eval/v1/facit.csv` (Eriks domar).

## Syfte

Ett fryst facit som modell-, prompt- och regelval mäts mot (V-2, F-1), och som avgör om skaftmått
behövs i domarna (N-3.5). Därför innehåller regeluppsättningen avsiktligt många skaftberoende regler.

## Metod

| del | val |
|---|---|
| material | 30–50 svingar ur befintliga klipp, DTL och face-on, olika spelare och nivåer |
| bildrutor | produktionens sessionsväg (`extract`, samma kedja som S-45 steg 3): pose → `detectSessionSwings` → `selectEnvelopeFrames` med reglernas faser → E-2-beskärning → `grabFramesAtTimes` 0,8 |
| frysning | manifest med id, vinkel, spelare (pseudonym), nivå och sha256 per bildruta (över JPEG-bytes) + `rulesHash` över reglernas text |
| regler | hela regelbiblioteket (14, `r-<libraryId>`) + 9 skaftberoende (`v1-shaft-…`), filtrerade per vinkel: **DTL 13, face-on 12** |
| facit | per sving × regel `pass`/`fail`/`cannot_determine`, satt av Erik **före** första körningen och committat — då är det blint mot modellens svar |
| anrop | appens egen `analyzeSwing` (SYSTEM_PROMPT, `buildSwingPrompt`, cache, `max_tokens`, parsning), quick-läge (appens standard), `claude-sonnet-4-5`; bara transporten byts, som i S-48 |
| körning | 3 per sving, samma modell, prompt och bildrutor; körning 1 för alla svingar först |
| märkning | `metadata.user_id = "v1-eval-<tag>-<sving>-k<n>"`; varje anrop loggas i `calls.jsonl` **före** sändning |

### Skaftreglerna

Inte produktregler. De ska visa var Vision brister när domen hänger på skaftets vinkel.
Vinkeluppdelningen följer `MEASUREMENT_ASSUMPTIONS` i core: plan och across/laid-off bara DTL,
lutning mot målet bara face-on.

| id | vinkel | fas | vad |
|---|---|---|---|
| `v1-shaft-plane-address` | DTL | address | skaftlinjen pekar mot/strax under bältet |
| `v1-shaft-takeaway-parallel` | DTL | backswing | P2: skaftet parallellt med mållinjen |
| `v1-shaft-butt-points-line` | DTL | backswing | vänsterarm parallell: skaftänden pekar på mållinjen |
| `v1-shaft-top-not-across-laid-off` | DTL | top | toppen: varken across the line eller laid off |
| `v1-shaft-downswing-shallow` | DTL | downswing | skaftet flatare (inte brantare) i nedsvingen än i uppsvingen |
| `v1-shaft-impact-returns-to-address` | DTL | impact | skaftvinkeln vid impact ≈ vid adress |
| `v1-shaft-lean-address` | face-on | address | skaftet lodrätt eller lätt mot målet |
| `v1-shaft-top-not-past-parallel` | face-on | top | toppen: inte förbi parallellt |
| `v1-shaft-lean-impact` | face-on | impact | impact: skaftet lutar mot målet |

Två medvetna överlapp med biblioteket, så att facit kan jämföra en vag och en skaftexplicit formulering
av samma sak: `lib-club-alignment-top` ↔ `v1-shaft-top-not-across-laid-off`, och `lib-forward-shaft-lean`
↔ `v1-shaft-lean-impact`. Notera: `lib-forward-shaft-lean` är taggad **DTL** i biblioteket, men "händerna
före bollen" syns bäst face-on. Facit visar om taggningen ska ändras (F-1).

### Mätvärden (låsta i `v1-score.ts`, testade i `v1-score.test.ts`)

- **Träffsäkerhet** per regel och totalt = rätt / avgjorda. *Avgjord* = facit pass/fail och modellen pass/fail.
- **`cannot_determine` separat:** facit-cd (räknas inte, inget rätt svar finns) och modell-cd där facit har en dom
  (inklusive regler modellen utelämnade, som `api.ts` fyller i som cd).
- **Självsäkra fel** = fel dom med `confidence` ≥ 0,8, per regel.
- **Konsistens** = andel sving × regel med samma dom i alla 3 körningar (cd räknas som dom), bland par där alla tre lyckades.
- **Kostnad** per analys ur input/output/cachade tokens och prislistan (parameter, så V-2 kan prissätta om samma rådata).
- **Tid** = vägg-tid för `analyzeSwing` i sidan, median och p95 (närmaste rang).
- Misslyckade anrop (t.ex. klippta) är betalda: kostnaden räknas, inga domar, paret blir ofullständigt.

## Spärrar

- `run` är **dry-run** utan `--approved-budget=<USD>`, och **vägrar** om beloppet är lägre än uppskattningens övre gräns.
- Under körningen: stopp före ett anrop som kunde ta faktisk kostnad över det godkända, och vid taket svingar × 3 anrop
  (räknat ur `calls.jsonl`, även över avbrutna körningar). Ett planerat anrop får göra exakt en POST. Inget automatiskt återförsök.
- Live-körningen kräver att manifestet verifieras mot bildrutorna, att reglerna är oförändrade (`rulesHash`), att facit är
  komplett och att `manifest.json` och `facit.csv` är **committade och orörda** (förregistreringen). Commit-sha och sha256
  för båda skrivs i `runs/<tag>/meta.json`.

## Så kör Erik (lokalt)

Allt utom steg 7 är gratis. Kräver `npm run dev -- --port 5199 --strictPort` i en annan terminal och Chromium för puppeteer
(`npx puppeteer browsers install chrome`).

1. `node scripts/eval/v1.ts extract <klippmapp> dtl` och `… <klippmapp> face-on` — en mapp per vinkel. Skriver
   `data/eval/v1/frames/<klipp>-sNN.json` för varje upptäckt sving. **Kör först en klippmapp med ett klipp och jämför
   bildrutorna med appens** (extraheringen är inte körd i agentmiljön).
2. `node scripts/eval/v1.ts selection-template` → `data/eval/v1/selection.json`. Stryk till 30–50 svingar (ungefär hälften
   per vinkel, flera spelare och nivåer), fyll i `player` (pseudonym, t.ex. `S01`), `level` och `handedness`.
   Undvik P45-001/003/006/010/013/035: deras Vision-domar står i S-48:s README, så facit för dem är inte blint.
3. `node scripts/eval/v1.ts freeze` → `docs/eval/v1/manifest.json` (skrivs aldrig över).
4. `node scripts/eval/v1.ts facit-template` → `docs/eval/v1/facit.csv` (semikolon, öppnas direkt i Excel).
5. Fyll i `verdict` per rad (`pass`/`fail`/`cannot_determine`) ur bildrutorna, utan att ha sett något modellsvar.
   `node scripts/eval/v1.ts facit-check --allow-empty` visar hur långt du kommit; utan flaggan ska den vara grön.
6. Committa `manifest.json` och `facit.csv` i **en** commit (förregistreringen).
7. Efter godkänd budget: `node scripts/eval/v1.ts run --tag=baseline --approved-budget=<USD>` (**betalt**), sedan
   `node scripts/eval/v1.ts score --tag=baseline` och klistra in tabellen under *Resultat*.

## Budgetförslag (att godkänna)

`node scripts/eval/v1.ts budget --swings=40 --dtl=20`:

| | värde |
|---|---|
| anrop | **40 svingar × 3 = 120** |
| modell | `claude-sonnet-4-5`, quick-läge, `max_tokens` 1760 (DTL, 13 regler) / 1640 (face-on, 12) |
| per anrop | $0,033–0,055 |
| **totalt** | **$3,94–6,61** |
| föreslaget tak | **$8** (`--approved-budget=8`), ~20 % över övre gränsen |
| tid | ~26–46 s per anrop (`api.ts`, sessionssvingar) → ~1–1,5 h sekventiellt |

30 svingar: 90 anrop, $2,96–4,96. 50 svingar: 150 anrop, $4,93–8,27.

**Källa:** S-48 ([vision-max-tokens/README.md](../vision-max-tokens/README.md)), quick, 7 DTL-regler, 23–28 bildrutor:
$0,027–0,041 per anrop, output 639–757 tokens; output per regel 65 (pass) – 115 (fail), huvud ~90, svans 40–85.
Input-sidan = kostnad − output ≈ $0,017–0,030. Regler utöver 7 ger mer output (räknat per regel) och ~80 input-tokens var.
Övre gränsen antar att alla regler blir fail. Prislistan är `api.ts`:s ($3 / $15 / $3,75 / $0,30 per M tokens).

- `OSÄKER:` prislistan i `api.ts` ("Priser 2026-08, verifiera vid modellbyte") är inte kontrollerad mot Anthropics aktuella priser.
- `OSÄKER:` ~80 input-tokens per extra regel är uppskattat ur regeltexternas längd, inte uppmätt (≈ $0,0014 per anrop).
- `OSÄKER:` urvalet kan ha upp till 32 bildrutor (S-48 hade 23–28) → input-sidan upp till ~15 % högre. Taket $8 täcker det.

## Kvar att avgöra / risker

- **Detaljerat läge mäts inte i baslinjen.** 13 regler ger där taket 3650, över Workerns 2000 om den inte är deployad med
  4096 (S-48 §2) → klippning. Egen körning med egen budget om det behövs.
- **13 regler i ett anrop** är fler än en typisk användare har aktiva. Om fler regler per anrop försämrar domarna mäts det inte
  här; det är en V-2-fråga (samma facit, färre regler per anrop).
- **Extraheringen är inte körd** i agentmiljön (inga klipp, ingen Chromium). Sökvägarna är uppdaterade efter core-splitten.

## Resultat

*Tom — fylls i efter godkänd baslinjekörning (`score --tag=baseline`).*
