# Resultat av fasgranskningen

> 32 bildrutor bedömda för hand av Erik i [review.md](review.md) (frö `0xfa5ec0de`), stämda
> mot [facit.md](facit.md). Sammanställd 2026-09-18. **Ingen produktionskod är rörd och ingen
> fix föreslås** — `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen,
> `plausibility.ts` och `derived.ts` är orörda. Metoden står i [README.md](README.md).

## 1. Rad för rad

`facit` är den fas raden bar innan bedömningen: för **kandidater** härledd ur manifestet
(`derivePhase` → `FALLBACK_BOUNDS` när `impactSec` saknas), för **kontroller** satt för hand
av en annotatör. `★` är Eriks egen markering (klubbhuvudet hänger mer i nästa bild).

| # | frame-id | Eriks svar | facit | källa | rad | utfall | ★ |
|---:|---|---|---|---|---|---|---|
| 1 | `057-1d1b5748_s00_f02` | downswing | `top` | manifest | kandidat | **fel fas** | |
| 2 | `047-4d3e3909_s00_f01` | osäker | `top` | manifest | kandidat | osäker (ingen motivering) | |
| 3 | `img-5412-a7756984_s00_f03` | downswing | `downswing` | annotation | kontroll | **träff** | |
| 4 | `img-5269-3e863a76_s01_f01` | top | `top` | annotation | kontroll | **träff** | |
| 5 | `img-4658-a2f26279_s00_f04` | finish | `finish` | annotation | kontroll | **träff** | |
| 6 | `img-5410-e9b74b96_s02_f01` | backswing | `top` | manifest | kandidat | **fel fas** | |
| 7 | `089-51f5ef4b_s00_f02` | finish | `top` | manifest | kandidat | **fel fas** | |
| 8 | `att-9izx…-24285b6a_s00_f01` | osäker | `top` | manifest | kandidat | rätt fas, oklar bildruta | |
| 9 | `img-5408-3c48779f_s00_f01` | top | `top` | annotation | kontroll | **träff** | |
| 10 | `img-4962-9ed639e7_s00_f02` | backswing | `top` | manifest | kandidat | **fel fas** | |
| 11 | `028-4f3f90e8_s00_f06` | finish | `finish` | annotation | kontroll | **träff** | |
| 12 | `073-bd53202e_s01_f01` | backswing\* | `top` | manifest | kandidat | **fel fas** | ★ |
| 13 | `img-5423-b345d01e_s01_f01` | top | `top` | manifest | kandidat | rätt fas | |
| 14 | `img-5384-acea6a74_s00_f02` | top | `top` | manifest | kandidat | rätt fas | |
| 15 | `095-b6402f36_s00_f01` | finish | `top` | manifest | kandidat | **fel fas** | |
| 16 | `093-2c11c3c0_s00_f02` | backswing\* | `top` | manifest | kandidat | **fel fas** | ★ |
| 17 | `img-5417-87102d79_s00_f02` | osäker | `top` | manifest | kandidat | rätt fas, oklar bildruta | |
| 18 | `031-eda42b98_s00_f05` | osäker | `top` | annotation | kontroll | osäker | |
| 19 | `009-1617ed23_s00_f01` | downswing | `top` | manifest | kandidat | **fel fas** | |
| 20 | `img-5407-1eb975b8_s00_f01` | backswing\* | `top` | manifest | kandidat | **fel fas** | ★ |
| 21 | `054-0d1b3ff3_s00_f00` | osäker | `backswing` | annotation | kontroll | osäker | |
| 22 | `img-4979-bd8e32e5_s00_f01` | top | `top` | manifest | kandidat | rätt fas | |
| 23 | `img-4979-bd8e32e5_s01_f02` | backswing\* | `top` | manifest | kandidat | **fel fas** | ★ |
| 24 | `img-5356-08a7c9cb_s00_f02` | top | `top` | manifest | kandidat | rätt fas | |
| 25 | `img-5425-f0abd4a8_s00_f04` | downswing | `downswing` | annotation | kontroll | **träff** | |
| 26 | `img-3641-adde195e_s00_f02` | finish | `top` | manifest | kandidat | **fel fas** | |
| 27 | `img-5186-586918f4_s00_f03` | osäker | `top` | annotation | kontroll | osäker | |
| 28 | `061-f51f439d_s00_f01` | top | `top` | manifest | kandidat | rätt fas | |
| 29 | `055-c5e9ec1a_s00_f01` | backswing | `backswing` | annotation | kontroll | **träff** | |
| 30 | `045-224bdedb_s00_f01` | top | `top` | manifest | kandidat | rätt fas | |
| 31 | `093-2c11c3c0_s01_f01` | backswing\* | `top` | manifest | kandidat | **fel fas** | ★ |
| 32 | `068-db6f6eec_s00_f02` | backswing\* | `top` | manifest | kandidat | **fel fas** | ★ |

Fritexten är utelämnad här för att tabellen ska gå att läsa; den står **ordagrant** i
[review.md](review.md) och är vad hinkindelningen i §3 vilar på.

## 2. Kontrollerna först — mätfelet i allt annat

De tio kontrollerna har en fas som en människa satt, och Eriks träffsäkerhet på dem är
felmarginalen i varje siffra längre ned. **Den är hög.**

| | Antal |
|---|---:|
| Träff (Eriks svar = annotatörens fas) | **7 av 10** |
| **Miss** | **0** |
| Osäker (inget svar om fasen) | 3 |

**Noll missar.** Varje gång Erik kallade en kontroll var han ense med annotatören, på fyra
olika faser (2 × `downswing`, 2 × `finish`, 2 × `top`, 1 × `backswing`). De tre `osäker`
ligger på rader där hans egen fritext säger varför: rad 18 (*"både före, bilden och den efter
är så gott som identiska"*), rad 27 (*"efter-bilden har flyttat kameravinkel bort från
golfaren"*) och rad 21, som är **första** bildrutan i sin sving och därför saknar
`före`-bild helt.

**Uppdelat på hur stark kontrollens egen fas är:**

| Kontrollgrupp | Träff | Miss | Osäker |
|---|---:|---:|---:|
| Sex dubbelannoterade och eniga (batch-01 v1 + v2) | 4 | **0** | 2 |
| Fyra enpass (batch-02) | 3 | **0** | 1 |

Samma bild i båda grupperna, så resultatet hänger inte på vilken delmängd man väljer.

**Den invändning det här avfärdar.** Den naturliga misstanken mot §3 är att Erik helt enkelt
är obenägen att säga `top`, och att felfrekvensen bland kandidaterna därför mäter honom och
inte etiketten. **Kontrollerna säger emot det.** Fyra av de tio bär `top` som annoterad fas;
på dem svarade han `top` två gånger och `osäker` två gånger — och **aldrig något annat**. Han
kallar alltså toppar när de är där, och avstår hellre än gissar. Motsvarande tal för
kandidaterna är `top` på 6 av 22.

**Slutsats om mätfelet:** det är litet nog att bära resten av rapporten. Hade kontrollerna
gått 5/10 eller sämre hade §3–§5 inte varit värda att läsa; det är de nu.

## 3. De 22 kandidaterna — tre hinkar, inte hopslagna

| Hink | Antal | Andel | Rader |
|---|---:|---:|---|
| **Rätt fas** (Erik säger `top`) | **6** | 27 % | 13, 14, 22, 24, 28, 30 |
| **Fel fas** (annat än `top`, annat än `osäker`) | **13** | **59 %** | 1, 6, 7, 10, 12, 15, 16, 19, 20, 23, 26, 31, 32 |
| **Rätt fas, oklar bildruta** (`osäker`, fritexten säger att bildrutan **och** grannen båda visar toppen) | **2** | 9 % | 8, 17 |
| *Rest: `osäker` utan motivering* | *1* | *5 %* | *2* |

**Den fjärde raden är en rest, inte en fjärde hink.** Rad 2 är `osäker` utan fritext och
uppfyller därför varken definitionen av *fel fas* (som kräver ett annat fasnamn) eller av
*rätt fas, oklar bildruta* (som kräver fritexten om att båda bildrutorna visar toppen). Den
redovisas för sig i stället för att pressas in i en hink den inte tillhör; ingen siffra ovan
innehåller den.

**Hink 3 är ingen feletikett, och slås inte ihop med något.** På rad 8 och 17 säger Erik att
bildrutan *och* nästa bildruta båda visar toppen — etiketten `top` är alltså **försvarbar på
bildrutan**, det som inte går att avgöra är vilken av två bildrutor som är *den* toppen. Det
är en annan sorts osäkerhet än ett fel, och `topFrameIndex` hade inte räknat fel på dem.

**Felfrekvensen är alltså 13 av 22 = 59 %**, med 6 (27 %) bekräftat rätt, 2 (9 %) rätt men
odifferentierbara mot grannen, och 1 (5 %) oavgjord. Räknar man hink 1 och hink 3 tillsammans
som "etiketten är inte motbevisad" blir det 8 av 22 = 36 %.

**Åt vilket håll felen pekar** — inte efterfrågat, men det ligger i svaren och det ändrar
tolkningen:

| Feletikett | Antal | Betyder |
|---|---:|---|
| `backswing` | 8 | etiketten ligger **för tidigt** — klubban har inte vänt än |
| `downswing` | 2 | etiketten ligger **för sent** |
| `finish` | 3 | etiketten ligger **långt för sent** |

Felet är alltså inte en enkelriktad förskjutning: 8 rader för tidiga, 5 för sena. Vilket håll
det blir visar sig hänga på `impactSec` — se §4.

## 4. Slumpmässigt eller systematiskt?

### `impactSec` — det enda starka sambandet

| | n | rätt fas | fel fas | rätt fas, oklar | osäker |
|---|---:|---:|---:|---:|---:|
| `impactSec` **saknas** | 5 | 0 | **5** | 0 | 0 |
| `impactSec` fanns | 17 | 6 | 8 | 2 | 1 |

**Alla fem rader utan `impactSec` är fel fas.** Sannolikheten att fem slumpvis valda av de 22
alla hamnar i fel-fas-hinken är C(13,5)/C(22,5) = **0,049** — det är ett samband som syns,
men det står på fem rader och ska läsas som en riktning, inte som en mätt effektstorlek.

**Och alla fem ligger på exakt samma envelope-andel: 0,484.** Det är inte ett sammanträffande
utan konstruktionen: utan mätt nedslag faller `derivePhase` på `FALLBACK_BOUNDS`, vars
`top`-fönster är 0,45–0,52, och envelope-urvalet lägger sin bildruta i samma fasta position
varje gång. Etiketten `top` betyder där ordagrant *"48,4 % in i envelopen"* och ingenting
annat. Fem av fem sådana rader var fel.

### Felets riktning hänger på `impactSec`

| | för tidig (`backswing`) | för sen (`downswing`/`finish`) |
|---|---:|---:|
| Fel fas **med** `impactSec` (n = 8) | **7** | 1 |
| Fel fas **utan** `impactSec` (n = 5) | 1 | **4** |

Två olika fel från två olika kodvägar: med ett mätt nedslag landar etiketten **för tidigt**,
utan det landar den **för sent**. Ensidigt hypergeometriskt p ≈ **0,032**. Sambandet vilar på
13 rader och är det mest användbara fyndet i omgången, men det är inte mer än en riktning.

### Envelope-proportion (bara rader med `impactSec`, där den varierar)

| Envelope-andel | n | rätt fas | fel fas | rätt fas, oklar | osäker |
|---|---:|---:|---:|---:|---:|
| 0,278–0,334 | 6 | **0** | **5** | 1 | 0 |
| 0,377–0,445 | 7 | 3 | 3 | 0 | 1 |
| 0,500–0,556 | 4 | 3 | **0** | 1 | 0 |

Monotont och i den riktning man väntar sig: ju tidigare i envelopen bildrutan ligger, desto
oftare säger ögat att klubban inte vänt än.

**Skarpt uttryckt — och påståendet gäller bara de 17 raderna med `impactSec`:** varje
fel-fas-rad i den delmängden ligger på **≤ 0,444**, och varje rad på **≥ 0,500** är något
annat än fel fas. Gränsen faller alltså i glappet 0,444–0,500, och glappet är tomt: det är
frånvaron av data, inte en tröskel. Den låga änden är inte heller ren — rad 8 på 0,278 ligger
i hink 3 och är alltså **ingen** feletikett, så "under 0,335 finns ingen rätt fas" gäller hink
1 och inte hink 3.

**Och utanför delmängden håller det inte.** De fem raderna utan `impactSec` ligger alla på
**0,484** — över 0,46, mitt i glappet — och är fel rakt igenom. Monotoniciteten är alltså en
egenskap hos den impact-ankrade vägen, inte hos envelope-andelen som sådan; fallback-raderna
motsäger den. Sambandet är tydligt inom sitt scope men n är 4–7 per hink — det pekar ut var
man ska titta, det bär ingen tröskel.

### Källklipp

De 22 kandidaterna kommer ur **20 distinkta källklipp**; bara två klipp bidrar med mer än en
rad (`093-2c11c3c0`: båda fel fas — och det är det spegelvända klippet från S-22; `img-4979-bd8e32e5`:
en rätt, en fel). **n är för litet.** Med i snitt 1,1 rader per klipp finns det ingenting att
korstabulera mot, och de två klipp som har två rader svarar dessutom olika. Ingen hypotes
formuleras.

### Klipplängd

**Mätbar för 11 av 22** — de `own`-klipp som inte ligger i repot har ingen längd, och de 11
mätbara är exakt `web`-halvan, alltså helt sammanblandad med källvariabeln. På de 11 finns
inget mönster: fel fas spänner 2,13–41,34 s, och de två rätta ligger på 5,70 s och 31,60 s,
i var sin ände. **n är för litet och variabeln är konfunderad.** Ingen hypotes.

### fps

Kandidaterna bär bara två värden, 30,00 (9 rader) och 29,94 (2 rader), och 11 rader saknar
värde. De två 29,94-raderna går åt var sitt håll (rad 7 fel, rad 30 rätt). **Ingen varians att
testa mot** — frågan kan inte besvaras på det här underlaget.

### DTL / face-on

**Kan inte testas: alla 32 rader är `dtl` per konstruktion.** Urvalet krävde vy-bucket `dtl`
för både kandidater och kontroller (se [README.md](README.md) → *Urvalet*), så variabeln har
noll varians i den här omgången.

### web / eget material

| | n | rätt fas | fel fas | rätt fas, oklar | osäker |
|---|---:|---:|---:|---:|---:|
| `web` | 11 | 2 | 8 | 0 | 1 |
| `own` (eget) | 11 | 4 | 5 | 2 | 0 |

73 % fel på `web` mot 45 % på eget ser ut som ett samband, **men det är sannolikt `impactSec`
som talar:** 4 av de 5 raderna utan `impactSec` är `web`. Med 11 rader per grupp går de två
variablerna inte att separera. **n för litet — ingen slutsats.**

### En kolumn utanför de efterfrågade

Manifestets `gate` delar materialet skarpare än något annat: de 5 kandidater som gick in på
`dataset-relaxed` (rad 7, 12, 15, 16, 19) är **alla fel fas**, och slår man ihop dem med
raderna utan `impactSec` blir det **7 av 7 fel**. Det redovisas här därför att det syns, med
reservationen att det är den starkaste av ett halvdussin prövade uppdelningar på 22 rader —
den bästa av flera delningar är alltid renare än den förtjänar. Ingen slutsats dras på den.

## 5. Stjärnraderna — klubbhuvudets hängning som signal

Sex rader bär Eriks markering: **12, 16, 20, 23, 31, 32**. Hans avläsning är att kroppen står
still mellan bildrutan och nästa, men att **klubbhuvudet hänger mer i nästa bild**, alltså att
toppen ligger en bildruta senare än etiketten.

**Frågan "hur många av dem är faktiskt `backswing` enligt facit?" har ett svar som inte betyder
något: noll.** Alla sex är **kandidater**, och facit för varje kandidatrad är `top` ur
manifestet — precis den etikett omgången prövar. Att stämma stjärnraderna mot facit är att
stämma dem mot det som misstänks vara fel. **Ingen stjärnrad är en kontroll**, så det finns
ingen oberoende annoterad fas att pröva avläsningen mot, och omgången **kan inte avgöra om den
stämmer**. Det är en egenskap hos urvalet, inte hos avläsningen.

Vad som ändå går att säga, och som pekar åt rätt håll:

- **Fem av sex stjärnrader ligger på envelope-andel ≤ 0,444** (0,333, 0,333, 0,334, 0,389,
  0,444; den sjätte är 0,484 och är en av fallback-raderna). De ligger alltså i det spann där
  ingen rad med `impactSec` hamnade i hink 1: av de sex raderna under 0,335 är fem fel fas och
  den sjätte (rad 8) ligger i hink 3. Avläsningen hamnar alltså i samma del av materialet som
  den oberoende envelope-analysen i §4 pekar ut.
- **Samma observation görs en gång till utan stjärna:** rad 6 bär i fritext *"man ser lite på
  klubbhuvudet att efter-bilden är absoluta toppen"* utan att Erik satte stjärna på den. Sju
  rader använder alltså samma kriterium.
- Erik använde kriteriet **bara** på kandidatrader och aldrig på en kontroll — vilket är
  konsistent med att kontrollerna inte låg nära toppen på det sättet, men det är en
  efterhandsobservation och inget bevis.

**För en framtida observationsbaserad fasdetektor** är det här en hypotes värd att pröva, inte
ett resultat: *klubbhuvudets höjd/hängning skiljer två bildrutor som kroppspositionen inte
skiljer.* Att pröva den kräver bildrutor med **annoterad** fas där samma kriterium kan appliceras
blint — alltså en kontrollrik omgång, inte den här.

## 6. Slutsats

**Det är illa: 13 av 22 bildrutor som `topFrameIndex` faktiskt räknar på visar inte toppen —
59 %, mot 6 (27 %) bekräftat rätt och 2 (9 %) rätt men odifferentierbara mot grannbildrutan.**
Siffran bär, för granskaren gick 7 rätt och **0 fel** på de tio kontrollerna och svarade `top`
korrekt när en annoterad topp låg framför honom, så det här mäter etiketten och inte ögat.
**Felet är systematiskt, inte slumpmässigt, och det har två olika ansikten:** utan `impactSec`
landar etiketten *för sent* (5 av 5 fel, alla på exakt envelope-andel 0,484, alltså rena
`FALLBACK_BOUNDS`-rader), med `impactSec` landar den *för tidigt* (7 av 8 fel är `backswing`,
och varje fel-fas-rad i den delmängden ligger på envelope-andel ≤ 0,444 medan varje rad ≥ 0,500
är något annat än fel) — men den monotoniciteten gäller **bara** den impact-ankrade
delmängden, för fallback-radernas 0,484 ligger ovanför gränsen och är ändå fel rakt igenom.
Källklipp, klipplängd, fps och DTL/face-on säger **ingenting** i det här underlaget — de tre
första för att n är för litet eller variabeln konfunderad, den sista för att alla 32 rader är
`dtl` per konstruktion. Kvar står att `usable`-flaggan på `top-shaft-orientation` i dag kan
sitta på ett värde räknat på fel ögonblick i ungefär tre fall av fem, och att det inte är en
brist i `derived.ts` utan i vad ordet `top` betyder när det sätts.

## 7. Blast radius — hur många bildrutor i hela datasetet som står på samma etikett

> **Det här avsnittet mäter populationen, inte felfrekvensen.** §1–§6 bygger på 22 bedömda
> bildrutor; talen nedan säger hur många bildrutor som står på *samma sorts* etikett och
> alltså kan bära samma fel. Ingen av dem är bedömd. Räknat med
> `data/shaft/exports/*/manifest.json` (envelope-urvalets egen utdata) och
> `data/shaft/training/batch-*/batch.zip`; vyn är unionerad per sving ur CVAT-exporterna,
> exakt som `prelabel_batch.py` gör.

### Bildrutenivå

| | Exportpoolen | Träningsbatcherna |
|---|---:|---:|
| Bildrutor totalt | **1 435** | **650** |
| Saknar `impactSec` | **280** (19,5 %) | **135** (20,8 %) |
| … varav `phase: top` ur manifestet | **32** | **23** |
| … varav envelope-andel i `FALLBACK_BOUNDS` toppfönster **[0,45, 0,52)** | **32** | **23** |
| `phase: top` totalt (med och utan nedslag) | 144 | 85 |
| … andel av alla `top` som är fallback-härledda | **22,2 %** | **27,1 %** |

**De två sista fallback-talen är identiska, och det är ingen slump.** Mängden "saknar
`impactSec` **och** bär `top`" och mängden "saknar `impactSec` **och** ligger i 0,45–0,52" är
**samma 32 bildrutor** (23 i batcherna) — inte bara lika stora. Det är `derivePhase` som säger
det: utan nedslag *är* `top` definitionsmässigt fönstret och ingenting annat. Kontroll på
köpet: `impactSec === null` sammanfaller exakt med `hasConfidentImpact === false` (280 mot
280, 135 mot 135), så de två fälten säger samma sak i hela datasetet.

### Svingnivå — enheten ett mätvärde faktiskt räknas på

Ett mätvärde beräknas per **sving**, inte per bildruta, så det här är talet som betyder något
för spridningen:

| | Svingar |
|---|---:|
| Svingar totalt (exportpoolen) | **205** |
| Utan `impactSec` över huvud taget | 40 |
| Med minst en `phase: top`-bildruta | **140** |
| … toppetiketten ur `FALLBACK_BOUNDS` | **32** (23 %) |
| … toppetiketten ankrad i ett mätt nedslag | 108 (77 %) |

### dtl mot face-on — och varför face-on är **omätt**, inte "samma"

Bildrutenivå, exportpoolen (vyn är känd för 204 av 205 svingar, så täckningen är nästan total):

| Vy | Bildrutor | Utan `impactSec` | … därav `top` | … i fönstret | `top` totalt |
|---|---:|---:|---:|---:|---:|
| `dtl` | 1 253 | 238 | **28** | 28 | 129 |
| `face_on` | 168 | 35 | **3** | 3 | 13 |
| `övrig` | 7 | 7 | 1 | 1 | 1 |
| `okänd` | 7 | 0 | 0 | 0 | 1 |

Svingnivå: `dtl` 179 svingar (125 med `top`, varav **28 ur fallback**), `face_on` 24 svingar
(13 med `top`, varav **3 ur fallback**).

**Felfrekvensen för face-on är omätt.** Revisionen i §1–§6 är **100 % `dtl` per konstruktion** —
urvalet krävde vy-bucket `dtl` för både kandidater och kontroller — så **noll** face-on-bildrutor
har bedömts av någon. De 3 face-on-bildrutorna ovan är alltså *exponering*, inte *fel*: att
skriva "samma 59 %" för dem vore att hitta på ett tal. Vad som skulle krävas är en egen omgång
med face-on-bildrutor, och den finns inte.

**En sak talar ändå emot att face-on är exponerat via `topFrameIndex`:** båda de mätvärden som
ankrar där deklarerar `cameraAngle: 'dtl'`, och `cameraGate` **förkastar** en annan vinkel
(`angle !== want` → `rejected`) *innan* fasen läses. Face-on når alltså aldrig fram till
`topFrameIndex`. Den vägen in är i stället `shaft-angle-by-phase` — se nedan.

### Vad som är förankrat i `topFrameIndex`

**Två av sex** härledda mätvärden i `src/lib/shaft/measure/derived.ts`:

| Mätvärde | Hur `top` används | `cameraAngle` |
|---|---|---|
| **`shaft-position-p4`** | `topFrameIndex(checked)` — hela mätvärdet är den bildrutan | `dtl` |
| **`top-shaft-orientation`** | `topFrameIndex(checked)` — hela mätvärdet är den bildrutan | `dtl` |

Båda avvisar en icke-`dtl`-vinkel i `cameraGate` och flaggar okänd vinkel som `uncertain`.
Saknas `top` helt returnerar de `reject(…, 'phase-missing')`.

**Ett tredje mätvärde läser fasen `top` utan att gå via `topFrameIndex`:**

| Mätvärde | Hur `top` används | `cameraAngle` |
|---|---|---|
| `shaft-angle-by-phase` | en hink **per fas**, inklusive `top` — medianvinkel över alla `top`-bildrutor | **`any`** |

Det är den enda vägen där en fallback-satt `top` når en `face_on`-sving, eftersom kameragrinden
där släpper igenom allt. Hinken `top` i det mätvärdet bär alltså samma etikettproblem, men
utspätt: den tar medianen över *alla* `top`-bildrutor i svingen, inte den sista.

**De tre övriga rör inte `top`:** `shaft-position-p2` filtrerar på `backswing`,
`swing-plane-tilt` på `backswing` + `downswing`, och `clubhead-path` går över alla användbara
bildrutor utan fasfilter.

### Hur stor del av populationen revisionen faktiskt tittade på

| Population (träningsbatcherna) | Antal | Bedömda i §1–§6 | Utfall bland de bedömda |
|---|---:|---:|---|
| `top` ur `FALLBACK_BOUNDS` (utan `impactSec`) | 23 | **5** | **5 fel fas av 5** |
| `top` ankrad i mätt nedslag | 62 | 17 | 8 fel fas av 17 |

De 22 bedömda raderna är alltså ett stickprov ur en population på 85 `top`-bildrutor i
batcherna — och 32 respektive 144 i hela exportpoolen. **Ingen extrapolering görs här:** talen
står bredvid varandra för att visa hur mycket som är omätt, inte för att räkna fram ett tal för
resten.

---

### Avvikelser som noterats, inte åtgärdats

**Rad 26, `img-3641-adde195e_s00_f02`.** Erik svarade `finish` och noterar att bildrutan är
**mer `through` än `finish`**, eftersom de två sista bildrutorna i svingen ligger efter
nedslaget. Svarslistan i review erbjöd varken `through` eller `follow`, så `finish` var
närmaste tillgängliga ord. **Ingen enum är ändrad.** Till protokollet, eftersom påståendet
att "schemats enum har `follow`, inte `through`" inte stämmer mot koden: `MeasurementPhase` /
`ShaftPhase` (`src/lib/shaft/measure/shaftSeries.ts`) har **`through` och `finish` som skilda
värden**, medan appens `SwingPhase` (`src/lib/frameExtractor.ts`) har **`follow-through`** som
ett enda värde och varken `through` eller `finish`. Ordet `follow` finns inte i någon av dem.
Raden räknas som **fel fas** oavsett vilket av `through` och `finish` som avses — båda ligger
efter nedslaget, och etiketten är `top`.

**Rad 6.** Samma observation som stjärnraderna bär (klubbhuvudet i nästa bild), men utan
stjärna. Den är räknad som **fel fas** enligt hinkdefinitionen och är **inte** medräknad i de
sex stjärnraderna i §5, eftersom stjärnan är Eriks markering och inte min tolkning.
