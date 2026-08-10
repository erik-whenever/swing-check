# Designsystem — "Club Cream"

> Visuell baslinje för SwingCheck sedan 2026-08-10. Beskriver **vad** systemet är och
> **varför** delarna ser ut som de gör. Källan är `src/index.css` (tokens) och
> `src/components/ui/` (primitiver) — den här filen förklarar dem, den definierar dem inte.

## Riktning

Varma krämiga ytor, fairway-grön primärfärg, mjuka pillerformer, geometrisk sans (Outfit).
Country club möter modern coaching. **Ljust är referensriktningen**; det mörka temat är
samma system renderat på varm grön-kolgrund — aldrig kall slate. En kall grå bredvid kräm
läser som en bugg, inte som ett tema.

## Tokens (`src/index.css`)

Komponenter använder **semantiska** utilities (`bg-surface`, `text-muted`, `bg-accent`,
`rounded-card`) — aldrig råa palettklasser. Varje token pekar på en CSS-variabel som byts
i runtime via `data-theme` (light/dark) och `data-accent` (nyans) på `<html>`.

| Grupp | Tokens |
| --- | --- |
| Ytor | `bg`, `surface`, `raised`, `raised-hi`, `line` |
| Text | `fg`, `fg-dim`, `muted`, `faint`, `faint-2` |
| Accent | `accent` (600), `accent-hover` (500), `accent-press` (700), `accent-text`, `accent-tint`, `on-accent` |
| Dom & data | `ok`/`ok-tint`, `bad`/`bad-tint`, `gold`/`gold-tint`, `chart-good`, `chart-bad` |
| Form | `rounded-card` (18px), `rounded-chip` (12px), `rounded-pill` (99px) |
| Skugga | `shadow-card`, `shadow-seg`, `shadow-cta`, `shadow-lift` |
| Egna utilities | `eyebrow`, `no-scrollbar`, `safe-top`, `safe-bottom` |

**Domfärger följer inte accenten.** `ok`/`bad`/`gold`/`chart-*` är avsiktligt frikopplade
från `data-accent`: "godkänd" måste förbli grön även när användaren valt rosa accent.
Accentpaletterna är dämpade klubbhusnyanser, inte neonwebbfärger; nycklarna
(`emerald`/`blue`/…) är persisterade i settings och behölls trots att ramperna flyttades.

## Typografi

Outfit, **självhostat** via `@fontsource/outfit` (latin-subset, vikter 300–700) och
precachat av service workern. Skälet är offline: en PWA som faller tillbaka på ett
systemsnitt på rangen bygger om hela layouten. Google Fonts vore ett nätverksberoende
i exakt det läge appen ska fungera utan nät.

- H1 (hero) 31px / 1.12 / 600 / `-0.02em`
- H2 (vytitel) 16px / 600
- Brödtext 12–12.5px / 1.5–1.55 / 400, `text-muted`
- Eyebrow 10px / 600 / `0.1em` / versaler (`.eyebrow`)

## Primitiver (`src/components/ui/`)

En form per roll. Varje vy uppfann tidigare sin egen `p-3 rounded-lg bg-surface border`,
vilket är därför radier och padding drev isär mellan skärmarna.

| Primitiv | Roll |
| --- | --- |
| `Card` | Den enda kortformen. `tone`: `default` / `focus` (guldhårstreck) / `muted` (av). |
| `Button` | Pillerknapp. `primary` / `secondary` / `ghost` / `danger` / `dashed`. Radien är inte en prop — en rektangel är aldrig rätt svar för en åtgärd här. |
| `Chip` + `VerdictDot` | Statiska taggar; `VerdictDot` är ✓/✕/? med tonad ring. |
| `Segmented` | Varje antingen/eller i appen (flikar, vinkel, röstläge). |
| `Toggle` | På/av-switch. |
| `ScoreRing` | Pass-rate som ring. **SVG, inte conic-gradient** — svepet ska kunna animeras och färgen komma från en CSS-variabel; en gradient-bakgrund klarar ingetdera. |
| `Sparkline` + `VerdictBars` | Trendlinje respektive per-sving-histogram. |

## Bärande UX-beslut i redesignen

- **Analysvyn är EN domlista, inte fyra färgkort.** Ett tonat kort per regel gav fyra
  tävlande färgblock utan svar på "vad missade jag?". Nu: ett kort, en rad per regel,
  detaljerna fälls ut vid tryck (misslyckade rader börjar öppna). Fokusregeln leder
  listan i stället för att ha en egen sektion.
- **Kameravyn har en kontrollform per sorts beslut.** Hörlursläge, sessionsläge, röst och
  nedräkning är alla "hur den här inspelningen beter sig" → en chip-rad. Inspelnings-
  knappen äger mitten ensam.
- **Tillstånd bärs av form, inte bara färg.** Inspelningsknappens kärna byter form
  (disk → rundad fyrkant → pulsande guld); aktiv flik får en tonad kapsel; `VerdictBars`
  kodar dom i både höjd och färg. Allt läses på armlängds avstånd i solljus, och
  färgseende kan inte antas.
- **Destruktivt ligger ett tryck djupare.** Solo/Ta bort bakom `⋯` på regelkortet.
- **En nedtonad rad skriver ut varför.** Off-angle-regler i biblioteket säger vilken
  vinkel som krävs i stället för att bara vara grå.

## Kända avgränsningar

- **Dev-only-ytor är inte omtemade**: `DevLogPanel`, `FramePreview`, `SegmentedSwings`,
  `FrameLightbox`, `LiveSwingPanel`, `SkeletonOverlay` behåller sina råa palettklasser.
  De är diagnostikverktyg bakom `VITE_DEV_PREVIEW`, inte produkt-UI.
- **Overlays ovanpå livevideo** (nedräkning, progress) är medvetet vit-på-svart:
  där är videon botten, inte temat.
- **Inte enhetsverifierad.** Bygge, lint och testsvit är gröna och `npm run dev` serverar
  de nya utilities:arna, men designen är inte sedd på en iPhone. `viewport-fit=cover` +
  `safe-top`/`safe-bottom` är nya och påverkar layouten under notch/hemindikator —
  det är det första som ska tittas på vid en enhetskontroll.
