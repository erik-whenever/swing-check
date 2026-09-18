# Blind fasgranskning av `top` — metod

> Byggd 2026-09-18 av [`select.ts`](select.ts), ett **engångsverktyg som bara läser**. Ingen
> produktionskod är rörd: `derived.ts`, `plausibility.ts` och trösklarna
> `NEAR_VERTICAL_GATE_DEG` / `ON_PLANE_BAND_DEG` är oförändrade, och ingen fix är byggd.
> **Frö: `0xfa5ec0de`.**

> **Omgången är körd.** [review.md](review.md) är ifylld (Erik, 2026-09-18) och utvärderad i
> **[resultat.md](resultat.md)**. Den här raden är tillagd för hand efter körningen och står
> inte i `select.ts`:s mall — en omgenerering tar bort den, vilket är väntat och inte ett fel.
>
> **Läs den här filen efter [review.md](review.md), inte före.** Den bär inte svaren, men den
> bär rundans sammansättning: hur många rader som är kandidater, hur många som är kontroller
> och vilka faser kontrollerna har. Vet man det, vet man ungefär hur många `top` man ska
> hitta — och då är bedömningen inte längre helt blind. Metoden står här för att den ska gå
> att granska, inte för att den ska läsas som förberedelse.

## Frågan

`topFrameIndex` läser `frame.phase === 'top'` och kan inte se var etiketten kommer ifrån.
Saknas `impactSec` faller `derivePhase` tillbaka på `FALLBACK_BOUNDS` i
`src/lib/dataset/datasetPhase.ts`, och allt i fönstret **0,45–0,52 av envelopen** döps till
`top`. Etiketten betyder då *"omkring 48 % in i svingen"* — en proportion, inte en
observation. Ett fall är bevisat fel: `img-3641-adde195e_s00_f02` bär `top` ur manifestet
och visar en genomsving ([../across-sign-result.md](../across-sign-result.md) → §4).

**Hur ofta det händer är okänt**, och det går inte att räkna fram ur samma etiketter. Det här
paketet mäter det. Det bygger ingen fix — felfrekvensen ska finnas innan något byggs på den.

## Urvalet

Härlett av `select.ts`, som skriver ut hela härledningen i konsolen. Kör om, från repo-roten
(kräver `unzip` på PATH):

```sh
node_modules/.bin/esbuild docs/shaft/phase-audit/select.ts --bundle --platform=node --format=esm --outfile=/tmp/select.mjs
node /tmp/select.mjs --dry-run   # bara härledningen, skriver ingenting
node /tmp/select.mjs             # bygger om paketet
```

| Mängd | Antal | Härledning |
|---|---:|---|
| a) dtl-toppkandidater | 63 | `prelabel.xml` ⋈ `batch.zip/manifest.json` ⋈ annoterade exporter, svingar med vy-bucket `dtl`, varje bildruta där annotatörens **eller** manifestets fas är `top` |
| b) vilar på manifestfasen | 30 | (a) minus de 33 där annotatören själv sa `top` — 26 utan användbar annoterad fas, 4 där annotatören säger emot |
| c) produktionsvägens val | 22 | (b) där `topFrameIndex` returnerar just den bildrutan |

De tre talen **asserteras** mot [../across-sign-result.md](../across-sign-result.md) (`EXPECTED`
i skriptet). Stämmer de inte, stannar körningen och bygger ingenting — en omgång byggd på en
annan mängd än rapporten beskriver mäter något annat och säger att den mätte det här.

Rundan är **(c) + 10 kontroller = 32 rader**. Kontrollerna har en fas som en
annotatör satt för hand, stratifierade **4 `top` / 2 `backswing` / 2 `downswing` / 2
`finish`**, alla `dtl`, alla ur svingar där ingen kandidat ligger, högst en per sving.
`batch-03/annotated-v1.zip` är utesluten: dess `phase` är `address` på alla 242 bildrutor,
vilket är CVAT:s `default_value` — ett orört förval, inte en bedömning. **Och när en bildruta
är annoterad två gånger måste passen vara ense:** batch-01 har två pass som skiljer sig på 10
av 146 bildrutor, och en bildruta vars egna annotatörer är oense är ingen fas att mäta mot —
vilket pass man än utser till det senare. Sex av de tio kontrollerna är dubbelannoterade och
eniga; vilka pass som satt fasen står per rad i facit.

Ordningen är slumpad med **`0xfa5ec0de`** (mulberry32 + Fisher-Yates). Samma frö styr
kontrollurvalet, så hela paketet går att återskapa: kör om skriptet.

