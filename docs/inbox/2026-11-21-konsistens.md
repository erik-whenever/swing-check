# Konsistenskontroll 2026-11-21

Endast förslag. Inga kanoniska dokument är ändrade. Underlaget är `main` @ `c9da692` (S-48 mergad). `npx vitest run` gav **206/206 gröna** (17 filer), men bara efter en lokal `npm install` (se första fyndet). 11 öppna `// OSÄKER:` i `src/lib/`. Ingen av dem motsägs av dokumenten.

> Obs: fynden markerade *(återkommande)* fanns redan i `claude/konsistens-2026-10-27`, `-10-29` och `claude/consistency-2026-10-31`, som inte är triagerade. Förslag: triagera dem samtidigt, eller stäng de äldre PR:erna till förmån för den här.

## 1. Dokument som påstår något koden motsäger

**`package-lock.json` är osynkad med `package.json` (ny).** `npm ci` avbryter med `Missing: @fontsource/outfit@5.3.0 from lock file`. Beroendet står i `package.json:20` sedan UI-1. CLAUDE.md, BACKLOG och handoff anger `npm test`/`npm run build` som verifiering, men en ren klon (CI, worktree, cloud-session) kan inte installera reproducerbart. Förslag: kör `npm install` och committa lockfilen.

**`docs/swingcheck-handoff.md:289` och `:310`: Worker-taket och quick mode stämmer inte (ny).** Miljövariabeltabellen anger `MAX_TOKENS` med "Default 2000". Koden har `DEFAULT_MAX_TOKENS = 4096` (`worker/worker.ts:23`) och `wrangler.toml:33` har 4096. Säkerhetsmodellen säger "quick mode skickar 600". Sedan S-48 skickar klienten `maxTokensFor()` = `200+120·n` (`src/lib/api.ts:34`). BACKLOG W-1 (rad ~1150, "default 2000", "600 → 600") har samma inaktuella siffror. Förslag: uppdatera tabellen och lager 3 till 4096 och skalade värden, och låt *Öppna trådar* fortsatt bära deploy-förbehållet.

**`docs/swingcheck-handoff.md:78` och `:240`, `STATUS.md`: Supabase är avstängt i koden (ny).** Handoffen säger "valfri Supabase-spegling av metadata" och att läsningar "nekas och faller tyst tillbaka till IndexedDB". `src/lib/supabase.ts:22` har `SUPABASE_DISABLED = true`, så ingen trafik går alls till Supabase. Det står bara i BACKLOG (mellan B-1 och B-2). Förslag: skriv in avstängningen i handoffens *Fungerar* och *Öppna trådar*.

**BACKLOG W-1 "Kvar för Erik" (rad 1170): `ALLOWED_ORIGINS` är redan satt (ny).** Texten säger att prod-origin ska sättas i `worker/wrangler.toml`. Det gjordes i `619e586` (`wrangler.toml:25`, prod-URL + localhost). Avslutande `/` tolereras (`worker.ts:107`). Kvar är troligen bara D1-migrationen och cache-kontrollen efter deploy. Förslag: stryk den delpunkten eller markera den gjord.

**Commit `b3e217f` (batchad fjärrloggning för "native builds" + global felfångst) saknar dokumentation (ny).** Den ändrar `src/lib/logger.ts` (+135) och `worker/worker.ts` (+109). Varken BACKLOG, handoff eller STATUS nämner den. Kommentaren i `worker.ts:72` om att native-buildens origin måste in i `ALLOWED_ORIGINS` syns inte i miljövariabeltabellen. Det finns ingen native-build i `main` (bara branchen `stream-native`). Förslag: lägg en rad i BACKLOG och handoff, eller ange vilken ström den hör till.

**Handoffen säger att D-5 pass 3 pågår, BACKLOG att den är klar (ny).** `docs/swingcheck-handoff.md:129` har "Pass 3 — pågående (… ej fältverifierad)". `docs/BACKLOG.md:730` har "Pass 3 KLAR (2026-08-08)". Förslag: använd samma formulering, t.ex. "klar, ej fältverifierad".

**BACKLOG S-48 (rad 1099) hänvisar till S-45 och `stream-shaft`, som inte finns i BACKLOG (ny).** Branchen finns på remote men har ingen ström eller uppgift i BACKLOG. Det strider mot regeln "enda källa till sanning". Förslag: lägg in strömmen (S-45 m.fl.) med status.

**`docs/ROADMAP.md:47` (M3) och BACKLOG E-1: kostnadspremissen är inaktuell (delvis återkommande).** Där står "10 st … ~1 800 input-tokens/frame". Koden har `ANALYSIS_FRAME_COUNT = 32` (`frameExtractor.ts:68`). Sessionsvägen beskärs (E-2) till långsida ≤ 900 och ~220 tokens/bild. Bara klipp-vägen har kvar width-cap 1280 (`frameExtractor.ts:133`). Förslag: räkna om E-1:s mål för enbart klipp-vägen, eller stryk E-1 om E-2 räcker.

