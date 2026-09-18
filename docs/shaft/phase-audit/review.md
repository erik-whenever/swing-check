# Blind fasgranskning — är bildrutan verkligen en topp?

> 32 bildrutor att bedöma för hand. Ordningen är slumpad med fast frö
> **`0xfa5ec0de`** och **bär ingen information**: varken radnumret, filnamnet eller
> grannraderna säger något om svaret. Genererad 2026-09-18 av
> `docs/shaft/phase-audit/select.ts`.
>
> **IFYLLD 2026-09-18 av Erik.** Svaren står ordagrant som de lämnades, fritext och
> stjärnor inkluderade; ingenting är tolkat eller normaliserat. Kolumnen **`★`** lades till
> vid inskrivningen så att stjärnmarkeringen går att filtrera på utan att läsa fritexten —
> se noten under tabellen. Utvärderingen står i [resultat.md](resultat.md).

## Vad som ska fyllas i

För varje bildruta: **vilken fas i svingen visar den?**

`address / backswing / top / downswing / impact / finish / osäker`

- `top` betyder att klubban vänder **i den här bildrutan** — sista bildrutan innan
  nedsvingen börjar, inte "sen baksving" och inte "strax efter vändningen".
- `osäker` är ett riktigt svar. Använd det hellre än att gissa; en gissning som råkar bli
  rätt är oskiljbar från en bedömning, och den förstör siffran den här omgången ska ge.
- **Bedöm bildrutan i kolumnen `bild`.** Kolumnerna `före` och `efter` är närmaste
  envelope-bildruta på var sida — de finns för att visa åt vilket håll klubban rör sig, och
  ska **inte** bedömas i sig.

Skriv svaret i sista kolumnen. **Läs ingenting annat i `docs/shaft/phase-audit/` förrän
alla rader är ifyllda.**

