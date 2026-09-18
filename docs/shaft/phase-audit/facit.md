# Facit till fasgranskningen

> **Öppna inte förrän [review.md](review.md) är ifylld.** Genererad 2026-09-18 av
> `docs/shaft/phase-audit/select.ts`, samma körning som review-filen. Frö: `0xfa5ec0de`.

## Vad raderna är

- **kandidat** — en av de 22 bildrutor som bär `top` ur manifestet
  *och* är produktionsvägens val: den bildruta `topFrameIndex` i `derived.ts` faktiskt
  räknar `top-shaft-orientation` på. Fasen är härledd ur envelopens proportioner, inte
  observerad. Här mäts felfrekvensen.
- **kontroll** — en bildruta vars fas en annotatör satt för hand, utanför
  `batch-03/annotated-v1.zip` (vars `phase` är CVAT:s orörda förval). Kontrollerna mäter
  omgången, inte mätvärdet: missas de, säger kandidatraderna ingenting.

`envelope-andel` är `(tSec − start) / (finish − start)`. `FALLBACK_BOUNDS` i
`src/lib/dataset/datasetPhase.ts` kallar 0,45–0,52 för `top`, och **det fönstret är hela
skälet till att kandidatraderna heter `top`** när `impactSec` saknas.

| # | frame-id | fas | källa | rad | envelope-andel | impactSec | källklipp | klipplängd | fps | envelope (s) | tSec | plats i envelopen | fasens ursprung |
|---:|---|---|---|---|---:|---|---|---:|---:|---|---:|---|---|
| 1 | `057-1d1b5748_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,484 | **nej** | 057.mp4 | 41,34 s | 30,00 | 0,267–2,534 | 1,364 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 2 | `047-4d3e3909_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,445 | ja (2,524 s) | 047.mp4 | 7,17 s | 30,00 | 1,793–2,922 | 2,295 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 3 | `img-5412-a7756984_s00_f03` | `downswing` | annotation | **kontroll** | 0,606 | ja (6,533 s) | IMG_5412.MP4 | — (klippfilen finns inte i repot) | — | 5,667–6,933 | 6,434 | 4/7 | data/shaft/training/batch-02/annotated-v1.zip |
| 4 | `img-5269-3e863a76_s01_f01` | `top` | annotation | **kontroll** | 0,278 | ja (7,000 s) | IMG_5269.MP4 | — (klippfilen finns inte i repot) | — | 6,133–8,333 | 6,744 | 2/7 | data/shaft/training/batch-01/annotated-v1.zip<br>data/shaft/training/batch-01/annotated-v2.zip |
| 5 | `img-4658-a2f26279_s00_f04` | `finish` | annotation | **kontroll** | 0,677 | **nej** | IMG_4658.MP4 | — (klippfilen finns inte i repot) | — | 2,119–4,569 | 3,778 | 5/7 | data/shaft/training/batch-01/annotated-v1.zip<br>data/shaft/training/batch-01/annotated-v2.zip |
| 6 | `img-5410-e9b74b96_s02_f01` | `top` | manifest (härledd) | **kandidat** | 0,334 | ja (19,000 s) | IMG_5410.MP4 | — (klippfilen finns inte i repot) | — | 18,133–19,400 | 18,556 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 7 | `089-51f5ef4b_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,333 | ja (4,342 s) | 089.mp4 | 16,17 s | 29,94 | 0,802–4,476 | 2,026 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 8 | `att-9izxjrctrbs6ai2850sdllvlwtazmck0rh5u-24285b6a_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,278 | ja (3,448 s) | att.9IzXJRCTRbs6ai2850SDLlVLwTaZmck0rh5ulwAifvQ.mp4 | — (klippfilen finns inte i repot) | — | 2,718–3,912 | 3,050 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 9 | `img-5408-3c48779f_s00_f01` | `top` | annotation | **kontroll** | 0,500 | ja (3,461 s) | IMG_5408.MP4 | — (klippfilen finns inte i repot) | — | 2,596–3,861 | 3,228 | 2/7 | data/shaft/training/batch-02/annotated-v1.zip |
| 10 | `img-4962-9ed639e7_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,389 | ja (9,404 s) | IMG_4962.MP4 | — (klippfilen finns inte i repot) | — | 8,404–9,805 | 8,949 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 11 | `028-4f3f90e8_s00_f06` | `finish` | annotation | **kontroll** | 0,807 | **nej** | 028.mp4 | 11,20 s | 30,00 | 5,800–7,333 | 7,037 | 7/7 | data/shaft/training/batch-01/annotated-v1.zip<br>data/shaft/training/batch-01/annotated-v2.zip |
| 12 | `073-bd53202e_s01_f01` | `top` | manifest (härledd) | **kandidat** | 0,484 | **nej** | 073.mp4 | 17,17 s | 30,00 | 7,718–11,844 | 9,714 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 13 | `img-5423-b345d01e_s01_f01` | `top` | manifest (härledd) | **kandidat** | 0,389 | ja (18,104 s) | IMG_5423.MP4 | — (klippfilen finns inte i repot) | — | 17,238–18,436 | 17,704 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 14 | `img-5384-acea6a74_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,377 | ja (6,000 s) | IMG_5384.MP4 | — (klippfilen finns inte i repot) | — | 5,400–6,467 | 5,802 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 15 | `095-b6402f36_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,484 | **nej** | 095.mp4 | 19,83 s | 30,00 | 0,267–5,276 | 2,691 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 16 | `093-2c11c3c0_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,333 | ja (5,400 s) | 093.mp4 | 28,87 s | 30,00 | 4,267–5,867 | 4,800 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 17 | `img-5417-87102d79_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,500 | ja (4,467 s) | IMG_5417.MP4 | — (klippfilen finns inte i repot) | — | 3,333–4,933 | 4,133 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 18 | `031-eda42b98_s00_f05` | `top` | annotation | **kontroll** | 0,806 | **nej** | 031.mp4 | 17,70 s | 29,94 | 4,192–8,717 | 7,841 | 6/7 | data/shaft/training/batch-02/annotated-v1.zip |
| 19 | `009-1617ed23_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,484 | **nej** | 009.mp4 | 2,13 s | 30,00 | 0,333–1,933 | 1,108 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 20 | `img-5407-1eb975b8_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,333 | ja (8,800 s) | IMG_5407.MP4 | — (klippfilen finns inte i repot) | — | 7,867–9,200 | 8,311 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 21 | `054-0d1b3ff3_s00_f00` | `backswing` | annotation | **kontroll** | 0,278 | ja (4,996 s) | 054.mp4 | 23,91 s | 30,00 | 2,531–5,395 | 3,327 | 1/7 | data/shaft/training/batch-01/annotated-v1.zip<br>data/shaft/training/batch-01/annotated-v2.zip |
| 22 | `img-4979-bd8e32e5_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,389 | ja (1,467 s) | IMG_4979.MP4 | — (klippfilen finns inte i repot) | — | 0,533–2,000 | 1,104 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 23 | `img-4979-bd8e32e5_s01_f02` | `top` | manifest (härledd) | **kandidat** | 0,389 | ja (7,333 s) | IMG_4979.MP4 | — (klippfilen finns inte i repot) | — | 6,400–7,733 | 6,919 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 24 | `img-5356-08a7c9cb_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,500 | ja (9,333 s) | IMG_5356.MP4 | — (klippfilen finns inte i repot) | — | 8,200–9,800 | 9,000 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 25 | `img-5425-f0abd4a8_s00_f04` | `downswing` | annotation | **kontroll** | 0,601 | ja (3,530 s) | IMG_5425.MP4 | — (klippfilen finns inte i repot) | — | 2,664–3,996 | 3,464 | 5/7 | data/shaft/training/batch-01/annotated-v1.zip<br>data/shaft/training/batch-01/annotated-v2.zip |
| 26 | `img-3641-adde195e_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,484 | **nej** | IMG_3641.MP4 | — (klippfilen finns inte i repot) | — | 6,111–8,170 | 7,107 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 27 | `img-5186-586918f4_s00_f03` | `top` | annotation | **kontroll** | 0,445 | ja (4,122 s) | IMG_5186.MP4 | — (klippfilen finns inte i repot) | — | 2,792–4,587 | 3,590 | 4/7 | data/shaft/training/batch-01/annotated-v1.zip<br>data/shaft/training/batch-01/annotated-v2.zip |
| 28 | `061-f51f439d_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,556 | ja (2,519 s) | 061.mp4 | 5,70 s | 30,00 | 1,127–2,916 | 2,121 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 29 | `055-c5e9ec1a_s00_f01` | `backswing` | annotation | **kontroll** | 0,277 | ja (2,880 s) | 055.mp4 | 6,23 s | 29,68 | 2,009–3,483 | 2,418 | 2/7 | data/shaft/training/batch-02/annotated-v1.zip |
| 30 | `045-224bdedb_s00_f01` | `top` | manifest (härledd) | **kandidat** | 0,500 | ja (2,667 s) | 045.mp4 | 31,60 s | 29,94 | 1,667–3,133 | 2,400 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 31 | `093-2c11c3c0_s01_f01` | `top` | manifest (härledd) | **kandidat** | 0,334 | ja (21,600 s) | 093.mp4 | 28,87 s | 30,00 | 20,533–22,133 | 21,067 | 2/7 | data/shaft/training/batch-03/batch.zip → manifest.json |
| 32 | `068-db6f6eec_s00_f02` | `top` | manifest (härledd) | **kandidat** | 0,444 | ja (1,855 s) | 068.mp4 | 5,10 s | 30,00 | 0,729–2,318 | 1,435 | 3/7 | data/shaft/training/batch-03/batch.zip → manifest.json |

`plats i envelopen` är bildrutans nummer bland svingens envelope-bildrutor i
`data/shaft/exports/` — den förklarar vilka rader som saknar `före` eller `efter` i
review-filen (första respektive sista bildrutan i svingen).

## Klipplängd och fps

Lästa ur MP4-filens `mvhd`/`mdhd`+`stts` i `data/shaft/clips/`. Varken batch-manifestet
eller exportmanifestet bär någon av dem, och ingen `ffprobe` finns på PATH här — därför
läses de ur filen eller inte alls. Klipp som inte ligger i repot får `—`, aldrig ett tal
härlett ur envelopen: envelopens längd är svingens, inte klippets.
