# ADR-004 (UTKAST) — Onboarding-diagnos: från regelutvärdering till regelrekommendation

- **Status:** **UTKAST — inget är byggt, inget är beslutat.** Beslutsunderlag för Ström F.
- **Datum:** 2026-08-12
- **Ström:** F (ny) — onboarding-diagnos + regelrekommendation
- **Bygger på:** [ADR-002](ADR-002-stream-d-envelope-inversion.md) (envelope som primär
  selektor), [ADR-003](ADR-003-draft.md) (segmentering, tysta fel, min-kräver-max),
  [oppna-fragor.md](../oppna-fragor.md) B3 (lokalt först; Supabase är valfritt).
- **Rör vid två redan planerade saker:** ROADMAP beslutsfork 1:s *manuella trim-slider*
  (byggs här, se §2) och UI-2:s kvarvarande punkt *"tabbaren till 4 flikar"* (ersätts av
  §5:s trefliksförslag).

> **Läsanvisning.** Varje påstående om dagens kod är märkt **[V]** (verifierat genom
> läsning av filen som anges) eller **[A]** (antagande — ej verifierat, ofta ej
> verifierbart utan fältdata). En samlad lista ligger sist, i *Antaganden*.

---

## Kontext

Förstagångsflödet i dag **[V]** (`src/components/Onboarding/OnboardingWizard.tsx`,
`src/store/onboarding.ts`, `src/App.tsx:126`):

- Fem statiska informationsskärmar (välkomst, vinkel, kameraplacering, regler,
  inspelning). Ingen interaktion utom nästa/tillbaka/hoppa över.
- `useOnboardingStore` bär exakt en bit: `completed: boolean`, persisterad som
  `swingcheck-onboarding`.
- När guiden stängs står användaren i en tom app: `useRulesStore.rules` initieras till
  `[]` **[V]** (`src/store/rules.ts:21`), så `HomeView` visar "0 aktiva regler" och en
  analys utan regler har ingenting att bedöma.
- Nästa steg är att öppna Regler → Bibliotek och välja ur **14** regler **[V]**
  (`src/data/ruleLibrary.ts`, `lib-*`-id:n), vars titlar och beskrivningar är på engelska
  medan appens svar är på svenska **[V]** (`prompt.ts` punkt 7).

Produktproblemet: **regelvalet kräver den kunskap appen finns till för att leverera.**
En golfare som vet att hen har problem med höftinitieringen behöver inte appen för att
välja `lib-hip-initiation`. Alla andra gissar, eller väljer allt, eller inget.

## Problem

Vi har en motor som **verifierar** hypoteser (regler in → dom per regel ut) men ingen som
**genererar** dem. Dagens prompt är sluten till sin natur **[V]** (`src/lib/prompt.ts`,
`buildSwingPrompt`): den listar regel-ID och kräver `pass | fail | cannot_determine` per
id. Den kan inte svara på "vad ska den här golfaren jobba på?".

Diagnosanalysen är därför **ett nytt promptläge**, inte en variant av det befintliga.

## Beslut (föreslaget)

Ett förstagångsflöde i sju steg:

```
1. välkomst
2. ladda upp klipp (eller spela in)
3. auto-trim med justerbara handtag      ← §2
4. diagnosanalys (öppen bedömning)       ← §1
5. styrkor + förbättringsområden         ← §1 (utfall)
6. föreslaget regelset                   ← §1 (mappning) + §4
7. prioritering → utsläpp i sessionsläge ← §4
```

Steg 1, 5 och 7 är presentation. De tre substantiella besluten är §1 (promptkontraktet),
§2 (trimmen) och §4 (fokusmodellen). §3 svarar på konto-frågan, §5 på
informationsarkitekturen.

---

## §1 — Diagnosläget: kontrakt in, kontrakt ut, och mappningen

### Varför det är ett nytt läge och inte en flagga på det gamla

`buildSwingPrompt` får **inte** breddas till att göra båda sakerna. Två skäl, båda
konkreta:

1. **Prompt-cachen nycklar på exakt prefix** **[V]** — `SwingPromptOptions.frameCount`
   är redan medvetet *inte* interpolerad i prompten just för att antalet drev isär
   cache-prefixet och cachen aldrig träffade (`prompt.ts:29-38`). Att lägga in ett
   diagnosläge i samma sträng riskerar samma klass av fel.
