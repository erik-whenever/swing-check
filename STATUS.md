# STATUS — SwingCheck

> **Auktoritativ källa för gjort/kvar är [docs/BACKLOG.md](docs/BACKLOG.md).** Den här filen är bara en kort orientering — current-state och uppgiftslistor lever i BACKLOG, inte här.
> Stabil grund: [KONTEXT.md](KONTEXT.md) · Överlämning: [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md) · **Sekvensering & beslutsforkar: [docs/ROADMAP.md](docs/ROADMAP.md)**. Senast uppdaterad: 2026-07-07.

## Nuvarande fokus
Tre isolerade strömmar redo att starta (en session/branch per ström, se [docs/BACKLOG.md](docs/BACKLOG.md)):

- **Ström A** — Voice-triggad svingstart.
- **Ström B** — Supabase RLS-policies + auth-grund.
- **Ström C** — App-ikoner + iOS PWA-verifiering.

Övergripande olöst: rörelsebaserad svingdetektering är implementerad men ännu inte verifierad på riktiga klipp (se [docs/swingcheck-handoff.md](docs/swingcheck-handoff.md) → *Kritiskt olöst*).

## Horisont (ej schemalagt)
- Pose-estimering som fallback om rörelse-metoden når sin gräns ([ADR-0001](docs/adr/0001-motion-based-swing-detection.md)).
- Paketnamn `swingcheck-temp` / version `0.0.0` — städa inför första riktiga release.
