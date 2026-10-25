# W-2 — Identitet per installation + tak per identitet

Status: **klientdelen klar** (branch `dirigent/W-2`). **Worker-delen är en spec** — `worker/` är inte ändrad;
ändringen nedan kräver Eriks godkännande (prod-deploy + D1-migrering).

## Varför
Betan har inget inloggat konto. För att kostnaden ska gå att styra och följa per testare behöver Workern veta
*vilken installation* ett anrop kommer från, utan att appen bär en hemlighet.

## Identiteten

| | Beslut |
|---|---|
| Format | UUID v4, gemener (122 slumpbitar). `packages/core/src/lib/installId.ts` → `formatInstallId`, `isValidInstallId`, `resolveInstallId`. |
| Slump | `expo-crypto` `getRandomBytes(16)` (CSPRNG: `SecRandomCopyBytes` / `SecureRandom`). |
| Lagring | `expo-secure-store` (iOS Keychain, Android Keystore-krypterat), nyckel `swingcheck.installId`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` — följer inte med i backup till ny enhet. |
| Livslängd | Skapas vid första start, återanvänds sedan. Ogiltigt lagrat värde ersätts (Workern ser bara ett format). |
| Header | `X-SwingCheck-Install: <uuid>` på varje analysanrop, via `configureApi({ headers })` i `apps/mobile/src/coreSetup.ts`. |
| Fel | Går Keychain inte att läsa/skriva skickas ingen header; appen fungerar lokalt som vanligt (lokalt-först). |

Läses **synkront** i `coreSetup` (före första render), så headern finns innan första analysen kan starta.

`// OSÄKER:` iOS behåller Keychain-poster när appen raderas, så en ominstallation på samma telefon behåller oftast
identiteten (Android gör det inte). Ofarligt för taket; "installation" ligger närmare "enhet" på iOS.

**Ny native-dep:** `expo-secure-store` och `expo-crypto` (gratis Expo-moduler). Dev-klienten måste byggas om
(`eas build --profile development`) innan appen startar — annars saknas native-modulen.

### Webben skickar INTE headern
Workerns CORS svarar `Access-Control-Allow-Headers: Content-Type`. En ny custom header från webbläsaren utlöser en
preflight som då misslyckas → **varje webbanalys skulle brytas**. Webben rörs därför inte i W-2. Native-fetch gör
ingen preflight och påverkas inte. Webben kan få en identitet först när Worker-ändringen nedan (som lägger till
headern i `Allow-Headers`) är deployad — och behöver den inte i betan.

## Ärligt om säkerheten
Identiteten är en **identifierare, inte en credential**. Den som läser trafiken (eller appens bundle) kan skicka
valfri UUID, och `Origin: swingcheck://se.swingcheck.app` kan förfalskas med curl redan i dag. Per-identitet-taket
stoppar alltså en *vanlig* testare som går överstyr, inte en angripare som roterar UUID:er. Mot det senare skyddar
bara **det globala dygnstaket** (`DAILY_CALL_CAP`, finns) — det är plånboksgarantin tills App Attest finns.

## Interimsregel (tills App Attest) — det Workern ska göra

1. **Origin-allowlist** som i dag (`swingcheck://se.swingcheck.app` läggs till i `ALLOWED_ORIGINS`, se
   `analys-lagring.md`).
2. **Globalt dygnstak** som i dag (`DAILY_CALL_CAP`, D1 `api_usage`). Räknas först, så roterade UUID:er aldrig tar
   sig förbi det.
3. **Tak per identitet och UTC-dygn:** `INSTALL_DAILY_CALL_CAP` (förslag 40 anrop) och
   `INSTALL_DAILY_TOKEN_CAP` (förslag 400 000 in+ut-tokens). Över → `429 install_cap_reached`.
4. **Saknad/ogiltig header** → anropet räknas på hinken `anon` med samma tak. Webben hamnar där och delar ett tak —
   acceptabelt i betan (webben är utvecklarens verktyg, inte testarnas). `// OSÄKER:` vill Erik att webben ska vara
   undantagen från per-identitet-taket sätts `ANON_DAILY_CALL_CAP` högre; förslag: samma som globala taket.
5. **Fail-open** som befintliga taket: saknas D1 eller misslyckas skrivningen släpps anropet igenom (taket skyddar
   plånboken men får aldrig bli det som stoppar en analys). Det globala taket och Anthropic-kontots egen
   spend-gräns är sista skyddet.
