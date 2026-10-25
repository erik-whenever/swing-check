# Navigation (N-3.6 del 6)

Navigationsskal och containrar i `apps/mobile/src/app/`. Skärmarna i `src/screens/` förblir rena
(se `skarmar.md`); allt som läser state eller navigerar ligger här.

## Rot

`apps/mobile/index.ts` → `src/app/App.tsx`:

```
ThemeProvider → AppStateProvider → SafeAreaProvider → Navigation
```

`Navigation` väntar på hydrering (`useSettings().ready`, visar bara bakgrunden), visar sedan
**Välkommen** om `settings.welcomeSeen` är `false`, annars navigatorn. "Kom igång … Börja svinga" och
"Hoppa över" sätter `welcomeSeen: true` (nytt fält i `AppSettings`, standard `false`, bara `true`
räknas vid inläsning).

Bibliotek: `@react-navigation/native` + `native-stack` + `bottom-tabs` (v7), `react-native-screens`
och `react-native-safe-area-context` i Expo 58-versioner (`expo install`). **Nya native-moduler →
dev-klienten måste byggas om.**

## Rutter (`src/app/routes.ts`)

| Navigator | Rutt | Container | Not |
|---|---|---|---|
| Stack | `Tabs` | flikarna nedan | startrutt |
| Stack | `Analysis` | `AnalysisContainer` | Analys pågår; svep-tillbaka avstängt, "Avbryt" = tillbaka |
| Stack | `Result` `{ entryId, fromHistory? }` | `ResultContainer` | från Historik: "Nästa sving" dold |
| Stack | `Dev` | `DevScreen` | registreras bara i `__DEV__` |
| Flik | `Swing` "Sving" | `UploadContainer` | Uppladdning |
| Flik | `Session` "Session" | `LiveSessionContainer` | `LiveSessionScreen` med lokalt sessions-tillstånd |
| Flik | `Rules` "Regler" | `RulesContainer` | |
| Flik | `History` "Historik" | `HistoryContainer` | |

Flikfältet följer d1-v2 `.tabbar`: ikoner ritade från `#t-swing/#t-session/#t-rules/#t-history`
(`TabIcon.tsx`), accent för vald, `faint` för övriga, `chrome`-yta med hårfin toppkant. Ingen blur
(`// OSÄKER`). Skärmarna ritar kant till kant; containrarna lägger `paddingTop` = säker yta.

## DevScreen

I dev-byggen: **långtryck på fliken Historik** öppnar `Dev` (med systemets rubrikrad och tillbaka).
I release-byggen finns rutten inte.

## Containrar (`src/app/containers.tsx`)

- **Uppladdning:** vinkel (startar på `settings.defaultAngle`), svingfönster, regelsetets rad från
  `useActiveRules`. Klippval och pipeline saknas → `uploadPipeline.ts` (stubb, inga nätanrop).
  "Bedöm svingen" är aktiv bara i `__DEV__` (för att nå Analys-skärmen) tills pipelinen finns.
  Kameraknappen går till Session-fliken.
- **Analys:** visar stubbens viloläge (inga steg klara, 0 %).
- **Regler:** `useRuleSelection` + `useActiveRules`. Att slå av en rekommenderad regel gör om setet
  till "Egna" med rekommendationen minus regeln (`// OSÄKER`, produktbeslut). "+" är TODO.
  "Använd N regler" går till Sving.
- **Historik:** varje `HistoryEntry` blir en uppladdad-sving-rad (`historySwingView`); sessioner
  grupperas inte än. Trendkort utelämnas. Tryck → `Result`.
- **Resultat:** `useHistoryEntry(entryId)`; regeltitlar/drill från `RULE_LIBRARY` (engelska i core,
  `// OSÄKER`). "Läs upp" → `useSpeech().readAloud` (variant `full`, barge-in); tystnar när skärmen lämnas.
- **Livesession:** `liveSessionState.ts` (ren reducer, testad): status Redo/Analyserar/Pausad, klocka
  (går medan fliken är i fokus, pausar när man lämnar den), svingräknare, senaste domar. Skärmen hålls
  vaken (`expo-keep-awake`) medan fliken är i fokus. Kameran = mörk platshållare; ljudvägschip dolt.
  TODO(N-3.4): livepipelinen dispatchar `swingCaptured`/`swingAnalyzed` och anropar `enqueueLive`.
  Paus/Avsluta tystar talet; Avsluta nollställer och går till Sving.

## Kvar

Klippval + pipeline (uppladdning → analys → `addSwing` → `Result`), livepipeline (kamera + svingdetektion
→ reducer + `enqueueLive`), sessionsrader och trend i Historik, egen-regel-väljare.
