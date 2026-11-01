# Konsistenskontroll 2026-11-01

Automatisk jämförelse av BACKLOG, PLAN, ROADMAP, STATUS, handoff och docs/decisions mot repot (HEAD c9da692). Inga dokument ändrade; förslag nedan. **Begränsning:** `npm ci` misslyckades i körmiljön (beroenden saknas), så testsviten kunde inte köras — se kategori 2.

## 1. Dokument som påstår något koden motsäger

**STATUS.md (rad 3, 6–12) — föråldrad "nuvarande fokus".** Säger "Tre isolerade strömmar redo att starta" (A, B, C), senast uppdaterad 2026-07-07. BACKLOG/koden: C-1, A-1, A-2, hela Ström D (D-1…D-4, D-5 `[~]`), UI-1/2, E-2, W-1, S-48 är gjorda; B-1…B-3, A-3…A-5, C-2, E-1 är obockade. Förslag: skriv om "Nuvarande fokus" eller ersätt med enbart pekare till BACKLOG.

**STATUS.md (rad 14, 17) — rörelsemetoden "implementerad men ej verifierad" / pose som framtida "fallback".** Handoff.md ("Fungerar") och `src/lib/frameExtractor.ts` (`selectViaPose` primär, `selectViaMotion` fallback) visar motsatsen: pose är primär sedan D-3-cutover (2026-08-05), fältverifierad på iPhone. Förslag: rätta eller ta bort raden.

**ROADMAP.md (M4, prompt 3, beslutsfork 1) vs BACKLOG.md D-2/D-3.** ROADMAP definierar D-3 som "utvärdering + beslut" (±150 ms på 20 klipp); BACKLOG:s D-3 är `[x]` "Cutover: envelope som primär frame-selektor" (rad 505) och ROADMAP nämner varken cutover eller `posePhases`-spåret som det blev. BACKLOG rad 315 hänvisar fortfarande till ROADMAP:s D-3-definition. Förslag: notera i ROADMAP vilket D-3 som gäller, eller döp om.

**CLAUDE.md ("Rör inte `frameExtractor`… förrän Ström A är klar") vs historik.** A-3–A-5 är obockade men `src/lib/frameExtractor.ts` har ändrats flera gånger (senast b3b5097, 23f4f23, 7f33cfb). Likaså BACKLOG E-1 rad ~964 ("vänta tills A-3 är mergad"). Förslag: bekräfta att regeln ersatts (Ström D) och uppdatera CLAUDE.md.

**ROADMAP.md rad 5–7 (källnot) — "ARCHITECTURE_REVIEW_2026-07.md finns inte i repot".** Filen finns nu: `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md`. Förslag: ta bort noten / reconcila enligt den egna uppmaningen.

**docs/PLAN.md — "Routine 1/Routine 2: TBD".** Beskrivningarna saknas fortfarande; dokumentet innehåller inga milstolpar (se kategori 3). Förslag: fyll i, eller peka på ROADMAP.

## 2. Klara uppgifter vars acceptanskriterier inte går att verifiera

**Alla `[x]`-uppgifter med testkrav (t.ex. D-2, D-3, D-4, E-2, S-48, W-1).** Testsviten kunde inte köras i denna körning (`vitest` → `ERR_MODULE_NOT_FOUND: vite`, `npm ci` föll). Påståenden om "N/N tester gröna" i BACKLOG/handoff är därför overifierade här. Förslag: kör routinen i en miljö med nätverk för `npm ci`, eller lägg install i setup-skriptet.

**Fältkrav markerade klara/byggda utan fältbekräftelse.** ADR-003 (rad 3–9) säger själv "Obekräftat i fält": Eriks perceptuella verifiering av session-multis tre svingar, face-ons finish (4,70), termikmätning och fMP4-fönsterklipp på iPhone. D-4 är `[x]` och D-5 `[~]` utan att detta syns i BACKLOG-rubrikerna. Förslag: lägg "fältverifiering kvar" som rad under D-4/D-5.

## 3. Milstolpar med passerat måldatum utan statusändring

(PLAN.md har inga daterade milstolpar; datumen finns i ROADMAP.md.)

**ROADMAP.md beslutsfork 1 — D-3 fältkörd senast 2026-07-31.** Datumet är passerat (+3 mån). Ingen dokumenterad fältkörning med ±150 ms-metriken (≥ 80 % av 20 klipp) och ingen registrerad utlösning av trim-slider-fallbacken (ingen sådan komponent finns i `src/`). ROADMAP:s egen instruktion ("uppdatera när en beslutsfork avgörs") ej följd.

**ROADMAP.md beslutsfork 2 / M2 — G1-scopefrys senast 2026-08-15.** Passerat (+2,5 mån). A-3, A-5 och C-2 är fortfarande `[ ]` och M2-metriken (18/20 hands-free) saknar resultat; samtidigt har mycket G1-/UI-arbete tillkommit efter datumet (UI-1/2, E-2, D-5). Förslag: avgör fork 2 uttryckligen (frys passerad eller flytta datum).

**ROADMAP.md M1/M3/M5/M6 — inga måldatum, men ordningen A-3 → E-1 → B bryts.** M5/M6 (B-1…B-3, G2-1/2) orörda trots att fork 2 sa att all kapacitet skulle dit efter 2026-08-15. ROADMAP senast ändrad 2026-08-02; handoff 2026-10-23.