6. **Loggning av förbrukning:** efter svaret läses `usage` ur Anthropic-svaret och skrivs per identitet och dygn
   (anrop, input-, output-, cache-read-, cache-write-tokens). Kostnad per analys = summa tokens × prislistan i
   `api.ts` — räknas vid uttag, inte i Workern, så prislistan bara finns på ett ställe.

**Lagring:** befintlig D1 (`swingcheck-logs`). Ingen KV, ingen ny tjänst. En rad per identitet och dygn.

### Datavård
Identiteten är pseudonym (slump, inte kopplad till person) men räknas som personuppgift enligt GDPR om den kan
kopplas till en testare. Rader äldre än 90 dagar bör rensas — **inte automatiskt i W-2** (permanent radering →
Erik); förslaget är ett manuellt `DELETE … WHERE day < date('now','-90 day')` tills en cron behövs.

## App Attest-planen (efter betan, före öppen release)

Mål: Workern ska kunna lita på att anropet kommer från *vår* oförändrade app på en riktig enhet — utan att någon
hemlighet ligger i klienten.

1. Appen genererar en App Attest-nyckel (`DCAppAttestService.generateKey`), hämtar en engångsutmaning från Workern
   (`GET /api/attest/challenge`) och attesterar nyckeln hos Apple (`attestKey`).
2. Workern verifierar attesteringen (Apples certkedja, `rpIdHash` = `<TeamID>.se.swingcheck.app`, `aaguid` prod) och
   sparar `keyId → publik nyckel, räknare` i D1. **`keyId` blir identiteten** och ersätter UUID:n (som då bara
   behövs för att migrera förbrukningshistorik).
3. Varje analys bär en assertion (`generateAssertion` över hash av body + utmaning). Workern verifierar signatur och
   att räknaren ökar; utan giltig assertion → 401.
4. Android: Play Integrity motsvarar, men Play är utanför betan.

Kräver en Expo-modul för App Attest (t.ex. `@expo/app-integrity` om den finns för SDK 58, annars en egen liten
Swift-modul likt `modules/pose`) och Apple Developer-kontot (finns, krävs redan för TestFlight). Ingen extra
kostnad. Sim-builds saknar App Attest → behåll interimsregeln som fallback för dev-klienter via en flagga.

## Worker-ändring (kodskiss — INTE applicerad)

### Migrering `worker/migrations/0003_create_install_usage.sql`
```sql
-- Per-installation usage (W-2). One row per identity per UTC day.
CREATE TABLE IF NOT EXISTS install_usage (
  install_id         TEXT    NOT NULL,           -- UUID v4 from X-SwingCheck-Install, or 'anon'
  day                TEXT    NOT NULL,           -- UTC date, YYYY-MM-DD
  calls              INTEGER NOT NULL DEFAULT 0, -- proxied calls (429s excluded)
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (install_id, day)
);
```

### `worker/worker.ts`
```ts
// CORS: allow the header so the web can opt in later. Additive — Content-Type stays.
const CORS_METHOD_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-SwingCheck-Install',
  'Access-Control-Max-Age': '86400',
};

const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_INSTALL_DAILY_CALL_CAP = 40;
const DEFAULT_INSTALL_DAILY_TOKEN_CAP = 400_000;

function installIdOf(request: Request): string {
  const raw = request.headers.get('X-SwingCheck-Install')?.trim() ?? '';
  return INSTALL_ID_RE.test(raw) ? raw : 'anon';
}

/** Today's usage for one identity, or null if unavailable (fail-open). */
async function installUsage(env: Env, id: string, day: string) {
  if (!env.DB) return null;
  try {
    return await env.DB.prepare(
      `SELECT calls, input_tokens + output_tokens AS tokens
         FROM install_usage WHERE install_id = ? AND day = ?`,
    ).bind(id, day).first<{ calls: number; tokens: number }>();
  } catch (err) {
    console.warn('[install-cap] read failed — letting the request through', String(err));
    return null;
  }
}

async function recordInstallUsage(env: Env, id: string, day: string, u: AnthropicUsage) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO install_usage
         (install_id, day, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
       VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(install_id, day) DO UPDATE SET
         calls = calls + 1,
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
         cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens`,
    ).bind(id, day, u.input_tokens ?? 0, u.output_tokens ?? 0,
           u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0).run();
  } catch (err) {
    console.warn('[install-usage] write failed', String(err));
  }
}

// In handleProxy, after the existing global countCall/cap check and before the upstream fetch:
const installId = installIdOf(request);
const day = new Date().toISOString().slice(0, 10);
const mine = await installUsage(env, installId, day);
const callCap = positiveIntEnv(env.INSTALL_DAILY_CALL_CAP, DEFAULT_INSTALL_DAILY_CALL_CAP);
const tokenCap = positiveIntEnv(env.INSTALL_DAILY_TOKEN_CAP, DEFAULT_INSTALL_DAILY_TOKEN_CAP);
if (mine && (mine.calls >= callCap || mine.tokens >= tokenCap)) {
  console.warn('[install-cap] reached', JSON.stringify({ installId, ...mine, callCap, tokenCap }));
  return json({ error: 'install_cap_reached',
                message: 'Dagens analyser för den här installationen är slut. Försök igen efter midnatt UTC.' },
              429, cors);
}

// Replace the streaming passthrough: buffer the (small, JSON) answer so usage can be read.
const upstreamText = await upstream.text();
if (upstream.ok) {
  try {
    const usage = (JSON.parse(upstreamText) as { usage?: AnthropicUsage }).usage;
    if (usage) {
      // waitUntil: the client gets its answer without waiting on the D1 write.
      ctx.waitUntil(recordInstallUsage(env, installId, day, usage));
      console.log('[usage]', JSON.stringify({ installId, ...usage }));
    }
  } catch { /* unparseable body: pass it through untouched, as today */ }
}
return new Response(upstreamText, { status: upstream.status, headers: { 'Content-Type': 'application/json', ...cors } });

interface AnthropicUsage {
  input_tokens?: number; output_tokens?: number;
  cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
}
// Env additions: INSTALL_DAILY_CALL_CAP?: string; INSTALL_DAILY_TOKEN_CAP?: string;
// handleProxy needs `ctx: ExecutionContext` passed from fetch().
```

Noter för granskaren:
- **Läs-sedan-skriv är inte atomärt**: två parallella anrop från samma identitet kan båda passera vid gränsen. En
  överskridning med ett anrop är acceptabel; det globala taket är fortfarande atomärt (`RETURNING`).
- Taket kontrolleras mot *dagens summa hittills*, inte mot det kommande anropets tokens (okända i förväg) — ett
  anrop kan alltså gå över tokentaket en gång, sedan stängs det.
- Buffring av svaret i stället för stream: svaret är en JSON på några kB och `api.ts` läser det ändå med
  `response.json()`. Ingen beteendeändring för klienten.
- `wrangler.toml`: lägg till `INSTALL_DAILY_CALL_CAP = "40"` och `INSTALL_DAILY_TOKEN_CAP = "400000"` under `[vars]`.
- Tester i `worker.test.ts`: header saknas → `anon`; ogiltig header → `anon`; tak nått → 429 `install_cap_reached`;
  D1 saknas → släpps igenom; usage skrivs med rätt summor; preflight med `X-SwingCheck-Install` → 204 med headern i
  `Allow-Headers`.

### Uttag av förbrukning
```sql
SELECT install_id, day, calls,
       ROUND((input_tokens*3.0 + output_tokens*15.0 + cache_write_tokens*3.75 + cache_read_tokens*0.3)/1e6, 4) AS usd,
       ROUND((input_tokens*3.0 + output_tokens*15.0 + cache_write_tokens*3.75 + cache_read_tokens*0.3)/1e6/calls, 4) AS usd_per_analysis
  FROM install_usage ORDER BY day DESC, usd DESC;
```
Priserna = `CLAUDE_SONNET_4_5_PRICING` i `packages/core/src/lib/api.ts`; byts modell, byts båda.

## Återstår (kräver Erik)
1. Godkänn och applicera Worker-ändringen (migrering `0003` mot prod-D1 + deploy).
2. Lägg `swingcheck://se.swingcheck.app` i `ALLOWED_ORIGINS` (redan på listan från N-3.5).
3. Bygg om dev-klienten (nya native-moduler) och verifiera på enhet att headern når Workern (`wrangler tail` →
   `[usage]`-raden).
4. App Attest före öppen release.
