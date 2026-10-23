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
| `pose` | MediaPipe tasks-vision 0.10.35 | MediaPipe Tasks iOS (N-3.8) |
| `shaft` | LiteRT 1.4.2 + GPU-delegat | Core ML direkt (N-3.7, N-3.8) |

N-3.1: båda är stubbar. Android länkar in de riktiga biblioteken, och dev-skärmen laddar dem via
`runtimeInfo()`.

## Kommandon

- `npm install`
- `npm start`: Metro för dev-klienten
- `npm run typecheck`, `npm run lint`
- `npx eas-cli build --profile development --platform android|ios`
