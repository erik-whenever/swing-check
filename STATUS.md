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
- **Plattformsfrågan är öppen:** native iOS + Android i stället för webbapp/PWA före lansering — obeslutat. Konsekvenser (inferenstid, modellstorlek, `shaftDetector.ts`, datamodellen för skaftmätvärden) i [docs/oppna-fragor.md](docs/oppna-fragor.md) → *F6*.
- **Tre otriagerade observationer från batch-03:s annotering** ligger som öppna frågor i
  [docs/oppna-fragor.md](docs/oppna-fragor.md): skaftets svikt mot den räta `butt`→`hosel`-linjen
  (*F7*), `hosel` som `occluded` längs riktningen i stället för `outside` (*F8*) och `club` som
  attribut på shaft-objektet (*F9*). **Ingen av dem ska implementeras nu** — F7 mäts först när
  fyrapunktsmodellen finns, F8 och F9 är förslag att pröva i batch-04.
- Paketnamn `swingcheck-temp` / version `0.0.0` — städa inför första riktiga release.
