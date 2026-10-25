# UI-komponenter och tillståndslager (N-3.6)

**Datum:** 2026-10-25 · **Ström:** N · **Status:** komponenter (del 1), rena modeller (del 2) och
hooks/persistens (del 3) byggda och testade. Navigation, de sju skärmarna och TTS återstår (se *Kvar*).

Två lager som skärmarna i `apps/mobile/src/screens/` bygger på:

- `apps/mobile/src/ui/` — designtokens och baskomponenter ur `docs/design/d1-v2`. Importera från `../ui`.
- `apps/mobile/src/state/` — inställningar, svinghistorik och aktiv regeluppsättning, sparat lokalt i
  JSON-filer. Importera från `../state`.

Ingen Supabase, inget nätverk: appen fungerar fullt ut offline från första start (lokalt först).

## UI (`src/ui`)

### Tokens (`tokens.ts`)

Ändra värden här, aldrig i komponenterna.

| Export | Innehåll |
|---|---|
| `palettes.light` / `.dark` | Färgtokens (`ColorToken`): `bg surface raised line lineStrong fg fgDim muted faint accent accentTint onAccent pass/passTint fail/failTint unk/unkTint gold/goldTint volt chrome segOn`. `volt` endast för maskinseende (tracer, skelett, live-status) — aldrig knappar eller domar. |
| `live` | Fasta färger för livesessionen (alltid mörk, läses på 2–4 m). |
| `space` | Bas 4 pt: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32`. |
| `radius` | `card 20 · inner 14 · icon 12 · pill 999`. |
| `hitSlop` | 44 — minsta träffyta (HIG). |
| `shadows` | `card`, `segOn`, `primary` per schema, som `boxShadow`-strängar. |
| `typeScale` | `largeTitle hello title1 title2 headline button segment chip eyebrow brand` (Outfit) och `body callout subhead footnote caption` (systemfont, iOS-storlekar). |

### Tema (`theme.tsx`, `fonts.ts`)

- `ThemeProvider` i roten laddar Outfit (`useOutfitFonts`) och följer systemets ljus/mörk. Nästlad med
  `scheme="dark"` tvingar den mörkt, t.ex. runt livesessionen.
- `useTheme()` ger `{ scheme, colors, shadows, space, radius, fontsReady }`. Fungerar även utan provider
  (systemschema, systemfont) — DevScreen behöver alltså ingen omkoppling.

### Komponenter

| Komponent | Props (utöver `style`) | Användning |
|---|---|---|
| `Text` | `variant` (typeScale-nyckel, standard `body`), `color` (token eller rå färg), `tnum`, `weight` | All text. `textStyle()`/`resolveColor()` för egna komponenter. |
| `Card` | `padding` (16), `focus` | Kort; `focus` = guldmarkerat FOKUS-kort i resultatet. |
| `Button` | `title`, `variant` `primary`/`secondary`/`ghost`, `icon`, Pressable-props | Pillerknapp, 56 pt (ghost 44). `useButtonForeground(variant)` ger ikonfärgen. |
| `Segmented` | `options`, `value`, `onChange`, `accessibilityLabel` | Segmentväljare (t.ex. vinkel, språk). Generisk över värdetypen. |
| `Chip` | `label`, `tone` `neutral`/`accent`/`glass`, `icon`, `tnum` | Små etiketter; `glass` över kamerabild. |
| `SectionLabel` | `children` (text), `trailing` | Sektionsrubrik med valfri höger sida. |
| `VerdictMark` | `verdict` `pass`/`fail`/`unknown`, `size` (30; live 52), `onLive` | Regeldomen. |
| `ConfidenceBar` | `value` 0–1, `showLabel` | Säkerhetsstapel med procent. |
| `BrandHeader` | `greeting`, `highlight`, `trailing` | Hemskärmens rubrik. `greetingFor(date)` ger dygnshälsningen. |

## Tillstånd (`src/state`)

### Rena modeller (del 2, inga expo-importer)

| Fil | Ansvar |
|---|---|
| `settingsModel.ts` | `AppSettings` (`language`, `mediaCapMb`, `level`, `defaultAngle`, `ruleMode`, `customRuleIds`). Fält-för-fält-validering: ett trasigt fält faller tillbaka utan att de andra tappas. Skjutreglaget för lagringstaket: `MEDIA_CAP_MIN_MB`/`MAX`/`STEP`. |
| `historyModel.ts` | `HistoryEntry` (= webbens `SwingRecord` med fil-URI:er). Trasiga rader hoppas över en och en, nyast först. Resultat och metadata tas aldrig bort — bara media, via retention, som flaggar `videoPurged`/`framesPurged` ("video rensad"). |
| `rulesModel.ts` | `deriveActiveRules`: rekommenderad uppsättning via core:s `recommendRules` eller användarens egna val. Allt är `unvalidated` ("ej validerad") tills V-1 har mätt. `analysableRules` filtrerar bort egna val som vinkeln inte kan bedöma. |
| `errorText.ts` | `analysisErrorView(err, språk)`: titel, text och om "försök igen" är meningsfullt, bl.a. för `UsageCapReachedError` (per installation resp. dagligt tak). |

### Store och persistens (del 3)

```
skärmar ── hooks.ts ── AppStateProvider ── appStore.ts ── TextStore
                                              │              ├─ fileStore.ts (expo-file-system, appen)
                                              │              └─ createMemoryStore (tester)
                                              └─ enforceMediaCap (mediaStore.ts)
