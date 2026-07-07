# ROADMAP — SwingCheck (2026-07-07)

> Sekvenserad efter **värde × risk × upplåsningsordning**, inte fas-nummer.
> Auktoritativ för *vad som är gjort*: [BACKLOG.md](BACKLOG.md). Denna fil är auktoritativ för *ordning och beslutsforkar*.
>
> **Källnot:** `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` refereras i uppdraget men finns inte i repot
> (ingen branch, ingen git-historik). Roadmapen bygger därför på BACKLOG, handoff, KONTEXT.md,
> ADR-0001 och faktiskt repo-läge per 2026-07-07. Dyker reviewen upp: reconcila mot avsnittet *Beslutsforkar* nedan.

## Två mål

- **G1 — Personligt rangebruk.** Handsfree-loop: tripod → "start" → sving → feedback i öronen → nästa. Kräver tillförlitlig helsvingsfångst utan skärmberöring.
- **G2 — Kommersiellt instruktörssamarbete.** En tränare ser sina elevers svingar mellan lektioner, försorterade av AI mot tränarens egna regler.

**Upplåsningslogik:** G1 är G2:s demo och trovärdighetsbevis — en tränare köper inte ett verktyg vars fångst missar svingar. Därför G1-tillförlitlighet först, men G2:s tekniska grind (auth + sync, Ström B) startas innan G1 är "perfekt", eftersom B är isolerad och pilotrekrytering har ledtid.

## Reconciliation: "Fas 0–3" vs Stream-verkligheten

Den gamla fasplanen (Fas 0 grund → Fas 1 fångst → Fas 2 auth/sync → Fas 3 delning) finns inte längre som dokument — enda spåret i repot är B-2:s notis *"notera under Fas 2 att auth-grunden är tidigarelagd"*. **Strömmarna i BACKLOG.md gäller**; de är vad som faktiskt exekverats (A-1/A-2, C-1 mergade; D-1 pass 1 på `stream-d`).

Tre krockar, och vad som gäller:

1. **MediaPipe framflyttad.** ADR-0001 och STATUS.md placerade pose som *eskalering efter* fältverifiering av motion-metoden (F1). Ström D startades innan F1 besvarats. **Gäller: strömverkligheten** — D-1 var billig och gav overlay-infrastruktur som G2 behöver oavsett. Men konsekvensen accepteras inte tyst: pose **omklassas** från "G1-fångstens räddning" till primärt **G2-tillgång** (skelett-overlay, fasjämförelse för tränare). G1-fångstens tillförlitlighet kommer i första hand från röstankaret (A-3), som kringgår pixel-diff helt i sessionsläge — rangebruket *är* sessionsläge.
2. **"Fas 2 tidigarelagd" (auth).** Gäller fortfarande, men motivet har bytt: inte bara för att sync faller tyst, utan för att **B är G2:s hårda grind** (M5 nedan).
3. **F1 (håller motion-detekteringen?) är fortfarande ÖPPEN.** Fasplanen antog att den besvarades före allt annat. I strömverkligheten besvaras den *samtidigt* med röstankaret i ett och samma fälttest (M2) — billigare än ett separat verifieringspass.

## Sekvenserad roadmap

Ordningen nedan är prioritetsordning för Eriks uppmärksamhet (ensam utvecklare). B kan köras parallellt i egen worktree när huvudspåret väntar på fälttest.

### M1 — Hands-free-loopen stängd *(G1)*
Röstankaret in i sessionsläget. Detta är G1:s kärnupplevelse och den enskilt högsta värde-per-risk-uppgiften i backloggen: all infrastruktur (A-1/A-2, TTS, sessionsläge) finns redan.
- **Tjänar:** G1.
- **Klar-metrik:** 10 svingar i följd i sessionsläge utan en enda skärmberöring, alla med `swingStartTimestamp` persisterat.
- **Sköraste antagande:** iOS AudioContext + mic-capture överlever hela sessionsloopen (inspelning ↔ analys ↔ TTS) utan att suspenderas.
- **CC-pass:** **A-3** (finns i BACKLOG; prompt 1 nedan).

