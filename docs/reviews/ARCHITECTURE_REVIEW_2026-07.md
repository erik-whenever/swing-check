# Arkitektur-review — juli 2026

> Skeptisk genomgång av bärande antaganden och största risker. Källor i prioritetsordning:
> `docs/BACKLOG.md`, `docs/swingcheck-handoff.md`, `CLAUDE.md`, koden i `src/` + `worker/worker.ts`,
> branch `stream-d` (HEAD `3cfd63e`). Skriven 2026-07-07.

---

## 0. Reconciliering: var dokumenten säger emot varandra (och koden)

Innan antagandena — dokumentläget ljuger på fyra punkter:

1. **Handoff: "Okommitterad swingdetektering i working tree på main"** (`swingcheck-handoff.md:74-75`) — **inaktuellt.** Working tree är rent; den address-ankrade `frameExtractor.ts` är committad och mergad. Dessutom: tuning-WARN-loggen som handoff säger ska bort *före merge* ligger kvar (`src/lib/frameExtractor.ts:341` — `log.warn('Swing detection summary', …)` med hela `curveDigest`). Den mergades alltså i strid med sin egen städinstruktion, och skickar nu potentiellt stora diagnostikobjekt i produktion.
2. **STATUS.md (2026-06-30): "Tre isolerade strömmar redo att starta"** — A-1/A-2, C-1 och D-1 pass 1 är klara. STATUS släpar minst en vecka och en hel ström (D nämns bara som "horisont"). Om STATUS inte hålls i synk är den negativt värd — den ger en ny session fel bild.
3. **Timestamp-fixen i `detectForVideo`**: uppdragsbeskrivningen säger "fix diagnostiserad men ej implementerad". Fel — den är **committad** (`c644757`, `src/lib/poseTrajectory.ts:33,73-83`). Det som återstår är fältverifiering (checkpoint 1), inte implementation.
4. **Modell-ID**: kod och docs säger `claude-sonnet-4-5` (`src/lib/api.ts:59`, handoff, KONTEXT). Uppgiften nämner `claude-sonnet-4-20250514` — en äldre modell. Koden är sanningen; om något externt (kostnadskalkyl, budget) räknats på 4-20250514 är den kalkylen fel.
5. **"60 frames är målet" finns ingenstans i repot.** Koden skickar 10 (`src/components/Camera/CameraView.tsx:69`), BACKLOG/handoff/öppna-frågor nämner inte 60. Ett mål som bara lever i huvudet/konversationer är inget mål — och som §4c visar är det troligen fel mål.

---

## 1. Bärande antaganden — och vad som händer om de är fel

**A1. "API-nyckeln når aldrig klienten" räcker som säkerhetsmodell.**
Falskt i praktiken. Nyckeln når inte klienten, men *förmågan* gör det: Workern (`worker/worker.ts:31-41`) vidarebefordrar **godtycklig** JSON-body till `api.anthropic.com` med din nyckel — ingen origin-koll, ingen modell-allowlist, inget `max_tokens`-tak, ingen rate limit, `Access-Control-Allow-Origin: *` (`worker/worker.ts:2`). Worker-URL:en skeppas i klart-JS i en publik PWA (`VITE_API_URL` i bundlen). Vem som helst som öppnar devtools har en gratis, obegränsad Claude-proxy på din räkning — valfri modell, valfri prompt, valfri volym. *Om fel:* kostnadssmäll utan att du märker det förrän fakturan; för G2 (publik distribution) är detta diskvalificerande dag ett.

**A2. Pose-trajektorier ger fasdetektion som pixel-diff inte kunde.**
Delvis sant, men med samma blinda fläck: MediaPipe spårar **33 kroppspunkter — inte klubban**. Impact förblir en *inferens* (handled lägst/snabbast), inte en mätning. Vad pose *faktiskt* köper är address och top-of-backswing (handledshöjd/riktning), som pixel-diff inte kan skilja åt. *Om fel* (handledspunkter brusiga vid motion blur i nedsvingen — lite-modellen är inte tränad för 30 m/s handrörelse): du har bytt ett oskarpt impact-estimat mot ett annat, plus 5.5 MB modell, WASM-runtime och 7–20 s extra inferens per klipp.