2. Diagnosens svar har **ingen** överlappande fältmängd med `SwingAnalysis` utom
   metadatafälten. En union-typ hade betytt att varje konsument av `SwingAnalysis`
   måste börja fråga vilken sort den fick.

**Förslag:** ny export `buildDiagnosisPrompt()` + egen `DIAGNOSIS_SYSTEM_PROMPT` i
`src/lib/prompt.ts` (samma fil — de delar språkregeln, konfidenskalibreringen och
`cannot_determine`-disciplinen och ska inte drifta isär), plus en ren modul
`src/lib/diagnosis.ts` för typerna, valideringen och mappningen.

### Kontrakt IN

| Fält | Källa | Not |
| --- | --- | --- |
| `frames: string[]` | trimmens frame-grab (§2) | se kostnadsnoten nedan |
| `cameraAngle` | användarens val, samma som i dag | prompten behandlar ett explicit val som auktoritativt **[V]** (`prompt.ts` punkt 4) — behåll den regeln ordagrant |
| `catalog: LibraryRule[]` | `RULE_LIBRARY`, filtrerad på vinkel | **detta är mappningen** — se nedan |
| `quickMode` | **alltid av** | diagnosen läses på skärm, inte i hörlurar; `MAX_TOKENS_QUICK` = 600 **[V]** (`api.ts:26-27`) räcker inte |

### Mappningen mot befintliga regel-ID — kärnbeslutet

Tre vägar övervägdes; **väg B rekommenderas**:

| | Väg | Bedömning |
| --- | --- | --- |
| A | Fri prosa ut, mappa i efterhand (nyckelord/embeddings) | **Avvisas.** Flyttar felet från "hittat på ett id" (verifierbart, avvisbart) till "ungefär rätt regel" (tyst fel). ADR-003:s bärande princip är att tysta fel är värre än högljudda. |
| **B** | **Katalogen ligger i prompten; modellen väljer `library_id` ur den eller `null`** | **Rekommenderas.** Mappningen sker där kontexten finns, i ett anrop, och "ingen matchning" blir ett förstklassigt svar i stället för en gissning. |
| C | Två anrop: öppen bedömning + separat mappningsanrop | Dubbel kostnad och latens i det dyraste, känsligaste steget i appen. Mappningen är inte svår nog att motivera det. |

Konkret: prompten listar kandidatreglerna som `id · titel · fas · vinkel · beskrivning`
och instruerar att varje fynd **antingen** bär ett `library_id` **ur den listan**
**eller** `null`. Katalogen är 14 rader **[V]** — den ryms trivialt, och den är
identisk mellan användare, alltså ett bra cache-prefix.

### Kontrakt UT

```jsonc
{
  "camera_angle_detected": "face-on" | "down-the-line" | "unknown",
  "frame_quality": "good" | "acceptable" | "poor",
  "frame_quality_notes": "…",
  "usable_phases_detected": ["address", "backswing", …],

  "strengths": [
    {
      "library_id": "lib-shoulder-rotation" | null,
      "phase": "backswing",
      "visual_evidence": "…",      // svenska, samma regel som i dag
      "observation": "…",
      "confidence": 0.0-1.0
    }
  ],

  "improvements": [
    {
      "library_id": "lib-hip-initiation" | null,
      "phase": "downswing",
      "visual_evidence": "…",
      "observation": "…",
      "why_it_matters": "…",       // en mening: vad det kostar i slaget
      "severity": 1 | 2 | 3,       // modellens prioritering
      "confidence": 0.0-1.0
    }
  ],

  "overall_assessment": "2-3 meningar",
  "cannot_determine_reasons": ["…"]
}
```

**Valideringen är klientsidig och obeveklig** (`src/lib/diagnosis.ts`, ren funktion):

1. `library_id` som inte finns i `RULE_LIBRARY` → behandlas som `null` **och loggas
   WARN** (`Diagnosis: unknown library_id`). Hallucinerade id är den förväntade
   felmodellen, och en hallucination får aldrig skapa en regel. Att bara tysta den
   vore att göra frekvensen omätbar.
2. `confidence < 0.6` → fyndet visas inte som rekommendation. 0,6 är samma gräns som
   systemprompten redan sätter för `cannot_determine` **[V]** (`prompt.ts` punkt 2) —
   samma tal på båda ställena, inte två olika sanningar.