### M2 — Fångsten fältverifierad *(G1 — riskiest assumption first)*
Ett rangebesök besvarar tre öppna frågor samtidigt: F1 (motion-detekteringen), energitriggerns false-rate i range-brus, och C-2:s manuella iOS-checklista.
- **Tjänar:** G1.
- **Klar-metrik:** ≥ 18 av 20 svingar i en riktig range-session analyseras hands-free med impact inom det extraherade frame-fönstret.
- **Sköraste antagande:** adress-stillhet + röstankare räcker för frame-valet — pose behövs inte för G1.
- **CC-pass:** **A-5** (mät-läge) + **C-2** (kodfixar + checklista); fälttestet är Eriks.
- **Villkorsutfall:** A-4 (Porcupine wake-word) byggs **endast** om A-5-data visar > 1 falsk trigger per 10 svingar. Annars stryks A-4 (beslutsfork 2).

### M3 — Vision-kostnaden halverad *(G1-hygien, körs närhelst det passar)*
Frames skickas idag i upp till 1080×1920 (10 st) → ~1 800 input-tokens/frame, ~0,4–0,6 kr/sving. Långsida-cap till ~1024 px är riskfri och kräver inget beslut (beslutsfork 3).
- **Tjänar:** G1 (och G2:s marginal — intäktsdelning tål inte 0,5 kr/sving × pilotvolym).
- **Klar-metrik:** ≥ 40 % färre input-tokens per sving utan verdict-ändring på 5 referensklipp.
- **Sköraste antagande:** Sonnet ser klubb-/handledsposition tillräckligt vid ~1024 px långsida.
- **CC-pass:** **E-1** (ny i BACKLOG; prompt 2 nedan).

### M4 — Pose bevisad eller avförd *(time-boxad; G1-fallback / G2-tillgång)*
Pose-selection får exakt två pass till plus ett fälttest, sedan avgörs den (beslutsfork 1). Självhostad WASM/modell ingår i D-2 eftersom fälttestet annars är ogiltigt (beslutsfork 4).
- **Tjänar:** G2 primärt (overlay + fasjämförelse), G1 sekundärt (frame-val för icke-sessionsklipp).
- **Klar-metrik:** på ett 20-klipps testset ligger pose-härledd impact inom ±150 ms från manuell etikett i ≥ 80 % av klippen.
- **Sköraste antagande:** lite-modellen @ ~15 fps har temporal upplösning nog för downswingen (~250 ms; 66 ms mellan sampel + ev. landmark-släp).
- **CC-pass:** **D-2** (fasdetektion + självhost, prompt 3 nedan), **D-3** (utvärdering + beslut).

### M5 — Konton + cross-device *(G2:s hårda grind)*
Utan auth+RLS+video-sync finns inget instruktörsspår: tränaren måste kunna se elevens sving på en annan enhet. Ström B i sin helhet, med B-3:s lagringsbeslut avgjort: **Supabase Storage för video** (metadata-only räcker inte för G2).
- **Tjänar:** G2 (och löser G1:s tysta sync-fallback på köpet).
- **Klar-metrik:** sving inspelad på iPhone är, inloggad, läsbar med video på en annan enhet.
- **Sköraste antagande:** magic link/OTP fungerar i iOS standalone PWA (känd deep-link-risk, workaround specad i B-2).
- **CC-pass:** **B-1 → B-2 → B-3** (finns i BACKLOG).

### M6 — Instruktörspilot *(G2)*
Minsta delningsmodell + tränarvy, sedan pilot enligt G2-avsnittet nedan.
- **Tjänar:** G2.
- **Klar-metrik:** 1 tränare granskar elevsvingar ≥ 2 ggr/vecka under 4 veckor och svarar ja på "skulle du betala för detta?".
- **Sköraste antagande:** tränare vill ha *försorterad asynkron* granskning (inte live-verktyg) och litar på AI-försorteringen.
- **CC-pass:** **G2-1** (delningsrelation + RLS), **G2-2** (tränarvy) — stubbar i BACKLOG, detaljspecas efter M5.