**A3. Att detektera svingen i efterhand är rätt problem.**
Ström A underminerar detta tyst: när A-3 landar startar inspelningen på röstkommando, dvs. klippet *börjar* vid address och svingen ligger i ett förutsägbart fönster. Då är frame-selection i sessionsläge nästan trivial — inget behov av vare sig pixel-diff-arkeologi eller pose. *Om A3 är fel åt andra hållet* (röststart opålitlig i range-brus, A-5 ovaliderad): då är detektering i efterhand kritisk igen. Poängen: **A och D är två parallella lösningar på samma G1-problem och planen säger inte vilken som är kritisk väg.**

**A4. Kedjan fungerar på en riktig iPhone på en riktig range.**
Helt overifierad. Varje avslutad uppgift slutar med samma fras: A-1 "ej enhetsverifierad på iOS", A-2 "ej fältverifierad", C-1-uppföljaren C-2 ogjord, D-1 "ej fältverifierad", frameExtractor-omarbetningen "inte verifierad på testklipp" (öppen fråga F1 sedan 2026-06-01). *Om fel:* G1-loopen dör på range av något banalt — mic-permission i standalone, suspenderad AudioContext, SW-cache som serverar gammal kod — innan någon av de sofistikerade delarna ens prövas.

**A5. Claude ger korrekta domar på stillbilder.**
Produkten *är* domarna (pass/fail i öronen), men det finns ingen mätning av domskvalitet: ingen eval-uppsättning, ingen konsistenskontroll (samma sving två gånger → samma domar?), inget facit. Systemprompten är väldesignad för ärlighet (`src/lib/prompt.ts:9-19`, "cannot_determine liberally"), vilket är rätt — men ingen vet hur ofta domarna är fel med hög confidence. *Om fel:* användaren får självsäkert nonsens i öronen; för G2 upptäcker en instruktör det på tre svingar och produkten är död.

**A6. IndexedDB-först + metadata-spegling räcker som datalager.**
För G1: nästan, men `MAX_RECORDS = 10` (`src/hooks/useHistory.ts:11`) och prunen på rad 73-76 **raderar video permanent** från sving 11. En range-session är 40–80 svingar; du behåller de sista 10. För G2: metadata-spegling är fundamentalt otillräcklig — instruktören behöver *videon*, som aldrig lämnar telefonen. *Om fel:* G1-sessionen kan inte gås igenom efteråt; G2 kräver ett lager (Storage, delning, roller) som inte finns i någon plan förutom en bisats i B-3.

**A7. Prompt caching kapar kostnaden.**
Bara för den statiska prefixen — och bilder cachas aldrig (varje sving har unika frames). Med 10 frames à ~1 200–1 800 tokens är bilddelen ~12–18k tokens medan den cachbara prefixen (system ~300 tokens + regelblock) är kanske 1–2k. Cachningen täcker alltså **~10 % av inputen, inte ~90 %**. Värre: Sonnets minimum för cachning är 1 024 tokens per prefix — system-breakpointen ensam (`src/lib/api.ts:63-69`) ligger under och är en no-op; med få regler kan även den andra breakpointen (`api.ts:77`) hamna under gränsen och cachningen gör tyst ingenting. *Om fel (dvs. om kostnadsstrategin vilar på caching):* skalning av frame-antal skalar kostnaden nästan linjärt, se §4c.

**A8. WASM-från-CDN duger tills vidare.**
`src/lib/poseDetector.ts:20` laddar runtime från jsDelivr. Ranger har notoriskt dålig uppkoppling; offline-först är ett hårt krav i CLAUDE.md. Dessutom en **deploy-mina som redan är gillrad**: modellen är gitignorad och hämtas av `npm run pose:model`, men `npm run deploy` (`package.json:13`) kör den **inte** — en deploy från en färsk klon/CI ger 404 på `/models/pose_landmarker_lite.task` i prod. *Om fel:* pose-funktionen dör exakt i miljön (range) den byggs för.

---

## 2. Topp 5-risker (severity × sannolikhet)

