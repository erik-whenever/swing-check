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

## Ström UI — Visuell identitet "Club Cream"

Ad hoc-ström (utanför A/B/C/D/E), begärd 2026-08-10. Branch: `stream-ui`.

### [x] UI-1 — Club Cream: tokens, primitiver och omgjorda vyer

> **Klart (2026-08-10).** Ny visuell baslinje enligt designexporten: krämiga ytor,
> fairway-grön accent, pillerformer, Outfit (självhostat + precachat). Tokens i
> `src/index.css`, primitiver i nya `src/components/ui/`. Alla produktvyer ombyggda
> (hem, kamera, analys, historik, statistik, regler, bibliotek, inställningar,
> onboarding, toast/banner/sessionsytor).
>
> **Utöver ren omtemning:** analysvyn är EN domlista i stället för fyra tävlande
> färgkort (detaljer fälls ut vid tryck); kameravyns sju kontroller i tre former är
> EN chip-rad; tillstånd bärs av form, inte bara färg; destruktiva regelåtgärder
> ligger ett tryck djupare; i18n täcker nu de ombyggda vyerna på båda språken
> (analysvyn var hårdkodad engelska, historiken hårdkodad svenska).
>
> **Två latenta buggar fixade på vägen:** `safe-top`/`safe-bottom` användes av skalet
> men fanns aldrig som utilities (toppbaren ritades under notchen) — nu definierade,
> plus `viewport-fit=cover` i `index.html` utan vilken `env(safe-area-inset-*)` alltid
> är 0 på iOS. Samma sak för `@keyframes fadeIn`. `Rules/RuleList.tsx` borttagen (död kod).
>
> **Verifierat:** `npm run build`, `npm run lint` (0 nya fel — de 2 kvarvarande är
> pre-existerande i `FrameLightbox.tsx`/`useHistory.ts`), `npm test` 148/148, och
> `npm run dev` serverar de nya utilities:arna. **Ej sedd på en iPhone** —
> safe-area-ändringen är det första som ska kontrolleras där.
>
> Dokumentation: [design-system.md](design-system.md).

### [x] UI-2 — Kameravyn: ett lägesval istället för en chiprad

> **Klart (2026-08-11).** UI-1 samlade kameravyns sju kontroller till EN chiprad, men
> raden blandade fortfarande fyra olika sorters beslut i samma pillerform — läge
> (Session), inmatningsmetod (Hörlursläge), utmatning (Röst + Kort/Detalj) och en
> persisterad inställning (nedräkning) — och scrollade i sidled, så man kunde inte veta
> att allt syntes.
>
> - **Ett `Segmented` "En sving | Session"** är nu enda kontrollen på raden. Det är det
>   enda valet som ändrar vad inspelningsknappen gör. Att växla till "En sving" avslutar
>   sessionen, så textknappen "Avsluta session" i actionraden (dubblett av chipen med
>   samma handler) är borta.
> - **En förklarande rad under lägesvalet.** "Session" bar ingen betydelse på egen hand;
>   `camera.mode.singleHint` / `camera.mode.sessionHint` säger vad läget gör.
> - **`RecordSettingsSheet`** (nytt svepark bakom en kugge) håller nedräkning,
>   uppläsning på/av + Kort/Detalj, och hörlursstyrning. Kuggen tonas i accentfärg när
>   något där inne avviker från standard, så raden rapporterar aktiva överstyrningar
>   utan att visa dem.
> - **🎧-pillen borttagen ur sökaren.** Den upprepade tillstånd som kontrollerna under
>   redan bar, och i en session var den alltid på. Sökaren visar nu bara fångsttillstånd
>   (REC + svingantal).
> - **"Hörlursläge" → "Hörlursknappen styr inspelningen"** med en rad som säger exakt
>   vad knappen gör i varje läge. Det är ren *inmatning* via Media Session, inte ljud ut
>   — det gamla namnet antydde motsatsen. I sessionsläge är switchen låst på, eftersom
>   `startSession()` tvingar på loopen ändå.
> - `Segmented` fick ett additivt `disabled`. Lägesväljaren låses bara i riktningen
>   "starta session mitt i ett klipp" — en pågående session måste alltid gå att avsluta.
> - i18n: `camera.range`/`camera.rangeOn`/`camera.voice`/`camera.on`/`camera.off`
>   borttagna, `camera.mode.*` + `camera.settings.*` tillagda på båda språken.
>   Onboardingens hörlurssteg omskrivet till samma begrepp.
>
> **Verifierat:** `npm run build`, `npm run lint` (28 problem, identiskt med baslinjen —
> inga nya), `npx vitest run` 202/202, och `npm run dev` transformerar alla rörda moduler.
> `/` i dev svarar 500 från miniflare (`fetch failed` i `@cloudflare/vite-plugin` →
> `dispatchFetch`, dvs. innan någon appmodul är inblandad). **Ej isolerat mot en ren
> baslinje** — men felet ligger i Worker-uppstarten och inga Worker-filer är rörda här.
> **Ej sedd på en iPhone** — kontrollera sveparket mot safe-area och att lägesvalet
> går att träffa med tumme på tripodavstånd.
>
> **Kvar av UI-revisionen (ej påbörjat):** tabbaren till 4 flikar (analys är en
> utfallsskärm, inte en flik), ett sessionsband synligt i alla vyer, och
> `SessionSummaryCard` flyttad till hemvyn.

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

---

**⚠️ TILLFÄLLIG AVSTÄNGNING:** `SUPABASE_DISABLED` är satt till `true` i `src/lib/supabase.ts` (2026-08-09). Supabase-projektet är oåtkomligt (nätverksfel) och lagret ger inget värde tills auth är implementerat (B-2) och projektet verifierat nåbart. **Förutsättning för B-1:** Sätt `SUPABASE_DISABLED = false` och verifiera att projektet är nåbart innan B-1 påbörjas.