| # | frame-id | bild | före | efter | din bedömning | ★ |
|---:|---|---|---|---|---|---|
| 1 | `057-1d1b5748_s00_f02` | [`057-1d1b5748_s00_f02.jpg`](frames/057-1d1b5748_s00_f02.jpg) | [bild](frames/057-1d1b5748_s00_f02_prev.jpg) | [bild](frames/057-1d1b5748_s00_f02_next.jpg) | downswing | |
| 2 | `047-4d3e3909_s00_f01` | [`047-4d3e3909_s00_f01.jpg`](frames/047-4d3e3909_s00_f01.jpg) | [bild](frames/047-4d3e3909_s00_f01_prev.jpg) | [bild](frames/047-4d3e3909_s00_f01_next.jpg) | osäker | |
| 3 | `img-5412-a7756984_s00_f03` | [`img-5412-a7756984_s00_f03.jpg`](frames/img-5412-a7756984_s00_f03.jpg) | [bild](frames/img-5412-a7756984_s00_f03_prev.jpg) | [bild](frames/img-5412-a7756984_s00_f03_next.jpg) | downswing | |
| 4 | `img-5269-3e863a76_s01_f01` | [`img-5269-3e863a76_s01_f01.jpg`](frames/img-5269-3e863a76_s01_f01.jpg) | [bild](frames/img-5269-3e863a76_s01_f01_prev.jpg) | [bild](frames/img-5269-3e863a76_s01_f01_next.jpg) | top | |
| 5 | `img-4658-a2f26279_s00_f04` | [`img-4658-a2f26279_s00_f04.jpg`](frames/img-4658-a2f26279_s00_f04.jpg) | [bild](frames/img-4658-a2f26279_s00_f04_prev.jpg) | [bild](frames/img-4658-a2f26279_s00_f04_next.jpg) | finish (alla bilder är på finishen och är typ identiska) | |
| 6 | `img-5410-e9b74b96_s02_f01` | [`img-5410-e9b74b96_s02_f01.jpg`](frames/img-5410-e9b74b96_s02_f01.jpg) | [bild](frames/img-5410-e9b74b96_s02_f01_prev.jpg) | [bild](frames/img-5410-e9b74b96_s02_f01_next.jpg) | backswing (extremt liten skillnad mellan bilden och bilden efter, men man ser lite på klubbhuvudet att efter-bilden är absoluta toppen) | |
| 7 | `089-51f5ef4b_s00_f02` | [`089-51f5ef4b_s00_f02.jpg`](frames/089-51f5ef4b_s00_f02.jpg) | [bild](frames/089-51f5ef4b_s00_f02_prev.jpg) | [bild](frames/089-51f5ef4b_s00_f02_next.jpg) | finish | |
| 8 | `att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01` | [`att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01.jpg`](frames/att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01.jpg) | [bild](frames/att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01_prev.jpg) | [bild](frames/att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01_next.jpg) | osäker (både bilden och den efter är så gott som identiska och visar båda toppen av svingen) | |
| 9 | `img-5408-3c48779f_s00_f01` | [`img-5408-3c48779f_s00_f01.jpg`](frames/img-5408-3c48779f_s00_f01.jpg) | [bild](frames/img-5408-3c48779f_s00_f01_prev.jpg) | [bild](frames/img-5408-3c48779f_s00_f01_next.jpg) | top | |
| 10 | `img-4962-9ed639e7_s00_f02` | [`img-4962-9ed639e7_s00_f02.jpg`](frames/img-4962-9ed639e7_s00_f02.jpg) | [bild](frames/img-4962-9ed639e7_s00_f02_prev.jpg) | [bild](frames/img-4962-9ed639e7_s00_f02_next.jpg) | backswing | |
| 11 | `028-4f3f90e8_s00_f06` | [`028-4f3f90e8_s00_f06.jpg`](frames/028-4f3f90e8_s00_f06.jpg) | [bild](frames/028-4f3f90e8_s00_f06_prev.jpg) | — | finish (alla bilder är i finish och det finns ingen efter-bild) | |
| 12 | `073-bd53202e_s01_f01` | [`073-bd53202e_s01_f01.jpg`](frames/073-bd53202e_s01_f01.jpg) | [bild](frames/073-bd53202e_s01_f01_prev.jpg) | [bild](frames/073-bd53202e_s01_f01_next.jpg) | backswing* | ★ |
| 13 | `img-5423-b345d01e_s01_f01` | [`img-5423-b345d01e_s01_f01.jpg`](frames/img-5423-b345d01e_s01_f01.jpg) | [bild](frames/img-5423-b345d01e_s01_f01_prev.jpg) | [bild](frames/img-5423-b345d01e_s01_f01_next.jpg) | top | |
| 14 | `img-5384-acea6a74_s00_f02` | [`img-5384-acea6a74_s00_f02.jpg`](frames/img-5384-acea6a74_s00_f02.jpg) | [bild](frames/img-5384-acea6a74_s00_f02_prev.jpg) | [bild](frames/img-5384-acea6a74_s00_f02_next.jpg) | top | |
| 15 | `095-b6402f36_s00_f01` | [`095-b6402f36_s00_f01.jpg`](frames/095-b6402f36_s00_f01.jpg) | [bild](frames/095-b6402f36_s00_f01_prev.jpg) | [bild](frames/095-b6402f36_s00_f01_next.jpg) | finish | |
| 16 | `093-2c11c3c0_s00_f02` | [`093-2c11c3c0_s00_f02.jpg`](frames/093-2c11c3c0_s00_f02.jpg) | [bild](frames/093-2c11c3c0_s00_f02_prev.jpg) | [bild](frames/093-2c11c3c0_s00_f02_next.jpg) | backswing* | ★ |
| 17 | `img-5417-87102d79_s00_f02` | [`img-5417-87102d79_s00_f02.jpg`](frames/img-5417-87102d79_s00_f02.jpg) | [bild](frames/img-5417-87102d79_s00_f02_prev.jpg) | [bild](frames/img-5417-87102d79_s00_f02_next.jpg) | osäker (både bilden och den efter är så gott som identiska och visar båda toppen av svingen) | |
| 18 | `031-eda42b98_s00_f05` | [`031-eda42b98_s00_f05.jpg`](frames/031-eda42b98_s00_f05.jpg) | [bild](frames/031-eda42b98_s00_f05_prev.jpg) | [bild](frames/031-eda42b98_s00_f05_next.jpg) | osäker (både före, bilden och den efter är så gott som identiska och visar båda toppen av svingen) | |
| 19 | `009-1617ed23_s00_f01` | [`009-1617ed23_s00_f01.jpg`](frames/009-1617ed23_s00_f01.jpg) | [bild](frames/009-1617ed23_s00_f01_prev.jpg) | [bild](frames/009-1617ed23_s00_f01_next.jpg) | downswing | |
| 20 | `img-5407-1eb975b8_s00_f01` | [`img-5407-1eb975b8_s00_f01.jpg`](frames/img-5407-1eb975b8_s00_f01.jpg) | [bild](frames/img-5407-1eb975b8_s00_f01_prev.jpg) | [bild](frames/img-5407-1eb975b8_s00_f01_next.jpg) | backswing* | ★ |
| 21 | `054-0d1b3ff3_s00_f00` | [`054-0d1b3ff3_s00_f00.jpg`](frames/054-0d1b3ff3_s00_f00.jpg) | — | [bild](frames/054-0d1b3ff3_s00_f00_next.jpg) | osäker | |
| 22 | `img-4979-bd8e32e5_s00_f01` | [`img-4979-bd8e32e5_s00_f01.jpg`](frames/img-4979-bd8e32e5_s00_f01.jpg) | [bild](frames/img-4979-bd8e32e5_s00_f01_prev.jpg) | [bild](frames/img-4979-bd8e32e5_s00_f01_next.jpg) | top | |
| 23 | `img-4979-bd8e32e5_s01_f02` | [`img-4979-bd8e32e5_s01_f02.jpg`](frames/img-4979-bd8e32e5_s01_f02.jpg) | [bild](frames/img-4979-bd8e32e5_s01_f02_prev.jpg) | [bild](frames/img-4979-bd8e32e5_s01_f02_next.jpg) | backswing* | ★ |
| 24 | `img-5356-08a7c9cb_s00_f02` | [`img-5356-08a7c9cb_s00_f02.jpg`](frames/img-5356-08a7c9cb_s00_f02.jpg) | [bild](frames/img-5356-08a7c9cb_s00_f02_prev.jpg) | [bild](frames/img-5356-08a7c9cb_s00_f02_next.jpg) | top | |
| 25 | `img-5425-f0abd4a8_s00_f04` | [`img-5425-f0abd4a8_s00_f04.jpg`](frames/img-5425-f0abd4a8_s00_f04.jpg) | [bild](frames/img-5425-f0abd4a8_s00_f04_prev.jpg) | [bild](frames/img-5425-f0abd4a8_s00_f04_next.jpg) | downswing | |
| 26 | `img-3641-adde195e_s00_f02` | [`img-3641-adde195e_s00_f02.jpg`](frames/img-3641-adde195e_s00_f02.jpg) | [bild](frames/img-3641-adde195e_s00_f02_prev.jpg) | [bild](frames/img-3641-adde195e_s00_f02_next.jpg) | finish | |
| 27 | `img-5186-586918f4_s00_f03` | [`img-5186-586918f4_s00_f03.jpg`](frames/img-5186-586918f4_s00_f03.jpg) | [bild](frames/img-5186-586918f4_s00_f03_prev.jpg) | [bild](frames/img-5186-586918f4_s00_f03_next.jpg) | osäker (efter-bilden har flyttat kameravinkel bort från golfaren) | |
| 28 | `061-f51f439d_s00_f01` | [`061-f51f439d_s00_f01.jpg`](frames/061-f51f439d_s00_f01.jpg) | [bild](frames/061-f51f439d_s00_f01_prev.jpg) | [bild](frames/061-f51f439d_s00_f01_next.jpg) | top | |
| 29 | `055-c5e9ec1a_s00_f01` | [`055-c5e9ec1a_s00_f01.jpg`](frames/055-c5e9ec1a_s00_f01.jpg) | [bild](frames/055-c5e9ec1a_s00_f01_prev.jpg) | [bild](frames/055-c5e9ec1a_s00_f01_next.jpg) | backswing | |
| 30 | `045-224bdedb_s00_f01` | [`045-224bdedb_s00_f01.jpg`](frames/045-224bdedb_s00_f01.jpg) | [bild](frames/045-224bdedb_s00_f01_prev.jpg) | [bild](frames/045-224bdedb_s00_f01_next.jpg) | top | |
| 31 | `093-2c11c3c0_s01_f01` | [`093-2c11c3c0_s01_f01.jpg`](frames/093-2c11c3c0_s01_f01.jpg) | [bild](frames/093-2c11c3c0_s01_f01_prev.jpg) | [bild](frames/093-2c11c3c0_s01_f01_next.jpg) | backswing* | ★ |
| 32 | `068-db6f6eec_s00_f02` | [`068-db6f6eec_s00_f02.jpg`](frames/068-db6f6eec_s00_f02.jpg) | [bild](frames/068-db6f6eec_s00_f02_prev.jpg) | [bild](frames/068-db6f6eec_s00_f02_next.jpg) | backswing* | ★ |

