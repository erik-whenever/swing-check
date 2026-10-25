# Analys + lagring i appen (N-3.5)

**Datum:** 2026-10-25 · **Ström:** N · **Status:** delleverans — core-logiken och appens koppling är byggda och
testade; enhetsprov, cache-mätning och Worker-konfig återstår (se *Kvar*).

## Vad som är byggt

| Del | Var | Vad |
|---|---|---|
| Språk som parameter | `packages/core/src/lib/language.ts` | `AnalysisLanguage = 'sv' \| 'en'`, standard `sv`. `setAnalysisLanguage`/`getAnalysisLanguage` är **det enda stället** som bestämmer språket. `ttsConfigFor()` ger TTS-locale (`sv-SE`/`en-US`) och röstprefix ur samma värde. |
| Prompten | `packages/core/src/lib/prompt.ts`, `api.ts` | Systemprompten och regelblocket nämner inget svarsspråk längre ("the RESPONSE LANGUAGE stated in the user message"). Språket och `short_verdict`-exemplen skickas i `buildLanguageNote(language)`, **efter** cache-brytpunkten, bredvid antalet rutor. `analyzeSwing` tar `language?`, annars det app-globala. |
| Cacheprefixet | `api.test.ts`, `prompt.test.ts` | Test som bevisar att `system` + allt t.o.m. sista `cache_control`-blocket är byte-identiskt mellan `sv` och `en`. Ett prefix cachas alltså för alla språk. |
| Lagring efter storlek | `packages/core/src/lib/mediaRetention.ts` | `planMediaRetention(poster, takBytes)`: ren funktion. Poster bär **mätta** bytes för video och bildrutor. Över taket: video från äldsta svingen först, tills under taket; räcker inte det, bildrutor äldst först. Planen innehåller bara `purgeVideo`/`purgeFrames` — resultat och metadata kan inte röras. `DEFAULT_MEDIA_CAP_MB = 300`. |
| Lagringsadapter (app) | `apps/mobile/src/mediaStore.ts` | `enforceMediaCap(poster, takMb)`: mäter faktiska filstorlekar med `expo-file-system` (`File.size`), raderar exakt de filer planen anger och returnerar posterna med `videoUri = null` + `videoPurged = true` ("video rensad" i historiken). En fil som inte gick att radera behåller sin URI. Ingen ny native-modul. |
| Worker-koppling (app) | `apps/mobile/src/coreSetup.ts`, `index.ts` | `configureApi` med `EXPO_PUBLIC_API_URL`. Saknas den blir URL:en tom och `analyzeSwing` kastar `ApiNotConfiguredError` **innan** något anrop — appen fungerar i övrigt lokalt. Appen skickar `Origin: swingcheck://se.swingcheck.app` (se CORS nedan). |

Supabase: appen har ingen Supabase-koppling alls, så lokalt-först gäller trivialt. Webbens no-op utan env är orörd.

## CORS-fyndet: anrop utan `Origin` nekas

`worker/worker.ts` (läst, inte ändrad):

