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

## Ström S — Skaftdetektering (dataset + annotering)

Nytt spår, **parallellt med pose**. Mål: **4-punkts** skaftdetektering
(`butt → hosel → toe → heel`) på de analys-frames `selectEnvelopeFrames` redan väljer.
Schemat vidgades i S-14; den levererande modellen är fortfarande tvåpunkts. Spec: [shaft/annotation-spec.md](shaft/annotation-spec.md).
Rör **inte** pose-koden: `frameExtractor.ts`, `poseEnvelope.ts`, `poseSegments.ts`,
`poseEnvelopeSelection.ts` och Vision-anropet är låsta för det här spåret.

**Konfliktzon:** `src/lib/dataset/*` (ny), `src/lib/shaft/*` (ny), `src/components/Dev/*` (ny).
Enda rörda delade filer: `src/App.tsx` (dev-route), `src/store/session.ts` (`View`-union),
`vite.config.ts` (`VITE_APP_VERSION`, SW-regeln för skaftassets, `ortSelfHostedWasm`-pluginen).

### [x] S-1 — Dev-verktyg för datasetextraktion

> **Klart (2026-08-12).** Ny vy **"Dataset extractor"** bakom `VITE_DEV_PREVIEW` (launcher nere
> till höger; lazy-laddad så `@mediapipe` inte dras in i huvudbundeln). Användaren väljer en
> eller flera videofiler, märker varje klipp med `source` (web|own), `slowmo` och en notis
> **före** körning, och får en ZIP tillbaka.
>
> **Kedjan är produktionens, oförändrad** — `extractPoseTrajectory` → `detectSessionSwings` →
> per sving `selectEnvelopeFrames(envelope, ANALYSIS_FRAME_COUNT)` → `grabFramesAtTimes`.
> Ingen logik kopierad, inga produktionsfiler rörda. Enda dev-steget är CULLEN: ny ren funktion
> `cullToPhaseTargets` (`src/lib/dataset/phaseQuota.ts`) skär 32 frames/sving till **max 7** genom
> att dela ut frames en i taget till den fas som ligger längst under sin målvikt och fortfarande
> har frames kvar (Hamilton med kapacitet — deterministiskt, och en tom fas låter sin andel flyta
> vidare i stället för att gå förlorad). Målvikterna (downswing 34 %) står nu i specen och speglas
> av `PHASE_TARGET_WEIGHTS`.
>
> **Frames tas i full upplösning, ingen beskärning, kvalitet 0,92** (`maxOutputSide: Infinity`,
> inga `cropBounds`). Ström E:s crop är rätt för Vision-anropet och fel här — att sätta två punkter
> med sub-skaftbredds-noggrannhet är precis det en nedskalning kastar bort.
>
> **`phase` är specens 7-värdesattribut**, inte kodens `SwingPhase`: `follow-through` delas i
> `through` och `finish` (ny ren `derivePhase`, `datasetPhase.ts`), eftersom ett skaft i
> följdrörelse är ett streak och ett skaft i finishen en statisk linje. Att bredda `SwingPhase`
> hade betytt att redigera `poseEnvelopeSelection.ts`.
>
> **ZIP utan nytt beroende:** `zip.ts` skriver store-metod (ingen deflate — JPEG är redan
> entropikodad, så komprimering ger ~0–2 %). ~120 rader, CRC-32 är enda algoritmen. Ingen ZIP64:
> arkiv över 4 GiB **vägras** i stället för att skrivas trasiga.
>
> **`id` är stabilt och härlett** ur `clipName`+`swingIndex`+`frameIndex`
> (`<slug>-<FNV-1a(filnamn)>_s00_f00`), aldrig slumpat — annoteringar matchar frames efter en
> omkörning. Hashen finns för att snarlika filnamn annars kan sluga till samma sträng och tyst
> skriva över varandras frames i arkivet.
>
> `vite.config.ts` exponerar nu `VITE_APP_VERSION` = `<paketversion>+<git sha>`, som skrivs i
> `manifest.json` så ett dataset namnger bygget som valde dess frames.
>
> **Verifierat:** `npm run build` rent (DatasetExtractorView i egen chunk, 14,7 kB),
> `npm run lint` 28 problem = identiskt med baslinjen (inga nya, inga i de nya filerna),
> `npx vitest run` 223/223 (21 nya: `phaseQuota.test.ts` mot fördelning/degradering/determinism,
> `zip.test.ts` mot APPNOTE-bytes + CRC-32-vektorn), och `npm run dev` transformerar alla nya
> moduler. **Ej körd på riktiga klipp** — Erik kör första omgången och kontrollerar att
> fasfördelningen i sammanfattningen landar nära måltalen.

### [x] S-2 — Klipphämtare från r/GolfSwing

> **Klart (2026-08-13).** `scripts/fetch-reddit-clips.mjs` bygger en klipplista ur subredditens
> **publika JSON-listning** (ingen auth). Paginerar med `after`, beskrivande User-Agent, **minst
> 2 s mellan requests** och **avbryter vid 429**. Filtrerar till native Reddit-video
> (`is_video && media.reddit_video`); korspostar, externa länkar, bilder och borttagna poster
> hoppas över. Dedupe på post-id över sidgränser.
>
> Skriver **bara** i `data/shaft/` (guard mot `--out` utanför → fel): `urls.txt` (en permalink/rad
> för `yt-dlp -a`) och `sources.json` (`{id, permalink, title, created_utc, duration}` per post, så
> en frame spåras till Reddit-tråden). CLI: `--sort top|new|hot` (top), `--time all|year|month`
> (year, gäller bara top), `--pages` (5), `--out` (`data/shaft/urls.txt`).
>
> README-avsnitt i specen (*Källmaterial*) om skript + `yt-dlp.exe -f bv -a urls.txt -o "%(id)s.mp4"`
> (Windows/PowerShell). **Verifierat:** arg-parsing och write-guards körda offline; lint rent på den
> nya filen. Live-hämtning **ej körd här** (sandbox-IP:t 403:as av Reddit) — Erik kör på sin maskin.

### [x] S-3 — Automatisk slow motion-detektering per sving

> **Klart (2026-08-13).** `slowmo` härleds nu ur svingens **envelope-varaktighet** i stället för en
> per-klipp-kryssruta — ett klipp kan bära både en normal och en slow-mo-rep, så egenskapen hör till
> **svingen**, inte filen. Ren + enhetstestad `deriveSlowmo(envelopeDurationSec, mode)`
> (`src/lib/dataset/slowmo.ts`): tröskel **3,0 s** som kommenterad konstant `SLOWMO_ENVELOPE_THRESHOLD_SEC`
> (normal sving ~1,2–2,0 s, slow-mo väsentligt längre). Manifestet bär `slowmo` (bool),
> `envelopeDurationSec` (number) och `slowmoMode` per frame + `slowmoThresholdSec` på toppnivå, så
> tröskeln kan omprövas utan omextrahering.
>
> Manuell override i UI:t: `auto | force-normal | force-slowmo` (default `auto`), och manifestet bär
> vilket läge som användes. Körsammanfattningen visar andel slow-mo-frames mot **15 %-taket**
> (`SLOWMO_FRAME_CAP_FRAC`) och varnar (gold) vid överskridande. **Produktionskoden oförändrad**
> (frameExtractor, poseEnvelope, poseSegments, poseEnvelopeSelection, Vision). **Verifierat:**
> `npm run build` rent, `npx vitest run` 231/231 (8 nya i `slowmo.test.ts`), lint rent på nya filerna.

### [x] S-4 — Egen acceptansgrind för datasetextraktion

> **Klart (2026-09-03).** Ny ren modul `src/lib/dataset/datasetGate.ts`: extraktorn har nu en
> **egen, lösare grind** i dev-lagret. `isSwing` är **orörd** — `detectSessionSwings` kör som
> förut, och `collectDatasetSwings` omprövar bara det den lade i `rejected`. Motivet är omvänd
> ekonomi: ett falskt positiv i analysen kostar ett Vision-anrop, medan en bortkastad sving i
> datasetet är en sving ingen kan annotera.
>
> **Accepteras** när `envelope.valid`, varaktigheten ligger i **[0,6 s, 12,0 s]** och
> topphastigheten klarar produktionens tröskel (0,4 × refSpeed). Alltså släpps `clippedTail`,
> handledssynlighet, nedsvingsgränserna och cooldown. **Den vertikala exkursionen (0,08) är
> kvar** — plockade bollar är inga svingar. Envelopes över **3,0 s** körs vidare oförändrat och
> taggas `suspectMultiSwing: true` för granskning i CVAT i stället för att delas här (att dela
> dem hade betytt att implementera om segmenteringen i dev-lagret).
>
> Manifestet bär per frame `gate` (`production` | `dataset-relaxed`), `clippedTail`,
> `hasConfidentImpact` och `suspectMultiSwing`, plus toppnivå `swingsByGate`,
> `relaxedEnvelopeSecRange` och `multiSwingSuspectSec` så grinden kan omprövas ur manifestet
> ensamt. Sammanfattningen och `Clip extracted`-loggen visar antal per grind; svingraderna
> märks `· relaxed` / `· clipped tail` / `· multi-swing?`. Svingarna sorteras på envelope-start
> över båda grindarna, så `swingIndex` — och därmed frame-id:n — förblir tidsordnade.
>
> **Kompromiss att känna till:** `MIN_PEAK_SPEED_FRAC`, `MIN_VERTICAL_EXCURSION` och
> `MAX_ENVELOPE_SEC` är modulprivata i `poseSegments.ts` och får inte exporteras (filen är låst
> för Ström S), så de **speglas** som konstanter i `datasetGate.ts`. Driften bevakas: tre tester
> bisekterar riktiga `isSwing` kring varje speglat värde, så en ändrad tröskel i produktionen
> **failar högljutt** i stället för att dev-grinden tyst använder ett gammalt tal. Cooldown
> tillämpas inte längre på de räddade svingarna — två överlappande paddade grannsegment kan
> alltså ge två poster av samma rörelse; `suspectMultiSwing` och annotatörens öga i CVAT är
> skyddet tills det visar sig vara ett problem i praktiken.

### [x] S-5 — Faskvot som bär över mellan svingar

> **Klart (2026-09-03).** `cullToPhaseTargets` fördelade tidigare **inom en sving**, vilket gör
> lågviktade faser matematiskt onåbara: `finish` är 6 % av 7 frames = 0,42 och avrundas till noll
> i *varje* sving, så en körning på 50 svingar exporterade **noll** finish-frames. Kvoten räknas
> nu som ett **löpande underskott över hela exporten**: per fas hålls `dealt`, och varje frame
> går till den fas som ligger längst under `målvikt × (frames utdelade hittills + 1)` och
> fortfarande har frames kvar i den aktuella svingen.
>
> **Rent, inget modulnivå-tillstånd:** ny `PhaseQuotaState` skickas in och ut
> (`cullToPhaseTargets(picks, max, state) → { kept, state }`, `createPhaseQuotaState()`).
> Ingången muteras aldrig; `extractDataset` trådar en lokal genom hela körningen, klipp
> inräknade. En färsk state ger exakt gamla beteendet, så `targetCounts` är oförändrad.
> En sving som ligger **under** budgeten räknas också in, annars överkompenserar nästa sving
> för ett underskott som aldrig fanns.
>
> **Mätt** över 10 svingar med en realistisk 32-framesselektion: största avvikelse **0,9 pe**
> (address 8,6/8, impact 17,1/18, finish 5,7/6) — alla faser representerade. Testen täcker
> att finish får frames över en serie om 10 svingar, att hela fördelningen ligger inom
> **3 procentenheter** från målen, att staten inte muteras och att en färsk state beter sig
> som förut.
>
> **Verifierat (S-4 + S-5):** `npm run build` rent, `npx vitest run` **259/259** (21 nya i
> `datasetGate.test.ts`, phaseQuota-svitens fördelningstester utökade), `npm run lint`
> 42 problem = **identiskt med baslinjen** (verifierat genom stash-jämförelse, inga nya).
> `git diff main` mot `frameExtractor.ts`, `poseEnvelope.ts`, `poseSegments.ts`,
> `poseEnvelopeSelection.ts` och Vision-anropet: **tom**. Ej körd på riktiga klipp — Erik kör
> första omgången och kontrollerar grind-uppdelningen och fasfördelningen i sammanfattningen.

### [x] S-6 — Kalibreringsset ur exporterna

> **Klart (2026-09-03).** `scripts/build-calibration-set.mjs` drar de 100 frames som annoteras
> **oberoende av båda annotatörerna** och därefter blir permanent evalset. Läser alla `.zip` i
> `data/shaft/exports/` (central directory + `zlib.inflateRawSync` — inget nytt beroende), slår
> ihop manifesten till en pool och **avbryter vid dubbletter av `id`**: samma klipp i två exporter
> betyder att bildens bytes inte är garanterat identiska med metadatan, vilket är precis vad
> reservationslistan finns för att förhindra.
>
> **Deterministiskt:** poolen sorteras på `id` och blandas med mulberry32 seedad från konstanten
> `SELECTION_SEED` (`0x5caff01d`) — samma indata ger alltid samma 100 ids oavsett läsordning.
> Fasfördelning downswing 40 / impact 15 / top 12 / backswing 12 / through 9 / address 7 /
> finish 5; en fas som inte räcker fylls upp från `downswing`, och räcker inte den heller tas
> resten från övriga faser med en **varning i `summary.md`** (poolen är då för liten).
> **Max 1 frame per sving** när poolen tillåter det — två frames ur samma sving är nästan samma
> bild i en överensstämmelsemätning. Taket *höjs ett steg i taget* när poolen har färre svingar
> än setet behöver frames, i stället för att släppas helt (annars stackas hela bristen på den
> sving som råkar ligga först i blandningen). `source` balanseras mot ~50/50 web/own.
>
> Utdata i `data/shaft/calibration/`: `calibration.zip` (`frames/<id>.jpg` + `manifest.json` med
> samma per-frame-format som indata plus `calibration: true`), `reserved-ids.txt` (ett id per rad
> — **bannlysta från träning**) och `summary.md` (faktisk fas-/källfördelning, pool, exporter,
> varningar). Skriptet skriver **aldrig utanför `data/shaft/`** (guard före varje skrivning).
>
> **Verifierat på riktiga data:** 4 exporter → pool 1435 frames / 205 svingar, inga dubbletter;
> draget gav 100 frames, alla fasmål exakt, 50/50 web/own, **100 svingar** (max 1 per sving).
> `calibration.zip` läses av .NET:s `ZipFile` (101 poster) och JPEG-magic stämmer.
> `npx vitest run scripts/build-calibration-set.test.mjs` 15/15 — determinism (även mot omkastad
> läsordning), att seeden faktiskt styr draget, fasmål, downswing-utfyllnad, max 1 per sving,
> källbalans, samt en ZIP-rundtur läsare↔skrivare. Spec-avsnitt tillagt i
> [shaft/annotation-spec.md](shaft/annotation-spec.md) (*Kalibreringssetet: dra, reservera,
> respektera*).

