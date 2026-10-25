# TestFlight (N-6 steg 1) — intern beta via EAS

Intern TestFlight för Erik, byggd i molnet med EAS (ingen Mac). JS-ändringar når telefonen via EAS Update
utan nytt bygge; native-ändringar kräver nytt bygge och hålls automatiskt borta från gamla binärer.

## 📱 Erik — sammanfattning (3 steg)

Kör från `apps/mobile/` **när N-3.6:s uppladdningspipeline fungerar**:

1. `npx eas-cli login` och sedan `npx eas-cli build -p ios --profile production` (logga in med Apple-ID när den frågar; låt EAS skapa certifikat och provisioning-profil).
2. `npx eas-cli submit -p ios --latest` (skapar appen i App Store Connect första gången om den saknas).
3. Öppna TestFlight-appen på iPhonen när Apple har processat bygget (ca 5–30 min) och installera SwingCheck.

## Förutsättningar

- **Apple Developer Program** aktivt på Eriks Apple-ID (99 USD/år, redan befintligt — ingen ny kostnad).
- **Expo-konto** `erikhawerman` (äger projektet `354490e7-bf0e-4dff-b111-c0f3d446a335`). EAS gratisnivå räcker:
  ett begränsat antal iOS-byggen/månad i lågprioriterad kö och EAS Update upp till gratisnivåns MAU-gräns — långt
  över vad intern beta behöver. Inget betalt abonnemang krävs.
- Bundle-id `se.swingcheck.app` (står i `app.json`). Finns det inget App Store Connect-app-post skapar
  `eas submit` den interaktivt.
- Worker-URL:en (`https://swingcheck-api.swing-check.workers.dev/api/analyze`) bakas in via `env` i
  `eas.json`, och `swingcheck://se.swingcheck.app` står redan i Workerns `ALLOWED_ORIGINS`.

## Konfiguration (vad som är satt och varför)

| Var | Värde | Varför |
|---|---|---|
| `eas.json` `cli.appVersionSource` | `remote` | Repo:t har ingen incheckad `ios/` (CNG). EAS äger build-numret och räknar upp det (`autoIncrement`), så inget versionsbump behöver committas och två byggen kan aldrig få samma nummer (App Store Connect avvisar dubbletter). Marknadsversionen (`version` i `app.json`, nu `0.1.0`) styrs fortfarande lokalt. |
| `eas.json` `build.production` | `distribution: store`, `channel: production`, `autoIncrement`, `env.EXPO_PUBLIC_API_URL` | TestFlight-bygget. |
| `eas.json` `build.preview` | `distribution: internal`, `channel: preview`, samma `env` | Ad hoc-bygge till registrerade enheter utan TestFlight, om det behövs. |
| `eas.json` `build.development` | oförändrad | Dev-klienten som förut. |
| `eas.json` `submit.production.ios` | tom | Inga hemligheter i repo:t. **Valfritt för Erik:** efter första submit, fyll i `"ascAppId": "<App Store Connect → App Information → Apple ID>"` så slipper senare submits frågan. |
| `app.json` `runtimeVersion` | `{ "policy": "fingerprint" }` | Runtime-versionen är en hash av allt native (paket, config, `modules/pose`, `modules/shaft`, plugins). En JS-uppdatering kan därför **aldrig** landa i en binär med annan native-kod — med `appVersion` hänger det på att någon kommer ihåg att bumpa versionen. |
| `app.json` `updates.url` | `https://u.expo.dev/354490e7-…` | EAS Update-endpoint för projektet. |
| `app.json` `version` | `0.0.0` → `0.1.0` | App Store Connect kräver en riktig marknadsversion. |

`expo-updates` (`~58.0.18`) är installerad. I dev-klienten är den inaktiv (Metro serverar JS som förut).

## Kommandon i ordning

Alla från `apps/mobile/`.

```sh
npx eas-cli login                                  # en gång
npx eas-cli build -p ios --profile production      # molnbygge, ~15–40 min inkl. kö
npx eas-cli submit -p ios --latest                 # laddar upp senaste bygget till App Store Connect/TestFlight
```

JS-uppdatering till telefonen på rangen (inget nytt bygge):

```sh
EXPO_PUBLIC_API_URL=https://swingcheck-api.swing-check.workers.dev/api/analyze \
  npx eas-cli update --channel production --message "kort beskrivning"
```

> **Viktigt:** `env` i `eas.json` gäller bara byggen, inte `eas update` — bundlen byggs lokalt. Utan
> `EXPO_PUBLIC_API_URL` på kommandoraden får uppdateringen tom URL och analysen slutar fungera (appen kraschar
> inte; `ApiNotConfiguredError` före något anrop). Alternativt: lägg variabeln som EAS-miljövariabel i
> environment `production` och kör `eas update --environment production`.

Appen hämtar uppdateringen vid start och använder den vid **nästa** kallstart (stäng appen helt och öppna igen).

Kontroll av vilken runtime ett bygge/en uppdatering har: `npx expo-updates runtimeversion:resolve --platform ios`.

## Nytt bygge eller EAS Update?

| Ändring | Väg |
|---|---|
| TypeScript/JS i `src/`, `packages/core`, texter, logik, JS-only-beroenden | **EAS Update** |
| Bilder/fonter som laddas via JS | **EAS Update** |
| Nytt/uppgraderat native-paket (t.ex. `expo-image-picker`, `expo-video-thumbnails`), Expo SDK-uppgradering | **Nytt bygge** |
| Ändring i `modules/pose` eller `modules/shaft` (Swift/Kotlin/C++/podspec/nitrogen) | **Nytt bygge** |
| `app.json` som påverkar native (plugins, `infoPlist`, behörigheter, ikon, bundle-id), `package.json`-scripts | **Nytt bygge** |

Osäker? Kör `runtimeversion:resolve` före och efter ändringen: ändrad hash = nytt bygge krävs. En update
publicerad mot en ny hash når bara byggen med samma hash; gamla binärer behåller sin senaste kompatibla JS.

## Kända risker

- `// OSÄKER:` att handsatt `Origin` passerar orört från iOS (se `coreSetup.ts`) är overifierat på enhet —
  första riktiga analysen i TestFlight-bygget är testet. 403 syns direkt.
- Första submit kan kräva att Erik godkänner export compliance i App Store Connect; `ITSAppUsesNonExemptEncryption:
  false` står redan i `infoPlist`, så frågan bör inte komma.
- Intern testare = Erik själv (App Store Connect-användare); ingen extern granskning behövs för intern TestFlight.