- `isOriginAllowed(null)` är `false`. Ett anrop utan `Origin` räknas som otillåtet.
- Enda undantaget är `GET /api/log` (skyddas av `LOG_READ_KEY`). **`POST /api/analyze` utan `Origin` får 403
  `origin_not_allowed`** — det finns ett test för exakt detta (`worker.test.ts`, "rejects a proxy call with no Origin
  header at all").
- React Natives `fetch` sätter ingen `Origin`. Utan åtgärd skulle alltså varje analys från appen få 403.

**Lösning utan Worker-ändring:** appen sätter själv `Origin: swingcheck://se.swingcheck.app` via
`configureApi({ headers })`. Workern jämför bara strängar, så det räcker att lägga till värdet i `ALLOWED_ORIGINS`.
Allowlisten är ändå bara ett skydd mot främmande *webbsidor* (curl kan förfalska `Origin` redan i dag); budgetskyddet
är dagstaket i D1 och pinningen av modell/`max_tokens`. Säkerhetsnivån ändras alltså inte.

`// OSÄKER:` att iOS och Android skickar en handsatt `Origin` oförändrad är troligt men inte provat på enhet. Syns
direkt som 403 vid första riktiga analysen. Plan B kräver en Worker-ändring (t.ex. en app-header) och därmed Eriks beslut.

## Beslut

- **Språket ligger efter brytpunkten, inte i ett cacheprefix per språk.** Ett prefix för alla språk ger flest
  cache-träffar och ingen extra cache-skrivning per språk. Risk: att modellen följer en språkinstruktion sist i
  meddelandet sämre än i systemprompten. Bedömt låg (instruktionen står ändå före bilderna), men V-1 bör köra en
  omgång på svenska och kontrollera att fritexten fortfarande blir svensk.
- **Regeltexterna förblir svenska oavsett svarsspråk.** De är indata; modellen översätter vid `en`.
- **Standardtaket 300 MB.** Ett svingfönster är högst 10 s 1080p ([rututtag.md](rututtag.md)), cirka 10–30 MB
  hårdvarukodat → 10–30 svingar med video, i nivå med dagens `MAX_RECORDS = 10` men aldrig med förlorade resultat.
- **Webben följer samma policy** (se *Webben* nedan). Webbens TTS har fortfarande `sv-SE` hårdkodat; den följer
  standardspråket `sv` och behöver ändras först när webben får en språkinställning.
- **Skaftmått i prompten är utanför betan**; `core/measure` är inte inkopplat.

## Webben (useHistory)

`MAX_RECORDS = 10` är borta. `src/lib/historyRetention.ts` är webbens adapter mot samma `planMediaRetention`:

- **Mätning:** video = `videoBlob.size`; bildrutor = base64-strängarnas längd som de ligger i IndexedDB (ASCII,
  1 byte/tecken, ≈ 4/3 av JPEG-bytes). Faktiskt lagrat, inte uppskattat.
- **Efter varje sparning** (`useHistory.saveRecord`): alla poster läses, planen körs, de berörda posterna skrivs
  tillbaka under samma nyckel med `videoBlob` = tom Blob + `videoPurged`, resp. `frames = []` + `framesPurged`.
  Ingen post raderas. Fel i rensningen loggas och fäller inte sparningen.
- **`SwingRecord`** fick de additiva fälten `videoPurged?`/`framesPurged?` (core). `videoBlob` förblir obligatorisk —
  tom Blob var redan konventionen för "ingen video" (sessionssvingar, Supabase-hydrering). Sessionssvingar sparar
  aldrig video och märks därför inte "video rensad".
- **Taket** är inställningen `mediaCapMb` i `useSettingsStore` (persisterad), standard `DEFAULT_MEDIA_CAP_MB`. Ingen
  UI-kontroll ännu.
- **Historik-UI:** `SwingCard` visar "· video rensad" i raden med godkända regler när `videoPurged`.
- **Supabase:** `loadSwingsFromSupabase(500)` — bara metadata (några KB/rad), en säsong utan paginerings-UI.
  Supabase är fortfarande avstängt (no-op).

`// OSÄKER:` alla poster läses in i minnet för mätningen; upp till 300 MB bildrutor (sessionssvingar utan video) kan
pressa en äldre iPhone-flik. Bedömt låg–medel; åtgärd vid behov: media under egna nycklar.

## Kvar

1. **Cache-mätning före/efter** (kräver riktiga Claude-anrop → Eriks godkännande): jämför `cacheReadTokens` /
   `cacheCreationTokens` i loggraden `analyzeSwing response received` för några svingar i följd, före och efter
   denna ändring, på båda språken. Väntat: en cache-skrivning första gången efter deploy (prefixet ändrades), sedan
   träffar oavsett språk.
2. **Worker-konfig:** lägg till `swingcheck://se.swingcheck.app` i `ALLOWED_ORIGINS` (prod-ändring → Erik) och sätt
   `EXPO_PUBLIC_API_URL` för dev-klienten/EAS.
3. **Enhetsprov:** en analys från dev-klienten på iOS (Origin-headern, `ApiNotConfiguredError` utan env) och att
   `enforceMediaCap` mäter och raderar riktiga filer.
4. **N-3.6:** språk- och takinställning i UI, TTS i appen via `ttsConfigFor()`, historiken som visar "video rensad"
   och anropar `enforceMediaCap` efter varje sparad sving.
