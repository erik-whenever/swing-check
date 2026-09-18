# Facit till den blinda omgången

> **Öppna inte förrän [across-sign-blind.md](across-sign-blind.md) är ifylld.**
> Genererad 2026-09-17 av `scripts/across-sign-candidates.ts --blind`, samma körning som den
> blinda filen. Frö: `0x5ca1ab1e`.

## Urvalet

Ur kandidattabellen i [across-sign-candidates.md](across-sign-candidates.md): **alla
7 kandidater höger om lodrätt** och de **7
närmast vikningen till vänster**.
Undantagna: `093-2c11c3c0_s00_f02`, `093-2c11c3c0_s01_f01` — hela klippet `093-2c11c3c0` (spegelvänd inspelning — hanteras separat). Därav 5 + 7 = **12** rader.
Alla är `dtl`, alla bär fasen `top` från minst en etikett, och alla är räknade med
`handedness: 'right'` — det är antagandet i hela tabellen, inte ett påstående om spelaren.

**Varje bildruta i omgången är granskad mot spegling** innan den släpptes in — på
bakgrundstext och på vilken sida bollen ligger — eftersom en spegelvänd bild vänder tecknet
utan att något i datamodellen märker det. Granskningen säger ingenting om *utfallet*; den är
gjord på bakgrunden, inte på klubban. **Den är inte heller lika stark överallt:** klippet
nedan avgjordes av läsbar text i bakgrunden, medan ett klipp utan text och utan synlig boll
inte går att avgöra på en bildruta. Vad granskningen faktiskt gav per bildruta står i
resultatrapporten, inte här.

**Vad omgången kan visa.** Stämmer ögat och `ACROSS_THE_LINE_SIGN` överens på båda sidor om
lodrätt, är tecknet prövat på mer än den enda bildruta S-21 vilade på. Går de isär
**systematiskt på den ena sidan**, ligger felet i vikningen vid ±90° och inte i tecknet.
Enstaka `kan inte avgöra` säger i sig ingenting om tecknet — de säger att bildrutan inte
var en topp.

| # i blinda listan | frame-id | sida om lodrätt | \|vinkel\| mot horisontalen | avstånd till 90° | beräknat tecken | beräknat utfall | flagga |
|---:|---|---|---:|---:|---:|---|---|
| 1 | `img-5385-1f59ec8d_s00_f01` | ↗ höger om lodrätt | 75,8° | 14,2° | + (75,8°) | `across-the-line` | `usable` |
| 2 | `045-224bdedb_s00_f01` | ↖ vänster om lodrätt | 82,2° | 7,8° | − (-82,2°) | `laid-off` | `usable` |
| 3 | `img-4949-218bb1b6_s00_f02` | ↖ vänster om lodrätt | 73,7° | 16,3° | − (-73,7°) | `laid-off` | `uncertain` (endpoint-flip-ambiguous) |
| 4 | `img-5384-acea6a74_s00_f02` | ↖ vänster om lodrätt | 73,9° | 16,1° | − (-73,9°) | `laid-off` | `usable` |
| 5 | `082-a6b3c908_s01_f02` | ↖ vänster om lodrätt | 79,1° | 10,9° | − (-79,1°) | `laid-off` | `uncertain` (endpoint-flip-ambiguous) |
| 6 | `img-1558-8e59ca37_s02_f03` | ↖ vänster om lodrätt | 80,5° | 9,5° | − (-80,5°) | `laid-off` | `rejected` (endpoint-flip) |
| 7 | `090-971827ab_s03_f03` | ↗ höger om lodrätt | 30,6° | 59,4° | + (30,6°) | `across-the-line` | `usable` |
| 8 | `040-42b11ae6_s00_f03` | ↗ höger om lodrätt | 2,1° | 87,9° | + (2,1°) | `on-plane` | `uncertain` (endpoint-flip-ambiguous) |
| 9 | `img-5425-f0abd4a8_s02_f02` | ↖ vänster om lodrätt | 73,9° | 16,1° | − (-73,9°) | `laid-off` | `uncertain` (endpoint-flip-ambiguous) |
| 10 | `032-dc66dfc3_s00_f02` | ↖ vänster om lodrätt | 80,8° | 9,2° | − (-80,8°) | `laid-off` | `usable` |
| 11 | `049-88216ea7_s00_f04` | ↗ höger om lodrätt | 78,9° | 11,1° | + (78,9°) | `across-the-line` | `usable` |
| 12 | `img-3641-adde195e_s00_f02` | ↗ höger om lodrätt | 48,1° | 41,9° | + (48,1°) | `across-the-line` | `usable` |

## Det uteslutna fallet

`093-2c11c3c0_s00_f02`: 66,6° från horisontalen, 23,4° från vikningen, ↗ höger om lodrätt, beräknat `across-the-line`. BILDEN ÄR SPEGELVÄND: rangeskyltarna läser `TIH`/`ƎM` och distansmarkeringen `00Ɛ`. Spelaren är alltså högerhänt i verkligheten och vänsterhänt i bilden — och det är bilden mätvärdet ser. Bedöm dem för sig: speglar man tillbaka bilden byter både händigheten och utfallet plats, och det är två fel som tar ut varandra bara om båda görs.

`093-2c11c3c0_s01_f01`: 57,5° från horisontalen, 32,5° från vikningen, ↗ höger om lodrätt, beräknat `across-the-line`. spegelvänd inspelning — hanteras separat. Bedöm dem för sig: speglar man tillbaka bilden byter både händigheten och utfallet plats, och det är två fel som tar ut varandra bara om båda görs.
