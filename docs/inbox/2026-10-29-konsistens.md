# Konsistenskontroll 2026-10-29

Automatisk avstämning av BACKLOG, PLAN, ROADMAP, STATUS, handoff och `docs/decisions/` mot repot (HEAD `c9da692`, senaste commit 2026-10-23). Endast avvikelser. Inga dokument ändrade — varje fynd har ett förslag.

> **Begränsning:** `npm ci` misslyckades i routine-miljön, så `npm test` och `tsc -b` kunde inte köras. Testpåståenden nedan är därför inte omprövade, bara jämförda sinsemellan.

## 1. Dokument som påstår något koden (eller andra dokument) motsäger

**STATUS.md (hela filen, "Senast uppdaterad: 2026-07-07").** Säger att "tre isolerade strömmar [A, B, C] är redo att starta" och att pose är "Horisont (ej schemalagt)… som fallback". Verkligheten: C-1 klar; Ström D klar och mergad med pose/envelope som **primär** frame-väg och pixel-diff som fallback (`frameExtractor.ts` `selectViaPose`; BACKLOG D-3; handoff "Fungerar"); Ström E/UI/W har tillkommit. "Rörelsebaserad svingdetektering … inte verifierad på riktiga klipp" stämmer inte heller mot handoff ("Fältverifierad på iPhone"). *Förslag:* skriv om STATUS.md till en kort nulägesorientering eller ta bort den och låt BACKLOG/handoff vara enda källor.

**docs/oppna-fragor.md F1 (rad 28–31).** Status "ÖPPEN", "pose är nästa steg" — pose är sedan 2026-08-05 produktionens primära selektor (BACKLOG D-3 säger att den ska stänga F1-komplexet, vilket inte skett). *Förslag:* stäng F1 med hänvisning till D-3/ADR-002, eller formulera om till den verkliga öppna frågan (fallback-frekvensen `path:'motion'` i fält).

