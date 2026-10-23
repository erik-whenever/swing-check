# Vision-svaret klipps vid max_tokens (S-48)

> 2026-10-23, `fix-s48-max-tokens` (från `main`). Produktionsfix. Godkänt: högst 25 riktiga
> Vision-anrop via Workern, märkta `metadata.user_id = "s48-test-…"`. **Använda: 24.** Skript:
> [`measure.cjs`](measure.cjs). Rådata (gitignorerat, ligger lokalt): `data/vision-max-tokens/`.

## Material

6 svingar ur S-45 steg 3:s extraherade bildrutor (produktionens sessionsväg, E-2-beskärning),
alla slag med impact, från olika klipp, 23–28 bildrutor: P45-001 (sträckt Slo-Mo), P45-003,
P45-006, P45-010, P45-013, P45-035. Reglerna är de 7 DTL-reglerna ur biblioteket. Anropet är appens
eget `analyzeSwing` (oförändrat före fixen). Bara transporten är utbytt: märkning och loggning
före sändning.

6 svingar per läge i stället för ~8: 2 lägen × (före + efter) × 8 = 32 anrop, och det är över
budgeten. 6 × 4 = 24.

## 1. Mätning före fixen (produktionen oförändrad)

| läge | `max_tokens` | klippta | output-tokens |
|---|---:|---:|---|
| quick (appens standard) | 600 | **6 / 6** | 600 i alla |
| detaljerat | 2000 | **5 / 6** | 2000 i fem, 1904 i den enda som blev klar |

Output-tokens per del. Uppskattat ur svarstexten (tecken/token mätt per svar, 2,7 quick och
3,0 detaljerat):

| del | quick | detaljerat |
|---|---|---|
| huvud (vinkel, kvalitet, faser) | ~90 | 115–185 |
| **per regel** | **65–75 vid pass, 100–115 vid fail** (inget prosa: JSON-struktur, `short_verdict`, bildrutor, `suggestion` bara vid fail) | **180–410** (snitt ~290; `visual_evidence` 260–375 tecken) |
| svans (`overall_assessment`, `cannot_determine_reasons`) | 40–85 | ~280 |
| **behov för 7 regler** | **640–760** (mätt efter fixen) | **~2 300–3 300** |

**Var gränsen går.** 3 och 5 regler kördes inte. De är räknade ur kostnaden per regel ovan,
eftersom output är additiv per regel. Budgeten räckte inte till både egna körningar och
verifiering.

| regler | quick @ 600 | detaljerat @ 2000 |
|---:|---|---|
| 3 | ryms (≤ ~510) | ryms (≤ ~1 700) |
| 5 | ryms bara om få regler blir fail (~545 typiskt, ~740 om alla fail) | klipps vid utförliga svar (~1 900 typiskt, ~2 500 som mest) |
| 7 | klipps alltid (6/6) | klipps nästan alltid (5/6) |

Gränsen ligger alltså vid **~4–5 regler i quick och ~4 i detaljerat**. Kommentaren i `api.ts`
räknade med 15 regler inom 600 och var fel med ungefär en faktor 3. **Quick-läget är inte
pratigt.** Det är ~70 tokens JSON per regel även utan prosa. Där hjälper ingen promptändring,
bara ett tak som växer med antalet regler.

## 2. Fixen

**a) Klippning är ett eget, tydligt fel** (`api.ts`). `stop_reason === 'max_tokens'` →
`TruncatedResponseError` ("Analysis cut off: the answer hit max_tokens (n/max, k rules) — try
again, or with fewer rules"). Det kastas **före** parsningen, aldrig som "Invalid JSON", och
loggas på ERROR. `onUsage` körs fortfarande före, så sessionens kostnad räknar med det betalda
anropet. Båda anroparna (`AnalysisView`, `useSessionCapture`) visar redan `err.message` med
återförsök och TTS-felmeddelande, så felet syns utan ändringar i UI:t. Automatiskt återförsök
valdes bort: det skulle dubbla kostnaden tyst, och med det skalade taket ska klippning inte
inträffa.

**b) Svarslängden styrs, per läge:**

- **quick: bara taket skalas, prompten är orörd.** `maxTokensFor(true, n) = 200 + 120·n`
  (7 → 1040). Taket täcker även fallet där alla regler blir fail: 90 + 7·115 + 85 ≈ 980.
  Svaren blir inte längre av ett högre tak. Taket hindrar bara klippning, och svaret är redan så
  kort schemat tillåter. Ett kortare quick-svar skulle kräva att fält tas bort ur schemat
  (`relevant_frames`, `suggestion`), och det är en produktfråga, inte en buggfix.
- **detaljerat: taket skalas, och prosan per regel begränsas.** `400 + 250·n` (7 → 2150). Nytt
  stycke i detaljschemat (`DETAILED_LENGTH_INSTRUCTION`): `visual_evidence` högst 2 meningar med
  bildrutenummer, `observation` en mening, `suggestion` högst 2 meningar, ingen upprepning.
  Bara taket hade inte räckt. 7 regler okapat är ~2 300–3 300 tokens, alltså ~50 % längre
  generering, och det går inte under Workerns tak på 2000 förrän Workern deployas. Med
  begränsningen hamnar 7 regler under 2000 redan med dagens Worker (se 3).
