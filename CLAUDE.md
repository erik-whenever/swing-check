# CLAUDE.md — SwingCheck

Alltid-laddad baslinje. **Läs först, varje session:** [docs/BACKLOG.md](docs/BACKLOG.md) (auktoritativ för gjort/kvar) och [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md) (aktuell kontext). Läs sedan [KONTEXT.md](KONTEXT.md) för arkitektur/varför **innan** du börjar koda.

## Pekare
- **Gjort/kvar — auktoritativ källa:** [docs/BACKLOG.md](docs/BACKLOG.md)
- **Aktuell kontext / överlämning:** [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md)
- **Vad/varför:** [KONTEXT.md](KONTEXT.md)
- **Levande status (gjort/pågår/horisont):** [STATUS.md](STATUS.md)
- **Beslut & öppna frågor (numrerade):** [docs/oppna-fragor.md](docs/oppna-fragor.md)
- **Arkitekturbeslut:** [docs/adr/](docs/adr/)
- **Nattliga fynd (otriagerade):** [docs/inbox/](docs/inbox/)

## Backlog-driven workflow
Sanningen om vad som är gjort och kvar bor i [docs/BACKLOG.md](docs/BACKLOG.md) — den är auktoritativ. Hela arbetsregeln står där under *"Arbetsregel för Claude Code"*; duplicera den inte här. Sammanfattning:

- **Jobba ström för ström, uppifrån och ned.** Ta nästa obockade uppgift i den ström du ombetts arbeta i; uppgifter inom en ström är ordnade och oftast beroende av varandra.
- **Vid varje avklarad uppgift, i samma arbete:** bocka av i `docs/BACKLOG.md` (`[ ]`→`[x]` med en rad om vad som gjordes), uppdatera `docs/swingcheck-handoff.md` och den `docs/`-fil uppgiften anger, och committa fokuserat.
- **Halvgjort markeras `[~]`** med vad som återstår. Lämna aldrig BACKLOG osynkad med verkligheten.

### Branch-konvention
En arbetsbranch per ström: `stream-a`, `stream-b`, `stream-c`. Committa löpande på strömmens branch; PR mot `main` när strömmen (eller en meningsfull delmängd) är klar.

### Parallellitet
Ström A/B/C är isolerade och körs i **separata git-worktrees** (en session per worktree). Enda korsningspunkten: **A-3 och B-3 rör båda `SwingRecord`** — håll fälten **additiva** (`swingStartTimestamp` resp. `user_id`), merga den som blir klar först och rebasa den andra. **Rör inte `frameExtractor`/`useFrameExtractor` förrän Ström A är klar.**

## Hårda gränser
- **Commits per uppgift på rätt ström-branch är förgodkända** av backlog-workflowen ovan. **Committa aldrig direkt på `main`** utan att jag ber om det — skapa/använd `stream-a/b/c`.
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