**docs/ROADMAP.md (datum 2026-07-07) är i flera avsnitt motsagd av repot:**
- *Källnoten* säger att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` "inte finns i repot". Filen finns, och handoff länkar till den.
- *Reconciliation* punkt 1 och M4 beskriver pose som "G2-tillgång" och röstankaret (A-3) som G1-fångstens bärande del. Koden gör tvärtom: pose/envelope är G1-fångstens primära väg, A-3 är inte gjort, och handoff/ADR-003 omdefinierar röst till sessionskontroll.
- *Paste-ready-prompt 3 (D-2)* och M4 beskriver `lib/posePhases.ts` och fasdetektion som nästa steg. BACKLOG D-2 är `[x]`, men `src/lib/posePhases.ts` och `poseFrameSelection.ts` finns inte längre (ADR-002 ersatte den fas-viktade vägen). Prompt 1 (A-3) och 2 (E-1) är fortfarande öppna uppgifter; prompt 3 är föråldrad.
- Roadmappen nämner "D-1 pass 1 på stream-d"; D-1…D-4 är klara.
*Förslag:* uppdatera ROADMAP (datum + utfall per beslutsfork) — filen säger själv att den ska uppdateras när en fork avgörs.

**docs/BACKLOG.md rad 315 vs D-3 (rad 505–527).** Ström D-ingressen säger att pose är "primärt en G2-tillgång" och att G1-fångsten ankras på rösttriggern; D-3-blocket säger att pose är produktionens primära väg. Samma ingress säger att D-3 ska fältköras senast 2026-07-31, medan D-3 är avbockad utan den utvärderingen. *Förslag:* synka ingressen med D-3-utfallet.

**CLAUDE.md vs repots struktur.** CLAUDE.md pekar på `docs/adr/` för arkitekturbeslut; ADR-002 och ADR-003 ligger i `docs/decisions/` (ADR-0001 i `docs/adr/`). `ADR-003-draft.md` heter "UTKAST" men statusraden säger att hela ADR:n är byggd. *Förslag:* flytta/döp om eller lägg pekare i CLAUDE.md.

**docs/swingcheck-handoff.md, Öppna trådar.** "Namnkrock: branchen `stream-e`" — inga andra branches än `main` finns på origin, så noten är obsolet eller inte verifierbar. Testantal i handoff (187/187) vs BACKLOG UI-2 (202/202, senare datum) — handoff inte uppdaterad.

**docs/PLAN.md.** Beskriver "två nattliga routines" som `TBD`; denna routine är minst en av dem. `docs/gtm/` som regeln i uppgiften och inbox-README nämner finns inte i repot. *Förslag:* fyll i routinebeskrivningen eller bekräfta att gtm-mappen är planerad.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

- **D-2 `[x]`** (BACKLOG rad 329, acceptans rad 501): kräver "posePhases ger fyra timestamps", "markörer i preview" och enhetstest på platå-/vändpunktslogik. Modulen finns inte i `src/lib/`; själva blocket börjar med "Delvis (Pass 2, del b klar)". Offline-delen (`poseDetector.ts` rad 9, `pose:assets`) stöds av koden; fasdelen kan inte verifieras mot nuvarande kod.
- **D-3 `[x]`** (rad 505): acceptansen (≥ 80 % av 20 klipp inom ±150 ms, utfall skrivet i ROADMAP + oppna-fragor) är inte uppfylld — blocket erkänner själv avvikelsen (3 klipp). Kriteriet är ersatt, inte uppnått; ROADMAP/oppna-fragor är inte uppdaterade. *Förslag:* byt kriterium formellt i BACKLOG eller markera `[~]`.
- **UI-1 / UI-2 `[x]`**: båda anger "Ej sedd på en iPhone"; UI-2 noterar att `/` i `npm run dev` svarar 500 (miniflare) och att det inte är isolerat mot baslinjen. Byggt och lintat enligt egen uppgift, men visuell/enhetsacceptans saknas. *Förslag:* `[~]` tills enhetskontroll.
- **E-2 `[x]`**: handoff säger själv att beskärningen "ej är fältverifierad efter borttaget aspektlås".
- **S-48 `[x]`**: handoff (Öppna trådar) säger att taket 4096 inte gäller i produktion förrän `wrangler deploy` körts; `wrangler.toml` har 4096 men deployen kan inte verifieras härifrån.
- **Testpåståenden** (148/148, 164/164, 187/187, 202/202) kunde inte omprövas (se begränsning ovan).

## 3. Milstolpar vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller datum. Datumen bor i ROADMAP/BACKLOG; idag är 2026-10-29:

- **2026-07-31** — D-3 fältkörd, annars trim-slider (F-1) och pose degraderas (ROADMAP beslutsfork 1; BACKLOG rad 315/527). Passerat ~3 mån; ingen F-1 finns i BACKLOG och ingen dokumenterad fork-utgång (D-3 avbockad via ersättningskriterium).
- **2026-08-15** — G1-scopefrys vid M2-metriken 18/20 (beslutsfork 2). Passerat ~2,5 mån. M2:s beroenden är fortfarande öppna: A-5 `[ ]`, C-2 `[ ]`, A-3 `[ ]` (M1), ingen 18/20-mätning dokumenterad — samtidigt har mycket ny G1-funktionalitet byggts efter datumet (D-5, E-2, UI-2, bildrutebudget, impact-grind). Frysbeslutet är varken fattat eller upphävt.
- **M1, M2, M5 (B-1…B-3), M6 (G2-1/2)** har inga datum men ROADMAP daterad 2026-07-07 anger ordningen M1→M5; B-1…B-3 är orörda `[ ]` efter ~16 veckor och handoff noterar att RLS saknar policies. *Förslag:* beslut från Erik om frysen (2026-08-15) och Ström B:s prioritet, därefter uppdatera ROADMAP.
