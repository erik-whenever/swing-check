# Blind bedömningsomgång — skaftet vid toppen

> 12 bildrutor att bedöma för hand. Ordningen är slumpad med fast frö
> **`0x5ca1ab1e`** (mulberry32 + Fisher-Yates i `scripts/across-sign-candidates.ts --blind`)
> och **bär ingen information** — varken radnumret, filnamnet eller grannraderna säger något
> om svaret. Genererad 2026-09-17.

## Vad som ska fyllas i

För varje bildruta: står skaftet **across the line** eller **laid off** vid toppen, sett
bakifrån mot mållinjen?

- `across` — klubban pekar höger om mållinjen (för en högerhänt spelare sett bakifrån)
- `laid-off` — klubban pekar vänster om mållinjen
- `kan inte avgöra` — bildrutan är ingen topp, vyn räcker inte, eller läget är för nära
  mållinjen för att kalla åt något håll

Skriv svaret i sista kolumnen. **Läs ingenting annat i `docs/shaft/` förrän alla rader är
ifyllda** — resten av mappen innehåller det uträknade svaret.

|   # | frame-id                    | bild                                                                                                 | ditt svar                                                                       |
| --: | --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
|   1 | `img-5385-1f59ec8d_s00_f01` | [`across-sign-blind/img-5385-1f59ec8d_s00_f01.jpg`](across-sign-blind/img-5385-1f59ec8d_s00_f01.jpg) | kan inte avgöra — för nära lodrätt                                              |
|   2 | `045-224bdedb_s00_f01`      | [`across-sign-blind/045-224bdedb_s00_f01.jpg`](across-sign-blind/045-224bdedb_s00_f01.jpg)           | kan inte avgöra — för nära lodrätt                                              |
|   3 | `img-4949-218bb1b6_s00_f02` | [`across-sign-blind/img-4949-218bb1b6_s00_f02.jpg`](across-sign-blind/img-4949-218bb1b6_s00_f02.jpg) | laid-off                                                                        |
|   4 | `img-5384-acea6a74_s00_f02` | [`across-sign-blind/img-5384-acea6a74_s00_f02.jpg`](across-sign-blind/img-5384-acea6a74_s00_f02.jpg) | kan inte avgöra — för nära lodrätt                                              |
|   5 | `082-a6b3c908_s01_f02`      | [`across-sign-blind/082-a6b3c908_s01_f02.jpg`](across-sign-blind/082-a6b3c908_s01_f02.jpg)           | laid-off                                                                        |
|   6 | `img-1558-8e59ca37_s02_f03` | [`across-sign-blind/img-1558-8e59ca37_s02_f03.jpg`](across-sign-blind/img-1558-8e59ca37_s02_f03.jpg) | kan inte avgöra — för nära lodrätt                                              |
|   7 | `090-971827ab_s03_f03`      | [`across-sign-blind/090-971827ab_s03_f03.jpg`](across-sign-blind/090-971827ab_s03_f03.jpg)           | across                                                                          |
|   8 | `040-42b11ae6_s00_f03`      | [`across-sign-blind/040-42b11ae6_s00_f03.jpg`](across-sign-blind/040-42b11ae6_s00_f03.jpg)           | laid-off                                                                        |
|   9 | `img-5425-f0abd4a8_s02_f02` | [`across-sign-blind/img-5425-f0abd4a8_s02_f02.jpg`](across-sign-blind/img-5425-f0abd4a8_s02_f02.jpg) | laid-off                                                                        |
|  10 | `032-dc66dfc3_s00_f02`      | [`across-sign-blind/032-dc66dfc3_s00_f02.jpg`](across-sign-blind/032-dc66dfc3_s00_f02.jpg)           | kan inte avgöra — för nära lodrätt                                              |
|  11 | `049-88216ea7_s00_f04`      | [`across-sign-blind/049-88216ea7_s00_f04.jpg`](across-sign-blind/049-88216ea7_s00_f04.jpg)           | across                                                                          |
|  12 | `img-3641-adde195e_s00_f02` | [`across-sign-blind/img-3641-adde195e_s00_f02.jpg`](across-sign-blind/img-3641-adde195e_s00_f02.jpg) | kan inte avgöra — fel fas, bildrutan är en finish (ser dessutom vänsterhänt ut) |