---

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
> **Inspektionsyta tillagd (2026-08-08):** `src/components/Analysis/SegmentedSwings.tsx`
> (dev-preview only, bakom `VITE_DEV_PREVIEW`) kör `detectSessionSwings` på pose-samplen
> och renderar **en sektion per sving** med egen `selectEnvelopeFrames`-allokering, egna
> frames (via `poseFrameGrab`, inte `currentFrameMeta` — de framesen ÄR enkelenvelope-
> selektionen som vyn finns för att motbevisa), rubrik med envelope-tider/impact/downswing/
> exkursion, skelett-overlay och IMP-markering på framen närmast impact. Loggar per sving
> på INFO (`SwingSegments`): envelopeSec, impactSec, downswingSec, exkursion, frameCount.
> Panelen renderar sig **bara** när klippet innehåller fler än en sving — noll eller en ger
> oförändrat beteende. Tydligt märkt som dev-vy. `frameExtractor.ts` och produktionsvägen
> (CameraView-flödet) orörda; ingenting härifrån når Vision-anropet eller `SwingRecord`.
> Verifierat att panelen ger 17 frames per sving inom respektive envelope på session-multi.
> Build + lint (0 nya) + test 19/19 rena.
>
> **Diagnostik tillagd (2026-08-08):** panelen visas nu **alltid** när pose kört, även vid
> 0–1 sving — "ingen panel" gick inte att skilja från "koden kördes aldrig", och vyn är som
> mest värd när inget hittas. Den visar indata-identitet (sampelantal, span, dt — snabbaste
> sättet att se om fel/kort klipp laddats), segmenteringsstatistik (quiet/moving-frames,
> stillnadsöar, burstar), **varje burst med admitted/culledBy** och **varje kandidat med
> grindens exakta fällande villkor**. Loggning flyttad INFO → **WARN** (logpanelen visar bara
> WARN, så INFO var osynlig). `SegmentationResult.diagnostics` är ett nytt **additivt,
> rent observationellt** fält i `poseSegments.ts` — utan det är grovgallringen tyst och en
> utebliven sving går inte att härleda till segmentering vs grind. Regressionsvakt i
> `poseSegments.test.ts` (20/20). Ingen logikändring; build + lint (0 nya) rena.
>
> **Determinismbugg + impact ur acceptansen (2026-08-08):** inventering visade att kedjan
> var stabil mot `refSpeed` (±15 % → oförändrat 3 svingar) och mot fönsterbredd (padding
> 0,5→3,0 s → oförändrad envelope), men **instabil mot sampelrutnätets läge** — den enda
> variabel som inte var reproducerbar mellan körningar. Två fixar:
>
> 1. **`resetPoseLandmarker()`** (`poseDetector.ts`): `runningMode:'VIDEO'` är ett
>    *tracking*-läge som seedar varje frame med föregående detektion, och landmarkaren var
>    en process-livstids-singleton → körning 2 av samma klipp startade med tillståndet från
>    körning 1:s sista frame (uppmätt `posesDetected` 924/929/924, `refSpeed` ±11 %). Varje
>    extraktion bygger nu en kall instans; `lastGlobalTsMs` borttagen och tidslinjen är
>    per körning från 0 (den växande tidsbasen var själv en determinismrisk). Delegaten
>    cachas så en ombyggnad inte betalar GPU-proben igen. Ny `seriesHash` (FNV-1a över
>    handledsserien) loggas på **WARN** så två körningar jämförs genom att läsa två rader.
> 2. **Impact är inte längre acceptanskrav i `isSwing`** (ADR-002: impact är polish, aldrig
>    bärande). Acceptansen vilar på envelope-struktur: `valid`, `!clippedTail`,
>    varaktighet 0,7–3,0 s, exkursion ≥ 0,08, peak ≥ 0,4×refSpeed, cooldown 2 s.
>    Nedsvingsgränserna gäller fortfarande **när** impact finns. Förutsatte en fix i
>    `poseEnvelope.ts`: `apexY` var bunden av `impactIdx` och degenererade till
>    adresshöjd utan impact → exkursionen läste ≈0 och äkta svingar såg ut som bollplock.
>    `apexY` är nu envelopens globala min-y (alltid definierad); baksvingstoppen finns
>    kvar internt för `downswingSec`. `DetectedSwing.impactSec` är nullbar + nytt
>    `anchorSec`.
>
> **Mätt effekt:** fatala enskilda bildrutor **3 av 925 → 0 av 925**. Subframe-svep
> 0–50 ms: accepterade **3 vid varje förskjutning** (var 3,3,3,2,2,1,1); impact fladdrar
> (3→1 med confident impact) utan att antalet rör sig. Multi-drop 5–50 bildrutor ×3 seeds:
> alltid 3. dtl-full/face-on/dtl-clipped envelopes och impacts bit-identiska.
> Regressionsvakt: "swing count survives losing any single pose frame". Test 21/21.
>
> **Kvar (separat, enligt beslut):** interpolerad impact mellan sampel, och sammanslagning
> av de två handledsserie-implementationerna (`poseEnvelope.ts` + `poseSegments.ts` har var
> sin teckenidentiska `weightedHands` utan test som låser dem till varandra).
>
> **Nästa (D-5):** ADR-003 §4 + §5 — live-pose i rAF-loop, ringbuffertar för landmarks och
> MediaRecorder-chunks, analyskö och `swings: SessionSwing[]` i store.

**Dokumentkrav:** bocka av här + `docs/decisions/ADR-003-draft.md`; uppdatera `swingcheck-handoff.md`.

### [~] D-5 — Kontinuerligt sessionsläge i fångstvägen (ADR-003 §4 + §5)

> **Pass 1 KLAR (2026-08-08) — session-store från singular till lista.** `store/session.ts`:
> `currentFrames` / `currentFrameMeta` / `currentAnalysis` / `isAnalyzing` **borta**, ersatta av
> `swings: SessionSwing[]` där varje sving bär `{ id, status, envelopeSec, impactSec, frames,
> frameMeta, analysis, error }` och status är `detected | extracting | analyzing | done | failed`.
> Actions: `addSwing` (returnerar id) / `updateSwing` / `removeSwing` / `clearSwings`. Den globala
> `isAnalyzing`-boolen finns inte längre — analys är per sving; det som genuint är sessionsvitt
> (låsa inspelningsknappar, grinda hands-free-loopen) läser selektorn `selectAnySwingBusy`, och
> enkelsvingsvyerna läser `selectPrimarySwing` (= `swings[0]`).
>
> **Enkelsvingsflödet är funktionellt oförändrat:** ett klipp → `clearSwings()` + `addSwing({status:
> 'extracting'})` → `extractFrames` → `updateSwing(..., 'analyzing')` → `AnalysisView` kör analysen och
> skriver `done`/`failed` på samma sving. Konsumenter uppdaterade: `CameraView`, `AnalysisView`,
> `FramePreview`, `ShareButton`. `SwingRecord`-formatet är **orört** → redan sparad historik läses
> som förut.
>
> **`envelopeSec`/`impactSec` i pass 1 är härledda, inte äkta:** `frameExtractor.ts` returnerar bara
> frames (och rörs inte i detta pass), så `swingFromExtraction()` läser spannet ur de valda framesens
> `timeSec` och impact ur den frame selektorn märkte `impact` — null när ingen märktes, alltså exakt
> när envelopen saknade confident impact (ADR-002: impact är polish, aldrig bärande). Pass 2 ersätter
> dem med `DetectedSwing`-värdena.
>
> **Två beteendedetaljer värda att känna till:** (1) analys-effekten i `AnalysisView` är nu keyad på
> sving-**id** i stället för frame-arrayens identitet, så statusskrivningarna inte triggar om den
> själv; `frames.length` finns kvar i deps så en sving som når vyn medan den fortfarande `extracting`
> inte fastnar på spinnern. (2) `analysisAngle` ligger kvar globalt — den hör hemma per sving och
> flyttas i pass 2 (utanför denna uppgifts uttryckliga scope).
>
> Nytt enhetstest `src/store/session.test.ts` (11 test) låser den egenskap refaktoreringen finns för:
> sving N+1 kan vara `detected` medan N är `analyzing`, patchar korsar inte, oförändrade svingar
> behåller objektsidentitet (selektorstabilitet), och `swingFromExtraction`-härledningen.
> `poseEnvelope.ts` / `poseSegments.ts` / `frameExtractor.ts` **orörda**. Build + lint (0 nya) +
> test **32/32** rena; dev-servern bootar och alla ändrade moduler serveras 200.
> **Kvar att verifiera av Erik:** enkelsvingsklipp + sessionsklipp i dev-preview.