3. **Tak på antalet:** max 3 styrkor och max 3 förbättringsområden efter sortering på
   `severity` × `confidence`. Ett regelset på tio regler dag ett är ingen träningsplan;
   det är samma tomma val som i dag, fast förklätt.
4. Dubbletter mot befintliga regler avvisas via `hasLibraryRule(libraryId)` **[V]**
   (`src/store/rules.ts:64`) — relevant vid "kör om diagnosen".

### Vad händer när modellen föreslår något som saknar motsvarande regel?

Detta är den viktigaste följdfrågan, och svaret är **inte** "skapa en regel av det".

**Rekommendation: `library_id: null` visas som en observation utan regel** — med egen
etikett ("noterat — ingen regel finns för detta ännu") i diagnosrapporten, och den
**skapar ingenting** i regel-storen.

Motiv, alla konkreta:

- En modellskriven regel saknar `angles` och `drills` **[V]** (`addRule` tar
  `Omit<Rule,'id'|'active'>`, `src/store/rules.ts:22`). Utan `angles` kan ingen vy tona
  ned regeln när kameravinkeln är fel — designsystemet har uttryckligen en rad om att en
  nedtonad regel *skriver ut varför* **[V]** (`design-system.md`). Utan `drills` faller
  systempromptens punkt 6 ("referera de fördefinierade drillsen") tillbaka på påhittade
  övningar **[V]** (`prompt.ts` punkt 6).
- En regel som modellen skrivit blir sedan input till modellen vid varje efterföljande
  analys. Det är en självförstärkande loop utan mänsklig granskning.
- **Ett återkommande omatchat fynd är ett produktfynd, inte ett fel:** det säger att
  biblioteket har en lucka. Därför loggas varje omatchat fynd med sin text, så luckan
  kan fyllas för hand i `ruleLibrary.ts` — där regeln får vinkel, vikt och drills av en
  människa.

**Ett medgivande:** en explicit "Gör en egen regel av detta"-knapp som *förifyller
regelformuläret* med modellens text och lämnar användaren att välja fas/vinkel/vikt är
acceptabel — då äger användaren regeln. Den är dock **inte** default och bör inte ligga i
F:s första omgång.

### Kostnad — den ärliga siffran

Diagnosen är appens dyraste enskilda anrop, och den sker innan användaren har någon
anledning att lita på oss.

- Klipp-vägen **beskär inte** bildrutorna **[V]**: beskärningen (`poseCropBox` +
  `poseFrameGrab`) ligger enbart på sessionsvägen; `frameExtractor.ts` är uttryckligen
  orörd av E-2 (BACKLOG E-2, *"`frameExtractor.ts` orörd (klipp-vägen)"*).
- En obeskuren bildruta mättes till **1 229 tokens**, en beskuren till **213–231**
  **[V]** (BACKLOG, bildrutebudget-noten 2026-08-11).
- `ANALYSIS_FRAME_COUNT = 32` **[V]** (`frameExtractor.ts`). 32 × 1 229 ≈ **39 000
  input-tokens ≈ $0,12** per diagnos **[A]** (aritmetik på verifierade tal; faktisk
  tokenvikt varierar med bildinnehåll).

**Rekommendation:** kör diagnosen på **16 bildrutor** tills beskärningen finns på
klipp-vägen. En öppen bedömning behöver täckning över svingen, inte 50 ms-upplösning
inuti nedsvingen — det senare är vad 32 köptes för, och det köptes ur beskärningen
**[V]** (samma BACKLOG-not). Alternativt: låt trimmen greppa via sessionsvägens
`grabFramesAtTimes` (som beskär) i stället för `extractFrames` — se §2, punkt 4.

**Worker-taket biter potentiellt:** `MAX_TOKENS` default **2000** **[V]** (BACKLOG W-1)
och klienten klampas mot det. Ett diagnossvar med 3+3 fynd à `visual_evidence` +
`observation` + `why_it_matters` på svenska ryms **[A]** — men det är ett antagande, och
faller det syns det som avhugget JSON. F-1 ska mäta det på ett verkligt svar innan UI
byggs ovanpå.

---

## §2 — Auto-trim: vad vi redan har, och vad handtagen behöver ovanpå

### Vad ett uppladdat klipp går igenom i dag **[V]**

`CameraView` har redan en uppladdningsväg (`<input type="file" accept="video/*">` →
`processVideo`, `src/components/Camera/CameraView.tsx:141-147, 441-450`). Den leder till:

