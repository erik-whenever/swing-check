# Konsistenskontroll 2026-11-07

Jämförelse av BACKLOG, PLAN, ROADMAP, STATUS, handoff och docs/decisions mot kod och git-historik (HEAD `c9da692`). Endast avvikelser. Inga ändringar gjorda; förslag anges per fynd.

**Begränsning:** `npm ci` misslyckades i routine-miljön (inget nätverk mot registret), så testsviten kunde inte köras. Inga testresultat ligger till grund för fynden nedan.

## 1. Dokument som påstår något koden/BACKLOG motsäger

**STATUS.md (rad 3 och 6–13).** Säger "Senast uppdaterad: 2026-07-07" och att tre isolerade strömmar A/B/C är "redo att starta". Verkligheten enligt BACKLOG: C-1 klar, ström D (D-1–D-4) klar och D-5 `[~]`, ström UI, E-2, S-48 och W-1 klara; A-3 och hela ström B är fortfarande ej påbörjade. Filen nämner inte D/UI/E/W alls. Under "Horisont" står pose-estimering som framtida fallback, men `frameExtractor.ts` använder pose/envelope som primär väg sedan D-3 (BACKLOG rad 505, ADR-002). *Förslag:* skriv om "Nuvarande fokus" mot BACKLOG, flytta pose ur Horisont.

**docs/ROADMAP.md (M4, rad "CC-pass: D-2, D-3" och Reconciliation punkt 1).** Roadmapen definierar D-3 som "utvärdering + beslut" (20-klipps-testset, ±150 ms-metrik, beslutsfork 1). BACKLOG:s D-3 är i stället "Cutover: envelope som primär frame-selektor" (klar 2026-08-05). Ingenting i repot visar att ±150 ms/≥80 %-metriken mätts eller att fork 1 avgjorts. Roadmapen beskriver även D som "D-1 pass 1 på `stream-d`" och pose som G2-tillgång, medan koden gör pose till G1:s primära väg. *Förslag:* notera i ROADMAP att D-3 bytte innehåll, och antingen ta fram metriken eller skriva att cutover ersatte den.

**docs/BACKLOG.md (rad 5, prioritetsordning).** "Ordning: A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2". D-2/D-3/D-4 är klara medan A-3, A-5, C-2, E-1 inte är det, så ordningen speglar inte det som exekverats. *Förslag:* uppdatera ordningsraden (kräver Eriks beslut, filen är skyddad för routinen).

**docs/swingcheck-handoff.md (rad 206–210) vs docs/decisions/ADR-003-draft.md.** Handoff säger att A-3 är "nästa" och att voice-start är energi-trigger per sving, med notering om att ADR-003 omdefinierar röst till sessionskontroll. ADR-003 deklarerar "hela ADR:n är byggd", men ingen sessionsröststyrning finns i koden (`voiceStartEnabled` och `swingStartTimestamp` saknas helt under `src/`; `user_id` finns bara som `null` i `src/lib/supabase.ts:59`). Status i ADR:n och i handoff är inte i fas. *Förslag:* förtydliga i ADR-003 att röststyrningen (A-3) inte ingår i det som byggts.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

Inga konkreta avvikelser hittades, men notera: eftersom testerna inte kunde köras (se ovan) är D-2:s "pose helt utan nätverk", D-3:s cutover och E-2/S-48 inte verifierade av denna körning. Fältkriterier (offline, iPhone-GPU) förutsätter Eriks manuella test. Handoff rad ~"Fältverifierad på iPhone: GPU-delegat, 14,9 fps" är det enda dokumenterade fältbeviset.

## 3. Milstolpar vars måldatum passerat utan statusändring

PLAN.md innehåller inga milstolpar (bara två routines som är "TBD"). Datumen finns i ROADMAP.md, som inte uppdaterats sedan 2026-07-07 (idag 2026-11-07):

- **2026-07-31** (beslutsfork 1): D-3-metriken ska vara fältkörd, annars byggs manuell trim-slider. Datumet passerat med 99 dagar; ingen trim-slider i koden, ingen metrik dokumenterad, ingen notering om utfall. *Förslag:* avgör fork 1 och skriv datum + utfall i ROADMAP.
- **2026-08-15** (beslutsfork 2, G1-scopefrys / M2-metrik 18/20): passerat med 84 dagar. A-5 och C-2 är fortfarande `[ ]` i BACKLOG, ingen M2-mätning dokumenterad, men G1-funktionalitet (D-4, D-5, UI-2, E-2) har tillkommit efter datumet. *Förslag:* dokumentera om frysen gäller eller upphävdes.
- **M1 (A-3), M3 (E-1), M5 (B-1–B-3), M6 (G2-1/2)** är alla fortfarande `[ ]`; M1 och M3 betecknades som högst värde-per-risk/riskfria i ROADMAP men är orörda medan senare strömmar byggts. Ingen datumsatt, men värt att Erik bekräftar prioriteringen.
- **PLAN.md:** Routine 1 och 2 står kvar som "TBD" trots att nattliga routines körs (denna är en av dem).