> **Pass 2 KLAR (2026-08-08) — live-pose + svingdetektering i realtid (ADR-003 §4).** Bevisar
> kärnan i sessionsvisionen: en sving detekteras **medan inspelningen pågår**, utan seek och utan
> efterbearbetning av klippet. Fyra nya moduler, alla parallella med klippvägen:
> `poseRingBuffer.ts` (bunden landmark-historik, 450 sampel ≈ 30 s @ 15 fps, **konstant minne**
> ~1,9 MB oavsett sessionslängd — förallokerade slots som skrivs över, inte en växande lista som
> trimmas), `livePoseLoop.ts` (`detectForVideo` mot preview-`<video>` i rAF-loop, tvåstegstakt,
> mätning), `liveSwingDetector.ts` (inkrementell `detectSessionSwings` + dedupe över glidande
> fönster) och `useLiveSwingDetection.ts` + `LiveSwingPanel.tsx` (dev-preview-räknare).
>
> **Seek-kostnaden är borta.** Klippvägen seekar en dold `<video>` per sampel och väntar på
> `onseeked` — det är den dyra delen, och den kan bara köras efter att inspelningen stoppats.
> Live-vägen läser den redan avkodade previewframen; enda kvarvarande kostnad är inferensen själv.
>
> **Tvåstegstakt (Risker §1, termik):** `GUARD_FPS` 5 i vila → `ACTIVE_FPS` 15 vid rörelse
> (`MOTION_ESCALATE_SPEED` 0,10 normaliserade enheter/s), med `ACTIVE_DWELL_SEC` 4 s efterhållning.
> Eskaleringen är **medvetet biased mot ACTIVE**: för långsam sampling tappar en hel sving, för
> snabb kostar batteri. Varje taktbyte loggas på WARN.
>
> **Mätning (krav 6), loggas var 5:e sekund på WARN som `Live pose stats`:** inferenstid
> (senaste/avg/p95/max), `achievedFps` mot `targetFps`, `saturated` (inferensen ensam överskrider
> frameintervallet — det ärliga throttling-måttet), ringbuffertens storlek/span/evictions,
> delegat, felräknare. Slutraden `Live pose loop stopped` är sessionssammanfattningen.
>
> **Dedupe:** samma fysiska sving återdetekteras i varje pass så länge den ligger kvar i fönstret.
> `LiveSwingDetector` rapporterar bara svingar vars ankare ligger > `REPORT_COOLDOWN_SEC` (2 s,
> speglar `poseSegments.COOLDOWN_SEC`) efter senast rapporterade.
>
> **Mätt på de frysta fixturerna** (ny harness `liveSwingDetector.test.ts` spelar upp varje fixtur
> sampel-för-sampel genom ringbufferten med samma 0,5 s-detektionsintervall som live): live-vägen
> ger **exakt** batch-vägens resultat — session-multi 3 svingar `[8,26→9,86]` imp 9,26 ·
> `[31,53→33,13]` imp 32,53 · `[54,46→56,25]` imp 55,59; dtl-full 1 `[6,78→8,31]` imp 7,85;
> face-on 1 `[3,35→4,70]` imp 4,23; dtl-clipped 0. Inget dubbelräknat, inget tappat vid
> fönsterkant. **Detektionskostnad över 450-sampelsfönstret: 0,4 ms i snitt, 2,7 ms max** — försumbar
> mot inferensen. **Detektionslatens 0,6–1,1 s efter impact**, och det är *strukturellt korrekt*:
> grinden förkastar `clippedTail`, så en sving blir detekterbar först när dess finish hunnit sätta
> sig. Att detektera tidigare vore att acceptera svingar vars fullföljd inte hänt än.
>
> **Egen landmarker, inte singletonen:** `poseDetector.ts` fick ett additivt
> `createPoseLandmarker()`. `runningMode:'VIDEO'` kräver strikt växande tidsstämplar per instans, och
> live-loopen kör på väggklocka medan klippvägen startar om från 0 per klipp; dessutom finns
> `resetPoseLandmarker()` just för att den delade grafen är enanvändar-per-extraktion. Med egen
> instans är överlappet när inspelningen stoppas ofarligt. Ingen beteendeändring för
> `getPoseLandmarker`.
>
> **RÖRDA EJ:** `frameExtractor.ts`, `poseEnvelope.ts`, `poseSegments.ts`, `poseTrajectory.ts`,
> session-store, Vision-anropet, `SwingRecord`. Klippvägen (inspelning → extraktion → analys)
> beter sig exakt som förut, med eller utan live-panelen. @mediapipe ligger kvar i egen lazy chunk
> (dynamisk import i hooken; byggverifierat). Build + lint (0 nya) + test **52/52** rena; dev-servern
> bootar och alla nya moduler + wasm/modell serveras 200.
>
> **Ärliga avgränsningar.** (1) Bara detektion loggas — frame-grab och analys per live-sving är
> pass 3, liksom MediaRecorder-chunk-ringbufferten i ADR-003 §4. (2) `MOTION_ESCALATE_SPEED` och
> `ACTIVE_DWELL_SEC` är härledda ur klipp-fixturer, **inte ur live-kamerabrus** — markerade
> `// OSÄKER:`; dwellen är den som skyddar detektionskvaliteten, eftersom envelopens
> `FINISH_MIN_HOLD_FRAMES` är ett *frame*-antal och ett fönster som blandar 5 och 15 fps ändrar vad
> "3 frames" betyder i tid. (3) rAF-loopen, taktbytet och inferenstiden går inte att enhetstesta
> utan kamera — de mäts i fält via panelen och WARN-raderna.
>
> **Kvar att verifiera av Erik:** spela in på iPhone, gör 3 svingar utan att stoppa inspelningen,
> och läs (a) att räknaren går till 3, (b) `Live pose stats`-raderna för termikbeslutet.

