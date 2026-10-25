# Skärmar: Resultat, Regler, Historik (N-3.6 del 5)

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