### R1 — Frame-selection är fortfarande fel, och felet är tyst
**Går sönder först:** analysen. Claude svarar alltid — får den 10 frames av en golfare som sänker klubban levererar den ändå domar, gärna `cannot_determine` men ibland självsäkert fel. Användaren hör feedback som låter legitim.
**Blast radius:** hela G1-värdet. TTS, historik, regler — allt nedströms blir förpackning runt fel innehåll. Felet syns inte i någon logg; det kräver att en människa tittar på frames.
**Sannolikhet:** hög — tre mekanismer (omarbetad pixel-diff, röstankare, pose) och **noll** av dem verifierade på riktiga klipp; F1 öppen sedan 2026-06-01.
**Billigaste mitigering:** kör det befintliga testklippet (9.58 s, impact ≈ 6–7 s) genom `npm run dev` + `VITE_DEV_PREVIEW`, läs `Swing detection summary`-loggen. En kväll, noll kod. Detta är den billigaste informationen i hela projektet och den har hoppats över i fem veckor medan två nya detekteringssystem byggts.

### R2 — Öppen Anthropic-proxy
**Går sönder först:** plånboken. `worker/worker.ts:31-41` + CORS `*`: vem som helst med URL:en (ligger i klientbundlen) kör godtyckliga anrop på din nyckel — inklusive dyrare modeller än din egen app använder.
**Blast radius:** hela API-budgeten; i värsta fall nyckel-missbruk som flaggar kontot. För G2: absolut stopp.
**Sannolikhet:** medel idag (låg upptäckbarhet, personligt bruk), **certain** den dag appen delas.
**Billigaste mitigering:** ~1 timme i Workern: hårdkoda/allowlista `model` och `max_tokens` server-side (ignorera klientens värden), kolla `Origin` mot din domän, räkna anrop per dag i D1 med hårt tak. Ingen auth behövs för G1.

### R3 — Verifieringsskulden: inget i G1-loopen är enhetstestat
**Går sönder först:** första riktiga range-sessionen, på något banalt — mic-permission i iOS standalone, AudioContext som inte resumar, kamera-stream som dör vid app-växling, SW som serverar gammal kod.
**Blast radius:** hela hands-free-loopen; dessutom demoraliserande eftersom det ser ut som att "allt är byggt".
**Sannolikhet:** hög — fem uppgifter i rad avslutade med "ej fältverifierad"; sannolikheten att *alla* fungerar första gången på iOS är låg.
**Billigaste mitigering:** ett enda konsoliderat fälttestprotokoll (C-2:s checklista + A:s mic-test + R1:s klipptest i samma session på rangen) **innan** fler passes byggs. En timmes range-tid ersätter veckor av spekulation.

### R4 — Kostnads-/latensvägg om frame-antalet ökas mot 60
**Går sönder först:** loopens rytm. 60 frames à ~1 229 tokens (1280×720) ≈ 74k ocachade input-tokens ≈ ~0,22 USD/sving; porträtt 1080×1920 (API-resize till 1568) ≈ ~1 844 tokens/frame ≈ 110k ≈ ~0,33 USD/sving. 50-svingars session: **11–17 USD**. Dessutom payload: 60 JPEG à 120–200 KB = 7–12 MB upload per sving på range-LTE = 10–60 s extra latens — vilket ensamt dödar "feedback i öronen innan nästa boll".
**Blast radius:** G1-UX och driftskostnad; caching hjälper inte (A7).
**Sannolikhet:** hög *om* 60-målet fullföljs som tänkt.
**Billigaste mitigering:** gör inte 60. Se §4c — rätt mål är *rätt* 12–16 frames, och resolution reduction (halva dimensionerna = fjärdedels tokens) före allt annat.

### R5 — Datalagrets tysta lägen
**Går sönder först:** redan sönder, tyst: RLS utan policies gör att **varje** `saveSwingToSupabase` nekas och sväljs som `log.warn` (`src/lib/supabase.ts:63-66`) — speglingen är död kod i drift. När B-1+B-2 landar vänder risken: `useHistory` *föredrar* remote (`src/hooks/useHistory.ts:35-48`) och osynkade records hydreras med `videoBlob: new Blob([])` (`src/lib/supabase.ts:96`) — tomma videor i UI:t på andra enheter. Plus prunen (R6-honorable-mention: `useHistory.ts:73-76`) som raderar video vid record 11.
**Blast radius:** historik/förtroende; pausat free-tier ("Failed to fetch") är omöjligt att skilja från riktiga fel.
**Sannolikhet:** certain (pågår) men severity låg *tills* B-3 gör remote till föredragen källa.
**Billigaste mitigering:** landa Ström B som **en** enhet (policies + auth + user_id + distinkt fallback-loggning), skippa mellanlägen. Höj eller gör `MAX_RECORDS` sessionmedveten innan första riktiga range-sessionen.