> **Pass 3 KLAR (2026-08-08) — per-sving frame-grab och analys i kö (ADR-003 §4.3 + §5).**
> Sessionsläget är nu verkligt: kameran rullar, varje sving analyseras och läses upp medan
> nästa slås. **Sessionsläge = kontinuerligt läge** — samma 🎯-knapp som förut, men
> inspelningen stoppas inte längre mellan svingar. Klippvägen (spela in → stoppa → analysera,
> och uppladdning av färdiga klipp) är oförändrad och är det som körs så snart sessionsläget
> är av.
>
> **Kedjan, och varför den är delad där den är delad:**
> `detektor (rAF)` → *klipp fönster ur chunk-ringen* → `analyskö (seriell)` → `TTS-kö (egen)`.
> Tre egenskaper faller ut, och alla tre är krav: (1) **detekteringen väntar aldrig** — det
> enda arbetet på detektortråden är en Blob-splittring (referenser, ingen kopiering); (2)
> **fönstret klipps vid detektion, inte när kön hinner fram** — ringen håller ~30 s, så om två
> analyser köar bakom en trög range-uppkoppling vore sving N+2:s bytes sedan länge utslängda
> när dess tur kom; att klippa direkt gör retentionen **oberoende av ködjupet**; (3) **TTS
> serialiseras separat** — analyskön får inte blockeras av att någon lyssnar, och två utlåtanden
> får aldrig tala samtidigt.
>
> **`videoChunkRing.ts` (ny, ren):** tidsstämplade `ondataavailable`-chunks i ett bundet
> ~30 s-fönster; `materialize(start, end)` klipper en spelbar blob. **Init-segmentet är
> pinnat** — MediaRecorderns första chunk bär `ftyp`+`moov` (fMP4 på iOS) resp. EBML-headern
> (WebM), och utan den är senare chunks obrukbara bytes. Den hålls därför utanför utkastningen
> för alltid (en chunk) och läggs först i varje fönster som inte redan innehåller den — samma
> form som DASH/HLS: init-segment + delmängd fragment. `useCamera` fick `RecordMode`:
> `'clip'` (som förut, hela klippet returneras) eller `'session'` (ringen, `stopRecording()`
> returnerar **null** — det finns medvetet ingen hel-sessions-blob). Det var den gamla
> `chunksRef`-arrayen som var de uppmätta 150–350 MB i inventeringen.
>
> **`analysisQueue.ts` (ny, ren):** `SerialQueue` — en uppgift i taget, ordning bevarad,
> **en misslyckad uppgift stoppar aldrig kön** (rejektet går till anroparen, nästa startar).
> Djupet mäts (`maxDepth`) i stället för att kapas; en kö som tyst tappar svingar är precis
> den sortens tysta fel ADR-003 finns för att ta bort.
>
> **TTS-kö i `tts.ts`:** `enqueueSpeech` (FIFO, avbryter aldrig) vid sidan av `speakSequence`
> (barge-in, oförändrad för enkelsvingsvägen). `cancelSpeech()` tömmer nu **både** motorn och
> kön. **Watchdog:** iOS Safari tappar `onend` tillräckligt ofta att en kö som litar på den
> förr eller senare kilar fast — tyst, resten av sessionen. Budgeten är generös (~10 tecken/s)
> och släpper bara loss kön; värsta fall är en kort överlappning i stället för permanent tystnad.
>
> **`useSessionCapture.ts` (ny):** orkestreringen. Per sving: klipp fönster → `addSwing`
> ('detected') → kö: `selectEnvelopeFrames` på **samma envelope-objekt grinden accepterade**
> (inte en omhärledning ur `envelopeSec`) → `grabFramesAtTimes` → `analyzeSwing` →
> `enqueueSpeech` → historik (fönstret, inte sessionen). Regler/inställningar läses vid
> **körning**, inte vid detektion.
>
> **Tidsbasen var det icke-uppenbara problemet, i två lager.** (a) Live-loopens klocka startade
> när `createPoseLandmarker()` var klar — sekunder efter inspelningsstart på en kall GPU-probe —
> så en sving vid t=34,2 pekade inte på samma bytes i videoringen som i landmark-ringen. Fix:
> additivt `LivePoseLoopOptions.epochMs`; båda ringarna mäter nu från **inspelningsstart**.
> (b) Ett fönster ur en längre inspelning kan presenteras antingen på originaltidslinjen
> (sök 34,2) eller ombasad till noll (sök 1,2), beroende på container och motor. `poseFrameGrab`
> **gissar inte** — den söker förbi slutet, ser var uppspelningen landar och jämför mot båda
> kandidat-sluttiderna. Billigt, och svarar med webbläsarens faktiska beteende i stället för
> vår modell av det. Sök har nu också timeout (3 s): en hängande seek skulle annars låsa
> analyskön för resten av sessionen.
>
> **Loggning per sving (krav 6), på WARN:** `Session swing N captured` (fönster, MB, chunks,
> header-prepend, trunkering, ringstatus, ködjup), `Session swing N analyzed` (**anchor→detekterad
> →bilder→analys** plus `grabMs`/`visionMs`/frameCount/impact-kluster) och `Session swing N spoken`
> (anchor→tal klart). Samma kedja ligger på `SessionSwing.timings` och visas per rad i sessionsvyn.
>
> **Sessionsvy:** `components/Session/SessionSwingList.tsx` — en rad per sving med status,
> envelope-tider, utlåtande och fallerade regler allteftersom de landar, plus latenskedjan.
> Renderas under kameran medan den rullar; sving 3 kan vara `analyzing` medan 2 visar utlåtande
> och 1 visar ett fel. Det är precis det tillstånd pass 1:s store-refaktorering gjorde
> representerbart.
>
> **Två följdfixar som annars hade bitit i fält:** (1) `anySwingBusy` låste inspelningsknappen —
> i en session är den nästan alltid sann, så golfaren hade inte kunnat stoppa sin egen session;
> den grindar nu bara klippvägen. (2) `AnalysisView` bailar på `swing.timings !== null`: en
> sessionsfångad sving äger sin egen analys, och utan grinden hade ett besök i analysvyn under
> flykten avfyrat ett **andra, betalt** Vision-anrop för samma sving.
>
> **`LiveSwingPanel` är nu presentationell** — den ägde sin egen `useLiveSwingDetection`, och
> två instanser hade betytt två PoseLandmarkers som infererar på samma preview, alltså dubbla
> kostnaden för precis det panelen finns för att mäta. Den visar också ködjup/max/klara/fel.
>
> **RÖRDA EJ:** `poseEnvelope.ts`, `poseSegments.ts`, `livePoseLoop.ts`-logiken (endast additivt
> `epochMs`), `poseTrajectory.ts`, `frameExtractor.ts`, Vision-anropet, `SwingRecord`.
> Nya enhetstester: `videoChunkRing.test.ts` (bundenhet över 10 min session, konstant minne,
> pinnat init-segment, trunkering rapporteras), `analysisQueue.test.ts` (serialitet, ordning,
> **fortsätter efter fel**, clear), `tts.test.ts` (två analyser talar aldrig samtidigt,
> `cancelSpeech` tömmer kön, watchdog släpper en kilad motor). Build + lint (0 nya) + test
> **75/75** rena; dev-servern bootar och alla nya moduler serveras 200.
>
> **Ärliga avgränsningar.** (1) `// OSÄKER:` på fMP4-fönstren: en delmängd fragment efter
> init-segmentet är giltig per konstruktion, men iOS Safaris exakta beteende är inte verifierat
> på hårdvara — probe:n och `Session swing N captured`-loggen är gjorda för att göra ett fel här
> omedelbart synligt i stället för tyst. (2) Analysen konkurrerar med live-inferensen om GPU:n;
> `grabMs`/`visionMs` mot `Live pose stats` är mätningen som visar hur mycket. (3) `analysisAngle`
> ligger fortfarande globalt (ärvt från pass 1). (4) Takt-trösklarna är fortfarande härledda ur
> klipp-fixturer, inte live-kamerabrus.
>
> **Kvar att verifiera av Erik:** session på iPhone, 3 svingar utan att stoppa inspelningen →
> (a) talad feedback efter varje sving, (b) sessionsvyns tre rader, (c) latenskedjan i
> `Session swing N analyzed`, (d) `windowMb`/`ringRetainedMb` som bevis för att sessionen aldrig
> ligger i RAM.

