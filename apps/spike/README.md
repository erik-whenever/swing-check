# apps/spike — N-2: kamera + pose + shaft-v2 på telefon

Slit-och-släng-mätvy för grinden i F6. N-3 börjar rent på SDK 58 + VisionCamera 5.

**Stack (låst):** Expo SDK 54 · RN 0.81.5 · VisionCamera 4.7.3 + worklets-core ·
`react-native-mediapipe-pose-plugin` 0.1.0 (inkopplad via `plugins/withPoseLandmarker.js`) ·
`react-native-fast-tflite` 2.0.0 (Core ML / Android GPU) · `react-native-nitro-thermal`.
Inte en npm-workspace. `@swingcheck/core` länkas med `file:` så att RN:s React 19.1 inte krockar med
webbens 19.2 i rotens `node_modules`.

## Förutsättningar

1. Skaftmodellen och paritetsbilden. Båda är gitignorerade, och Metro serverar dem från den här
   datorn:
   `training\.venv-tflite\Scripts\python.exe training/export_tflite.py` (se `training/requirements-tflite.txt`)
2. `npm install` i `apps/spike`.
3. Telefonen och datorn på samma wifi. Windows-brandväggen måste släppa in port 8081.

## Byggen

MediaPipe och fast-tflite kan inte länkas in i samma iOS-app. Båda bär TFLite:s C-API, och första
bygget gav 54 dubbla `TfLite*`-symboler. Spiken byggs därför som tre varianter (`eas.json`).
`react-native.config.js` och `app.config.ts` styr vilka native-paket som följer med. Appen läser
variant från sitt eget bundle-id, eftersom dev-klienten hämtar konfigen från Metro.

| Profil | Innehåll | Bundle-id |
|---|---|---|
| `pose-lite` | MediaPipe `pose_landmarker_lite` (samma som webben) | `com.swingcheck.spike.lite` |
| `pose-full` | MediaPipe `pose_landmarker_full` | `com.swingcheck.spike.full` |
| `shaft` | shaft-v2 TFLite, Core ML (iOS) / GPU (Android) | `com.swingcheck.spike.shaft` |

Pose-modellen byts med en rad i config-pluginet (modellnamnet).

## Mätprotokoll

Gemensamt: telefonen liggande på stativ, personen helt i bild 3–4 m bort. Spiken roterar inte
bilden. **Dela logg** efter varje steg; loggen är JSON med sammanfattning, thermal per sekund och en
rad per ruta.

**Pose-byggena** (`pose-lite`, sedan `pose-full`):
1. **30 · Starta 3 min.** Låt den gå klart och rör inte telefonen. Det här är grinden: ms/ruta,
   tappade rutor och thermal.
2. **60** är valfritt.

**Skaftbygget:**
1. **Paritet.** Kör stillbilden genom TFLite och värmer upp Core ML.
2. **Burst 26**, fem gånger. Fångar 26 rutor i följd och kör dem direkt efter varandra. Det är
   produktens mönster: skaftet körs på cirka 26 rutor per sving efter slaget, inte live.
3. **30 · Starta 3 min.** Skaft på varje ruta, för ms/ruta och thermal under långvarig last.
4. Valfritt: upprepa 1–2 med **cpu** för att se vad Core ML ger.