```
extractFrames(blob)                       (frameExtractor.ts)
  → selectViaPose
      → extractPoseTrajectory   15 fps, seek-per-sampel, tak MAX_ANALYSIS_SEC = 300 s
      → detectSwingEnvelope     EN envelope över HELA klippet
      → selectEnvelopeFrames
  → (om envelope.valid === false eller pose ej kunde köra)
    selectViaMotion             pixel-diff-fallback, WARN-loggad som path:'motion'
```

**`detectSessionSwings` körs alltså inte alls på klipp-vägen** **[V]** — den lever i
live-vägen (`liveSwingDetector.ts` / `useSessionCapture.ts`) och i dev-panelen
`SegmentedSwings.tsx`.

Vad de två ger, konkret:

| Funktion | Ger | Duger till trim? |
| --- | --- | --- |
| `detectSwingEnvelope` | **ett** `[startSec, finishSec]`, `impact \| null`, `clippedTail`, `valid`/`reason`, `addressY`/`apexY`/`peakSpeed` **[V]** (`poseEnvelope.ts`) | Ger startvärdet för handtagen — men bara *ett*, och den ljuger tyst på flersvingsklipp (hela ADR-003:s utgångspunkt). |
| `detectSessionSwings` | **N** kandidater med envelope + grind, `rejected[]` **med skäl**, `segmentation.diagnostics` med varje burst och dess `culledBy` **[V]** (`poseSegments.ts`) | Ja. Den ger både ett val ("vi hittade 3 svingar") och ett *skäl* när den ger noll — vilket är exakt vad ett trim-UI behöver för att inte bli en återvändsgränd. |

**Rekommendation: onboarding-trimmen kör `detectSessionSwings`, inte bara
`detectSwingEnvelope`.** Ett klipp ur kamerarullen innehåller sannolikt mer än en sving
eller en lång upptakt **[A]** — det är ett antagande om användarbeteende, inte en mätning;
fixturen `session-multi` visar bara att det är hanterbart, inte hur vanligt det är.

### Vad handtagen behöver ovanpå

1. **Ett redigerbart spann initierat från detektionen**, med lite luft: envelopens
   gränser är valda för *bildruteselektion*, inte för att se rätt ut för ett öga.
   Förslag +0,3 s före / +0,5 s efter som startvärde **[A]** (estetisk gissning, ska
   ses på en riktig trim innan den skrivs i sten).
2. **Scrubbing som seekar på uppsläpp, inte kontinuerligt.** Klipp-vägen är byggd runt
   `seekTo` + `onseeked` **[V]** (`frameExtractor.ts`, `poseFrameGrab.ts` har till och med
   3 s timeout på en hängande seek) — kontinuerlig seek under dragning är den säkraste
   vägen till en hackig första upplevelse på iOS **[A]**.
3. **Handtagen klampas mot grindens gränser:** 0,7–3,0 s (`MIN/MAX_ENVELOPE_SEC` **[V]**,
   `poseSegments.ts`). Att låta användaren välja ett spann som pipeline sedan avvisar är
   att bygga in ett tyst fel i UI:t.
4. **Trimmen får INTE köras genom `detectSwingEnvelope` igen efter att användaren rört
   handtagen.** Då är gränserna användarens. Konsekvens: det behövs en väg in i frame-grab
   som tar ett **explicit spann**. Sessionsvägen har redan en:
   `poseFrameGrab.grabFramesAtTimes(times…)` + `computeLandmarkBounds`/`planCrop` **[V]**
   — och den beskär, vilket löser §1:s kostnadsproblem på köpet.
   **[A] Ej verifierat** att `grabFramesAtTimes` fungerar mot en hel uppladdad fil; den är
   skriven för materialiserade fönster ur chunk-ringen, och dess tidsbas-probe finns just
   för att ett fönster kan presenteras ombasat. F-2 ska verifiera det, inte anta det.
5. **Impact behålls om den ligger inuti användarens spann**, annars `null` → uniform
   baslinje. Det är ADR-002:s degraderingsmodell oförändrad; trimmen får inte uppfinna en
   impact.

### När ingen sving hittas

Fyra lager, i ordning. **Ingen av dem blockerar användaren.**

