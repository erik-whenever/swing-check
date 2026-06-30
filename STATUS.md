# STATUS — SwingCheck

> Enda källan till levande, föränderlig status. Ändras fritt allteftersom arbetet fortskrider.
> Stabil grund: [KONTEXT.md](KONTEXT.md). Beslutslogg: [docs/oppna-fragor.md](docs/oppna-fragor.md).
> Senast uppdaterad: 2026-06-30.

## Nuläge

Fungerande PWA med hela kärnflödet: filma sving → extrahera bildrutor → Claude-analys → resultat per regel → historik.
Nyligen mergat (PR #9–#15): prompt caching, TTS-röst, handsfri sessionsläge, träningsstatistik, app-ikoner.

### Klart
- Kamera/inspelning, rörelsebaserad bildruteval (`frameExtractor.ts`).
- Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst.
- Handsfri sessionsläge (autospela in nästa sving).
- i18n med browser-/geo-detektering, tema + accentfärg.
- PWA med explicit uppdateringsbanner.

## Pågår

- **Verifiera rörelsebaserad svingdetektering** på riktiga klipp av varierande längd/svingposition. Address-ankrad detektering är implementerad men **ännu inte bekräftad av användaren** på testklippet (se [docs/swing-detection-handoff.md](docs/swing-detection-handoff.md) och [ADR-0001](docs/adr/0001-motion-based-swing-detection.md)).
- **Okommitterade ändringar i working tree** på `main` (frameExtractor, CameraView, FramePreview, DevLogPanel m.fl.). Behöver branch + ärlig commit innan merge.
- **Felsöknings-loggning kvar:** den konsoliderade `WARN "Swing detection summary"` + `curveDigest` + `topPeaks` lades till för tuning — bör nedgraderas till `debug` eller tas bort före merge.

## Horisont (ej påbörjat)

- **Pose-estimering som fallback** om rörelse-metoden når sin gräns (MediaPipe Tasks Vision / MoveNet i webbläsaren) för att spåra klubba/händer och hitta impact direkt. Medvetet bortvald initialt — se [ADR-0001](docs/adr/0001-motion-based-swing-detection.md).
- **Autentisering** — Supabase-rader har `user_id = null`; ingen inloggning ännu.
- **README är fortfarande Vite-mallens boilerplate** — bör ersättas med riktig projektbeskrivning (peka till KONTEXT.md).
- **Paketnamn `swingcheck-temp` / version `0.0.0`** — städa inför ett första riktigt release.

## Kända risker / fallgropar

- Service worker-cache serverar gammal kod → verifiera alltid via `npm run dev`, avregistrera SW vid tvivel.
- Pixel-diff ser inte impact (ligger i rörelse-dal) — grunden till hela detekteringsstrategin.
