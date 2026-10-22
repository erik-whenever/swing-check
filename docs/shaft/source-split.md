# Källa: webbnedladdat mot eget material — bär det en mätbar skillnad i skaftdetektorns kvalitet?

Read-only diagnos, inga kodändringar, inga tröskeländringar. Kalibreringssetet
(`data/shaft/calibration/`, 100 bildrutor) återanvänds som det är, och det befintliga
utvärderingsskriptet `training/evaluate.py` (med `shaft_coco.py`) är importerat och
anropat **oförändrat** för all mätning — modellinferens, vinkelmatte, avståndsmatte och
`Bucket`-statistiken kommer alla ur den koden. Skriptet grupperar bara efter
`phase`/`view`/`blur`, inte `source`, så den här omgången lägger en egen
grupperings-/rapportlogik ovanpå de oförändrade primitiven i stället för att skriva ett
nytt mätskript. Analysskriptet själv är **inte** committat (instruktionen bad bara om den
här filen); siffrorna nedan går att reproducera genom att importera
`training/evaluate.py`s `evaluate()`, `Bucket`, `load_images` och `shaft_coco.py`s
`read_coco`/`parse_export`/`read_manifest` och gruppera `evaluate()`s returnerade `rows`
på `manifest[frame_id]["source"]`.

| | |
|---|---|
| Evalset | `data/shaft/calibration/calibration.zip`, 100 bildrutor |
| Facit (primär) | `erik.zip` — `evaluate.py`s eget förval |
| Facit (kontroll) | `lisa.zip` |
| Vikter | `public/models/shaft-v2.onnx` (se anmärkning 1) |
| `--imgsz` / `--conf` / `--kpt-conf` | 960 / 0,25 / 0,5 — `evaluate.py`s egna förval, orörda |
| Källfält | `manifest.json` → per bildruta `"source": "web" \| "own"` |

## 0. Anmärkningar och begränsningar — läs innan siffrorna

1. **`shaft-v3` finns inte på den här maskinen.** `training/runs/` är gitignorerat och
   tomt, och det finns ingen `shaft-v3.onnx` någonstans i repot (kontrollerat: bara
   `shaft-v1.onnx` och `shaft-v2.onnx` i `public/models/` och `dist/models/`). Det
   här är samma konstaterande som `datamodell.md` och flera `top-review`-rapporter
   redan gjort. Mätningen kör i stället **`shaft-v2.onnx`** — produktionens egen
   levererande modell (`src/lib/shaft/shaftDetector.ts` → `MODEL_FILE`). Ska frågan
   svaras för `shaft-v3` måste den köras om den dagen vikterna finns.
2. **Facit täcker inte alla 100 bildrutorna.** `erik.zip` har annoterat **97 av 100**,
   varav **1** är `no_shaft` (ingen skaft att mäta) — **96 mätta rader** kvar, **48
   web / 48 own**, inte manifestets 50/50. `lisa.zip` ger **97 mätta rader** (49 web /
   48 own). De saknade bildrutorna är uteslutna, inte gissade in.
3. **Alla 42 `own`-klippen saknas lokalt.** `data/shaft/clips/` har exakt de 42 `web`-
   klipp kalibreringssetet pekar på (0 saknade) och **0 av 42** `own`-klipp — bara de
   redan extraherade JPEG-bildrutorna finns kvar av dem. **fps och codec går därför
   bara att mäta för `web`**; för `own` sägs det rakt ut nedan i stället för att gissas
   fram ur en JPEG eller ett filnamn.
4. **Källan är läst ur `manifest.json`s `source`-fält**, aldrig ur filnamn. Filnamnens
   mönster (`IMG_*.MP4/.MOV` mot `att.*.mp4`) nämns i §5 som en enskild, tydligt
   markerad iakttagelse — inte som källbestämning, och inte som grund för någon siffra.
5. **n är litet genomgående**, och de betingade cellerna i §6 är mindre än de
   obetingade. Läs varje tal med sitt eget `n` och sin egen `k` (klipp) bredvid.