> **Pass 4 KLAR (2026-08-09) — sessionssammanfattning (raden att utvärdera ett fälttest mot).**
> Sessionsläget loggade utförligt *per sving*; en riktig rangesession (20+ min, 30+ svingar) blir
> flera hundra rader, och frågan fälttestet faktiskt ställer — *funkade den här sessionen?* — hade
> ingen rad. `lib/sessionStats.ts` (ny, ren modul-singleton — ingen ny store) samlar under
> sessionens gång och loggar **en WARN-rad `Session summary`** vid `endSession()`:
> `durationSec`, `swingsDetected`/`Analyzed`/`Failed`, `detectedMs`/`framesMs`/`visionMs` som
> `{median, p95}`, `spokenMedianMs`, `poseDetectionRate`, `achievedFpsMedian`, `ringEvicted`,
> `maxWindowMb`, `totalCostUsd` och `failureReasons` (unika felmeddelanden med antal, vanligast
> först).
>
> **Median + p95, inte medelvärde:** ett enda 40 s Vision-anrop på en trög range-uppkoppling
> drar ett medelvärde tills det inte betyder något. Medianen säger vad en sving normalt kostade,
> p95 hur illa svansen blev. Samma nearest-rank-konvention som `livePoseLoop.stats()` använder,
> så de två p95-siffrorna i loggarna betyder samma sak.
>
> **Livscykeln ligger i storen** (`startSession` → `begin()`, `endSession` → `end()`), inte i
> hooken: `endSession` anropas från tre ställen (sessionsknappen, hörlurars dubbeltryck,
> `AnalysisView`) och storen är den enda gemensamma strypningen. `end()` returnerar `null` om
> ingen session kördes, så ett dubbelanrop inte ersätter sammanfattningen med en tom. **Varje
> recorder är no-op före `begin()`** — live-detektering körs även utanför session när dev-previewen
> är på, och den trafiken får inte hamna i en sessions siffror.
>
> **Två additiva utökningar krävdes:** (1) `api.ts` fick `options.onUsage` — kostnaden som redan
> beräknades var bara loggad, aldrig returnerad; callback i stället för breddad returtyp så de två
> befintliga anroparna står orörda, och den anropas **före** JSON-parsningen (ett svar som inte går
> att parsa kostade ändå pengar). (2) `useLiveSwingDetection` skickar vidare `LivePoseLoop.onStats`
> (5 s-intervallet) — pose-räknarna ackumuleras därifrån som **deltan med "räknaren gick bakåt ⇒ ny
> loop"**, eftersom en session kan spänna över flera inspelningar. Samma delta-regel för
> `ringEvicted`. `livePoseLoop.ts` är orörd.
>
> **UI:** `components/Session/SessionSummaryCard.tsx` visar samma objekt på kameravyn efter
> avslutad session (det finns ingen egen slutvy — en session slutar där den körs). Loggen är
> primär; kortet finns för att en range med telefon på stativ är fel plats att öppna
> loggpanelen på.
>
> **Ärliga avgränsningar:** `ringEvicted` samplas vid svingfångst, så evictions efter sessionens
> sista sving räknas inte (indikator, inte revision); pose-räknarna tappar de sista < 5 s av varje
> inspelning eftersom stats-ticken är 5 s. Nytt enhetstest `sessionStats.test.ts` (7 test:
> median/p95, no-op utanför session, felräkning, kostnadssumma, loop-/ring-omstart, dubbel `end`).
> Build + lint (0 nya) + test **97/97** rena. **Ej fältverifierad** — raden finns för att läsas
> efter Eriks rangesession.
>
> **Impact-grind i sessionsläget KLAR (2026-08-11) — fältdata fällde beslutet.** En falsk
> detektion (någon gick förbi kameran) gav `impactSec null · verticalExcursion 0,088 ·
> peakSpeed 0,72` och kostade **$0,0408 — mer än en riktig sving**: det utsträckta envelope:t
> gav en beskärningslåda på 93,9 % av bilden, så den falska detektionen skickade de dyraste
> bilder vi någonsin skickar. Den lade sig dessutom i den seriella kön framför riktiga svingar
> och lästes upp i hörlurarna. Samtliga falska detektioner i dagens loggar har `impactSec null`;
> riktiga svingar har bekräftad impact.
>
> `runSwing` (`useSessionCapture.ts`) kollar nu `report.envelope.impact` **före**
> bildruteextraktion och Vision — saknas den hoppas hela analysen över: ingen frame-grab, inget
> API-anrop, inget tal. Grinden ligger i den köade funktionen, inte i `onSwing`, av två skäl:
> inställningar läses vid körtid, och svingen får ändå sitt fönster klippt och sin rad i
> sessionsvyn, så en avvisad detektion syns i stället för att tyst utebli.
>
> **Skild från fel, hela vägen:** ny sving-status `skipped` (egen etikett/ton i
> `SessionSwingList`, neutral — grinden som gör sitt jobb är inget fel) och nytt
> sammanfattningsfält **`swingsSkippedNoImpact`** via `sessionStats.recordSkippedNoImpact()`,
> som medvetet **inte** går via `recordFailure` (skulle blåsa upp `swingsFailed` och hamna
> under `failureReasons`, där varje rad är något att åtgärda). Kortet visar fältet bara när
> det inträffat.
>
> **WARN-raden är hela poängen:** `Session swing skipped — no confident impact` bär
> `swingIndex`, `envelopeSec`, `envelopeDurationSec`, `verticalExcursion`, `peakSpeed` samt
> `impactReason`/`clippedTail` — datan som avgör den öppna frågan, om grinden avvisar *riktiga*
> svingar på rangen. Ny inställning **`requireImpact` (default `true`)** i settings-storen är
> avstängningen om den visar sig för strikt; ingen UI, den sätts från storen.
>
> **Klipp-vägen i `AnalysisView` är orörd** — där har användaren uttryckligen bett om en analys
> och ska få en även utan bekräftad impact (worst-case-wins, ADR-002: impact är polish, aldrig
> bärande). Två nya test i `sessionStats.test.ts`. `npm test` **164/164**, build ren, lint 0 nya.
> **Ej fältverifierad** — se *Öppna trådar* i handoffen.
>
> **Bildrutebudget 32 + fasklustring KLAR (2026-08-11).** Två ändringar med samma orsak:
> selektionen var kalibrerad för en kostnadsbild och en regelbild som båda flyttat sig.
>
> (1) **`ANALYSIS_FRAME_COUNT` 20 → 32.** 20 sattes när en bildruta kostade 1 229 tokens;
> efter beskärningen mäter en bildruta 213–231. Vid ~220 blir 32 bilder ~7 000 input-tokens,
> **mindre än den dyraste sving vi mätt vid 20 bildrutor** — budgeten är alltså köpt ur
> beskärningen, inte lagd ovanpå. Vad den köper: envelopen är ~1,6 s, så 32 rutor är en var
> ~50 ms mot ~85 ms förut.
>
> (2) **Impact-klustret generaliserat till ett FASKLUSTER.** Klustret satt alltid på impact.
> Det är rätt för en regel om träffen och fel för varje regel som avgörs någon annanstans:
> en regel om **downswing-sekvensering** (startar höften rotationen före axlarna?) utspelar
> sig i övergången topp→downswing, där ett impact-centrerat kluster lägger nästan inga rutor.
> Användaren fick `cannot_determine` på precis den regeln i produktion. `selectEnvelopeFrames`
> tar nu `options.clusterPhases`; klusterbudgeten (oförändrad 0,4-andel) delas jämnt över de
> distinkta faserna de aktiva reglerna bär, var och en centrerad på fasens mittpunkt i
> envelopen (`backswing` = mitt mellan start och topp, `downswing` = mitt mellan topp och
> impact, osv). Impact är en fas som alla andra när en regel ber om den.
>
> **Baslinjen kan inte kollapsa (worst-case-wins):** utan `clusterPhases` — eller med en tom
> lista — är resultatet bit för bit det gamla (kluster på impact när impact är bekräftad,
> annars ren likformig baslinje). Klipp-vägen skickar inget och är därmed orörd, vilket också
> är vad regressionsharnessen fortsätter pinna. En fas vars mittpunkt **inte går att lokalisera**
> (allt inre saknar referens utan bekräftad impact) tas bort i stället för att gissas fram —
> ett kluster på en gissad tidpunkt spenderar 40 % av budgeten på en tid som kan ligga var som
> helst, vilket är sämre än den likformiga baslinjen det ersatte.
>
> **Klusterspacing 0,06 → 0,033, `max(…, envelope.sampleDt)`-golvet borttaget.** Golvet
> blandade ihop två klockor: placeringen *härleds* ur pose (15 fps → dt 0,067), men rutan
> *hämtas* ur videon, som spelas in i **30 fps**. Vi spacade alltså i den upplösning vi
> hittade svingen med, inte den vi kan sampla den i — halva källans tidsupplösning kastad.
> 0,033 ≈ en 30 fps-videoruta, det verkliga golvet. Faslabel-toleransen är nu en **egen**
> konstant som behåller `sampleDt`-golvet: frågan *"är den här rutan i toppen?"* begränsas
> av pose, till skillnad från placeringen.
>
> **Bugg hittad och fixad på vägen — dedupe var inte monoton i budgeten.** `dtl-clipped`
> (~0,75 s envelope) gav **20 rutor vid budget 20 och 16 vid budget 32**: den giriga dedupen
> jämför mot senast *behållna* pick, så ett för tätt rutnät med avstånd g ∈ [0,015, 0,03)
> kollapsar till varannan pick — slutavstånd 2g, långt över gränsen. Ny `fittable()` begär
> bara så många likformiga rutor som spannet rymmer vid `DEDUPE_SEC`, med marginal så
> flyttalsbrus inte avgör saken. `dtl-clipped` ger nu **25**. `DEDUPE_SEC` orört.
>
> **Ny logg per sving:** `framesRequested`, `framesAfterDedupe`, `clusterPhases`,
> `clusterAllocation` (avsikt) och `allocation` (utfall efter dedupe) — så det går att se i
> fält om dedupe äter budgeten vid 32 i stället för att gissa.
>
> Nytt enhetstest `poseEnvelopeSelection.test.ts` (9 test: budget/ändpunkter, dedupe-avstånd
> + monotonitet, fasklustring med två regler i olika faser, impact som vanlig fas, dubbletter,
> olokaliserbara faser, och fallbacket till impact-kluster när fasinformation saknas).
> Regressionsgoldens omräknade: `dtl-full` 16→26, `dtl-clipped` 20→25, `face-on` 15→26.
> `npm test` **187/187**, build ren, lint 0 nya. **Ej fältverifierad** — kostnaden per sving
> vid 32 rutor ska läsas mot `💰 Analysis cost` på Eriks nästa session.

