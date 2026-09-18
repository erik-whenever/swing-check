# Bär bortfallets läge toppen? (S-29, spike)

> 2026-09-18, `stream-shaft`. **Spike — ingen produktionskod ändrad, ingen fix byggd, ingen ny
> detektion.** Analys av banorna från [top-from-dense-signal.md](top-from-dense-signal.md) (S-28):
> 103 svingar, 6 548 bildrutor, de 32 bedömda raderna ur
> [phase-audit/review.md](phase-audit/review.md). Hypotesen: bortfallet är inte brus utan
> systematiskt (skaftet förkortat i DTL vid toppen), och luckans läge bär toppen.
> **Kort: nej, inte på ett sätt som håller. Se Slutsats.**

## 0. Definitioner och två saker att veta först

- **Lucka** = maximal följd av sammanhängande bildrutor utan godkänd skaftdetektion (samma grindar
  som S-28: box ≥ 0,25, `butt`/`hosel` ≥ 0,5, längd ≥ 0,01 H). **Längsta lucka** = flest bildrutor
  (vid lika: den tidigaste); lucka i början/slutet av envelopen kallas `lead`/`trail`.
  Luckans **mittpunkt** = medeltiden av dess första och sista saknade bildruta.
- **Eriks topp** är inte en punkt utan ett intervall. `top` (rad 28, 30): bildrutan själv.
  `backswing★` (rad 12, 16, 31, 32): toppen är "nästa envelope-ruta", men den sanna toppen ligger
  någonstans mellan den bedömda rutan och nästa. Jag använder nästa ruta som punkt och rapporterar
  avstånd även till intervallet `[bedömd, nästa]`. Bredden är 0,09 s (rad 16, 31), 0,18 s
  (rad 32) och 0,27 s (rad 12); avstånd under ~3 bildrutor går inte att skilja från noll.
  Envelope-rutorna ligger fasstyrt, inte jämnt.
- **Rättelse mot S-28.** S-28 sa att 4 av 6 utpekade toppar har en lucka exakt över övergången
  (rad 12, 16, 31, 32). Med "sammanhängande" enligt uppdraget är det **3 av 6**. Rad 32 har en
  *godkänd* ruta vid 1,600 s (konfidens 0,64, skaftlängd 0,070 H) mitt i regionen: saknade
  bildrutor 1,567 och 1,633–1,667 med en godkänd emellan. S-28:s "lucka 1,57–1,67 s" var alltså tre
  av fyra bildrutor, inte en följd. Jag redovisar därför även en **bryggad** variant (två luckor
  med högst en godkänd ruta emellan slås ihop, variant B nedan). **Den varianten lades till efter
  att jag sett rad 32**, så den är en känslighetskontroll och inte ett huvudresultat.

## 1. Bortfallet per sving

482 luckor över 103 svingar; 1 930 saknade bildrutor (29 %). Ingen sving har full täckning.

| lucklängd (bildrutor) | antal luckor | saknade bildrutor | andel av alla saknade |
|---|---:|---:|---:|
| 1 | 166 | 166 | 9 % |
| 2 | 98 | 196 | 10 % |
| 3–4 | 108 | 365 | 19 % |
| 5–9 | 64 | 404 | 21 % |
| 10–19 | 33 | 429 | 22 % |
| ≥ 20 | 13 | 370 | 19 % |

- **Per sving:** median 5 luckor (p10 3, p90 7, min 1, max 24). Längsta luckan har median 5
  bildrutor (~0,17 s); 58 av 103 svingar har minst en lucka ≥ 5, 45 har ingen.
- **Fördelning:** 55 % av luckorna är 1–2 bildrutor (flimmer) och rymmer 19 % av bortfallet; de 46
  luckorna på ≥ 10 bildrutor (10 %) rymmer 41 %.
- **Läge:** 441 luckor ligger inuti banan, 11 i början (`lead`), 30 i slutet (`trail`, 232 saknade
  bildrutor, 12 %).
- **Var i banan** (andel av alla saknade bildrutor per tiondel av envelopen, 0→100 %):
  7,5 · 11,9 · 7,6 · **6,6 · 6,8 · 8,4** · 10,9 · **15,1** · 12,8 · 12,4 %. Tiondelarna 30–60 %,
  där de sex topparna ligger (39–56 % av envelopen), har tillsammans 21,8 % av bortfallet, mot 30 %
  om det vore jämnt. Toppen sitter alltså där det är **minst** bortfall, och mest bortfall är
  70–90 % (nedsving/nedslag).

