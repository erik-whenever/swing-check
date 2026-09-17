# Kandidater för att pröva across-the-line-tecknet nära vikningen

> Genererad av `scripts/across-sign-candidates.ts` — ett **engångsverktyg som bara läser**.
> Ingen produktionskod är rörd; `derived.ts` och `plausibility.ts` är oförändrade och
> serierna går genom `checkShaftSeries` → `buildShaftMeasurements` precis som i appen.
> Generera om: se körraden i verktygets huvud. Senast körd: 2026-09-17.

## Varför

`ACROSS_THE_LINE_SIGN` står på **en** bedömd bildruta, `049-88216ea7_s00_f05`, vars skaft
ligger **77° från horisontalen — 13° från vikningen vid ±90°** som `lineOrientationDeg`
gör. En topp som passerar lodrätt byter tecken utan förvarning, så referensen binder
tecknet från den svagaste änden. Listan nedan är sorterad **närmast 90° först**: den
översta raden är den bildruta där en felvänd konvention skulle synas tydligast, och
kolumnen *sida om lodrätt* säger vilken av de två halvorna varje kandidat ligger i.

**Rapporten avgör ingenting.** Den plockar fram bildrutor att titta på; tecknet kan bara
prövas av ett öga som läser klubbans läge mot mållinjen.

## Källa — vad som faktiskt lästes

| Vad | Varifrån | Antal |
|---|---|---:|
| Skaftpredictions | `data/shaft/training/batch-0*/prelabel.xml` (modellutdata ur `training/prelabel_batch.py`, `public/models/shaft-v2.onnx`, imgsz 960, conf ≥ 0,25, keypoint ≥ 0,5) | 299 bildrutor |
| Tid, klipp, sving, fas, envelope | `manifest.json` i `data/shaft/training/batch-0*/batch.zip` | 299 sammanfogade |
| `view`, annoterad fas | `data/shaft/calibration/erik.zip` (97), `data/shaft/calibration/lisa.zip` (97), `data/shaft/training/batch-01/annotated-v1.zip` (148), `data/shaft/training/batch-01/annotated-v2.zip` (148), `data/shaft/training/batch-02/annotated-v1.zip` (245), `data/shaft/training/batch-03/annotated-v1.zip` (242) | per sving, unionerat |

**Detta är hela predictionsunderlaget som finns på maskinen.** `training/runs/` är tomt,
`training/trace-*.csv` (bildruta-för-bildruta-spårningarna ur `trace_swing.py`) är
gitignorerade och finns inte här, och `batch-01` har ingen `prelabel.xml` — den
annoterades från noll. Inga nya modellkörningar gjordes: att köra detektorn på nytt hade
varit att tillverka underlaget, inte att läsa det.

### Tre saker källan inte bär, och vad verktyget gör åt dem

1. **Ingen keypoint-konfidens.** `prelabel.xml` bär koordinater, inte poäng. Det enda som
   är känt är gränsen körningen höll: `butt` och `hosel` ≥ **0,5**. Verktyget matar in
   just den gränsen, vilket betyder att plausibilitetens konfidenstest är **passerat per
   konstruktion** — bildrutans flagga nedan vilar på geometri och grannjämförelser, inte
   på konfidens. (Referensbildrutan hade 1,00 när den kördes i S-21; övriga är okända.)
2. **`toe`/`heel` i `prelabel.xml` är inte predictions.** `sole_points()` ritar dem
   vinkelrätt mot skaftet som ett handtag åt annotatören; shaft-v2 är en tvåpunktsmodell.
   De kastas därför, och serierna deklarerar `keypoints: 2` — annars hade bladvinkeln
   tillverkats ur skaftvinkeln.
3. **Ingen handedness någonstans.** Varken manifestet eller CVAT-attributen
   (`view`, `blur`, `phase`, `no_shaft`) bär den. Tabellen är räknad med
   `handedness: 'right'` — för en vänsterhänt spelare vänder `ACROSS_THE_LINE_SIGN`
   både tecken och utfall.

### Urvalet av toppbildruta

**Varje** bildruta som någon av de två fasetiketterna kallar `top` blir en rad — inte
bara den produktionsvägen skulle valt. `topFrameIndex` tar den **sista** `top` kontrollen
släppte igenom, för ett mätvärde måste svara med ett tal; en kandidatlista har motsatt
uppgift, och en andra topp i samma sving är en till bildruta någon kan titta på. Kolumnen
*urval* säger vilket slags rad det är, och bildrutor kontrollen **förkastade** är kvar och
märkta — det är ögat som ska bedöma dem, inte grinden.

