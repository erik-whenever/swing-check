# Träningsmiljö — skaftdetektor

Fristående spår. **Ingenting här importeras av webbappen**, och ingenting här skriver i
`src/`. Python-koden läser `data/shaft/` och skriver bara i `training/`.

Läs [`docs/shaft/annotation-spec.md`](../docs/shaft/annotation-spec.md) först — den är
auktoritativ för punktordning, synlighetsflaggor och vad kalibreringssetet är.

**Kalibreringssetet (`data/shaft/calibration/`) är permanent evalset och tränas aldrig
på.** `prepare_dataset.py` vägrar köra utan `reserved-ids.txt`.

**Persondata.** `prepare_dataset.py` kopierar ut bilderna ur batch-ZIP:arna till
`training/datasets/`. Det är samma identifierbara personer som i `data/shaft/` och
lyder under samma regel — publiceras aldrig. Katalogen är gitignorad, liksom
`training/runs/` (vars `train_batch*.jpg`-plottar innehåller bilderna).

---

## Uppsättning

Allt nedan körs från reporoten (`C:\SwingCheck`) i PowerShell.

### 1. Python 3.11

Python 3.11 anropas som `py -3.11` via Windows' `py`-launcher. Kontrollera att den finns:

```powershell
py -0p                      # listar installerade versioner och deras sökvägar
py -3.11 --version          # ska svara Python 3.11.x
```

Svarar `py` inte alls, eller saknas 3.11 i listan, installera den — installerarna från
python.org tar med `py`-launchern:

```powershell
winget install --id Python.Python.3.11 --source winget
```

Öppna ett nytt terminalfönster efteråt (PATH uppdateras inte i ett redan öppet) och kör
`py -0p` igen.

> **Varför 3.11 och inte senare.** `onnxruntime` 1.30 kräver ≥ 3.11 och `numpy` 2.5
> kräver ≥ 3.12, så 3.11 är den lägsta version hela kedjan går ihop på — och den
> högsta där alla pinnar i `requirements.txt` har färdiga hjul. Vill du gå till 3.12+
> måste `numpy`-pinnen upp samtidigt.

### 2. Virtuell miljö

```powershell
py -3.11 -m venv training\.venv
training\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Vägrar PowerShell köra aktiveringsskriptet (`running scripts is disabled`):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Med miljön aktiverad är `python` rätt tolk; utan den måste allt köras som
`training\.venv\Scripts\python.exe …`. Kommandona nedan skrivs som `py -3.11 …` så att
de fungerar även utan aktivering — byt till `python …` när miljön är aktiv.

### 3. Installera PyTorch med CUDA — **före** `requirements.txt`

Ordningen är inte valfri. `ultralytics` beror på `torch`; installeras den först hämtas
CPU-hjulet från PyPI och GPU:n används aldrig. Installera därför CUDA-hjulen från
PyTorch egna index först:

```powershell
py -3.11 -m pip install torch==2.14.0 torchvision --index-url https://download.pytorch.org/whl/cu132
```

`cu132` = CUDA 13.2-hjulen, PyTorch 2.14:s förvalda/stabila CUDA-variant. Kör du en
äldre driver finns `cu130` (CUDA 13.0) och `cu126` (CUDA 12.6) på samma index — byt bara
sista ledet i URL:en:

| Index | CUDA |
|---|---|
| `https://download.pytorch.org/whl/cu132` | 13.2 — förval för torch 2.14 |
| `https://download.pytorch.org/whl/cu130` | 13.0 |
| `https://download.pytorch.org/whl/cu126` | 12.6 — bakåtkompatibilitet |

Hjulen som matchar Python 3.11 på Windows heter
`torch-2.14.0+cu132-cp311-cp311-win_amd64.whl`. Vilken CUDA-version drivern klarar syns i
`nvidia-smi` (översta högra hörnet); CUDA-verktygslådan behöver **inte** installeras
separat — hjulen bär med sina egna CUDA-bibliotek.

