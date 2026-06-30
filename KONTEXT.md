# KONTEXT — SwingCheck

> Stabil kanonisk grund. Beskriver **vad** projektet är och **varför** det ser ut som det gör.
> Innehåller ingen föränderlig status — sådant ligger i [STATUS.md](STATUS.md).
> Numrerade beslut och öppna frågor: [docs/oppna-fragor.md](docs/oppna-fragor.md). Arkitekturval: [docs/adr/](docs/adr/).

## Vad är SwingCheck

En mobil-först PWA som analyserar en golfsving. Användaren filmar en sving med telefonen,
appen extraherar nyckelbildrutor och låter Claude bedöma dem mot ett antal coaching-regler.
Resultatet visas per regel (pass/fail/cannot_determine) med visuell evidens, förslag och drills,
och kan läsas upp med röst (TTS) för handsfri träning på range.

## Arkitektur (översikt)

```
Telefon (PWA)
  Kamera → MediaRecorder → videoBlob
        → frameExtractor (rörelsebaserad bildrutevalsanalys, helt i webbläsaren)
        → api.ts (bygger prompt + bildrutor)
            → Cloudflare Worker (worker/worker.ts)  [proxy, döljer API-nyckel]
                → api.anthropic.com  (Claude Sonnet 4.5, JSON-svar)
        → IndexedDB (idb-keyval)   [primär lagring: video, frames, resultat]
        → Supabase (valfritt)      [endast metadata + resultat, för cross-device-historik]
```

- **Frontend:** React 19 + TypeScript + Vite 8. Tailwind CSS v4. State i Zustand (flera små stores, vissa `persist`:ade till localStorage).
- **Backend:** En enda Cloudflare Worker. Två ansvar: (1) proxy mot Anthropic så att `ANTHROPIC_API_KEY` aldrig når klienten, (2) `/api/log` som sparar klientens ERROR-loggar i D1.
- **Lagring:** IndexedDB är källan till sanning för svingar (video-blobbar + base64-frames + resultat). Supabase är ett *valfritt* lager ovanpå som speglar enbart metadata + resultat; saknas env-varablerna degraderar allt till no-op och appen kör IndexedDB-only.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`). Prompt caching används: statisk system-prompt + statiskt regelblock markeras som `ephemeral` cache-breakpoints *före* bildrutorna, så återkommande analyser får cache-träffar.

## Domänmodell (källa: `src/types.ts`)

- **Rule** — en coaching-regel användaren vill kontrollera. Har `phase` (address→follow), `weight` (1–3), `angles` (vilka kameravinklar den går att verifiera från; tom = valfri vinkel), valfria `drills`, och `libraryId` om den kommer från regelbiblioteket.
- **RuleResult** — Claudes bedömning av en regel: `verdict` (`pass` | `fail` | `cannot_determine`), `confidence` (0–1), `relevant_frames`, `visual_evidence`, `observation`, samt valfritt `short_verdict` (≤6 ord, svenska — används för TTS i quick-läge), `suggestion`/`correction`/`drill_suggestion`.
- **SwingAnalysis** — hela svaret för en sving: detekterad kameravinkel, bildkvalitet, vilka faser som syns, ev. `focus_rule`, övriga `rules`, samlad bedömning.
- **SwingRecord** — en sparad sving i historiken: video, frames, resultat, kameravinkel och valfritt `sessionId` (grupperar svingar från samma handsfri-session).
- **Regelbibliotek** (`src/data/ruleLibrary.ts`) — fördefinierade `LibraryRule` med drills, som användaren kan lägga till i sina egna regler.

## Centrala designbeslut

- **Rörelsebaserad bildruteval, ingen pose-estimering** (se [ADR-0001](docs/adr/0001-motion-based-swing-detection.md)). Nyckelinsikt: en pixel-diff-metrik kan *inte* se själva träffögonblicket (tunn, snabb klubba → få pixlar ändras → impact ligger i en rörelse-*dal*). Därför ankras detekteringen på **adress-stillheten** (den långa stillastående perioden före svingen), inte på rörelsetoppen. Impact uppskattas till övergången still→rörelse.
- **Worker som proxy** — API-nyckeln får aldrig nå klienten; all Anthropic-trafik går via Workern.
- **Lokalt först** — svingar fungerar fullt ut utan backend-konto. Supabase och inloggning är additiva, inte krav. (Auth finns ännu inte; `user_id` är alltid `null`.)
- **Prompt caching by design** — statiskt innehåll placeras före bildrutor just för att cache-prefixet ska kunna återanvändas.
- **Handsfri sessionsläge** — kameran hålls monterad under analys-overlayn så att stream, ljud-loop och Media Session överlever rundturen och nästa sving kan autospelas in utan ny behörighetsfråga.
- **PWA med `prompt`-uppdatering** (ej `autoUpdate`) — appen visar en explicit uppdateringsbanner (`UpdateBanner`) så användaren väljer när den laddas om. Service worker-cache har historiskt serverat gammal kod; verifiera alltid via `npm run dev`.

## Konventioner

- **Loggning:** använd `createLogger('Modul')` (`src/lib/logger.ts`). ERROR skickas vidare till Workern/D1.
- **State:** en Zustand-store per domän (`session`, `settings`, `rules`, `onboarding`, `toast`). UI-läge styrs av `view` i `session`-storen, inte av en router.
- **i18n:** all användartext via `useT()` / `src/lib/i18n.ts`. Språk autodetekteras (browser-locale + geo), men manuellt val vinner alltid.
- **Kameravinkel:** internt `'dtl' | 'face-on'` (`src/lib/cameraAngle.ts`); översätts till promptens vokabulär (`down-the-line`/`face-on`) vid anrop.
- **Kommentarer:** förklara *varför*, inte *vad*. Befintlig kod har hög andel motiverande kommentarer — matcha den stilen.
- **Osäkerhet flaggas i koden** med `// OSÄKER: …` + kort riskbedömning, hellre än att gissas bort.

## Teknikval & varför

| Val | Varför |
| --- | --- |
| Cloudflare Worker + D1 | Enkel edge-proxy nära användaren; D1 räcker för logglagring utan separat DB. |
| IndexedDB via `idb-keyval` | Videoblobbar är för stora för localStorage; måste fungera offline. |
| Zustand | Lättviktig store utan boilerplate; `persist` för inställningar/regler. |
| Tailwind v4 | Snabb mobil-UI-iteration; tema/accent via `data-`-attribut på `<html>`. |
| Supabase (valfritt) | Cross-device-historik utan att bygga egen backend; hålls icke-blockerande. |
| Claude Sonnet 4.5 | Multimodal bildrute-analys med strukturerad JSON-output. |

## Miljövariabler (se `.env.example`)

| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Aktiverar cross-device-historik (tillsammans med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Visar bildrute-preview + 🐞 Logs-panel under utveckling. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Sätts som secret i Workern, aldrig i klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |
