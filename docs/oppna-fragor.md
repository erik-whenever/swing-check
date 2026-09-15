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
**Datum:** 2026-09-15 · **Status:** ÖPPEN

SwingCheck är byggd som webbapp/PWA. Erik lutar nu åt **native iOS + Android före lansering**.
**Beslutet är inte fattat** — den här posten listar konsekvenserna, den avgör ingenting.

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