- Fokusregel räknas som två regler i budgeten (extra fält för korrigering och drill).
- Taket i appen är 4096. **Workerns `MAX_TOKENS` höjs 2000 → 4096** (`wrangler.toml` och
  standardvärdet i koden). Workern klampar, så **förrän `wrangler deploy` är kört gäller 2000**.
  7 regler i detaljerat läge ryms ändå (som mest 1817 mätt). Vid ~8+ regler i detaljerat läge
  behövs deployen. Om den saknas blir felet a) synligt, inte tyst.

## 3. Verifiering efter fixen (samma 6 svingar, 7 regler)

| läge | tak | klippta | output-tokens |
|---|---:|---:|---|
| quick | 1040 | **0 / 6** | 639–757 |
| detaljerat | 2150 (Workern: 2000) | **0 / 6** | 1407–1817 |

Detaljerat efter begränsningen: 130–245 tokens per regel (förut 180–410), `visual_evidence`
145–180 tecken (förut 260–375). Genereringen blir kortare än förut, inte längre.

**Regelbedömningarna sida vid sida.** P = pass, F = fail, ? = cannot_determine, med confidence.
Pilen visar före → efter. · = klippt före regeln.

```
quick       spine     connected  shoulder   club-top   inside     fwd-lean   finish
P45-001     P.9→P.9   P.85→P.85  P.8→P.85   F.85→P.8   P.75→P.85  F.8→F.8    ·→F.9
P45-003     P.9→P.9   P.85→P.85  P.9→P.9    P.85→P.85  P.8→P.8    P.85→P.85  P.9→P.9
P45-006     P.9→P.95  P.85→P.9   P.9→P.85   P.85→F.85  P.8→P.8    P.85→P.85  P.9→P.9
P45-010     P.9→P.95  P.85→P.9   P.9→P.92   P.85→F.88  P.8→P.85   ?.4→?.5    F.85→F.93
P45-013     P.85→P.85 F.8→P.8    F.75→F.75  ?.4→?.4    F.75→P.75  F.8→F.7    ·→F.85
P45-035     P.9→P.9   P.85→P.85  P.9→P.85   P.85→P.8   P.85→P.85  P.9→P.9    P.95→P.95

detaljerat
P45-001     F.85→F.95 P.9→P.85   P.85→?0    F.75→P.8   P.8→F.85   ?.4→F.9    F.9→F.95
P45-003     P.9→P.95  P.85→P.9   P.88→P.85  ?.5→P.8    P.82→P.85  P.8→P.9    P.92→P.95
P45-006     P.85→P.95 P.8→P.9    P.75→P.85  ?.4→?.4    P.8→P.85   P.75→P.8   P.9→P.9
P45-010     F.92→F.85 F.85→P.9   F.88→F.8   ?.45→F.75 F.82→P.85  F.9→?0     ·→F.9
P45-013     ?.4→F.85  F.85→F.8   F.9→F.75   ?.5→?.4    ?.45→?.5   ·→F.75     ·→F.9
P45-035     P.85→P.9  P.8→P.85   P.75→F.9   ?.4→?.4    P.75→P.8   ?.45→?.3   P.9→P.95
```

- **Quick är kontrollen för bruset.** Prompten är identisk, och ett högre tak påverkar inte
  tokens före klippunkten. Ändå byter **5 av 40** bedömningar mellan körningarna. Det är Visions
  egen spridning mellan körningar, inte fixen.
- **Detaljerat:** 5 av 39 pass/fail-byten, alltså samma nivå som bruset i quick, plus 4 `?` som
  blev ett utslag och 2 utslag som blev `?`. Andelen `cannot_determine` sjönk (9/39 → 7/42).
  Samstämmigheten mellan quick och detaljerat på samma sving höll sig (före 24/38 = 63 %, efter
  29/42 = 69 %).
- **Inget tecken på att bedömningarna blivit sämre**, men det finns heller inget facit för
  reglerna, och n = 6. Bevisat är att svaren blir kompletta. Lika kvalitet går bara att påstå
  inom bruset.
- Texten blir kortare men behåller bildrutenummer och det som syns (P45-003, spine-angle, före:
  4 meningar evidens och 2 meningar observation; efter: 2 + 1, samma bildrutor och samma slutsats).
- Två `?` med confidence 0 efter fixen. P45-001 shoulder motiveras med "kan inte bedömas från
  down-the-line". Det bryter mot systempromptens punkt 4, och samma beteende finns före fixen på
  andra svingar. Det är inte orsakat här, men noterat.

## 4. Promptcachen

- **quick: bryts inte.** Det cachade blocket är byte-identiskt (cache-skrivning 1989 både före och
  efter). `max_tokens` ingår inte i cachens nyckel. Efter fixen: `cache_read_input_tokens = 1989`
  på 5 av 6 anrop. Det första var en skrivning eftersom TTL på 5 min hade gått ut sedan förra
  körningen, inte på grund av ändringen.
- **detaljerat: bryts en gång.** Begränsningen gör det cachade blocket 74 tokens större (1551 →
  1625). Det blir en ny cachepost (en skrivning à ~$0,006) per regeluppsättning, och sedan
  `cache_read_input_tokens = 1625` på 5 av 6 anrop.

## Kostnad

24 anrop, totalt **$0,97** enligt prislistan i `api.ts`. Quick kostade $0,027–0,041 per anrop
både före och efter. Detaljerat kostade $0,047–0,059 före och $0,040–0,055 efter, alltså billigare
med kortare svar. 1 anrop av godkännandet är kvar.