| Läge | Vad vi gör | Varför |
| --- | --- | --- |
| `detectSessionSwings` → 0 svingar, men segmenteringen hittade burstar | Förvälj **längsta bursten** som spann, märkt *"vi är inte säkra — dra handtagen"*. Visa `rejected[].reason` i dev-läge. | Bursten är en övermängd av envelopen **[V]** (`poseSegments.ts`, `MAX_BURST_SEC`-noten) — alltså innehåller den svingen om det finns någon. |
| Pose kunde inte köra / 0 sampel | Fall tillbaka på pixel-diff-fönstret (`selectViaMotion`) eller, om även det faller, klippets mitt ± 1,5 s. Handtagen är fortfarande fulla. | **Manuell trim är hela poängen:** den gör diagnosen möjlig *utan* pose. Detta är samma sak som ROADMAP beslutsfork 1:s trim-slider-fallback — den byggs här och betalar sig i två spår. |
| Klippet är för långt | **Duration-gate i onboarding**, förslag 30 s **[A]**, med tydlig text före pose körs. | `extractPoseTrajectory` kan göra upp till 4 500 inferenser (~2–5 min på CPU-delegat) på ett 300-sekundersklipp **[V]** (ADR-003 Risker §7). Minuters väntan i steg 3 av en onboarding är det sämsta möjliga första intrycket. |
| Användaren ger upp | "Hoppa över diagnosen → välj regler själv" ligger synlig i **varje** steg. | Ett förstagångsflöde som bara har en utgång är en fälla. |

---

## §3 — Konto eller lokalt första gången?

**Rekommendation: helt lokalt. Inget konto, ingen inloggning, ingen Supabase i
diagnosflödet.**

Skälen, i fallande styrka:

1. **Det är en hård gräns i projektet:** *"Bryt inte den lokalt-först-garantin: appen
   måste fungera utan Supabase/auth"* (CLAUDE.md), formaliserad som B3 i
   `oppna-fragor.md` **[V]**.
2. **Infrastrukturen finns inte.** `SUPABASE_DISABLED = true` sedan 2026-08-09; RLS är på
   men saknar policies, så alla läsningar nekas; ingen auth finns (B-1/B-2 obockade)
   **[V]** (BACKLOG Ström B + handoffens *Öppna trådar*).
3. **Upplåsningsordningen skulle vändas.** ROADMAP: G1 (personligt rangebruk) är G2:s
   demo och trovärdighetsbevis **[V]**. Att lägga ett konto före G1:s första upplevelse
   gör G1 beroende av G2:s infrastruktur — precis tvärtemot.
4. **Diagnosen är ett bättre säljargument för kontot än tvärtom.** "Spara din diagnos och
   följ utvecklingen över tid" i steg 8 slår ett lösenordsfält i steg 0.

**Men: forma posten så att kontot blir additivt.** Spara diagnosen som en egen post i
IndexedDB via `idb-keyval` med prefix `diagnosis-` — samma mönster som historiken
(`swing-`-prefix, `MAX_RECORDS = 10`) **[V]** (`src/hooks/useHistory.ts`):

```ts
interface DiagnosisRecord {
  id: string;
  timestamp: number;
  frames: string[];          // de bildrutor diagnosen faktiskt bedömde
  cameraAngle: CameraAngle;
  trimSec: [number, number]; // användarens slutliga spann
  report: DiagnosisReport;   // rådata från modellen, efter validering
  appliedRuleIds: string[];  // vilka regler som faktiskt lades till
  videoBlob?: Blob;          // OPT-IN, se nedan
  // user_id sätts av B-3 när auth finns. Fältet behöver inte existera nu —
  // det är formen som ska vara additiv, inte fältet som ska föregripas.
}
```

**Två flaggor:**
- Att spara diagnosklippets video dubblar lagringen mot en redan begränsad historik
  (10 poster). **Rekommendation:** spara bildrutor + rapport alltid, videon bara på
  användarens val.
- G2-spåret vill sannolikt ha ingångsdiagnosen (tränaren ser var eleven började) **[A]**.
  Formen ovan bär det utan att något behöver byggas nu.

---

## §4 — Fokusregel vs alla aktiva

### Hur det representeras i dag **[V]**

