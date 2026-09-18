# Bär den täta skaftsignalen en observerad topp? (S-28, spike)

> 2026-09-18, `stream-shaft`. **Spike — ingen produktionskod ändrad, ingen fix byggd.**
> [top-from-signal.md](top-from-signal.md) (S-27) avfärdade vändpunktshypotesen på
> envelope-rutorna, men det den mätte var glesheten: 44 % av stegen var över 90°, och vilken
> bildruta som valdes styrdes av vilotröskeln. Här prövas samma hypotes och **samma metod** på
> tät signal: detektorn på varje videobildruta inom svingens envelope.

## Svaret

**Nej, inte med den här metoden, men av ett annat skäl än förra gången.** Den täta banan tar
bort glesheten: bara **1,4 %** av stegen är över 90° (var 44 %). Vändpunktsregeln väljer ändå
brus på den långa platån *före* toppen. I mitten av tröskelspannet väljer den stabilt, men på
fel ställe: **0 av 6** exakta träffar vid ε = 2°, n för litet. Där toppen syns som en jämn
vändning i signalen (2 av 6 bedömda) sammanfaller den med Eriks bildruta en gång och hamnar en
ruta senare en gång. I **4 av 6** saknas detektioner exakt över övergången. Det som begränsar nu
är detektorns täckning vid toppen, inte glesheten.

## 1. Urval och körning

**Urvalet styrdes av en sak: att källvideon finns lokalt.** `data/shaft/clips/` har 96
web-klipp och ett eget (`own/IMG_5427.MP4`). Det ger **103 av 205** svingar: 102 `web` och
1 `own`. De övriga 102 egna svingarnas 72 källklipp finns inte i repot. **Urvalet är därför
nästan helt konfunderat med källan**, och resultatet säger ingenting om egna klipp.

Detektorn körs likadant som i S-27: `shaft-v2.onnx`, imgsz 960, CPU, box ≥ 0,25, `butt`/`hosel`
≥ 0,5, `MIN_SHAFT_FRACTION` 0,01 H, med `prelabel_batch.py`:s egna funktioner. Avkodningen
följer `trace_swing.py`: behållarens tidsstämplar lästa efter varje grab, och varje bildruta
JPEG-omkodad före detektion. Alla klipp är 30 fps.

**Körtid.** Pilot på tre svingar: 10–44 s per sving, 0,23–0,40 s per bildruta. Skattad total
blev ~36–38 min för ~6 500 bildrutor. **Jag stannade inte för besked**, eftersom körningen var
lokal, kostnadsfri och under en timme. Det var mitt beslut, inte ditt, och står här av det
skälet. Utfall: **6 548 bildrutor, 34,6 min**. Per sving p10/p50/p90 **6,8 / 9,4 / 50 s**, max
250 s (`005-9b7dbe1f_s00`, 257 bildrutor). Median 49 bildrutor per sving, median detektion
0,126 s per bildruta. De första svingarna gick 2–5× långsammare per bildruta än resten.

Kör om, från repo-roten (kräver `export_manifests.json` från S-27:s `run_detector.py`):

```sh
training/.venv/Scripts/python.exe docs/shaft/top-from-dense-signal/run_dense.py <tmp>/dense --manifests <tmp>/out/export_manifests.json
node_modules/.bin/esbuild docs/shaft/top-from-dense-signal/analyze_dense.ts --bundle --platform=node --format=esm --outfile=<tmp>/ad.mjs
node <tmp>/ad.mjs <tmp>/dense <tmp>/out/export_manifests.json
```

## 2. Den täta banan

**Täckning.** 1 930 av 6 548 bildrutor (29 %) saknar godkänd detektion: 1 680 ingen
detektion, 219 keypoint under tröskeln och 31 degenererade. **Ingen av de 103 svingarna har
full täckning.** Medianen är 79 %, och 14 svingar ligger på ≥ 90 %. Längsta lucka har median
5 bildrutor och max 50. Luckorna är tätast i envelopens senare del: andelen utan detektion per
tiondel är 0,21 · 0,35 · 0,23 · 0,19 · 0,20 · 0,25 · 0,32 · **0,45** · 0,38 · 0,36.

**Stegfördelning** över läsbara par av intilliggande bildrutor (4 075 av 6 445 par; en lucka
gör paret oläsbart):

