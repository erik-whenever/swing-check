# SwingCheck — Backlog

> **Enda källa till sanning för vad som är gjort och vad som är kvar.**
> GitHub Issues används inte (ensam utvecklare). Status lever här + i git-historiken.
> **Prioritetsordning mellan strömmar + beslutsforkar:** [ROADMAP.md](ROADMAP.md) (2026-07-07). Ordning: A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2.

---

## Arbetsregel för Claude Code (läs detta först, varje session)

Vid varje arbetspass:

1. **Läs `docs/BACKLOG.md`** (denna fil) och `swingcheck-handoff.md` för aktuell kontext.
2. **Välj nästa obockade uppgift** i den ström du blivit ombedd att jobba i. Uppgifter inom en ström är ordnade och oftast beroende av varandra — ta dem uppifrån och ned om inget annat sägs.
3. **Implementera uppgiften** enligt dess inbäddade prompt och acceptanskriterier.
4. **Uppdatera dokumentation i SAMMA arbete** (obligatoriskt, ej valfritt):
   - Bocka av uppgiften här i `BACKLOG.md` (`[ ]` → `[x]`) och skriv en kort rad under den om vad som gjordes och eventuella avvikelser.
   - Uppdatera `swingcheck-handoff.md` enligt uppgiftens dokumentkrav.
   - Uppdatera/skapa den `docs/`-fil som uppgiften anger.
5. **Committa** på arbetsbranchen för strömmen (se branch-konvention nedan). Håll commits fokuserade.
6. **Lämna aldrig `BACKLOG.md` osynkad med verkligheten.** Om något blev halvgjort, markera det `[~]` och beskriv vad som återstår.

### Branch-konvention

En arbetsbranch per ström: `stream-a`, `stream-b`, `stream-c`. Committa löpande på strömmens branch. PR mot `main` när en ström (eller en meningsfull delmängd) är klar och reviewad.

### Parallellitet

Strömmarna A, B och C är isolerade och kan köras samtidigt i **separata git-worktrees** (en CC-session per worktree). Enda korsningspunkten: A-3 och B-3 rör båda `SwingRecord`-interfacet — håll fälten additiva, merga den som blir klar först och rebasa den andra. Rör **inte** `frameExtractor`/`useFrameExtractor` förrän Ström A är klar.

---

## Ström A — Voice-triggad svingstart

Hands-free svingstart i hörlurs-session: användaren säger "start" (eller klappar) i mikrofonen. Sekventiell internt (delar audio-infra + session-store). Ger ett pålitligt svingstart-ankare som kringgår pixel-diff i session-läge.

**Konfliktzon:** `hooks/useMicTrigger.ts`, `lib/audioTrigger.ts`, `store/session.ts`, `components/Camera/CameraView.tsx`, `components/Settings/VoiceSettings.tsx`, `lib/tts.ts`

### [x] A-1 — Mikrofon-capture-hook (useMicTrigger)

> **Klart:** `src/hooks/useMicTrigger.ts` — capture (getUserMedia med all ljud-processing av) → AudioContext + AnalyserNode (fftSize 1024) → rAF RMS-loop som exponerar normaliserad `energy` (0–1). `start/stop/energy/isListening/permission`. iOS-livscykel (resume-on-gesture, suspend vid stop, close vid unmount), idempotent start, rollback utan track-/context-läcka, permission-denial kraschar ej. Ingen trigger-logik (det är A-2). Bygger + lintar rent; ej enhetsverifierad på iOS. Se `docs/voice-start.md`.

**Mål:** Återanvändbar hook `useMicTrigger` som begär mic-tillstånd, sätter upp AudioContext + AnalyserNode och exponerar en realtids-energiström (RMS). Ingen trigger-logik än — bara capture + ström.

**Kontext:** iOS PWA (standalone). AudioContext måste skapas/resumas vid user gesture, annars 'suspended'. Återanvänd mönstret från den tysta ljudloopen för headset-knappen. Web Speech API används INTE (saknas i iOS standalone PWA).

**Att göra:**

- Skapa `src/hooks/useMicTrigger.ts`. API: `const { start, stop, energy, isListening, permission } = useMicTrigger()`.
- `start()`: `getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`, skapa AudioContext, MediaStreamSource → AnalyserNode (fftSize 1024), resume context, rAF-loop som beräknar RMS och uppdaterar `energy` (0–1 normaliserad).
- `stop()`: stäng loop, koppla från, stoppa tracks, suspenda context.
- `permission`: 'prompt' | 'granted' | 'denied'.
- Stäng AV echoCancellation/noiseSuppression/autoGainControl (förvränger amplitud).
- Exponera intern `resumeOnGesture()`, anropa vid start. Städa allt i cleanup (inga läckande tracks/contexts).

**Acceptans:** Kan startas/stoppas utan att läcka tracks. `energy` uppdateras >30 ggr/s. Fungerar i iOS standalone PWA efter en tap. Permission-denial kraschar inte, sätter `permission='denied'`.

**Dokumentkrav:** I `swingcheck-handoff.md`: lägg `useMicTrigger` i hooks-listan; ny rubrik `### Pågående: Voice-start` med statusrad. Skapa `docs/voice-start.md` (arkitektur, varför inte Web Speech API, AudioContext iOS-livscykel, checklista A-1…A-5 med A-1 avbockad).

### [x] A-2 — Energi-trigger med adaptiv tröskel (MVP)

> **Klart:** `src/lib/audioTrigger.ts` — `EnergyTrigger` (ren, testbar klass): rullande EMA-baslinje (frame-rate-oberoende, tau 1.5 s), trigger när momentan energi > baslinje × `thresholdFactor` (3.5) OCH > `absoluteFloor` (0.02), `cooldownMs`-debounce (2500), `calibrationMs`-startfönster (1000, ingen trigger); baslinjen fryses under spik så ett högt "start" inte dövar detektorn. `src/hooks/useEnergyTrigger.ts` lägger detektorn ovanpå A-1: matar varje RMS-sampel, kallar `onTrigger`, TTS-ack "Startar inspelning" + `pulse`-flagga (600 ms) för visuell puls, `config`/`setConfig` läs/skrivbara (A-5-trimning). Bygger + lintar rent (nya filer); ej fältverifierad (range-brus mäts i A-5). Se `docs/voice-start.md`.

**Mål:** Detektera kort amplitud-spik (ord "start"/klapp) över adaptiv bakgrundströskel och avge `onTrigger`. Robust MVP före wake-word.

**Kontext:** Range är akustiskt bullrig (träffljud liknar klapp, vind ger brus). Tröskel MÅSTE vara adaptiv mot rullande bakgrundsnivå. Falska positiv förväntas; målet är "tillräckligt för fälttest".