## 2. Koncentrerat eller utspritt?

Jämfört med samma sving med de saknade bildrutorna omslumpade (5 000 slumpningar per sving,
fast frö):

| | observerat (median) | slumpat (median) |
|---|---:|---:|
| antal luckor | 5 | 9 |
| längsta luckans andel av svingens bortfall | 44 % | 20 % |

- **Bortfallet är klumpigt, inte jämnt utspritt.** 62 av 103 svingar har en längsta lucka som
  är större än 95:e percentilen av slumpen. Hypotesen faller alltså inte på "jämnt utspritt".
- **Men "en dominerande lucka plus flera korta" gäller bara en del.** Längsta luckan har ≥ 50 % av
  bortfallet i 42 av 103 svingar och ≥ 75 % i 7. Den typiska svingen har en längsta lucka på
  5 bildrutor och ungefär fyra andra luckor på tillsammans 7. 45 av 103 svingar
  (44 %) har ingen lucka på 5 bildrutor eller mer.
- **Bryggad variant (B):** median 4 luckor, längsta 7 bildrutor, ≥ 50 % i 55 svingar, ≥ 75 % i 13.
  Samma bild, något klumpigare.

## 3. Längsta luckans mittpunkt mot den utpekade toppen

Sex av de 15 raderna med tät bana har en utpekad topp (28, 30, 12, 16, 31, 32). **n = 6, och
rad 16 och 31 är samma klipp (`093.mp4`, två svingar med samma envelopelängd 1,6 s och luckan på
samma avstånd, 0,57 s, från envelopens start): oberoende är det 5.** Rad 12 har 39 av 124
bildrutor i sin längsta lucka (31 % av envelopen).

Avstånd = luckans mittpunkt minus Eriks topp (positivt = luckan efter toppen). "Intervall" =
avstånd till `[bedömd, nästa]`.

| # | Erik | längsta lucka (s, bildrutor, läge) | mitt − topp | mitt − intervall | topp inne i luckan | i någon lucka |
|---:|---|---|---:|---:|:-:|:-:|
| 12 | `backswing★` | 9,833–11,100, 39, inuti | **+0,49 s, +15** | +0,49 s, +15 | ja | ja |
| 16 | `backswing★` | 4,833–5,000, 6, inuti | **+0,03 s, +1** | +0,03 s, +1 | ja | ja |
| 28 | `top` | 2,767–2,900, 5, `trail` | **+0,71 s, +21** | +0,71 s, +21 | nej | nej |
| 30 | `top` | 3,067–3,133, 3, `trail` | **+0,70 s, +21** | +0,70 s, +21 | nej | nej |
| 31 | `backswing★` | 21,100–21,267, 6, inuti | **+0,03 s, +1** | +0,03 s, +1 | ja | ja |
| 32 | `backswing★` | 2,133–2,200, 3, inuti | **+0,55 s, +17** | +0,55 s, +17 | nej | nej |

- **Inom 3 bildrutor: 2 av 6** (16 och 31, samma klipp). **Median 16 bildrutor (~0,5 s).**
  Där mittpunkten missar gör den det åt samma håll i alla fyra (efter toppen), med 15–21 bildrutor.
  I rad 28 och 30 är längsta luckan i själva verket efter nedslaget (slutet av envelopen); den
  längsta *inre* luckan ligger 15–20 bildrutor *före* toppen.
- **Toppen inne i längsta luckan: 3 av 6** (12, 16, 31). Rad 12 är en 1,3 s lång lucka som börjar
  0,15 s före toppen och sträcker sig över hela nedsvingen (51–82 % av envelopen): toppen ligger
  vid luckans kant, inte i mitten. I rad 16 och 31 börjar luckan 2 bildrutor före toppen och slutar
  3 bildrutor efter. (Att luckans *början* ligger nära toppen är en efteriakttagelse på tre rader,
  varav två är samma klipp; den prövades inte i förväg.)
