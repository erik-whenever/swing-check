# libyuv (vendrad)

- **Källa:** https://chromium.googlesource.com/libyuv/libyuv
- **Commit:** `eee459798486116575ed66c6d6609205d445ffb2` (2026-10-01), `LIBYUV_VERSION` 1974
- **Licens:** BSD-3-Clause (`LICENSE`, `PATENTS`)
- **Med:** `source/` (utom `test.sh`), `include/`, `LICENSE`, `PATENTS`, `AUTHORS`, `README.chromium`. Inget annat.
- **Byggs av:** [`../libyuv.cmake`](../libyuv.cmake), som speglar uppströms `CMakeLists.txt` per arkitektur men
  utan verktyg, tester och JPEG.

Varför vendrad och inte hämtad vid bygget: libyuv finns inte i NDK:ns publika API, det finns ingen officiell
AAR, och googlesource ger inga stabila tarball-hashar. Med källan i repot bygger EAS och ett lokalt bygge
samma kod utan nätverk (N-3.2, ADR-0004 tillägget).

Uppdatering: checka ut en ny commit uppströms, ersätt `source/` och `include/`, uppdatera commit och version här
och jämför filistorna i uppströms `CMakeLists.txt` med `libyuv.cmake`.