| Sak | Var | Beteende |
| --- | --- | --- |
| Vilka regler som bedöms | `useRulesStore.rules[].active` | Persisterad (`swingcheck-rules`). Anroparen skickar de aktiva till `analyzeSwing`. |
| "Bara den här" | `soloRule(id)` (`rules.ts:57`) | Sätter `active` sant för en och **falskt för alla andra**. **Destruktivt** — vilka som var aktiva går inte att återställa. |
| Fokusregeln | `useSessionStore.focusRuleId` (`session.ts:82,140`) | **Persisteras inte** — `create()` utan `persist` (`session.ts:135`). Fokus försvinner vid omladdning och vid varje PWA-omstart. |
| Vad fokus *betyder* | `buildSwingPrompt` (`prompt.ts:71-80`) | "Analysera denna djupare" — alla aktiva regler bedöms ändå. Fokusregeln får eget block, egen `focus_rule` i svaret och läses först av TTS (`tts.ts:405`). |
| Förslag på nytt fokus | `StatsView` (`History/StatsView.tsx:77`) | Föreslår redan svagaste regeln med ≥ 3 datapunkter. |

### Vad som saknas för "en i taget"

1. **Persistens.** `focusRuleId` hör till regelmodellen, inte till en vy-session. Flytta
   den till den persisterade rules-storen. Additivt; `session.focusRuleId` kan bli en
   tunn selektor under en övergång så inga konsumenter behöver röras i samma pass.
2. **Icke-destruktiv exklusivitet.** "En i taget" får **inte** implementeras som
   `soloRule`. Inför i stället ett läge i rules-storen:
   `evaluationMode: 'all' | 'focus'`. I `'focus'` skickas bara fokusregeln till prompten;
   `active` rörs aldrig. Att växla tillbaka återställer allt utan att användaren behöver
   minnas något. `soloRule` kan då avvecklas eller behållas som ett medvetet
   "rensa mitt regelset"-verktyg — men inte som mekanismen bakom fokusläget.
3. **En ordning.** Diagnosen levererar en *prioriterad* lista, men `rules[]` har ingen
   ordning alls i dag utom insättningsordning. Additivt `priority?: number` på `Rule`,
   satt av diagnosen, gör "nästa regel" härledbar.
4. **Ett avslutskriterium** för fokusläget. **Rekommendation: manuell växling först.**
   Automatik ("3 pass i rad → föreslå nästa") kan byggas på `StatsView`:s befintliga
   statistik men hör inte hemma i Ström F.

### Rekommenderat default vid utsläpp (steg 7)

**`evaluationMode: 'all'`, med diagnosens högst prioriterade regel satt som
`focusRuleId`.**

Motivering, med den ärliga motkraften utskriven:

- **För `all`:** alla aktiva bedöms i samma anrop, så breddare regelset ger fler
  datapunkter till `StatsView` — som är det som senare kan föreslå nästa fokus. Golfaren
  får både sin fokusrad i hörlurarna och ett brett utfall på skärmen.
- **Mot `all`:** svarslängden skalar med regelantalet **[V]** (`api.ts`-kommentaren om
  att output skalar med regelantal och schemaval), och i sessionsläge är genereringstiden
  den dominerande latensen — 26–46 s mätt per sessionssving **[V]** (`prompt.ts:53-55`).
  Färre regler är alltså **genuint** snabbare och billigare, inte bara enklare.
- **Avgörande:** `AnalysisUsage` bär redan `activeRuleCount`, `maxTokens`, `quickMode` och
  `visionMs` **[V]** (`api.ts:29-50`) — skillnaden är alltså **mätbar utan nytt arbete**.
  Sätt `all` som default, mät, och flytta defaulten om datan säger det. Att gissa nu vore
  att göra ett mätbart val till ett trosval.

---

## §5 — Informationsarkitektur

### Läget i dag **[V]**

- **Fem flikar** i `App.tsx:31-37`: Hem, Kamera, Regler, Analys, Historik.
- **Två vyer utanför tabbaren:** `preview` (dev) och `settings` — de finns i `View` men
  har ingen flik.
- **Inre flikar redan i två vyer:** Regler → `Segmented` {Mina, Bibliotek}
  (`RuleEditor.tsx`), Historik → `Segmented` {Svingar, Statistik} (`HistoryList.tsx`).
- UI-2 har redan noterat riktningen som kvarvarande arbete: *"tabbaren till 4 flikar
  (analys är en utfallsskärm, inte en flik), ett sessionsband synligt i alla vyer, och
  `SessionSummaryCard` flyttad till hemvyn"* **[V]** (BACKLOG UI-2).

### Förslag: tre flikar