| \|steg\| | Tät (per videobildruta) | S-27 (envelope-rutor) |
|---|---:|---:|
| < 1° | 1 398 (34 %) | — |
| 1–2° | 650 (16 %) | — |
| 2–5° | 927 (23 %) | 66 (17 %) under 5° |
| 5–20° | 855 (21 %) | 88 (22 %) |
| 20–90° | 189 (5 %) | 68 (17 %) |
| **> 90°** | **56 (1,4 %)** | **174 (44 %)** |

**Andelen steg över 90° är i praktiken borta.** Det som finns kvar är ändbytesflippar och
passager genom lodrätt vid nedslaget.

**Står skaftet stilla flera bildrutor i rad runt toppen?** **Ja, före den.** Hälften av alla
läsbara steg är under 2°. De bedömda svingarna visar varför: skaftet ligger nästan stilla
länge i sen baksving och vänder sedan snabbt. Två exempel:

- `045-224bdedb_s00` (rad 30): −127…−121° från 1,93 till 2,27 s (11 bildrutor), sedan −116,
  −107, −99, **−98 vid 2,40 s**, och tillbaka −103, −111, −118. Vändningen är jämn, 5–9° per
  bildruta, och ligger exakt på Eriks toppruta (f01, 2,400 s).
- `068-db6f6eec_s00` (rad 32): −137…−141° från 1,00 till 1,53 s (16 bildrutor), sedan
  **luckor 1,57–1,67 s**. Det är just där Eriks ★ säger att toppen ligger (f03, 1,612 s).

Platåns darr (±1–2° per bildruta) är lika stort som de minsta vilotrösklarna. Därför ger
S-27:s regel ("första teckenbytet") här en vändpunkt i bruset före toppen.

## 3. Tröskelsvep

Metoden är oförändrad från S-27: teckenbyte i vinkelsteget, steg > 90° eller över en lucka
bryter kedjan, och steg under ε är vila. Kandidaten är den första vändningen. ε sveps över
0,5–12°:

| ε | 0 kandidater | 1 | flera | median antal |
|---:|---:|---:|---:|---:|
| 0,5° | 10 | 11 | 82 | 4 |
| 1° | 14 | 15 | 74 | 3 |
| 2° | 22 | 26 | 55 | 2 |
| 3° | 31 | 36 | 36 | 1 |
| 5° | 51 | 40 | 12 | 1 |
| 8° | 72 | 26 | 5 | 0 |
| 12° | 83 | 18 | 2 | 0 |

**Hur mycket den valda bildrutan rör sig:**

- **Över hela spannet** (89 svingar med val vid minst två ε): median **8 bildrutor**
  (~0,27 s). 19 står helt still och **38 flyttar sig mer än 10 bildrutor**. Det är inte
  stabilt.
- **I mittbandet 2–5°** (52 av 103 svingar har ett val vid alla tre): median **1 bildruta**.
  24 står helt still, 31 flyttar sig högst 2 bildrutor och 10 mer än 10. Här är valet
  stabilt för ungefär hälften av svingarna, vilket är ett tydligt framsteg mot S-27.

**Men stabil är inte samma sak som rätt.** På de bedömda raderna ligger de stabila valen i
mittbandet systematiskt **före** Eriks topp: rad 12 ligger 1,01 s före, rad 30 0,60 s före och
rad 31 0,37 s före, lika vid ε 2, 3 och 5. Metoden låser alltså stabilt på platåns brus, inte
på vändningen. Vid ε = 2° hamnar det första valet i envelopens första 20 % i 22 av 81
svingar, där adressen och takeaway ligger.

## 4. Validering mot de 32 bedömda raderna

**15 av 32** rader ligger i en sving med tät bana: 11 kandidater (1, 2, 7, 12, 15, 16, 19, 28,
30, 31, 32) och 4 kontroller (11, 18, 21, 29). Metodens val jämförs genom att föras till
närmaste envelope-ruta (`=`, `+1` …) i förhållande till den bedömda rutan. Huvudvärdet är
ε = 2°; hela svepet står i utdatan.

