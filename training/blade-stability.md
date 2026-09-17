# Bladvinkelns stabilitet över en sving

Genererad 2026-09-16 06:43 UTC av `training/measure_blade_stability.py`.

| | |
|---|---|
| Vikter | `training\runs\shaft-v3s\weights\best.pt` |
| Batchar | `batch-01`, `batch-02`, `batch-03` |
| `imgsz` | 960 |
| Detektionströskel (`--conf`) | 0.25 |
| Punktströskel (`--kpt-conf`) | 0.1 |
| Största tillåtna tidssteg (`--max-gap-sec`) | 1.0 s |
| Svingar | 204 |
| Frames | 641 |

## 0. Anmärkningar

- `view`/`blur` från `batch-01/annotated-v2.zip`, `batch-02/annotated-v1.zip`, `batch-03/annotated-v1.zip`.
- 9 frames är flaggade `no_shaft` av annotatören och utelämnas — där finns ingen klubba att vara stabil om.
- 17 av 641 frames saknar `view`/`blur`.
- 1 svingar bär bara en frame och kan inte bidra med något par.

## 1. Vad som mäts, och varför just detta

**Det finns inget facit.** Kalibreringssetet — det permanenta evalsetet i `evaluate.py` — annoterades i tvåpunktsschemat och bär ett människogolv för skaftvinkeln men **inget för bladvinkeln**. Tills ett fyrapunktspass finns går träffsäkerheten inte att mäta. **Stabiliteten går**, och den kräver inga annoteringar alls.

**Skaftvinkeln är måttstocken, inte utsmyckning.** `heel→toe` sitter på samma stela kropp som `butt→hosel` och roterar lika jämnt genom svingen. Varje tal nedan står därför i par: bladets siffra bredvid skaftets, mätt på **samma frames**. Ligger bladet i samma storleksordning som skaftet bär det troligen signal; ligger det en storleksordning över är det modellen som gissar.

**Ett hopp över 90° betyder att `toe` och `heel` bytt plats.** De är två ändar på en kort linje — en omkastning flyttar vinkeln ~180°, så allt bortom halvvägs ligger närmare en omkastning än en rotation.

## 2. Täckning — predicerar modellen alla fyra punkterna?

| | Frames | Andel |
|---|---:|---:|
| Frames totalt | 641 | |
| Detektion alls | 607 | 95 % |
| `butt`+`hosel` över tröskeln | 537 | 84 % |
| **Alla fyra över tröskeln (mätmängden)** | **496** | **77 %** |

| Punkt | Predicerad på | Andel |
|---|---:|---:|
| `butt` | 607 | 95 % |
| `hosel` | 537 | 84 % |
| `toe` | 502 | 78 % |
| `heel` | 498 | 78 % |

**Den fetstilta raden är förutsättningen för allt nedanför.** Predicerar modellen sällan `toe` och `heel` är det svaret i sig: då finns ingen bladvinkel att vara stabil eller instabil om, och resten av rapporten mäter en delmängd som kan vara godtyckligt lättare än setet.

## 3. Tidssteg mellan konsekutiva frames

| Mått | Värde |
|---|---:|
| Mätta par | 278 |
| Svingar med minst ett par | 161 av 204 |
| Tidssteg, median | 0.297 s |
| Tidssteg, p90 | 0.680 s |
| Par förkastade, tidssteg > 1.0 s | 23 |
| Par förkastade, tidssteg ≤ 0 | 0 |

**Detta är mätningens huvudreservation.** Frames:en är inte grannbilder i video — varje batch drar ungefär *en* frame per sving ur de ~20 extraktorn valde, och en sving har en serie alls bara för att alla tre batchar läses ihop. Mellanrummen är riktiga sekunder, och en klubba hinner långt på en tredjedels sekund. Därför mäts allt **per sekund**, aldrig per frame — och därför står skaftkolumnen bredvid: den bär exakt samma glesa sampling.

## 4. Vinkeländring per sekund

| Mått | Bladvinkel | Skaftvinkel | Kvot blad/skaft |
|---|---:|---:|---:|
| Median \|Δv/Δt\| | 109.0 °/s | 144.2 °/s | 0.76× |
| p90 \|Δv/Δt\| | 502.4 °/s | 1077.2 °/s | -- |
| Par med hopp > 90° | 20 (7 %) | 117 (42 %) | -- |

Kvoten är talet att läsa. Nära 1 betyder att bladvinkeln rör sig som skaftvinkeln gör, alltså som en fysisk linje på samma klubba. Storleksordningar över betyder att den rör sig som brus.

**Skaftets hoppandel är inte noll och ska inte vara det.** Med tidssteg runt 0.30 s roterar en klubba verkligt mer än 90° i nedsvinget. Skaftkolumnen säger alltså hur stor del av bladets hopp som den glesa samplingen ensam förklarar; det som ligger däröver är omkastningar.

## 5. Per `view` och `blur`

### `view`

| view | Par | Blad median | Blad p90 | Skaft median | Kvot | Blad > 90° | Skaft > 90° |
|---|---:|---:|---:|---:|---:|---:|---:|
| dtl | 263 | 103.7 | 421.6 | 144.0 | 0.72× | 6 % | 41 % |
| face_on | 12 | 399.6 | 672.4 | 379.5 | 1.05× | 33 % | 58 % |
| (blandad) | 3 | 131.2 | 1365.4 | 21.8 | 6.03× | 33 % | 33 % |