## Noter till svaren

**`★` — vad stjärnan betyder.** Eriks egen markering, satt av honom på sex rader (12, 16, 20,
23, 31, 32) och återgiven både i svarstexten (`backswing*`) och som eget fält i kolumnen `★`.
Hans ord: bilden och nästa är nära identiska i kroppsställning, men **klubbhuvudet hänger mer
i nästa bild**, vilket gör att han läser den bedömda bildrutan som `backswing` snarare än
`top`. Stjärnan är alltså inte en osäkerhetsmarkering utan ett *skäl* — och ett skäl som
pekar åt ett bestämt håll: etiketten ligger en bildruta för tidigt.

**Rad 26 — en avvikelse mot svarsalternativen, noterad och inte åtgärdad.** Erik svarade
`finish` men noterar att bildrutan är **mer `through` än `finish`**, eftersom de två sista
bilderna i svingen ligger efter nedslaget. Svarslistan ovan erbjuder varken `through` eller
`follow`, så `finish` var det närmaste tillgängliga ordet. Två enum:ar i koden är inblandade
och ingen av dem har ordet `follow`: `MeasurementPhase`/`ShaftPhase`
(`src/lib/shaft/measure/shaftSeries.ts`) har **`through` och `finish` som skilda värden**,
medan appens `SwingPhase` (`src/lib/frameExtractor.ts`) slår ihop dem till
**`follow-through`**. Avvikelsen är noterad här och i [resultat.md](resultat.md); **inget
enum och ingen svarslista är ändrad**, och Eriks svar står kvar som `finish`.
