# KONTEXT — SwingCheck

> Stabil grund: **vad** projektet är och **varför** det ser ut som det gör. Ingen föränderlig status — nuläget står i
> [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md), gjort/kvar i [docs/BACKLOG.md](docs/BACKLOG.md).
> Numrerade beslut: [docs/oppna-fragor.md](docs/oppna-fragor.md). Arkitekturval: [docs/adr/](docs/adr/) och
> [docs/decisions/](docs/decisions/) (delad nummerserie). Senast omskriven 2026-10-25 för native-arkitekturen.

## Vad är SwingCheck

En mobilapp som bedömer en golfsving mot coaching-regler. Användaren filmar eller laddar upp ett klipp, appen
hittar svingen med pose-estimering, plockar ut nyckelbildrutor och låter Claude bedöma dem regel för regel
(pass/fail/cannot_determine) med evidens, förslag och drills. Resultatet kan läsas upp i hörlurarna, så att
man kan träna handsfree på rangen. Kärnprodukten är regelbiblioteket: användaren (och senare tränaren)
bestämmer vad som bedöms.

## Betan (iOS)

Beslutad av Erik 2026-10-25. **Betan är iOS via TestFlight.** Innehåll:
1. **Väldigt snygg design** — ett eget spår (D-1) som börjar med skisser före kod.
2. **Ladda upp klipp → svingen plockas ut → bedöms mot regler.**
3. **Välj regler själv eller få ett rekommenderat regelset** (F-1).
4. **Livesession med feedback i hörlurarna.**
5. **Skälig kostnad och tid per analys, med mätvärden** (V-1 facit, V-2 modellval).

**Skaftet** ingår bara som visuell tracer (N-3.7/N-3.8). Om skaftmått ska in i domarna avgörs av facit (V-1).
**Skär-lista (inte i betan):** Android (N-3.3, N-8), skaftmått i prompten, inloggat konto (ström B/G2).
I stället för konto får Workern en **anonym identitet per installation** med tak per identitet (W-2), före TestFlight.

## Arkitektur

```
iPhone (apps/mobile: Expo 58 + dev client, RN 0.88, VisionCamera 5)
  Kamera 30 fps ─▶ Nitro-modul `pose` (MediaPipe Pose, VIDEO-läge) ─▶ PoseSample
        └▶ @swingcheck/core: liveSwingDetector / poseSegments / poseEnvelope (15 fps tills N-4)
              └▶ svingdetektion ─▶ Nitro-modul `capture` (kodad ring, klipp, FrameExtractor)
                    ├▶ bildrutor för Vision ─▶ core/api.ts ─▶ Cloudflare Worker ─▶ api.anthropic.com
                    └▶ ~26 rutor efter slaget ─▶ Nitro-modul `shaft` (Core ML, shaft-v2) ─▶ tracer
  Lagring lokalt först (resultat + metadata behålls, video rensas efter storlek)
```

- **`packages/core` (`@swingcheck/core`)** — all ren domänlogik i TS utan byggsteg: typer, regelbibliotek,
  prompt, `api.ts`, poseenvelope-kedjan, skaftets efterbehandling (avkodning + NMS) och mätvärden, logger-kärnan.
  Delas av appen och webben. Ingen webb- eller RN-runtime här (`import.meta.env` ger kompileringsfel).
- **Nitro-moduler** i `apps/mobile/modules/` ([ADR-0004](docs/adr/0004-native-pipeline-nitro-modules.md)): ett
  TS-gränssnitt (`.nitro.ts`) per modul, implementerat i Swift och Kotlin. `pose` och `shaft` finns, `capture`
  är specad (N-3.4) och äger klockan (`append(frame)` → `t`). Förbehandling görs natively, aldrig i JS-workleten.
- **Skaftet på iOS körs i Core ML direkt** (`.mlpackage`, samma vikter som `shaft-v2.onnx`). TFLite går inte:
  MediaPipe bär en egen TFLite och två kopior i samma binär ger dubbla symboler (N-2).
