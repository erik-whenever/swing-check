# SwingCheck

Mobil-först PWA som analyserar en golfsving: filma svingen, appen extraherar nyckelbildrutor och
låter Claude bedöma dem mot dina coaching-regler. Resultatet visas per regel (pass/fail/cannot_determine)
med visuell evidens, förslag och drills — och kan läsas upp med röst för handsfri träning på range.

- **Vad/varför (arkitektur, domänmodell, designbeslut):** [KONTEXT.md](KONTEXT.md)
- **Aktuellt läge (gjort/pågår/horisont):** [STATUS.md](STATUS.md)
- **Beslut & öppna frågor:** [docs/oppna-fragor.md](docs/oppna-fragor.md)
- **Arkitekturbeslut:** [docs/adr/](docs/adr/)

## Kom igång

```bash
npm install
cp .env.example .env   # fyll i värdena (se nedan)
npm run dev            # lokal utveckling — använd alltid detta för att verifiera
```

> Verifiera alltid via `npm run dev`, inte en build — PWA:ns service worker kan servera gammal cachad kod.

## Skript

| Kommando | Gör |
| --- | --- |
| `npm run dev` | Lokal utvecklingsserver (Vite). |
| `npm run build` | `tsc -b && vite build`. |
| `npm run lint` | ESLint. |
| `npm run preview` | Bygger och kör Workern lokalt via `wrangler dev`. |
| `npm run deploy` | Bygger och `wrangler deploy`. |

## Miljövariabler

| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Cloudflare Worker som proxar Anthropic-API:t. |
| `VITE_SUPABASE_URL` | nej | Aktiverar cross-device-historik (tillsammans med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Visar bildrute-preview + 🐞 Logs-panel under utveckling. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Sätts som secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |

## Backend

En enda Cloudflare Worker (`worker/worker.ts`) med två ansvar: proxa Anthropic (så att API-nyckeln
aldrig når klienten) och ta emot klientens ERROR-loggar på `/api/log` (lagras i D1).

## Supabase-historik (valfritt)

Sätts båda `VITE_SUPABASE_*` speglas varje analyserad svings **metadata + resultat** till tabellen
`swing_records` (videoblobbar och frames stannar lokalt i IndexedDB). Historik läses då i första hand
från Supabase och faller tillbaka till IndexedDB. Utan variablerna kör appen IndexedDB-only. Auth finns
ännu inte, så `user_id` är `null`.

```sql
create table swing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  created_at timestamptz default now(),
  camera_angle text,
  focus_rule_id text,
  overall_assessment text,
  frame_quality text,
  results jsonb,
  cannot_determine_reasons text[]
);
```

## Teknik

React 19 · TypeScript · Vite 8 · Tailwind v4 · Zustand · vite-plugin-pwa · Cloudflare Workers + D1 ·
IndexedDB (idb-keyval) · Supabase (valfritt) · Claude Sonnet 4.5.