## Beslutsforkar (explicita)

### 1. Pose-selection vs manuell trim-slider
**Beslut: time-box, inte tro.** Pose-selection får D-2 + D-3 + ett fälttest — inte mer. Hård trigger: **om D-3-metriken (≥ 80 % inom ±150 ms på 20 klipp) missas, eller om D-3 inte är fältkörd senast 2026-07-31**, byggs manuell trim-slider (≈ 1 pass: scrubba till impact, fönstret läggs runt) som fallback för icke-sessionsklipp, och pose degraderas till ren overlay-funktion för G2. Motivering: röstankaret (M1) täcker redan G1:s huvudscenario, så pose-selection är inte på kritiska vägen — den får inte bli ett forskningsprojekt som blockerar M5/M6.

### 2. G1-scopefrys
**Beslut: frys vid M2-metriken, senast 2026-08-15.** När 18/20-metriken är nådd (eller datumet passerat med "tillräckligt bra"-bedömning) läggs ingen ny G1-funktionalitet: A-4 byggs bara om A-5-datat kräver det (> 1 falsk trigger/10 svingar), övrig G1-polish parkeras. All kapacitet går till M5→M6. Motivering: G1:s marginalnytta efter en fungerande hands-free-loop är brant avtagande; G2 har ledtider (pilotrekrytering, samtycken) som bara startar när man startar dem.

### 3. Vision-kostnad: resolution nu vs hybrid pre-selection senare
**Beslut: E-1 (resolution) körs nu, villkorslöst** — den är riskfri, reversibel och behöver ingen tröskel. **Hybrid pre-selection (färre frames, valda via pose-faser) triggas av D-2-framgång, inte av kostnad** — den existerar bara om pose bevisas i M4. Om pose avförs och kostnaden ändå blir ett problem är tröskeln: **> 0,25 kr/sving efter E-1, eller > 100 svingar/vecka i pilotvolym** → empiriskt pass som testar 10→8→6 frames mot verdict-kvalitet.

### 4. Självhosting av WASM/modell
**Beslut: ingår i D-2, inte senare.** Så länge WASM laddas från jsDelivr bryts offline-garantin (range = dålig uppkoppling), service workern kan inte precachea CDN-assets, och D-3:s fälttest mäter nätverkslycka i stället för pose-kvalitet. Inget externt blockerar: kopiera WASM-assets från `node_modules` till `public/` vid build, peka `FilesetResolver` lokalt, lägg `.task`-modellen (~5,5 MB) i SW-precache (kräver höjd `maximumFileSizeToCacheInBytes` i vite-plugin-pwa). Om D avförs i fork 1: självhostingen följer med overlay-funktionen till G2-spåret, den slängs inte.

## G2 — Instruktörsspåret

**Minsta grej som bevisar värde för en tränare:** en webbvy där tränarens elever dyker upp med veckans svingar, **försorterade mot tränarens egna regler** (regelbiblioteket finns redan — tränaren definierar sin regeluppsättning en gång, AI:n flaggar avvikelser per sving). Tränaren tittar 5 min, röst-/textkommenterar de flaggade. Värdelöftet: *"dina ögon mellan lektionerna, utan att du tittar på 100 videor"*. Inte live-verktyg, inte lektionsersättning — förlängning av lektionen.

**Pilot:** 1 tränare + 5–8 av hens elever, 4 veckor, gratis. Erik sköter onboarding manuellt (konton, regeluppsättning tillsammans med tränaren). Mätpunkter: elever laddar upp ≥ 3 svingar/vecka; tränaren loggar in ≥ 2 ggr/vecka utan påminnelse; slutintervju med betalningsfrågan. Två av tre = fortsätt; noll–en av tre = tillbaka till G1-nischen.