- **Mot slumpen** (toppen dragen likformigt över envelopen, luckan given): förväntat 0,78 träffar i
  längsta luckan mot 3 observerade (p = 0,03); i *någon* lucka 1,98 mot 3 (p = 0,30). Nollmodellen
  räknar inte med att luckor är glesast just vid 30–60 % (avsnitt 1), vilket gör de förväntade
  träffarna för höga, och räknar de dubbla klippen som två, vilket gör p för lågt. De två felen drar åt olika håll och jag
  har inte mätt storleken på något av dem.
- **Bryggad variant (B):** toppen i längsta luckan **2 av 6** (rad 12 och 32; förväntat 1,03,
  p = 0,26), i någon lucka 4 av 6 (förväntat 2,07). Rad 16 och 31 **tappar** sin träff, eftersom en
  bryggad `trail`-lucka på 8 bildrutor blir längst (26 bildrutor från toppen). Mittpunkten inom 3
  bildrutor: **1 av 6** (rad 32, 0 bildrutor). Resultatet byter alltså rad på 3 av 6 när en enda
  godkänd ruta får bryta en lucka.

**De nio raderna utan utpekad topp** (`osäker` 2, 18, 21; `downswing` 1, 19; `finish` 7, 11, 15;
`backswing` 29): ingen topp att mäta mot. Bedömningen anger bara vilken sida av rutan toppen ligger
på. Längsta luckans mittpunkt är på rätt sida i **2 av 6** där det går att avgöra (1, 29) och på fel
sida i 4 (7, 11, 15, 19). Ett svagt test, men det talar inte för att den längsta luckan är toppen.

## 4. Mot vändpunktsmetodens val (S-28, ε = 2°)

Avstånd till Eriks intervall, i bildrutor (tecken: efter toppen +). Vändpunktsvalet är första
kandidaten från S-28:s metod, oförändrad. ε 3° och 5° ger samma val utom att rad 16 blir tom.

| # | vändpunktsval | längsta luckans mittpunkt | närmast |
|---:|---:|---:|---|
| 12 | −30 (−1,01 s) | +15 (+0,49 s) | mittpunkten |
| 16 | −3 (−0,10 s) | +1 (+0,03 s) | mittpunkten |
| 28 | +5 (+0,18 s) | +21 (+0,71 s) | tröskeln |
| 30 | −18 (−0,60 s) | +21 (+0,70 s) | tröskeln (nära lika) |
| 31 | −11 (−0,37 s) | +1 (+0,03 s) | mittpunkten |
| 32 | ∅ | +17 (+0,55 s) | — |

- **Mittpunkten är närmare i 3 av 5** rader där båda finns, tröskeln i 2 av 5. Medianavstånd:
  mittpunkt 15, tröskel 11 bildrutor. **n för litet**, och de 3 är 2 klipp (16 och 31 är samma).
  Räknar man de dubbla som ett är det 2 av 4.
- Mittpunkten är tydligt bättre bara i rad 12 (15 mot 30 bildrutor) och i det dubbla klippet
  (1 mot 3 och 11). Rad 32 har inget tröskelval, så den avgör inget.
- Under bryggad variant (B) är mittpunkten närmare i 1 av 5 (rad 12 blir +22, 16 och 31 blir +26).

## 5. Kontroll: är luckor lika vanliga på andra ställen?

**Ja: luckor är vanliga i hela envelopen och har inget särskilt läge vid toppen.**

- **Andel bildrutor utan detektion per tiondel** (helt utan detektion, alla 103 svingar):
  0,18 · 0,31 · 0,20 · **0,15 · 0,14 · 0,20** · 0,27 · **0,41** · 0,33 · 0,33.
  Lägst där toppen ligger (30–60 %), högst 70–100 %.
- **Svingar vars längsta lucka är ≥ 5 bildrutor (58 st)**: mittpunkten per tiondel är
  3 · 5 · 6 · 1 · 9 · 5 · 1 · **10 · 12** · 6. I tiondelarna 30–60 % ligger 15 av 58 (26 %), mot
  30 % av bredden. Ingen ansamling vid toppen. Bryggat: 14 av 68 (21 %).