**Bubblare (under topp 5):** cross-clip-kontaminering i pose-singletonen — 1 ms-gapet mellan klipp (`poseTrajectory.ts:73`) får MediaPipes temporala filter att tro att nytt klipps första frame kommer 1 ms efter förra klippets sista pose; de första samplen i varje nytt klipp kan smittas av föregående video. Billig fix: gör inter-klipp-gapet stort (t.ex. +5 000 ms) så filtret behandlar det som diskontinuitet. Overifierad hypotes — testa i checkpoint 1. Även: `MAX_SAMPLES = 240` (`poseTrajectory.ts:16`) sänker sampling under 15 fps för klipp >16 s — dvs. exakt i "lång setup"-scenariot som var hela grundproblemet; samma tak i `frameExtractor.ts:41`.

---

## 3. Var planen troligen är fel eller överarbetad

**Kärnfelet: tre parallella lösningar på samma problem, noll datapunkter.** Omarbetad pixel-diff (overifierad), röstankare (A-3, obyggd), pose (D-1, overifierad) attackerar alla "hitta svingen". ADR-0001 har en explicit omprövningstrigger: *"om verifiering på varierade klipp visar att metoden missar → eskalera till pose"*. **Verifieringen gjordes aldrig** — F1 står ÖPPEN — men eskaleringen (Ström D) startades ändå. Pivoten kan mycket väl vara rätt, men den togs i strid med projektets egen beslutsregel, och det billigaste experimentet (ladda testklippet, läs loggen) är fortfarande ogjort. Det är att bygga före att mäta, två gånger om.

**Ström D är troligen överarbetad för G1.** I sessionsläge (G1:s hela poäng) ger A-3 ett röstankare: klippet börjar vid address, svingen kommer inom sekunder. Då räcker "fönster efter ankaret + jämn spridning" — pixel-diff behövs knappt, pose inte alls. Poses verkliga värde ligger senare: kvantitativa metriker (axelrotation, höftvridning), G2-instruktörsvyer, och icke-sessionsläget (uppladdade klipp). Det är ett legitimt spår — men det är inte G1-kritisk väg, och just nu får det mest energi av alla strömmar.

**60-frames-målet är troligen fel mål.** Se R4 för kostnaden. Men även bortsett från pris: 60 frames där ~45 är nära-dubbletter av address/follow-through *försämrar* analysen — modellens uppmärksamhet späds ut och `relevant_frames`-referenserna blir brus. Om 8–10 frames "var för få" är den troliga orsaken inte antalet utan att **fel** frames valdes (R1 igen). Rätt mål: 12–16 frames som bevisligen täcker svingen, tätast i nedsvingen. "Hybrid pre-selection senare" i planen är bakvänt — pre-selection är inte en senare optimering av 60-frames-spåret, det är *ersättningen* för det.

**Underarbetat, spegelvänt:** (1) Worker-härdning — finns inte ens i backloggen trots att den är billigaste hög-severity-fixen i repot. (2) Eval av domskvalitet — produkten är domarna, och ingen mekanism finns för att mäta dem; till och med ett protokoll "20 klipp, manuellt facit per regel, kör två gånger" vore mer värt än nästa pose-pass. (3) En latensbudget för range-loopen (inspelning→frames→upload→Claude→TTS måste ligga under tiden till nästa boll, ~30–45 s) — ingen har summerat kedjan.

---

## 4. Specifika bedömningar

