# apps/mobile — SwingCheck native (ström N)

Expo SDK 58 (RN 0.88) med dev client · VisionCamera 5.2.3 · Nitro 0.37.1 · react-native-worklets 0.13.
Arkitekturen beskrivs i [ADR-0004](../../docs/adr/0004-native-pipeline-nitro-modules.md).

Inte en npm-workspace. `@swingcheck/core` länkas med `file:` (som i `apps/spike`) så att RN:s React inte
krockar med webbens i rotens `node_modules`.

## Native-moduler

`modules/pose` och `modules/shaft` är lokala Nitro-moduler, länkade med `file:`. Varje modul har en
spec i `src/specs/*.nitro.ts`, och den genererade koden i `nitrogen/generated` checkas in. Efter en
ändring i en spec körs `npm run specs`.

| Modul | Android | iOS |
|---|---|---|
| `pose` | MediaPipe tasks-vision 0.10.35, VIDEO-läge, YUV → RGBA 720×1280 via libyuv (N-3.2) | stubbe, MediaPipe Tasks iOS (N-3.8) |
| `shaft` | stubbe, LiteRT 1.4.2 + GPU-delegat (N-3.3) | stubbe, Core ML direkt (N-3.7, N-3.8) |

**`pose` (N-3.2)** följer [pose-android.md](../../docs/native/pose-android.md) §6. `PoseDetector` är kontraktet för
båda plattformarna. `PoseProbe` finns bara på Android och är mätverktyg: thermal, enhet, klocka och paritet
på en stillbild. Modellerna (`.task`) står med versionsadress och sha256 i `modules/pose/models.json`. Gradle
laddar ned dem till `android/build/` och avbryter vid fel hash. libyuv är vendrad i
`modules/pose/android/third_party/libyuv` (se dess `README.swingcheck.md`).

## Dev-skärmen (N-3.2)

- **Skelett** över förhandsvisningen. Höger sida är orange, vänster blå, och 16 (höger handled) är
  märkt. Autorotation ska vara på (raden visar en varning om UI och rutan har olika orientering).
- **lite/full, gpu/cpu, yuv/rgb** väljs före en körning. `rgb` är jämförelsekörning 6 i pose-android.md §7
  (CameraX konverterar och roterar).
- **30 · Starta 3 min**: en rad per ruta (`convertMs`, `inferMs`, `totalMs`, rotation, delegat, ålder
  mot båda klockorna, om rutan gick till core), thermal och headroom per sekund, samt enhet och SoC.
  Loggen skrivs när körningen tar slut, med sammanfattning (median, p95, p99) och grinden. **Dela logg**
  delar JSON-filen.
- **Paritet** kör stillbilden i appen (lite och full, CPU, GPU och CPU via YUV-rundtur) och jämför de 33
  punkterna mot Python. Stillbilden skapas av `training/pose_parity.py` i `assets/parity/`, som är
  gitignorerad och serveras av Metro. Saknas den, säger dev-skärmen det.

## Kommandon

- `npm install`
- `npm start`: Metro för dev-klienten. Kör bara en Metro åt gången (spikens Metro använder också 8081).
- `npm run typecheck`, `npm run lint`
- `npx eas-cli build --profile development --platform android|ios`