**Mål (kvar):** fälttrimning av takt-trösklarna (`MOTION_ESCALATE_SPEED`, `ACTIVE_DWELL_SEC`) mot
Eriks `Live pose stats`-data, och verifiering av fMP4-fönsterklippet på faktisk iPhone-hårdvara.

**Dokumentkrav:** bocka av respektive pass här + `docs/decisions/ADR-003-draft.md` §5;
uppdatera `swingcheck-handoff.md`.

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

### [x] E-2 — Pose-styrd beskärning av analysbildrutor (sessionsvägen)

> **Klart (2026-08-10, committad på `main` på begäran).** Bilderna är ~95 % av kostnaden
> (17 st à 720×1280 ≈ 20 900 input-tokens ≈ $0,063/sving) och merparten av varje bild är
> range-bakgrund. Vi har redan landmärken för hela svingen, så golfaren beskärs fram.
>
> Ny ren modul `src/lib/poseCropBox.ts`, delad i två steg med **fyra tal emellan**:
> `computeLandmarkBounds(samples, startSec, finishSec)` (normaliserad union av ALLA
> landmärken över **envelopen**, + `footMaxY`) körs vid **detektion**, där samplen finns;
> `planCrop(bounds, srcW, srcH, maxOutputSide)` körs vid **grab**, första stället där
> videons verkliga pixelmått är kända. Bara bounds korsar gränsen — en session behåller
> varje rapport hela körningen, och landmärkes-arrayerna skulle upphäva ringbuffertens
> konstanta minnestak.
>
> **EN låda för hela svingen, inte en per bildruta.** En låda som spårar per bildruta
> andas och driftar, och en sekvens vars inramning rör sig är *svårare* att bedöma än en
> orörd — modellen kan inte skilja kroppsrörelse från kamerarörelse.
>
> Regler: sidmarginal 20 % av råboxens bredd per sida (spec-golv 15 %; aspektlåset lägger
> i praktiken på betydligt mer i sidled, vilket är det som räddar klubbhuvudet i toppen),
> 12 % topphöjd (klubban över huvudet — aspektlåset expanderar *bredden* och ger aldrig
> takhöjd), ned till markplanet via fotlandmärkena + 8 % (bollposition/underlag), 25 % när
> foten aldrig syns. Aspekt låst till källans (9:16) genom att expandera **kortaste** axeln.
> Klampning: skala ned med EN faktor (aspekten exakt) och **glid** sedan in centrum —
> glidning framför krympning håller golfaren hel när lådan bara hänger över en kant.
> Landmärken under visibility 0,3 utesluts (MediaPipe extrapolerar ockluderade leder), och
> varje koordinat klampas till [0,1] innan unionen. Kvalitetsgrind: se uppföljningen nedan.
>
> `poseFrameGrab.grabFramesAtTimes` beskär via `drawImage` med source-rect och returnerar
> nu `{ frames, crop }` (var `string[]`); målupplösning långsida ≤ **900 px**, aldrig
> uppskalning; `FRAME_QUALITY` 0,8 oförändrad. `useSessionCapture` skickar
> `report.cropBounds` + `MAX_OUTPUT_SIDE` och loggar per sving på `Session swing N analyzed`:
> `cropReason`, `cropBox [x,y,w,h]` i källpixlar, `outputSize`, `tokensPerFrame`,
> `savedTokens`, `savedPct` (`FrameGrab`-loggen har samma rad + `cropAreaPct`).
> Uppmätt på en typisk syntetisk golfare: låda 466×829 av 720×1280 (42 % av ytan) →
> ~515 tokens/bild mot 1 229 = **~58 % färre**, ~12 200 tokens/sving sparade.
>
> **Rört, som specat:** `poseCropBox.ts` (ny), `poseFrameGrab.ts`, `liveSwingDetector.ts`
> (additivt `cropBounds` på `LiveSwingReport`), `useSessionCapture.ts`, `SegmentedSwings.tsx`
> (ny returtyp; dev-panelen beskär **inte** — den finns för att inspektera selektionen och
> skelett-overlayen ritas i bildens koordinater). **`frameExtractor.ts` orörd**
> (klipp-vägen), `ANALYSIS_FRAME_COUNT` orörd.
>
> Test: `poseCropBox.test.ts` (31 st) mot syntetiska landmärken — normalfall (stabil låda,
> aspekt bevarad, ≥15 % sidmarginal, når förbi foten, cap + ingen uppskalning, determinism),
> saknade landmärken (alla sex fallbacks var för sig) och landmärken nära bildkanten (fem
> kantfall + glid-inte-krymp + landskapskälla). `npm run build` och lint rena.
> **Ej fältverifierad** — Erik kör en session och läser `cropReason`/`savedPct`.
>
> **Uppföljning (2026-08-10) — arean utbytt som kvalitetsgrind.** Den ärliga invändningen
> ovan visade sig vara hela poängen: **en liten låda är det förväntade och önskade utfallet
> på stativavstånd**, alltså precis det fall beskärningen finns för, och 25-procentsgolvet
> avvisade just dem. Area är fel mått på "skräpiga landmärken" — kvaliteten är en egenskap
> hos *skelettet*, inte hos rektangeln.
>
> Golvet är ersatt av en **landmärkesgrind**: båda axlarna, båda höfterna och **minst en
> fot** (OR-grupp över ankel/häl/tå) måste vara närvarande i ≥ 50 % av svingens sampel
> (`PRESENCE_FLOOR` 0,3 på MediaPipes `visibility`) OCH ha medelvisibility ≥ 0,6. De fem
> bär bålen och markkontakten — lådans ankare. En ensam högkonfident hand i ett hörn kan
> inte passera, vilket var vad areagolvet trevade efter. Trösklarna: 0,3 är medvetet
> tillåtande (`visibility` är ett *ocklusions*-mått, en höft bakom bakarmen i toppen dippar
> utan att estimatet är fel), 0,5 skiljer "kort ockluderad" från "inte spårad", 0,6 är en
> bedömning (tydligt sedd led ≈ 0,9+, inferrerad 0,5–0,8, gissning < 0,5) — alla tre
> kommenterade och lätta att justera. Grinden körs **före** all geometri.
>
> Area är kvar som två rena skyddsnät, inte som kvalitetsmått: **4 %**-golv (under det kan
> lådan inte vara en människa) och oförändrat **90 %**-tak. `cropReason` skiljer nu på
> `'ok'` · `'landmarks-incomplete'` · `'landmarks-low-confidence'` · `'box-degenerate'`
> (inkl. 4 %-nätet) · `'box-too-large'` · `'no-bounds'` · `'too-few-samples'` ·
> `'no-source-size'`. Nytt `gateDetail` rapporterar svagaste delen med siffror
> (`"feet present 0.20 vis 0.31"`) — **även vid pass**, så marginalen syns och trösklarna
> kan tunas mot data. `cropAreaPct` loggas per sving oavsett utfall (rent observationellt
> nu när area inte grindar). `LandmarkBounds` bär ett litet `skeleton`-fält
> (presentFrac + meanVisibility per del) — beräknat där landmärkena finns, konsumerat i
> `planCrop`. `// OSÄKER:`-markeringen borttagen; grinden mäter nu rätt sak.
>
> Test: `poseCropBox.test.ts` 45 st — nytt block för komplett skelett i **liten** låda
> (~10 % av ytan → godtas, långt under gamla golvet), skelettgrinden mot **samma stora,
> rimliga låda** i alla varianter (frisk kontroll, saknad höft, ingen fot, en fot räcker,
> låg visibility, ockluderings-dipp godtas, frånvaro rapporteras före osäkerhet) samt två
> ände-till-ände-fall från syntetiska sampel. `npm test` 148/148 grönt.
>
> **Uppföljning (2026-08-11) — aspektlåset borttaget; det gjorde beskärningen verkningslös.**
> Produktionen visade två svingar i rad med `cropAreaPct` **79,6** respektive **100** och
> `cropReason 'box-too-large'` — lådan avvisades helt, alltså noll besparing. Orsak:
> låsningen till källans 9:16 (min spec ovan, felaktig). En golfare är hög och smal —
> kroppslådan ≈ 1142 px av 1280 — och låst till 0,5625 tvingas bredden till ≈ 642 px av 720,
> alltså nästan hela bilden. **Inget kräver att den levererade bilden matchar källans
> bildförhållande; Vision accepterar godtycklig aspekt.**
>
> Låset är ersatt av ett **golv på hur smal lådan får bli**: `MIN_WIDTH_TO_HEIGHT` = 0,30 —
> bredden ≥ 0,30 × höjden, vilket ger klubban svängrum i sidled utan att dra in hela
> bakgrunden. Är den naturliga lådan bredare (face-on, adressställning) lämnas den orörd;
> golvet vidgar, det smalnar aldrig. Sidmarginal 20 %, toppmarginal 12 % och utvidgningen
> ned till markplanet är oförändrade — utan låset gör de nu det arbete de var tänkta att göra.
> Klampningen sker **per axel** i stället för med en gemensam skalfaktor: en låda som hänger
> över i sidled kostar inte längre höjd.
>
> **90 %-taket avvisar inte längre.** En låda som täcker nästan hela bilden är inget fel —
> den betyder att beskärningen inte ger något här, och det ärliga svaret är att skicka den
> lådan (avvisningen skickade ändå hela bilden, samma pixlar via en väg som rapporterade
> fel). `MAX_AREA_FRAC` och `'box-too-large'` är borta; **4 %-golvet och `'box-degenerate'`
> är kvar**. Nytt `CropPlan.aspect` loggas som `cropAspect` bredvid `cropAreaPct` i båda
> loggraderna — med låset borta är formen fri, och den är andra halvan av svaret på vad
> riktiga svingar landar på.
>
> Test: `poseCropBox.test.ts` 53 st. Nytt block **hög smal golfare** som reproducerar
> produktionsfallet (1143 px hög, 115 px bred kroppslåda → gamla koden: `box-too-large`,
> nya: `ok`, aspekt ≈ 0,32, ~57 % av ytan, > 60 % färre tokens) och nytt block **stor låda
> godtas** (~95 %-låda beskärs; låda som spiller över åt alla håll klampas till bildramen
> och används; per-axel-klampning kostar ingen höjd). Alla aspektassertioner mot källans
> ratio är utbytta mot golvet — en beskärning som kommer tillbaka med källans form är nu
> *felet*, inte målet. `npm test` 157/157, build + lint rena. **Ej fältverifierad** — Erik
> läser `cropAreaPct`/`cropAspect` på nästa session.