**Pris/positionering (utgångspunkt, valideras i pilot):** intäktsdelning där **tränaren är säljkanalen**. Tränaren säljer "SwingCheck mellan lektioner" som add-on till sina elever, t.ex. 79–99 kr/elev/månad, delning ~70/30 tränare/SwingCheck. Motiv: tränarens rekommendation är distributionen; SwingCheck:s marginal ska tåla vision-kostnaden (~0,1–0,25 kr/sving efter E-1 → ~5–15 kr/elev/månad i COGS vid rimlig volym). Alternativet (SaaS-avgift per tränare) är enklare men flyttar säljrisken till oss — fel för en första pilot.

**Data/samtycke (GDPR):** video av identifierbar person är personuppgift.
- Delning till tränare kräver **explicit samtycke per relation** (elev godkänner "min tränare ser mina svingar"), återkallbart, med cascade-radering.
- Lagring i EU-region (Supabase-projektet väljs/verifieras EU i B-1).
- Tränaren får se och kommentera, inte exportera/vidaredela — skrivs in i pilotvillkoren.
- **Minderåriga är vanliga i golfträning:** pilot tar endast 18+, annars krävs målsmans samtycke — beslutas före pilot 2.
- För piloten räcker samtyckestext + EU-region + raderingsrätt; DPA-mall med tränaren tas fram om pilot → betald.

**Tekniska förutsättningar (i ordning):** M5 komplett (auth, RLS, video i Supabase Storage) → relationstabell tränare↔elev med RLS-policies (G2-1) → tränarvy: elevlista, svinglista med regelutfall, kommentar tillbaka (G2-2). Skelett-overlay från Ström D är *förstärkning*, inte krav, för pilot 1.

## Paste-ready CC-prompter (omedelbara nästa åtgärder)

### Prompt 1 — A-3 (M1)

```
Jobba i Ström A, uppgift A-3 i docs/BACKLOG.md (branch stream-a, rebasa på main först — stream-c är mergad).

Mål: Trigger under session → starta inspelning, sätt swingStartTimestamp på SwingRecord. Detta är ankaret som kringgår pixel-diff i sessionsläge (se docs/ROADMAP.md M1).

Att göra (detaljer i BACKLOG A-3):
- Utöka SwingRecord med swingStartTimestamp?: number (ms rel. inspelningsstart) — additivt fält, B-3 rör samma interface med user_id.
- store/session.ts: flagga voiceStartEnabled; vid trigger → starta inspelning, registrera timestamp.
- Countdown valfri i voice-läge (default kort/skippa).
- Exponera timestampet till frame-extraktionen som ankare — ändra INTE pixel-diff-logiken, låt extraktorn föredra ankaret om det finns.
- Hela flödet hands-free: tripod, hörlurar, "start", sving, TTS, redo för nästa.

Acceptans: voiceStartEnabled + "start" → inspelning börjar, timestamp loggas/persisteras på SwingRecord. Icke-voice-flöde opåverkat. 10 svingar i följd körbara utan skärmberöring (verifiera flödet i npm run dev; fält är Eriks).

Dokumentkrav (obligatoriskt, samma commit-serie): bocka av A-3 i docs/BACKLOG.md med en rad om vad som gjordes; uppdatera SwingRecord-modellen + voice-status i docs/swingcheck-handoff.md; bocka av A-3 i docs/voice-start.md med hands-free-flödet steg för steg.
```

### Prompt 2 — E-1 (M3)

