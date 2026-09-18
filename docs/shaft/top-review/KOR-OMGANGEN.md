# Så körs toppomgången (S-32)

> Den här filen är **ofarlig att läsa i förväg** — den bär varken svar eller rundans
> sammansättning. [README.md](README.md) bär sammansättningen och läses **efter** att du
> bedömt klart.

## 1. Bygg paketet (en gång, den som sitter vid repot)

```sh
# från repo-roten, med ett venv som har opencv-python
training/.venv/Scripts/python.exe docs/shaft/top-review/build_round.py
```

~5 minuter och ~1,3 GB under `data/shaft/top-round/`. Allt bildmaterial är gitignorerat och
lämnar aldrig maskinen. Klart när den skriver `wrote … registry.json and two viewers`.

## 2. Bedöm (Erik och Lisa, var för sig)

Öppna **din egen** fil i en webbläsare:

- Erik: `data/shaft/top-round/erik/index.html`
- Lisa: `data/shaft/top-round/lisa/index.html`

Ni har olika ordning och olika frö — fröet står överst i din vy. **Ni bedömer oberoende: titta
inte i den andras mapp, jämför inte svar, prata inte om enskilda svingar förrän båda är
klara.**

### Vad du svarar

För varje sving: **var vänder klubban?** Stega bildruta för bildruta genom hela svingen och
svara med ett **intervall** — den **första** och den **sista** bildruta som rimligen kan vara
toppen.

- Intervallet är svaret, inte en osäkerhetsmarkering. Är du säker på en enda ruta sätter du
  första och sista till samma. Är platån bred sätter du den bred. **Gissa inte fram ett
  smalare intervall än du faktiskt ser** — bredden är en av sakerna omgången mäter.
- **`Osäker`** är ett riktigt svar och ska användas hellre än en gissning: en gissning som
  råkar bli rätt går inte att skilja från en bedömning, och den förstör siffran.
- Anteckningsfältet är frivilligt — använd det när något är fel med klippet självt (skymd
  klubba, kameran rör sig, två svingar i samma envelope).

### Tangenter

| | |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | en bildruta (med <kbd>Shift</kbd>: fem) |
| <kbd>Home</kbd> <kbd>End</kbd> | första / sista bildrutan |
| <kbd>Space</kbd> | spela upp svingen i loop |
| <kbd>F</kbd> / <kbd>L</kbd> | sätt första / sista rutan (F = first, L = last) i intervallet |
| <kbd>U</kbd> | markera osäker |
| <kbd>N</kbd> / <kbd>P</kbd> | nästa / föregående sving |

Svaren sparas löpande i webbläsaren, så du kan stänga fliken och fortsätta senare — **samma
webbläsare och samma fil**, annars är de borta. Knappen *Nästa obesvarade* hoppar dit du
slutade.

## 3. Lämna in

Klicka **Exportera svar** och spara filen som:

- `data/shaft/top-round/svar-erik.json`
- `data/shaft/top-round/svar-lisa.json`

## 4. Poängsätt (först när **båda** filerna ligger där)

```sh
training/.venv/Scripts/python.exe docs/shaft/top-review/score_round.py <poseDir> \
    --section all
```

`<poseDir>` är utdatan från `docs/shaft/top-from-pose/run_pose.py` (S-31). Skriptet skriver
bara till stdout och rör ingen produktionskod. Läs **kontrollavsnittet först**: missar
bedömarna kontrollerna mäter resten bedömaren och inte estimatorn.

`--section` tar `controls`, `a`, `b`, `c`, `covariates` eller `all`.

## Öppna inte förrän du är klar

- `data/shaft/top-round/registry/` — id-kartan och facit.
- [README.md](README.md) — rundans sammansättning.
- [../top-from-pose.md](../top-from-pose.md), [../phase-audit/](../phase-audit/) — tidigare
  bedömningar av delar av samma material.
