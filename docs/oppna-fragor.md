# Öppna frågor & beslutslogg

> Numrerade poster. Öppna frågor får status **ÖPPEN**; när de avgörs blir de **BESLUT** med datum och kort motivering.
> Arkitekturval värda en längre motivering bryts ut till en ADR i [adr/](adr/) och refereras härifrån.

---

## BESLUT

### B1 — Rörelsebaserad svingdetektering framför pose-estimering
**Datum:** 2026-06-01 · **Status:** BESLUT · **Detalj:** [ADR-0001](adr/0001-motion-based-swing-detection.md)
Valde en pixel-rörelsemetrik utan nya beroenden framför in-browser pose-estimering, för scenariot
"en riktig sving + lång setup". Ankras på adress-stillheten eftersom impact är osynligt för metriken.

### B2 — Worker som proxy mot Anthropic
**Datum:** 2026-06-30 (retroaktivt dokumenterat) · **Status:** BESLUT
All Anthropic-trafik går via en Cloudflare Worker så att `ANTHROPIC_API_KEY` aldrig når klienten.

### B3 — Lokalt först; Supabase är valfritt
**Datum:** 2026-06-30 (retroaktivt dokumenterat) · **Status:** BESLUT
IndexedDB är källan till sanning. Supabase speglar endast metadata + resultat och degraderar till
no-op när env-varablerna saknas. Appen måste alltid fungera utan backend-konto.

---

## ÖPPNA FRÅGOR

### F1 — Håller den rörelsebaserade detekteringen i praktiken?
**Status:** ÖPPEN
Address-ankrad detektering är implementerad men inte verifierad på varierade klipp. Om den missar
svingen är nästa steg pose-estimering (se ADR-0001, "Konsekvenser").

### F2 — Autentisering och fleranvändarstöd
**Status:** ÖPPEN
Supabase-rader har `user_id = null`. Hur (och om) inloggning ska införas är obeslutat.

### F3 — Vad ska ersätta boilerplate-README:t?
**Status:** ÖPPEN
README är fortfarande Vite-mallen. Förslag: kort projektbeskrivning som pekar till KONTEXT.md.

### B4 — Kalibreringssetets övervikt mot downswing är avsiktlig, behålls
**Datum:** 2026-09-13 · **Status:** BESLUT

`PHASE_QUOTAS` i `scripts/build-calibration-set.mjs` är downswing 40 / impact 15 / top 12 /
backswing 12 / through 9 / address 7 / finish 5. Specens målvikter
(`PHASE_TARGET_WEIGHTS` i `src/lib/dataset/phaseQuota.ts`) är för 100 frames i stället
downswing 34 / impact 18 / top 10 / backswing 14 / through 10 / address 8 / finish 6.

**Skillnaden är avsiktlig, inte en bugg:** kalibreringssetet är övervikat mot `downswing` (+6 procentenheter)
och `impact` (−3), medan `backswing` och `top` är underrepresenterade. Setet är redan draget, annoterat och
är permanent evalset — det dras aldrig om. Övervikten behålls och rättas inte av följande skäl:

- Downswing är den fas som bär **modellens värde** — det är där skaftdetektorn måste fungera.
- Downswing är **svårast att detektera** (rörelsestreak, midpunkt att bedöma).
- Ett evalset som är hårdare än träningsfördelningen gör metriken **konservativ**, vilket är rätt riktning.

**Påverkan:** eval-siffror per fas är inte direkt jämförbara med träningsfördelningen. Det är avsett
och dokumenterat som en egenskap hos evalsetet, inte en förbisedd skillnad.

---

## ÖPPNA FRÅGOR

### F5 — Fashärledningen från envelope har ~50 % felfrekvens
**Status:** ÖPPEN

Fashärledningen ur svingens envelope stämde på ungefär hälften av batch-01:s frames vid
jämförelse mot manuell bedömning av annotatörerna. Underlag i korstabellen från
`scripts/reconcile-phase.mjs` mot `data/shaft/training/batch-01/annotated-v1.zip`.

**Konsekvenser:**
- `prefill-phase.xml` skrivs inte längre av `build-training-batch.mjs` tills vidare.
- Annotatören sätter `phase` för hand som vilket annat attribut som helst.
- `scripts/reconcile-phase.mjs` slår ihop manifest-fas och annoterad fas och skriver
  `phase-corrected.json` som träningspipelines ska läsa.