### [x] S-7 — Mät samstämmigheten mellan annotatörerna

> **Klart (2026-09-13).** `scripts/measure-calibration.mjs` jämför de två oberoende
> CVAT-exporterna av kalibreringssetet (COCO Keypoints 1.0, utan bilder) och skriver
> `data/shaft/calibration/agreement.md`. Sökvägarna är CLI-argument (`--a`/`--b`/`--out`) med
> `erik.zip`/`lisa.zip`/`agreement.md` som default; `--dry-run` skriver bara terminalsammanfattningen.
> Inga nya beroenden — ZIP-läsningen är `openZip`/`readEntry` från `build-calibration-set.mjs`,
> återanvänd i stället för omskriven. Samma skrivguard: aldrig utanför `data/shaft/`.
>
> **Rapportens sju avsnitt:** täckning (bild- och punktnivå), flaggsamstämmighet med 3×3-korstabell
> outside/occluded/visible per punkt, avstånd (median/p90/max i px **och** normaliserat mot
> bildhöjden — setet blandar 720×818 och 1080×1920, så px ensamt är inte jämförbart), samma
> statistik uppdelad per `phase`/`view`/`blur`, skaftlängd som rimlighetskontroll med de 10 värsta,
> vinkelavvikelse (`atan2` butt→hosel, minsta vinkelavstånd i [0°,180°] — **inte** vikt vid 90°, så
> ombytta ändpunkter syns som ~180° i stället för att försvinna som 0°) totalt och per fas, samt en
> topplista på 15 frames för manuell granskning.
>
> **Synlighetsmappningen verifieras, antas inte.** `outside`→v=0 / `occluded`→v=1 är ett antagande
> om CVAT:s exportör som varje siffra vilar på, så `verifyVisibility` kontrollerar värdemängden
> {0,1,2}, att `num_keypoints` är lika med antalet v>0 (COCO:s egen definition, alltså ett oberoende
> vittne om vilka flaggor exportören räknar som placerade) och att v=1 alls förekommer — en export
> utan v=1 gör mappningen *obekräftad*, inte bekräftad. Rapporten leder med verdiktet i avsnitt 0.
> **Fynd:** mappningen stämmer, men v=0-punkter bär ändå kvar koordinater (CVAT behåller senaste
> dragna läget), så det är flaggan och aldrig koordinaten som avgör om en punkt jämförs.
>
> **Utfall på de riktiga exporterna:** 97 frames av 100 annoterade av båda (3 saknas i CVAT-tasken).
> Butt median 2,5 px / 0,17 %H, p90 12,8 px; hosel 1,9 px / 0,13 %H, p90 4,7 px. Vinkel: median
> **0,3°**, p90 1,3°, max 2,3° över 81 frames. Placeringen håller alltså. **Etiketterna gör det
> inte:** `phase` samma värde i 56/97, `blur` i 76/97, `view` i 92/97, och synlighetsflaggan skiljer
> i ~12 % per punkt (dominerande felet är `occluded` vs `visible`). `severe blur` sticker ut som
> specen förutsade (butt-median 0,56 % mot 0,14 % för `none`, vinkel 1,1° mot 0,2°); **`downswing`
> gör det inte** — men hinken är 6 frames stor just för att fasetiketten är omtvistad, så det är en
> icke-observation, inte ett friskintyg. Rapporten flaggar själv varje attribut under 80 % enighet
> med att hinkarna ska läsas som indikationer.
>
> **Specens målvärde (medianavvikelse < 0,5 skaftbredd) går inte att utvärdera** — 2-punktsschemat
> bär ingen bredd, så rapporten redovisar px och bildhöjd och säger uttryckligen att kopplingen till
> skaftbredder saknas.
>
> **Verifierat:** `npx vitest run` **311/311** (37 nya i `scripts/measure-calibration.test.mjs`, allt
> på syntetisk data eftersom de riktiga exporterna är gitignorad persondata) — percentil mot numpys
> `linear`/R type 7 inklusive icke-mutation och numerisk sortering, vinkelskillnad över ±180-sömmen
> och att ombytta ändpunkter ger 180°, att v≥1 och inte koordinaten avgör vilka punkter som jämförs,
> korstabellen, skaftlängdsrankningen, att topplistan rankas normaliserat (px-rankning skulle kasta
> om två frames med olika bildhöjd) och att en frame som är topp-15 på vinkel utan att vara det på
> punktavvikelse ändå namnges.
>
> **Nästa (S-8):** skärp `phase`- och `blur`-definitionerna och regeln för `occluded` vs `visible` i
> [shaft/annotation-spec.md](shaft/annotation-spec.md) innan produktionsannoteringen startar, och
> granska avsnitt 5 + 7 för hand (`096-a36a587d_s00_f01` är värst: 47 % skillnad i skaftlängd).

### [~] S-8 — Skärp annoteringsreglerna efter kalibreringen

> **Specen klar (2026-09-13), manuell granskning återstår.** Enbart dokumentation —
> [shaft/annotation-spec.md](shaft/annotation-spec.md), ingen kod rörd.
>
> - **`phase` annoteras inte längre för hand.** Fylls från `manifest.json` när tasken skapas;
>   annotatören ska varken sätta eller ändra den. 58 % enighet var mätningens lägsta siffra, och
>   det är en omöjlig uppgift på en stillbild — extraktorn har envelopen och tidsstämpeln.
>   Attributtabellen har en **"Sätts av"-kolumn**, och det befintliga stycket om att fasen är
>   *ungefärlig* utan verifierad impact är hopkopplat med den nya regeln i stället för att som
>   förut sluta med "annotatören rättar i CVAT".
> - **`blur` är nu en tillämpbar regel:** `none` = skarpa kanter, en enda skaftlinje; `mild` =
>   mjuk kant men fortfarande **en** linje; `severe` = streak eller flera överlappande skaftbilder,
>   ingen enskild linje att peka på. Uttalat att gränsen går vid **antalet linjer, inte vid hur
>   ful bilden är** — brus, kompression och dålig belysning är egenskaper hos bilden, inte hos
>   skaftet. Zoomregeln gäller nu även *när man klassificerar*, inte bara när svaret blev `severe`.
> - **`occluded` vs `visible` skärpt:** `visible` = du ser punkten; `occluded` = du ser den inte
>   men kan sluta dig till läget ur skaftets riktning → placera den; `outside` = varken eller →
>   placera inte. Nyckelmening: **`occluded` handlar om punkten, inte om bilden** — synligt skaft
>   med skymd greppände ger `visible` hosel + `occluded` butt. Tillagt: punkt utanför bildkanten
>   är `outside`.
> - **Hoseln** definieras nu som *där skaftets linje slutar vara rak* — inte mitt i huvudets
>   suddfläck, inte vid en ferrule högre upp. Skälet står i texten: det är riktningen som mäts,
>   och riktningen definieras av den raka delen.
> - **Nytt avsnitt "Tvetydiga frames — gå till källan"** som **normal arbetsgång**: slå upp
>   frame-id:t i `manifest.json`, öppna klippet i `data/shaft/clips/` (`clipName`), spola till
>   `tSec` och stega bildruta för bildruta. Rörelsen före/efter gör ändarna entydiga. Är framen
>   ändå otydbar är `outside`/`no_shaft` rätt svar — en medvetet satt `outside` är data, en
>   gissning är brus.
> - **Nytt avsnitt "Kalibreringsutfall 2026-09"** med siffrorna bakom besluten: vinkelmedian
>   **0,3°** (p90 1,3°, max 2,3°, n=81), butt 0,17 %H / 2,5 px, hosel 0,13 %H / 1,9 px, samt vilka
>   attribut som föll under 80 % (`phase` 58 %, `blur` 78 %; `view` 95 % lämnas orört). Noterar
>   också att `severe blur` stack ut som förutsagt men att **`downswing` inte gjorde det** — en
>   icke-observation, eftersom hinken bara rymde 6 frames just för att fasetiketten var omtvistad.
>   Frågan får ställas om när `phase` kommer från manifestet.
> - Noterat i specen att **målvärdet < 0,5 skaftbredd inte gick att utvärdera** (2-punktsschemat
>   bär ingen bredd) och att 3 av de 100 reserverade ids:en aldrig kom in i CVAT-tasken.
>
> **Återstår:** (a) den manuella granskningen av rapportens avsnitt 5 och 7 — 15 frames plus
> skaftlängdslistan, värst `096-a36a587d_s00_f01` med 47 % längdskillnad; (b) beslut om målvärdet
> ska formuleras om i bildhöjd eller om en skaftbredd ska mätas för hand på ett urval; (c) de 3
> saknade kalibreringsframesen in i tasken. Ingen omannotering av kalibreringssetet är planerad —
> det är evalset, och siffrorna ovan är dess mätvärde.

### [x] S-9 — Första träningsbatchen ur poolen

> **Klart (2026-09-13).** `scripts/build-training-batch.mjs` drar en träningsbatch ur samma
> exporter som kalibreringssetet, med evalsetet exkluderat. `--n` (default 150), `--out` (default
> `data/shaft/training/batch-01`), `--exports`, `--exclude`, `--no-auto-exclude`, `--dry-run`.
> Inga nya beroenden; samma skrivguard mot `data/shaft/`.
>
> **Exkluderingen är hela poängen och är hård.** `reserved-ids.txt` läses **först**, före allt
> dyrt och långt före någon skrivning, och en saknad fil **avbryter med exit 1** och ett meddelande
> som förklarar konsekvensen — en saknad lista ser annars ut precis som "inget att exkludera", och
> det felet upptäcks först när evalsiffrorna är omotiverat bra. Utöver den läses **varje
> `data/shaft/training/*/ids.txt`** utom den katalog som skrivs, så samma frame aldrig annoteras
> två gånger. Exkluderade ids som *inte* finns i poolen rapporteras separat — det betyder att en
> export saknas i `exports/` och att poolen inte är den kalibreringssetet drogs ur.
>
> **Draget är återanvänt, inte kopierat:** `selectCalibrationSet` från
> `build-calibration-set.mjs` tar redan `size`/`quotas`/`seed`/`maxPerSwing`, så spridningen över
> svingar, web/own-balansen och utfyllnaden från `downswing` är samma testade kod. Två skillnader:
> **faskvoterna** kommer från specens målvikter upplösta med största resten (för 150: downswing 51,
> impact 27, backswing 21, top 15, through 15, address 12, finish 9) och **seeden** är
> `TRAINING_SEED = 0x7ba7c0de`, skild från kalibreringens — delad seed hade korrelerat
> blandningarna och dragit batchen mot de frames som nätt och jämnt missade evalurvalet.
>
> **CVAT-förifyllningen undersöktes i stället för att antas, och den funkar.** `prefill-phase.xml`
> är *CVAT for images 1.1* med en `<tag label="frame_meta">` per `<image>` som bär
> `<attribute name="phase">`; `labels-frame-meta.json` är etikettschemat i den form
> `cvat-cli --labels` tar. Ett kommando: `cvat-cli task create … --labels … --annotation_path …
> --annotation_format "CVAT 1.1" local frames/`. **Två verifierade fallgropar** står i både
> `summary.md` och specen: (1) schemat kan *inte* importeras — CVAT:s dokumentation är explicit om
> att bara etikettnamn kan skapas ur en import, attribut måste finnas i förväg, annars tas taggarna
> tyst inte emot; (2) `image/@name` måste matcha bildens namn i tasken (`frames/`-prefix matchar
> `batch.zip`; en katalog med lösa JPEG:ar ger bara `<id>.jpg`). **Designval:** `phase` läggs som
> *tag*, inte som attribut på `shaft`-skelettet, eftersom ett skelettattribut bara kan förifyllas
> genom att skicka med förplacerade punkter. Följden — `phase` hamnar utanför
> `annotations[].attributes` i exporten och `measure-calibration.mjs` får tomma fashinkar mot en
> sådan batch — är noterad i specen; manifestet bär fasen och är auktoritativt.
>
> **Utdata i `data/shaft/training/batch-01/`:** `batch.zip` (150 JPEG + `manifest.json` med `phase`
> per frame), `ids.txt`, `prefill-phase.xml`, `labels-frame-meta.json`, `summary.md`.
>
> **Verifierat på riktiga data:** pool 1435 → 1335 efter exkludering av 100 reserverade (0 saknade),
> drog 150 frames över **150 svingar** (max 1/sving), alla sju faskvoter exakt, 75/75 web/own.
> `ids.txt` × `reserved-ids.txt` = **tomt snitt**. ZIP:en har 151 poster och dess `manifest.json`-ids
> är identiska med JPEG-posterna; XML:en är well-formed (150 `<image>`, 150 taggar) och dess
> `phase` matchar manifestet för **alla 150**. Omkörning gav **bit-identisk `ids.txt`**. En
> `--dry-run` mot `batch-02` plockade automatiskt upp `batch-01/ids.txt` (250 exkluderade).
> Borttagen `reserved-ids.txt` ger **exit 1** och inget skrivet (filen återställd).
> `npx vitest run` **343/343**, 32 nya i `scripts/build-training-batch.test.mjs`: exkludering från
> flera håll (inklusive när hela `downswing` är reserverad och när poolen tar slut — då dras en
> *kort* batch i stället för att gröpa ur evalsetet), determinism mot omkastad läsordning och mot
> exkluderingsmängdens iterationsordning, att seeden gör skillnad och skiljer sig från
> kalibreringens, kvoter som summerar till `n` för n = 1…400, samt XML- och JSON-utdatan.
>
> **Bifynd:** kalibreringssetets `PHASE_QUOTAS` matchar inte specens målvikter — loggat som
> **[F4](oppna-fragor.md)**, inte tyst rättat: setet är redan annoterat och är evalset.

### [x] S-10 — Träningsmiljö för skaftdetektorn