---

## Ström G — Instruktörsspår (G2) — *låst bakom Ström B*

Stubbar; detaljspecas när M5 (Ström B) är klar. Ramar: [ROADMAP.md](ROADMAP.md) → *G2 — Instruktörsspåret* (pilotdesign, pris/intäktsdelning, data/samtycke).

### [ ] G2-1 — Delningsrelation tränare↔elev + RLS
Relationstabell med explicit, återkallbart samtycke per relation; RLS så tränare läser endast delade svingar; cascade-radering.

### [ ] G2-2 — Tränarvy
Elevlista → svingar med regelutfall försorterade mot tränarens regeluppsättning → text-/röstkommentar tillbaka till eleven.

---

## Ström W — Worker-härdning

Stänger säkerhets-/kostnadsriskerna i `worker/worker.ts`. Utgår från
[ARCHITECTURE_REVIEW_2026-07.md](reviews/ARCHITECTURE_REVIEW_2026-07.md) → **R2** (den enda risken i
repot som kan kosta riktiga pengar utan symptom). Branch: `worker-hardening`.

**Konfliktzon:** `worker/worker.ts`, `worker/wrangler.toml`, `worker/migrations/*.sql`. Rör ingen
appkod — `src/lib/api.ts` är oförändrad.

### [x] W-1 — Stäng den öppna Anthropic-proxyn