### `blur`

| blur | Par | Blad median | Blad p90 | Skaft median | Kvot | Blad > 90° | Skaft > 90° |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 219 | 107.7 | 442.5 | 125.0 | 0.86× | 5 % | 41 % |
| (blandad) | 46 | 105.1 | 418.9 | 163.7 | 0.64× | 9 % | 41 % |
| mild | 10 | 252.0 | 1127.8 | 252.2 | 1.00× | 40 % | 70 % |
| severe | 3 | 504.7 | 603.8 | 813.4 | 0.62× | 67 % | 67 % |

`view` och `blur` är annotatörens attribut och finns bara i `annotated-v*.zip` — de läses **enbart** för den här uppdelningen. Ingen annoterad koordinat rör mätningen. `(osatt)` är en frame utan annotering, `(blandad)` ett par vars två frames bär olika värde.

## 6. De tio svingarna med mest ostabil bladvinkel

| # | `clipName` | `swingIndex` | Par | Blad median | Blad max | Skaft median | Hopp blad/skaft |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | `048.mp4` | 0 | 1 | 1674.0 °/s | 1674.0 °/s | 1368.4 °/s | 1/1 |
| 2 | `IMG_5356.MP4` | 1 | 1 | 1113.6 °/s | 1113.6 °/s | 1438.4 °/s | 1/1 |
| 3 | `IMG_3656.MP4` | 1 | 2 | 1083.8 °/s | 1984.1 °/s | 369.6 °/s | 1/1 |
| 4 | `055.mp4` | 0 | 1 | 944.8 °/s | 944.8 °/s | 17.4 °/s | 0/0 |
| 5 | `035.mp4` | 0 | 2 | 794.0 °/s | 1545.0 °/s | 134.9 °/s | 0/0 |
| 6 | `059.mp4` | 0 | 1 | 729.4 °/s | 729.4 °/s | 581.9 °/s | 1/1 |
| 7 | `IMG_4986.MP4` | 0 | 2 | 678.1 °/s | 783.0 °/s | 677.5 °/s | 0/1 |
| 8 | `021.mp4` | 0 | 2 | 665.0 °/s | 775.7 °/s | 263.1 °/s | 0/0 |
| 9 | `059.mp4` | 1 | 1 | 628.6 °/s | 628.6 °/s | 1033.7 °/s | 1/1 |
| 10 | `IMG_3597.MOV` | 0 | 1 | 627.4 °/s | 627.4 °/s | 107.9 °/s | 0/0 |

Öppna klippet i `data/shaft/clips/<clipName>` och spola till svingen. Rangordningen går på svingens **median**, inte dess max — med två eller tre par skulle en enda dålig frame annars avgöra hela listan; maxkolumnen står kvar så att en sving med lugn median och ett våldsamt par ändå syns.

Frames per sving i listan:

- `048.mp4` s00: `048-0138240e_s00_f04`, `048-0138240e_s00_f05`
- `IMG_5356.MP4` s01: `img-5356-08a7c9cb_s01_f04`, `img-5356-08a7c9cb_s01_f05`
- `IMG_3656.MP4` s01: `img-3656-01178bd0_s01_f02`, `img-3656-01178bd0_s01_f04`, `img-3656-01178bd0_s01_f05`
- `055.mp4` s00: `055-c5e9ec1a_s00_f01`, `055-c5e9ec1a_s00_f02`
- `035.mp4` s00: `035-68774f7c_s00_f02`, `035-68774f7c_s00_f03`, `035-68774f7c_s00_f06`
- `059.mp4` s00: `059-e8c2b996_s00_f01`, `059-e8c2b996_s00_f04`
- `IMG_4986.MP4` s00: `img-4986-275ba8dd_s00_f02`, `img-4986-275ba8dd_s00_f03`, `img-4986-275ba8dd_s00_f05`
- `021.mp4` s00: `021-68ef6599_s00_f02`, `021-68ef6599_s00_f03`, `021-68ef6599_s00_f04`
- `059.mp4` s01: `059-e8c2b996_s01_f03`, `059-e8c2b996_s01_f05`
- `IMG_3597.MOV` s00: `img-3597-446728b3_s00_f03`, `img-3597-446728b3_s00_f04`

## 7. Hur siffran ska läsas

Stabilitet är **inte** träffsäkerhet. En modell som sätter `toe` och `heel` konsekvent på fel ställe — spegelvänt, eller på kronan i stället för solan — är perfekt stabil och ändå fel. Måttet kan alltså **frikänna** bladvinkeln från anklagelsen brus, men det kan inte döma den rätt. Den frågan avgörs av ett kalibreringspass i fyrapunktsschemat (annotation-spec.md → *Kalibreringsutfall 2026-09*), och tills det finns är det här det bästa som går att mäta.

Åt andra hållet är utslaget skarpt: ligger bladets median storleksordningar över skaftets, eller hoppar den >90° på frames där skaftet inte gör det, är bladvinkeln brus — och det svaret behöver inget facit.

