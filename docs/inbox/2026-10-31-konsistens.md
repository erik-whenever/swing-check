# Konsistenskontroll 2026-10-31

Förslag endast — inga kanoniska dokument är ändrade. Testsviten gick inte att köra (`node_modules` saknas i miljön), så testresultat ingår inte i jämförelsen.

## 1. Dokument som påstår något koden motsäger

**STATUS.md (rad 3–15) är föråldrad.** Den är daterad 2026-07-07 och säger att Ström A, B och C är "redo att starta". Pose-estimering står som "Horisont (ej schemalagt)" och rörelsebaserad detektering som huvudspåret. I koden är pose/envelope den primära frame-selektorn (`src/lib/frameExtractor.ts`, `selectViaPose`). Ström C-1, D-1–D-4, E-2, UI-1/2, S-48 och W-1 är klara, och D-5 pågår. Förslag: skriv om "Nuvarande fokus" och "Horisont" från BACKLOG/handoff, eller ersätt filen med en ren pekare.

**docs/pose-detection.md (rad 178, 198) och BACKLOG D-2 pekar på filer som inte finns.** Båda beskriver `src/lib/posePhases.ts` (`detectSwingPhases`) och `src/lib/poseFrameSelection.ts` (`selectPhaseWeightedFrames`) som leveranser. Ingen av dem finns i `src/lib/`, och ingen commit rör `posePhases.ts`. Envelope-spåret (`poseEnvelope*.ts`) har tydligen ersatt dem. Förslag: markera de två avsnitten som ersatta av `poseEnvelope.ts`/`poseEnvelopeSelection.ts`.

**docs/ROADMAP.md (M1, M2, prompt 1–3) matchar inte strömverkligheten.**
- Roadmapen kallar D-2 "fasdetektion + självhost" och D-3 "20-klipps utvärdering". BACKLOG har D-3 som "Cutover" och D-2 som delvis ersatt.
- Prompt 2 (E-1) beskriver `canvas.width = min(…,1280)`. Det stämmer fortfarande (`frameExtractor.ts:133`).
- Roadmapens "Fas 0–3"-avsnitt och källnoten om `ARCHITECTURE_REVIEW_2026-07.md` ("finns inte i repot") är fel: filen finns i `docs/reviews/` och handoff länkar till den.

**CLAUDE.md pekar på `docs/decisions/` för ADR:er.** Samma fil pekar på `docs/adr/`. ADR-002 och ADR-003 ligger i `docs/decisions/`, ADR-0001 i `docs/adr/`. Två ADR-kataloger. Förslag: välj en.

**docs/PLAN.md** beskriver "Två nattliga routines" som TBD. Nu finns minst en (denna). Förslag: fyll i beskrivningen.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**D-3 (BACKLOG rad 505) är `[x]` men dess ursprungliga acceptans är aldrig uppfylld.** Kravet var ≥ 80 % av 20 klipp inom ±150 ms. Uppgiften bockades av på 3 klipp (checkpoint 2) och en fält-fallback-logg. Avvikelsen är öppet dokumenterad i D-3, men `docs/oppna-fragor.md` F1 (rad 28–29) är fortfarande **ÖPPEN**. D-3 krävde att utfallet skrevs dit för att stänga F1-komplexet. Förslag: stäng F1 med hänvisning till cutover-beslutet, eller bocka av D-3 som `[~]`. Det finns heller ingen fält-fallbackstatistik (`path`-loggen) redovisad någonstans.

**D-2 (rad 329) är `[x]` men inleds med "Delvis (Pass 2, del b klar)".** Bockningen och texten säger olika saker. Se också punkt 1 om filerna som saknas.

**BACKLOG-D-5 är `[~]`** ("Kontinuerligt sessionsläge i fångstvägen"). Handoff (2026-08-11) säger att beskärningen och impact-grinden inte är fältverifierade. Det är ingen avvikelse, men E-2 är `[x]` utan fältverifiering. Förslag: acceptanskriteriet "fältverifierad" ska vara explicit.

## 3. Milstolpar vars måldatum passerat utan statusändring

Dagens datum är 2026-10-31. PLAN.md har inga datumsatta milstolpar. De daterade målen finns i ROADMAP.md.

- **2026-07-31 (beslutsfork 1, D-3 fältkörd):** passerat med 3 månader. D-3 är kringgått via cutover, men ROADMAP säger fortfarande att trim-slidern (F-1) byggs om metriken missas. Ingen post för F-1 finns i BACKLOG och ingen beslutsnotering i ROADMAP. Förslag: skriv in utfallet (datum + beslut) i ROADMAP-forken.
- **2026-08-15 (beslutsfork 2, G1-scopefrys / M2-metriken 18/20):** passerat med 2,5 månader. A-3 (röststart) och A-5 (range-validering) är fortfarande `[ ]`. Koden saknar `voiceStartEnabled` och `swingStartTimestamp`. M1 och M2 har alltså inte påbörjats, och ingen frys eller avvikelse är dokumenterad. Nytt G1-arbete har däremot lagts på (UI-1/2, D-4/D-5, E-2).
- **M3 / E-1** (långside-cap 1024 px): fortfarande `[ ]`. Ingen datumgräns, men beslutsfork 3 sa "körs nu, villkorslöst".
- **M5 (Ström B: B-1–B-3, G2:s hårda grind):** alla `[ ]` — ingen rörelse på tre månader. Ingen datumgräns, men roadmapen kallar B "isolerad och startas innan G1 är perfekt". `src/lib/supabase.ts` har fortfarande `user_id: null`.
- **ROADMAP.md rubrikdatum 2026-07-07** och STATUS.md är oförändrade sedan dess, medan BACKLOG/handoff uppdaterats till 2026-10-23.

## Öppna `// OSÄKER:`-markeringar

11 st i `src/lib/` (`videoChunkRing`, `livePoseLoop`, `poseEnvelope`, `poseDetector`, `poseTrajectory`). Inga av dem motsägs av dokumenten. De är inte avprickade mot fältdata.