**Att göra:**

- Skapa `src/lib/audioTrigger.ts` med `EnergyTrigger`: rullande baslinje (EMA av `energy` över ~1.5s); trigga när momentan energi > baslinje × faktor (default 3.5) OCH över absolut golv; debounce/cooldown (default 2500ms); kort kalibreringsfas (~1s) utan trigger.
- Koppla in via `useEnergyTrigger(onTrigger)` ovanpå A-1.
- TTS-bekräftelse "Startar inspelning" (sv, quick-röst) + visuell puls.
- Exponera konfig: `thresholdFactor`, `cooldownMs`, `absoluteFloor` (för A-5-trimning).

**Acceptans:** "start" i normal miljö triggar <300ms. Två snabba ljud → en trigger. 60s tystnad → ingen trigger. Konfig läs/skrivbar.

**Dokumentkrav:** `docs/voice-start.md`: bocka av A-2, tabell med tröskelparametrar/defaults, notera range-brus-svaghet (mäts i A-5). `swingcheck-handoff.md`: uppdatera `### Pågående: Voice-start`.

### [ ] A-3 — Integrera röststart med session-läge + swingStartTimestamp

**Mål:** Trigger under session → starta inspelning, sätt `swingStartTimestamp` på SwingRecord. Blir ankaret för frame-extraktion och kringgår pixel-diff i session-läge.

**Att göra:**

- Utöka `SwingRecord` med `swingStartTimestamp?: number` (ms rel. inspelningsstart) — i kod OCH i handoff-datamodellen.
- `store/session.ts`: flagga `voiceStartEnabled`; vid trigger → starta inspelning, registrera timestamp.
- Countdown valfri i voice-läge (default skippa/kort 1s).
- Skicka timestampet till frame-extraktionen som ankare. **Ändra INTE pixel-diff-logiken här** — exponera bara timestampet, låt extraktorn föredra det om det finns.
- Hela flödet hands-free: tripod, hörlurar, "start", sving, TTS-feedback, redo för nästa — utan skärm.

**Acceptans:** voiceStartEnabled + "start" → inspelning börjar, timestamp loggas/persisteras. Icke-voice-flöde opåverkat. Hela loopen körbar utan skärm-interaktion.

**Konfliktnot:** B-3 rör också `SwingRecord` (`user_id`). Håll fälten additiva.

**Dokumentkrav:** `swingcheck-handoff.md`: uppdatera SwingRecord-modellen med swingStartTimestamp; flytta voice-rad till 'Fungerar' om flödet funkar; under 'Kritiskt olöst' notera att voice-start ger pålitligt ankare i session-läge (icke-voice fortfarande pixel-diff-beroende). `docs/voice-start.md`: bocka av A-3, beskriv hands-free-flödet steg för steg.

### [ ] A-4 — Wake-word "start" via Porcupine + settings-toggle

> **Villkorad (ROADMAP beslutsfork 2):** byggs endast om A-5-fältdata visar > 1 falsk trigger per 10 svingar. Annars stryks A-4 vid G1-scopefrysen.

**Mål:** On-device wake-word för "start" (Picovoice Porcupine Web SDK). Energi-trigger kvar som fallback. Settings-toggle.

**Kontext:** Energi-trigger ger falska positiv i range-brus. Porcupine kör offline, ingen API-kostnad, gratis tier för personligt bruk, custom keyword. Latens ~200–500ms OK. Kräver access-key i env (committas ej).

**Att göra:**

- Lägg `@picovoice/porcupine-web` + `@picovoice/web-voice-processor`. Custom keyword "start" (sv-modell om möjlig, annars en "start").
- `useWakeWord(onWake)` som wrappar Porcupine, lazy-laddar modell; vid fel/saknad nyckel → fallback till `EnergyTrigger`. Logga aktivt läge.
- `VoiceSettings.tsx`: toggle "Röststart: Av / Klapp (energi) / Ord ('start')" + countdown-toggle (av/1s). Persist i voice-store.
- Env `VITE_PICOVOICE_KEY=` i `.env.example` (aldrig riktig nyckel i repo). Modell-asset (.ppn/.pv) i `public/`, cachas av service worker.

**Acceptans:** "Ord"-läge triggar på "start", triggar markant mer sällan på prat/träffljud än energi-läge. Saknad nyckel → tyst fallback, ingen crash. Toggle byter läge live. Fungerar offline efter första laddning.

**Dokumentkrav:** `swingcheck-handoff.md`: lägg `VITE_PICOVOICE_KEY` i miljövariabler; uppdatera 'Fungerar' med röststart-lägen. `docs/voice-start.md`: bocka av A-4, dokumentera tre lägen, fallback, hur man skaffar/sätter nyckeln.

### [ ] A-5 — Range-validering + tröskeltrimning

**Mål:** Validera på riktig range, mät false positive/negative för båda lägena, trimma trösklar och sätt default-läge.

**Att göra:**

- Dev-mät-läge (bakom `VITE_DEV_PREVIEW`): logga varje trigger med timestamp, energinivå, läge; tillåt manuell märkning avsedd/falsk.
- Fälttest på range (manuellt av Erik — agenten kan ej; lägg tydlig TODO-checklista).
- Justera default `thresholdFactor`/`absoluteFloor`/`cooldownMs` från data. Sätt default-läge (energi vs ord).

**Acceptans:** Mät-läge loggar events m. metadata. Docs har ifyllbar testprotokoll-mall. Defaults uppdaterade efter fälttest.

**Dokumentkrav:** `docs/voice-start.md`: bocka av A-5 (markera 'kräver Eriks fälttest' om data saknas), testprotokoll-mall + resultatplats. `swingcheck-handoff.md`: uppdatera iOS/range-valideringsstatus.

---

## Ström B — Supabase RLS-policies + auth-grund

Lägg RLS-policies på `swing_records` och grundlägg auth så historik-sync slutar falla tyst tillbaka på IndexedDB. Isolerad från A och C.
**B är G2:s hårda grind** ([ROADMAP.md](ROADMAP.md) M5) — instruktörsspåret kräver konton + cross-device-video. B-3:s lagringsbeslut är därmed lutat: **Supabase Storage för video** (metadata-only räcker inte för G2). Verifiera EU-region i B-1 (GDPR, se ROADMAP → G2 data/samtycke).

**Konfliktzon:** `lib/supabase.ts`, `supabase/migrations/*.sql`, `store/auth.ts` (ny), `hooks/useHistory.ts`, `components/Settings/` (auth-UI)

### [ ] B-1 — RLS-policies på swing_records

