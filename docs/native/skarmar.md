# Skärmar (N-3.6)

Rena presentationskomponenter i `apps/mobile/src/screens/`: all data och alla callbacks in via typade props — inga state-hooks, ingen navigation, inga nätanrop. Byggda endast av `src/ui` (komponenter + tokens) och `react-native-svg` för ikoner. Ljust/mörkt följer `ThemeProvider`. Containrar (navigation, state, pipeline) kopplar in dem senare.

## Välkommen — `WelcomeScreen.tsx`

**Designkälla:** `docs/design/d1-v2/png/valkommen.png` (skärm 0 i d1-v2).

| Prop | Typ | Not |
|---|---|---|
| `step`, `stepCount` | `number` | Prickraden; 0-baserat index. |
| `eyebrow?` | `string` | Guldetikett, t.ex. "4 snabba steg". |
| `titleLead`, `titleHighlight?`, `titleTail?` | `string` | Rubriken; `titleHighlight` i volt ("coachen"). |
| `body` | `string` | Brödtext. |
| `illustration?` | `ReactNode` | Innehåll i cirkeln; tom cirkel om saknas. |
| `ctaLabel`, `onNext` | `string`, `() => void` | Krämvit primärknapp ("Kom igång"). |
| `onSkip?`, `skipLabel?` | | "Hoppa över" visas bara med `onSkip`. |

Varumärkessplash: tvingar ljust schema (nästlad `ThemeProvider scheme="light"`) — skissen har en variant och den mörka accenten bär inte vit text.

## Uppladdning — `UploadScreen.tsx`

**Designkälla:** `docs/design/d1-v2/png/uppladdning-{light,dark}.png`; riktning i `docs/design/d1/README.md` → "Skärm för skärm".

| Prop | Typ | Not |
|---|---|---|
| `greeting?`, `greetingHighlight?` | `string` | `BrandHeader`-hälsning (t.ex. `greetingFor()`); containern väljer tid. |
| `onRecord?` | `() => void` | Rund kameraknapp i varumärkesraden. |
| `preview?` | `ReactNode` | Videospelare/affisch som fyller klippkortet. |
| `clipLabel`, `onChangeClip` | | "IMG_4127 · 0:08", "Byt klipp". |
| `duration` | `number` (s) | Klippets längd. |
| `swingWindow` | `{ start, end } \| null` (s) | Från `poseSegments`; `null` = "Ingen sving hittad". |
| `onSwingWindowChange` | `(next) => void` | Tryck på tidslinjen flyttar närmaste kant; skärmläsare öka/minska flyttar fönstret 0,1 s. |
| `angle`, `angleDetected`, `onAngleChange` | `CameraAngle` (`core`) | Segmented "Längs linjen"/"Framifrån"; "Upptäckt automatiskt" när förifylld. |
| `ruleSetTitle`, `ruleSetSubtitle`, `onOpenRuleSet` | | Regelsetet som en rad. |
| `estimatedSeconds`, `onAnalyze`, `canAnalyze?` | | "Bedöm svingen" + "Tar ungefär N sekunder". |

Tidslinjen ritas i volt (maskinseende). Fliksfältet ingår inte — det hör till navigationsskalet. Exporterar även `formatSeconds` ("2,4").

## Analys pågår — `AnalysisScreen.tsx`

**Designkälla:** `docs/design/d1-v2/png/analys-{light,dark}.png`; riktning i `docs/design/d1/README.md` → "Skärm för skärm".

| Prop | Typ | Not |
|---|---|---|
| `steps` | `Partial<Record<'swing'\|'frames'\|'rules'\|'shaft', { status: 'pending'\|'active'\|'done'; detail? }>>` | Fyra steg; etiketten byter form vid klart ("Bedömer reglerna" → "Reglerna bedömda"). |
| `frames` | `Partial<Record<RulePhase, ImageSourcePropType>>` | Sex nyckelbilder; platshållare om saknas. |
| `activePhase`, `onSelectPhase?` | `RulePhase` | Visas stort med "Bild n av 6 · Fas"; markeras i raden. |
| `overlay?` | `ReactNode` | Lager över stora bilden (skelett). |
| `ruleCount` | `number` | "Bedömer 5 regler". |
| `remainingSeconds` | `number \| null` | "Ungefär 8 sekunder kvar"; `null` döljer raden. |
| `progress` | `0–1` | Framdriftsstapel. |
| `onCancel` | `() => void` | "Avbryt". |

Exporterar `PHASE_ORDER` och `PHASE_SHORT` (Uppställn., Baksving, Topp, Nedsving, Träff, Avslut). Kända förenklingar (`// OSÄKER` i koden): stillastående båge för aktivt steg, hel accent i stället för gradient i stapeln.

## Resultat, Regler, Historik — gemensamt
Rena presentationskomponenter i `apps/mobile/src/screens/`. All data och alla handlingar via typade
props — inga hooks mot state, ingen navigation, inga nätanrop. Lokalt UI-tillstånd (utfälld rad,
mätt bredd) är det enda de håller själva. Ljust/mörkt via `useTheme()`, svensk text.

Ren härledning ligger i `screens/reviewLogic.ts` (test: `reviewLogic.test.ts`, körs av rotens `npm test`).