```
Ny uppgift E-1 i docs/BACKLOG.md (Ström E — Vision-kostnad), egen branch stream-e från main.

Mål: Sänk vision-input-tokens per sving ≥ 40 % genom att cappa frame-långsidan, utan verdict-regression. Se docs/ROADMAP.md M3 + beslutsfork 3.

Kontext: frameExtractor.ts cappar idag canvas.width till 1280 men porträttvideo (1080×1920) passerar nästan ohindrat → Claude vision skalar till ~1568 långsida ≈ ~1 800 tokens/frame × 10 frames. Cap på LÅNGSIDAN (inte bredden) till ~1024 px ger ~55–60 % tokenreduktion.

Att göra:
- I frameExtractor.ts: ersätt width-cappen med långside-cap (const FRAME_MAX_DIM = 1024, tunable överst i filen som övriga). Behåll JPEG quality 0.8.
- Rör INTE motion-canvasen (MOTION_MAX_DIM 360) — bara analys-frames.
- Logga frame-dimensioner + uppskattad tokenvikt i den befintliga extraktions-loggen.
- Verifiera mot 5 referensklipp: kör analys före/efter, jämför verdicts per regel (npm run dev, VITE_DEV_PREVIEW). OBS: riktiga Claude-anrop kostar — kör b/a-jämförelsen på Eriks klartecken, max 5+5 anrop.

Acceptans: långsida ≤ 1024 på extraherade frames oavsett orientering; ≥ 40 % tokenreduktion (mät via loggad dimension eller usage i Worker-svar); inga verdict-ändringar på referensklippen (eller dokumenterade + bedömda som brus).

Dokumentkrav: lägg till + bocka av E-1 i docs/BACKLOG.md; uppdatera docs/swingcheck-handoff.md ('Fungerar': frame-pipeline med kostnadsnot); notera b/a-resultatet i docs/ROADMAP.md under M3.
```

### Prompt 3 — D-2 (M4)

```
Jobba i Ström D, ny uppgift D-2 i docs/BACKLOG.md (branch stream-d).

Mål: (a) Självhosta WASM-runtimen + modellen (offline-först — utan detta är fälttestet i D-3 ogiltigt, se docs/ROADMAP.md beslutsfork 4), (b) härled svingfaser ur pose-trajektorian. Rör INTE frameExtractor.ts eller SwingRecord.

Att göra:
- Självhost: kopiera @mediapipe/tasks-vision WASM-assets till public/ vid build (script eller vite-plugin), peka FilesetResolver.forVisionTasks lokalt, lägg wasm + pose_landmarker_lite.task i SW-precache (höj maximumFileSizeToCacheInBytes; modellen är ~5,5 MB). Verifiera offline i npm run dev (nätverk av efter första laddning).
- Fasdetektion: ny lib/posePhases.ts — ren, testbar funktion PoseSample[] → { address, top, impact, followThrough } (timestamps). Ansats: handledshastighet (landmark 15/16) — address = lång låghastighetsplatå, top = vertikal riktningsvändning, impact = hastighetsmax nära nedre handledsposition, follow-through = efterföljande deceleration. Flagga osäkerhet med // OSÄKER: där heuristiken är svag (t.ex. 15 fps temporal upplösning i downswing).
- Visa fasmarkörer i dev-previewen (bakom VITE_DEV_PREVIEW) ovanpå befintlig skelett-overlay, + logga fastider till DevLogPanel.
- INGEN koppling till frame-valet än — det är D-3:s utvärderingsbeslut.

Acceptans: appen kör pose helt utan nätverk efter första laddning (ingen jsDelivr-request); posePhases returnerar fyra timestamps på ett normalt svingklipp; markörer syns i preview; enhetstest på syntetisk/inspelad trajektoria för platå- och vändpunktslogiken.

Dokumentkrav: lägg till + bocka av D-2 i docs/BACKLOG.md; bocka av självhost + fasdetektion i docs/pose-detection.md (arkitektur + heuristik + kända svagheter); uppdatera docs/swingcheck-handoff.md (Pågående: Pose). D-3 (20-klipps utvärdering, ±150 ms-metriken, beslutsfork 1 i ROADMAP) är nästa uppgift — speca den i BACKLOG när D-2 bockas av.
```

---

*Uppdatera denna fil när en beslutsfork avgörs (datum + utfall), inte löpande — löpande status bor i BACKLOG/handoff.*