| # | Eriks bedömning | ska vara | första valet, ε = 2° | alla kandidater, ε = 2° |
|---:|---|---|---|---|
| 28 | `top` | `=` | +0,18 s → `+1` | +1, +4, +4 |
| 30 | `top` | `=` | −0,60 s → `−1` | −1, **=** |
| 12 | `backswing★` | `+1` | −1,01 s → `−1` | −1 ×4 (därefter lucka) |
| 16 | `backswing★` | `+1` | −0,10 s → `=` | =, = (lucka 4,83–5,00 s över toppen) |
| 31 | `backswing★` | `+1` | −0,37 s → `−1` | −1, −1, −1, =, +2 (lucka 21,10–21,27 s) |
| 32 | `backswing★` | `+1` | ∅ | ∅ (lucka 1,57–1,67 s) |
| 1 | `downswing` | `< 0` | `−2` ✓ | |
| 7 | `finish` | `< 0` | `+1` ✗ | |
| 15 | `finish` | `< 0` | `−1` ✓ | |
| 19 | `downswing` | `< 0` | `−1` ✓ | |
| 29 | `backswing` (kontroll) | `> 0` | `−1` ✗ | |
| 11 | `finish`, "alla bilder i finish" (kontroll) | ingen topp | `−1` (falsk topp vid ε 2–8°) | |
| 2, 18, 21 | `osäker` | — | går inte att bedöma | |

- **Exakt bildruta**, där Erik pekat ut toppen (6 rader): **0 av 6** med första valet vid
  ε = 2°. Bäst över hela svepet är 1 av 6: rad 28 vid ε 0,5–1°, som inte håller vid 2°.
  **n för litet.**
- **Om valregeln vore perfekt** (någon kandidat på rätt ruta): **1 av 6** (rad 30).
  **n för litet.** Signalen har alltså sällan ens en kandidat på rätt ställe.
- **Riktning**, där Eriks svar säger att toppen ligger före eller efter rutan: **3 av 5**.
  **n för litet.**
- **Kontroll utan topp** (rad 11): metoden hittar en topp som inte finns. **n = 1.**
- **Mot manifestet**, på de 11 kandidaterna: första valet pekar på en annan ruta än
  manifestet i 9. Av de 8 som går att bedöma går det åt Eriks håll i 3. **n för litet.**

**Varför det går fel syns i banorna, och det är inte tröskeln.** Av de 6 exakt utpekade
topparna har **4 en lucka i detektionen exakt över övergången** (rad 12, 16, 31, 32). Toppen är
alltså inte i signalen där. I de 2 som har en hel vändning (rad 28, 30) ligger vändningen på
Eriks ruta en gång (rad 30) och 0,18 s senare en gång (rad 28, vändning vid 2,30 s, Erik säger
2,121 s). Om skaftvinkelns vändning i bilden och det Erik ser som topp ens är samma händelse
går inte att avgöra på n = 2.

## 5. Täckning och pris i produktion

**Källmaterialet.** I produktion finns källvideon alltid, eftersom det är användarens egen
inspelning som analyseras. Begränsningen på **103 av 205** gäller bara det här datasetet, där
de egna källklippen inte ligger i repot. Det som begränsar täckningen i produktion är
detektionen: **0 av 103** svingar har full täckning, medianen är 79 %, och luckorna är tätast
i nedsvingen, där toppen och övergången ligger.

**Tid per sving.** Median 49 bildrutor per envelope (~1,6 s vid 30 fps).

- Här (Python/ONNX, CPU): median **9,4 s** per sving, p90 50 s.
- I webbläsaren, **inte mätt här**: dokumenterad inferens är 333 ms/bildruta på WebGPU
  ([oppna-fragor.md](../oppna-fragor.md)) och median 368 ms i dev-vyn (BACKLOG). Det ger
  **~16–18 s** per mediansving, mot **~2,5 s** för dagens 7 rutor, alltså ungefär 7× fler
  inferenser. Till det kommer avkodning av varje videobildruta, som inte heller är mätt i
  webbläsaren.

## Slutsats

Den täta signalen löser glesheten: steg över 90° går från 44 % till 1,4 %, och i mittbandet
2–5° är valet stabilt för hälften av svingarna. Men vändpunktsmetoden bär ändå ingen observerad
topp. Den låser stabilt på brus i platån före toppen och träffar 0 av 6 bedömda toppar, med
bara 1 av 6 ens bland kandidaterna (n för litet). I 4 av 6 saknar detektorn skaftet exakt över
övergången, så det som begränsar nu är detektionstäckningen vid toppen, inte tröskeln. Priset
hade varit ~7× fler inferenser, ~16–18 s per sving i webbläsaren (dokumenterad tid, ej mätt
här), för en signal som i dag har hål just där toppen ligger.