**Vad som behövs för att stänga frågan:** fashärledningens felfrekvens mot manuell
bedömning sjunker under en rimlig tröskel (t.ex. < 15 %) — förmodligen kräver det en
bättre tidsankring av fasövergångarna, eventuellt pose-estimering som stöd.


### F6 — Native iOS + Android i stället för webbapp/PWA?
**Datum:** 2026-09-15 · **Status:** BESLUTAD 2026-10-23

**Beslut (2026-10-23): React Native (Expo med dev client + VisionCamera) för iOS och Android.**
Kamera, pose (MediaPipe native SDK) och skaftinferens (Core ML / TFLite) körs i native moduler.
Domänlogiken (ren TS i `src/lib`: poseEnvelope-kedjan, `shaft/measure`, regelbiblioteket,
api-logiken) delas som en kodbas. Workern och Supabase är oförändrade. Dev-vyer och
datasetverktyg blir kvar som desktop-webb. S-47 löses genom att modellen följer med appbinären.
**Varför inte Swift + Kotlin:** två implementationer av regel- och mätkedjan riskerar att ge
olika utslag på iOS och Android (G2) och halverar iterationstakten på det som skiljer
produkten från konkurrenterna. Native vinner bara på UI-polish och direkt API-åtkomst, och
RN når samma API:er via egna Swift-moduler. **Varför inte Capacitor:** inferens och kamera
stannar i WKWebView (fps, latens, reload-buggen). **Flutter:** samma produkt som RN men logiken
skrivs om i Dart. **Mac:** Erik skaffar en inom kort för iOS-modulerna och profilering i
Xcode/Instruments. Arbetet börjar med det som inte kräver Mac (delad logik, Android, UI).
**Ordning (~130 h, mål: säsongsstart april 2027):** (1) spike: 30 fps + pose + shaft-v2 på
enhet, grind för beslutet; (2) kärnflödet; (3) 30 fps-omkalibrering (S-49 §6); (4) handsfree
med taligenkänning på enheten; (5) TestFlight och Play.
**Skaftet körs i Core ML direkt på iOS, inte via TFLite (fynd i N-2, 2026-10-23).** MediaPipe Pose
länkar in en egen kopia av TFLite:s C-API, och en TFLite-runtime till i samma iOS-binär ger dubbla
`TfLite*`-symboler (54 st, EAS-bygge `60a0c910…`). Så shaft-v2 konverteras till Core ML
(`.mlpackage`, samma vikter) och körs i en egen Nitro-modul i N-3. Android är inte berört av beslutet.
**Spiken bekräftar beslutet (N-2, iPhone 16 Pro, klar 2026-10-23):** pose klarar 30 fps med god marginal (lite 17,3 ms, full 19,2 ms
i median, thermal `nominal` i 3 min). Skaftet ger samma punkter som Python (≤ 0,45 px) på 32 ms per ruta
via TFLite och Core ML-delegaten, mot grinden 30 ms och webbens 83 ms. Det blir 0,83 s för en svings 26
rutor. Erik godtog skafttiden, eftersom produkten kör skaftet efter slaget och inte live. Android mäts i N-3.

---

SwingCheck är byggd som webbapp/PWA. Erik lutar nu åt **native iOS + Android före lansering**.
*Underlaget nedan skrevs före beslutet och står kvar som motivering.*

**Vad som INTE påverkas.** Skaftmodellen är formatoberoende: samma tränade vikter exporteras
till ONNX, Core ML eller TFLite **utan omträning**. Dataset, annoteringsschema och
träningspipeline är opåverkade.

**Vad som påverkas:**
- **Inferenstid.** 333 ms/frame på WebGPU i webbläsaren. Core ML på Apples Neural Engine
  ligger typiskt en storleksordning lägre för en modell av den här storleken. Det förändrar
  vad som är möjligt i en rangesession.
- **Modellstorlek.** YOLOv8n (nano) valdes delvis för webbläsarbudgeten. Native ger marginal
  för `s` eller `m` — bättre noggrannhet och färre bortfall på suddiga frames. **Ska mätas mot
  samma evalset** när datasetet är komplett.
- **Klientkod.** `src/lib/shaft/shaftDetector.ts` och dev-vyn är byggda mot `onnxruntime-web`
  och skrivs om vid ett plattformsbyte.
- **Datamodellen för skaftmätvärdena** (ej byggd än) bör läggas på en nivå som **överlever
  plattformsbytet** — mätvärden och regler ska inte vara bundna till webbruntime.
