# shaft-v2 → Core ML (N-3.7, konverteringsdelen)

**Datum:** 2026-10-24 · **Branch:** `stream-native-coreml` · **Status:** konverterad och spec-kontrollerad.
Pariteten väntar på Mac (§5).

## 1. Vad som gjordes

| | |
|---|---|
| Källa | `public/models/shaft-v2.onnx`, sha256 `af354319…3facb9`. Samma fil som `reference.json` gjordes från, och skriptet kontrollerar det. |
| Skript | `training/export_coreml.py`, `training/coreml_parity.py` |
| Miljö | `training/Dockerfile.coreml` + `training/requirements-coreml.txt` (coremltools 9.0, torch 2.7.0+cpu, onnx2torch 1.5.15) |
| Utdata | `C:\SwingCheck\data\shaft\coreml\`: båda `.mlpackage`, `parity/` (kopia av N-2-fixturen), `coreml-export.json`. Mappen är gitignorerad genom `data/shaft/*`. |

**Ingen `.pt` finns.** `training/runs/` är tom i huvudcheckouten. En sökning i `C:\Users\erik`,
`C:\SwingCheck` och `D:` efter `best.pt`/`last.pt`/`shaft*.pt` gav ingenting, vilket stämmer med
`source-split.md` §0.1. coremltools kräver PyTorch, så **onnx2torch bygger en torch-modul ur ONNX-grafens
egna initializers**. Vikterna är alltså samma, men det är inte Ultralytics `nn.Module`. Modulen kontrolleras
mot ONNX Runtime på paritetsrutan innan något konverteras:
**max abs diff 9,2e-4** på rått huvud (grinden 1e-2, samma som i `export_onnx.py`), och butt och hosel blir **0,000 px**.
Sedan körs `torch.jit.trace` och `ct.convert` till ML Program, med compute precision FLOAT32 och FLOAT16.

**Windows gick inte.** coremltools 9.0 har bara sdist för Windows. Den installeras, men saknar
`libmilstoragepython`, och `MLModel.save` på ett ML Program faller med `RuntimeError: BlobWriter not loaded`
(provat med ett program på en enda op). **WSL** har ingen användbar distro på maskinen, bara `docker-desktop`. I stället
körs exporten i en **Linux-container via Docker Desktop**, som har WSL2-backend. Det är ingen ny systeminstallation.
Kommandot står i skriptets docstring.

## 2. Inputvalet: `ImageType`, RGB, skala 1/255

**Vald: `ct.ImageType(name="images", shape=(1,3,960,960), color_layout=RGB, scale=1/255, bias=0)`.**

Motivering: Swift-modulen ger Core ML en **`CVPixelBuffer`** direkt. Det kan vara en letterboxad 960×960
32BGRA-buffert (vImage/Core Image: skala, centrera, fyll med 114). Core ML byter sedan själv BGRA mot RGB,
konverterar uint8 till float och multiplicerar med 1/255. Det blir ingen loop per pixel, varken i JS eller i Swift.
Med `MLMultiArray` måste Swift själv packa HWC-uint8 till CHW-float32 (921 600 × 3 värden per ruta). Det är
exakt det JS-loopsteg uppgiften vill bort ifrån, bara flyttat till Swift.

Att det stämmer exakt med Python och webben:

| | Python (`export_tflite.py`/ORT) | Webb (`shaftDetector.ts:479`) | Core ML |
|---|---|---|---|
| Kanalordning | RGB (`cv2.COLOR_BGR2RGB`) | R, G, B ur RGBA | `colorSpace: RGB` i specen |
| Normalisering | `/ 255` | `/ 255` | `mul` med fp32 `0.0039215689` som **första op** i programmet (även i fp16-varianten, före cast till fp16) |
| Pad | 114 | `PAD_VALUE = 114` | Swift fyller bufferten med 114 (inte modellens ansvar) |

Multiplikation med fp32 1/255 jämfört med division med 255 skiljer högst **6e-8** över alla 256 värden.

`// OSÄKER:` (risk låg–medel) Det här gäller bara om Swift-sidan **inte** går via `VNCoreMLRequest`. Visions
`imageCropAndScaleOption` skalar om själv och fyller med svart, inte 114. Den letterboxade bufferten ska
in i `MLModel.prediction` direkt. Om kamerabufferten är YUV (`420f`) måste den konverteras till BGRA först.
Jag vet inte säkert om Core ML tar emot YUV till en RGB-`ImageType` utan konvertering, och det verifieras i N-3.8.

## 3. Specen (kontrollerad efter sparning)

`export_coreml.py` läser in varje sparad `.mlpackage` igen med `skip_model_load=True` och avbryter
om något nedan avviker.

| | float32 | float16 |
|---|---|---|
| Input `images` | image 960×960, `RGB` | image 960×960, `RGB` |
| Output `output0` | multiArray `[1, 11, 18900]`, `FLOAT32` | multiArray `[1, 11, 18900]`, `FLOAT32` |
| Const-element per dtype | FLOAT32 3 172 176 | **FLOAT16 3 172 171**, FLOAT32 5 |
| Storlek | 12,8 MB (12 827 645 B) | 6,5 MB (6 494 477 B) |
| `weight.bin` sha256 | `c64c98c06cd0757e882e86977f50e0bb8fd710d141c0b61ac1aeb23ab0aec0c0` | `f22674ab7e1db1073665974c839685a4d9bffea76096aa25180abfc5d3879437` |
| Paket-sha256 (denna körning) | `04c46f7b…ab85945` | `afe7e4f6…7c5b90` |
| specificationVersion / mål | 6 / iOS 15 | 6 / iOS 15 |

- **fp16 är verkligen fp16:** alla vikter och bias lagras som FLOAT16, och vikten blir hälften så stor. De 5 fp32-konstanterna
  är 1/255-skalan och de fyra skalfaktorerna i de två `upsample`-stegen, alltså attribut och inga vikter.
  Programmet slutar med `cast` till fp32, så **utdatat är FLOAT32 i båda**. Swift läser
  `output0` på samma sätt oavsett variant.
- Layouten är samma som i ONNX och TFLite: channel-major (`CN`), 5 box-kanaler + 2 × 3 keypoints, ingen NMS.
- **Hasharna:** bara `weight.bin` är byte-identisk mellan två körningar på samma indata. `Manifest.json` och
  `model.mlmodel` ändras mellan körningarna, så hela paketets hash är inget stabilt id. Jämför `weight.bin`.
  Alla hashar per fil finns i `coreml-export.json`.
- Metadata i modellen: beskrivning av in- och utdata, `sourceSha256`, `inputSize 960`, `padValue 114`, `outputLayout CN`.

`// OSÄKER:` (risk låg) Deployment target är iOS 15, den lägsta som kör ML Program. Jag har inte kontrollerat
att det är golvet i Expo SDK 58. Höj det om Xcode varnar, så får coremltools nyare ops. Ingen behövs här.

`// OSÄKER:` (risk låg) `torch.jit.trace` fryser former, eftersom onnx2torch-ops läser `Reshape`/`Slice`/`Resize`-argument
som Python-värden. Det är ofarligt med fast 960×960-input, men modellen kan inte göras om till flexibel storlek.

## 4. Verifierat utan Mac

- onnx2torch mot ORT: rått huvud och avkodade punkter (§1).
- Specen: namn, form, dtype och vikt-dtype (§3).
- `coreml_parity.py` kördes i containern med ORT i stället för `predict`:
  - ORT som modell ger **PASS, 0,000 px**.
  - butt x förskjuten +2 modell-px ger **FAIL, 2,667 källpx**. Gränsen biter alltså i källpixlar.
  - Fel utdataform `[1, 11, 100]` ger FAIL med felmeddelande.
  - `PIL.Image.fromarray(frame)` blir `RGB` 960×960 och byte-identisk med fixturen.
  - `MLModel.predict` utanför macOS kastar `Model prediction is only supported on macOS…`, och skriptet
    stoppar själv med ett tydligt besked om det inte körs på `darwin`.

**Inte verifierat:** att Core ML själv ger samma tal. Ingen Core ML-runtime finns utanför macOS.

## 5. Väntar på Mac

1. Kopiera `C:\SwingCheck\data\shaft\coreml\` (båda paketen och `parity/`) till Macen.
2. Installera och kör enligt docstringen i `training/coreml_parity.py`:
   `training/.venv-coreml/bin/python training/coreml_parity.py --dir <mappen>`.
   Fyra körningar: {float32, float16} × {`ALL`, `CPU_ONLY`}. Skriptet godkänner om varje keypoint ligger
   **≤ 2 källpx** från ONNX (TFLite med Core ML-delegaten gav ≤ 0,45 px i N-2). Det skriver `parity/coreml-parity.json`
   och returnerar exit 1 om något fallerar.
3. Om fp16 med `ALL` (ANE) ligger nära gränsen men fp32 inte gör det, välj fp32 eller mät båda på enhet i N-3.8.
   `// OSÄKER:` (risk medel) fp16 på ANE ger normalt sub-pixelavvikelse för YOLO-huvuden, men jag har inte
   mätt det här. Box-conf 0,78 ligger långt över tröskeln 0,25, så avvikelsen bör synas i koordinaterna och inte
   som en förlorad detektion.
4. Skafttiden mäts med Core ML direkt i N-3.8. Det hör inte till den här uppgiften.

## 6. Kommandon

```
docker build -t swingcheck-coreml -f training/Dockerfile.coreml training
# från worktreen; från huvudcheckouten räcker -v C:\SwingCheck:/work och inga argument
docker run --rm -v C:\SwingCheck-coreml:/work -v C:\SwingCheck:/main swingcheck-coreml \
    python training/export_coreml.py --onnx /main/public/models/shaft-v2.onnx \
    --parity /main/apps/spike/assets/parity --out /main/data/shaft/coreml
```
