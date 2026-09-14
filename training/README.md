# Träningsmiljö — skaftdetektor

Fristående spår. **Ingenting här importeras av webbappen**, och ingenting här skriver i
`src/`. Python-koden läser `data/shaft/` och skriver bara i `training/`.

Läs [`docs/shaft/annotation-spec.md`](../docs/shaft/annotation-spec.md) först — den är
auktoritativ för punktordning, synlighetsflaggor och vad kalibreringssetet är.

**Schemat har fyra punkter: `butt → hosel → toe → heel`.** Ordningen är fast och gäller
överallt — CVAT:s sub-etiketter, COCO-exportens keypoint-lista, kolumnerna i YOLO-etiketten
och kanalerna i ONNX-utdatan. `butt→hosel` är skaftvinkeln, `heel→toe` bladvinkeln.

**Den levererande modellen är fortfarande tvåpunkts.** `shaft-v2.onnx` tränades före
`toe`/`heel` och skriver 11 kanaler; koden läser både 11 och 17 och rapporterar saknade
punkter som `null` respektive `outside`. Se *[In- och utdataformat](#in--och-utdataformat)*.

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

`data.yaml` sätter `kpt_shape: [4, 3]`. Etikettraden är

```
0  xc yc w h   bx by bv   hx hy hv   tx ty tv   ex ey ev
```

— en `x y v`-trippel per punkt i schemats ordning, oavsett hur många av dem som är satta.
En tvåpunktsexport (batch-01, batch-02) ger samma antal kolumner; dess `toe` och `heel`
skrivs som `0 0 0` och maskas ur förlusten precis som varje annan `outside`-punkt.
Körningen skriver ut vilket schema varje export bar.

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

### Exportera till ONNX

```powershell
py -3.11 training\export_onnx.py --weights training\runs\shaft-v1\weights\best.pt
```

Exporterar checkpointen till en `.onnx`-fil och verifierar exporten omedelbart. Ytterligare
flaggor:

| Flagga | Förval | Förklaring |
|---|---|---|
| `--weights` | — | Obligatorisk. Sökväg till `best.pt`. |
| `--imgsz` | Läses ur checkpointen | Inferensupplösning. Checkpointen bär det värde träningen använde — gissa det inte. |
| `--opset` | 17 | ONNX opset-version. |
| `--out` | `<weights_dir>/<stem>.onnx` | Utdatasökväg för `.onnx`-filen. |

`--imgsz` läses automatiskt ur `train_args` i checkpointen. Om det misslyckas (t.ex. en
COCO-förtränad basmodell som saknar `train_args`) avbryts körningen med ett tydligt fel och
man måste skicka flaggan för hand.

### Förhandsmärk nästa batch

```powershell
py -3.11 training\prelabel_batch.py --batch data\shaft\training\batch-02\batch.zip
py -3.11 training\prelabel_batch.py --batch … --dry-run        # rapporterar, skriver inget
py -3.11 training\prelabel_batch.py --batch … --view-gate off  # mäter vad vygrinden kostar
```

Kör ONNX-modellen över batchens frames och skriver `prelabel.xml` (CVAT for images 1.1,
ett `<skeleton label="shaft">` per förhandsmärkt frame) plus `prelabel-report.md` bredvid
batch-ZIP:en. Frames utan förhandsmärkning får inget objekt.

**Bara `butt` och `hosel` förhandsmärks.** Modellen är tvåpunkts och har ingenting att säga
om solan; `toe` och `heel` skrivs som `outside="1"` så att objektet ändå bär etikettschemats
alla fyra sub-etiketter. Annotatören placerar dem från noll.

**Läs [`docs/shaft/annotation-spec.md` → *Förhandsmärkning med modellen*](../docs/shaft/annotation-spec.md#förhandsmärkning-med-modellen)
innan du ändrar något här.** Kortversionen: modellen kastar om ändarna vid förkortning
(158,6° medianfel på kalibreringssetets `face_on`-frames mot 2,6° på `dtl`), så en frame
förhandsmärks bara när varje redan annoterad frame ur **samma sving** säger `dtl`. Två
uppenbara alternativa heuristiker — skaftlängd och vinkelkontinuitet över svingen — är
prövade mot data och fungerar inte; skälen står i skriptets huvud så de inte prövas igen.

Skriptet kör ONNX direkt (`onnxruntime` + `cv2`, båda redan pinnade) och speglar
`src/lib/shaft/letterbox.ts` och `shaftPostprocess.ts`. Det är två implementationer av
samma geometri, så `test_prelabel_batch.py` pinnar den mot de tre frames S-11 verifierade i
**båda** miljöerna — driver någon av dem isär faller ett test i stället för en batch.

#### Vad verifieringen kontrollerar

Direkt efter exporten kör skriptet en bild ur `data/shaft/calibration/calibration.zip` genom
**båda** modellerna — PyTorch (CPU) och ONNX via `onnxruntime` — och jämför utdata
element-vis. Avvikelse (max-absolutvärde) över 0,01 ger exit 1 med ett tydligt felmeddelande.
Det normala värdet är i storleksordningen 1 × 10⁻³, vilket är float32-brus från onnxslims
grafförenkling; ett verkligt trasigt export (fel operatormappning, saknade noder) ger
avvikelser i storleksordningen 0,1 eller mer.

#### In- och utdataformat

Webbintegrationen behöver dessa former — rör ingenting förrän du läst det här avsnittet.

**Indata**

```
[1, 3, imgsz, imgsz]  float32
```

| Dimension | Storlek | Innebörd |
|---|---|---|
| 0 | 1 | Batch (fast, `dynamic=False`) |
| 1 | 3 | Kanaler i **RGB**-ordning (inte BGR) |
| 2 | imgsz | Höjd i pixlar (960 vid standard, 1280 om tränat med `--imgsz 1280`) |
| 3 | imgsz | Bredd i pixlar |

Pixelvärdena är normaliserade till **[0, 1]** (dividerat med 255). Bilden måste skalas till
`imgsz × imgsz` med linjär interpolation (bilinear) — samma som skriptet gör med OpenCV.

**Utdata**

```
[1, 17, N]  float32        fyrapunktsschemat
[1, 11, N]  float32        äldre tvåpunktsmodell (shaft-v2 och tidigare)
```

| Dimension | Storlek | Innebörd |
|---|---|---|
| 0 | 1 | Batch |
| 1 | 17 (eller 11) | 5 boxkanaler + 3 per punkt — se kanaltabell nedan |
| 2 | N | Antal anchors från tre detektionshuvuden (se *Anchor-räkning*) |

Kanal-layout (index 0–16):

| Index | Namn | Enhet / skala |
|---|---|---|
| 0 | cx | Boxens mittpunkt x, **pixlar** (0 .. imgsz) |
| 1 | cy | Boxens mittpunkt y, **pixlar** (0 .. imgsz) |
| 2 | w | Boxens bredd, **pixlar** |
| 3 | h | Boxens höjd, **pixlar** |
| 4 | conf | Konfidenspoäng, sigmoid-aktiverad **[0, 1]** |
| 5 | butt\_x | `butt`-punktens x, **pixlar** |
| 6 | butt\_y | `butt`-punktens y, **pixlar** |
| 7 | butt\_v | `butt`-synlighetsscore, sigmoid-aktiverad **[0, 1]** |
| 8 | hosel\_x | `hosel`-punktens x, **pixlar** |
| 9 | hosel\_y | `hosel`-punktens y, **pixlar** |
| 10 | hosel\_v | `hosel`-synlighetsscore, sigmoid-aktiverad **[0, 1]** |
| 11 | toe\_x | `toe`-punktens x, **pixlar** |
| 12 | toe\_y | `toe`-punktens y, **pixlar** |
| 13 | toe\_v | `toe`-synlighetsscore, sigmoid-aktiverad **[0, 1]** |
| 14 | heel\_x | `heel`-punktens x, **pixlar** |
| 15 | heel\_y | `heel`-punktens y, **pixlar** |
| 16 | heel\_v | `heel`-synlighetsscore, sigmoid-aktiverad **[0, 1]** |

Punkterna är i `butt → hosel → toe → heel`-ordning, fast och oföränderlig (se
[annotation-spec](../docs/shaft/annotation-spec.md)). Den riktade vektorn `butt → hosel`
definierar skaftets riktning; `heel → toe` definierar bladets.

**Kanalantalet är kontraktet.** Utdatan avkodas positionellt
([`src/lib/shaft/shaftPostprocess.ts`](../src/lib/shaft/shaftPostprocess.ts)), så det är
antalet kanaler — inte ett flaggvärde någon skickar runt — som säger vilket schema den
laddade modellen implementerar. Avkodaren läser det ur tensorn och tar emot **11 eller 17**;
vid 11 rapporteras `toe` och `heel` som `null`, inte som punkter i origo. Varje annat
antal är ett fel. `export_onnx.py` skriver ut samma besked direkt efter exporten, så en
tvåpunktscheckpoint inte kan levereras som en fyrapunktsmodell utan att någon ser det.

**Anchor-räkning (N)**

YOLOv8n-pose har tre huvuden med strides 8, 16 och 32:

```
N = (imgsz / 8)² + (imgsz / 16)² + (imgsz / 32)²
```

| `imgsz` | N |
|---|---|
| 960 | 14 400 + 3 600 + 900 = **18 900** |
| 1280 | 25 600 + 6 400 + 1 600 = **33 600** |

Skriptet skriver ut faktisk input- och outputform när det körs — läs den utskriften om du
är osäker på vilket imgsz checkpointen använder.

**Vad webbintegrationen ska göra**

1. Skala bilden till `imgsz × imgsz`, normalisera till [0, 1], lägg till batch-dimensionen.
2. Kör ONNX-sessionen.
3. Filtrera outputs på `conf > tröskelvärde` (prova 0,25 som startpunkt).
4. Kör NMS (Non-Maximum Suppression) på de kvarvarande.
5. Plocka ut punkternas `x/y` ur den vinnande boxens kanaler — så många punkter som
   kanalantalet bär.
6. Skala tillbaka koordinaterna till originalbildens pixelutrymme.

Steg 3–6 är **inte** med i ONNX-grafen (Ultralytics exporterar utan NMS med
`dynamic=False`). Det är webbintegrationens ansvar.

---

## Filer

| Fil | Roll |
|---|---|
| `prepare_dataset.py` | CVAT COCO Keypoints → YOLO-pose. |
| `train.py` | Tränar YOLOv8n-pose från COCO-förtränade vikter. |
| `evaluate.py` | Mäter mot kalibreringssetet, skriver `eval-report.md`. |
| `export_onnx.py` | Exporterar `best.pt` → ONNX och verifierar numeriskt. |
| `prelabel_batch.py` | Förhandsmärker en batch med ONNX-modellen → CVAT-importerbar XML. |
| `shaft_coco.py` | Delade läsare för COCO-exporterna; punktordningen bor här. |
| `test_prelabel_batch.py` | Enhetstester för förhandsmärkningen. |
| `test_shaft_schema.py` | Enhetstester för fyrapunktsschemat och bakåtkompatibiliteten. |

Kör testen med `py -3.11 -m unittest discover -s training -t training`.
| `requirements.txt` | Pinnade beroenden (utom PyTorch, se ovan). |

`shaft_coco.py` finns för att `prepare_dataset.py` och `evaluate.py` **måste** tolka
synlighetsflaggan exakt likadant. CVAT lämnar kvar koordinaten för en `outside`-punkt i
exporten, så en läsare som avgör "är punkten satt?" på koordinaten räknar spökpunkter.
Två kopior av den regeln skulle förr eller senare glida isär, och glidningen syns inte
som ett fel — den syns som en evalsiffra som är tyst felaktig.

---

## Beslut som är värda att känna till

### Bounding box

Klubban har ingen naturlig box — det är upp till fyra annoterade punkter, ett skaftsegment
plus ett solsegment. Boxen är därför **de satta punkternas omslutande rektangel plus
marginal**:

- marginal = `--margin` (0,06) × rektangelns längsta sida,
- men minst `--min-pad` (0,01) × bildens kortaste sida,
- klippt mot bildkanten.

Golvet finns för att ett exakt lodrätt skaft ger en rektangel med bredd noll. Utan golv
blir boxen degenererad och boxförlusten odefinierad. Marginalen i övrigt håller boxens
**yta** kopplad till objektets faktiska utsträckning, vilket spelar roll: pose-förlusten
normaliserar keypoint-felet mot boxytan, så en box som inte följer objektets skala
viktar om precis det mått vi bryr oss om.

**Rektangeln räknas på de punkter som faktiskt är satta — vilka de än är.** En frame där
bara `toe` och `heel` gick att placera får en box som spänner solan och ingenting mer. Det
är inte ett fel att rätta: boxen ska beskriva vad framen annoterar, inte hur en klubba
brukar se ut.

### Frames med färre än fyra punkter placerade

Med fyra punkter är antalet satta punkter ett **spektrum från 1 till 4**, inte ett
ja-eller-nej. Regeln följer geometrin och inget annat:

| Satta punkter | Box |
|---|---|
| 2–4 | Omslutande rektangel över just dem, plus marginal. |
| 1 | Kvadratisk ersättningsbox (`--single-point square`, förval). |
| 0 | Framen skrivs inte — det finns ingen annotering att träna på. |

Cirka 14 % av batch-01 (20 av 143 användbara frames) hade bara en av sina två punkter satt.
**De behålls.**

Sidan på kvadraten är datasetets **mediana `butt`–`hosel`-längd delat med √2** — alltså den
sida en omslutande rektangel har för ett skaft av medianlängd i 45 grader. Skälet är
boxytan igen: kvadraterna hamnar då i samma ytfördelning som de riktiga boxarna och
rubbar inte förlustens ytnormalisering. Medianen mäts fortfarande på **skaftet**, inte på
alla fyra punkterna: skaftet dominerar klubbans utsträckning, solan lägger till någon
procent, och en skala hämtad ur `toe`/`heel` hade varit odefinierad mot batch-01. Den
saknade punkten skrivs som `0 0 0` och maskas ur keypoint-förlusten av Ultralytics.

Motiveringen till att behålla dem: det är **inte** slumpmässigt bortfall. En punkt är
`outside` just när den är svår — greppänden bakom axeln, huvudet utanför ramen, solan sedd
rakt framifrån — så att kasta dem vore att kasta systematiskt de svåraste framesen. Boxen är
en svagare lokaliseringssignal på de framesen; keypoint-målet, det enda som utvärderas,
är oförändrat.

`--single-point drop` finns för den som vill mäta vad valet kostar; den kastar frames med
exakt en satt punkt.

### Horisontell spegling är av

`data.yaml` sätter `flip_idx: [0, 1, 2, 3]` — identitetsmappningen — och `train.py` sätter
`fliplr=0.0`. Ingen av de fyra punkterna är en annan punkts spegelbild: `butt` och `hosel`
är de två ändarna av en **riktad** vektor, och `toe`/`heel` är solans yttre respektive inre
ände — att spegla bilden gör inte en tå till en häl, den vänder klubban. Ingen av dem är
alltså ett spegelsymmetriskt par som vänster/höger axel i COCO-pose. Det finns därför ingen
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
skaftets skenbara längd. För ett tunt linjeobjekt är en trovärdig skalfördelning värd
mer än den extra variationen — och solan, som redan är några få pixlar lång, tål det ännu
sämre än skaftet. Flaggan finns för att pröva motsatsen.

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

**Skaftvinkeln är huvudsiffran.** Reglerna mäter skaftets riktning: ett fel *längs* skaftet
kostar ingenting, samma fel *tvärs* skaftet kostar en regel. Vinkelskillnaden viks inte
vid 90° — `butt→hosel` är riktad, så ombytta ändpunkter ska synas som ~180°, inte tyst
absorberas som 0°.

**Bladvinkeln (`heel→toe`) redovisas som ett eget mått vid sidan av**, aldrig hopslagen med
skaftvinkeln: ett skaft kan ligga i rätt plan med bladet vidöppet, och det är precis det
felet solpunkterna finns för att göra synligt. Den mäts bara på frames där både `heel` och
`toe` är satta av annotatören *och* predicerade av modellen; saknas sådana frames står
måttet tomt i stället för noll. Människokolumnen är tom av samma skäl — kalibreringssetet
annoterades i tvåpunktsschemat och bär inget golv för bladvinkeln. Samma ovikning vid 90°
gäller: `heel→toe` är riktad och en omkastad sola ska synas som ~180°.

Avstånd redovisas i **både px och procent av bildhöjden** eftersom setet blandar
720×818 och 1080×1920. Läs den normaliserade siffran; px står kvar för att det är vad
man ser när man öppnar framen igen.

Rapporten redovisar också, per punkt, hur ofta modellen predicerar en punkt annotatören
flaggade `outside` och hur ofta den saknar en punkt annotatören satte. Det förstnämnda
är inte automatiskt fel — `outside` betyder att *annotatören* inte kunde sluta sig till
läget — så talet finns för att göra avvikelsen synlig, inte för att straffa den.

### Levererande modell: `shaft-v2.onnx`

**Tvåpunkts.** `shaft-v2` tränades före schemaändringen och emitterar 11 kanaler, så den
levererar `butt` och `hosel` och ingenting mer; `toe` och `heel` rapporteras som `null` av
webbintegrationen och som `n = 0` av `evaluate.py`. Den fortsätter köra tills en
fyrapunktsmodell finns — schemat och koden ligger före modellen med flit, så att
annoteringen kan börja.

Vad appen faktiskt kör i dag (`src/lib/shaft/shaftDetector.ts` → `MODEL_FILE`), mätt mot
kalibreringssetet. Människokolumnen är golvet från *Kalibreringsutfall 2026-09* ovan — den
står här för att en modellsiffra utan sitt golv inte går att bedöma.

| Mått | `shaft-v2` | Människor | Kvot |
|---|---:|---:|---:|
| **Vinkel, median** | **1,06°** | 0,30° | 3,5× |
| Vinkel, p90 | 6,72° | — | — |
| `butt`, median (% av bildhöjd) | 0,54 % | 0,17 % | 3,2× |
| `hosel`, median (% av bildhöjd) | 0,47 % | 0,13 % | 3,6× |

**Täckning:** 17 av 96 frames (18 %) utan detektion — modellen returnerar ingen punkt alls
där. De frames:en ingår inte i medianerna ovan, så läs de två talen ihop: en median dragen
ur de 82 % lättaste frames:en är inte samma sak som en median över setet.

**Per skärningsgrupp:**

| Grupp | Vinkelmedian |
|---|---:|
| `face_on` | 4,32° |
| `severe blur` | 3,46° |

`face_on` är den siffra som flyttat sig mest. `shaft-v1` låg på **158,6°** där — inte ett
placeringsfel utan omkastade ändar: vid förkortning gissade den fel på vilken ände som var
`butt`. 4,32° betyder att omkastningen i allt väsentligt är borta, inte att den är bevisat
omöjlig. Kvar att göra av det: **vygrinden i `prelabel_batch.py` är fortfarande v1:s**
(förhandsmärker bara frames vars sving är helt `dtl`). Den är medvetet orörd här — att
lossa på den är ett eget mätbart beslut, inte en följd av ett modellbyte.

### Vad som exkluderas ur träningen

| Orsak | Batch-01 |
|---|---|
| Reserverad för kalibreringssetet (`reserved-ids.txt`) | 0 — batchen drogs redan med exkludering |
| `no_shaft=true` | 3 |
| Ingen punkt placerad (alla `outside`) | 1 |

Frames där en bild bär **fler än ett** `shaft`-objekt (två i batch-01, oavsiktliga
dubbelritningar) behålls; den annotering som har flest satta punkter vinner, sedan den
med största omslutande rektangel, sedan lägsta annoterings-id. Valet loggas med
frame-id i körningens utdata.
