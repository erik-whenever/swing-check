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

Två varianter per plattform, en per posemodell. Modellnamnet byts med en rad i config-pluginet:
`development` (lite, samma modell som webben) och `development-full`.

## Mätprotokoll

1. Telefonen liggande på stativ. Personen helt i bild, 3–4 m bort. Skaft- och posemåtten gäller den
   bild kameran ger (ingen rotation i spiken).
2. **Paritet** först. Den kör stillbilden genom TFLite och värmer upp Core ML.
3. **Pose · 30 · Starta 3 min.** Låt den gå klart. Rör inte telefonen. Tryck sedan **Dela logg**.
4. Samma sak för **Skaft** och för **Båda**. **60** är valfritt.
5. Upprepa med den andra varianten (`full`).

Loggen är JSON: sammanfattning, paritet, thermal varje sekund och en rad per ruta.
