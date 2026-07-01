# SwingCheck — Handoff / Överlämning

> Aktuell kontext för en ny session. Läs tillsammans med [BACKLOG.md](BACKLOG.md) (auktoritativ för gjort/kvar).
> Stabil arkitektur: [../KONTEXT.md](../KONTEXT.md). Senast uppdaterad: 2026-07-01.

## Tech stack
- **Frontend:** React 19 + TypeScript + Vite 8, Tailwind v4, Zustand (vissa stores `persist`:ade).
- **Backend:** En Cloudflare Worker (`worker/worker.ts`) — proxy mot Anthropic + `/api/log` → D1.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching.
- **Lagring:** IndexedDB (`idb-keyval`) som källa till sanning; Supabase valfri metadataspegling.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`.

## Fungerar
> Funktionerna finns i kod och är mergade (PR #9–#15). Fält-/enhetsverifiering spåras i [BACKLOG.md](BACKLOG.md).

- Kamera/inspelning, rörelsebaserad bildruteval (`frameExtractor.ts`).
- Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst.
- Handsfri sessionsläge (autospela in nästa sving).
- i18n (browser-/geo-detektering), tema + accentfärg, PWA-uppdateringsbanner.

## Pågående

### Pågående: Pose-estimering (Ström D)
- **Status:** D-1 pass 1 klart. `@mediapipe/tasks-vision` integrerat **vid sidan om** `frameExtractor.ts` (rör den ej). `lib/poseDetector.ts` (singleton, GPU→CPU-fallback, WASM från jsDelivr-CDN), `lib/poseTrajectory.ts` (seekar dold video ~15 fps, 33 punkter/sampel), `lib/poseConnections.ts`. `FramePreview.tsx` ritar skelett-overlay bakom `VITE_DEV_PREVIEW` (dynamisk import → lazy chunk). Modell hämtas via `npm run pose:model` (gitignorad). Laddnings-/inferenstid loggas. Ingen fasdetektion än. Bygger + lintar rent; **ej fältverifierad**. Nästa: självhosta WASM, härled svingfaser ur handled-/axelbanor, utvärdera mot `frameExtractor.ts`. Detaljer i [pose-detection.md](pose-detection.md).

### Pågående: Voice-start
- **Ström A, status:** A-1 + A-2 klara. A-1 `useMicTrigger` gör mic-capture + normaliserad RMS-energiström (0–1). A-2 lägger `EnergyTrigger` (`src/lib/audioTrigger.ts`, ren/testbar) + `useEnergyTrigger` (`src/hooks/useEnergyTrigger.ts`) ovanpå: adaptiv baslinje-trigger på amplitud-spik, cooldown, kalibrering, TTS-ack "Startar inspelning" + puls, läs/skrivbar config (`thresholdFactor`/`cooldownMs`/`absoluteFloor`). Bygger + lintar rent; **ej enhets-/fältverifierad** (iOS-tap + range-brus mäts i A-5, kräver Eriks telefon via `npm run dev`). Nästa: A-3 (integrera röststart i session-läge + `swingStartTimestamp`). Detaljer i [voice-start.md](voice-start.md).

## Kritiskt olöst

### Swing detection
> Tidigare egen handoff (`swing-detection-handoff.md`), nu inlemmad här. Senast uppdaterad: 2026-06-01.

**Mål:** `src/lib/frameExtractor.ts` ska välja 10 bildrutor som faktiskt täcker svingen
(address → backswing → top → downswing → impact → follow-through). För klipp längre än
~6 s valde den gamla logiken fel. Vald väg: **rörelsebaserad omarbetning utan nya beroenden**
(framför pose-estimering), för scenariot *en riktig sving + lång setup*. Se även [ADR-0001](adr/0001-motion-based-swing-detection.md).

**Kärninsikten (viktigast):** en pixel-diff-rörelsemetrik **kan inte se ballträffen**. Vid
impact rör sig bara en tunn, snabb klubba → få pixlar ändras → impact ligger i en motion-**dal**.
Den stora kroppsrotationen i **follow-through** dominerar metriken. Därför är "hitta motion-toppen =
impact" fundamentalt fel — den landar på follow-through. Det metriken *ser* pålitligt: **address** =
den långa stillheten före svingen; **follow-through** = den stora rörelsen efter impact; **impact** =
övergången mellan dem. → Vi ankrar på **address-stillheten**, inte motion-toppen.

**Nuvarande approach (implementerad i `frameExtractor.ts`):**
1. Nedskalad motion-canvas (~360 px) — vid full 1080p gör sensor-/codec-brus att ~12 % av pixlarna
   "ändras" varje bildruta även när allt är stilla; nedskalning medelvärdar bort det.
2. Motion-metrik = andel centrumviktade pixlar vars luma ändrats över tröskel, efter subtraktion av
   global ljusförskjutning (robust mot autoexponering/vitbalans).
3. Grov skanning av hela klippet (12 fps, capped) → utjämnad motion-kurva.
4. Address = längsta sammanhängande "stilla"-sekvens; `impact ≈ första rörliga bildrutan efter`.
   Fallback till global motion-topp om ingen tydlig stillhet finns.
5. Fönster = `[impact − 1.2 s, impact + 1.2 s]`, trimmat om rörelsen lägger sig igen.
6. 10 bildrutor jämnt spridda; närmast uppskattad impact tvingas till `impact`-etiketten.

Tunables överst i filen: `SWING_PRE_SEC`, `SWING_POST_SEC`, `MIN_STILL_SEC`, `SETTLE_SKIP_SEC`,
`MOTION_PIXEL_THRESHOLD`, `MOTION_MAX_DIM`.

**Status:** Address-ankrad detektering bygger + lintar rent, men är **inte verifierad** på testklipp
av användaren. Förväntat resultat på testklippet (9.58 s, impact ≈ 6–7 s): frames ~5.8–8.2 s.
Om den ändå missar svingen → **eskalera till pose-estimering** (MediaPipe Tasks Vision / MoveNet
in-browser) för att spåra klubba/händer och hitta impact direkt. **Denna eskalering utforskas nu i
Ström D** (byggs vid sidan om `frameExtractor.ts`); se [pose-detection.md](pose-detection.md).

**Verifiering:** `npm run dev` (ej build — SW-cache). `VITE_DEV_PREVIEW=true` visar bildrute-preview +
🐞 Logs. Ladda upp klipp, filtrera modul `FrameExtractor`, läs WARN `"Swing detection summary"`
(`impactSec`, `frameTimesSec`, `curveDigest`, `usedFallback`).

**Återstående städning:** WARN-loggarna `"Swing detection summary"` + `curveDigest` + `topPeaks` är
tuning-debug — nedgradera till `debug` eller ta bort före merge. Ändringarna lever okommittade i
working tree på `main`; gren av innan commit.

_(Övriga kritiska/olösta punkter fylls i allteftersom de uppstår.)_

## Känd teknisk skuld
> Sammanställd från [BACKLOG.md](BACKLOG.md); fylls på vid behov.

- **RLS på `swing_records` är på men saknar policies** → alla läsningar nekas, faller tyst tillbaka till IndexedDB. (Ström B)
- **Ingen autentisering** — Supabase-rader har `user_id = null`. (Ström B)
- ~~App-ikon är emoji (🏌️) med renderingsrisk per plattform.~~ **Löst (C-1):** emoji renderas till statiska PNG:er vid bygge (ingen runtime-varians); dedikerad full-bleed maskable-ikon tillagd. (Ström C)
- **iOS Safari PWA ej verifierad** (installation/standalone/splash/safe-area). (Ström C)
- **Okommitterad swingdetektering** i working tree + kvarvarande tuning-WARN-loggar (se ovan).

## Komponentstruktur
> Endast de mest centrala filerna; full karta finns i koden.

- `src/App.tsx` — vy-routing via `session`-storens `view` (ingen router).
- `src/store/` — `session`, `settings`, `rules`, `onboarding`, `toast` (Zustand).
- `src/hooks/` — `useCamera`, `useHistory`, `useRangeMode`, `useMicTrigger` (Ström A, mic-capture + RMS-energiström), `useEnergyTrigger` (Ström A, energi-trigger ovanpå A-1).
- `src/lib/` — `frameExtractor`, `api`, `prompt`, `cameraAngle`, `supabase`, `tts`, `i18n`, `logger`, `geo`, `audioTrigger` (Ström A, `EnergyTrigger`), `poseDetector`/`poseTrajectory`/`poseConnections` (Ström D, pose-estimering).
- `src/components/` — `Camera/`, `Analysis/`, `Rules/`, `History/`, `Home/`, `Settings/`, `Onboarding/`.
- `src/data/ruleLibrary.ts` — fördefinierade regler + drills.
- `worker/worker.ts` — Anthropic-proxy + `/api/log` (D1).

_(Nya filer från Ström A/B/C läggs till av respektive session — t.ex. `hooks/useMicTrigger.ts`, `store/auth.ts`.)_

## Miljövariabler
| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Cross-device-historik (med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Bildrute-preview + 🐞 Logs-panel. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |
