# Konsistenskontroll 2026-11-13

Automatisk körning. Jämför BACKLOG, PLAN, ROADMAP, STATUS, handoff och `docs/decisions/` mot
`main` @ `c9da692`. Testläget: `vitest` 206/206 gröna, `tsc -b` rent, `eslint` 28 problem (20 fel,
8 varningar), vilket är samma baslinje som UI-2 anger. Inga ändringar är gjorda. Nedan står bara
avvikelser, med ett förslag per fynd.

## 1. Dokument som påstår något koden motsäger

**STATUS.md är fyra månader inaktuell.** Filen är senast uppdaterad 2026-07-07. Den säger att fokus
är "tre isolerade strömmar redo att starta" (A/B/C), att den rörelsebaserade detekteringen är den
overifierade huvudvägen och att pose-estimering ligger på horisonten "som fallback". I koden är det
tvärtom: pose/envelope är den primära selektorn och pixel-diff är fallback (`src/lib/frameExtractor.ts`,
D-3 2026-08-05). Ström D, UI, E-2, W-1 och S-48 är gjorda men nämns inte.
*Förslag:* skriv om *Nuvarande fokus* och *Horisont* från BACKLOG och handoffen och stryk
pose-som-horisont.

**`package-lock.json` matchar inte `package.json`, och `npm ci` fallerar.** Felet är
`Missing: @fontsource/outfit@5.3.0 from lock file`. Beroendet lades till i `61a0b46` (UI-1), men
låsfilen ändrades inte i den commiten. Den senaste ändringen av låsfilen är `c8e633a`. UI-1 och
handoffen säger "Outfit (självhostat + precachat)" och "Verifierat: npm run build". Det stämmer bara
på en maskin där paketet redan råkar ligga installerat. En ren CI- eller Vercel-installation som kör
`npm ci` går sönder.
*Förslag:* kör `npm install` och committa den uppdaterade `package-lock.json`.

**Handoffen säger "Supabase-spegling", men Supabase är hårdkodat avstängt.** Under *Fungerar* står
"Historik i IndexedDB + valfri Supabase-spegling av metadata". Under *Öppna trådar* står att RLS
"faller tyst tillbaka till IndexedDB". Men `src/lib/supabase.ts:22` har `SUPABASE_DISABLED = true`
(BACKLOG B-1, 2026-08-09), så Supabase anropas aldrig, oavsett env. KONTEXT.md:29 och :67 beskriver
samma valfria spegling som aktiv.
*Förslag:* i handoffen och KONTEXT, ange att Supabase är avstängt i kod tills B-1/B-2 och peka på
flaggan.

**Handoffens miljövariabeltabell anger fel default för `MAX_TOKENS`.** Tabellen säger "Default 2000".
Koden har `DEFAULT_MAX_TOKENS = 4096` (`worker/worker.ts:23`), och `worker/wrangler.toml:33` sätter
också 4096. Säkerhetsmodellen i handoffen säger dessutom "quick mode skickar 600". Det har inte
stämt sedan S-48, eftersom `maxTokensFor` i `src/lib/api.ts:34` nu skalar med antalet regler.
*Förslag:* sätt tabellen till 4096 och skriv om meningen om quick mode till `maxTokensFor`.