**Ingen av de två fasetiketterna är pålitlig, så båda står i tabellen.** Manifestets fas är
härledd ur svingens envelope och ljuger ibland; annotatörens är sann där den är satt — och
i den största predictionsbatchen är den **inte satt**:

> `data/shaft/training/batch-03/annotated-v1.zip` bär `phase: address` på **varje** bildruta — `address` är attributets
> `default_value` i CVAT, och ett orört förval är ett osatt fält med ett värde på. Fasen
> därifrån är kastad; vyn från samma export är kvar, för den är satt.

En bildruta kommer med när **någon** av de etiketter som bär information kallar den
`top`. Referensbildrutan är själv exemplet på varför båda behövs: manifestet säger
`impact`, CVAT-attributet `address`, ögat `top`. Just därför är referensen `049-88216ea7_s00_f05` **inte** med i tabellen: ingen av de två etiketterna kallar den `top`. Ur samma sving finns däremot `049-88216ea7_s00_f04` (78,9° från horisontalen, 11,1° från vikningen) — samma spelare, samma kamera, annoterad `top`.

### Vy-filtret

`view` unioneras per sving över alla annotatörer, precis som i `prelabel_batch.py`, och
bara svingar där **varje** annoterad vy är `dtl` kommer med. Svingar utan annoterad vy
(`unknown`) räknas inte som `dtl`: frånvaro av evidens är inte evidens.

| Vybucket | Svingar | I tabellen |
|---|---:|---|
| `dtl` | 166 | ja |
| `face_on` (inkl. dtl/face_on-tvist) | 12 | nej — mätvärdet är inte ärligt därifrån |
| `other` | 0 | nej |
| `unknown` (ingen annoterad bildruta) | 0 | nej |

## Kandidater — närmast lodrätt först

63 toppbildrutor ur 166 `dtl`-svingar. `lineOrientationDeg`
är positiv moturs på skärmen, så **positiv vinkel = klubbänden upp åt höger** i bilden och
negativ = upp åt vänster. Vikningen ligger vid ±90°, alltså lodrätt skaft.

