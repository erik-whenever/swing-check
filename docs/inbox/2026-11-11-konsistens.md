# Konsistenskontroll 2026-11-11

Automatisk körning mot `main` @ `c9da692` (2026-10-23). `npx vitest run`: **206/206 gröna**
(17 filer). Endast avvikelser listas. Förslagen är bara förslag; inget kanoniskt dokument är ändrat.

## 1. Dokument som påstår något som koden motsäger

**1.1 Workerns `MAX_TOKENS`-default och "quick mode skickar 600"**
(`docs/swingcheck-handoff.md`, miljövariabeltabellen och *Säkerhetsmodell* punkt 3).
Handoff anger "Default 2000" och "quick mode skickar 600". Koden: `worker/worker.ts:23`
`DEFAULT_MAX_TOKENS = 4096`, och `src/lib/api.ts:34` `maxTokensFor()` skalar efter antalet regler
(S-48), så det fasta 600-taket finns inte längre. *Förslag:* ändra tabellraden till "Default 4096" och
byt 600-exemplet mot `maxTokensFor` (quick `200+120·n`).

**1.2 Supabase beskrivs som fungerande men är hårdavstängd**
(`docs/swingcheck-handoff.md` → *Tech stack* "Supabase valfri metadataspegling", *Fungerar* "valfri
Supabase-spegling av metadata", miljövariabeltabellen "Cross-device-historik"). Koden:
`src/lib/supabase.ts:22` `SUPABASE_DISABLED = true`. Speglingen sker alltså aldrig, oavsett env.
BACKLOG nämner avstängningen (rad ~231), men handoff gör det inte. *Förslag:* flytta raden från
*Fungerar* till *Öppna trådar* och skriv "avstängd via `SUPABASE_DISABLED` sedan 2026-08-09".

**1.3 `npm ci` fallerar eftersom lockfilen är osynkad**
(`package.json:20` mot `package-lock.json`). `@fontsource/outfit@^5.3.0` finns i `package.json` men
saknas i lockfilen, så `npm ci` avbryts med `EUSAGE`. UI-1 i BACKLOG och handoff påstår att Outfit är
självhostat och att bygget är verifierat, men en ren installation går inte att reproducera. Det gäller
också CI och deploy som kör `npm ci`. *Förslag:* kör `npm install`, committa `package-lock.json` och
gör det som en egen fix-commit.

**1.4 STATUS.md beskriver läget i juli** (`STATUS.md`, senast uppdaterad 2026-07-07).
Filen säger att tre strömmar är "redo att starta", att den rörelsebaserade detekteringen är det olösta
huvudspåret och att pose är en framtida "fallback". Koden: pose-envelopen är primär selektor
(`frameExtractor.ts` → `selectViaPose`, D-3), pixel-diff är fallback, och D-5, E-2, W-1, UI-1/2 och
S-48 är gjorda. *Förslag:* skriv om *Nuvarande fokus* och *Horisont* utifrån BACKLOG, eller låt filen
bara peka dit.

**1.5 ROADMAP:s källnot säger att arkitekturreviewen saknas**
(`docs/ROADMAP.md`, källnoten högst upp). Där står att `docs/reviews/ARCHITECTURE_REVIEW_2026-07.md`
"finns inte i repot". Filen finns nu och används av W-1. *Förslag:* stryk noten eller reconcila
reviewen mot *Beslutsforkar*, som noten själv föreslår.

**1.6 Siffrorna i ROADMAP M3 och E-1 gäller inte längre**
(`docs/ROADMAP.md` M3 och `docs/BACKLOG.md` E-1). Båda bygger på 10 bilder per sving. Koden:
`src/lib/frameExtractor.ts:68` `ANALYSIS_FRAME_COUNT = 32`, och bredden cappas fortfarande till 1280
(`frameExtractor.ts:133`). Handoff skriver "E-1 (långside-cap) står kvar", vilket kan läsas som att den
är byggd, men den är obyggd. *Förslag:* räkna om E-1:s tokenpremiss för 32 bilder och skriv "E-1 ej
påbörjad" i handoff.

**1.7 F1 och F3 i oppna-fragor.md står som ÖPPNA**
(`docs/oppna-fragor.md`). Enligt F1 är nästa steg pose om motion missar. Pose är dock redan primär och
fältverifierad (D-3), och D-3:s spec säger att utfallet ska stänga F1-komplexet där. Enligt F3 är
README "fortfarande Vite-mallen", men `README.md` har en riktig projektbeskrivning.
*Förslag:* stäng F3, och stäng eller omformulera F1 till "räcker pose-envelopen?".

**1.8 W-1 listar ALLOWED_ORIGINS som kvar, men den är satt**
(`docs/BACKLOG.md` W-1 "Kvar för Erik: sätt `ALLOWED_ORIGINS`"). `worker/wrangler.toml:25` har
prod-origin sedan `619e586`. *Förslag:* stryk den punkten. D1-migrationen och verifieringen efter
deploy står kvar.

**1.9 Fjärrloggningen för native-byggen är odokumenterad** (`b3e217f`, `src/lib/logger.ts`,
`worker/worker.ts:72`). Commiten lägger till batchad fjärrloggning för "native builds" och en
native-origin-gren i Workern. Varken BACKLOG, handoff eller ROADMAP nämner något native-bygge.
*Förslag:* lägg in en BACKLOG-rad eller en handoff-notis om vad som byggts och varför.

## 2. Uppgifter markerade klara vars acceptanskriterier inte går att verifiera

**2.1 D-2 är `[x]` men inleds med "Delvis"** (`docs/BACKLOG.md` D-2). Acceptansen kräver "pose helt
utan nätverk efter första laddning". Pass (a) säger själv "ej browser-/offline-fältverifierad".
Rubriken och statusen säger emot varandra. *Förslag:* `[~]` tills offline är bekräftat, eller en rad
om att offline-testet ersattes.

**2.2 D-3 är `[x]` utan den acceptansmetrik som krävdes** (`docs/BACKLOG.md` D-3). Metriken var
≥ 80 % av 20 klipp inom ±150 ms. Avvikelsen är ärligt dokumenterad, men ersättningssignalen
(`path`-fallbackfrekvens i fält) har inget rapporterat utfall någonstans. *Förslag:* skriv in den
uppmätta pose/motion-fallbackfrekvensen eller markera "väntar på fältdata".

**2.3 W-1 och S-48 är `[x]` men kräver en deploy som inte är bekräftad** (`docs/BACKLOG.md` W-1,
S-48; handoff *Öppna trådar*). W-1:s acceptans kräver "appen oförändrad i prod med
`cache_read_input_tokens` > 0". S-48:s tak på 4096 gäller först efter `wrangler deploy`. Ingenstans
står att någon av dem är deployad. *Förslag:* en rad "deployad YYYY-MM-DD" eller `[~]`.

**2.4 A-1, A-2 och C-1 har acceptanskrav på enhet som aldrig uppfyllts** (`docs/BACKLOG.md`).
- A-1 kräver "Fungerar i iOS standalone PWA efter en tap", men BACKLOG skriver "ej enhetsverifierad på iOS".
- A-2 kräver "triggar < 300 ms", men det står "ej fältverifierad".
- C-1 kräver "inga Lighthouse-varningar", men ingen Lighthouse-körning finns noterad.

*Förslag:* notera vilka krav som flyttats till A-5 respektive C-2, så att `[x]` inte ser ut att täcka
dem.

## 3. Milstolpar vars måldatum passerat utan statusändring

`docs/PLAN.md` innehåller inga milstolpar eller måldatum, så där finns inga fynd. Två daterade
beslutstriggers finns däremot i `docs/ROADMAP.md`:

**3.1 Beslutsfork 1, deadline 2026-07-31** (`docs/ROADMAP.md` → *Beslutsforkar* 1, M4). Utfallet blev
cutover utan metrik (D-3, 2026-08-05), men ROADMAP säger fortfarande att trim-slidern byggs om D-3
inte är fältkörd till 2026-07-31. Filen säger själv "uppdatera när en beslutsfork avgörs". *Förslag:*
skriv in datum och utfall under fork 1 och M4.

**3.2 G1-scopefrys senast 2026-08-15** (`docs/ROADMAP.md` → *Beslutsforkar* 2, M2). Datumet har
passerat. Ingen frys-bedömning finns noterad, och M2:s mål 18/20 har inget uppmätt värde. Arbete på
G1-funktionalitet har fortsatt efteråt (S-45/S-48 i oktober). *Förslag:* skriv in om frysen
genomfördes, sköts upp eller släpptes, och varför.