| Flik | Innehåller | Varför just så |
| --- | --- | --- |
| **Träna** | Hälsning + fokusrad, statkort, inspelningsknapp, uppladdning, sessionsvy | `HomeView`:s enda handling är i praktiken "gå till kameran" **[V]** — en CTA plus två statkort som navigerar. En mellanlandning vars enda syfte är ett tryck till ska inte vara en flik i appens vanligaste flöde. |
| **Plan** | Regelsetet (mina + bibliotek), fokus/alla-läget, ordningen, "kör om diagnos" | Regelsetet **är** produktens plan. Diagnosen skriver hit, prioriteringen bor här, och det är den enda platsen där "vad tränar jag på?" har ett svar. |
| **Utveckling** | Svinglogg + per-regel-trend (dagens två inre flikar, oförändrade) | De två svarar redan på en och samma fråga: går det åt rätt håll? |

**Vad som flyttas eller slås ihop, och varför:**

- **Analys lämnar tabbaren.** `AnalysisView` renderar `selectPrimarySwing` och är
  meningslös utan en nyss analyserad sving **[V]**. Som flik går den att trycka på och
  landa på ingenting. Den blir en **utfallsskärm** ovanpå Träna (och öppnas från en rad i
  Utveckling). Detta är samma slutsats som UI-2 redan dragit — den här ADR:n skärper den
  bara från fyra flikar till tre.
- **Hem försvinner som egen flik**, dess innehåll blir Trännas översta yta.
- **Inställningar** har redan ingen flik — behåll som kugge i `NavBar`.
- **Sessionsbandet** hör hemma i skalet, inte i en flik, så en pågående session syns även
  från Plan och Utveckling (UI-2:s kvarvarande punkt, oförändrad).
- **Diagnosen får ingen flik.** Den är ett flöde som körs en gång och kan köras om från
  Plan. Ett engångsflöde med permanent navigationsyta är en flik som är tom 99 % av tiden.

**Konsekvens i koden:** `View` *krymper* — `home|camera` → `train`, `analysis`/`preview`
blir overlays. `keepCameraMounted` (som finns för att sessionsloopens ström, headset-audio
och Media Session ska överleva rundturen **[V]**, `App.tsx:49`) blir enklare, inte
svårare, när kameran bor i den flik man ändå står i.

**Risk att flagga:** en sammanslagen Träna-flik får inte bli en scrollande hybrid där
kameran hamnar under vikningen. Kravet är **max ett tryck** från Träna till en rullande
kamera; klarar designen inte det är fyra flikar det rätta svaret i stället.

---

## Alternativ som övervägts

**A. Startpaket i stället för diagnos** — kuraterade regelset ("nybörjare, DTL",
"slice-fixaren"). Kostar noll, kräver ingen ny prompt, går att bygga på en eftermiddag.
Men det är en gissning presenterad som ett svar, och det är exakt produktlöftet som går
förlorat. **Bra fallback** om diagnoskvaliteten visar sig dålig i F-4.

**B. Diagnos utan klipp** — ett frågeformulär (handicap, typiska missar) som väljer
regler. Ingen kostnad, ingen kamera, ingen pose. Kan komplettera diagnosen (svaren är bra
prompt-kontext), kan inte ersätta den: appens hela premiss är att den *ser* något.

**C. Diagnos på flera klipp** (face-on + DTL) för full regeltäckning — 9 av 14
biblioteksregler kan bara verifieras från en av vinklarna **[V]**. Rätt på sikt, fel i en
onboarding: dubbel kostnad, dubbel friktion, dubbelt så många sätt att misslyckas i steg 3.
Låt diagnosen säga vilka regler som *inte* kunde bedömas från den valda vinkeln, och
erbjud det andra klippet som ett senare steg.

---

## Risker

1. **Hela första intrycket hänger på ett anrop** som är dyrast och långsammast i appen
   (26–46 s för en sessionssving **[V]**; en detaljerad diagnos blir längre **[A]**), och
   som sker innan användaren har någon anledning till tålamod. Mitigering: ärliga
   delsteg i progressen, ingen falsk snabbhet, "hoppa över" synlig hela vägen.
2. **Pose på främmande klipp är omätt.** Samtliga fixturer är Eriks egna klipp i känd
   vinkel och känt avstånd **[V]** (`src/lib/__fixtures__/`). Ett klipp ur kamerarullen
   kan vara landskap, zoomat, eller innehålla flera personer — `numPoses: 1` **[V]**
   (`poseDetector.ts`, D-1-noten) och det finns ingen "fel person"-grind.