## 1. n bildrutor och n oberoende klipp

| Grupp | Rader (Erik-facit) | Klipp (Erik-facit) | Rader (Lisa-facit) | Klipp (Lisa-facit) |
|---|---:|---:|---:|---:|
| `web` | 48 | 41 | 49 | 42 |
| `own` | 48 | 40 | 48 | 40 |

Manifestets egen balansering är 50/50 bildrutor över 42/42 klipp (`docs/shaft/annotation-
spec.md`: *"`source` balanseras mot ungefär hälften `web`, hälften `own`"*) — tabellen
ovan är vad som faktiskt gick att mäta efter facit-bortfallet i §0.2.

## 2. Skaftvinkel — median och p90 (huvudsiffran)

`n` är antalet rader där **både** facit och modellen satte `butt` **och** `hosel`
(≥ `--kpt-conf`) — samma gate som `evaluate.py` använder överallt.

| Grupp | n (Erik) | k klipp | Median (Erik) | p90 (Erik) | n (Lisa) | Median (Lisa) | p90 (Lisa) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `web` | 32 | 27 | 1,50° | 6,67° | 31 | 1,40° | 5,04° |
| `own` | 39 | 33 | 1,01° | 3,60° | 38 | 0,86° | 3,07° |

**Riktningen är densamma mot bägge facit:** `own` ligger lägre än `web` på både median
och p90, och gapet på p90 (svansen) är större än på medianen i båda körningarna. Det
håller alltså inte bara mot en enda annotatörs urval.

## 3. `butt`/`hosel`-fel i %H

| Punkt | `web` n (Erik) | `web` median %H (Erik) | `own` n (Erik) | `own` median %H (Erik) | `web` median %H (Lisa) | `own` median %H (Lisa) |
|---|---:|---:|---:|---:|---:|---:|
| `butt` | 38 | 0,57 | 41 | 0,49 | 0,56 | **0,71** |
| `hosel` | 32 | 0,61 | 39 | 0,39 | 0,63 | 0,39 |

**`hosel` håller riktningen mot bägge facit** (`own` lägre fel än `web`, ~35–40 %
lägre). **`butt` gör det inte** — `own` är bättre mot Erik men **sämre** mot Lisa. Ingen
slutsats dras om `butt`; talet är motsägande med det underlag som finns.

## 4. Bortfall vid `--conf 0,25` (ingen detektion alls)

| Grupp | Erik-facit | Lisa-facit |
|---|---:|---:|
| `web` | 10/48 (21 %) | 11/49 (22 %) |
| `own` | 7/48 (15 %) | 7/48 (15 %) |

`own` tappar färre bildrutor helt än `web`, konsekvent mot båda facit. Se §6 för hur
mycket av det här som spårar `blur` snarare än `source`.

## 5. Bildegenskaper per källgrupp

### Vy (`dtl` / `face_on` / `other`)

| Grupp | `dtl` | `face_on` | `other` |
|---|---:|---:|---:|
| `web` (Erik-facit, n=48) | 45 | 2 | 1 |
| `own` (Erik-facit, n=48) | 40 | 8 | 0 |

`own` har **fler** `face_on`-bildrutor än `web` (17 % mot 4 %) — den vy `shaft-v2` gör
sämst ifrån sig på generellt (`training/README.md`: `face_on`-median 4,32° mot setets
totala 1,06°). `own` presterar ändå bättre totalt (§2), så skillnaden i §2 är **inte**
en artefakt av att `own` råkat få den lättare vyn — tvärtom.

### Fas

| Grupp | `top` | `address` | `downswing` | `backswing` | `through` | `finish` | `impact` |
|---|---:|---:|---:|---:|---:|---:|---:|
| `web` (n=48) | 20 | 13 | 4 | 3 | 3 | 4 | 1 |
| `own` (n=48) | 15 | 6 | 9 | 6 | 4 | 5 | 3 |

