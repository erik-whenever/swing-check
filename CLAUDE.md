# CLAUDE.md — SwingCheck

Alltid-laddad baslinje. **Orientering, varje session (≈ 300 rader totalt):**
1. [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md) — nuläget (≤ 60 rader).
2. [KONTEXT.md](KONTEXT.md) — arkitektur, betan och varför, **innan** du börjar koda.
3. [docs/BACKLOG.md](docs/BACKLOG.md) — bara *Arbetsregeln* och den uppgift du ska göra, inte hela filen.

Läs inte arkivet ([docs/archive/](docs/archive/)) för att orientera dig; slå upp i det när en uppgift hänvisar dit.

## Pekare
- **Gjort/kvar — auktoritativ källa:** [docs/BACKLOG.md](docs/BACKLOG.md)
- **Nuläge / överlämning (ersätter STATUS.md):** [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md)
- **Vad/varför + betadefinitionen:** [KONTEXT.md](KONTEXT.md)
- **Beslut & öppna frågor (numrerade):** [docs/oppna-fragor.md](docs/oppna-fragor.md)
- **Arkitekturbeslut:** [docs/adr/](docs/adr/) + [docs/decisions/](docs/decisions/) (delad nummerserie)
- **Arkiv (klara strömmar, handoff-historik):** [docs/archive/](docs/archive/)
- **Nattliga fynd (otriagerade):** [docs/inbox/](docs/inbox/)

## Backlog-driven workflow
Sanningen om vad som är gjort och kvar bor i [docs/BACKLOG.md](docs/BACKLOG.md). Hela arbetsregeln står där under *"Arbetsregel för Claude Code"*; duplicera den inte här. Sammanfattning:

- **Jobba ström för ström, uppifrån och ned.** Ta nästa obockade uppgift i den ström du ombetts arbeta i.
- **Vid varje avklarad uppgift, i samma arbete:** bocka av i `docs/BACKLOG.md`, uppdatera `docs/swingcheck-handoff.md` (håll den ≤ 60 rader, flytta ut äldre till arkivet) och den `docs/`-fil uppgiften anger, och committa fokuserat.
- **Halvgjort markeras `[~]`** med vad som återstår. Lämna aldrig BACKLOG osynkad med verkligheten.

### Branch-konvention
Aktiv arbetsbranch: **`stream-native`** (ström N och de nya strömmarna V, D, F, W-2). Parallella sessioner körs i egna git-worktrees på `stream-native-<ämne>` och mergas in i `stream-native`. PR mot `main` när Erik ber om det. Äldre strömbrancher (`stream-a`…`stream-shaft`, `stream-ui`) är frysta.

## Hårda gränser
- **Commits per uppgift på rätt branch är förgodkända** av backlog-workflowen ovan. **Committa aldrig direkt på `main`** utan att jag ber om det — skapa/använd rätt branch.
- **API-nyckeln (`ANTHROPIC_API_KEY`) når aldrig klienten** — all Anthropic-trafik via Workern.
- **Bryt inte den lokalt-först-garantin:** appen måste fungera utan Supabase/auth (env-varabler kan saknas → no-op).
- **Eskalera före:** permanent radering, skrivning mot prod, kostnadsmedförande API-anrop (t.ex. riktiga Claude-anrop i test eller V-1-körningar).
- **Verifiera webbens frame-/SW-ändringar via `npm run dev`** — service worker-cache serverar annars gammal kod.
- **Kör bara en Metro åt gången** när du jobbar i `apps/mobile`.

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
- `npm test` — vitest (rot + `packages/core`).
- `npm run lint` — eslint (ignorerar `apps/mobile`, som har egen config).
- `npx tsc -b` — typkontroll av webben och core; `npx tsc --noEmit` i `apps/mobile` för appen.
- `npm run dev` — webbens lokala utveckling (använd detta för att verifiera webben, ej en build).
- `npm run build` — `tsc -b && vite build`.
- `npm run deploy` — bygger och `wrangler deploy`.
