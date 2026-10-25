# Uppladdningspipelinen (N-3.6 del 12)

Interimsväg som fungerar på iOS utan N-3.4 (native `capture`) och N-3.8 (Swift-pose).

## Flöde
1. **Svinga-fliken → "Byt klipp"**: kamerarullen (`expo-image-picker`, endast video). Klippets namn och längd visas; svingfönstret sätts till hela klippet om ≤ 4 s, annars mittersta 4 s. Användaren drar fönstret på tidslinjen.
2. **"Bedöm svingen"** (aktiv när klipp finns och minst en regel går att bedöma från vinkeln) → Analys-skärmen.
3. **Analys** (`runUploadAnalysis`, `apps/mobile/src/app/uploadPipeline.ts`):
   - *swing*: fönstret klampas mot klippet (detalj "0,5–2,5 s").
   - *frames*: 32 bildrutor jämnt fördelade i fönstret, grab per tidpunkt (detalj "n / 32").
   - *rules*: `analyzeSwing` i core → Workern (`EXPO_PUBLIC_API_URL`, `Origin`, `X-SwingCheck-Install`), aktiva regler (`analysableRules`), språk ur inställningarna.
   - Media kopieras till `documents/media/<id>/` (klipp + bildrutor), posten sparas med `useHistory().addSwing` (medietaket körs där) → `Result` ersätter Analys i stacken.
4. **Fel** → `analysisErrorView` (inkl. `UsageCapReachedError`) i en Alert, sedan tillbaka. **Avbryt** stoppar före nästa steg; ett Worker-svar som kommer efter avbrott kastas och sparas inte (anropet är redan betalt).

## Interim-rututtag
`thumbnailFrameSource` (`uploadAdapters.ts`): `expo-video-thumbnails` (AVAssetImageGenerator) vid vald tid → `expo-image-manipulator` skalar längsta kanten till ≤ 1280 px (`frameResize`) och kodar JPEG 0.8 med base64. Webbens canvas tak bara bredden; i appen gav det porträttklipp i full höjd, 37 MB för 32 rutor och 413 från Workern (Eriks iPhone-prov 2026-10-25).

Kända begränsningar (`// OSÄKER` i koden):
- Ingen pose → ingen fasstyrd urvalslogik (`selectEnvelopeFrames`) och ingen beskärning. Jämn fördelning ger färre bilder i downswing/impact; obeskurna bilder kostar ~5× input-tokens per sving.
- Generatorns tidstolerans kan ge närliggande dubbletter i snabba partier.
- Vinkel detekteras inte (användaren väljer).

## Vad N-3.4/N-3.8 ersätter
Allt bakom `FrameSource` (uttag) och `selectFrameTimes`/`defaultSwingWindow` (val): pose ger svingfönster (`poseSegments`), fasstyrt urval och beskärning. Orkestreringen, lagringen och skärmarna står kvar.

## Bygge
Nya native-moduler: `expo-image-picker`, `expo-video-thumbnails`, `expo-image-manipulator` + plugin/`NSPhotoLibraryUsageDescription` i `app.json` → **dev-klienten måste byggas om**.