### (a) Pivoten pixel-diff → pose-baserad selection — rätt?
**Riktningen försvarbar, sekvensen fel.** ADR-0001:s insikt (impact osynlig för pixel-diff) är korrekt och pose adresserar den observabilitetsluckan på riktigt — handledsbana ger address/top/nedsvingsriktning som pixel-diff aldrig kan ge. Men: (1) triggern för pivoten (verifiering som visar miss) utlöstes aldrig — pivoten är förtida enligt egen regel; (2) pose ser **inte klubban** — impact förblir estimat, så förvänta inte impact-exakta frames; (3) för G1-sessionsläget gör A-3 troligen hela frågan irrelevant (§3). Beslut som borde tas *nu*: pose är ett **selection-verktyg för uppladdade/icke-voice-klipp plus framtida metrik-spår**, inte G1-kritisk väg. Skriv det som ADR-0002 så D:s scope slutar glida.

### (b) Stream D-strukturen och verifieringsgrindarna
Pass-uppdelningen (integrera→självhosta→faser→utvärdera) är rätt tänkt och isoleringen från `frameExtractor.ts` föredömlig. Koden håller: singleton med retry-bar failure (`poseDetector.ts:61-76`), GPU→CPU-fallback, lazy chunk. **Men grindarna är dekoration:** D-1 bockades som "klart" med "ej fältverifierad" i samma mening — samma mönster som A-1/A-2. En grind man passerar utan att uppfylla är ingen grind. Konkret: **checkpoint 1 (skelett-overlay på riktigt klipp, iPhone) ska vara hård blockerare för pass 2**, och den ska samtidigt testa cross-clip-kontaminerings-hypotesen och CPU-fallback-latensen (lite-modell på CPU kan vara 100–300 ms/frame → 240 samples = 24–72 s — oanvändbart; GPU-delegaten är i praktiken ett krav, och ingen vet om iOS Safari ger den).

### (c) 60-frames-målet vs Vision-kostnad
Fel mål, se §3/R4. Sifferunderlag: bildtokens ≈ (b×h)/750 efter API-resize till max 1568 långsida; caching kan per definition inte täcka frames. Kostnadsspårets ordning bör vara: **(1)** resolution reduction — frames behöver inte 1280 px för pose-bedömning; 800 px halverar+ tokens och gör ingenting för domskvaliteten förrän motsatsen bevisats; **(2)** pose-driven selection av 12–16 frames (det *är* hybrid-pre-selection, gör den till målet i stället för 60); **(3)** överväg tiered analys: quick-mode med 8 frames/low-res för range-loopen, detaljerad analys med fler frames on demand efteråt. Notera också cache-minimumfällan (A7): verifiera i loggarna (`api.ts:107-111`) att `cacheReadTokens` faktiskt är >0 i drift — med litet regelblock kan hela cachningen vara en no-op idag.

### (d) Hybrid-datalagret + RLS-glappet
Ström B:s design är rätt (policies med `auth.uid()`, forced RLS, magic link med OTP-fallback för iOS-standalone-fällan — B-2 har till och med förutsett deep-link-problemet). Kritiken är sekvensering och tysta lägen: idag är speglingen 100 % död (varje insert nekas, sväljs som warn) samtidigt som `useHistory` är skriven att *föredra* remote — arkitekturen har alltså en inbyggd flip där historikens källa tyst byter huvudman den dag policies+auth landar, med tomma `videoBlob`-placeholder på andra enheter som första symptom. Landa B-1→B-3 som en enhet, ingen delleverans. Och B-3:s "videoBlob: Storage vs endast metadata" är inte en fotnot — det är **G2-beslutet** (se e); ta det medvetet, inte i förbifarten av en sync-uppgift. Slutligen: prune vid 10 records (`useHistory.ts:73-76`) är en G1-bugg i väntan på range-sessionen, oberoende av Supabase.

### (e) Spänningen G1 ↔ G2 i arkitekturen
Arkitekturen är G1-formad (lokalt-först, ingen auth, metadata-spegling, personlig API-nyckel bakom öppen proxy) och det är **rätt** — men tre komponenter är tickande G2-inkompatibiliteter: Workern (en persons nyckel kan inte betala andras analyser; kräver auth + per-användare-budget), videolagringen (instruktören behöver videon; kräver Storage + delningsmodell + i praktiken moderering/juridik) och historikmodellen (10 records, ingen roll-/relationsmodell). Inget av detta ska byggas nu — faran är motsatsen: att G2 *smyger in* via B-3:s Storage-beslut eller via pose-ambitioner ("instruktören vill se skelettet") och skattar G1-arbetet. Rekommendation: skriv en rad i KONTEXT.md — *"G2 är parkerat; inga beslut tas för G2:s skull förrän G1 är fältbevisad"* — och låt B-3 välja metadata-only tills vidare. Enda G2-förberedelsen som betalar sig i G1 är auth (cross-device), och den är redan planerad.