Fasfördelningen skiljer sig märkbart: `web` är tungt viktat mot `top` + `address`
(69 %), `own` är jämnare spridd. Ingen av de fem toppankrade mätvärdena i den här
uppgiften (skaftvinkel är en generell vinkel, inte toppens) är fasberoende på samma sätt
som `top-shaft-orientation`, men fördelningen redovisas som begärt.

### Blur — **den tydligaste konfundern**

| Grupp | `none` | `mild` | `severe` |
|---|---:|---:|---:|
| `web` (n=48) | 24 | 13 | 11 |
| `own` (n=48) | 42 | 6 | **0** |

**`own` har noll `severe`-bildrutor i det här urvalet.** `web` har 11 (23 %). Det här är
den konfunder som mest sannolikt förklarar en del av §2/§4:s gap — se §6 för det
betingade talet.

### Upplösning (mätt på de faktiska JPEG-bildrutorna, alla 100)

| Grupp | Vanligaste | Andel | Antal distinkta storlekar |
|---|---|---:|---:|
| `web` | 1080×1920 | 30/50 (60 %) | 13 |
| `own` | 720×1280 | 43/50 (86 %) | 5 |

`web` är brett spritt över upplösningar (Reddit-nedladdade klipp i olika kvaliteter och
beskärningar, t.ex. 720×818, 720×976, 1080×1824 — ovanliga proportioner som pekar på
plattformens egen paketering); `own` är nästan enhetligt en enda storlek. **Obs:**
`720×1280` är den bildruta appen extraherade, inte nödvändigtvis klippets ursprungliga
inspelningsupplösning — se §0.3, källvideorna för `own` finns inte kvar att jämföra mot.

### fps och codec — bara mätbart för `web`

| Grupp | Klipp mätta | fps | Codec (fourcc) |
|---|---:|---|---|
| `web` | 42/42 | 30,0 (median = min = max) | `h264`, 42/42 |
| `own` | **0/42** | **omätbart — filerna saknas** | **omätbart — filerna saknas** |

Ingen gissning görs på `own`s fps eller codec. **En enskild, tydligt märkt iakttagelse**
om filnamnsmönster (inte källbestämning — den kommer från `manifest.json` som redan
använts ovan): de 42 `own`-klippen i manifestet heter antingen `IMG_####.MP4/.MOV`
(Fotos-appens exportnamn) eller `att.<hash>.mp4` (typiskt för ett meddelandeprograms
bilagenamn, som ofta komprimerar om vid sändning). Skulle de två undergrupperna skilja
sig åt i codec eller upplösning vore det osynkat med `own`/`web`-uppdelningen — men det
går inte att mäta här eftersom filerna saknas.

## 6. Konfundering — betingat på vy och blur

Grupperna skiljer sig i både vy (§5) och kraftigt i blur (§5) — jämförelsen i §2/§4 är
**konfunderad**, som begärt. Här är samma skaftvinkelmått och bortfall, uppdelat.

### Skaftvinkel, betingat på vy (Erik-facit)

| Grupp × vy | n rader | n med vinkel | Median | p90 |
|---|---:|---:|---:|---:|
| `web` / `dtl` | 45 | 31 | 1,27° | 6,46° |
| `own` / `dtl` | 40 | 37 | 0,94° | 2,41° |
| `web` / `face_on` | 2 | 0 | — | — |
| `own` / `face_on` | 8 | 2 | 3,78° | 4,02° |

**Gapet håller inom `dtl` ensamt** (94 % av `web`s och 83 % av `own`s rader) — `own`
ligger fortfarande lägre på median och tydligt lägre på p90. Det är alltså inte enbart
vy-fördelningen som driver §2.

### Skaftvinkel, betingat på blur (Erik-facit)

| Grupp × blur | n rader | n med vinkel | Median | p90 |
|---|---:|---:|---:|---:|
| `web` / `none` | 24 | 20 | 1,50° | 7,22° |
| `own` / `none` | 42 | 34 | 1,06° | 3,90° |
| `web` / `mild` | 13 | 9 | 1,10° | 2,99° |
| `own` / `mild` | 6 | 5 | 0,92° | 1,73° |
| `web` / `severe` | 11 | 3 | 6,46° | 10,46° |
| `own` / `severe` | 0 | 0 | — | — |