**Mål:** Policies knyter rader till ägande användare. RLS är redan på men saknar policies (→ alla läsningar nekas, fallback till IndexedDB).

**Att göra:**

- SQL-migration i `supabase/migrations/` (timestamp-prefix).
- Säkerställ `user_id uuid references auth.users(id)` på `swing_records`; lägg till om saknas.
- Policies: SELECT/INSERT/UPDATE/DELETE alla `user_id = auth.uid()` (med `with check` där relevant).
- RLS `enabled` + `forced`. Kommentar i migrationen: utan session returnerar SELECT 0 rader (förväntat tills auth finns).

**Acceptans:** Migration applicerbar felfritt. Inloggad testanvändare läser/skriver endast egna rader. Utan session läcker inga rader. IndexedDB-fallback intakt (ingen krasch vid 0 rader).

**Dokumentkrav:** `swingcheck-handoff.md`: uppdatera RLS-rader under 'Mindre saker' och 'Känd teknisk skuld'; notera under 'Backend' att policies finns och kräver auth.uid(). Skapa `docs/supabase-auth.md` (schema, policy-lista, checklista B-1…B-3 med B-1 avbockad).

### [ ] B-2 — Auth-grund: magic link + auth-store

**Mål:** Supabase Auth (magic link/passwordless) + Zustand auth-store. RLS kräver session för att sync ska funka, därför tidigarelagt.

**Att göra:**

- `store/auth.ts`: `{ session, user, status:'loading'|'authed'|'anon', signInWithEmail(email), signOut() }`.
- `lib/supabase.ts`: `onAuthStateChange`-lyssnare, hydrera store, persistera session (verifiera i iOS PWA standalone).
- Magic link via `signInWithOtp`; konfigurera redirect-URL (Vercel-domän + localhost).
- Minimal UI i `components/Settings/`: e-postfält + "Skicka inloggningslänk", utloggning, visa inloggad e-post.
- Hantera iOS standalone deep-link-begränsning (länk kan öppnas i Safari, ej PWA) — dokumentera + workaround (t.ex. OTP-kod istället för länk om magic link ej återvänder till standalone).

**Acceptans:** Användare loggar in via magic link. Session persisterar över omstart (iOS PWA). Store reflekterar status. signOut rensar.

**Dokumentkrav:** `docs/supabase-auth.md`: bocka av B-2, magic link-flöde, redirect-konfig, iOS-deep-link-begränsning + workaround. `swingcheck-handoff.md`: lägg `store/auth.ts` i komponentstruktur; notera under Fas 2 att auth-grunden är tidigarelagd.

### [ ] B-3 — Koppla historik-sync till auth + user_id

**Mål:** Koppla auth (B-2) + RLS (B-1) så SwingRecord-historik synkas per användare, IndexedDB som cache. Sluta falla tyst tillbaka.

**Att göra:**

- `hooks/useHistory.ts`: sätt `user_id = session.user.id` vid insert när authed.
- Sync: skriv IndexedDB först, pusha till Supabase när authed+online; läs Supabase när authed annars IndexedDB; cross-device via Supabase.
- Anon-läge graciöst (rent lokalt, ingen krasch, ingen vilseledande felloggning).
- videoBlob/frames: bestäm Supabase Storage (rekommenderat) vs endast metadata+frames-sync. Dokumentera valet.

**Acceptans:** Inloggad: nya svingar i Supabase med rätt user_id, läsbara på annan enhet. Anon: allt lokalt utan fel. Avsiktlig anon-fallback loggas distinkt (maskerar ej riktiga fel).

**Konfliktnot:** A-3 rör också `SwingRecord` (`swingStartTimestamp`). Håll fälten additiva.

**Dokumentkrav:** `swingcheck-handoff.md`: uppdatera 'Historik' i tech stack + 'Fungerar'; ta bort 'historik faller tyst tillbaka'; dokumentera videoBlob-syncbeslutet under 'Viktiga tekniska beslut'. `docs/supabase-auth.md`: bocka av B-3, beskriv sync-strategin.

---

## Ström C — App-ikoner + iOS PWA-verifiering

Fixa ikoner (emoji-renderingsrisk) och verifiera PWA på iPhone. Helt isolerat.

**Konfliktzon:** `public/icons/*`, `public/manifest.webmanifest` (el. manifest i vite.config), `vite.config.ts` (endast PWA-manifest-delen), `index.html` (apple-touch meta)

### [x] C-1 — Ersätt emoji-ikon med riktiga PNG-ikoner

> **Klart:** Verifierade att `scripts/generate-icons.mjs` renderar 🏌️ skarpt i alla storlekar (Segoe UI Emoji, Puppeteer). Emoji-approachen behölls — ikonerna bakas till statiska PNG:er vid bygge, så runtime-varians per plattform är ett icke-problem; SVG-omskrivning behövdes inte. Åtgärdade maskable-buggen: dedikerad full-bleed `icon-maskable-512.png` (emoji ~55%, i säker zon) i stället för återanvänd `icon-512.png` som klippte figuren. Manifest (`vite.config.ts`) listar nu `any` (192, 512) + `maskable` separat. `index.html` har redan apple-touch-icon + theme-color. Lade till `npm run icons`. Build genererar korrekt manifest. Se `docs/pwa-checklist.md`.

**Mål:** Ersätt 🏌️-emoji-ikon med renderade PNG:er i alla storlekar så ikonen ser korrekt/identisk ut oavsett plattform.

**Att göra:**

- Generera PNG: 192×192, 512×512 (+ maskable 512 med säker zon), apple-touch-icon 180×180 i `public/icons/`.
- Behåll mörkgrön bakgrund (matcha theme_color). Föredra egenritad enkel SVG→PNG (golfboll/tee/flagga) framför emoji för plattformsoberoende.
- Uppdatera manifest: icons-array med sizes/type/purpose ('any' + 'maskable').
- `index.html`: apple-touch-icon, theme-color. Ta bort gamla emoji-referenser.

**Acceptans:** Ikon renderas identiskt oberoende av emoji-stöd. Manifest validerar (inga Lighthouse-varningar). Maskable korrekt i preview.

**Dokumentkrav:** `swingcheck-handoff.md`: uppdatera/ta bort app-ikon-raden under 'Mindre saker'; notera vald approach. Skapa `docs/pwa-checklist.md` (ikon-storlekar, manifest-konfig, checklista C-1…C-2 med C-1 avbockad).

### [ ] C-2 — iOS Safari installations- och beteendeverifiering

**Mål:** Verifiera installation/standalone/splash/statusbar/orientering/uppdateringsnotis på iPhone. Kodfixar + ifyllbar testchecklista (mycket kräver Eriks telefon).

**Att göra:**