3. **Hallucinerade regel-ID** — hanterat by construction (allowlist), men frekvensen
   måste loggas, annars är den okänd.
4. **Kostnad utan konvertering.** Fem "test"-uppladdningar = ~$0,6 utan att en enda sving
   slagits. Workern har ett dagstak (`DAILY_CALL_CAP` 300 **[V]**, W-1) men ingen
   per-klient-gräns. Rekommendation: en diagnos per onboarding, "kör om" bakom en
   bekräftelse.
5. **Bibliotekets täckning.** 14 regler **[V]**. Om diagnosen ofta ger `library_id: null`
   är biblioteket för litet — ett produktfynd som måste synas i loggen, inte tystas.
6. **Beskärningen saknas på klipp-vägen** → varje diagnosbildruta är ~5× dyrare än en
   sessionsbildruta **[V]**. Se §1.
7. **Två nya persisterade fält i regel-storen** (`evaluationMode`, `priority`) rör en
   store som redan har persisterad data hos användare. Migreringen måste vara ren
   default-fyllning, aldrig en omskrivning av `rules[]`.

## Öppet innan beslut

- **Bildrutebudget för diagnosen:** 16 nu, eller 32 efter att beskärningen portats till
  klipp-vägen? (Beror på F-2:s verifiering av `grabFramesAtTimes` mot en hel fil.)
- **Ryms diagnossvaret i `MAX_TOKENS` 2000?** Mäts i F-1 på ett verkligt svar.
- **Sparas diagnosklippets video?** Rekommendation: opt-in.
- **Får diagnosen föreslå regler utanför biblioteket** bakom en explicit knapp? (Inte i
  F:s första omgång.)
- **Avslutar fokusläget sig självt** på statistik, eller alltid manuellt?
- **Duration-gate:** 30 s är en gissning; mät hur lång tid `extractPoseTrajectory` faktiskt
  tar på Eriks telefon för 15/30/60 s innan talet skrivs i sten.

---

## Antaganden (allt som INTE är verifierat i koden)

| # | Antagande | Konsekvens om fel | Hur det avgörs |
| --- | --- | --- | --- |
| A1 | Uppladdade klipp innehåller ofta mer än en sving / lång upptakt | `detectSessionSwings` på klipp-vägen är onödig komplexitet; `detectSwingEnvelope` hade räckt | Se på 10 klipp ur en riktig kamerarulle |
| A2 | `grabFramesAtTimes` fungerar mot en hel uppladdad fil, inte bara materialiserade fönster | Trimmen måste gå via `extractFrames` → ingen beskärning → 5× kostnad kvar | F-2, direkt mätning |
| A3 | Ett diagnossvar med 3+3 fynd ryms i `MAX_TOKENS` 2000 | Avhugget JSON i det viktigaste steget → `MAX_TOKENS` måste höjas i `wrangler.toml` (kräver Eriks deploy) | F-1, ett verkligt anrop |
| A4 | 16 bildrutor räcker för en öppen bedömning | Sämre diagnoskvalitet på precis det som ska sälja appen | F-4, jämför 16 mot 32 på samma klipp |
| A5 | 30 s duration-gate är rätt storleksordning | För snäv: användare blockeras i onödan. För vid: minuters väntan i steg 3 | Mät `extractPoseTrajectory` på Eriks telefon |
| A6 | +0,3 / +0,5 s padding runt envelopen ser rätt ut för ett öga | Kosmetiskt; justeras när trimmen syns | Se på den |
| A7 | Kontinuerlig seek under handtagsdragning är för långsam på iOS | Onödigt trögt UI (uppsläpps-seek är sämre men säkrare) | Prova båda på enhet |
| A8 | Diagnoskvaliteten är god nog att bära ett förstagångsflöde | Hela strömmen faller tillbaka på alternativ A (startpaket) | F-4 på 5 klipp, Eriks bedömning |
| A9 | G2-spåret vill ha ingångsdiagnosen per elev | Postformen bär ett fält ingen använder — billigt fel | Först relevant vid M6 |
| A10 | Modellen väljer `library_id` tillförlitligt ur en 14-raders katalog | Mappningen blir brus → alternativ A | F-1/F-4, mät andelen `null` och andelen okända id |
