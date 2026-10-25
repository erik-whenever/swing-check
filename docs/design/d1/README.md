# D-1 — Designförslag för betan

> **Status: förslag, väntar på Eriks godkännande.** Inga tokens eller komponenter är skrivna i `apps/mobile`.
> De kommer först när skisserna är godkända (D-1, andra halvan).

- **Skisserna:** [`index.html`](index.html) (alla sex skärmar, ljust/mörkt/auto via knappar överst).
- **PNG (2x):** [`png/`](png/), en fil per skärm och tema. Livesessionen finns bara mörk, och det är avsiktligt.
- **Rendera om:** `node docs/design/d1/render.cjs` (Playwright). Filer över ~400 kB kvantiseras sedan till 256
  färger med PIL. Videobilderna är illustrationer: golfaren är en SVG-siluett, inte en riktig bildruta.

| # | Flöde | Fil |
| --- | --- | --- |
| 1 | Uppladdning | `png/uppladdning-{light,dark}.png` |
| 2 | Analys pågår | `png/analys-{light,dark}.png` |
| 3 | Resultat per regel, med skaftets tracer | `png/resultat-{light,dark}.png` |
| 4 | Regelval och rekommenderat regelset | `png/regler-{light,dark}.png` |
| 5 | Livesession (hörlursläge, stativ 2–4 m) | `png/livesession.png` |
| 6 | Historik | `png/historik-{light,dark}.png` |

## Riktningen: Cream Day / Fairway Night

**Färg.** Club Creams varma krämytor och fairwaygröna accent ligger kvar som bas. Det nya är en **volt-färg**
(`#D6F03A`) med en enda roll: *det maskinen ser*. Den används för skaftets tracer, poseskelettet, svingfönstret
i tidslinjen och livesessionens "Redo". Den används aldrig för knappar eller domar, så den betyder alltid
"det här mätte appen". Domfärgerna är frikopplade från accenten, som i Club Cream: godkänd är grön, miss är
lerröd och "kan inte avgöras" är neutral sten. Mörkt läge är en varm grön-kolgrund, aldrig kall slate.

**Domar bärs av form, inte bara färg.** Godkänd är en rund bricka med bock. Miss är en rundad fyrkant med
kryss. Kan inte avgöras är en streckad ring med frågetecken. Samma tre former används överallt: i
resultatlistan, i livesessionen, i historikens staplar och i prickarna.

**Typografi.** Två roller:
- **Outfit** för display: skärmtitlar, siffror och livesessionens domar. Den bär varumärket från Club Cream.
- **SF Pro** för all brödtext och alla kontroller, via iOS textstilar (Body 17, Subhead 15, Footnote 13), så
  att **Dynamic Type** fungerar utan specialfall. I skisserna står Inter för SF Pro, eftersom SF inte kan
  bäddas in i en HTML-fil.

**Rörelse** (beskrivs här, syns inte i stillbilderna):
- Tracern ritas från adress till avslut när resultatet öppnas (cirka 600 ms) och spelas om vid tryck på en fas.
- Analysvyns skanningslinje sveper över bildrutan medan reglerna bedöms. Varje steg bockas av med en haptisk tick.
- Livesessionens "Redo"-puls andas långsamt. Vid ett slag byts den till "Analyserar" och sedan till den nya
  siffran. Inga snabba blinkningar, eftersom skärmen ska läsas i ögonvrån på avstånd.
- Med Reducera rörelse på blir allt toningar.

