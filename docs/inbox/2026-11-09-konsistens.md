# Konsistenskontroll 2026-11-09

Jämfört: BACKLOG, PLAN, ROADMAP, STATUS, handoff, docs/decisions/ mot kod och git-historik (senaste commit 2026-10-23). Endast avvikelser. Inga ändringar gjorda i kanoniska dokument — förslag nedan.

## 1. Dokument som påstår något koden/andra dokument motsäger

**STATUS.md (rad 3–13, "Senast uppdaterad: 2026-07-07").** Säger att "tre isolerade strömmar [A, B, C] är redo att starta" och att pose ligger på "Horisont (ej schemalagt)". Verkligheten: C-1, D-1…D-4, E-2, UI-1/2 och W-1 är klara, D-5 är `[~]`, och pose-envelope är produktionens primära frameselektor (`frameExtractor.ts`, ADR-002 "cutover genomförd"). Ström A/B/C-listan är inte längre "nuvarande fokus". *Förslag:* skriv om "Nuvarande fokus" efter BACKLOG (D-5, A-3, E-1, B) och ta bort pose från Horisont.

**STATUS.md + docs/BACKLOG.md-regel + CLAUDE.md pekar på avsnittet "Kritiskt olöst" i docs/swingcheck-handoff.md** (STATUS rad 10; A-3:s dokumentkrav i BACKLOG). Avsnittet finns inte i handoff (ingen träff på "olöst"). *Förslag:* återinför avsnittet eller ändra pekarna.

**docs/BACKLOG.md rad 5 (prioritetsordning) och ROADMAP.md (daterad 2026-07-07).** Ordningen "A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2" och ROADMAP:s M4 ("pose får två pass till", D-2/D-3 som kommande) är förbi: D-2 och D-3 är `[x]`, och cutover skedde 2026-08-05 utan att M4:s ±150 ms-metrik/beslutsfork 1 dokumenterats som avgjord. *Förslag:* uppdatera ROADMAP med utfall (datum + resultat) enligt filens egen sista rad.

**ROADMAP.md M3 / BACKLOG E-1.** E-1 (långside-cap 1024) står `[ ]`, men `ANALYSIS_FRAME_COUNT` har höjts 20→32 (frameExtractor.ts:68, handoff rad 186) — den motsatta riktningen mot M3:s mål "≥40 % färre tokens". E-2 (beskärning) har delvis tagit över kostnadsrollen i sessionsvägen. *Förslag:* notera i ROADMAP M3 att kostnadsmålet omdefinierats, eller omprioritera E-1.

**docs/swingcheck-handoff.md rad 8 ("Claude Sonnet 4.5")** — stämmer med koden (`claude-sonnet-4-5`, api.ts:146, worker.ts:21), ingen avvikelse; nämns bara för att modell-ID är hårdkodat på två ställen.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**UI-1 och UI-2 (BACKLOG rad 37–106).** Båda `[x]` men "Ej sedd på en iPhone"; UI-2 noterar dessutom att `/` i `npm run dev` ger 500 från miniflare, ej isolerat mot baslinjen. Acceptans (kamera/safe-area på enhet, dev-start) är alltså inte verifierad. *Förslag:* `[~]` tills enhetsverifierat, eller en explicit verifieringsrad.

**Testtal i BACKLOG/handoff (148/148, 149/149, 202/202).** Kunde inte återverifieras i denna körning: `node_modules` saknas i miljön, så `vitest` kördes inte. Siffrorna är oprövade, inte motsagda.

**D-3, D-4 `[x]` / ADR-003 "hela ADR:n är byggd".** ADR-003 själv anger "Obekräftat i fält": perceptuell verifiering av session-multi, face-ons finish, termikmätning och fMP4-fönsterklipp på iPhone. Samtidigt är D-5 `[~]`. "Klar" gäller alltså kod, inte acceptans. *Förslag:* flagga det i D-3/D-4:s rader.

## 3. Milstolpar med passerat måldatum utan statusändring

(PLAN.md innehåller inga milstolpar eller datum — bara två routines med "TBD". Datumen finns i ROADMAP.md.)

- **2026-07-31 — D-3 fältkörd, annars manuell trim-slider (ROADMAP beslutsfork 1).** Passerat med 101 dagar. D-3 är `[x]` men ±150 ms/80 %-metriken på 20 klipp finns inte rapporterad, och ingen trim-slider-uppgift finns. Beslutet är varken taget eller loggat.
- **2026-08-15 — G1-scopefrys vid M2-metriken (18/20 svingar hands-free).** Passerat med 86 dagar. A-3, A-5 och C-2 är fortfarande `[ ]`; M2-metriken har inte mätts, och G1-funktionalitet har ändå tillkommit efter datumet (UI-2, S-48, kluster/budget 32). Frysen följdes inte och avgjordes inte.
- **PLAN.md routines 1–2 "TBD"** — ingen beskrivning trots att routines körs (denna är en av dem).
