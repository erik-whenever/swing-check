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