| # | frame-id | klipp | \|vinkel\| mot horisontalen | avstånd till 90° | sida om lodrätt | tecken | utfall | fas: annoterad / manifest | urval | konfidens |
|---:|---|---|---:|---:|---|---:|---|---|---|---|
| 1 | `045-224bdedb_s00_f01` | 045.mp4 | 82,2° | **7,8°** | ↖ vänster om lodrätt | − (-82,2°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 2 | `032-dc66dfc3_s00_f02` | 032.mp4 | 80,8° | **9,2°** | ↖ vänster om lodrätt | − (-80,8°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 3 | `img-1558-8e59ca37_s02_f03` | IMG_1558.MP4 | 80,5° | **9,5°** | ↖ vänster om lodrätt | − (-80,5°) | `laid-off` | `top` / `downswing` | top, förkastad av kontrollen | bildruta: `rejected` (endpoint-flip)<br>mätvärde: — (utanför produktionsvägen) |
| 4 | `082-a6b3c908_s01_f02` | 082.mp4 | 79,1° | **10,9°** | ↖ vänster om lodrätt | − (-79,1°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 5 | `049-88216ea7_s00_f04` | 049.mp4 | 78,9° | **11,1°** | ↗ höger om lodrätt | + (78,9°) | `across-the-line` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 6 | `img-5385-1f59ec8d_s00_f01` | IMG_5385.MP4 | 75,8° | **14,2°** | ↗ höger om lodrätt | + (75,8°) | `across-the-line` | — / `top` | top, inte den sista i svingen | bildruta: `usable`<br>mätvärde: — (utanför produktionsvägen) |
| 7 | `img-5384-acea6a74_s00_f02` | IMG_5384.MP4 | 73,9° | **16,1°** | ↖ vänster om lodrätt | − (-73,9°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 8 | `img-5425-f0abd4a8_s02_f02` | IMG_5425.MP4 | 73,9° | **16,1°** | ↖ vänster om lodrätt | − (-73,9°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 9 | `img-4949-218bb1b6_s00_f02` | IMG_4949.MP4 | 73,7° | **16,3°** | ↖ vänster om lodrätt | − (-73,7°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 10 | `img-5425-f0abd4a8_s00_f01` | IMG_5425.MP4 | 72,4° | **17,6°** | ↖ vänster om lodrätt | − (-72,4°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 11 | `021-68ef6599_s00_f02` | 021.mp4 | 71,6° | **18,4°** | ↖ vänster om lodrätt | − (-71,6°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 12 | `img-4982-23afcab9_s00_f02` | IMG_4982.MP4 | 71,3° | **18,7°** | ↖ vänster om lodrätt | − (-71,3°) | `laid-off` | `finish` / `top` | top, inte den sista i svingen | bildruta: `usable`<br>mätvärde: — (utanför produktionsvägen) |
| 13 | `057-1d1b5748_s00_f02` | 057.mp4 | 70,1° | **19,9°** | ↖ vänster om lodrätt | − (-70,1°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 14 | `075-3324b4b8_s00_f01` | 075.mp4 | 70,0° | **20,0°** | ↖ vänster om lodrätt | − (-70,0°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 15 | `img-5414-79f3ebf2_s00_f02` | IMG_5414.MP4 | 68,7° | **21,3°** | ↖ vänster om lodrätt | − (-68,7°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 16 | `img-5408-3c48779f_s01_f02` | IMG_5408.MP4 | 68,0° | **22,0°** | ↖ vänster om lodrätt | − (-68,0°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 17 | `061-f51f439d_s00_f01` | 061.mp4 | 67,6° | **22,4°** | ↖ vänster om lodrätt | − (-67,6°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 18 | `047-4d3e3909_s00_f01` | 047.mp4 | 67,2° | **22,8°** | ↖ vänster om lodrätt | − (-67,2°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 19 | `073-bd53202e_s01_f01` | 073.mp4 | 66,9° | **23,1°** | ↖ vänster om lodrätt | − (-66,9°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 20 | `093-2c11c3c0_s00_f02` **⚠ vänsterhänt i bilden — tecknet nedan är räknat som höger** | 093.mp4 | 66,6° | **23,4°** | ↗ höger om lodrätt | + (66,6°) | `across-the-line` | — / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 21 | `001-d15a2abb_s00_f02` | 001.mp4 | 66,1° | **23,9°** | ↖ vänster om lodrätt | − (-66,1°) | `laid-off` | — / `top` | top, inte den sista i svingen | bildruta: `usable`<br>mätvärde: — (utanför produktionsvägen) |
| 22 | `009-1617ed23_s00_f01` | 009.mp4 | 65,0° | **25,0°** | ↖ vänster om lodrätt | − (-65,0°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 23 | `img-5410-e9b74b96_s00_f02` | IMG_5410.MP4 | 64,9° | **25,1°** | ↖ vänster om lodrätt | − (-64,9°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 24 | `img-5418-4578527e_s00_f02` | IMG_5418.MP4 | 64,7° | **25,3°** | ↖ vänster om lodrätt | − (-64,7°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 25 | `img-5356-08a7c9cb_s00_f02` | IMG_5356.MP4 | 64,5° | **25,5°** | ↖ vänster om lodrätt | − (-64,5°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 26 | `att-zyawwvqtrwxb99904a422rcofpgw3o1od4me-9d15d556_s00_f02` | att.ZyAwWVqtrWxb99904a422rCofpGW3O1OD4mEzV2quu0.mp4 | 64,4° | **25,6°** | ↖ vänster om lodrätt | − (-64,4°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 27 | `img-5407-1eb975b8_s00_f01` | IMG_5407.MP4 | 64,1° | **25,9°** | ↖ vänster om lodrätt | − (-64,1°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 28 | `img-5407-1eb975b8_s02_f01` | IMG_5407.MP4 | 63,1° | **26,9°** | ↖ vänster om lodrätt | − (-63,1°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 29 | `img-5410-e9b74b96_s03_f01` | IMG_5410.MP4 | 63,1° | **26,9°** | ↖ vänster om lodrätt | − (-63,1°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 30 | `img-5410-e9b74b96_s02_f01` | IMG_5410.MP4 | 62,8° | **27,2°** | ↖ vänster om lodrätt | − (-62,8°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 31 | `img-5423-b345d01e_s01_f01` | IMG_5423.MP4 | 62,8° | **27,2°** | ↖ vänster om lodrätt | − (-62,8°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 32 | `att-zyawwvqtrwxb99904a422rcofpgw3o1od4me-9d15d556_s00_f01` | att.ZyAwWVqtrWxb99904a422rCofpGW3O1OD4mEzV2quu0.mp4 | 62,1° | **27,9°** | ↖ vänster om lodrätt | − (-62,1°) | `laid-off` | — / `top` | top, inte den sista i svingen | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: — (utanför produktionsvägen) |
| 33 | `img-4986-275ba8dd_s00_f02` | IMG_4986.MP4 | 61,7° | **28,3°** | ↖ vänster om lodrätt | − (-61,7°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 34 | `011-ade5a87a_s00_f02` | 011.mp4 | 61,0° | **29,0°** | ↖ vänster om lodrätt | − (-61,0°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 35 | `img-4979-bd8e32e5_s00_f01` | IMG_4979.MP4 | 60,6° | **29,4°** | ↖ vänster om lodrätt | − (-60,6°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 36 | `img-4629-cf050c57_s00_f03` | IMG_4629.MP4 | 60,6° | **29,4°** | ↖ vänster om lodrätt | − (-60,6°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 37 | `img-5385-1f59ec8d_s00_f02` | IMG_5385.MP4 | 60,1° | **29,9°** | ↖ vänster om lodrätt | − (-60,1°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 38 | `img-5056-0f2f5600_s00_f02` | IMG_5056.MP4 | 59,4° | **30,6°** | ↖ vänster om lodrätt | − (-59,4°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 39 | `img-5106-804fa36c_s00_f03` | IMG_5106.MP4 | 59,3° | **30,7°** | ↖ vänster om lodrätt | − (-59,3°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 40 | `img-5410-e9b74b96_s00_f01` | IMG_5410.MP4 | 58,5° | **31,5°** | ↖ vänster om lodrätt | − (-58,5°) | `laid-off` | — / `top` | top, inte den sista i svingen | bildruta: `usable`<br>mätvärde: — (utanför produktionsvägen) |
| 41 | `093-2c11c3c0_s01_f01` | 093.mp4 | 57,5° | **32,5°** | ↗ höger om lodrätt | + (57,5°) | `across-the-line` | — / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 42 | `att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01` | att.9IzXJRCTRbs6ai2850SDLlVLwTaZmck0rh5ulwAifvQ.mp4 | 57,2° | **32,8°** | ↖ vänster om lodrätt | − (-57,2°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 43 | `054-0d1b3ff3_s00_f02` | 054.mp4 | 56,8° | **33,2°** | ↖ vänster om lodrätt | − (-56,8°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 44 | `img-4962-9ed639e7_s00_f02` | IMG_4962.MP4 | 56,6° | **33,4°** | ↖ vänster om lodrätt | − (-56,6°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 45 | `img-4571-6dc77e51_s00_f03` | IMG_4571.MP4 | 56,5° | **33,5°** | ↖ vänster om lodrätt | − (-56,5°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 46 | `029-ac6ff381_s00_f01` | 029.mp4 | 54,5° | **35,5°** | ↖ vänster om lodrätt | − (-54,5°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 47 | `img-4979-bd8e32e5_s01_f02` | IMG_4979.MP4 | 54,0° | **36,0°** | ↖ vänster om lodrätt | − (-54,0°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 48 | `img-5417-87102d79_s00_f02` | IMG_5417.MP4 | 54,0° | **36,0°** | ↖ vänster om lodrätt | − (-54,0°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 49 | `001-d15a2abb_s00_f05` | 001.mp4 | 53,7° | **36,3°** | ↖ vänster om lodrätt | − (-53,7°) | `laid-off` | `top` / `impact` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 50 | `img-5074-9e1e3e30_s00_f01` | IMG_5074.MP4 | 51,0° | **39,0°** | ↖ vänster om lodrätt | − (-51,0°) | `laid-off` | `address` / `top` | top, inte den sista i svingen | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: — (utanför produktionsvägen) |
| 51 | `010-c79ab6d3_s00_f01` | 010.mp4 | 50,9° | **39,1°** | ↖ vänster om lodrätt | − (-50,9°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 52 | `089-51f5ef4b_s02_f03` | 089.mp4 | 50,6° | **39,4°** | ↖ vänster om lodrätt | − (-50,6°) | `laid-off` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 53 | `095-b6402f36_s02_f01` | 095.mp4 | 49,9° | **40,1°** | ↖ vänster om lodrätt | − (-49,9°) | `laid-off` | `top` / `backswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 54 | `img-3569-b0a85e92_s00_f01` | IMG_3569.MOV | 49,4° | **40,6°** | ↖ vänster om lodrätt | − (-49,4°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 55 | `img-5411-1c4e5d2f_s00_f02` | IMG_5411.MP4 | 49,1° | **40,9°** | ↖ vänster om lodrätt | − (-49,1°) | `laid-off` | `top` / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 56 | `img-3641-adde195e_s00_f02` | IMG_3641.MP4 | 48,1° | **41,9°** | ↗ höger om lodrätt | + (48,1°) | `across-the-line` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 57 | `img-5357-3b80b032_s00_f01` | IMG_5357.MP4 | 48,0° | **42,0°** | ↖ vänster om lodrätt | − (-48,0°) | `laid-off` | `backswing` / `top` | top, inte den sista i svingen | bildruta: `usable`<br>mätvärde: — (utanför produktionsvägen) |
| 58 | `068-db6f6eec_s00_f02` | 068.mp4 | 40,3° | **49,7°** | ↖ vänster om lodrätt | − (-40,3°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 59 | `090-971827ab_s03_f03` | 090.mp4 | 30,6° | **59,4°** | ↗ höger om lodrätt | + (30,6°) | `across-the-line` | `top` / `downswing` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 60 | `img-5413-e0b4049d_s00_f01` | IMG_5413.MP4 | 24,9° | **65,1°** | ↖ vänster om lodrätt | − (-24,9°) | `laid-off` | `idle` / `top` | top, inte den sista i svingen | bildruta: `usable`<br>mätvärde: — (utanför produktionsvägen) |
| 61 | `089-51f5ef4b_s00_f02` | 089.mp4 | 24,0° | **66,0°** | ↖ vänster om lodrätt | − (-24,0°) | `laid-off` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |
| 62 | `040-42b11ae6_s00_f03` | 040.mp4 | 2,1° | **87,9°** | ↗ höger om lodrätt | + (2,1°) | `on-plane` | `top` / `downswing` | produktionsvägens val | bildruta: `uncertain` (endpoint-flip-ambiguous)<br>mätvärde: `uncertain` (endpoint-flip-ambiguous) |
| 63 | `095-b6402f36_s00_f01` | 095.mp4 | 1,5° | **88,5°** | ↖ vänster om lodrätt | − (-1,5°) | `on-plane` | — / `top` | produktionsvägens val | bildruta: `usable`<br>mätvärde: `usable` |

## Var kandidaterna ligger

| Sida om lodrätt | Antal | Närmast 90° |
|---|---:|---|
| ↗ höger (`lineOrientationDeg` > 0) | **7** | `049-88216ea7_s00_f04` (11,1° från 90°) |
| ↖ vänster (`lineOrientationDeg` < 0) | **56** | `045-224bdedb_s00_f01` (7,8° från 90°) |
| Inom 20° från vikningen | 13 | varav 2 höger / 11 vänster |

**Båda sidorna är representerade**, vilket är vad som krävs för att se om tecknet vänder vid vikningen: två toppar strax på var sida om 90° ska av ögat läsas som nästan samma klubbläge, men får motsatt `deviationDeg`-tecken av mätvärdet.

Fördelningen är ändå **7 mot 56**, och den snedheten är i sig ett fynd: tabellen räknar varje rad som högerhänt, och en enda felbedömd händighet (eller ett spegelvänt klipp — se nedan) flyttar en rad tvärs över tabellen. Den lilla högerhögen är alltså både den intressanta och den ömtåliga.

## Bildrutor att titta på

De 20 översta är kopierade till
[`across-sign-candidates/`](across-sign-candidates/), numrerade i tabellens ordning.
Katalogen är **gitignorerad** — bilderna föreställer identifierbara personer och
`data/shaft/*` är ignorerat av just det skälet; kopiorna får inte gå en annan väg in i
repot än originalen.

### Ögats genomgång av dem

Alla 20 är sedda (2026-09-17). Kolumnen *händighet i bilden*
är vad bildrutan **visar**, vilket är det mätvärdet ser — inte ett påstående om spelaren.

| # | frame-id | händighet i bilden | topp? | anmärkning |
|---:|---|---|---|---|
| 1 | `045-224bdedb_s00_f01` | höger | ja |  |
| 2 | `032-dc66dfc3_s00_f02` | höger | ja |  |
| 3 | `img-1558-8e59ca37_s02_f03` | höger | ja |  |
| 4 | `082-a6b3c908_s01_f02` | höger | ja |  |
| 5 | `049-88216ea7_s00_f04` | höger | ja | samma sving som referensen |
| 6 | `img-5385-1f59ec8d_s00_f01` | höger | ja |  |
| 7 | `img-5384-acea6a74_s00_f02` | höger | ja |  |
| 8 | `img-5425-f0abd4a8_s02_f02` | höger | ja |  |
| 9 | `img-4949-218bb1b6_s00_f02` | höger | ja |  |
| 10 | `img-5425-f0abd4a8_s00_f01` | höger | ja |  |
| 11 | `021-68ef6599_s00_f02` | höger | ja |  |
| 12 | `img-4982-23afcab9_s00_f02` | höger | **nej** | genomsving/finish, inte en topp — manifestets `top` är fel, annotatörens `finish` är rätt |
| 13 | `057-1d1b5748_s00_f02` | höger | ja |  |
| 14 | `075-3324b4b8_s00_f01` | höger | ja |  |
| 15 | `img-5414-79f3ebf2_s00_f02` | höger | ja | sen baksving, strax före toppen |
| 16 | `img-5408-3c48779f_s01_f02` | höger | ja |  |
| 17 | `061-f51f439d_s00_f01` | höger | ja |  |
| 18 | `047-4d3e3909_s00_f01` | höger | ja |  |
| 19 | `073-bd53202e_s01_f01` | höger | ja | inomhus, ingen boll |
| 20 | `093-2c11c3c0_s00_f02` | **vänster** | ja | BILDEN ÄR SPEGELVÄND: rangeskyltarna läser `TIH`/`ƎM` och distansmarkeringen `00Ɛ`. Spelaren är alltså högerhänt i verkligheten och vänsterhänt i bilden — och det är bilden mätvärdet ser |

**Tre saker den genomgången ger, som ingen kolumn ovanför kan ge:**

1. **Bildruta 20,
   `093-2c11c3c0_s00_f02`, är spegelvänd.** Rangeskyltarna i bakgrunden läser `TIH` och
   `ƎM`, distansmarkeringen `00Ɛ` — klippet är inspelat med spegelvänd kamera. Svingen
   är en **högerhänts**, men i bilden är den en vänsterhänts, och det är bilden detektorn
   och mätvärdet arbetar i. Raden står i tabellen som `across-the-line` räknad på
   `handedness: 'right'`; med bildens händighet blir den `laid-off` — samma bildruta,
   motsatt svar. **Ingenting i datamodellen bär vare sig händighet eller spegling**, så
   den här inversionen är osynlig hela vägen upp.
2. **Alla övriga 19 är högerhänta i bilden.** Ingen bekräftat vänsterhänt spelare finns
   bland dem, och eftersom fältet inte finns går det inte att söka efter en heller — bara
   att titta. Den vänsterhänta halvan av `ACROSS_THE_LINE_SIGN` är fortfarande enbart
   en spegling per konstruktion.
3. **En bildruta är inte en topp.** `img-4982-23afcab9_s00_f02` är en genomsving;
   manifestets `top` är fel där och annotatörens `finish` rätt. Den enda etiketten som
   inte ljög på någon av de 20 är den mänskliga, där den var satt.

## Vändpunktsfallbacken — mätt, och därför inte använd

118 av 178 svingar med predictions bär **ingen**
`top`-bildruta: batcherna drar ~4 bildrutor ur hela svingen, och toppen hamnar oftast
inte bland dem. `0` sving saknar fas helt — det är först där
frågans fallback ("närmaste bildruta till vändpunkten") har något att göra.

Att ändå ta den tidsmässigt närmaste bildrutan till en skattad vändpunkt
(48,5 % in i `envelopeSec`, ur typsvingens proportioner i
`src/lib/dataset/datasetPhase.ts` → `FALLBACK_BOUNDS`) ger **inte** toppar. Så här ser
de 107 `dtl`-svingarna ut, efter vad bildrutan faktiskt är märkt som:

| Fasen bildrutan bär | Svingar | varav inom 20° från 90° |
|---|---:|---:|
| `address` | 8 | 0 |
| `backswing` | 21 | 1 |
| `downswing` | 43 | 5 |
| `impact` | 21 | 4 |
| `through` | 10 | 2 |
| `finish` | 4 | 1 |

**Och de hade tagit över tabellen.** 13
av dem ligger inom 20° från vikningen — en `address`-bildruta har skaftet nära lodrätt
därför att klubban pekar ner mot bollen, vilket inte har något med en topp att göra.
Sorteringen på avstånd till 90° hade lyft dem högst upp. Raderna är därför räknade här och
utelämnade ur kandidatlistan.

## Alla toppbildrutor, inte bara dtl

64 toppbildrutor ur 60 svingar som bär en `top`-fas, av
178 svingar med predictions totalt.