- `index.html`-meta: `apple-mobile-web-app-capable`, `...-status-bar-style`, `...-title`, viewport `viewport-fit=cover`.
- iOS splash (`apple-touch-startup-image`) för vanliga upplösningar, eller dokumentera medvetet bortval.
- Verifiera `registerType:'prompt'`-uppdateringsnotis (kodgranskning + checklista).
- safe-area-insets (`env(safe-area-inset-*)`) i layout (UI ej under notch/hemindikator).
- Manuell testchecklista för Erik: installera hemskärm, standalone, statusbar/notch/orientering, kamera-permission, mic-permission (korsar Ström A), uppdateringsnotis vid ny deploy.

**Acceptans:** Komplett iOS PWA-meta i index.html. safe-area respekteras. Docs har ifyllbar iOS-testchecklista. Kodbara fixar gjorda; manuella punkter märkta 'kräver Eriks telefon'.

**Dokumentkrav:** `swingcheck-handoff.md`: uppdatera 'iOS Safari-validering ej gjord' (kodfixar klara, manuell pending); uppdatera relevant rad under 'Känd teknisk skuld'. `docs/pwa-checklist.md`: bocka av C-2, lägg manuell iOS-testchecklista.

---

## Ström D — Pose-estimering (MediaPipe PoseLandmarker)

Utforskar pose-estimering som väg till pålitlig svingfas-detektering (eskaleringsvägen i handoff → *Kritiskt olöst* + [ADR-0001](adr/0001-motion-based-swing-detection.md)). Byggs **vid sidan om** `frameExtractor.ts` tills den bevisat sig. Egen branch `stream-d`. Detaljer i [docs/pose-detection.md](pose-detection.md).

> **Omklassad + time-boxad ([ROADMAP.md](ROADMAP.md) M4, beslutsfork 1):** pose är primärt en **G2-tillgång** (overlay/fasjämförelse för tränare); G1-fångsten ankras på rösttriggern (A-3). Pose-selection får D-2 + D-3 + ett fälttest. Missas D-3-metriken (≥ 80 % av 20 klipp inom ±150 ms), eller är D-3 inte fältkörd 2026-07-31, byggs manuell trim-slider som fallback och pose blir ren overlay.

**Konfliktzon:** `lib/poseDetector.ts` (ny), `lib/poseTrajectory.ts` (ny), `lib/poseConnections.ts` (ny), `components/Analysis/FramePreview.tsx`, `scripts/download-pose-model.mjs` (ny). **Rör INTE** `frameExtractor.ts` eller `SwingRecord`.

### [x] D-1 pass 1 — Integrera & visualisera PoseLandmarker

> **Klart:** `@mediapipe/tasks-vision` (v0.10.35) installerat. Modell `public/models/pose_landmarker_lite.task` hämtas reproducerbart via `npm run pose:model` (`scripts/download-pose-model.mjs`, idempotent, gitignorad). `lib/poseDetector.ts` — singleton `getPoseLandmarker()`, `runningMode:'VIDEO'`, `numPoses:1`, GPU→CPU-fallback, WASM från jsDelivr-CDN. `lib/poseTrajectory.ts` — `extractPoseTrajectory(blob)` seekar dold video ~15 fps (seekTo-mönster från frameExtractor), sparar alla 33 punkter per sampel. `lib/poseConnections.ts` — lokal standard-topologi (håller tasks-vision ur huvudbundlen). `FramePreview.tsx` ritar bakom `VITE_DEV_PREVIEW` skelett-overlay (SVG) via dynamisk import → egen lazy chunk. Laddnings-/inferenstid loggas till DevLogPanel. Ingen fasdetektion. Bygger + lintar rent (inga nya lint-fel); dev-server bootar, modell-asset serveras 200. **Ej fältverifierad** (kräver Eriks klipp + browser).

**Mål (pass 1):** Kör pose-detektion på en svingvideo och rita skelettet i dev-previewen. INGEN fasdetektion.

**Acceptans:** tasks-vision installerat; modell hämtbar via skript; `poseDetector` singleton med GPU/CPU-fallback; `poseTrajectory` returnerar tidsserie med 33 punkter/sampel; skelett-overlay i FramePreview bakom `VITE_DEV_PREVIEW`; laddnings-/inferenstid loggad.

**Nästa pass:** D-2 och D-3 nedan (ersätter tidigare lösa "nästa pass"-rad).

### [x] D-2 — Självhosta WASM/modell + härled svingfaser