```

- **`storage.ts`** — `TextStore { read(name), write(name, text) }`: hela filsystemsytan bakom ett litet
  interface. `read` ger `null` för en fil som saknas och kastar vid riktigt I/O-fel. `createSerialWriter`
  ser till att en fil aldrig skrivs två gånger samtidigt och slår ihop en skur ändringar till den senaste.
- **`fileStore.ts`** — JSON-filerna ligger i `Paths.document/state/` (`settings.json`, `history.json`).
  Skrivning sker till `<namn>.tmp` och flyttas sedan över originalet, så ett avbrott mitt i skrivningen
  lämnar den gamla filen hel.
- **`appStore.ts`** — `createAppStore({ store, enforceMediaCap })`: `getState`, `subscribe`, `hydrate`,
  `updateSettings`, `addSwing`, `flush`. Ren TypeScript, testad med vitest utan React Native.
  - `updateSettings` tar ett objekt eller en funktion `(nuvarande) => patch` (för växlingar — två snabba
    tryck skriver aldrig över varandra). Sänkt lagringstak verkställs direkt på historiken.
  - `addSwing` lägger till (eller ersätter på id) och kör sedan `enforceMediaCap` med aktuellt tak.
  - Åtgärder före inläsningen väntar på den, så de hamnar ovanpå den sparade filen.
- **`AppStateProvider.tsx`** — skapar storen med `createFileStore()` + `mediaStore.enforceMediaCap` och
  läser in vid montering. Lägg den en gång nära roten (innanför `ThemeProvider`). `store`-propen tar en
  injicerad store (förhandsvisningar).
- **`hooks.ts`** — läser via `useSyncExternalStore`:

| Hook | Ger |
|---|---|
| `useSettings()` | `{ settings, updateSettings, ready }` |
| `useHistory()` | `{ entries, stats, addSwing, ready }` — `stats` = antal och antal "video rensad". |
| `useHistoryEntry(id)` | En post, eller `undefined`. |
| `useActiveRules({ angle?, goalPhase?, accuracy? })` | `ActiveRuleSet` för nästa analys. |
| `useRuleSelection()` | `{ mode, customRuleIds, setMode, toggleRule, setCustomRuleIds }` för regelväljaren. |
| `useHydrated()` / `useAppState()` | Inläst ja/nej / hela ögonblicksbilden inkl. `persistError`. |

Före inläsningen (`ready === false`) har state standardvärden — visa inget användarspecifikt då.

### Dataskydd

I prioritetsordning, alla testade i `appStore.test.ts`:

1. **En fil som finns men inte gick att läsa skrivs aldrig över under sessionen.** Ändringar ligger kvar
   i minnet och `persistError` säger det. Annars skulle ett enda läsfel ersätta hela historiken med en tom.
2. **En fil som inte är giltig JSON, eller en historik där rader fick hoppas över, kopieras till
   `<namn>.corrupt-<ms>.json` före första överskrivningen.** Misslyckas kopian gäller regel 1. Inget raderas.
3. **Resultat tas aldrig bort.** Bara `enforceMediaCap` (mediefiler) körs på historiken; ett fel där loggas
   och svingen sparas ändå.

## Tester

`apps/mobile/src/state/*.test.ts` körs av rotens `npm test` (vitest hittar `**/*.test.ts`) och
typkontrolleras av rotens `tsc -b` via `apps/mobile/tsconfig.test.json` — vitest är ett rotberoende, så
appens egen `tsconfig.json` utesluter testerna. Tester får bara importera expo-fria moduler.

| Fil | Täcker |
|---|---|
| `models.test.ts` | settings-, historik-, regel- och felmodellerna. |
| `storage.test.ts` | minnesstore, seriell skrivare (ingen samtidighet, sammanslagning, fel, flush). |
| `appStore.test.ts` | inläsning, uppdateringar, retention, dataskyddsreglerna. |

Hooks och `fileStore` är tunna och provas på enhet.

## Beslut

- **Egen liten store i stället för zustand/AsyncStorage.** Inga nya beroenden; `useSyncExternalStore`
  räcker för två värden, och storen testas utan React.
- **JSON-filer via expo-file-system, inte en databas.** Historiken är några KB per sving (media ligger i
  egna filer); en fil räcker långt efter en säsong och följer webbens `SwingRecord`-form.
- **`state/` under `Paths.document`** (säkerhetskopieras av iOS, osynlig för användaren), inte `cache`
  som OS:et får tömma.

`// OSÄKER:` (i `fileStore.ts`) att `move({ overwrite: true })` är en atomär ersättning på iOS/Android är
väntat men inte provat på enhet.

## Kvar

1. Navigation och de sju skärmarna (byggs i `src/screens/`), som kopplar `AppStateProvider` i roten.
2. TTS i appen via `ttsConfigFor()` ur core, styrd av `settings.language`.
3. Enhetsprov: inläsning/sparning över omstart, och att `enforceMediaCap` raderar riktiga filer.
