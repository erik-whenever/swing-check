# ADR-0004 — Native-pipelinen: två egna Nitro-moduler, pose och shaft

- **Status:** Antagen
- **Datum:** 2026-10-24

Numret följer `docs/decisions/` (ADR-002, ADR-003), som delar nummerserie med den här katalogen.

## Kontext
F6 är beslutat: React Native (Expo med dev client och VisionCamera) för iOS och Android, med pose
och skaftinferens i native-moduler och domänlogiken i `@swingcheck/core`. N-2 bekräftade att det
håller (iPhone 16 Pro: pose lite 17,3 ms och full 19,2 ms per ruta, skaftparitet ≤ 0,45 px). N-2
visade också fyra saker som styr hur modulerna ska byggas:

1. **MediaPipe och fast-tflite kan inte länkas in i samma iOS-binär.** Båda bär TFLite:s C-API, och
   EAS-bygget `60a0c910…` gav 54 dubbla `TfLite*`-symboler. Spiken fick byggas i två varianter.
2. **Inget färdigt MediaPipe-paket håller på VisionCamera 5.** Alla är v4-plugins, och den enda som
   höll 30 fps (`react-native-mediapipe-pose-plugin`) är låst till SDK 54 / VC 4.
3. **Spikens JS-förbehandling av skaftrutorna tog 37 ms per ruta.** Letterbox som en JS-loop över
   uint8 i workleten. Den ska göras natively.
4. **fast-tflite tål inte att samma modellinstans körs i både JS-tråden och kameratråden.**
   Pariteten fick en egen instans.

VisionCamera 5 bygger på Nitro: en frame processor-plugin är en Nitro-modul vars spec tar VC:s
`Frame`.

## Beslut
**Två egna Nitro-moduler, `pose` och `shaft`, i `apps/mobile/modules/`. Varje modul har ett enda
TS-gränssnitt (`.nitro.ts`), och samma gränssnitt implementeras i Kotlin och i Swift.** Kotlin skrivs
först, eftersom Android inte kräver Mac. Swift kommer i N-3.8.

- **`pose`** (`PoseDetector`): MediaPipe Pose Landmarker i VIDEO-läge, `lite` eller `full`, valbart
  vid körning. `detect(frame)` ger 33 landmärken i normaliserade, upprätta koordinater, med samma
  fält som cores `NormalizedLandmark`. JS-sidan bygger alltså `PoseSample` utan konvertering.
  Android använder `com.google.mediapipe:tasks-vision` 0.10.35, samma version som webben. 1.x drar in
  `litertlm-android` (cirka 20 MB LLM-runtime) som Pose inte använder.
- **`shaft`** (`ShaftDetector`): `detect(frame)` gör rotation, färgordning och letterbox natively
  och kör modellen. Resultatet är rå utdata `[1, 11, 18900]` plus letterboxen (cores
  `LetterboxTransform`-fält). **Avkodning och NMS stannar i core** (`shaftPostprocess`), så att iOS
  och Android delar dem (G2). Android kör LiteRT 1.4.2 (Interpreter-API:t) med GPU-delegaten, alltså
  samma grafväg som N-2 mätte via fast-tflite. iOS kör Core ML direkt på en `.mlpackage` (N-3.7).
- **Ingen fast-tflite på någon plattform:**
  - iOS: TFLite krockar med MediaPipe (punkt 1).
  - Ett gränssnitt: samma spec och samma resultattyp på båda plattformarna, i stället för
    fast-tflite på Android och en egen modul på iOS.
  - Förbehandlingen görs natively i modulen (punkt 3). fast-tflite tar en färdig tensor.
  - Modulen äger sina instanser. Ingen begränsning till en instans per tråd (punkt 4).
- **Takt:** pose körs live i 30 fps på kameratråden. Core (`liveSwingDetector`, `poseSegments`,
  `poseEnvelope`) matas i 15 fps tills N-4 har omkalibrerat konstanterna för 30 fps (S-49 §6).
  Skaftet körs inte live utan på cirka 26 rutor per sving efter slaget.
- **Rututtaget** (hur rutorna för Vision och de 26 skaftrutorna tas ut och sparas) avgörs i N-3.4.
- Varje modul har `runtimeInfo()`, som laddar sitt native-bibliotek och namnger det. Det är en
  felsökningskontroll av att runtimen är länkad och går att ladda.

## Alternativ som övervägdes
- **fast-tflite för skaftet, egen modul bara för pose:** ger två TFLite-kopior i iOS-binären
  (punkt 1). Två olika gränssnitt och JS-förbehandling.
- **En gemensam modul för pose och shaft:** kopplar ihop två oberoende livscykler (pose live,
  skaftet i burst efter slaget) och gör att ett native-beroende inte kan bytas utan att det andra
  följer med.
- **Pose-plugin från npm:** inget håller på VC5 (punkt 2), och flera stryper till 15 fps.
- **Avkodning av skaftet natively:** snabbare med några ms, men då finns `shaftPostprocess` i tre
  kopior (TS för webben, Kotlin, Swift), och utslagen kan börja skilja sig mellan plattformarna.
- **LiteRT 2.x (`CompiledModel`) på Android:** ett nyare API, men inte mätt med shaft-v2. Kan prövas
  i N-3.3 om GPU-delegaten i 1.4.2 inte räcker.

## Konsekvenser
- Två native-implementationer per modul. Det är bara förbehandling och inferens; logiken ligger i core.
- Specerna är kontraktet. Ändras en spec körs `npm run specs` (nitrogen) i `apps/mobile`, och
  genererad kod checkas in.
- Android kan inte få samma krock som iOS: MediaPipe bär sin TFLite statiskt i
  `libmediapipe_tasks_jni.so`, LiteRT ligger i `libtensorflowlite_jni.so`, och Java-paketen
  överlappar inte (`com.google.mediapipe` mot `org.tensorflow.lite`). N-3.1 verifierar det med ett
  bygge och genom att ladda båda biblioteken i samma process.
- **Omprövning** om Core ML direkt inte når skaftets paritet på iOS (N-3.7/N-3.8), eller om LiteRT
  GPU inte klarar burst 26 på Android (N-3.3).