| Funktion | Gör |
| --- | --- |
| `orderResultRows(rules, focus)` | Fokus → missar (öppna) → godkända (stängda) → kan inte avgöras; stabil inom grupp, fokus dedupliceras |
| `resultScore(rules, focus)` | Ringen: godkända av bedömbara (pass+fail) |
| `framesLabel(frames)` | "Se i bild 5 och 6" (1-baserat, se OSÄKER) |
| `PHASE_LABEL`, `PHASE_SHORT`, `ANGLE_LABEL_SV` | Svenska etiketter |
| `requiredAngleText`, `weightDots` | "Kräver vinkel framifrån", vikt 1–3 som prickar |
| `groupByDay`, `dayLabel`, `shortDate`, `clock` | Historikens dagar ("Idag", "Igår", "Torsdag 22 okt") |
| `historySwingView(entry)` | `HistoryEntry` → uppladdad-sving-rad (tumnagel, prickar, poäng, video rensad) |
| `sessionBar`, `passPercent`, `trendDelta`, `countLabel` | Sessionsstaplar, procent, trend i p.e. |

## Resultat — `ResultScreen`

Designkälla: `docs/design/d1-v2/png/resultat-{light,dark}.png`, `index.html` shot-3, d1 README "Resultat".

| Prop | Typ | Not |
| --- | --- | --- |
| `title` | `string` | Navrad, t.ex. "Idag 10:42" |
| `backLabel?`, `onBack?`, `onShare?` | | Utelämnad callback → knappen döljs |
| `analysis` | `Pick<SwingAnalysis, 'rules' \| 'focus_rule' \| 'overall_assessment'>` | Från `@swingcheck/core/types` |
| `headline?` | `string` | Kort rubrik ("Stark rotation"); utan → bara `overall_assessment` |
| `ruleInfo` | `Record<id, { title, drill? }>` | Titel + bibliotekets drill per `RuleResult.id` |
| `angle?`, `playbackRate?` | `CameraAngle`, `number` | Glas-chips över klippet |
| `posterUri?` | `string \| null` | Stillbild bakom tracern (ingen video-lib) |
| `tracer?`, `tracerMarks?` | `{x,y}[]` normaliserat 0–1, index | Volt-färgad bana + prickar |
| `phases?`, `phase`, `onPhaseChange` | `RulePhase` | Fasväljaren (standard Uppst./Topp/Nedsv./Träff/Avslut) |
| `onReadAloud`, `reading?` | | "Läs upp"/"Stoppa" — TTS hos ägaren |
| `onNext?`, `nextLabel?` | | "Nästa sving"; utelämnad (öppnad ur historiken) → dold |
| `onOpenFrames?` | `(frames, ruleId)` | "Se i bild …" |

Rad: VerdictMark + titel + `ConfidenceBar`; undertext = `short_verdict` (fallback `observation`).
Öppen rad: "Gör så här" (`suggestion` ?? `correction`), drill-kort (bibliotekets drill och/eller
`drill_suggestion`), länk "Se i bild …". "Kan inte avgöras" har ingen stapel och säger alltid varför.

## Regler — `RulesScreen`

Designkälla: `docs/design/d1-v2/png/regler-{light,dark}.png`, `index.html` shot-4, d1 README "Regler".

| Prop | Typ | Not |
| --- | --- | --- |
| `mode`, `onModeChange` | `RuleMode` (`state/settingsModel`) | Rekommenderat / Egna |
| `rules` | `ActiveRule[]` (`state/rulesModel`) | `deriveActiveRules(...).rules` |
| `angle` | `CameraAngle` | Accent-chip + "Bedöms säkert …" |
| `levelLabel`, `goalLabel?` | `string` | Övriga chips |
| `focusRuleId?` | `string` | ★ Fokus |
| `enabledIds`, `onToggle` | `ReadonlySet<string>`, `(id, on)` | Reglage per regel |
| `unavailable?` | `LibraryRule[]` | Nedtonade i Rekommenderat ("Kräver vinkel …") |
| `onAdd`, `onApply` | | "+" och "Använd N regler" (N = påslagna och bedömbara) |

Egna-läget: egna regler som inte matchar vinkeln (`matchesAngle: false`) visas nedtonade. Varje
`validation: 'unvalidated'` får märket "Ej validerad" + en förklarande fotnot (F-1/ADR-0005).

## Historik — `HistoryScreen`

Designkälla: `docs/design/d1-v2/png/historik-{light,dark}.png`, `index.html` shot-6, d1 README "Historik".

| Prop | Typ | Not |
| --- | --- | --- |
| `trend?` | `{ ruleTitle, points: {timestamp, value 0–100}[], percent, windowLabel }` | Fokusregelns trend; utelämnad → inget kort |
| `items` | `(HistorySession \| HistorySwing)[]` | Grupperas per lokal dag, nyast först |
| `onOpen` | `(item) => void` | Tryck på rad |
| `now` | `number` | Injiceras (ren, testbar) |

`HistorySession`: `title`, `startedAt`, `endedAt`, `swings: {passed, assessable}[]` → en stapel per sving
(höjd ≈ andel godkända, grön från hälften, streckad = ingen dom). `HistorySwing` =
`historySwingView(entry)` + `kind: 'swing'`: tumnagel (första bilden om inte rensad), prickar
(fokus först som rundad fyrkant, okänd = streckad ring), "Video rensad · resultatet finns kvar" (N-3.5).

Livesessionen skriver i dag inga sessionsposter i `HistoryEntry` (bara `sessionId`); sammanställning
till `HistorySession` görs av skärmens ägare.