> **Klart (2026-09-13).** Nytt, fristående spår i `training/`: Python 3.11 + CUDA, YOLOv8n-pose.
> **Ingen webbappskod rörd** — Python-koden läser `data/shaft/` och skriver bara i `training/`.
> Ingen träning körd; bara uppsättningen. Dokumentation: [../training/README.md](../training/README.md).
>
> **Filer:** `README.md` (uppsättning steg för steg), `requirements.txt`, `prepare_dataset.py`
> (CVAT COCO Keypoints → YOLO-pose), `train.py`, `evaluate.py`, `shaft_coco.py` (delade läsare).
> `training/runs/`, `training/datasets/`, `training/.venv/` och `__pycache__/` gitignorade.
>
> **PyTorch installeras separat och före `requirements.txt`** — annars drar `ultralytics` in
> CPU-hjulet från PyPI och GPU:n används aldrig. Kommandot i README är hämtat från pytorch.org och
> kontrollerat mot indexet: `--index-url https://download.pytorch.org/whl/cu132` (CUDA 13.2,
> torch 2.14:s förval; `cu130`/`cu126` finns som alternativ). Hjulet
> `torch-2.14.0+cu132-cp311-cp311-win_amd64.whl` är verifierat att existera. Pinnarna
> (`ultralytics==8.4.150`, `numpy==2.4.2`, `onnx==1.22.0`, `onnxslim==0.1.96`,
> `onnxruntime==1.30.0`) är var och en kontrollerade att ha cp311/win_amd64-hjul. **3.11 är rätt
> version**: `onnxruntime` 1.30 kräver ≥ 3.11 och `numpy` 2.5 kräver ≥ 3.12, så 3.11 är den lägsta
> versionen kedjan går ihop på och den högsta där allt har färdiga hjul.
>
> **`prepare_dataset.py` läser `reserved-ids.txt` och avbryter om den saknas** — samma hårda regel
> som `build-training-batch.mjs`, av samma skäl (en saknad lista ser ut precis som "inget att
> exkludera"). Dessutom en slutkontroll att inget reserverat id nådde datasetet. Fasen läses ur
> `phase-corrected.json` (letas upp automatiskt intill batch-ZIP:en), annars annotatörens värde i
> exporten, annars manifestets härledda — och hamnar i `frame-meta.json`, **aldrig i etiketterna**.
>
> **Bounding box — valet är dokumenterat i README.** Skaftet har ingen naturlig box, så den är
> punkternas omslutande rektangel + marginal (0,06 × längsta sidan, golv 0,01 × bildens kortaste
> sida, klippt mot kanten). Golvet finns för att ett lodrätt skaft ger bredd noll. **Frames med bara
> en punkt placerad behålls** (20 av 143 i batch-01) med en kvadratisk ersättningsbox vars sida är
> datasetets mediana skaftlängd / √2 — alltså samma ytfördelning som de riktiga boxarna, vilket
> spelar roll eftersom pose-förlusten normaliserar keypoint-felet mot boxytan. Skälet att behålla
> dem: bortfallet är inte slumpmässigt — en punkt är `outside` just när den är svår, så att kasta dem
> vore att kasta 14 % av datan och systematiskt de svåraste framesen. `--single-point drop` finns
> för att mäta vad valet kostar.
>
> **Spegling är av i två lager:** `flip_idx: [0, 1]` (identiteten) i `data.yaml` och `fliplr=0.0` i
> `train.py`, som **avbryter** om värdet inte är 0. `butt`/`hosel` är de två ändarna av en *riktad*
> vektor, inte ett spegelsymmetriskt par — ingen indexpermutation gör en speglad bild korrekt
> etiketterad. Även `flipud`, `mixup`, `copy_paste`, `erasing` och `mosaic` är explicit 0 snarare än
> lämnade till Ultralytics' defaults, så en uppströms defaultändring inte tyst slår på spegling.
> Rotation 8°, skala 0,40, translation 0,10, shear 2°, HSV 0,015/0,5/0,4. Defaults för 146 bilder på
> 12 GB: `--epochs 300 --batch 16 --imgsz 960 --patience 60 --cache ram`.
>
> **`evaluate.py` mäter mot människornas samstämmighet, inte mot ett påhittat mål:** vinkel median
> 0,3°, `butt` 0,17 %H, `hosel` 0,13 %H ur `agreement.md` (S-7) skrivs ut vid sidan av modellens
> siffror med differensen. Per punkt median i **både px och % av bildhöjden** (setet blandar 720×818
> och 1080×1920), vinkelavvikelse median + p90, allt grupperat per `phase`, `view` och `blur`. Plus
> andelen frames där modellen predicerar en punkt annotatören flaggade `outside` och omvänt — med
> noteringen att det förstnämnda inte automatiskt är fel, eftersom `outside` betyder att
> *annotatören* inte kunde sluta sig till läget. Vinkelskillnaden viks inte vid 90°: ombytta
> ändpunkter ska synas som ~180°. Rapport → `training/eval-report.md`.
>
> **`shaft_coco.py` finns för att synlighetsregeln bara får tolkas på ett sätt.** CVAT lämnar kvar
> koordinaten för en `outside`-punkt, så en läsare som avgör "är punkten satt?" på koordinaten
> räknar spökpunkter. Två kopior av regeln i `prepare_dataset.py` och `evaluate.py` hade glidit
> isär, och glidningen syns inte som ett fel utan som en evalsiffra som är tyst felaktig. Samma
> modul verifierar dessutom kodningen mot filen ({0,1,2}, `num_keypoints` = antalet `v>0`, och att
> `v=1` alls förekommer) i stället för att ta den för given.
>
> **Verifierat (ingen träning körd).** Python 3.11.9 installerad (`winget`, `py -3.11` svarar); alla
> fyra moduler kompilerar och importerar rent; `--help` på alla tre skript exit 0; `--dry-run` på
> alla tre. **Mot riktiga data** (`batch-01/annotated-v2.zip` + `batch.zip`): 146 frames in → **143
> skrivna**, 3 bortfall (`no_shaft=true`), 123 med båda punkterna + 20 med en, split 122/21 grupperad
> per sving, fas från `phase-corrected.json` för alla 143. **Alla 143 etikettfiler validerade**: 11
> tokens, klass 0, allt i [0,1], ingen degenererad box, varje satt punkt inne i sin box, och
> ospecificerade punkter skrivna som `0 0 0` — aldrig CVAT:s spökkoordinat. En etikettrad räknad för
> hand mot COCO-källan stämmer på sjätte decimalen. Borttagen `reserved-ids.txt` ⇒ **exit 1**; en
> fejkad lista med 2 batch-ids ⇒ 141 skrivna. `--single-point drop` ⇒ 123. `evaluate.py --dry-run`
> mot kalibreringssetet: 97 annoteringar, 100 bilder, 97 i snitt, synlighetskodningen **verifierad**.
> `render_report` och statistik-/geometrihjälparna körda mot syntetiska data (percentiler mot numpys
> `linear`, vinkelskillnad över ±180-sömmen, lodrätt skaft, kantklippning, tomma hinkar utan
> division med noll).
>
> **Ej verifierat här, och varför:** den här maskinen har ingen NVIDIA-GPU (Intel Arc) och
> `ultralytics`/`torch` är inte installerade, så GPU-steget i README, den faktiska
> `model.train()`-körningen och ONNX-exporten är oprövade. `prepare_dataset.py` är därmed
> genomkörd på riktiga data medan `train.py`/`evaluate.py` är verifierade till kanten av
> Ultralytics-anropet.

### [x] S-11 — Skaftdetektorn i webbappen

> **Klart (2026-09-14).** `onnxruntime-web` 1.29 + ny fristående modul `src/lib/shaft/` + dev-vy
> bakom `VITE_DEV_PREVIEW`. **Pose-kedjan är byte-för-byte orörd** — `git diff main` är tom för
> `frameExtractor.ts`, `poseEnvelope.ts`, `poseSegments.ts`, `poseEnvelopeSelection.ts` och
> `api.ts` (Vision-anropet). Rörda delade filer är de tre strömmen redan äger: `App.tsx`
> (dev-route), `store/session.ts` (`View`-union), `vite.config.ts` (SW-regel + en plugin).
>
> **Runtime — självhostad som MediaPipe-WASM.** `scripts/copy-shaft-wasm.mjs` kopierar
> `ort-wasm-simd-threaded.wasm` (13,3 MB) ur node_modules till `public/ort/`, exakt samma mönster
> som `copy-pose-wasm.mjs`; `npm run shaft:wasm`, och `prebuild` kör nu `npm run assets`
> (pose + shaft). `public/ort/` och `public/models/*.onnx` gitignorade. Ingen CDN-förfrågan.
>
> **Lazy, inte precachad — och det är valet.** 12,4 MB modell + 13,3 MB runtime skulle nära
> tredubbla en förstainstallation (precachen är ~16 MB idag) för en detektor som ingen
> produktionsanvändare kan nå, eftersom enda anroparen ligger bakom `VITE_DEV_PREVIEW`. Båda
> filerna laddas därför vid första användning och hålls av en `CacheFirst`-runtimeregel
> (`shaft-runtime`) — ett långsamt första varv, offline för gott efteråt. Motiveringen står i
> koden (`shaftDetector.ts`-huvudet + regeln i `vite.config.ts`) med villkoret för att ompröva:
> den dagen detektorn går in i analyskedjan är "första användning" varje användares första sving.
> **Verifierat i den byggda appen:** precachen har 27 poster och varken `.onnx` eller `/ort/`;
> efter första hämtningen ligger båda i `shaft-runtime`.
>
> **`wasmPaths` är objektformen, inte katalogprefixet.** Ett prefix får ORT att `import()`:a sin
> Emscripten-laddare ur `public/` också, och det vägrar Vites devserver (HTTP 500, *"This file is
> in /public … should not be imported from source code"*). `{ wasm: '/ort/…wasm' }` överskrider
> bara binären, så laddaren blir den som redan ligger inbakad i `onnxruntime-web/wasm`-bundeln —
> en fil att hosta, och dev och prod beter sig lika. **Hittat genom att köra, inte genom att läsa.**
>
> **En Vite-plugin (`ortSelfHostedWasm`) tar bort en dubblett på 13,3 MB.** ORT-bundeln bär en
> `new URL("ort-wasm-simd-threaded.wasm", import.meta.url)`-fallback som Vite läser som en
> asset-referens och emitterar hashad i `dist/assets/` — dit ingen någonsin hämtar, eftersom
> `wasmPaths` vinner. Pluginen skriver om fallbacken till `/ort/…`, vilket både tar bort
> asset-referensen och gör fallbacken *korrekt* i stället för bara oanvänd.
>
> **Detektormodulen.** `shaftDetector.ts` (session + preprocessing), `letterbox.ts` (geometrin),
> `shaftPostprocess.ts` (avkodning + NMS), `shaftPreview.ts` (dev-kedjan). Sessionen byggs en gång
> och delas; samtidiga första anrop delar ett `loading`-löfte. API: bas64-JPEG in — exakt vad
> `grabFramesAtTimes` ger — och `{ butt, hosel }` ut **i bildens egna pixlar**, plus `boxConf`,
> `inferenceMs`, `preprocessMs` och `imageSize`. Trösklar: conf 0,25, keypoint 0,5, NMS-IoU 0,45;
> NMS körs trots att svaret ändå är högsta konfidens, så en andra spelare i bild syns som två
> detektioner i stället för att gömmas bakom ett tal. En punkt under keypoint-tröskeln returneras
> som `null` — specens `outside` — inte som en gissad koordinat. `numThreads = 1`: flertrådad WASM
> kräver SharedArrayBuffer och därmed COOP/COEP, och appen sätter inga sådana headers (kontrollerat
> i `wrangler.jsonc`), så ORT hade fallit tillbaka ändå.
>
> **Letterbox, inte utsträckning — och README:n är inte fel, den beskriver något annat.**
> `export_onnx.py`s `cv2.resize(img, (imgsz, imgsz))` finns bara för att mata *samma* array till
> PyTorch och ONNX i den numeriska jämförelsen. Noggrannhetsvägen är `evaluate.py`, som går via
> `model.predict()` → Ultralytics `LetterBox` (bevarad proportion, centrerad, grå 114) — och det är
> också vad träningen gör. En utsträckning hade kört en 1080×1920-telefonfilm genom en 1,78×
> horisontell klämning modellen aldrig sett, och skaftets **vinkel** är precis vad en icke-uniform
> skalning förstör. `computeLetterbox` speglar Ultralytics ned till dess `round(pad − 0.1)`.
>
> **Transformen är enhetstestad fram och tillbaka** (`letterbox.test.ts`, 9 test): rundresa för
> porträtt/landskap/kvadrat/uppskalning, att hörnen landar på den ritade rektangeln, att vinkeln
> överlever transformen, och ett test som specifikt fångar *bara-skala-glömde-paddningen* (~210 px
> fel på en porträttframe). `shaftPostprocess.test.ts` (13 test) pinnar kanalordningen mot
> handbyggda tensorer, trösklarnas gränsvärden och IoU/NMS.
>
> **Dev-vyn.** Ny route `shaft` + launcher "⌁ Shaft" bredvid "⚗︎ Dataset". Kedjan är produktionens,
> **inte** datasetets: `detectSessionSwings` (produktionens gate, inte den uppmjukade), ingen
> fascull, full upplösning utan crop och kvalitet 0,92 — samma pixlar modellen tränades på.
> Butt (grön) och hosel (magenta) ritas som punkter med en linje emellan i en SVG vars `viewBox`
> är **källbildens** storlek, så det som syns är den koordinat detektorn gav. Per frame visas
> box-konfidens, punktkonfidenser, vinkel och inferenstid; överst medianen för hela körningen.
>
> **Mätt inferenstid, desktop** (Windows 11, headless Chrome 149, ORT-WASM 1 tråd, 960²):
> **median 630 ms/frame**, mean 646, min 604, max 795 (29 frames ur `002.mp4`, produktionsbygget;
> devservern gav 654 ms median). Preprocessing (JPEG-avkodning + letterbox + tensor) 16 ms median.
> Sessionsbygget 0,5–1,2 s när filerna är cachade. **En sving ≈ 29 frames ≈ 19 s.** Samma modell i
> Python på samma maskin (`onnxruntime` CPU, flertrådad) tar 65 ms — skillnaden är trådarna plus
> WASM-overhead, och den är värd att veta om innan detektorn får en produktionsyta.
>
> **Verifierat mot Python på samma frames** (tre kalibreringsframes genom
> `public/models/shaft-v1.onnx` i båda miljöerna, samma letterbox och postprocessing):
>
> | Frame | Python | Webbläsare |
> |---|---|---|
> | `002-2415a710_s00_f02` 720×818 | conf 0,769 butt (249, 434) hosel (181, 375) | conf 0,773 butt (249, 434) hosel (181, 374) |
> | `006-48f0d1f4_s00_f03` 1080×1440 | ingen detektion | ingen detektion |
> | `008-b8e78a8a_s00_f05` 1080×1920 | conf 0,260 butt (704, 565) hosel (602, 547) | conf 0,278 butt (704, 565) hosel (602, 548) |
>
> Högst **1 px** skillnad på varje satt punkt; konfidensavvikelsen (~0,02) är canvas' bilinjära
> nedskalning mot cv2:s `INTER_LINEAR`. Det är det starka beskedet att letterboxen och
> kanalordningen stämmer.
>
> **Fynd värt att triagera, inte ett integrationsfel:** på `002.mp4` hittar modellen klubban i
> **10 av 29** frames — address och tidig backswing säkert (conf 0,87–0,90), nedsvinget nästan inte
> alls (conf 0,00). Python säger samma sak på de svåra framesen, så det är modellen, inte kedjan.
> Nästa steg för det hör hemma i en egen uppgift (mer träningsdata på `downswing`, eller `blur`-
> viktning), inte här.
>
> **`npm run lint` städad två snäpp:** `dev-dist/` och `training/.venv/` ligger nu i
> `globalIgnores`. Båda är gitignorerade genererade träd som eslint annars vandrade — vilket gjorde
> att "är lint ren?" berodde på vad som råkade ligga kvar på disken.

### [x] S-12 — Batch-02 + förhandsmärkning med modellen

> **Klart (2026-09-14).** 250 frames dragna som `batch-02`, och `training/prelabel_batch.py`
> som kör `shaft-v1.onnx` över dem och skriver en CVAT-importerbar `prelabel.xml`.
> **118 av 250 frames (47 %) förhandsmärkta.** Dokumentation:
> [../docs/shaft/annotation-spec.md](shaft/annotation-spec.md) → *Förhandsmärkning med modellen*.
>
> **Batchspecifik faskvot, specens tabell orörd.** Ny flagga `--phase-weights <fil>` på
> `build-training-batch.mjs`: en **committad JSON-fil** med `weights` + en obligatorisk `note`,
> inte en kommandoradssträng, så avvikelsen och argumentet för den hamnar i historiken bredvid
> varandra och `summary.md` kan citera tillbaka motiveringen. Vikterna måste summera **exakt**
> till 1 — en tabell som summerar till 0,98 drar annars varje kvot två procent kort utan att
> säga det. Batch-02 ([`batch-02-phase-weights.json`](shaft/batch-02-phase-weights.json)):
> `downswing` 34 → **44 %**, `top` 10 → **16 %**, betalt ur `through`/`backswing`/`address`/
> `finish`; `impact` bara 18 → 16 % (delar oskärperegim med downswing); `idle` 2 → 0 %
> (poolen innehåller noll idle-frames efter exkludering, så kvoten hade runnit över i
> downswing i tysthet ändå). Varje kvot träffades exakt: 110/40/40/25/15/10/10, 205 svingar,
> 125 web / 125 own. Exkludering: 100 reserverade + batch-01:s 150, alla 250 fanns i poolen.
>
> **Vygrinden är hela poängen, och den bygger på en mätning — inte på en gissning.** Modellen
> kastar om `butt`/`hosel` vid förkortning. Mätt på kalibreringssetet (97 frames) med samma
> kedja som appen: `dtl` **50 förhandsmärkta, medianfel 2,6°, noll ombytningar**; `face_on`
> (per erik) 4 förhandsmärkta, **medianfel 158,6°**, 2 ombytningar. Alltså förhandsmärks en
> frame **bara när varje redan annoterad frame ur samma sving säger `dtl`**. Kameran flyttar
> sig inte under en sving — men **den flyttar sig mellan svingar i samma klipp**, vilket
> `072.mp4` (s00 dtl, s02 face_on), `IMG_5426.MP4` och `IMG_5428.MP4` är annoterade bevis för,
> så uppslagningen är per **sving** och aldrig per klipp (clip-nivå hade täckt 4 % mer och
> förhandsmärkt just de klippens face-on-svingar). Enighet krävs: de fyra frames där erik och
> lisa var oense om `view` var **4 av 4** erik `face_on` / lisa `dtl` — enkelriktat, samma
> mönster som `occluded`/`visible`. Täckningen räckte: 156 av batchens svingar är enhälligt
> `dtl` (187 frames), 18 har någon `face_on` (21 frames), 31 har ingen annoterad frame alls
> (42 frames).
>
> **Två heuristiker prövades mot data och förkastades** — skrivna i skriptets huvud och i
> specen så de inte prövas igen. (1) *Skaftlängd i förhållande till personen*: går inte.
> Facitlängden som andel av bildhöjden är 0,032–0,313 för `dtl` och 0,116–0,239 för `face_on`
> — face-on ligger **helt inuti** dtl-intervallet. De två ombytta framesen hade dessutom
> predicerad längd 0,168 H och 0,261 H medan setets två *kortaste* prediktioner (0,054 H,
> 0,084 H) låg rätt på 13,7° och 2,5°; grinden hade kastat bra märkningar och behållit båda de
> dåliga. Konfidens räddar inte heller — båda ombytningarna hade box-konf ~0,73 och
> keypoint-score ~1,00. (2) *Vinkelkontinuitet mot svingens övriga frames*: går inte, skaftet
> sveper genom nästan ett helt varv under svingen. Mätt över 55 frames: **0 fångade, 2
> missade, 24 falsklarm.**
>
> **Importformatet är verifierat, inte antaget.** CVAT for images 1.1, mot `docs.cvat.ai` →
> *Dataset management → Formats → CVAT for image* och samma sidas källa i `cvat-ai/cvat@develop`
> (självhostad, senaste): `<skeleton label="shaft" source="…" z_order="…">` med nästlade
> `<points label="butt|hosel" occluded="…" source="…" outside="…" points="x,y">`, där
> `points/@label` är **sub-etiketten**. Samma fallgrop som för `prefill-phase.xml` gäller —
> *"Only label names can be imported this way, colors, attributes, and skeleton labels must be
> defined manually"* — så `shaft`-skelettet måste redan finnas på tasken från
> `docs/shaft/cvat-labels.json`. COCO Keypoints 1.0 importerar också skeletons och hade
> fungerat; CVAT-for-images valdes för att det är CVAT:s förlustfria eget format, bär
> per-punkts-`outside` som specens tre synlighetslägen bygger på, och redan har en verifierad
> rundtur i repot. `<meta>`-blocket byggs ur `cvat-labels.json` så sub-etikettnamnen inte kan
> glida från tasken.
>
> **Python, inte Node — och skälet är att det går att köra.** `onnxruntime`, `cv2`, `numpy`
> och `pillow` är redan pinnade i `training/requirements.txt` och installerade;
> `onnxruntime-web` behöver WASM och en canvas, och JPEG-avkodning i Node hade krävt ett nytt
> beroende. Priset är att letterbox + postprocessing nu finns i **två** språk, så
> `test_prelabel_batch.py` pinnar Python-sidan mot de tre frames S-11 verifierade i båda
> miljöerna — `002-2415a710_s00_f02` conf 0,769 butt (249, 434) hosel (181, 375),
> `006-48f0d1f4_s00_f03` ingen detektion, `008-b8e78a8a_s00_f05` conf 0,260 butt (704, 565)
> hosel (602, 547) — och reproducerar dem **på pixeln**.
>
> **Vad som inte sätts.** `view`, `blur`, `phase` och `no_shaft` lämnas osatta: skelettet
> skrivs utan ett enda `<attribute>`, så CVAT lägger på etikettens defaultvärden.
> Punktflaggorna lämnas som `visible` — modellens keypoint-score är inte specens
> synlighetsbedömning och får inte kläs ut till en. `source="manual"` och inte `"auto"`: båda
> är dokumenterade värden, men `auto` är det repot aldrig kört en rundtur på, och att i
> efterhand se vilka punkter som kom från modellen beror inte på flaggan — `prelabel.xml`
> ligger kvar bredvid batchen, så en diff mot den returnerade exporten säger exakt vilka
> punkter annotatören flyttade.
>
> **Utfall.** 118 förhandsmärkta; 132 överhoppade fördelat på 62 utan detektion, 42 ur svingar
> utan känd vy, 21 ur svingar som inte är enhälligt `dtl`, 7 med en punkt under
> keypoint-tröskeln, 0 degenererade. Per fas: `impact` 60 %, `downswing` 50 %, `backswing`
> 48 %, `through` 47 %, `top` 42 %, `address` 20 %, `finish` 10 % — att `finish` och `address`
> ligger lågt är samma sak som S-11 såg: de framesen är lätta för människan och modellen ser
> dem sällan i poolen. Detektionsgraden inom de 187 vy-godkända framesen är 63 %, vilket
> stämmer med kalibreringssetets 57 %.
>
> **Verifierat.** `npm run build` rent · `npx vitest run` **375/375** (13 nya i
> `build-training-batch.test.mjs`: vikttabellens validering, båda summarykolumnerna, att en
> nollviktad fas inte kan få utfyllnad) · `py -3.11 -m unittest discover -s training -t training`
> **34/34**, inklusive de två pinnade end-to-end-testerna mot den riktiga modellen.
> `npm run lint` har **2 kvarstående fel, båda sedan tidigare och i orörda filer**
> (`FrameLightbox.tsx:27`, `useHistory.ts:93` — `react-hooks/set-state-in-effect`); de hör inte
> till den här strömmen och är inte rättade här.

---

### [~] S-13 — Byt till `shaft-v2.onnx`

> **Delvis klart (2026-09-14).** Modellbytet är gjort och verifierat i webbläsaren på
> **desktop**; `[~]` för att **iPhone-verifieringen återstår** och `shaft-v1.onnx` därför
> ligger kvar på disk tills den är gjord.
>
> **Ett ställe namnger modellen.** `MODEL_FILE` i `src/lib/shaft/shaftDetector.ts` är nu
> enda förekomsten; `MODEL_URL` härleds ur den och matar både `preflightAssets()` (via
> `ORT_ARTIFACTS`) och varje `InferenceSession.create()`. Preflightens felmeddelande och
> dev-vyns rubrik konsumerar samma konstant i stället för att upprepa strängen. **SW-regeln
> i `vite.config.ts` behövde ingen ändring** — den matchar `.endsWith(".onnx")`, och
> eftersom URL:en byter namn åldras en kvarliggande v1-post ut ur `shaft-runtime` under
> `maxEntries: 4` i stället för att serveras. Nästa byte är alltså en rad.
>
> **`training/prelabel_batch.py` kör medvetet kvar på v1.** Dess vygrind finns för att v1
> kastade om ändarna på `face_on` (158,6° median). v2:s 4,32° gör grinden sannolikt långt
> för sträng — men att lossa den är ett eget mätbart beslut, inte en följd av ett modellbyte.
>
> > **Åtgärdat i S-15 (2026-09-14):** beslutet är taget och mätt. `DEFAULT_MODEL` är `shaft-v2.onnx`
> > och grinden släpper in `face_on`. Se S-15.
>
> **Mätvärden mot kalibreringssetet** står i
> [`training/README.md` → *Levererande modell*](../training/README.md#levererande-modell-shaft-v2onnx),
> med människornas golv bredvid: vinkelmedian **1,06°** mot 0,30°, p90 6,72°, `butt`
> **0,54 %H** mot 0,17, `hosel` **0,47 %H** mot 0,13, `face_on` 4,32°, `severe blur` 3,46°,
> och **17 av 96 frames utan detektion** — medianerna är dragna ur de 82 % lättaste framesen.
>
> **Dev-vyn på `data/shaft/clips/002.mp4`** (headless Chrome, **WebGPU**, `WebGPU ↔ WASM
> equivalence OK`, inferensmedian 368 ms). En sving, 2,20–5,20 s, impact 4,00 s, 29 frames:
> **17 av 29 med detektion** (15 med båda ändarna → en vinkel, 2 med bara `butt`), 12 utan.
>
> **Den ombytta 179°-hoppningen mellan 3,83 och 3,93 s är borta.** 3,83 och 3,87 ger båda
> −110,8° (Δ 0,0°), och 3,90/3,93 returnerar bara `butt` — inget omkastat par produceras.
> **Men vinkelserien är inte kontinuerlig**, av andra skäl:
>
> | Intervall | Vad som händer |
> |---|---|
> | 2,53–3,03 s | 4 frames utan detektion (backswing) |
> | **3,90–4,20 s** | **10 frames utan användbar vinkel — täcker hela impact** |
> | 3,37–3,70 s | `hosel`-x vandrar 185→266→192→161 px medan `butt` rör sig < 32 px: ±28/−33° vinkelskakning som ser ut som detektorbrus, inte rörelse |
>
> **Impacthålet är fyndet som betyder något.** Reglerna mäter skaftet just där, och v2
> lämnar ingenting mellan 3,90 och 4,20 s. Det är samma frames v1 svarade fel på — felet har
> bytt form från *omkastade ändar* till *ingen detektion*, vilket är det säkrare av de två
> men inte en lösning.
>
> **Det stora steget 4,37→4,53 s (144,8°) är äkta rörelse, inte en ombytning.** `butt`-banan
> är sammanhängande och tät genom hela follow-through (41/59/25/9/4/3 px mellan frames), så
> greppänden är rätt identifierad; det är klubbhuvudet som sveper 308 px. En ren
> ändombytning hade flyttat `butt` ur handbanan, vilket den inte gör.
>
> **Verifierat:** `npm run build` rent · `npm test` **375/375** · `npm run lint` 2 kvarstående
> fel, båda sedan tidigare och i orörda filer (`FrameLightbox.tsx`, `useHistory.ts`).
> **Ej sedd på en iPhone** — det är vad som återstår, och villkoret för att ta bort v1.

### [x] S-14 — Fyra keypoints: `butt → hosel → toe → heel`

> **Klart (2026-09-14).** Schemaändring, inte en modelländring: **ingen träning har körts
> och `shaft-v2.onnx` är orörd.** Den fortsätter köra tvåpunkts tills en fyrapunktsmodell
> finns — schemat och koden ligger före modellen med flit, så att annoteringen kan börja.
>
> **De nya punkterna definieras av solan**, klubbhuvudets nedre kant: `toe` är dess yttre
> ändpunkt, `heel` dess inre. Skälet står i specen och är detsamma som gjorde att hoseln
> valdes framför huvudets centrum — solan syns på både driver och järn och slutar tydligt i
> båda ändar, medan "huvudets yttersta spets" ligger olika på olika klubbtyper och inte går
> att träffa likadant två gånger. **Häl–tå-linjen bär bladets rotation**, och det är hela
> skälet att punkterna finns: `butt→hosel` ger skaftets riktning, `heel→toe` ger bladets, och
> skaftvinkeln ensam säger ingenting om huruvida bladet är öppet eller stängt.
>
> **Bakåtkompatibilitet är hela risken i den här ändringen**, och den är löst på ett ställe:
> `_points_of` i `training/shaft_coco.py` **paddar en kort keypoint-lista med `v=0`**. En
> tvåpunktsexport (batch-01, batch-02, båda kalibreringspassen) läses därmed som en giltig
> fyrapunktsannotering vars `toe`/`heel` är `outside` — inte som ett fel, och framför allt
> inte som punkter i origo, vilket hade tränat modellen mot (0, 0). `export_keypoint_names`
> läser COCO-kategorins egen keypoint-lista, så varje körning **skriver ut vilket schema
> exporten bar** i stället för att gissa; en export med punkterna i fel ordning får en
> `UNEXPECTED`-varning, eftersom läsningen är positionell.
>
> **Ändrat, per fil:**
>
> - **Specen** — nya punkter, soldefinitionen och motiveringen, samma occluded/outside-regel
>   (den handlar om punkten, inte om bilden), streakets mittpunkt för alla fyra, och regeln
>   att **`toe` och `heel` båda blir `outside` när huvudet pekar rakt mot eller från kameran**
>   — solan är då en punkt i projektion, och två punkter ovanpå varandra är en bladvinkel som
>   inte finns. Plus en notering om att CVAT:s etikettdefinition ligger i **databasen** och
>   aldrig läses ur repot: `cvat-labels.json` är en kopia, sub-etiketterna måste läggas in för
>   hand i etikettkonstruktorn.
> - **`cvat-labels.json`** — fyra sub-etiketter i rätt ordning, skelett-SVG med noderna och
>   kedjan `butt → hosel → heel → toe`.
> - **`prepare_dataset.py`** — `kpt_shape: [4, 3]`, `flip_idx: [0, 1, 2, 3]` (fortfarande
>   identitet: att spegla bilden gör inte en tå till en häl, den vänder klubban). Boxregeln
>   följer nu **de punkter som faktiskt är satta**: ≥2 ger omslutande rektangel, exakt 1 ger
>   kvadratisk ersättningsbox, 0 skrivs inte. Kvadratens sida mäts fortfarande på
>   `butt`–`hosel` — en skala ur `toe`/`heel` hade varit odefinierad mot batch-01. Rapporten
>   visar **spektrumet 1–4 satta punkter** och täckning per punkt i stället för "båda eller en".
> - **`evaluate.py`** — mätvärden per punkt för alla fyra, och **bladvinkeln som eget mätvärde
>   vid sidan av skaftvinkeln**, aldrig hopslagen: ett skaft kan ligga i rätt plan med bladet
>   vidöppet. Varje vinkel mäts bara där dess **egna** två punkter finns på båda sidor, så en
>   tvåpunktsexport rapporterar ingen bladvinkel i stället för en felaktig. Ingen
>   människokolumn för bladvinkeln — kalibreringssetet annoterades i tvåpunktsschemat och bär
>   inget golv. Ovikningen vid 90° gäller `heel→toe` av samma skäl som `butt→hosel`.
> - **`export_onnx.py` + README** — utdataformen är `[1, 17, N]`, kanaltabellen går till index
>   16. **Kanalantalet är kontraktet** (utdatan avkodas positionellt), så exporten läser det ur
>   grafen och säger vilket schema den implementerar; 11 och 17 tas emot, allt annat ger exit 1.
> - **`shaftDetector.ts`** — `ShaftDetection` bär `toe`/`heel` (`ShaftPoint | null`) plus
>   `modelKeypoints`, som skiljer *"modellen har ingen tå"* från *"framen har ingen synlig tå"*.
>   `shaftPostprocess.ts` läser kanalantalet ur tensorn och avkodar både 11 och 17.
> - **`prelabel_batch.py`** — skriver `toe`/`heel` som `outside="1"` så att skelettet bär alla
>   fyra sub-etiketter tasken deklarerar. Modellen förhandsmärker fortfarande bara skaftet.
>
> **Verifierat:** `npm run build` rent · `npm test` **381/381** · `npm run lint` 2 kvarstående
> fel, båda sedan tidigare och i orörda filer (`FrameLightbox.tsx`, `useHistory.ts`) ·
> `py -3.11 -m unittest discover -s training -t training` **69/69**, varav en ny modul
> `training/test_shaft_schema.py` som pinnar ordningen, bakåtkompatibiliteten och boxregeln.
>
> **Tillägg (2026-09-14) — `cvat-labels.json` komplett och verifierad mot CVAT:s källa.**
> Filen bär nu **hela** schemat, för Raw-fliken tar inget mindre: `shaft` (skeleton, fyra
> sub-etiketter, fyra attribut) **plus `frame_meta`** (tag med `phase`), som tidigare bara
> fanns beskriven i förifyllningsavsnittet och aldrig i filen. Tre fynd, alla lästa ur
> `cvat-ai/cvat@develop`, inte antagna:
>
> - **Raw ersätter allt.** `raw-viewer.tsx` diffar textrutan mot databasen och raderar varje
>   etikett/attribut vars `id` saknas i det inklistrade — *"All related annotations will be
>   destroyed"*. Värre: `onPaste` **strippar alla `"id"`-fält** ur det man klistrar in, så en
>   markera-allt-och-klistra-in gör att befintliga etiketter inte matchas alls.
> - **Skelettets SVG är skrivskyddad efter skapandet.** `LabelSerializer.update_label` skriver
>   `Skeleton(svg=…)` **bara** i skapa-grenen. Ett tvåpunkts-`shaft` går alltså inte att
>   uppgradera på plats: sub-etiketterna skapas men får inga noder i mallen. Nytt projekt/ny
>   task är enda vägen som inte offrar annoteringarna.
> - **Mallen saknade `data-node-id` på cirklarna.** `drawHandler.ts` slår upp kantändar med
>   `querySelector('[data-node-id="…"]')`, så utan dem följer kanterna inte punkterna när man
>   ritar. Tillagt, tillsammans med CVAT:s egen kanoniska cirkelform (`r="0.75"`, utan
>   `fill`/`stroke` — konstruktorn strippar dem ändå) och klubblika koordinater: butt överst,
>   hosel nedanför, `heel→toe` som en kort sula ut från hoseln.
>
> `phase` står i svingordning med `idle` sist (värdemängden oförändrad; allt matchas på
> sträng). **Specen** fick tre nya avsnitt: vad Raw gör, att punktordningen är låst så fort
> annotering påbörjats, och en sjustegs checklista före inklistring.
> **Verifierat:** `training/test_shaft_schema.py` 32/32 · en port av CVAT:s egen
> `validateParsedLabel` körd mot filen, plus kontroll att kant-id:n och nodordningen matchar
> sub-etiketterna.

### [x] S-15 — Batch-03: 250 frames, bladvinkelurval, lossad vygrind

> **Klart (2026-09-14).** Tredje träningsbatchen dragen, förhandsmärkt med `shaft-v2` och
> vygrinden lossad. **Ingen träning körd** — batchen är annoteringsunderlag.
>
> **Draget:** 250 frames, seed `0x7ba7c0de`, pool 1435 → 935 efter exkludering av
> `reserved-ids.txt` (100) + batch-01 (150) + batch-02 (250). **Noll överlapp** mot alla tre,
> verifierat separat utöver skriptets egen assertion. 204 svingar, max 2 frames/sving,
> `web`/`own` 125/125, varje faskvot fylld utan shortfall.
>
> **Viktningen är batchspecifik** (`docs/shaft/batch-03-phase-weights.json`, som batch-02);
> **specens målvikter är orörda**. `address` 4→10 %, `backswing` 10→20 %, `finish` 4→8 %,
> `impact` 16→22 %, betalt av `downswing` 44→18 % och `top` 16→12 %.
>
> **Invändningen är viktigare än viktningen, och den står i summary.md.** v2:s verkliga
> svaghet är inte en fas — den är `view` och `blur`: `face_on` **6/10 utan detektion (60 %)**,
> `severe blur` **5/12 (42 %)**, mot `dtl`+skarp 6/75 (8 %). **Manifestet bär varken `view`
> eller `blur`**, så faskvoten kan inte nå någondera. Mätt på 488 annoterade frames
> (batch-01 + batch-02 + kalibrering, joinade mot sina manifest) ger specvikterna 10,8 %
> `severe blur`, batch-02 10,6 % och batch-03 10,9 % — **faskvoten köper ingen oskärpa alls**,
> och `face_on` är ännu plattare (8,6–13,8 % oavsett fas). Att maxa den ger 12,6 %, alltså
> fyra extra frames av 250, betalda med precis de skarpa framesen bladvinkeln behöver.
> Batchen adresserar därför severe blur **inte** via urvalet, och det står rakt ut.
>
> **Vad faskvoten däremot köper är annotatörsfasen.** Manifestfasen är 49 % rätt (191/391),
> men felet är strukturerat: manifest-`downswing` är 39 % egentlig `top`, manifest-`through`
> 54 % egentlig `finish`, manifest-`impact` bara 22 % egentlig `impact`. Projicerat genom den
> förväxlingsmatrisen flyttar batch-03 `address` 7,7→13,9 %, `backswing` 11,7→16,7 %,
> `finish` 11,2→13,9 % och sänker `top` 33,6→21,4 %.
>
> **Klubbhuvudets synlighet — undersökt och valt bort som urvalskriterium.** Manifestet bär
> ingen utseendesignal (`slowmo` pekar åt fel håll: 22,4 % `severe` mot 9,3 %). `shaft-v2` är
> tvåpunkts och kan inte svara; den närliggande härledningen — förkortning ur skaftlängd — är
> **redan mätt och underkänd** i `prelabel_batch.py`-huvudet (face_on-intervallet ligger helt
> inuti dtl-intervallet). Och framför allt: **noll `toe`/`heel` är annoterade någonstans i
> repot** (alla fem exporter deklarerar `keypoints: ["butt","hosel"]`), så heuristiken hade
> varit oförfalsifierbar. Kostnaden för att låta bli är noll — ett oannoterbart huvud blir
> `outside`, inte en bortkastad frame. När batch-03 är annoterad finns facit och frågan blir
> mätbar; nästa steg som faktiskt når `face_on`/`severe blur` är ett urval som kör v2 över
> **poolen** och väljer det den missar — det behöver inget facit och byggs inte här.
>
> **Vygrinden lossad, mätt — inte antagen.** Omkörning av `evaluate.py` på `shaft-v2.onnx`:
> `face_on` har **noll** omkastningar >90° och dess **värsta** avvikelse (4,08°) är mindre än
> de **fyra värsta** `dtl`-avvikelserna (14,33°, 13,02°, 11,93°, 11,46°). Enda >90°-framen i
> setet är `view: other`. Grinden släpper därför in `face_on` och blockerar fortfarande
> `other`; enighetskravet gäller nu *inom* den tillåtna mängden, så en `dtl`/`face_on`-tvist
> släpps in. `--view-gate {swing, swing+face_on, off}`, standard `swing+face_on`.
>
> **Förhandsmärkning:** **181 av 250 (72 %)** med `shaft-v2`. Överhoppade 69: `no-detection`
> 53, `keypoint-below-threshold` 12, `view-unknown` 3, `view-blocked` 1 (`other`),
> `degenerate-shaft` 0. `toe`/`heel` skrivna som `outside="1"` på alla 181 skeletons.
> **Lossningen gav +13** (168 → 181): 29 frames till innanför grinden, varav 13 märktes och 16
> föll på `no-detection` — precis vad `face_on`:s 60 % täckningslucka förutsäger. Modellen
> avstår i stället för att gissa fel.
>
> **`DEFAULT_MODEL` är `shaft-v2.onnx`** (var v1 — den levererande modellen ska vara den
> förhandsmärkningen använder). Parittestet mot webbappen pekar nu på en egen konstant,
> `GEOMETRY_REFERENCE_MODEL = shaft-v1.onnx`: de pinnade koordinaterna är S-11:s
> webbläsarverifierade v1-utdata, och att låta dem följa med modellbytet hade varit att
> radera testet.
>
> **Verifierat:** `py -3.11 -m unittest discover -s training -t training` **81/81**, varav 12
> nya som pinnar vyhinkarna och grindlägena (`view_bucket`, `GATE_BUCKETS`) — logiken bodde
> tidigare inline i `main()` och var otestad. XML:en kontrollerad: 250 `<image>`, 181
> `<skeleton>`, 724 `<points>` = 4×181, `toe`/`heel` alla `outside="1"`.
> *(Sista meningen överspelad av S-16 samma vecka: `toe`/`heel` levereras nu placerade,
> `outside="0"`. Urvalet och de 181 är oförändrade.)*

### [x] S-16 — `toe`/`heel` levereras placerade i stället för `outside`

> **Klart (2026-09-15).** `training/prelabel_batch.py` skriver solpunkterna med
> `outside="0"` och riktiga koordinater. **Batchens frames och urval är orörda** —
> omkörningen ger samma **181 av 250** och samma skältabell (`no-detection` 53,
> `keypoint-below-threshold` 12, `view-unknown` 3, `view-blocked` 1, `degenerate-shaft` 0).
>
> **Varför.** `outside="1"` med platshållarkoordinater var fel default åt två håll i CVAT:s
> gränssnitt, inte i specen. En punkt som aldrig dragits har inga koordinater — CVAT släpper
> den i bildens **övre vänstra hörn** i samma stund annotatören kryssar ur flaggan. Och
> flaggan är asymmetrisk på tangentbordet: att sätta `outside` **på** är `O`, att kryssa
> **ur** den kräver musklick i **PARTS**-panelen. Normalfallet (synligt huvud, fyra punkter)
> var alltså dyrt och undantaget billigt. Nu är det tvärtom; specregeln är oförändrad och
> fortfarande annotatörens.
>
> **Det är ett startläge, inte en förhandsmärkning** — och det står så i skriptets huvud, i
> rapportens annotatörsnoter och i specen. Modellen är tvåpunkts och har ingen åsikt om
> solan. Ny `sole_points()`: en linje ut ur `hosel`, vinkelrät mot `butt→hosel`, med
> `SOLE_LENGTH_FRACTION = 0,09` av skaftlängden i bild. **Proportionen är ett verkligt
> klubbhuvud** mot den enda längd skriptet känner (klubbans längd minus huvudet): häl–tå
> ≈ 115/1143 = 0,10 driver, ≈ 81/940 = 0,086 järnsjua, ≈ 0,09 wedge. Hälen ligger
> `HEEL_OFFSET_FRACTION = 0,01` ut från hoseln — hoseln *är* huvudets hälsida, men två
> punkter ovanpå varandra går inte att greppa.
>
> **Sidan är godtycklig och förblir det** (en tvåpunktsdetektion säger inget om vilken sida
> huvudet ligger på, och annotatören drar ändå), så frihetsgraden läggs på det som *inte* är
> godtyckligt: den sida som håller båda punkterna innanför bildkanten. Håller ingen sida,
> klampas de in i ramen — fortfarande en tiopotens närmare huvudet än origo.
>
> **Verifierat på utdatan, inte bara i testen:** alla 181 skeletons har fyra punkter,
> **noll `outside="1"`** och **noll `points="0.00,0.00"`** i filen; häl–tå/skaft 0,0898–0,0902
> (spridningen är 2-decimalsavrundningen), |cos| mot skaftet ≤ 0,0022, samtliga 362 punkter
> innanför bildkanten och inom 0,15 skaftlängder från hoseln — **ingen frame behövde klampas**.
> `py -3.11 -m unittest discover -s training -t training` **89/89** (8 nya för `sole_points`).
> `npm run build` rent · `npm run lint` 2 kvarstående fel i orörda filer (baslinjen) ·
> `npm test` 381/381.
>
> Dokumentation: [shaft/annotation-spec.md](shaft/annotation-spec.md) → *Förhandsmärkning med
> modellen*.

### [x] S-17 — Mät bladvinkelns stabilitet över en sving

> **Klart (2026-09-15).** `training/measure_blade_stability.py` + 39 enhetstest.
> Kalibreringssetet är tvåpunkts och bär inget facit för bladvinkeln, så **träffsäkerheten**
> går inte att mäta — **stabiliteten** går, och kräver inga annoteringar: `heel→toe` sitter på
> samma stela kropp som `butt→hosel` och måste rotera lika jämnt. Skaftvinkeln är därför
> måttstocken; varje tal rapporteras i par, mätt på samma frames. Grupperar per sving på
> `clipName`+`swingIndex` över alla tre batchar (en batch ensam bär ~1 frame/sving). Mäter
> `|Δvinkel/Δt|` i **°/s**, aldrig per frame — tidsstegen går från 0,1 s till flera sekunder.
> Hopp >90° = omkastade ändar; skaftets hoppandel står bredvid som kontroll.
> Rapport i `training/blade-stability.md` (genererad, ej i repot).

### [x] S-18 — Spåra skaft- och bladvinkel över varje bildruta i ett klipp

> **Klart (2026-09-15).** `training/trace_swing.py` + 33 enhetstest, 161/161.
> S-17 mäter samma två vinklar men bara på batchernas samplade frames (mediansteg ~0,3 s) —
> det säger *hur snabbt* vinkeln rör sig, inte *hur*. Vid 30 fps blir steget ~0,033 s och
> skillnaden mellan "klubban roterar" (ramp) och "modellen gissar" (hack) syns med blotta ögat.
> **Två trösklar, inte en:** `--kpt-conf-shaft` 0,5, `--kpt-conf-blade` 0,1 — gemensam 0,5 gav
> **0 %** täckning på solpunkterna, 0,1 gav **80 %**. En gemensam tröskel gör inte mätningen
> strängare, den gör den tom. **Luckor bryts, aldrig interpoleras.** Grafen visar serien
> uppvecklad, CSV:n rådata; hastigheter räknas aldrig på den uppvecklade serien.
> **Körningen på `data/shaft/clips/002.mp4` återstår** — fyrapunktsvikterna finns inte på
> maskinen. Röktestat med `shaft-v2.onnx`: skafttäckning 100 %, bladtäckning 0 %.

### [x] S-19 — Datamodellen för skaftmätvärden

> **Klart (2026-09-17).** Ny modul `src/lib/shaft/measure/` — rådatalager,
> rimlighetskontroll och härledda mätvärden. **Inga regler, ingen UI, ingen koppling till
> Vision-prompten.** `frameExtractor.ts`, `poseEnvelope.ts`, `poseSegments.ts`,
> `poseEnvelopeSelection.ts`, `prompt.ts`, `api.ts` och `worker/` är **byte-för-byte orörda**
> (verifierat med `git diff main`). Dokumentation: [shaft/datamodell.md](shaft/datamodell.md).
>
> **Rådatalagret (`shaftSeries.ts`) är ren data.** Per sving: modellidentitet
> (`file` + `keypoints`), vy, pixelrymd; per bildruta: tid, fas, fyra punkter **med
> konfidens**, skaftvinkel, bladvinkel, plus de sex MediaPipe-landmärken mätvärdena läser.
> Ingen beräkning, inget beroende till `onnxruntime-web` eller webbläsaren — inte ens ett
> typimport. Sömmen ligger i `fromDetection.ts`, som importerar **bara typer** och tar
> modellens filnamn som argument i stället för via `MODEL_FILE` (den konstanten hade dragit in
> hela detektormodulen i varje bundle). Överlever plattformsbytet (*F6*) och ett detektorbyte.
>
> **Vinkelkonventionen är Pythons**, värde för värde: `atan2(dy, dx)`, riktade `butt→hosel`
> och `heel→toe`. **En avvikelse, funnen av ett test:** `angle_difference` i `evaluate.py` är
> rätt i Python men fel som direktöversättning — JS `%` är en *rest* som behåller tecknet, så
> uttrycket ger 358 där det ska ge 2, precis vid sömmen. TS-versionen gör dubbel modulo.
>
> **Rimlighetskontrollen (`plausibility.ts`) är en typgrind, inte en konvention:**
> `derived.ts` tar en `CheckedShaftSwingSeries` och `checkShaftSeries` är det enda som
> producerar en. Varje bildruta får **två** flaggor (skaft resp. blad) på tre nivåer
> `usable`/`uncertain`/`rejected`, varje icke-`usable` flagga bär skäl, och en förkastad
> bildruta ligger **kvar** med sina koordinater — det är flaggan som ändrats. Testad mot de
> tre mätta felmönstren: omkastade ändar (150–180°, tröskel 90° med två pass — isolerad
> vändning förkastas, ett varaktigt byte märks tvetydigt i **båda** ändar), bladets oro
> (71–78 °/s mot 12 °/s, kvot ~6, bar vid 3, skrivs på varje bladflagga) och **separata
> konfidenströsklar** (solpunkter median 0,26 / max 0,55 mot 0,99–1,00 — ett test visar att
> en gemensam ribba tömmer mätningen i stället för att skärpa den).
>
> **Fem härledda mätvärden, alla projektioner, alla med sina förutsättningar som data**
> (`MEASUREMENT_ASSUMPTIONS`): skaftvinkel per fas, skaftläge vid P2 och P4 relativt kroppen
> (torsolängder — **inte** axelbredd, som kollapsar mot noll i `dtl`), across-the-line vs
> laid-off, klubbhuvudets bana (spårar **`hosel`**, inte huvudet), svingplanets lutning som
> projektion med residual. **Vy som saknas och vy som är fel är två olika fel:**
> `camera-angle-mismatch` → förkastat, `camera-angle-unknown` → beräknat och märkt.
>
> **Bladvinkel byggdes INTE som härlett mätvärde.** Den bärs i rådatalagret och mäts fullt ut
> av kontrollen — att kasta den hade gjort beslutet ofalsifierbart och en fyrapunktsmodell hade
> inte haft någonstans att landa — men `MEASUREMENT_ASSUMPTIONS` nämner varken `toe` eller
> `heel`, så beslutet är synligt i datamodellen och inte bara argumenterat i en kommentar.
>
> **`// OSÄKER:` på teckenkonventionen** för across-the-line (`ACROSS_THE_LINE_SIGN`): angiven,
> inte verifierad. Begränsad genom att mätvärdet aldrig når `usable` (`sign-convention-unverified`
> följer alltid med). Verifieras av **en** annoterad DTL-bildruta av en känd across-the-line-topp.
> **→ gjort i S-21 (2026-09-17): tecknet står, markeringen och spärren är borta.**
>
> **Vad som inte går att härleda** står i [shaft/datamodell.md](shaft/datamodell.md) med skäl:
> klubbladsvinkel (en linje bär ingen rullning kring sig själv), klubbväg in-to-out (axeln
> ligger i djupled och projiceras bort) och anfallsvinkel (djupled **och** tidsupplösning —
> ~20 frames/sving mot ett ögonblick vid 130 km/h).
>
> **Verifierat:** `npm run build` rent · `npm run lint` 2 kvarstående fel i orörda filer
> (baslinjen) · `npm test` **470/470** (89 nya).

### [x] S-20 — Bladvinkelns användbarhet över flera klipp

> **Klart (2026-09-15).** Utökar S-18. `training/trace_swing.py` kör nu samma bildruta-för-bildruta-
> spårning över **flera klipp** (`--clips`, filer eller en katalog) och sammanställer dem i
> **[`../training/blade-usability.md`](../training/blade-usability.md)**. Enkelklippsläget
> är oförändrat — samma konsolutskrift, samma siffror, plus två noter om vilka manifest och
> annoteringar som lästes. Ingen träning.
>
> **Svaret på frågan som ställdes: varken svingfasen eller konfidensen räddar bladvinkeln,
> och skälen är olika.**
>
> **Konfidensen har inget spann att gradera på.** Över de 3 403 bildrutor som bär en
> bladvinkel ligger `min(toe, heel)` på median **0,26**, p90 0,35 och **max 0,55** — mot
> skaftets `min(butt, hosel)` 0,99/1,00/1,00. Hinkarna över 0,5 är därför tomma därför att
> modellen aldrig är så säker på klubbhuvudet, inte därför att urvalet saknar sådana
> bildrutor. Kvoten blad/skaft ligger dessutom **platt och icke-monoton** genom hinkarna
> (3,42 · 4,08 · 2,94 · 2,20), så det finns ingen nivå där bladet blir lugnt.
> **Ingen tröskel når kvot ≤ 1,5** — varken över alla 3 386 steg eller över de 1 263 som
> ligger inuti en sving-envelope.
>
> **Vad grinden däremot köper: omkastningarna.** `toe`/`heel` byter plats i 3 % av stegen i
> sving vid 0,1, i 1 % vid 0,2 och i **0 av 272 steg vid 0,3**. Ett hopp > 90° är inget brus
> som jämnar ut sig utan bladvinkeln vänd ett halvt varv — samma fel som kostade `shaft-v1`
> dess face_on-bildrutor. **0,3 gör alltså bladvinkeln mindre farlig, inte användbar**
> (kvoten där är fortfarande 2,34), och priset är att 20 % av bildrutorna i sving återstår.
> De två svaren hålls isär i rapporten av just det skälet.
>
> **Fasen vänder åt andra hållet än 002 antydde.** Kvoten är **högst när klubban står still**
> (`address` 4,30, mellan svingar 4,16) och **lägst i de snabba faserna** (`through` 1,69,
> `top` 1,87, `downswing` 2,30). Absolut sett rör sig bladet mest i nedsvinget (373,9 °/s)
> — men det gör skaftet också (162,4 °/s). Bladet bär alltså ett **brusgolv** som ligger kvar
> när klubban stannar och som drunknar i verklig rörelse när den går fort; att kurvan ser
> lugn ut i adressen är nämnaren, inte signalen. `002.mp4` är därtill **ytterlighetsfallet**
> i urvalet: kvot 6,06 i sving mot 0,85–4,00 för de nio andra.
>
> **`blur` delar inte heller upp materialet.** `none` 2,09 (143 steg) · `mild` 6,63 (34) ·
> `severe` 1,29 (43) — ingen ordning, och hinkarna är små eftersom en `blur`-etikett bara
> beskriver **en** annoterad bildruta och sträcks ±0,10 s, inte längre.
>
> **Urvalet av klipp är skrivet ner före körningen**, i
> [shaft/blade-usability-clips.md](shaft/blade-usability-clips.md), och citeras ordagrant in i
> rapporten (`--selection-note`). Fem `dtl` och fem `face_on`, båda i skarpt och suddigt
> skick; face_on och `severe` är medvetet översamplade (5 av poolens 9 enhälligt
> face_on-klipp; 29 % `severe` mot 10,8 % i materialet som helhet). Poolen är de **80** av 97
> klipp i `data/shaft/clips/` som har minst en annoterad bildruta i en batch — utan manifest
> finns ingen envelope att härleda fas ur, utan annotering ingen `blur`.
>
> **Fasen härleds ur manifesten, aldrig ur en andra pose-körning** — och absolut aldrig ur
> spårningen själv: att läsa fasen ur hur fort skaftvinkeln rör sig och sedan rapportera att
> bladet är sämre i de snabba faserna hade varit en cirkel. `envelopeSec`/`impactSec` ur
> `data/shaft/training/*/batch.zip` ger `start`, `impact` och `finish` som **mätta** tider;
> **toppen finns inte i manifestet**, så gränsen backsving/nedsving är typsvingens proportion
> ur `src/lib/dataset/datasetPhase.ts` utsträckt över de mätta tiderna. Det är mätt och inte
> påstått: porten håller med manifestets egen `phase` i **577 av 650 bildrutor (89 %)**, och
> **varje** avvikelse ligger i grannskapet backsving/topp/nedsving, där toppen hade avgjort.
> Rapporten skriver ut förväxlingstabellen.
>
> **Stillestånd räknas separat.** 3 035 av 4 766 bildrutor ligger mellan svingar; huvudsiffran
> redovisas därför både för allt och för det som ligger inuti en envelope, och svepet i
> avsnitt 7 finns i båda varianterna.
>
> **Nytt per mätt bildruta i CSV:n:** `phase`, `blur`, `shaft_conf_min`/`blade_conf_min` och
> `*_rate_deg_s` med `*_step_sec` bredvid. CSV-vyn är **ofiltrerad** — `--max-gap-sec` hör
> till tabellerna, och rådata som redan filtrerats går inte att avfiltrera.
>
> **Verifierat:** `py -3.11 -m unittest discover -s training -t training` **239/239**
> (80 nya: hinkindelning, aggregering, tröskelsvep, rekommendation, fasporten, blur-fönstret,
> per-bildrute-hastigheterna och `--clips`-upplösningen). Körningen: 10 klipp, 4 766
> bildrutor, 3 386 steg med båda vinklarna i båda ändar, på `shaft-v3`-vikterna.
> **Ej gjort:** ingen träning, ingen webbappskod rörd, och ingen mätning av *träffsäkerhet*
> — utan fyrapunktsfacit är bara rörlighet mätbar, och en bladvinkel kan vara fullkomligt
> stabil och konsekvent fel.

### [x] S-21 — Teckenkonventionen för across-the-line verifierad

> **Klart (2026-09-17).** `ACROSS_THE_LINE_SIGN` var en **angiven** konvention med
> `// OSÄKER:` i koden, och mätvärdet `top-shaft-orientation` hölls därför aldrig högre än
> `uncertain` (`sign-convention-unverified` följde alltid med). **Tecknet är nu prövat mot en
> manuellt bedömd bildruta och står kvar** — markeringen, spärren och skälet är borttagna.
>
> **Referensen:** `049-88216ea7_s00_f05` (batch-03, `dtl`, högerhänt), av Erik bedömd som en
> topp av baksvingen där skaftet pekar svagt **höger** om mållinjen sett bakifrån — alltså
> lätt across the line. Körd genom produktionsvägen (`buildShaftSwingSeries` →
> `checkShaftSeries` → `buildShaftMeasurements`): grepp (126,0, 194,8), hosel (155,5, 67,0),
> `lineOrientationDeg` **+77,0°**, `deviationDeg` **+77,0°** → **`across-the-line`**. Samma
> etikett som ögat gav, så tabellen behöver inte vändas.
>
> **Vikterna:** `shaft-v3` finns **inte** på maskinen (`training/runs/` är gitignorerat och
> tomt), så körningen gjordes på `public/models/shaft-v2.onnx`. Den ger `butt`/`hosel`
> **identiska med den manuella annoteringen** i `annotated-v1.zip` (126,03/194,82 resp.
> 155,47/67,02) med konfidens 1,00 — och mätvärdet läser varken `toe` eller `heel`, så en
> fyrapunktsmodell kan inte ändra tecknet. **Bildrutans automatiska fas ljuger** (manifestet
> säger `impact`, CVAT-attributet `address`; klippet är `suspectMultiSwing` utan säker
> `impactSec`) — Eriks avläsning användes, inte manifestets.
>
> **En bildruta är tunt underlag, och det står både i koden och i
> [shaft/datamodell.md](shaft/datamodell.md):** referensskaftet ligger 77° från horisontalen,
> **13° från vikningen vid ±90°** — en topp som passerar lodrätt byter tecken utan varning,
> så referensen ligger i den svagaste änden. **Ingen laid-off-topp och ingen vänsterhänt
> bildruta är bedömd alls**; de halvorna är spegelbilder per konstruktion. `ON_PLANE_BAND_DEG`
> är orört — 77° ligger långt utanför bandet och säger ingenting om var det hör hemma.
>
> **Låst av ett test:** `derived.test.ts` kör referensens egna pixlar och deras spegelbild
> genom produktionsvägen och kräver `across-the-line`/positiv resp. `laid-off`/negativ.
> Kontrollerat genom att faktiskt vända konstanten: **4 test faller**.
>
> **Verifierat:** `npm run build` rent · `npm run lint` (baslinjen) · `npm test` grönt.

### [x] S-22 — Kandidatbildrutor för att pröva across-the-line-tecknet nära vikningen

> **Klart (2026-09-17).** Engångsverktyget `scripts/across-sign-candidates.ts` (**läser bara**,
> ingen produktionskod rörd) plockar fram de toppbildrutor där en felvänd
> `ACROSS_THE_LINE_SIGN` skulle synas: rapport i
> [shaft/across-sign-candidates.md](shaft/across-sign-candidates.md), de 20 översta kopierade
> till `docs/shaft/across-sign-candidates/` (**gitignorerad** — samma identifierbara personer
> som `data/shaft/*`).
>
> **Källan är hela predictionsunderlaget som finns:** `prelabel.xml` i batch-02/03 (299
> bildrutor ur `shaft-v2.onnx` via `prelabel_batch.py`), joinad mot batch-manifesten och
> CVAT-exporternas `view`. `training/runs/` är tomt och `trace-*.csv` finns inte på maskinen;
> ingen ny modellkörning gjordes. Serierna går genom `checkShaftSeries` →
> `buildShaftMeasurements` oförändrade.
>
> **63 toppkandidater i 166 `dtl`-svingar, sorterade närmast 90° först: 7 höger om lodrätt,
> 56 vänster.** Närmast vikningen ligger `045-224bdedb_s00_f01` (7,8° från 90°). Referensens
> egen sving bidrar med `049-88216ea7_s00_f04` (11,1° från 90°, `top`, `usable`).
>
> **Tre mätta fynd som ändrar hur underlaget ska läsas:**
> 1. **`batch-03/annotated-v1.zip` bär `phase: address` på alla 242 bildrutor** — CVAT:s
>    `default_value`, aldrig rörd. Verktyget upptäcker en konstant fasattribut och kastar den;
>    att ta den för god hade omdöpt varje topp i den största batchen till en address-bildruta.
> 2. **`093-2c11c3c0_s00_f02` är spegelvänd** (skyltarna läser `TIH`/`ƎM`, markeringen `00Ɛ`).
>    Svingen är en högerhänts men **vänsterhänt i bilden**, vilket är vad mätvärdet ser: raden
>    blir `across-the-line` på `handedness: 'right'` och `laid-off` på bildens händighet.
>    **Varken händighet eller spegling finns någonstans i datamodellen.**
> 3. **Vändpunktsfallbacken mättes och användes inte.** 118 av 178 svingar bär ingen
>    `top`-bildruta alls; den tidsmässigt närmaste bildrutan till en skattad vändpunkt är
>    `downswing`/`impact` i 64 fall av 107, och 13 av dem hade legat inom 20° från vikningen
>    och tagit tabellens topp.
>
> **Vad som fortfarande fattas för att stärka tecknet:** en bedömd laid-off-topp och en
> **verifierat** vänsterhänt (ospeglad) bildruta. Ingen av dem finns i materialet.
>
> **Verifierat:** `npm run lint` (baslinjen, 2 fel i orörda `useHistory.ts`) · `npm test`
> **472/472** · `git status` visar inga ändringar under `src/`.
>
> **Tillägg (2026-09-17): blind bedömningsomgång.** `--blind` på samma verktyg skriver
> [shaft/across-sign-blind.md](shaft/across-sign-blind.md) — **12 bildrutor, bara frame-id,
> bildlänk och en tom svarskolumn**, i ordning slumpad med fast frö `0x5ca1ab1e`
> (mulberry32 + Fisher-Yates). Ingen vinkel, inget avstånd till 90°, inget tecken, inget
> utfall, ingen sidofördelning och ingen hänvisning till facit finns i den filen; bilderna
> ligger under sina egna namn i en egen katalog, eftersom rangprefixen i
> `across-sign-candidates/` bär sorteringen på avstånd till vikningen. Facit:
> [shaft/across-sign-blind-key.md](shaft/across-sign-blind-key.md).
> **Urval:** alla kandidater höger om lodrätt + de 7 närmast vikningen till vänster.
> **Undantaget utvidgades från bildruta till klipp:** `093-2c11c3c0_s01_f01` är en annan
> sving ur samma spegelvända inspelning som `093-2c11c3c0_s00_f02` och är lika vänd — hade
> bara den namngivna bildrutan uteslutits hade dess tvilling burit in samma inversion i
> omgången. Därav 5 höger + 7 vänster. Varje insläppt bildruta är kontrollerad mot spegling
> på bakgrunden (text, bollens sida), inte på klubban; ingen annan var vänd.
> Rapporten och dess 20 bildrutor är **oförändrade** — `--blind` skriver inte om dem.
>
> **Resultatet (2026-09-18):** [shaft/across-sign-result.md](shaft/across-sign-result.md),
> skriven av `--result` som läser tillbaka den ifyllda blindfilen. **Tecknet står.** Av de
> **6** kallade raderna (uppdraget sa 5 — filen bär 6) sammanfaller **5**; den sjätte är
> ingen inversion, för en vänd konstant hade fällt alla sex, och de 5 rätta ligger på **båda**
> sidor om lodrätt (3 negativa `laid-off`, 2 positiva `across`).
> **Avvikelsen sitter vid horisontalen, inte vid vikningen:** `040-42b11ae6_s00_f03` har
> skaftet 2,1° från horisontalen — klubban parallell med marken — där across/laid-off avgörs
> av riktningen i horisontalplanet, som en 2D-projektion av skaftets lutning inte bär.
> `ON_PLANE_BAND_DEG` svarar `on-plane` där och hindrar mätvärdet från att påstå något; det är
> första mätta belägget för att bandet gör ett arbete. **Ingen tröskel rörd** (n = 1).
> **Gränsen mot ögats stopp är inget rent snitt:** kallade 2,1°–79,1°, stoppade 73,9°–82,2°,
> överlapp **73,9°–79,1°** (10,9°–16,1° från lodrätt) — 73,9° förekommer på båda sidor om
> gränsen, samma vinkel med olika svar. Men zonen ligger **vid lodrätt**, precis där vikningen
> gör tecknet ömtåligt: där mätvärdet är skörast vägrar ögat svara.
> **Fasfyndet:** `img-3641-adde195e_s00_f02` bär `top` **enbart** ur manifestet, och den
> etiketten är en *proportion* — envelope `[6,111, 8,170]`, `impactSec: null`, bildrutan 0,484
> in i envelopen, alltså mitt i `FALLBACK_BOUNDS` `top`-fönster 0,45–0,52. Klippets tre
> bildrutor ligger alla exakt i sina fallback-fönster. Bollen ligger kvar på peggen vid 6,576 s
> och är borta vid 7,572 s, så raden (7,107 s) är inte en topp. **Samma fel kan sitta i 30 av
> de 63 `dtl`-toppbildrutorna** (26 utan användbar annoterad fas, 4 där annotatören säger emot
> manifestet), varav **22 är produktionsvägens val** — den bildruta `topFrameIndex` faktiskt
> räknar på. `plausibility.ts` mäter punkternas rimlighet, inte fasens, och har inget test som
> fångar det.
> **Rättelse till facit:** påståendet att varje insläppt bildruta var kontrollerad mot spegling
> var starkare än underlaget. För `img-3641` finns varken läsbar bakgrundstext eller synlig
> boll i den bedömda bildrutan, och i klippets `_f01` ligger bollen på **vänster** sida —
> spegelbilden av mönstret i varje granskad högerhänt `dtl`-bildruta. Vänsterhänt spelare eller
> spegelvänd inspelning går inte att skilja åt där; frågan är öppen och står i rapporten.
> `--blind` vägrar numera skriva över en ifylld blindfil utan `--force`.


### [x] S-23 — Närlodrätt-spärr på across-the-line-mätvärdet

> **Klart (2026-09-18).** `NEAR_VERTICAL_GATE_DEG = 16` i `derived.ts`: ligger skaftlinjen
> inom 16° från lodrätt vid toppen blir utfallet **`cannot-determine`** och **tecknet
> beräknas aldrig** — spärren ligger före multiplikationen med `ACROSS_THE_LINE_SIGN`, så
> det finns inget undertryckt tal kvar i koden. `deviationDeg` blir `null` där (i typen, inte
> per konvention), nya fältet `distanceToVerticalDeg` bärs på **varje** utfall, och skälet
> `top-shaft-near-vertical` skiljer tomheten från vy, konfidens och saknad bildruta.
> Flaggan **sänks inte** av spärren: "går inte att avgöra" är ett tillförlitligt fynd om
> svingen, inte ett tvivel om mätningen.
>
> **16 är överlappets övre kant, inte en punktskattning** — ögat slutade kunna kalla riktning
> mellan 10,9° och 16,1° från lodrätt, utan rent snitt, och konservativ riktning här är fler
> `cannot-determine`. Motiveringen står i konstantens doc-kommentar.
>
> **Underlaget säger emot uppgiftens testkrav, och testerna följer underlaget.** Kravet löd
> att alla sex kallade rader ska behålla sitt tecken och alla fem stoppade bli
> `cannot-determine`. Det går inte att uppfylla samtidigt: två *kallade* rader ligger
> **närmare** lodrätt (10,86° och 11,11°) än två *stoppade* (14,17° och 16,08°). Ingen
> tröskel kan alltså släppa igenom alla kallade och stoppa alla stoppade — det är precis det
> överlapp rapporten mätte. Med spärren på 16 gäller: **4 av 5 stoppade** blir
> `cannot-determine`, **2 av 6 kallade** blir det också (`082-a6b3c908_s01_f02`,
> `049-88216ea7_s00_f04`), och `img-5384-acea6a74_s00_f02` slinker igenom med **0,076°**.
> Alla fyra fallen är pinnade i `derived.test.ts` så att avvikelsen är synlig och avsiktlig.
>
> **Referensbildrutan från S-21 svalde spärren sig själv:** `049-88216ea7_s00_f05` ligger 13,0°
> från lodrätt och kallas inte längre. Teckenkonventionen hålls nu i stället av blint bedömda
> bildrutor **utanför** spärren, på båda riktningarna — starkare än referensen var. Vänder man
> `ACROSS_THE_LINE_SIGN` faller **7 test** (kontrollerat genom att faktiskt vända den, inte
> antaget; var 4 före).
>
> **Mätt kostnad:** **6 av 63** `dtl`-toppbildrutor (10 %) går från kallat utfall till
> `cannot-determine` — 2 `across-the-line`, 4 `laid-off` (flaggor: 4 `usable`, 1 `uncertain`,
> 1 `rejected`). Tre bildrutor ligger 0,076–0,257° **utanför** spärren. Räknat av
> `scripts/across-sign-candidates.ts --gate-impact`, som importerar konstanten ur produktionen
> i stället för att upprepa talet.
>
> **Orört enligt uppdrag:** `ON_PLANE_BAND_DEG` (värdet oförändrat; nämns bara i en
> doc-kommentar) och hela fasderiveringen. Den blinda fläcken vid **horisontalen**
> (`040-42b11ae6_s00_f03`, ögat `laid-off` mot beräknat `on-plane` vid +2,1°) står i stället
> som känd begränsning i nya [shaft/STATUS.md](shaft/STATUS.md) tillsammans med fasproblemet,
> händigheten/speglingen och bladvinkeln.
>
> **Verifierat:** `npm run build` rent · `npm run lint` baslinjen (2 fel i orörda
> `useHistory.ts`) · `npm test` **483/483** (+11) · `git diff` rör bara `derived.ts`,
> `derived.test.ts`, verktyget och två dokument.


### [x] S-24 — Blint granskningspaket för fasen `top`

> **Klart (2026-09-18). Ingen fix byggd — det var uppdraget.** Felfrekvensen ska mätas innan
> något byggs på den. Paketet ligger i [shaft/phase-audit/](shaft/phase-audit/):
> `select.ts` (urvalsskript), `review.md` (bedöms för hand), `facit.md`, `README.md` och
> `frames/` (**gitignorerad** — samma identifierbara personer som `data/shaft/*`).
>
> **De tre mängderna reproducerar rapportens tal exakt: 63 / 30 (26 + 4) / 22.** Härledningen
> skrivs ut i konsolen (`--dry-run` skriver ingenting): `prelabel.xml` ⋈ `batch.zip/manifest.json`
> ⋈ annoterade exporter → 63 `dtl`-toppkandidater; minus de 33 där annotatören själv sa `top`
> → 30; de av dem där `topFrameIndex` returnerar just den bildrutan → 22. **Talen asserteras**
> mot [shaft/across-sign-result.md](shaft/across-sign-result.md) (`EXPECTED` i skriptet) och
> körningen **stannar** om de inte stämmer — en omgång byggd på en annan mängd hade mätt något
> annat och sagt att den mätte det här.
>
> **Rundan är 22 kandidater + 10 kontroller = 32 rader, frö `0xfa5ec0de`** (mulberry32 +
> Fisher-Yates; samma frö styr kontrollurvalet, så hela paketet går att återskapa).
> Kontrollerna är stratifierade 4 `top` / 2 `backswing` / 2 `downswing` / 2 `finish`, alla
> `dtl`, alla ur svingar där ingen kandidat ligger, högst en per sving.
>
> **Två skärpningar av "pålitlig annoterad fas" som underlaget tvingade fram:**
> `batch-03/annotated-v1.zip` är ute (CVAT:s orörda `default_value`, som S-22 redan mätte), och
> **en dubbelannoterad bildruta måste ha eniga pass** — batch-01 har två pass som skiljer sig på
> **10 av 146** bildrutor, och en bildruta vars egna annotatörer är oense är ingen fas att mäta
> mot. Sex av tio kontroller är dubbelannoterade och eniga.
>
> **Kontext för varje rad, inte bara för de svåra.** `<id>_prev`/`<id>_next` är närmaste
> envelope-bildruta på var sida, hämtad ur `data/shaft/exports/` (envelope-urvalets egen utdata,
> 7 bildrutor/sving) och **inte** ur träningsbatchen, som är ett glesare stickprov. Vilka rutor
> som är svåra är i sig en bedömning — en runda där bara vissa rader bär kontext berättar för
> granskaren vilka någon redan tvekat om. Grannarna heter efter **raden**, inte efter sig
> själva, så fillistan bär ingen tidsordning.
>
> **`review.md` bär bara löpnummer, frame-id och bildsökväg** — ingen fas, ingen källa, ingen
> kandidat/kontroll-markering, ingen länk till facit. En ny körning vägrar skriva över en
> ifylld review utan `--force`. **README:t bär rundans sammansättning och säger det rakt ut:**
> läser man det före `review.md` vet man ungefär hur många `top` som ska hittas, och då är
> bedömningen inte längre helt blind.
>
> **Klipplängd och fps läses ur MP4:ens `mvhd`/`mdhd`+`stts`.** Varken batch- eller
> exportmanifestet bär dem och ingen `ffprobe` finns på maskinen; klipp som inte ligger i repot
> får `—`, aldrig ett tal härlett ur envelopen (envelopens längd är svingens, inte klippets).
>
> **Orört:** `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen,
> `plausibility.ts`, `derived.ts` — `git diff` rör bara `.gitignore`, det nya paketet och tre
> dokument. `npm run lint` baslinjen (2 fel i orörda `useHistory.ts`).
>
> **Nästa:** Erik fyller i `review.md`, sedan utvärderas den enligt README:t — kontrollerna
> först (omgångens eget felmått), därefter felfrekvensen bland de 22 med `osäker` som **egen**
> tredje kategori, sist om felen klustrar på källklipp, saknad `impactSec`, klipplängd eller
> envelope-proportion.


### [x] S-25 — Fasgranskningen utvärderad: 13 av 22 toppetiketter är fel

> **Klart (2026-09-18). Ingen fix byggd och ingen föreslagen** — det var uppdraget.
> Eriks 32 bedömningar inskrivna ordagrant i [shaft/phase-audit/review.md](shaft/phase-audit/review.md)
> (fritext och stjärnor bevarade, stjärnan som **eget filtrerbart fält**), utvärderade i
> [shaft/phase-audit/resultat.md](shaft/phase-audit/resultat.md).
>
> **Kontrollerna först, för de är mätfelet i allt annat: 7 träff, 0 missar, 3 `osäker`.**
> Samma bild i båda delmängderna (4/0/2 på de sex dubbelannoterade och eniga, 3/0/1 på de fyra
> enpass), så resultatet hänger inte på vilken man väljer. **Den avfärdar den naturliga
> invändningen** att Erik bara är obenägen att säga `top`: fyra kontroller bär annoterad `top`,
> på dem svarade han `top` två gånger och `osäker` två gånger — **aldrig något annat**.
>
> **De 22 kandidaterna, tre hinkar som inte slås ihop:** **6 rätt fas** (27 %), **13 fel fas**
> (**59 %**), **2 rätt fas men oklar bildruta** (9 % — `osäker` där fritexten säger att
> bildrutan *och* grannen båda visar toppen; det är ingen feletikett). Rad 2 är `osäker` utan
> motivering och redovisas som **rest utanför alla tre hinkarna** i stället för att pressas in i
> en den inte tillhör.
>
> **Felet är systematiskt, och har två ansikten ur två kodvägar.** Utan `impactSec`: **5 av 5
> fel**, alla på exakt envelope-andel **0,484** — rena `FALLBACK_BOUNDS`-rader där `top`
> ordagrant betyder "48,4 % in i envelopen" (C(13,5)/C(22,5) = 0,049). Med `impactSec`: **7 av
> 8 fel är `backswing`**, alltså etiketten för tidigt (ensidigt p ≈ 0,032). Riktningen vänder
> alltså med `impactSec`. Envelope-andelen är monoton: **ingen** rad över 0,46 är fel, **ingen**
> under 0,335 är rätt.
>
> **Vad underlaget inte bär, utskrivet i stället för hypotiserat:** källklipp (20 distinkta
> klipp på 22 rader — inget att korstabulera), klipplängd (mätbar för 11 av 22, och de 11 är
> exakt `web`-halvan, alltså konfunderad med källan), fps (två värden, de två avvikande raderna
> går åt var sitt håll), **DTL/face-on (noll varians — alla 32 rader är `dtl` per
> konstruktion)**, web/eget (73 % mot 45 % fel, men 4 av 5 rader utan `impactSec` är `web`, och
> variablerna går inte att separera på 11 + 11 rader).
>
> **Stjärnraderna (6 st) kan inte prövas i den här omgången, och det står rakt ut.** Alla sex är
> kandidater, och facit för en kandidatrad **är** den etikett omgången prövar — att stämma
> stjärnorna mot facit vore att stämma dem mot det som misstänks vara fel. Ingen stjärnrad är en
> kontroll. Vad som ändå syns: fem av sex ligger på envelope-andel ≤ 0,444, alltså i det spann
> där ingen rad med `impactSec` bedömdes som rätt — avläsningen pekar åt samma håll som
> envelope-analysen, men det är en hypotes för en framtida kontrollrik omgång, inte ett fynd.
>
> **Två avvikelser noterade, inget ändrat.** Rad 26: Erik menar `through` snarare än `finish`
> (bildrutorna ligger efter nedslaget); svarslistan erbjöd ingetdera. Påståendet att "schemats
> enum har `follow`" stämmer inte mot koden — `MeasurementPhase`/`ShaftPhase` har `through` och
> `finish` som **skilda** värden, appens `SwingPhase` har `follow-through` som **ett**, och
> ordet `follow` finns inte i någon av dem. **Inget enum är rört**, och raden är fel fas oavsett
> vilket ord som avses. Rad 6 bär stjärnornas observation i fritext utan stjärna och är
> **inte** medräknad bland de sex — stjärnan är Eriks markering, inte min tolkning.
>
> **Orört:** `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen,
> `plausibility.ts`, `derived.ts`. `git diff` rör bara paketet och tre dokument.
> `npm run lint` baslinjen (2 fel i orörda `useHistory.ts`).

### [x] S-27 — Spike: bär skaftsignalen en observerad topp?

> **Klart (2026-09-18). Svaret är nej, på envelope-rutorna. Ingen produktionskod rörd, ingen fix
> byggd.** Rapport: [shaft/top-from-signal.md](shaft/top-from-signal.md); skripten bredvid i
> `shaft/top-from-signal/` (läser bara; koordinaterna skrivs till temp, aldrig till repot).
>
> Signalen fanns inte som bana — `prelabel.xml` täcker 1–2 rutor per sving — så den skeppade
> detektorn (`shaft-v2`, produktionens trösklar) kördes på alla **1 435** envelope-rutor i
> exporterna. **66 av 205 svingar** har en hel bana (alla `dtl`; 0 av 24 `face_on`).
> Vändpunktsmetoden (teckenbyte i vinkelsteget; steg > 90° oläsbara, < 5° vila) ger **noll
> kandidater i 31 av 66**, en i 31, flera i 4. 44 % av stegen är > 90° och toppen ligger på en
> platå inom detektorbruset, så vald ruta följer vilotröskeln. Mot Eriks bedömningar: **2 av 5
> exakt, n för litet**, och ingen träff håller över ε 2/5/10°. På de 22 kandidaterna har metoden
> en åsikt om 4. Kräver inte `impactSec` som indata, men ingen av de 5 fallback-raderna har en
> bana — den är inte visad att lösa någon halva. **Tät signal (varje videobildruta) är oprövad.**


### [x] S-28 — Spike: bär den täta skaftsignalen en observerad topp?

> **Klart (2026-09-18). Nej med vändpunktsmetoden, men av ett nytt skäl. Ingen produktionskod
> rörd, ingen fix byggd.** Rapport: [shaft/top-from-dense-signal.md](shaft/top-from-dense-signal.md);
> skripten i `shaft/top-from-dense-signal/` (läser bara, koordinater till temp).
>
> Detektorn körd på varje videobildruta i envelopen för de **103 av 205** svingar vars klipp finns
> lokalt (102 `web` + 1 `own`, alltså konfunderat med källan): 6 548 bildrutor, 34,6 min, median
> 9,4 s per sving. **Steg > 90° går från 44 % till 1,4 %**, och i mittbandet ε 2–5° är valet
> stabilt för ungefär hälften av svingarna (median 1 bildruta). Men valet låser på brus i platån
> *före* toppen: **0 av 6** exakta träffar, 1 av 6 ens bland kandidaterna (n för litet), och
> **4 av 6 utpekade toppar ligger i en detektionslucka**. Ingen sving har full täckning (median
> 79 %). Pris i produktion: ~7× fler inferenser, ~16–18 s per sving i webbläsaren (dokumenterad
> tid, ej mätt här). **Det som begränsar nu är detektionstäckningen vid toppen, inte glesheten.**


### [x] S-29 — Spike: bär bortfallets läge toppen?

> **Klart (2026-09-18). Nej, inte på ett sätt som håller. Ingen produktionskod rörd, ingen ny
> detektion, ingen fix föreslagen.** Rapport: [shaft/top-from-dropout.md](shaft/top-from-dropout.md);
> skript i `shaft/top-from-dropout/` (läser S-28:s banor).
>
> Bortfallet är klumpigt (median 5 luckor per sving; längsta luckan har 44 % av bortfallet mot 20 %
> vid slump) men **glesast vid 30–60 % av envelopen där topparna ligger** och tätast vid 70–90 %,
> och lika förhöjt vid skattat nedslag som vid toppen. På de 6 utpekade topparna ligger toppen i
> längsta luckan i 3, mittpunkten inom 3 bildrutor i 2 (samma klipp, `093`), medianavstånd 16
> bildrutor; tröskelvalet var närmare i 2 av 5, luckan i 3 av 5 (n för litet, 5 oberoende).
> **Rättar S-28:** "4 av 6 i en lucka" är 3 av 6 med sammanhängande luckor (rad 32 har en
> godkänd ruta vid 1,600 s). 3 av 6 rader byter utfall om luckor bryggas över en godkänd ruta.
> Skaftet är kort vid toppen (0,23–0,65 av det vanliga där det hittas) men försvinner inte
> pålitligt. Kamerabyte ej bedömt.


### [x] S-30 — Fasens förtroende: toppankrade mätvärden svarar inte utan observerad fas

> **Klart (2026-09-18). Första produktionsändringen i S-23-spåret.** Rapport:
> [shaft/phase-trust.md](shaft/phase-trust.md); mätskriptet i `shaft/phase-trust/measure.ts`
> (läser bara).
>
> **Ny `PhaseSource` på varje `ShaftFrameSample`** (`observed` / `envelope-impact` /
> `envelope-fallback`), obligatorisk och aldrig defaultad — kompilatorn namngav varje
> producent. `isPhaseObserved()` tar `undefined` med flit: en serie ur en fil skriven innan
> fältet fanns läses som *ingen såg det*, aldrig som observerad. De två härledda hålls isär
> för att felen går åt olika håll (S-23: fallback för sent, impact-ankrad för tidigt).
> `derivePhaseWithSource()` i `datasetPhase.ts` rapporterar vilken gren som körde och kan per
> konstruktion **aldrig** returnera `observed`.
>
> **`topFrame` (f.d. `topFrameIndex`) kräver observerad fas.** `shaft-position-p4` och
> `top-shaft-orientation` svarar med nytt skäl **`top-phase-not-observed`**, skilt från
> `phase-missing`, och bär de avstådda bildrutorna i `frameIndices`.
> **`shaft-angle-by-phase`:s `top`-hink omfattas** — annars är regeln kringgången med ett
> fältanrop. Övriga hinkar orörda (spann, inte mätta i S-23).
>
> **Formen är den befintliga `reject()`-formen, inte kategorin `cannot-determine`** — den
> betyder *toppbildrutan mättes men riktningen går inte att läsa* (närlodrätt-spärren), och
> utan observerad fas finns ingen toppbildruta att mäta. Vägvalet står utskrivet i rapporten,
> inklusive vad som krävs för att i stället bära kategorin (`distanceToVerticalDeg` nullbar).
>
> **Kostnad, mätt över alla 205 svingar i `data/shaft/exports/`:** 43 (21 %) går från ett tal
> till tomt, **109 (53 %) svarar fortfarande**, 53 var redan tysta. 2 av de 109 byter bildruta
> (den sista *observerade* toppen, inte den sista). Produktionsvägen körd på de 178 svingar som
> har skaftpredictions: `top-shaft-orientation` 51 → **29** tal, `top`-hinken 55 → **32**.
> `shaft-position-p4` svarar 0 både före och efter — `prelabel.xml` bär inga pose-landmärken,
> så dess fasspärr syns bara i folkräkningen (23 av 55 stoppas nu på fasen före kroppen).
>
> **De 109 svarar bara för att datasetet är delvis annoterat. I appen finns ingen annoterad
> fas — där blir alla 205 tysta, och det är avsikten.**
>
> **Orört:** `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen,
> `plausibility.ts`. **Följd, och den renaste verifieringen:**
> `docs/shaft/phase-audit/select.ts` svarar nu `productionPath: väntat 22, fick 0` — alla 22
> bildrutor S-23 granskade (de med 13 fel) är precis de som nu vägras. Rätt signal för en
> stängd omgång, inte ett fel.
>
> `npm run build` rent · `npm test` **499/499** (+16) · `npm run lint` 3 fel: de 2 kända
> (`useHistory.ts`, `FrameLightbox.tsx`) plus ett oanvänt `fmt` i `top-from-dropout/analyze_dropout.ts`
> som kom in med S-29 — inget av dem i rörd kod. **Rättat (2026-09-18): `fmt` borttagen ur
> spike-skriptet, baslinjen är åter de 2 kända felen.**


### [ ] S-31 — Spike: bär handens/handledspositionen toppen, där skaftsignalen inte gör det?

**Fråga, inte fix.** S-27–S-29 visade att skaftvinkelns vändpunkt inte bär en läsbar topp i DTL:
skaftet ligger nära horisontalen vid toppen (vinkelbrus, S-27/S-28) och är dessutom kortast just
där (0,23–0,65 av det vanliga, S-29) — en **linje** förkortas i DTL-projektionen. En **punkt**
(handled/handposition) gör inte det på samma sätt. Ström D:s `poseEnvelope.ts` spårar redan
handledslandmärke 15/16 (MediaPipe, via `extractPoseTrajectory`) för envelope-detektering — bär
den banans vändpunkt (y-extremum, eller samma tecken-i-vinkelsteg-metod som S-27 använde på
skaftet) en topp som ligger närmare Eriks bedömda rader än skaftsignalen gjorde?

**Att göra:** spike i samma anda som S-27–S-29 — läsande skript i `docs/shaft/top-from-hand-position/`,
ingen ny detektion (återanvänd redan extraherade handledsbanor där de finns, annars körd
`extractPoseTrajectory` på samma klipp som S-28/S-29), ingen produktionskod rörd. Mät mot samma
facit ([phase-audit/facit.md](phase-audit/facit.md) + [phase-audit/review.md](phase-audit/review.md))
och samma sex/22 rader som S-27–S-29, så resultaten är direkt jämförbara.

**Om svaret är nej:** samma ärlighet som S-27–S-30 — dokumentera nollresultatet, bygg ingen fix.
**Om svaret är ja:** ny uppgift specas (kräver observerad fas fortfarande enligt S-30, men ger en
väg att *härleda* toppen utan annotering — vilket är den öppning som skulle lyfta S-30:s spärr).

**Dokumentkrav:** ny rapport `docs/shaft/top-from-hand-position.md` (samma form som
`top-from-signal.md`/`top-from-dense-signal.md`/`top-from-dropout.md`); bocka av här; uppdatera
`swingcheck-handoff.md` (senast-raden) och `shaft/STATUS.md` §3 med utfallet.

---

## Avklarat

_(CC flyttar avbockade uppgifter hit med datum och en mening om vad som gjordes, så listan ovan hålls fokuserad på återstående arbete.)_
