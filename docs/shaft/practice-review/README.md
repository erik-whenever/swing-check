# Slag eller provsving (S-45, steg 1) — bedömningspaket

> 2026-10-22, `stream-shaft`. Ingen produktionskod ändrad. Facit per sving på Eriks egna klipp,
> så att vi kan mäta hur ofta `detectSessionSwings` släpper igenom provsvingar.

## Starta vyn

```powershell
start data\shaft\practice-review\erik\index.html
```

En sving i taget: `Space` spelar, `←`/`→` stegar (`Shift` = 5), `1` slag · `2` provsving ·
`3` ingen sving · `4` osäker, `N`/`P` nästa/föregående. Svaren sparas i webbläsaren
(localStorage) under tiden. Klicka **Exportera svar** när du är klar och spara filen som
`data/shaft/practice-review/svar-erik.json`.

**Kriteriet står i vyn:** slag = bollen träffas (bollen syns före och är borta eller i rörelse efter).

## Paketet

| | |
|---|---:|
| Klipp körda (`data/shaft/clips/own/`, alla `.mp4`/`.mov`) | **70** |
| Accepterade svingar = rader att bedöma | **81** (i 59 klipp) |
| Klipp med 0 accepterade svingar | **11** |
| Frö (mulberry32 + Fisher-Yates, samma generator som S-32) | **`0x45a1c0de`** |

Klippen med 0 svingar ingår inte (bara accepterade envelopes i det här steget): `IMG_3550`,
`3555`, `3556`, `3575`, `3703`, `4613`, `5063`, `5074`, `5245`, `5405`, `5406`. Skäl per klipp
står i `segments.json` (`rejected[].reason`).

Uppgiften nämnde `data/shaft/own-clips/`. Den katalogen finns inte. Egna klipp ligger i
`data/shaft/clips/own/` (samma 70 som [own-clips-stability.md](../own-clips-stability.md)).

## Hur svingarna togs fram: produktionens kedja, inte en replik

[`segment_clips.cjs`](segment_clips.cjs) startar en headless Chrome mot `npm run dev`, laddar
upp varje klipp via en riktig `<input type=file>` och anropar appens egna moduler från Vite:
`extractPoseTrajectory` (WASM-PoseLandmarker i VIDEO-läge, nollställd en gång per klipp och
sedan varm genom det, `SAMPLE_FPS` 15) → `readTimeStretch` → `detectSessionSwings(samples,
{ timeStretched })`. Det är samma anrop som `SegmentedSwings.tsx` gör, efter S-44. 9 klipp är
sträckta Slo-Mo-renderingar, och 6 av dem gav svingar. Två omkörda klipp gav byte-identisk utdata.

**Inte jämförbart rad för rad med S-44:s "84 svingar".** Den siffran kom från python-mediapipe i
native fps (`run_pose_clip.py`). Det här är webbläsarens 15 fps-bana, alltså det appen kör.
Glue-koden från own-clips-stability committades aldrig. Den här är committad.

## Blindning

- Id `P45-001` … `P45-081` delas ut i slumpad ordning (frö ovan), och vyn visar svingarna i
  id-ordning. Id:t säger ingenting om klipp eller tid.
- Vyn får per sving ett id, bildfilerna och ett uppspelningsintervall. Den visar inte klippnamn,
  sekunder, bildruteantal eller envelopelängd, och inte segmenterarens flaggor (sträckt,
  impact, förkastade kandidater). Bildruteantalet finns i sidans källkod (det behövs för att
  ladda bilderna) men skrivs aldrig ut. Uppspelningens längd syns förstås när den spelas, och
  sträckta klipp ser ut som slow-mo. Det går inte att undvika när hela envelopen ska visas.
- Facit-nyckeln (`key.json`: id → klipp, envelope, impact, `timeStretched`, fönster) är en
  separat fil. **Öppna den inte före bedömningen.**

Fönster per sving: envelope-start − 1 s till finish + 1 s (kapat vid klippets början), i filens
tidsbas. Varje avkodad bildruta skrivs ut, utom att klipp över 60 fps glesas till var n:te.
Långsidan är högst 960 px.

## Filer

| repo (`docs/shaft/practice-review/`) | gitignorerat (`data/shaft/practice-review/`) |
|---|---|
| `segment_clips.cjs`: produktionens segmenterare i dev-appen | `segments.json`: rå utdata per klipp |
| `build_package.py`: bildrutor, nyckel, ifylld vy | `frames/P45-xxx/NNN.jpg` |
| `viewer.html`: vymall | `erik/index.html`: ifylld vy |
| | `key.json`: facit-nyckel |

## Kör om

```sh
npm run dev -- --port 5199 --strictPort        # annan terminal; redigera ingen .html under roten
                                               # medan den kör (Vite laddar om sidan)
node docs/shaft/practice-review/segment_clips.cjs data/shaft/clips/own data/shaft/practice-review/segments.json
data/shaft/top-review/.venv/Scripts/python.exe docs/shaft/practice-review/build_package.py \
    data/shaft/practice-review/segments.json data/shaft/clips/own data/shaft/practice-review
```

## Återstår

1. Eriks bedömning av alla 81.
2. Poängsättning: andel provsving/ingen sving bland accepterade, och (ADR-003 Risker §4) om det
   alls är ett problem för användaren.