### (f) Offline/self-hosting av WASM
Rätt identifierat som "senare pass" — men det är ett **blockerande** senare pass om pose ska in i G1-vägen: range = dålig uppkoppling, och jsDelivr-beroendet (`poseDetector.ts:20`) gör första pose-körningen nätberoende även i installerad PWA. Två konkreta gotchas: (1) **deploy-minan är redan gillrad** — `npm run deploy` kör inte `pose:model`, modellen är gitignorad, så en deploy från färsk klon ger 404 i prod. Fixa nu (lägg `pose:model` i deploy-scriptet), oberoende av self-hosting. (2) Vid self-hosting: lägg inte 5.5 MB modell + ~4 MB WASM i SW-**precachen** — det gör varje app-uppdatering tung och straffar användare som aldrig använder pose; använd runtime-caching (cache-first på `/models/*` + wasm-chunken). Litet jobb, rätt prioriterat efter checkpoint 1 men före pass 3.

---

## 5. DEN enda saken som sänker G1

**Att de frames som skickas till Claude faktiskt visar svingen — overifierat i alla tre mekanismerna.**

Motivering mot alternativen: iOS-livscykelfel (R3) fäller sessionen men **högljutt** — du ser det, du fixar det. Proxyn (R2) fäller plånboken, inte sessionen. Kostnad/latens (R4) gör loopen seg, inte värdelös. Men fel frames fäller G1 **tyst**: kameran spelar in, uploaden lyckas, Claude svarar väl formulerat, TTS läser upp det i öronen — och allt handlar om fel ögonblick i videon. Ingen logg larmar; enda detektionen är ett mänskligt öga på dev-previewen. En range-session där feedbacken inte stämmer med vad kroppen just gjorde dödar förtroendet permanent — och förtroendet *är* produkten i G1.

Och statusen för denna enda sak, idag: pixel-diff-omarbetningen — overifierad sedan 2026-06-01. Röstankaret — obyggt (A-3). Pose — overifierad (checkpoint 1). Tre hästar, noll lopp.

---

## Om du bara gör tre saker

1. **Kör verifieringen som väntat sedan 2026-06-01 — innan någon mer kod skrivs.** En kväll: 3–5 riktiga klipp genom `npm run dev` + `VITE_DEV_PREVIEW`; läs `Swing detection summary` (frameExtractor) och skelett-overlayen (pose) på *samma* klipp. Utfallet avgör allt nedströms: träffar frameExtractor nu → Ström D nedprioriteras och F1 stängs; missar den och pose-overlayen ser bra ut → ADR-0002, pose är vägen; är pose-handlederna smetiga i nedsvingen → du slapp bygga pass 2–4 på sand. Det är projektets högsta informationsutbyte per timme, och det är gratis.

2. **Lås Workern (ny uppgift, ~1 timme, in i backloggen som egen punkt).** Server-side-pinna `model` + `max_tokens` (ignorera klientens), verifiera `Origin`, hårt dagstak via D1. Detta är den enda risken i repot som kan kosta riktiga pengar utan symptom, den blir värre för varje dag URL:en är publik, och den är oberoende av alla andra beslut — det finns inget skäl att vänta.

3. **Utse G1:s kritiska väg explicit: A-3 (röstankare) + fönsterbaserad extraction i sessionsläge; degradera Ström D till "selection för uppladdade klipp + framtida metrik/G2" tills punkt 1 säger annat.** Samtidigt: ersätt 60-frames-målet med "rätt 12–16 frames + resolution reduction". Det här är samma beslut i tre klädnader — sluta finansiera tre parallella lösningar på ett omätt problem — och det frigör exakt den tid som punkt 1:s fälttest och Ström B:s sammanhållna leverans behöver.