**Ton.** Kort och coachande, på svenska, i du-form. Domarna använder `short_verdict` ordagrant ("Vikten kvar
på höger fot"). Förslag börjar med "Gör så här". "Kan inte avgöras" säger alltid varför, till exempel "Knät
skyms av vänster ben från den här vinkeln".

## Skärm för skärm, och vad datamodellen styr

- **Uppladdning:** svingfönstret som `poseSegments` hittar visas i tidslinjen ("Sving hittad 2,4–4,1 s") och går
  att justera. Kameravinkeln är förifylld från detekteringen men går att ändra. Regelsetet är en rad, inte en hel
  vy. En primär åtgärd, med uppskattad tid under.
- **Analys pågår:** visar arbetet i fyra steg (sving, nyckelbilder, regler, skaftets bana) och de sex
  nyckelbilderna per fas. Användaren får lämna appen och får en notis när det är klart.
- **Resultat:** tracern ovanpå klippet, med en fasväljare. Ringen visar godkända av bedömbara regler.
  `overall_assessment` står i kortform bredvid. Ordningen är fokusregeln (`focus_rule`), sedan missar (öppna)
  och godkända (stängda), och sist kan inte avgöras. Varje rad visar `confidence` som en liten stapel.
  Öppen rad: `short_verdict`, `suggestion` ("Gör så här"), `drill_suggestion`/`drills` som ett tryckbart kort
  och `relevant_frames` som länken "Se i bild 5 och 6". "Läs upp" använder samma TTS som livesessionen.
- **Regler:** "Rekommenderat" är förvalt och förklarar sig med chips (vinkel, nivå, mål). Innehållet kommer från
  F-1. Varje rad visar fas och vikt (1–3 prickar). En regel som inte kan bedömas från vinkeln (`angles`) står
  nedtonad och säger vad den kräver. "Egna" och "+" är vägen in till regelbiblioteket, som är kärnprodukten (G2).
- **Livesession:** byggd för en telefon på stativ 2–4 m bort och för att läsas utan att man går fram.
  Poängen visas i 120 pt, domarna i 30 pt med 52 pt stora formmärken, fokusregelns trend som sju stora block och
  tillståndet ("Redo", "Analyserar") i 36 pt i volt. Kameran är suddig och nedtonad bakom, så att den finns
  men inte stör. Kontrollerna är 76 pt höga. Sessionen styrs i första hand med rösten och hörlurarna, och
  skärmen är en sekundär bekräftelse.
- **Historik:** överst trenden för fokusregeln (procent godkända per session), eftersom det är det
  användaren tränar på. Under den kommer dagarna. En session visar en stapel per sving (höjd och färg = dom),
  och en uppladdad sving visar en tumnagel och prickar.

## Avvikelser från Club Cream, och varför

| Club Cream | Förslaget | Varför |
| --- | --- | --- |
| Outfit för all text, 12–12,5 px brödtext | Outfit bara för display. SF Pro och iOS textstilar (17 pt Body) för resten | Native iOS kräver Dynamic Type och 17 pt som bas. 12 px brödtext klarar inte HIG eller solljus. |
| Ingen signalfärg utöver accent och guld | Volt (`#D6F03A`) reserverad för maskinseende | Tracern och skelettet måste synas mot gräs och himmel, där grönt försvinner. En reserverad färg gör att den aldrig blandas ihop med en knapp. |
| Dom = ✓/✕/? i samma tonade ring | Tre olika former (rund, fyrkant, streckad) | Läses på avstånd och utan färgseende. Club Cream sa redan att "tillstånd bärs av form", och det här tar principen hela vägen. |
| `rounded-card` 18 px | 22 pt kort och kontinuerliga hörn | Ligger närmare iOS systemkort och telefonens 55 pt hörnradie. |
| Mörkt tema likvärdigt med ljust | Livesessionen är alltid mörk | Videon är botten, skärmen läses på avstånd och mörkt bländar mindre på rangen. Övriga vyer följer systemet. |
| Kameravyn med chip-rad för lägen | Livesessionen som egen helskärm utan chips | Hörlursläge är betans huvudläge (G1). På stativ ska skärmen visa resultat, inte inställningar. |

Det som behålls från Club Cream: krämytorna, den gröna accenten, frikopplade domfärger, varm mörk grund,
pillerknappar, en kortform per roll, att fokusregeln leder listan, att missar börjar öppna och att en nedtonad
rad skriver ut varför.

## Granskningslista för Erik

Svara ja/nej (eller en kommentar) per punkt. Det som godkänns blir tokens och komponenter i `apps/mobile`.

1. **Helhetskänslan.** Är kräm + grön + volt rätt nivå för betan ("mycket snygg")? Eller vill du ha en mörkare,
   mer sportig grund i hela appen?
2. **Volt bara för maskinseende** (tracer, skelett, live). Okej, eller ska tracern ha en annan färg?
3. **Typografin:** Outfit för rubriker och siffror, SF Pro för text. Okej?
4. **Livesessionen:** läser du den från 3 meter (testa: visa PNG:en i full skärm på telefonen och ställ den på
   avstånd)? Är poäng + tre domar + fokustrend rätt innehåll, eller för mycket?
5. **Resultatordningen:** fokus först, missar öppna, kan inte avgöras sist. Stämmer det?
6. **Regelval:** är "Rekommenderat / Egna" rätt uppdelning för betan, och ska chipsen (vinkel, nivå, mål) synas?
7. **Tabbarna:** Sving, Session, Regler, Historik. Rätt fyra, och i den ordningen?
8. **Något som saknas** i de sex flödena (till exempel inspelning direkt i appen, som här bara är kameraknappen
   på Ny sving)?
