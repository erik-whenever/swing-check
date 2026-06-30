# CLAUDE.md — SwingCheck

Alltid-laddad baslinje. Läs [KONTEXT.md](KONTEXT.md) för arkitektur/varför och [STATUS.md](STATUS.md) för aktuellt läge **innan** du börjar koda.

## Pekare
- **Vad/varför:** [KONTEXT.md](KONTEXT.md)
- **Levande status (gjort/pågår/horisont):** [STATUS.md](STATUS.md)
- **Beslut & öppna frågor (numrerade):** [docs/oppna-fragor.md](docs/oppna-fragor.md)
- **Arkitekturbeslut:** [docs/adr/](docs/adr/)

## Hårda gränser
- **Commitar aldrig utan att jag ber om det.** Föreslå branch innan commit om vi står på `main`.
- **API-nyckeln (`ANTHROPIC_API_KEY`) når aldrig klienten** — all Anthropic-trafik via Workern.
- **Bryt inte den lokalt-först-garantin:** appen måste fungera utan Supabase/auth (env-varabler kan saknas → no-op).
- **Eskalera före:** permanent radering, skrivning mot prod, kostnadsmedförande API-anrop (t.ex. riktiga Claude-anrop i test).
- **Verifiera frame-/SW-ändringar via `npm run dev`** — service worker-cache serverar annars gammal kod.

## Arbetsströmsdisciplin
- **En arbetsström per commit**, ärlig commit-titel. Funktionalitet göms aldrig under en refaktoreringsetikett.
- **En sammanhållen uppgift per session** — blanda inte in orelaterade ändringar.
- **Flagga osäkerhet i koden** med `// OSÄKER: …` + kort riskbedömning, hellre än att gissa.

## Stil (mina preferenser)
- Terse, konkreta svar. Max 2–3 rader om inte mer efterfrågas.
- En motiverad rekommendation, inte en lista med alternativ.
- Ärlig invändning förväntas — ingen tillmötesgående för dess egen skull.
- Konsekvens framför smarthet i verktyg och struktur.

## Kommandon
- `npm run dev` — lokal utveckling (använd alltid detta för att verifiera, ej en build).
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — eslint.
- `npm run deploy` — bygger och `wrangler deploy`.