- **Cloudflare Worker** (`worker/worker.ts`) — proxy mot Anthropic så att `ANTHROPIC_API_KEY` aldrig når klienten,
  plus `/api/log` till D1. Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching: statisk systemprompt och
  regelblock före bildrutorna, så prefixet återanvänds.
- **Webben (`src/`, PWA)** — föregångaren. Lever kvar som referens för pipelinen och för dataset-, annoterings- och
  träningsverktygen (`training/`, `scripts/`). Ny produktfunktionalitet byggs i `apps/mobile`.

## Domänmodell (källa: `packages/core/src/types.ts`)

- **Rule** — regel med `phase` (address→follow), `weight` (1–3), `angles` (tom = valfri vinkel), valfria `drills`,
  `libraryId` om den kommer från regelbiblioteket (`core/data/ruleLibrary.ts`).
- **RuleResult** — `verdict` (`pass` | `fail` | `cannot_determine`), `confidence` (0–1), `relevant_frames`,
  `visual_evidence`, `observation`, valfritt `short_verdict` (≤ 6 ord, för TTS), `suggestion`/`drill_suggestion`.
- **SwingAnalysis** — kameravinkel, bildkvalitet, synliga faser, ev. `focus_rule`, övriga `rules`, samlad bedömning.
- **SwingRecord** — sparad sving: resultat, metadata, frames, valfri video och `sessionId`.
- **PoseSample** — 33 landmärken + `t` (sekunder från sessionens första ruta).

## Centrala designbeslut

- **Pose bär svingdetekteringen** ([ADR-002](docs/decisions/ADR-002-stream-d-envelope-inversion.md),
  [ADR-003](docs/decisions/ADR-003-draft.md)): segmentering före envelope, impact är polish, aldrig bärande.
  Pixel-diff ([ADR-0001](docs/adr/0001-motion-based-swing-detection.md)) är webbens fallback.
- **Durabla principer:** bind gränser till svingsekvensen, inte till en enkel tröskelpassage; varje gräns med ett
  minimum har också ett maximum; kompensera aldrig en trasig signal med lösare trösklar.
- **Lokalt först** — appen fungerar fullt ut utan konto eller Supabase. Saknade env-variabler = no-op.
- **Worker som enda väg till Anthropic** — nyckeln når aldrig klienten. Kostnaden styrs i Workern (tak, W-2).
- **Kvalitet mäts mot facit** — modellval, prompt och regler avgörs av V-1:s facit, inte av känsla.
- **iOS först** — Android är ett mål, men prestandaarbetet där väntar till efter betan.

## Konventioner

- **Loggning:** `createLogger('Modul')` från core; plattformens skal registrerar sinks (`addLogSink`).
- **Kameravinkel:** internt `'dtl' | 'face-on'` (`core/lib/cameraAngle.ts`), översätts till promptens vokabulär.
- **Språk:** all användartext via i18n; språket är en parameter till prompten och TTS (N-3.5).
- **Design:** Club Cream-tokens ([docs/design-system.md](docs/design-system.md)); betans design ersätts av D-1:s resultat.
- **Kommentarer** förklarar *varför*. Osäkerhet flaggas med `// OSÄKER: …` + kort riskbedömning.
- **Modeller** låses med versionsadress + sha256 (`modules/pose/models.json`, N-7).

## Miljö och hemligheter

| Variabel | Var | Syfte |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Worker (secret) | Anthropic-nyckeln. Aldrig i klienten. |
| `LOG_READ_KEY` | Worker | Skyddar `GET /api/log`. |
| `VITE_API_URL` | webben | Worker-endpoint. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | webben, valfritt | Cross-device-historik. |
| `VITE_DEV_PREVIEW` | webben, valfritt | Bildrute-preview och loggpanel. |