**Även vid matchad blur (`none` mot `none`, `mild` mot `mild`) ligger `own` lägre**, men
marginalen krymper mot den obetingade tabellen i §2 — `web`s `none`-median (1,50°) är
i praktiken lika hög som dess obetingade median, för att `web`s `severe`-rader (median
6,46°, bara n=3) drar upp helheten. **Blur förklarar en del av gapet i §2, men inte
allt** — `own` är fortfarande lägre inom varje matchad blur-nivå, på litet n.

### Bortfall (`--conf 0,25`), betingat på vy och blur (Erik-facit)

| Cell | Bortfall |
|---|---:|
| `web` / `dtl` | 9/45 (20 %) |
| `own` / `dtl` | 2/40 (5 %) |
| `web` / `none` | 3/24 (13 %) |
| `own` / `none` | 6/42 (14 %) |
| `web` / `mild` | 2/13 (15 %) |
| `own` / `mild` | 1/6 (17 %) |
| `web` / `severe` | 5/11 (45 %) |

**Bortfallet delar sig annorlunda än vinkelfelet.** Betingat på `blur` är `web` och
`own` i praktiken lika (13–17 % i `none`/`mild`) — nästan hela §4:s obetingade gap
(21 % mot 15 %) kommer ur `web`s `severe`-bildrutor (45 % bortfall, n=11), som `own`
saknar helt. Betingat på **vy** däremot håller gapet: `own`/`dtl` 5 % mot `web`/`dtl`
20 %, och det är inte samma förklaring som blur-tabellen ger (`dtl`-cellerna blandar
alla tre blur-nivåer). **De två konfunderarna pekar delvis åt olika håll och är inte
uppdelade mot varandra här** (en tredje korsning `källa × vy × blur` har celler för små
för att bära en siffra på det här n:et) — det lämnas öppet.

## 7. Sammanfattning — vad som håller och vad som inte gör det

- **`own` har ett mätbart lägre skaftvinkelfel än `web`** (median och p90, §2), och det
  håller mot båda facit och även betingat på `dtl` ensamt (§6). Det är inte en ren
  vy-artefakt.
- **`own` har färre totala bortfall** (§4), men det mesta av det gapet spårar `web`s
  `severe`-blur-bildrutor snarare än `source` i sig (§6) — betingat på blur är
  bortfallet nästan lika. Betingat på vy håller gapet dock kvar, av en orsak den här
  analysen inte separerar ut.
- **`hosel`-felet håller riktningen** (`own` lägre, båda facit); **`butt`-felet gör
  det inte** (motsatt riktning mellan facit) — ingen slutsats dras om `butt`.
- **Grupperna är konfunderade på både vy och (kraftigt) blur** — `own` har inga
  `severe`-blur-bildrutor alls i det här urvalet av 50. En skillnad som håller trots
  det (skaftvinkeln inom `dtl`) är starkare bevisning än en obetingad skillnad, men
  n i varje betingad cell är 3–42 rader över 27–33 klipp — **litet**, och ingen siffra
  här extrapoleras till fler bildrutor än de uppmätta.
- **Ingen slutsats dras om produktionen.** Kalibreringssetet är stillbilder valda för
  annotatörsamstämmighet, inte ett urval som representerar produktionens klippfördelning
  eller dess körsätt (`run_pose_clip.py`s varma spårare, 15 fps-bana, etc. — se
  `shaft/STATUS.md`). Det här svarar bara frågan *"skiljer sig detektorns fel på de
  bildrutor som redan finns, uppdelat på deras `source`-tagg"* — inget mer.
- **`shaft-v3` är fortfarande inte kört.** Alla tal ovan gäller `shaft-v2.onnx`. Frågan
  ska ställas om när `shaft-v3`s vikter finns på en maskin.