## Bildrutorna

`frames/<frame-id>.jpg` är raden som ska bedömas. `frames/<frame-id>_prev.jpg` och
`_next.jpg` är närmaste envelope-bildruta före och efter — hämtade ur
`data/shaft/exports/`, alltså ur envelope-urvalets egen utdata (upp till 7 bildrutor per
sving) och inte ur träningsbatchen, som är ett glesare stickprov av samma sving.

`frames/` är **gitignorerad**, av samma skäl som `docs/shaft/across-sign-candidates/` och
`data/shaft/*`: samma identifierbara personer som originalen. Texten bredvid committas,
bilderna aldrig. I en färsk klon finns de alltså inte — kör om skriptet, och **samma frö ger
samma 32 rader i samma ordning**.

Kontexten finns för **varje** rad som har en granne, inte bara för de rutor jag tyckte var
svåra: vilka rutor som är svåra är i sig en bedömning, och en omgång där bara vissa rader bär
kontext berättar för granskaren vilka någon redan tvekat om. Grannarna heter efter **raden**,
inte efter sig själva, så fillistan bär ingen tidsordning.

## Så fylls review in

1. Öppna [review.md](review.md). Läs ingenting annat i den här mappen.
2. Bedöm bilden i kolumnen `bild`, en rad i taget. `före`/`efter` visar rörelseriktningen
   och ska inte bedömas i sig.
3. Skriv `address / backswing / top / downswing / impact / finish / osäker` i sista kolumnen. `top` = klubban vänder **i den här bildrutan**.
4. `osäker` är ett riktigt svar och ska användas hellre än en gissning — en gissning som
   råkar bli rätt är oskiljbar från en bedömning och förstör siffran.
5. Först när alla 32 rader är ifyllda: öppna [facit.md](facit.md).

`review.md` länkar inte till facit, och facit står inte i `select.ts`:s utdata till
review-filen. En ny körning vägrar skriva över en ifylld review utan `--force`.

## Så görs utvärderingen efteråt

**Kontrollerna först.** Hur många av de 10 träffade annotatörens fas? Det är omgångens eget
felmått. Sitter felen där, mäter kandidatsiffran granskaren och inte etiketten, och
kandidatsiffran ska då inte tolkas.

**Sedan felfrekvensen bland de 22.** Andelen kandidatrader där bedömningen inte är
`top`. `osäker` räknas **inte** som fel — redovisa den som en egen tredje kategori (rätt /
fel / kan inte avgöras), precis som den blinda teckenomgången gjorde. En etikett som inte går
att bekräfta är inte samma sak som en etikett som är fel, och att slå ihop dem skulle göra
felfrekvensen till den siffra man råkade vilja ha.

**Sist: klustrar felen?** Facit bär kolumnerna som svarar på det, och varje jämförelse görs
mot kontrollerna och mot de kandidatrader som var rätt:

| Hypotes | Kolumn i facit | Vad som skulle synas |
|---|---|---|
| Vissa källklipp är genomgående felfasade | `källklipp` | flera fel ur samma klipp |
| Felet sitter i `FALLBACK_BOUNDS` | `impactSec` | fel nästan bara på rader utan `impactSec` |
| Långa klipp bär fler fel | `klipplängd`, `envelope (s)` | fel samlade i den övre delen av spannet |
| Fönstret 0,45–0,52 ligger fel | `envelope-andel` | fel samlade i ena änden av fönstret |

Sista raden är den intressanta och den svagaste: med 22 rader räcker underlaget till
en riktning, inte till en tröskel. **Flytta ingenting på den här omgången** — precis som
`ON_PLANE_BAND_DEG` inte flyttades på n = 1. Vad omgången kan ge är en mätt felfrekvens
där det i dag står ett enda bevisat fall.

## Vad omgången inte kan svara på

- **De 33 rader där annotatören själv sa `top`** är inte med. De bär ett annat
  fel (en människas), och att blanda in dem hade gett ett medelvärde över två olika fel.
- **De 8 manifestburna rader som inte är produktionsvägens val** är inte heller med:
  `topFrameIndex` räknar aldrig på dem, så deras fas kostar ingenting i dag.
- **Felfrekvensen gäller `dtl`-toppar i det här datasetet**, inte fasderiveringen i
  allmänhet. `batch-03`s annotatörsfas är oanvändbar, och det är den batchen som väger
  tyngst i (b).