**`STATUS.md` är daterad 2026-07-07 och beskriver ett läge som inte längre gäller (återkommande).** Där står "Tre strömmar redo att starta", pose är "Horisont (ej schemalagt)" och motion-detektering huvudspåret. Pose/envelope är primär selektor (`frameExtractor.ts`, `selectViaPose`), och C-1, D-1…D-4, E-2, UI-1/2, W-1 och S-48 är klara. Förslag: ersätt filen med en ren pekare till BACKLOG och handoff, eller skriv om de två avsnitten.

**`docs/ROADMAP.md:6`: källnoten säger att `ARCHITECTURE_REVIEW_2026-07.md` saknas (återkommande).** Filen finns i `docs/reviews/`, och BACKLOG W-1 och handoffen länkar till den. Förslag: stryk noten eller kör den reconcile den själv föreskriver.

**BACKLOG D-2 (rad 331) och `docs/pose-detection.md` beskriver filer som inte finns (återkommande).** De nämner `src/lib/posePhases.ts` och `src/lib/poseFrameSelection.ts`, men ingen av filerna finns. De ersattes av `poseEnvelope.ts` och `poseEnvelopeSelection.ts` (ADR-002). Förslag: märk avsnitten som ersatta.

**Två ADR-kataloger (återkommande).** CLAUDE.md pekar på `docs/adr/` (ADR-0001). ADR-002 och ADR-003 ligger i `docs/decisions/`. Förslag: välj en katalog.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**D-2 `[x]` (BACKLOG rad 329) börjar med "Delvis (Pass 2, del b klar)" (återkommande).** Acceptansen ("posePhases ger fyra timestamps", "markörer i preview", "enhetstest på platå-/vändpunktslogik") gäller kod som inte finns längre. Den har ersatts, inte levererats. Förslag: skriv om acceptansen mot envelopen, eller notera "ersatt av ADR-002" vid bockningen.

**D-3 `[x]` (rad 505) uppfyller inte sin acceptans, och F1 är fortfarande öppen (återkommande).** Kravet var ≥ 80 % av 20 klipp inom ±150 ms. Utfallet skulle skrivas in i ROADMAP (beslutsfork 1) och `docs/oppna-fragor.md` (F1, rad 28). Ingen av sakerna är gjord. Avvikelsen är ärligt dokumenterad, men den fält-fallbackstatistik (`path`-loggen) som skulle ersätta metriken redovisas ingenstans. Förslag: redovisa pose/motion-andelen från fältloggen och stäng F1, eller ändra till `[~]`.

**E-2 `[x]`, W-1 `[x]` och S-48 `[x]` vilar på villkor som inte är bekräftade.** E-2 är "ej fältverifierad". För W-1 och S-48 är prod-effekten beroende av `wrangler deploy` och D1-migration, och ingenting i repot bekräftar att de körts. Handoffen säger fortfarande att produktionen klampar till 2000. Förslag: lägg en uttrycklig deploy-/fältpunkt som `[~]`, eller notera i BACKLOG när deployen är gjord.

## 3. Milstolpar vars måldatum passerat utan statusändring

`docs/PLAN.md` har **inga** daterade milstolpar. Den beskriver bara två routines som "TBD", trots att minst den här routinen körs. De daterade målen finns i `docs/ROADMAP.md` och redovisas därför här:

- **Beslutsfork 1, 2026-07-31 (`ROADMAP.md:77`), passerat med ~4 månader (återkommande).** D-3 kringgicks via cutover. ROADMAP har ingen utfallsnotering, och trim-slidern (F-1) finns varken byggd eller avförd i BACKLOG.
- **Beslutsfork 2 / M2, 2026-08-15 (`ROADMAP.md:80`), passerat med ~3 månader (återkommande).** A-3 och A-5 är `[ ]`. `swingStartTimestamp` och `voiceStartEnabled` finns inte i `src/`. Ingen scopefrys är dokumenterad, och nytt G1-arbete (D-5, E-2, UI, S-48) har tillkommit efteråt.
- **M5 (Ström B) har inte rört sig.** B-1…B-3 är `[ ]`, och Supabase är dessutom avstängt (`SUPABASE_DISABLED`). Det finns inget datum, men roadmapen kallar B G2:s hårda grind.
- Förslag: skriv in utfall och datum för fork 1 och 2 i ROADMAP. Fyll i PLAN.md:s routine-beskrivningar, eller ge PLAN riktiga milstolpar med datum så att kategori 3 blir kontrollerbar.