- **Nedslag** (`impactSec` finns för 83 av svingarna; **det är produktionens rörelseskattning, inte
  observerat**, och den är osäker: den skattas ur pixelrörelse, som inte ser nedslaget direkt,
  se `frameExtractor.ts`). Andel saknade bildrutor inom ±3 bildrutor från skattat nedslag, i förhållande till
  svingens genomsnitt: **median 1,63** (p10–p90 0,58–3,77). Vid de sex topparna, samma mått:
  0, 0, 1,49, 2,06, 2,21, 2,47 (median 1,78). **Bortfallet vid nedslaget är alltså på samma nivå
  som vid toppen**, så en lucka kan inte skilja topp från nedslag. Att skattat nedslag ligger *inne*
  i en lucka är däremot inte vanligare än slump (18 av 83, förväntat 24,6; ≥ 5 bildrutor: 10, förväntat 13,1).
- **Finish** (sista tiondelen av bildrutorna): median 0,89 gånger svingens genomsnitt,
  p10–p90 0–2,67, alltså inte förhöjt. Men 30 luckor ligger vid slutet (`trail`), och i 16 svingar
  är slutluckan den längsta. Rad 28 och 30 har just en slutlucka som längsta.
- **Kamerabyte: ej bedömt.** Banorna innehåller inget som skiljer ett kamerabyte från annat
  bortfall, och att avkoda om videon för att söka klipp ligger utanför "ingen ny körning". Det
  enda kända fallet (rad 27, Erik: "efter-bilden har flyttat kameravinkel") saknar lokalt klipp.
  Lägg in det som en lucka i kontrollen, inte som ett svar.
- **Två rader har inget bortfall vid toppen alls** (28, 30: 0 av 7 saknade bildrutor kring toppen).
  Toppen är alltså inte en lucka i alla fall, även om man bortser från definitionsfrågan.

### Sidokontroll: är skaftet förkortat? (utanför de fem punkterna)

Skaftlängd (`len_frac`, andel av bildhöjden) kring Eriks topp (±3 bildrutor) i förhållande till
svingens median över godkända bildrutor. Längd finns för varje ruta med någon detektion.

| # | rutor med detektion av 7 | skaftlängd kring toppen / medianen |
|---:|---:|---:|
| 12 | 0 | — (ingen detektion alls) |
| 16 | 1 | 0,33 (en ruta) |
| 28 | 7 | 0,65 |
| 30 | 7 | 0,23 (0,032 H) |
| 31 | 1 | 0,34 (en ruta) |
| 32 | 4 | 0,45 |

Där skaftet hittas nära toppen är det kort (0,23–0,65 av det vanliga; 5 av 5 med detektion). Över
alla svingar ligger längden i medianen på 0,77 gånger det vanliga i tiondelen 40–50 % (nedre
kvartilen 0,35), 0,87 i 50–60 % och 0,93 i 30–40 %, mot 0,96–1,20 i övriga tiondelar. Förkortningen finns
alltså, men den ger inte ett pålitligt bortfall: i rad 28 och 30 hittas det korta skaftet i alla
7 bildrutor.

## Slutsats

Nej: bortfallets läge bär inte toppen på ett sätt som håller. Bortfallet är klumpigt, inte
jämnt utspritt, men det är glesast just vid 30–60 % av envelopen där topparna ligger, tätast vid
70–90 %, och lika förhöjt vid nedslaget som vid toppen, så läget kan inte skilja dem åt. På de sex
utpekade topparna ligger toppen i längsta luckan i 3 (mittpunkten inom 3 bildrutor i 2, som är
samma klipp), medianavståndet är 16 bildrutor (~0,5 s) och tröskelvalet var inte sämre (närmare i
2 av 5), och 3 av 6 rader byter utfall när en enda godkänd ruta får bryta en lucka. Skaftet är
kort vid toppen (0,23–0,65 av det vanliga där det hittas) men försvinner inte pålitligt: rad 28
och 30 har det detekterat i alla rutor kring toppen. n = 6 (5 oberoende) räcker inte för att
skilja något av detta från slump.

## Kör om

Kräver `dense/` och `export_manifests.json` från S-28:s körning (se
[top-from-dense-signal.md](top-from-dense-signal.md), avsnitt 1). Från repo-roten:

```sh
node_modules/.bin/esbuild docs/shaft/top-from-dropout/analyze_dropout.ts --bundle --platform=node --format=esm --outfile=<tmp>/dropout.mjs
BRIDGE=0 node <tmp>/dropout.mjs <tmp>/dense <tmp>/out/export_manifests.json   # strikt (huvudresultat)
BRIDGE=1 node <tmp>/dropout.mjs <tmp>/dense <tmp>/out/export_manifests.json   # bryggad (känslighet)
```