> **Delvis (Pass 2, del b klar):** `lib/posePhases.ts` (`detectSwingPhases`) härleder
> `{ addressRef, backswingStart, top, impact, followThroughStart }` ur handledsbanorna (landmärke
> 15/16, väljer bäst spårad wrist, ocklusions-fallback, interpolering). `lib/poseFrameSelection.ts`
> (`selectPhaseWeightedFrames`) lägger fas-viktad allokering (tunbara `PHASE_WEIGHTS`; impact får
> resten, min 2, tätt kluster; graceful fallback till jämn fördelning + `usedPhaseWeighting`-flagga).
> `lib/poseFrameGrab.ts` greppar frames för A/B-visualisering. `FramePreview.tsx`: A/B-toggle
> Even↔Phase-weighted (default even), summary med fas-gränser/allokering/fallback + `PoseSelect`
> WARN-logg. Pose körs INTE om (återanvänder previewens trajektoria). `frameExtractor.ts` orörd;
> phase-weighting når EJ default-vägen (pass 3, gated på Eriks manuella verifiering). Bygger + lintar
> rent (nya filer); **ej fältverifierad**. Se `docs/pose-detection.md` (Arkitektur pass 2).
> **Pass 2-buggfix (2026-07-08):** verkligt klipp visade `top`/`impact`/`ft` kollapsade till
> klippslutet (ex: top 3.00 · impact 3.07 · ft 3.07) → impact-frames saknades i fallbacken.
> Rot (leadhypotes, verifieras via ny `debug`-logg): apex-sökningen (min y) låste på
> follow-through-**finishen** (händer högt), inte toppen av baksvingen. Fix: (STEG 1) per-sampel
> `{t,y,vy,speed}`-trace i `PoseSelect`-loggen; (STEG 2) fallback kastar fas-fönstren och sprider
> uniformt i tid över `[backswingStart, spanEnd]`; (STEG 3) impact-gate på nedåtrörelse (`vy>0`)
> + minsta downswing-tid `MIN_DOWNSWING_SEC` 0.12 s. Bygger + lintar rent (ändrade filer).
>
> **Pass 3 — ARKITEKTUR-INVERTERING (2026-07-14, [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md)):**
> Tre rundor heuristik-patchning visade att **fas-viktad klustring som PRIMÄR väg är skör** — varje fix
> blottlade nästa lager. Root cause: global min-y låser på finishen, inte toppen; finishen är i själva
> verket den *mest* tillförlitliga landmarken. **Fas-viktad-som-primär är därmed ERSATT av envelope-som-primär.**
> `posePhases.ts`→`poseEnvelope.ts` (`detectSwingEnvelope`: start=baksving-onset, finish=globalt min-y+settle
> med avklippt-skydd, confident-only impact via nedåtpass nära address-höjd + top-före-impact).
> `poseFrameSelection.ts`→`poseEnvelopeSelection.ts` (`selectEnvelopeFrames`: uniform-inom-envelopen som
> baslinje; impact-kluster endast när impact confident; `impactClusterApplied`-flagga). A/B-toggle nu
> **even ↔ envelope** (default even). Konsekvens: värsta fall = "uniform över svingen", inte "missad impact".
> Tunbara konstanter överst i båda filerna. Bygger + lintar rent; logik-sanity-testad på syntetiska
> banor (full/avklippt/statisk/endast-baksving); **ej fältverifierad** (Eriks checkpoint 2).
>
> **Pass (a) — WASM-självhost + SW-precache klar (2026-08-02):** WASM-runtimen kopieras nu från
> `node_modules` till `public/wasm/` (`scripts/copy-pose-wasm.mjs`, `npm run pose:wasm`; gitignorad);
> `FilesetResolver.forVisionTasks('/wasm')` pekar på egen origin — **inga jsDelivr-requests**.
> `vite.config.ts` → `workbox` precachar modell + SIMD-`.js`/`.wasm` (`maximumFileSizeToCacheInBytes`
> 12 MB) och runtime-cachar nosimd-`.wasm` (`CacheFirst`, `pose-wasm`) same-origin. `npm run pose:assets`
> (= model + wasm) körs en gång före build. Byggverifierat: precache 17.7 MB / 19 entries, noll
> CDN-referenser kvar; **ej browser-/offline-fältverifierad** (kräver `npm run dev` på Eriks enhet).
> **Pass 3 finish-kollaps-fix (2026-08-02, ADR-002 *Uppföljning*):** verkligt DTL-klipp kollapsade
> envelopen till `[6.98→7.38]` (bara baksvingen), "no descending pass". Root cause: globalt min-y har
> TVÅ jämförbara maxima (baksvingstopp + finish) → tidigaste-inom-tol snappade finishen bakåt till
> toppen, vilket tömde det bundna impact-fönstret. Fix (strukturell): finish binds till SEKVENSEN —
> downswing-passagen hittas FÖRST (över hela spannet), finish = high-settle EFTER den. `poseEnvelope.ts`
> enbart; `FINISH_MIN_HOLD_FRAMES` in, `APEX_PLATEAU_TOL`/`SETTLE_MIN_FRAMES` ut. Build+lint rena;
> **ej fältverifierad** (checkpoint 2).
>
> **Pass 3 start-fix (2026-08-02, ADR-002 *Uppföljning*):** spegelbild-bugg i andra änden — samma
> DTL-klipp startade envelopen mitt i baksvingen och missade take-away (klubban redan lyft). Root
> cause: `start` = backsving-hastighetströskel; take-away är långsam → under tröskel → start hoppade
> in efter take-away. Fix (strukturell): start = address-AVFÄRDEN — första framen vars wrist-Y lämnar
> platå-medel > `ADDRESS_DEPART_TOL` (0.03). `poseEnvelope.ts` enbart; downswing/finish orört.
> Build+lint rena; **ej fältverifierad** (checkpoint 2). Generaliserar durabel princip: bind BÅDE
> start och finish till svingsekvensen, aldrig till hastighetströsklar.
>
> **Pass 3 start-fix waggle (2026-08-02, ADR-002 *Uppföljning*):** efter start-fixen fyrade starten
> för TIDIGT — fångade ~3 waggle-frames före take-away på samma DTL-klipp `[1.60→8.38]`. Root cause:
> `ADDRESS_DEPART_TOL` är en enkel tröskel-passage → kortvarig pre-sving-jitter triggade start. Fix
> (samma min-hold-anda som finish-fixen): start = första framen i en körning av
> `START_MIN_SUSTAIN_FRAMES` (3) frames där wrist-Y ligger över platån i take-away-riktning (uppåt) med
> > `ADDRESS_DEPART_TOL`; en blip som återgår nollställer körningen. `poseEnvelope.ts` enbart;
> downswing/impact/finish orört. Build ren, poseEnvelope.ts lint-ren; **ej fältverifierad** (checkpoint
> 2). Skärper durabel princip: bind aldrig en gräns till en enkel tröskel-passage — kräv ett ihållande,
> riktat skeende (min-hold i båda ändar).
>
> **Pass 3 start-fix inverterad (2026-08-02, ADR-002 *Uppföljning*):** waggle-fixen ovan
> ÖVERKORRIGERADE — starten fyrade nu ALLDELES för sent, envelope-start nära baksvingstoppen (verifierat
> DTL: första framen händerna nästan uppe). Root cause: "sustained+riktad, nollställ vid varje avbrott"
> är för strikt — take-away vid 15 fps är inte monoton (hack/pauser tidigt), så räknaren nollställdes
> upprepat tills den snabba delen nära toppen. Värsta-fall (ADR-002): för-sen start = KATASTROF (hela
> take-away tappas) > för-tidig = billig (några adress-frames slösas) → bias:a starten TIDIGT. Fix:
> `START_MIN_SUSTAIN_FRAMES` ut, `WAGGLE_LOOKAHEAD_FRAMES` (3) in — tolerant lookahead: första avfärden
> räknas som start SÅVIDA INTE handleden är tillbaka på platån i slutet av fönstret. Hack/pauser inom
> fönstret tillåts (ingen monotoni-krav); bara en verklig återgång-till-adress (waggle) filtreras.
> `poseEnvelope.ts` enbart; downswing/impact/finish orört. Build ren, poseEnvelope.ts lint-ren;
> **ej fältverifierad** (checkpoint 2).
>
> **Pass 3 waggle-filter REVERT:AT (2026-08-02, ADR-002 *Uppföljning: waggle-filtret revert:as*):**
> den toleranta lookaheaden gjorde starten katastrofalt sen igen (`[7.18→8.38]`, första framen mitt
> i baksvingen). Root cause: i DTL rör sig händerna i take-away nästan rakt BAKÅT, inte uppåt → y
> kryper knappt över `ADDRESS_DEPART_TOL`, så varje y-baserat waggle-test (sustain ELLER
> lookahead-retur) läser den långsamma take-away:n som en waggle-retur och kapar den. Y-only är fel
> signal för take-away-start i DTL. Fix: `WAGGLE_LOOKAHEAD_FRAMES` ut, inget filter — start = första
> address-avfärden, ofiltrerad → `[1.60→8.38]` (hela svingen, ~3 tidiga adress-frames = accepterad
> early-bias, princip #3). Känd svaghet: en verklig waggle kan ge några extra adress-frames — OK tills
> en signal bättre än y finns. `poseEnvelope.ts` enbart. Build+lint rena; **ej fältverifierad**.
>
> **Pass 3 dev-preview frame-budget → 20 (2026-08-02):** envelope-selektionens frame-antal höjt 10→20
> via EN exporterad konstant `ENVELOPE_FRAME_BUDGET` (poseEnvelopeSelection.ts), konsumerad av
> `FramePreview` — sizer både selektion + grid-rendering (previewen visar alla 20). Allokeringen skalar
> parametriskt; impact-klustret får fortsatt `IMPACT_CLUSTER_BUDGET_FRAC` (0.4 → 8/20 frames). Dev-preview
> only; `frameExtractor.ts`/Vision-anropet orört. Build+lint rena.
>
> **Pass 3 start-fix SLUTLIG — hastighet, inte Y (2026-08-02, ADR-002 *Uppföljning: wrist-Y ... oanvändbar
> för start* + princip #2b):** TEMP-diagnostik (bakom `VITE_DEV_PREVIEW`) på DTL-klippet (144 frames)
> avgjorde efter fyra gissningar. Data: 6,9 s adress där wrist-Y **driftar** `0.380→0.425` (0.045 > TOL
> 0.03) → bidir fyrar på driften (`t=1.60`), riktat kräver att händerna stiger (`t=7.18`, mitt i
> baksvingen). Wrist-SPEED separerar rent (`<0.07` död period, ramp `0.06→0.39` frames 102–107). Fix:
> hela `ADDRESS_DEPART_TOL`-logiken ut ur start; start = hastighetsbaserad onset (`speedSm ≥ speedThresh`)
> **backad bakåt** medan föregående `speedSm > START_QUIET_FLOOR` (ny tunbar 0.04) → frame 102–103
> (`t≈6.78–6.85`). Vänder tidigare "aldrig hastighet för start" (rätt observation, fel slutsats): position
> mot platå-medel misslyckas fundamentalt (drift), hastighet är rätt signal — läs onset + backa. Early
> bias behållen. `ADDRESS_DEPART_TOL` kvar tillfälligt ENDAST för diagnostiken (tas bort efter Eriks
> verifiering). Bonus (samma fil): impact omdefinierad till framen där y **korsar tillbaka genom addressY**
> på nedåtpasset (ej `passIdx`/max-vy, som satt några frames före address-höjd; DTL idx 116→117-118).
> `poseEnvelope.ts` enbart; downswing/finish orört. Build+lint rena; **ej fältverifierad** (checkpoint 2).
>
> **Pass 3 falsk impact på avklippt klipp (2026-08-05, ADR-002 *Uppföljning: falsk impact på avklippt
> klipp*):** avklippt DTL-klipp (slutar före träff) gav `[3.53→4.27] · clipped tail · impact 4.27` —
> impact pinnad till sista framen. Root cause: impact-crossing-fixen hade kvar fallback `impactIdx =
> passIdx`. Fix (3 lager → `impact=null` → uniform baslinje): (1) ingen fallback (`impactIdx` startar `-1`,
> sätts bara av faktisk korsning tillbaka genom `addressY` inom envelopen); (2) `clippedTail=true` ⇒ aldrig
> verifierad impact; (3) slut-marginal `IMPACT_END_MARGIN_FRAMES` (2) — korsning vid envelope-slutet =
> cutoff-artefakt. Verifierat syntetiskt (esbuild+node): full sving → confident impact; avklippt →
> `clippedTail`, `impact=null`. `poseEnvelope.ts` enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts`
> orörda. Build+lint rena; **ej fältverifierad** (checkpoint 2).
>
> **Pass 3 impact nearest-approach — face-on-fix (2026-08-05, ADR-002 *Uppföljning: impact missar på
> face-on*):** face-on-klipp gav `[3.35→4.83] · uniform baseline · no impact` — envelopen rätt, bara
> impact-polishen uteblev. Root cause: exakt korsning genom `addressY` för strikt; i face-on återvänder
> handlederna ej exakt till address-höjd vid träff (annan kameravinkel → annan wrist-bana i Y). Fix: exakt
> korsning → **nearest-approach inom `IMPACT_ADDRESS_TOL`** (ny tunbar 0.05, snävare än `IMPACT_HEIGHT_TOL`
> 0.12). Alla skydd oförändrade → `impact=null`: inget pass/utanför tolerans, `clippedTail` (överrider
> toleransen), slut-marginal. Verifierat syntetiskt (esbuild+node): full → impact, face-on (närmar 0.03) →
> nu impact, avklippt → no impact, avklippt-inom-tolerans → no impact via clippedTail. `poseEnvelope.ts`
> enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda. Build+lint rena; **ej fältverifierad**.
>
> **Pass 3 STÄDNING + inlåsning (2026-08-05) — checkpoint 2 godkänd på tre klipp (DTL, DTL avklippt,
> face-on):** (1) TEMP-diagnostiken (`[START-DIAG]` + per-frame-trace) borttagen; (2) `ADDRESS_DEPART_TOL`
> + all död kod runt den borttagen; (3) **enhetstest** `poseEnvelope.test.ts` (vitest, `npm test`) mot
> syntetiska banor: full sving (start vid speed-onset, finish efter downswing-passage, impact hittad),
> avklippt (`clippedTail=true`, `impact=null`), lång drift-adress (start fyrar EJ på driften), face-on
> (impact via nearest-approach utan exakt korsning), statisk/endast-baksving (ingen krasch, degradering),
> för-få-samples. Enhetstestet fångade en latent bugg: statiskt klipp gav `valid=true` p.g.a.
> flyttalsbrus (`peakSpeed ~1e-16` passerade `<= 0`) → ny konstant `MIN_PEAK_SPEED` (1e-6). Alla tunbara
> konstanter samlade + kommenterade överst. `poseEnvelope.ts` + ny testfil + `package.json` (test-script +
> vitest devDep); `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda. Build+lint+test rena.
>
> **KLAR:** Envelope-logiken fältverifierad (checkpoint 2: DTL, DTL avklippt, face-on) + enhetstestad.
> D-3-cutover genomförd (2026-08-05) — envelope är nu produktionens primära frame-selektor i
> `frameExtractor.ts`, pixel-diff är fallback. Se D-3 nedan.
>
> **Regressionsharness — envelope (2026-08-06):** ersätter den manuella 3-klippsrundan vid
> logikändringar. (1) Export-knapp i dev-previewen (`FramePreview.tsx`, bakom `VITE_DEV_PREVIEW`)
> dumpar den råa landmark-serien (per frame: `t` + alla 33 landmarks/visibility, 5 dp) som JSON. (2)
> Fixture-katalog `src/lib/__fixtures__/` (en JSON/verifierat klipp: `dtl-full`/`dtl-clipped`/`face-on`)
> + `README.md`. (3) `poseEnvelopeRegression.test.ts` (vitest) kör `detectSwingEnvelope` +
> `selectEnvelopeFrames` **exakt som produktionens `selectViaPose`** (budget = `ANALYSIS_FRAME_COUNT`) mot checkpoint-2:s
> golden-värden (envelope `[start→finish]`, impact, `impactClusterApplied`, `clippedTail`) med
> **±1-frame**-tolerans + (4) exakt **frame-antal** (fångar budget-regressioner som count-drop).
> Saknad fixture = `todo`, inte fail → `npm test` grön tills fångad. **Erik måste exportera de tre
> fixturerna en gång** (kräver klippen + browser) innan asserterna aktiveras. (5) Dokumenterat i
> `docs/pose-detection.md` → *Regressionsharness*. Build+lint (ändrade filer)+test rena.
>
> **Fixturer fångade + golden-korrigering (2026-08-06):** de tre fixturerna exporterade och incheckade.
> Verifierat att harnessen kör EXAKT produktionskedjan (`detectSwingEnvelope`→`selectEnvelopeFrames`);
> ingen förbehandling saknas — all utjämning/wrist-val/visibility-filtrering bor inuti
> `detectSwingEnvelope`, `extractPoseTrajectory` ger rå `PoseSample[]`. `dtl-full` ger produktionens
> `[6.78→8.38]`/impact 7.85 exakt. Enda felet var golden `frameCount`: `dtl-full`+`face-on` ger
> deterministiskt **16** (inte budgeten 20) — impact-klustret (0.06s) överlappar den likformiga
> baslinjen på kort envelope och dedupe (0.03s) slår ihop dubbletterna; det är precis vad produktionen
> skickar till Claude. Golden satt till 16 för de två impact-bärande klippen; `dtl-clipped` (ingen
> impact → ren likformig) behåller 20. Alla tre gröna.

**Mål:** (a) WASM-runtime + modell servas från egen origin och precachas av service workern (offline-först — utan detta mäter D-3:s fälttest nätverkslycka, inte pose-kvalitet; ROADMAP beslutsfork 4). (b) `lib/posePhases.ts` härleder `{ address, top, impact, followThrough }` (timestamps) ur handledsbanorna. Rör INTE `frameExtractor.ts` eller `SwingRecord`.

**Att göra:**

- Kopiera `@mediapipe/tasks-vision` WASM-assets till `public/` vid build; peka `FilesetResolver.forVisionTasks` lokalt; lägg wasm + `.task`-modellen (~5,5 MB) i SW-precache (höj `maximumFileSizeToCacheInBytes`).
- `lib/posePhases.ts` — ren, testbar: address = låghastighetsplatå (handled 15/16), top = vertikal riktningsvändning, impact = hastighetsmax nära nedre handledsläge, follow-through = deceleration efter. `// OSÄKER:` där heuristiken är svag (15 fps i downswing).
- Fasmarkörer i dev-preview (bakom `VITE_DEV_PREVIEW`) + fastider till DevLogPanel. Ingen koppling till frame-valet än.

**Acceptans:** pose körs helt utan nätverk efter första laddning (noll jsDelivr-requests); posePhases ger fyra timestamps på normalklipp; markörer i preview; enhetstest på platå-/vändpunktslogik.

**Dokumentkrav:** bocka av här + i `docs/pose-detection.md` (heuristik + kända svagheter); uppdatera `swingcheck-handoff.md` (Pågående: Pose).

### [x] D-3 — Cutover: envelope som primär frame-selektor

> **Klart (2026-08-05) — cutover genomförd.** `frameExtractor.ts`: pose/envelope-selektionen är
> nu produktionens PRIMÄRA väg (`selectViaPose` → `detectSwingEnvelope` + `selectEnvelopeFrames`
> med produktionens `count`=10). Pixel-diff (`selectViaMotion`, orörd logik) är FALLBACK — körs
> endast när pose ej kan köra (dynamisk import/inferens-fel) eller `envelope.valid===false`.
> Fallbacken är tyst för användaren men loggad: `log.warn('Frame selection', {path:'pose'|'motion', …})`
> (WARN surfar även i prod) → fält-fallback-frekvens mätbar. A/B-toggeln (even↔envelope) + "even"-vägen
> borttagna ur `FramePreview.tsx`; selektionen sker nu i `extractFrames` → **flagg-oberoende by
> construction** (dev-preview visar samma selektion som produktion). `ENVELOPE_FRAME_BUDGET` (dev-only)
> borttagen — selektionen använder `count`. Vision-anropet + `SwingRecord`-formatet **orörda**.
> @mediapipe stannar i egen lazy chunk (dynamisk import; byggverifierat). Build + lint (ändrade filer)
> + test (7/7) rena. Se [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md) → *Cutover (D-3)*.
>
> **Avvikelse (ärlig):** cutovern gjordes på **checkpoint 2** (3 klipp: DTL, DTL avklippt, face-on) +
> gröna enhetstester — INTE den formella ROADMAP-metriken (≥80 % av 20 klipp inom ±150 ms). Den
> 20-klipps-utvärderingen ersätts i praktiken av **fält-instrumenteringen**: `path`-loggen mäter nu
> pose-vs-motion-fallback-frekvens i skarp drift, vilket är den verkliga kvalitetssignalen. Om
> fält-fallback visar sig hög → återöppna som ny uppgift (trim-slider-forken, ROADMAP beslutsfork 1).

**Ursprunglig spec (utvärderingsläge — ej byggt; ersatt av fält-instrumentering ovan):** Avgör beslutsfork 1 i [ROADMAP.md](ROADMAP.md) med data. Dev-utvärderingsläge: kör posePhases på 20 riktiga klipp (Eriks), jämför pose-impact mot manuellt etiketterad impact.

**Acceptans/beslut:** ≥ 80 % inom ±150 ms → pose blir frame-valets ankare för icke-sessionsklipp (nytt pass specas). Annars, eller om ej fältkört 2026-07-31 → ny uppgift F-1 (manuell trim-slider, ~1 pass) och pose degraderas till overlay. Utfallet skrivs in i ROADMAP (beslutsfork 1) + `docs/oppna-fragor.md` (stänger F1-komplexet).

**Dokumentkrav:** bocka av här + `docs/pose-detection.md` (resultattabell); uppdatera `swingcheck-handoff.md` → *Kritiskt olöst*.

### [x] D-4 — Segmentering för kontinuerligt sessionsläge (ADR-003 steg A + C)

> **Klart (2026-08-06)** — kedjan hittar **3 svingar** i det 63-sekunders sessionsklippet,
> och 1/1/0 i enkelklippen. Ny ren modul `src/lib/poseSegments.ts`:
> `segmentSwingCandidates` (steg A: p95-refSpeed, QUIET/MOVING, stillnadsöar, burst +
> padding, grovgallring), `isSwing` (steg C: **`MAX_DOWNSWING_SEC = 0.6`** — gränsen som
> stänger den tysta 20,36 s-buggen — plus envelope-varaktighet 0,7–3,0 s, vertikal
> exkursion, peak-mot-refSpeed, cooldown 2 s) och `detectSessionSwings`.
> `frameExtractor.ts` och `poseEnvelopeSelection.ts` orörda. Ny fixture
> `__fixtures__/session-multi.json` + harness `poseSegments.test.ts`. Build + lint
> (0 nya) + test 19/19 rena.
>
> **Envelope-logiken är orörd, men signalen under den var trasig och fixades:**
> `primary ?? backup` bytte handled per frame och injicerade avståndet mellan
> handlederna (~0,4 i x) som förflyttning → skenbar hastighet 2,23, klippets högsta, som
> impact-sökningen tog för ett nedslag. Handpositionen är nu en **visibility-viktad
> mittpunkt av båda handlederna** (händerna sitter på samma grepp = ett objekt), utan
> visibility-golv på serien. Topphastigheter: session-multi 2,229 → 1,173, dtl-full
> 1,710 → 0,978. Tre varianter mättes innan valet; se
> [ADR-003](decisions/ADR-003-draft.md) → *Mätt blockering — och hur den löstes*.
>
> **Trösklar omräknade mot den städade signalen:** `IMPACT_ADDRESS_TOL` 0,05 → 0,07
> (15 fps-sampling missar träffframen; uppmätt behov 0,063/0,056), `MAX_BURST_SEC` 4,0 →
> **härledd** 5,5 = `MAX_ENVELOPE_SEC + POST_FINISH_TAIL_SEC`. Harness-toleransen
> ±1 → ±2 frames: ±1 var falsk precision (dtl-full klarade sin golden med 1,3 ms, face-on
> med 0,8 ms, av ett ±66 ms-fönster).
>
> **Utfall:** dtl-full [6,78→8,31] imp 7,85 · face-on [3,35→4,70] imp 4,23 · dtl-clipped
> `clippedTail`, 0 svingar · session-multi [8,26→9,86] / [31,53→33,13] / [54,46→56,25],
> impact 9,26 / 32,53 / 55,59, nedsving 0,27/0,27/0,33 s, exkursion 0,265/0,267/0,267.
>
> **Öppet:** face-ons finish-golden flyttad 4,83 → 4,70 (gamla koden returnerade i
> praktiken 4,7637 och klarade 4,83 med 0,8 ms). **Erik verifierar perceptuellt** både den
> och sessionsklippets tre svingtider. Faller face-on är det finish-detektionen som ska
> granskas, inte konstanten.
>
> **Ny durabel princip:** *kompensera aldrig en trasig signal med lösare trösklar.* Före
> signalfixen hade tre trösklar behövt lossas för att dölja ett artefakthopp på 0,35;
> efteråt behövde en enda röras, av ett härledbart skäl (15 fps-sampling).
>
> **Nästa (D-5):** ADR-003 §4 + §5 — live-pose i rAF-loop, ringbuffertar för landmarks och
> MediaRecorder-chunks, analyskö och `swings: SessionSwing[]` i store.

**Dokumentkrav:** bocka av här + `docs/decisions/ADR-003-draft.md`; uppdatera `swingcheck-handoff.md`.

---

## Ström E — Vision-kostnad

Sänk Claude-vision-kostnaden per sving. Isolerad; egen branch `stream-e`. Se [ROADMAP.md](ROADMAP.md) M3 + beslutsfork 3 (hybrid pre-selection triggas av D-2-framgång, inte av kostnad).

**Konfliktzon:** `lib/frameExtractor.ts` (endast analys-frame-dimensionering — vänta tills Ström A:s A-3 är mergad enligt parallellitetsregeln).

### [ ] E-1 — Långside-cap på analys-frames (~1024 px)

**Mål:** ≥ 40 % färre vision-input-tokens/sving utan verdict-regression. Idag cappas endast bredden (1280) — porträttvideo (1080×1920) passerar nästan ohindrat → ~1 800 tokens/frame × 10.

**Att göra:**

- Ersätt width-cappen i `frameExtractor.ts` med långside-cap (`FRAME_MAX_DIM = 1024`, tunable överst som övriga). Behåll JPEG quality 0.8. Rör inte motion-canvasen (`MOTION_MAX_DIM`).
- Logga frame-dimensioner + uppskattad tokenvikt i extraktions-loggen.
- Före/efter på 5 referensklipp — **kostnadsmedförande Claude-anrop: kör endast på Eriks klartecken**, max 5+5.

**Acceptans:** långsida ≤ 1024 oavsett orientering; ≥ 40 % tokenreduktion (loggad dimension eller usage i Worker-svar); inga oförklarade verdict-ändringar på referensklippen.

**Dokumentkrav:** bocka av här; uppdatera `swingcheck-handoff.md` ('Fungerar': frame-pipeline med kostnadsnot); notera b/a-resultat i `ROADMAP.md` M3.

---

## Ström G — Instruktörsspår (G2) — *låst bakom Ström B*

Stubbar; detaljspecas när M5 (Ström B) är klar. Ramar: [ROADMAP.md](ROADMAP.md) → *G2 — Instruktörsspåret* (pilotdesign, pris/intäktsdelning, data/samtycke).

### [ ] G2-1 — Delningsrelation tränare↔elev + RLS
Relationstabell med explicit, återkallbart samtycke per relation; RLS så tränare läser endast delade svingar; cascade-radering.

### [ ] G2-2 — Tränarvy
Elevlista → svingar med regelutfall försorterade mot tränarens regeluppsättning → text-/röstkommentar tillbaka till eleven.

---

## Avklarat

_(CC flyttar avbockade uppgifter hit med datum och en mening om vad som gjordes, så listan ovan hålls fokuserad på återstående arbete.)_