**W-1 och handoffen beskriver `ALLOWED_ORIGINS` som ogjort, men värdet är satt.** BACKLOG W-1
*"Kvar för Erik: sätt `ALLOWED_ORIGINS` till prod-origin"* och handoffens tabell ("Osatt → … prod
403:ar") beskriver läget som ogjort. Commit `619e586` (2026-08-11) satte
`https://swing-check-henna.vercel.app/` i `worker/wrangler.toml:25`. Det avslutande snedstrecket är
ofarligt, eftersom `worker.ts:107` och `:116` tål det.
*Förslag:* notera i handoffen att värdet är satt, och att D1-migrationen och deploy-bekräftelsen är
det som återstår.

**ROADMAP säger att arkitekturreviewn saknas, men filen finns.** Källnoten i `docs/ROADMAP.md`
säger att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md` "finns inte i repot". Filen finns, och både
BACKLOG Ström W och handoffen länkar till den (R2).
*Förslag:* reconcila ROADMAP:s *Beslutsforkar* mot reviewn, som noten själv föreskriver, och stryk
noten. Det är Eriks sak, eftersom agenten inte får redigera ROADMAP.

**CLAUDE.md:s parallellitetsregel motsägs av koden.** Regeln lyder "Rör inte
`frameExtractor`/`useFrameExtractor` förrän Ström A är klar". Ström A är inte klar (A-3 till A-5 är
öppna), men D-3 gjorde `frameExtractor.ts` till pose-primär, och `ANALYSIS_FRAME_COUNT` har ändrats
där två gånger (20, sedan 32). `docs/pose-detection.md:11` stryker regeln explicit ("GÄLLDE tills
D-3"), men CLAUDE.md och BACKLOG:s *Parallellitet* gör det inte. A-3-prompten och E-1:s konfliktzon
bygger fortfarande på regeln.
*Förslag:* uppdatera regeln i CLAUDE.md, så att den speglar att `frameExtractor.ts` nu ägs
gemensamt av D och A/E.

**E-1:s utgångsläge är inaktuellt.** E-1 och ROADMAP M3 räknar med "~1 800 tokens/frame × 10".
Koden skickar 32 frames (`frameExtractor.ts:68`). Width-cappen 1280 finns kvar (`:133`), så
kärnan i uppgiften gäller fortfarande. Kostnadsmålet (≥ 40 %) och baslinjen är däremot räknade på
ett läge som inte längre finns.
*Förslag:* räkna om E-1:s baslinje mot 32 frames i klipp-vägen innan uppgiften startas. Det är
Eriks sak, eftersom agenten inte får redigera BACKLOG.

**Handoffen säger att Pass 3 pågår, BACKLOG säger att det är klart.** Handoffen har rubriken
"Pass 3 — pågående (kod committad `cbade28`, ej fältverifierad)" under D-5. BACKLOG D-5 säger
"Pass 3 KLAR (2026-08-08)". Båda är överens om att fältverifiering saknas, så skillnaden ligger
bara i etiketten.
*Förslag:* sätt handoffen till "klar (kod), ej fältverifierad".

**`weightedHands` finns i tre kopior, inte två.** BACKLOG D-4 *Kvar* säger att `poseEnvelope.ts`
och `poseSegments.ts` har "var sin teckenidentiska `weightedHands`". Det finns en tredje kopia i
`src/lib/livePoseLoop.ts:402`, och inget test låser någon av de tre till de andra.
*Förslag:* ta med `livePoseLoop.ts` i den kvarvarande sammanslagningsuppgiften.

**Öppen fråga F3 är redan löst.** `docs/oppna-fragor.md` F3 säger "README är fortfarande
Vite-mallen". `README.md` har en riktig projektbeskrivning.
*Förslag:* stäng F3.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**D-3 är bockad, men dokumentkravet att stänga F1 är inte gjort.** D-3 är `[x]` och kräver att
"Utfallet skrivs in i ROADMAP (beslutsfork 1) + `docs/oppna-fragor.md` (stänger F1-komplexet)".
F1 står kvar som **ÖPPEN** och beskriver fortfarande pixel-diff som huvudvägen. ROADMAP:s
beslutsfork 1 saknar utfall, trots att filen själv kräver "datum + utfall" när en fork avgörs.
Avvikelsen från 20-klippsmetriken är ärligt redovisad i BACKLOG, men den har inte förts vidare.
*Förslag:* stäng F1 i oppna-fragor med D-3:s utfall, och låt Erik skriva in forkens utfall i
ROADMAP.

**D-2 är bockad, men offline-acceptansen är aldrig visad.** Kriteriet lyder "pose körs helt utan
nätverk efter första laddning (noll jsDelivr-requests)". Uppgiftstexten själv säger "ej
browser-/offline-fältverifierad". Handoffens "Fältverifierad på iPhone" gäller GPU/fps, inte
offline. Kriteriet "posePhases ger fyra timestamps; markörer i preview" ersattes av envelope-vägen,
och `posePhases.ts` finns inte längre. Det är dokumenterat, men acceptanstexten är inte omskriven.
*Förslag:* lägg till en uttrycklig offline-kontroll (flygplansläge efter första laddning) i C-2:s
iOS-checklista, eller markera D-2 `[~]` för offline-punkten.

**W-1 och S-48 är bockade, men deras acceptans kräver en prod-deploy som inte går att se från
repot.** W-1 kräver "`cache_read_input_tokens` fortfarande > 0 i prod" och
`wrangler d1 migrations apply --remote`. S-48 kräver `wrangler deploy` för att taket 4096 ska
gälla. Båda säger det själva. Inget i repot eller git-historiken visar att någon deploy är gjord.
*Förslag:* bekräfta deployen och skriv in datumet i handoffens *Öppna trådar*, eller stryk punkten
därifrån när den är klar.

**UI-1 och UI-2 anger verifierade byggen, men en ren installation fallerar.** Se låsfilsfyndet ovan:
`npm run build` i en ren klon kräver `npm install`, inte `npm ci`. Fler acceptanskriterier är inte
verifierbara här ("Ej sedd på en iPhone" står uttryckligen).

## 3. Milstolpar i PLAN.md vars måldatum passerat

`docs/PLAN.md` innehåller inga milstolpar eller måldatum, bara två routine-platshållare markerade
"TBD". Det finns därför inget att rapportera i den här kategorin. Den här rutinen är en av de två,
så platshållarna kan också fyllas i.

**Utanför scope, men nära.** De daterade beslutsforkarna ligger i `docs/ROADMAP.md`, inte i PLAN.
Fork 1 ("D-3 fältkörd senast 2026-07-31") och fork 2 (G1-scopefrys "senast 2026-08-15") har båda
passerat utan att utfallet skrivits in. Efter 2026-08-15 har ny G1-funktionalitet landat, bland
annat UI-2, vidvinkel, impact-grind och S-48, medan M5/Ström B inte är påbörjad. Antingen gäller
inte frysen, eller så har den brutits. Detta bör beslutas och skrivas in.