> **Klart (2026-08-11).** Fyra lager i `worker/worker.ts`, billigast först:
> **(1) Origin-allowlist** — `ALLOWED_ORIGINS` (kommaseparerad) matchas exakt mot `Origin` och
> eko:as tillbaka i `Access-Control-Allow-Origin` endast vid träff; annars 403 utan ACAO-header.
> `Vary: Origin` på allt. Preflight (OPTIONS) följer samma regel. Gäller även `/api/log`.
> **(2) Storleksgräns** — `BODY_MAX_BYTES` (default 30 MB) kollas mot `Content-Length` och sedan mot
> faktiskt antal bytes, **före** `JSON.parse` → 413.
> **(3) Server-side-pinning** — klientens `model` ignoreras, `MODEL_ID` (default `claude-sonnet-4-5`)
> används. `system`/`messages`/`cache_control` skickas vidare **oförändrade** (prompt-cachningen
> nycklar på exakt prefix).
> **(4) Dagligt tak** — ny D1-tabell `api_usage(day, calls)`
> (`migrations/0002_create_api_usage.sql`), upsert med `RETURNING` per proxy-anrop; över
> `DAILY_CALL_CAP` (default 300) → 429 utan att ringa Anthropic. **Saknad/trasig DB → warn + släpp
> igenom** — taket får aldrig vara det som stoppar en svinganalys.
>
> **Avvikelse från specen (medveten):** `max_tokens` **klampas** i stället för att skrivas över —
> `MAX_TOKENS` (default 2000) är taket, en klient som ber om mindre får mindre. Rakt överskrivning
> hade raderat quick modes 600-tak, dvs. ändrat appbeteende i härdningens namn. Skyddet är detsamma:
> ingen kan be om mer än taket.
>
> **Andra avvikelsen:** `GET /api/log` utan `Origin`-header (curl/terminal) släpps igenom — den vägen
> vaktas av `LOG_READ_KEY`, och en strikt origin-koll där hade dödat logg-avläsningen från terminalen
> utan att stänga något. Allt annat utan `Origin` → 403.
>
> **Verifierat:** nytt `worker/worker.test.ts` (vitest, 14 st, helt offline — global `fetch` stubbad
> och upstream-requesten inspekterad, fejkad D1) täcker hela acceptansen: otillåten origin → 403 utan
> ACAO, preflight samma regel, `model:'claude-opus-4-8'` → körs på pinnad modell, `max_tokens: 999999`
> → 2000 och 600 → 600, `system`/`messages`/`cache_control` byte-för-byte oförändrade, för stor body →
> 413 utan upstream-anrop, tredje anropet med tak 2 → 429 utan upstream-anrop, saknad/trasig D1 → 200.
> `npm test` 187/187, `npx eslint worker/` rent, `tsc --noEmit` på workern rent.
>
> **Kvar för Erik (kräver deploy, ej agentkörbart):** sätt `ALLOWED_ORIGINS` till prod-origin i
> `worker/wrangler.toml` (utan den 403:ar prod — fail-closed är avsiktligt, prod-origin gissas inte),
> kör `npx wrangler d1 migrations apply swingcheck-logs --remote` för `api_usage`, och bekräfta efter
> deploy att `cache_read_input_tokens` fortfarande är > 0 i analysloggen.
>
> Dokumentation: `README.md` + `docs/swingcheck-handoff.md` (miljövariabler + säkerhetsmodell),
> R2 markerad åtgärdad i [ARCHITECTURE_REVIEW_2026-07.md](reviews/ARCHITECTURE_REVIEW_2026-07.md).

**Mål:** `worker/worker.ts` vidarebefordrar i dag godtycklig JSON till `api.anthropic.com` med
`ANTHROPIC_API_KEY`, med CORS `*`, ingen origin-koll, ingen modell-allowlist, inget `max_tokens`-tak
och ingen rate limit — och Worker-URL:en ligger i klartext i PWA-bundeln. Stäng det.

**Acceptans:** icke-tillåten origin → 403; `model:'claude-opus-4-8'` i bodyn → körs ändå på pinnad
modell; body över taket → 413; över dagstaket → 429; appen oförändrad lokalt och i prod med
`cache_read_input_tokens` fortfarande > 0.

**Dokumentkrav:** bocka av här; uppdatera `swingcheck-handoff.md` (miljövariabler + säkerhetsmodell);
notera i `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` att R2 är åtgärdad med datum.

---

## Avklarat

_(CC flyttar avbockade uppgifter hit med datum och en mening om vad som gjordes, så listan ovan hålls fokuserad på återstående arbete.)_
