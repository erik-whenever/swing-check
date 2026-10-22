# Slag eller provsving (S-45, steg 2) — resultat

> 2026-10-22, `stream-shaft`. Ingen produktionskod ändrad, ingen tröskel vald. Underlag: Eriks blinda
> svar (`svar-erik.json`, 81/81 bedömda) mot nyckeln från [steg 1](README.md).

## Kort

- **10 av 81 accepterade svingar är falska: 9 provsvingar och 1 "ingen sving".** Det är 12,3 %
  (Wilson 95 %: 6,8–21,3 %). Alla 10 är den första accepterade svingen i sitt klipp.
- **Ingen körtidssignal i segmenteraren skiljer dem åt.** Den bästa kandidaten fångar 5 av 10 och
  träffar samtidigt 6 av 71 slag. Den är dessutom sammanblandad med klippet: i tre klipp har slaget
  samma värde som provsvingen. De andra 5 falska går inte att skilja från slagen på något mått.
- **Bollen är den enda signal som hänger ihop med definitionen** ("slag = bollen träffas"). Bilderna
  vid adress och finish skickas redan till Vision, och beskärningen sträcker sig ned förbi fötterna
  just för att få med bollen. Ingen kod i kedjan letar efter den i dag.
- **Rekommendation: bygg ingen grind nu.** Se [Rekommendation](#rekommendation).

## Metod

[`measure_swings.cjs`](measure_swings.cjs) kör samma kedja som `segment_clips.cjs`
(`extractPoseTrajectory` 15 fps WASM VIDEO-läge → `readTimeStretch` → `detectSessionSwings` i
dev-appen via puppeteer) och sparar dessutom hela `SwingEnvelope` (med `debug`-serien),
`SwingCandidate` samt `refSpeed` och `quietThreshold`. **Kontroll: alla 81 envelopes (start, finish,
impact) är identiska med `segments.json`.** [`score.py`](score.py) kopplar svar → nyckel →
mått via (klipp, envelope-start).

Måtten är grindens egna: envelopens längd, `downswingSec`, exkursion (`addressY − apexY`),
`peakSpeed / refSpeed`, synlighet, burstens längd och impact-utfallet. Tre mått är **härledda**
ur samma data utan nya trösklar:

- `finishDrop = finishY − apexY`, alltså hur mycket lägre händerna står vid finish än vid
  envelopens högsta punkt.
- `addrHold` och `finishHold` = antal sekunder i följd före start respektive efter finish där
  envelopens egen hastighetsserie ligger under segmenterarens `quietThreshold`. Serien är
  segmentet, så värdena är kapade vid segmentets kant.

## 1. De falska, en och en

Tid = envelope-start i filens tidsbas. "Närmaste slag" räknas mellan envelope-starter i samma
klipp enligt Eriks svar (+ betyder att slaget kommer efter). Inget av de tio har ett slag före sig.

| id | svar | klipp | tid s | sträckt | närmaste slag | env s | impact | ds s | exkursion | finishDrop | peak/ref | burst s | synl. | addrHold | finishHold |
|---|---|---|---:|:-:|---:|---:|:-:|---:|---:|---:|---:|---:|---:|---:|---:|
| P45-035 | provsving | IMG_1558 | 45,07 | | inget | 2,47 | ja | 0,40 | 0,176 | 0,119 | 2,25 | 3,53 | 0,87 | 0,47 | 0,00 |
| P45-066 | provsving | IMG_3597 | 21,53 | ja | +24,9 | 6,00* | ja | 2,13* | 0,122 | 0,101 | 1,12 | 6,33* | 1,00 | 0,00 | 0,00 |
| P45-029 | ingen sving | IMG_3656 | 1,33 | | +21,6 | 2,00 | nej¹ | — | **0,585** | 0,143 | 1,15 | 2,13 | **0,61** | 0,53 | 0,00 |
| P45-052 | provsving | IMG_4962 | 8,40 | | inget | 1,40 | ja | 0,40 | 0,159 | 0,005 | 1,46 | 2,13 | 1,00 | 0,40 | 0,07 |
| P45-012 | provsving | IMG_4979 | 0,53 | | +5,9 | 1,47 | ja | 0,33 | 0,247 | 0,000 | 1,02 | 2,27 | 0,93 | 0,47 | 0,07 |
| P45-051 | provsving | IMG_4986 | 1,67 | | +8,3 | 2,07 | ja | 0,33 | 0,190 | 0,148 | 1,32 | 2,13 | 0,84 | 0,47 | 0,00 |
| P45-050 | provsving | IMG_5056 | 4,45 | | inget | 1,59 | nej² | — | 0,263 | 0,014 | 1,33 | 2,52 | 0,96 | 0,46 | 0,00 |
| P45-039 | provsving | IMG_5106 | 2,00 | | +5,8 | 1,40 | ja | 0,33 | 0,193 | 0,000 | 1,30 | 2,27 | 1,00 | 0,47 | 0,13 |
| P45-027 | provsving | IMG_5269 | 0,27 | | +5,9 | 2,47 | ja | 0,33 | 0,114 | 0,103 | 1,12 | 2,80 | 0,96 | 0,27 | 0,00 |
| P45-057 | provsving | juli132025-1134fm | 0,54 | | inget | 2,21 | ja | 0,33 | 0,215 | 0,177 | 1,20 | 2,21 | 0,89 | 0,47 | 0,00 |

\* Sträckt Slo-Mo: tiderna är i filens tid, inte verklig tid.
¹ `insufficient vertical excursion (no real backswing top)`. ² `wrists never returned within 0.07 of
address (nearest 0.078; no impact)`.

**Mönster i placeringen.** Fyra provsvingar ligger 5,8–8,3 s före ett slag i samma klipp. Det är
rutinen "provsving, ställ upp, slå". Fyra är ensamma i sitt klipp (inget slag i klippet alls), och
3597 ligger 25 s före sitt slag. P45-029 ("ingen sving") har den största exkursionen i hela
materialet (0,585) och den lägsta synligheten. Den ser ut som en annan rörelse, till exempel att
greppa eller lyfta klubban, och inte som en provsving.

## 2. Samma mått, falska mot slag

Realtidsklipp (9 falska / 65 slag). De sträckta (1 / 6) har varaktigheter i en annan tidsbas och är
borttagna här. "Slag i de falskas spann" = antal slag vars värde ligger inom [min, max] för de falska.

| mått | falska min / median / max | slag p10 / median / p90 | slag i de falskas spann |
|---|---|---|---:|
| exkursion | 0,114 / 0,193 / 0,585 | 0,157 / 0,195 / 0,304 | 64/65 |
| peak / refSpeed | 1,02 / 1,30 / 2,25 | 1,19 / 1,35 / 1,85 | 65/65 |
| synlighet | 0,61 / 0,93 / 1,00 | 0,89 / 1,00 / 1,00 | 65/65 |
| ds s (när impact finns) | 0,33 / 0,33 / 0,40 | 0,27 / 0,33 / 0,40 | 23/59 |
| addrHold s | 0,27 / 0,47 / 0,53 | 0,40 / 0,47 / 0,53 | 49/65 |
| burst s | 2,13 / 2,27 / 3,53 | 1,46 / 2,87 / 4,79 | 32/65 |
| finishHold s | 0,00 / 0,00 / 0,13 | 0,00 / 0,13 / 0,40 | 36/65 |
| **env s** | 1,40 / 2,00 / 2,47 | 1,27 / 1,33 / 1,80 | 28/65 |
| **finishDrop** | 0,000 / 0,103 / 0,177 | 0,000 / 0,003 / 0,041 | 64/65 |

Impact hittad: falska 8/10, slag 65/71. Sträckta: falska 1/10, slag 6/71. Ingen skillnad.

**Exkursion, toppfart, synlighet, nedsving, impact och adresshållning skiljer inte åt.** Det är
precis de mått grinden står på. Det bekräftar S-44:s påstående med data: en provsving har samma
struktur som ett slag.

### Kandidatsignaler (högst tre)

**1. Finish under toppen / lång envelope (en signal, inte två).** Sorterat på `finishDrop` har fem
falska ≥ 0,10 (1558, 3656, 4986, 5269, juli132025, plus sträckta 3597 på 0,101). Bland slagen
ligger sex på ≥ 0,089 (5186 0,403, 3641, 5246, 4986, 3656, 5269). Samma fem realtidsfalska är
också de med envelope ≥ 2,0 s, och fem slag ligger där (r = 0,67 mellan måtten bland
realtidssvingarna). Mekaniskt rimligt: en provsving har ofta en kortare genomsving, så envelopen
fortsätter efter den högsta punkten och "finishen" hamnar lägre.
**Två allvarliga invändningar.** (a) Tre av de sex slagen (4986, 3656, 5269) kommer ur *samma klipp*
som en falsk med högt värde. Signalen kan lika gärna mäta kameravinkel, person eller avstånd som
svingtyp. (b) De andra fem falska (4962, 4979, 5056, 5106 och i praktiken 3597) har `finishDrop`
≈ 0 och envelope 1,40–1,59 s, mitt bland slagen. Hälften av de falska ligger alltså helt utom
räckhåll för signalen.

**2. Placering i sekvensen.** Alla tio falska är först i sitt klipp, men det är 49 av 71 slag också.
"En till sving inom 12 s efter" gäller 4 av 10 falska och 13 av 71 slag. Det är dessutom en
artefakt av hur klippen spelats in. I en livesession finns inga klippgränser, och beslutet skulle
behöva vänta på nästa sving. Svag och sen.

**3. Ingen hållen finish (`finishHold`).** Alla falska ligger ≤ 0,13 s, men det gör 36 av 65 slag
också. Signalen är ensidig: en hållen finish > 0,13 s talar för slag (29 av 65 slag, 0 falska), men
avsaknad av den säger ingenting. Den duger inte för att avvisa.

**Vad som krävs för att pröva dem oberoende.** Ett nytt, blint facit på klipp som inte ingår här,
och som helst inte är Eriks egna eller i varje fall är filmade med en annan vinkel eller miljö. Det
ska ha minst ~30 provsvingar, så att en andel på 50 % får ett konfidensintervall smalare än
±18 punkter. Det ska också ha **par inom samma klipp** (provsving + slag med samma kamera), så att
kandidat 1 kan prövas mot klippsammanblandningen. Signalen och den eventuella gränsen ska frysas
innan facit öppnas. Här valdes ingen, och inget värde ovan ska läsas som en tröskel.

## 3. Bollen som signal

**Finns den i kedjan?** Bilderna finns, detektionen gör det inte:

- `selectEnvelopeFrames` lägger alltid en bildruta på envelope-start (adress, bollen ligger kvar)
  och en på finish (bollen borta efter ett slag). Båda skickas till Vision bland de 32
  (`ANALYSIS_FRAME_COUNT`).
- `poseCropBox` förlänger beskärningen `GROUND_MARGIN_FRAC = 0.08` × boxhöjd under fötterna,
  uttryckligen "for the ball position and the turf". Bollen ligger alltså i bild i det som skickas.
- Vision-prompten (`prompt.ts`) frågar inte efter bollen. Skaftdetektorn (`shaft-v2.onnx`) har
  ingen bollklass. Den ger hosel, och vid adress ligger bollen intill klubbhuvudet. Detektorn är
  lazy-laddad och inte i produktionens analysväg (se S-47).
- Livevägen (`liveSwingDetector` → `detectSessionSwings`) är den väg där en provsving faktiskt blir
  ett Vision-anrop. Produktionens uppladdning kör inte segmenteraren.

**Vad en bolldetektion skulle kosta (inget byggt):**

| väg | sparar Vision-anropet? | kostnad | risk |
|---|:-:|---|---|
| **A. Fråga Vision** (ett fält till i svaret, t.ex. boll synlig vid adress / borta vid finish) | nej | prompt + schema + tester. Inga nya bildrutor, några utdata-tokens per sving | förvirringen försvinner (svaret kan säga "provsving"), men kostnaden är redan betald |
| **B. Lokal pixeljämförelse** adress mot finish i en ROI framför fötterna (pose-ankare) | ja | två redan avkodade bildrutor, försumbar CPU. Behöver en ROI-regel och ett facit | bollen är ~10–20 px i beskärningen. Bakifrån skymmer klubbhuvudet bollen vid adress. På matta eller range ligger andra bollar i bild. En ny boll läggs upp, skuggor, tee |
| **C. Lära skaftmodellen en bollklass** | ja | annotering av boll i befintliga batcher, omträning. Modellen är 12 MB + ~40 MB runtime och ännu inte i produktionsvägen (S-47) | störst insats. Ärver alla hostingfrågor |

A är billigast och den enda som kan prövas mot exakt detta facit utan ny annotering. Men den löser
ADR-003 Risker §4:s *förvirring*, inte dess *kostnad*.

## Rekommendation

**Bygg ingen grind nu. Låt S-45 vila som känd begränsning tills livevägen har riktiga sessioner.**
Motivering:

1. **Kostnaden är liten och avgränsad.** En falsk positiv kostar ett Vision-anrop: 32 bildrutor à
   ~220 tokens, alltså ~7 000 input-tokens. Med 12 % falska blir det ungefär ett extra anrop per
   åtta. Det är inte bollplock (ADR-003 Risker §4:s egentliga exempel, som grinden redan fäller på
   exkursion). En provsving är en riktig sving som får en riktig analys.
2. **Det vi har kan inte bära en grind.** Den enda strukturella kandidaten tar hälften, är
   klippsammanblandad och skulle fälla ~8 % av slagen. Risker §4 säger "hellre missa en sving",
   men det gäller svingar som inte är svingar, inte att offra var tolfte riktig sving för att spara
   en provsving.
3. **Siffran gäller Eriks inspelningsvanor, inte användarens session.** Klippen är korta och ofta
   startade just före en rutin. I en lång livesession på rangen kan andelen vara en helt annan.

**Om förvirringen visar sig vara verklig** (användare som undrar varför en provsving fick en
analys): ta väg A. Den kostar minst och förklarar sig själv. Väg B prövas först om kostnaden blir ett
problem, och då mot ett nytt facit enligt avsnitt 2.

## Filer

| repo (`docs/shaft/practice-review/`) | gitignorerat (`data/shaft/practice-review/`) |
|---|---|
| `measure_swings.cjs`: kedjan + grindens mått | `measures.json`, `measure.log` |
| `score.py`: koppling + tabeller | `scored.json` (en rad per sving) |

```sh
node docs/shaft/practice-review/measure_swings.cjs data/shaft/clips/own data/shaft/practice-review/measures.json
python -X utf8 docs/shaft/practice-review/score.py data/shaft/practice-review
```
