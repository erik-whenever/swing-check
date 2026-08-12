# Offline-utvärdering: Vision på skaftberoende regler

Harness som mäter **hur tillförlitligt Vision bedömer skaftberoende regler på de
bildrutor vi redan skickar** — underlag för frågan om egen skaftdetektering behövs.

Kod: [`scripts/vision-eval.mjs`](../../scripts/vision-eval.mjs) + `scripts/vision-eval/`.
Rapporten hamnar i `docs/experiments/vision-shaft-reliability.md`.

## Vad den rör och inte rör

**Rör ingenting i produktionen.** `scripts/` importeras aldrig från `src/` och hamnar
aldrig i bundeln. Harnessen *importerar* `poseEnvelope`, `poseEnvelopeSelection`,
`poseSegments`, `poseCropBox` och `prompt` oförändrade och kör dem i Node via esbuild —
den mäter alltså produktionens egen kedja, inte en kopia av den. `frameExtractor.ts`,
`poseSegments.ts` och produktionsprompten är orörda.

Det enda evalen definierar själv är **regeluppsättningen**, och regler är användardata:
produktionen läser dem ur regel-storen, harnessen skickar in sina åtta. Ingenting skrivs
tillbaka till appen.

## Måttet

Tre identiska anrop per sving och upplösning. **Samstämmigheten mellan körningarna är
proxyn för tillförlitlighet** — ett svar som inte är stabilt mot sig självt kan inte vara
tillförlitligt mot verkligheten, oavsett vad `confidence`-fältet påstår. Varken appen
eller Workern sätter `temperature`, så spridningen är modellens egen.

Fem skaftberoende regler mäts mot **tre kroppsregler som kontrollgrupp**, i samma request
på samma bildrutor. Utan kontrollgruppen går det inte att skilja "skaftet är svårt" från
"bildrutorna är svåra", och bara det första motiverar egen skaftdetektering.

Samstämmighet mäter **inte korrekthet**. Därför återges varje modellsvar ordagrant i
rapporten: tabellerna säger vilka regler som är värda att granska, transkripten är där de
granskas mot verkligheten.

## Förutsättning: klippen

Landmark-fixturerna i `src/lib/__fixtures__/` finns i repot, men de innehåller koordinater
— inga pixlar. Vision behöver pixlar, så **källklippen måste läggas på plats manuellt**
(de är Eriks egna inspelningar och ligger inte i git):

```
experiments/clips/
  dtl-full.mp4        # samma klipp som src/lib/__fixtures__/dtl-full.json exporterades ur
  face-on.mp4
  session-multi.mp4
```

`.mp4`, `.mov`, `.webm` och `.m4v` fungerar; filnamnet (utan ändelse) måste matcha
fixturens namn. `experiments/` är gitignorad i sin helhet.

Fem svingar kommer ur tre klipp: `session-multi` innehåller tre svingar som
`detectSessionSwings` hittar var för sig. `dtl-clipped` är medvetet utesluten — den
saknar bekräftad impact, och produktionens sessionsläge skippar en sådan sving ändå.

Stämmer inte kameravinkeln för `session-multi` (defaultad till `down-the-line`), lägg
en `experiments/clips/manifest.json`:

```json
{ "swings": [{ "id": "session-multi", "angle": "face-on" }] }
```

Vinkeln går in i promptens `CAMERA ANGLE`-rad, som systemprompten behandlar som
auktoritativ — fel värde mäter alltså fel fråga.

## Köra

```bash
npm run eval:vision frames       # klipp + fixturer → två bildrutesatser per sving
npm run eval:vision run --yes    # bildrutor → Vision. KOSTAR PENGAR.
npm run eval:vision report       # körningar → rapporten
npm run eval:vision all --yes    # alla tre
```

`run` vägrar spendera något utan `--yes`; utan flaggan skriver den ut antal anrop och en
grov kostnadsuppskattning och stannar. Det är hela skälet till att detta är tre steg och
inte ett. Räkna med ~24–30 anrop och en dryg dollar.

Trafiken går genom Workern, aldrig direkt mot Anthropic — nyckeln är en Worker-secret och
ska förbli det. `Origin` sätts till `http://localhost:5173` för att klara Workerns
allowlist; ändra med `EVAL_ORIGIN=…` om `ALLOWED_ORIGINS` ändras. Peka `VITE_API_URL=…`
på en lokal `wrangler dev` för att köra mot en lokal Worker.

## De två upplösningarna

Båda använder **samma beskärningslåda och samma JPEG-kvalitet**; bara pixelantalet
skiljer. Beskärning och skalning ändrar båda hur många pixlar som hamnar på skaftet, och
varieras båda blir rapporten oförmögen att säga vilken som spelade roll.

| Profil | Vad den är |
| --- | --- |
| `current` | Långsida ≤ `MAX_OUTPUT_SIDE` (900 px) — vad sessionsvägen skickar i dag. |
| `full` | Beskärningslådan i källans egen upplösning. Taket: mer detalj finns inte. |

**Ett väntat utfall värt att känna till i förväg.** På en 720×1280-inspelning är den
beskurna lådan ofta redan kortare än 900 px, och då blir `full` och `current` samma
bildrutor byte för byte. Harnessen upptäcker det, **hoppar över det andra anropet** och
säger det i rapporten i stället för att betala två gånger för samma request. Att en sving
hamnar där är i sig ett svar: skulle skaftreglerna visa sig opålitliga går det inte att
laga med fler pixlar från just den inspelningen — taket sitter i kameran, inte i
nedskalningen. Ju högre upplösning källklippen har, desto mer säger upplösningsjämförelsen.

## Vad som lämnas kvar på disk

```
experiments/clips/     källklipp (dina)
experiments/frames/    de extraherade bildrutorna, per sving och profil, + meta.json
experiments/runs/      varje modellsvar som rå JSON, per sving/profil/körning
docs/experiments/vision-shaft-reliability.md   rapporten — den enda artefakten i git
```

`report` läser bara `experiments/runs/` och `experiments/frames/`, så rapporten kan byggas
om utan att någonting skickas till Vision på nytt.