Adresserna ovan är hämtade från
[pytorch.org/get-started/locally](https://pytorch.org/get-started/locally/) och
kontrollerade mot [download.pytorch.org/whl](https://download.pytorch.org/whl/) —
gissa dem inte, de byter med varje PyTorch-release.

### 4. Resten av beroendena

```powershell
py -3.11 -m pip install -r training\requirements.txt
```

### 5. Verifiera GPU:n

```powershell
py -3.11 -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Ska skriva ut versionen, CUDA-versionen, `True` och kortets namn. Står det `False` är
CPU-hjulet installerat — avinstallera och gör om steg 3:

```powershell
py -3.11 -m pip uninstall -y torch torchvision
```

---

## Köra

### Bygg datasetet

```powershell
py -3.11 training\prepare_dataset.py `
  --pair data\shaft\training\batch-01\annotated-v2.zip data\shaft\training\batch-01\batch.zip
```

`--pair` tar två sökvägar: CVAT:s **COCO Keypoints 1.0**-export (annoteringarna, utan
bilder) och den batch-ZIP annoteringen gjordes på (bilderna + `manifest.json`). Upprepa
flaggan för flera batchar:

```powershell
py -3.11 training\prepare_dataset.py `
  --pair data\shaft\training\batch-01\annotated-v2.zip data\shaft\training\batch-01\batch.zip `
  --pair data\shaft\training\batch-02\annotated-v1.zip data\shaft\training\batch-02\batch.zip
```

`--dry-run` läser allt och rapporterar utan att skriva något. Utdata hamnar i
`training/datasets/shaft/` (gitignorad):

```
images/{train,val}/<frameId>.jpg
labels/{train,val}/<frameId>.txt
data.yaml
frame-meta.json
```

### Träna

```powershell
py -3.11 training\train.py
py -3.11 training\train.py --epochs 400 --batch 8 --imgsz 1280
py -3.11 training\train.py --dry-run        # visar den upplösta konfigurationen
```

Körningar landar i `training/runs/<name>/`; bästa vikterna i
`training/runs/<name>/weights/best.pt`.

### Utvärdera

```powershell
py -3.11 training\evaluate.py --weights training\runs\shaft-v1\weights\best.pt
```

Mäter mot kalibreringssetet och skriver `training/eval-report.md`. `--dry-run`
kontrollerar indata och synlighetskodningen utan att ladda modellen.

---

## Filer

| Fil | Roll |
|---|---|
| `prepare_dataset.py` | CVAT COCO Keypoints → YOLO-pose. |
| `train.py` | Tränar YOLOv8n-pose från COCO-förtränade vikter. |
| `evaluate.py` | Mäter mot kalibreringssetet, skriver `eval-report.md`. |
| `shaft_coco.py` | Delade läsare för COCO-exporterna. |
| `requirements.txt` | Pinnade beroenden (utom PyTorch, se ovan). |

`shaft_coco.py` finns för att `prepare_dataset.py` och `evaluate.py` **måste** tolka
synlighetsflaggan exakt likadant. CVAT lämnar kvar koordinaten för en `outside`-punkt i
exporten, så en läsare som avgör "är punkten satt?" på koordinaten räknar spökpunkter.
Två kopior av den regeln skulle förr eller senare glida isär, och glidningen syns inte
som ett fel — den syns som en evalsiffra som är tyst felaktig.

---

## Beslut som är värda att känna till

### Bounding box

Skaftet har ingen naturlig box — det är ett linjesegment mellan två annoterade
ändpunkter. Boxen är därför **punkternas omslutande rektangel plus marginal**:

- marginal = `--margin` (0,06) × rektangelns längsta sida,
- men minst `--min-pad` (0,01) × bildens kortaste sida,
- klippt mot bildkanten.

Golvet finns för att ett exakt lodrätt skaft ger en rektangel med bredd noll. Utan golv
blir boxen degenererad och boxförlusten odefinierad. Marginalen i övrigt håller boxens
**yta** kopplad till skaftets faktiska utsträckning, vilket spelar roll: pose-förlusten
normaliserar keypoint-felet mot boxytan, så en box som inte följer objektets skala
viktar om precis det mått vi bryr oss om.

### Frames med bara en punkt placerad

Cirka 14 % av batch-01 (20 av 143 användbara frames) har en ändpunkt `outside` och den
andra satt. **Valet: de behålls, med en kvadratisk ersättningsbox** (`--single-point
square`, förval).

Sidan på kvadraten är datasetets **mediana skaftlängd delat med √2** — alltså den sida
en omslutande rektangel har för ett skaft av medianlängd i 45 grader. Skälet är
boxytan igen: kvadraterna hamnar då i samma ytfördelning som de riktiga boxarna och
rubbar inte förlustens ytnormalisering. Den saknade punkten skrivs som `0 0 0` och
maskas ur keypoint-förlusten av Ultralytics.

Motiveringen till att behålla dem: det är **inte** slumpmässigt bortfall. En punkt är
`outside` just när den är svår — greppänden bakom axeln, huvudet utanför ramen — så att
kasta dem vore att kasta 14 % av datan och systematiskt de svåraste framesen. Boxen är
en svagare lokaliseringssignal på de framesen; keypoint-målet, det enda som utvärderas,
är oförändrat.

`--single-point drop` finns för den som vill mäta vad valet kostar.

### Horisontell spegling är av

`data.yaml` sätter `flip_idx: [0, 1]` — identitetsmappningen — och `train.py` sätter
`fliplr=0.0`. `butt` och `hosel` är de två ändarna av en **riktad** vektor, inte ett
spegelsymmetriskt par som vänster/höger axel i COCO-pose. Det finns alltså ingen
indexpermutation som gör en speglad bild korrekt etiketterad, och `flip_idx` kan bara
vara identiteten för att stilla Ultralytics' schemakontroll. `train.py` avbryter om
`fliplr` inte är 0.

`flipud` är också 0: en golfsving är aldrig upp och ner.

### Fasen tränas inte

`phase` är ett viktnings- och grupperingsattribut, aldrig ett träningsmål
(annotation-spec → *`phase` är ett viktningsattribut*). Den följer med i
`frame-meta.json` tillsammans med `view`, `blur`, `source` och bildstorlek, så
`evaluate.py` kan gruppera utfallet per fas.

Fasen läses i den här ordningen: `phase-corrected.json` (letas upp automatiskt intill
varje batch-ZIP, eller pekas ut med `--phase-corrected`), annars annotatörens värde i
CVAT-exporten, annars manifestets härledda värde. Det härledda värdet är sist av ett
skäl: det var fel på ~50 % av batch-01 ([F5](../docs/oppna-fragor.md)).

### Train/val-split — och varför kalibreringssetet inte är val-set

Splitten är **grupperad per sving**: alla frames ur samma sving hamnar på samma sida.
Två frames ur en sving är nästan samma bild, och en split som går rakt genom en sving
mäter memorering.

Kalibreringssetet används **inte** som val-set. `best.pt` väljs på val-setet, så ett
val-set draget ur evalsetet hade gjort varje evalsiffra till en siffra modellen valdes
mot. Val är i stället 15 % (`--val-frac`) av träningsframesen; kalibreringssetet rörs
bara av `evaluate.py`.

### Mosaic är av

`--mosaic` är 0 som förval. Mosaic klistrar fyra frames i en och fjärdedelar därmed
skaftets skenbara längd. För ett tunt tvåpunktsobjekt är en trovärdig skalfördelning värd
mer än den extra variationen. Flaggan finns för att pröva motsatsen.

### Träningsdefaults

För batch-01:s storlek (~146 bilder, 124 train / 22 val) på 12 GB VRAM:

| Flagga | Förval | Varför |
|---|---|---|
| `--epochs` | 300 | 146 bilder är få; nätet behöver många pass. `--patience 60` stoppar tidigt. |
| `--batch` | 16 | Passar 12 GB vid `imgsz 960` för yolov8n-pose. |
| `--imgsz` | 960 | Skaftet är några pixlar brett — upplösning är det som avgör noggrannheten, och det som kostar VRAM. |
| `--cache` | `ram` | 146 fullupplösta frames ligger lätt i minnet. |

Får du `CUDA out of memory`: sänk `--batch` först (16 → 12 → 8), `--imgsz` sist. Att
sänka upplösningen kastar bort precis den information punktplaceringen behöver.

### Metrikerna i `eval-report.md`

Rapporten jämför mot **människornas samstämmighet** på samma 97 frames, inte mot ett
påhittat mål: vinkel median 0,3°, `butt` 0,17 %H, `hosel` 0,13 %H
(annotation-spec → *Kalibreringsutfall 2026-09*). Det är golvet uppgiften har — två
tränade annotatörer med samma spec kommer inte närmare varandra än så.

**Vinkeln är huvudsiffran.** Reglerna mäter skaftets riktning: ett fel *längs* skaftet
kostar ingenting, samma fel *tvärs* skaftet kostar en regel. Vinkelskillnaden viks inte
vid 90° — `butt→hosel` är riktad, så ombytta ändpunkter ska synas som ~180°, inte tyst
absorberas som 0°.

Avstånd redovisas i **både px och procent av bildhöjden** eftersom setet blandar
720×818 och 1080×1920. Läs den normaliserade siffran; px står kvar för att det är vad
man ser när man öppnar framen igen.

Rapporten redovisar också, per punkt, hur ofta modellen predicerar en punkt annotatören
flaggade `outside` och hur ofta den saknar en punkt annotatören satte. Det förstnämnda
är inte automatiskt fel — `outside` betyder att *annotatören* inte kunde sluta sig till
läget — så talet finns för att göra avvikelsen synlig, inte för att straffa den.

### Vad som exkluderas ur träningen

| Orsak | Batch-01 |
|---|---|
| Reserverad för kalibreringssetet (`reserved-ids.txt`) | 0 — batchen drogs redan med exkludering |
| `no_shaft=true` | 3 |
| Ingen punkt placerad (båda `outside`) | 1 |

Frames där en bild bär **fler än ett** `shaft`-objekt (två i batch-01, oavsiktliga
dubbelritningar) behålls; den annotering som har flest satta punkter vinner, sedan den
med största omslutande rektangel, sedan lägsta annoterings-id. Valet loggas med
frame-id i körningens utdata.
