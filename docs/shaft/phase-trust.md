# Fasens förtroende — vad toppankrade mätvärden svarar efter S-30

> 2026-09-18, `stream-shaft`. **Första produktionsändringen i S-23-spåret.** Rör
> `shaftSeries.ts`, `fromDetection.ts`, `datasetPhase.ts` och `derived.ts`.
> Siffrorna nedan är körda av [phase-trust/measure.ts](phase-trust/measure.ts), som bara
> läser. `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen och
> `plausibility.ts` är **orörda**.

## Varför

S-23 mätte att **13 av 22** bildrutor produktionsvägen väljer som `top` inte visar toppen
([phase-audit/resultat.md](phase-audit/resultat.md)). Tre spikar sökte en pålitlig källa i
skaftsignalen och underkände alla tre: envelope-rutorna bär ingen läsbar vändpunkt
([top-from-signal.md](top-from-signal.md)), den täta signalen låser på brus i platån före
toppen ([top-from-dense-signal.md](top-from-dense-signal.md)), och bortfallets läge bär
inte toppen heller ([top-from-dropout.md](top-from-dropout.md)).

Så länge ingen pålitlig källa finns ska ett mätvärde som ankras vid toppen **inte svara
med ett tal**. Ett saknat värde går att återkomma till; ett självsäkert fel gör det inte —
och det gamla beteendet var just det, eftersom `plausibility.ts` prövar *punkterna* och
inte *ögonblicket*, så en felvald toppruta kom ut flaggad `usable`.

## Vad som ändrades

**1. Fasen bär nu sin härkomst.** Ny `PhaseSource` på varje `ShaftFrameSample`
(`shaftSeries.ts`), obligatorisk och aldrig defaultad:

| Värde | Betyder | Felprofil enligt S-23 |
|---|---|---|
| `observed` | någon *såg* fasen på bildrutan — annotation, eller en detektor som hittar händelsen själv | den enda som räknas som evidens |
| `envelope-impact` | härledd ur envelopen **med** mätt nedslag; toppen är `impact.topSec` ± tolerans | 7 av 8 fel var `backswing` — etiketten för **tidigt** |
| `envelope-fallback` | härledd ur `FALLBACK_BOUNDS`, dvs. typsvingens proportioner | 5 av 5 fel, alla på envelope-andel **0,484** |

De två härledda hålls isär trots att ingen av dem är observerad: felen går åt **olika
håll**, och det är det enda som är mätt om dem. `isPhaseObserved()` är predikatet, och det
tar `undefined` med flit — en serie som lästs ur en fil skriven innan fältet fanns har
ingen härkomst, och "posten säger inget" måste läsa som "ingen såg det".

`derivePhaseWithSource()` i `datasetPhase.ts` rapporterar vilken gren som körde. **Ingen
gren returnerar `observed`** — funktionen är en slutledning, hela vägen, och typen säger
det nu.

**2. Toppankrade mätvärden svarar inte utan observerad fas.** `topFrame` (f.d.
`topFrameIndex`) filtrerar först på etiketten `top`, sedan på `isPhaseObserved`, och skiljer
de två tomma svaren åt:

- **ingen bildruta bär `top`** → `phase-missing`, som förut;
- **`top` finns men ingen såg den** → nytt skäl **`top-phase-not-observed`**, och de
  bildrutor mätvärdet avstod från läsa följer med i `frameIndices`.

Det gäller `shaft-position-p4` och `top-shaft-orientation`. **`shaft-angle-by-phase` läser
`frame.phase` direkt och omfattas i sin `top`-hink** — annars är regeln trivialt
kringgången, för `shaftAngleByPhase(...).value.top.medianDeg` är samma tal som
`top-shaft-orientation` vägrar ge. Hinken uteblir och skälet står på mätvärdet. **Övriga
hinkar är orörda**: de är spann som etiketten träffar ungefär rätt över flera bildrutor,
och ingen av dem är mätt i S-23 — att spärra dem vore en oprövad gissning i försiktighetens
dräkt.

**Formen på svaret är den befintliga `reject()`-formen** — `value: null`, `level:
'rejected'`, namngivet skäl — alltså samma form som `phase-missing`, `handedness-unknown`
och `body-reference-missing` redan har. **Kategorin `cannot-determine` är medvetet inte
använd här**, för den betyder något annat och smalare: *toppbildrutan mättes, och riktningen
går inte att läsa ur den* (närlodrätt-spärren). Utan observerad fas finns ingen toppbildruta
att mäta, och `distanceToVerticalDeg` — som typen lovar alltid finns — skulle då vara ett
tal om en bildruta ingen tror är toppen. Vill man hellre se kategorin här krävs att det
fältet blir nullbart; det är ett medvetet vägval, inte en förbiseelse.

## Vad det kostar, mätt över alla 205 svingar

`data/shaft/exports/` är hela den extraherade mängden — 1 435 bildrutor, 7 per sving, samma
rutor som S-23:s granskning och S-27:s detektorkörning satt på.

| Svingens `top` | Svingar | Andel | Utfall efter ändringen |
|---|---:|---:|---|
| observerad (annotatören såg den) | **109** | 53 % | svarar fortfarande |
| härledd ur envelopen med nedslag | **35** | 17 % | `top-phase-not-observed` |
| härledd ur `FALLBACK_BOUNDS` | **8** | 4 % | `top-phase-not-observed` |
| ingen bildruta bär `top` | **53** | 26 % | `phase-missing` (oförändrat) |

**43 av 205 svingar (21 %) går från ett tal till `top-phase-not-observed`. 109 (53 %) svarar
fortfarande. 53 var redan tysta** av ett annat skäl och är oberörda.

Per vy: `dtl` 179 svingar — 102 svarar, 34 nya tomma; `face_on` 24 — 7 svarar, 7 nya tomma.

**Två av de 109 byter bildruta.** En härledd `top` låg efter den observerade, och den gamla
regeln ("sista `top`") tog den; den nya tar den sista **observerade**. En senare bildruta är
inte en bättre läsning av toppen, den är en overifierad.

### Det stora förbehållet: i appen svarar ingen av dem

De 109 svarar därför att **en människa annoterade en del av det här datasetet i CVAT**.
Appen har inga annotationer. Där är `derivePhase` enda faskällan, och den returnerar per
konstruktion aldrig `observed` — så i produktion blir det **205 av 205 `top-phase-not-observed`**,
och det är avsikten: `top-shaft-orientation` och `shaft-position-p4` är tysta tills en
pålitlig toppkälla finns. Tabellen ovan mäter hur mycket av *underlaget* som fortfarande bär
ett svar, inte hur mycket appen svarar på.

Annotationerna räknas under S-24:s två skärpningar, båda restaterade i skriptet: en export
vars `phase` är konstant bär ingen fas alls (`batch-03/annotated-v1.zip` är `address` på alla
242 — CVAT:s orörda förval), och en dubbelannoterad bildruta måste ha **eniga** pass. Båda
reglerna tar bara *bort* observationer, vilket är rätt riktning för en siffra som ska mäta
vad regeln fortfarande släpper igenom.

## Produktionsvägen, körd

Utöver folkräkningen ovan körs `checkShaftSeries` → `buildShaftMeasurements` orört per sving,
på de **178 svingar som har skaftpredictions i repot** (`prelabel.xml`, batch-02/03, 1–2
rutor per sving — därför färre `top`-rutor än i exporterna):

| Mätvärde | Före | Efter |
|---|---|---|
| `top-shaft-orientation` | 51 tal, 4 `cannot-determine`, 123 tomma | **29 tal**, 3 `cannot-determine`, 146 tomma — varav **23 på fasen** |
| `shaft-angle-by-phase`, `top`-hinken | 55 hinkar | **32 hinkar** |
| `shaft-position-p4` | 0 tal | 0 tal |

**`shaft-position-p4` svarar noll både före och efter, och det är källans fel, inte
ändringens:** `prelabel.xml` bär inga pose-landmärken, så mätvärdet är
`body-reference-missing` på varje sving i det här repot. Dess fasspärr syns därför bara i
folkräkningen — 23 av de 55 svingar som har en toppruta stoppas nu på fasen **före**
kroppen. Att tillverka landmärken för att få fram talet vore att mäta riggen.

"Före" är samma mätvärde kört med varje `top` märkt `observed`; **bara bildruteval-regeln är
återimplementerad** i skriptet (den gamla var två rader och finns inte kvar att anropa).

## Följder att känna till

- **`docs/shaft/phase-audit/select.ts` kastar nu om den körs om — och felmeddelandet är den
  renaste verifieringen av hela ändringen.** Den asserterar `productionPath: 22` mot
  [across-sign-result.md](across-sign-result.md) och svarar nu ordagrant
  `productionPath: väntat 22, fick 0`. **Alla 22 bildrutor S-23 granskade — de med 13 fel —
  är precis de som nu vägras.** Det är rätt signal, inte ett fel: engångspaketet beskriver en
  omgång som är stängd. Den och
  `scripts/across-sign-candidates.ts` sätter numera `phaseSource` ärligt, så deras egen
  `phaseSource`-kolumn och mätlagrets typ säger samma sak.
- **Regeln kan bara lyftas av en pålitlig toppkälla**, inte av en tröskel. Tre spikar har
  underkänt skaftsignalen; nästa kandidat är en detektor som hittar händelsen själv, eller
  handledsbanan ur posen — ingendera är prövad.

## Kör om

```sh
node_modules/.bin/esbuild docs/shaft/phase-trust/measure.ts --bundle \
  --platform=node --format=esm --outfile=<tmp>/measure.mjs
node <tmp>/measure.mjs        # siffrorna
node <tmp>/measure.mjs --md   # samma siffror som tabell
```