- **Posens samplingstakt (underlag från S-49, 2026-10-23).** Appens pose körs i 15 fps
  (`SAMPLE_FPS`). I 15 fps fäller finishgrinden i `poseEnvelope.ts` svingar med kort hållen
  finish: `IMG_4613` och `IMG_5406`, 2 av 71 slag i S-45-facit, båda sannolikt slag. Det går inte
  att rätta i 15 fps utan att toppvilan börjar läsas som finish (`062`, `070`, `3587`). **I 30 fps
  accepteras båda med dagens kod oförändrad**, och 30 fps-utfallet på de 70 egna klippen ändras
  inte av en fps-oberoende grind. Det talar för 30 fps om native gör det billigt.
  **Kostnad: 2× poseinferens.** Dubbelt så många `detectForVideo`-anrop och seeks per klipp.
  Minnet går från ~4,3 kB/sampel ≈ 19 MB till ~39 MB vid analystaket 300 s. Bearbetningstiden
  (idag ~2–5 min för ett 4-minutersklipp på CPU-delegat, ADR-003 §Risker 7) fördubblas om native
  inte är snabbare per bildruta. Det är inte mätt.
  **Inte klart med 30 fps:** kedjans konstanter är kalibrerade i 15 fps (`IMPACT_ADDRESS_TOL` har en
  `OSÄKER` om just detta). Sträckta Slo-Mo-klipp (`3587`) får topp-som-finish i 30 fps.
  Webbklippen är inte mätta i 30 fps. En takthöjning kräver en regressionsomgång som S-49 §6:
  (a)–(e) plus goldens. Rapport: [shaft/fps-missed-swings.md](shaft/fps-missed-swings.md) §6–7.


### F7 — Skaftets svikt mot den räta butt→hosel-linjen
**Datum:** 2026-09-15 · **Status:** ÖPPEN

Skaftet böjer sig under svingen, mest i nedsvinget där kraften är störst. Vår 2-punktslinje
`butt`→`hosel` är en **rät linje genom ett böjt skaft**, och avvikelsen kan vara flera grader
— samma storleksordning som modellens hela vinkelfel (v2: vinkelmedian **1,06°**).

**Frågan:** avviker den räta linjen **systematiskt** från det en tränare menar med skaftläge?
En mittpunkt på skaftet skulle göra böjningen mätbar, men innebär en **femte keypoint** och
ännu en annoteringsomgång över allt redan annoterat material.

**Åtgärd:** mät när fyrapunktsmodellen finns. **Agera inte innan.**

### F8 — Hosel som `occluded` längs riktningen i stället för `outside`
**Datum:** 2026-09-15 · **Status:** ÖPPEN

Idag sätts `hosel` till `outside` när klubbhuvudet är utanför bild eller osynligt. Framen bär
då bara **en** punkt, och skaftets riktning går förlorad trots att annotatören ser skaftet
tydligt.

**Förslag att pröva:** placera `hosel` **längs skaftets synliga riktning** — vid bildkanten
eller där skaftet försvinner — och flagga `occluded`. Modellen får då en riktning att lära sig
av i stället för ingenting.

**Gränsen som måste vara tydlig om det införs:**
- **occluded** = skaftets *riktning* är känd, hoselns *exakta läge* är det inte
- **outside** = inte ens riktningen är känd

**Konsekvens:** batch-01, 02 och 03 har `outside` där regeln skulle ge `occluded`. Ingen
omannotering krävs, men den gamla datan bär **färre användbara punkter än den kunde**.

Berör [Punktflaggor](shaft/annotation-spec.md#punktflaggor-cvat), särskilt regeln
*"En punkt utanför bildkanten är `outside`"* — den skulle behöva skrivas om för `hosel`.

### F9 — `club` som attribut på shaft-objektet
**Datum:** 2026-09-15 · **Status:** ÖPPEN

Drivers är nästan omöjliga att sätta `toe`/`heel` på — helt rundade, och formen varierar mellan
modeller. Vissa järn har också avrundad sola. Observationen är **systematisk, inte slumpmässig**,
och driver är den klubba där bladvinkeln intresserar mest.

**Förslag:** attributet `club` (`driver | iron | wedge | unknown`) på `shaft`-objektet i
**batch-04**. Klubbtypen är densamma genom hela svingen, så kostnaden är låg.

Det gör frågan **mätbar**: är modellen sämre på drivers, och behöver `toe`/`heel` en egen
definition för rundade solor?
