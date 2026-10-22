# Slow-mo i de egna klippen: census, uppladdningsväg, tidströsklar

> 2026-09-21, `stream-shaft`. **Ren diagnos — inga kodändringar, ingen
> commit.** Inget i `src/` är ändrat; alla trösklar citerade nedan är lästa,
> aldrig rörda. De två Python-skript som byggdes för att svara på fråga 1
> (`mp4_probe.py`, `census.py`) ligger i sessionens scratchpad, **inte**
> committade och **inte** under `docs/`.

## 0. Metodanmärkning — ingen ffprobe på den här maskinen

Uppgiften bad om ffprobe. Den finns inte installerad här (`ffprobe`/`ffmpeg`
saknas i PATH, och ingen av de tre Python-venv:erna i repot
(`data/shaft/top-review/.venv`, `training/.venv`, systemets `python`) har
`pyav`, `mutagen` eller `hachoir` — bara opencv:s interna avkodnings-DLL, som
inte exponerar container-metadata). **Ersatt med en egen, liten ISO-BMFF-läsare**
(stdlib-only, `struct`+`json`, ~250 rader): läser `moov`/`trak`/`mdia`-boxarna
direkt — `mvhd`/`mdhd` (tidsbas + varaktighet), `stts` (sampelantal → beräknad
fps, och hur många DISTINKTA sampel-deltan som förekommer — en enda konstant
delta betyder en jämn bildtakt, flera betyder ojämn/variabel), `elst`
(edit-list, inkl. `media_rate` — en direkt "spela av i icke-1×-takt"-flagga om
den någonsin sätts), samt `udta`/`meta` (klassisk QuickTime + moderna
`keys`/`ilst`-taggar). Kompletterat med en rå byte-sökning efter
`com.apple.*`-strängar, eftersom den strukturerade `meta`-läsningen gav tomt
för dessa filer (Apples taggar för de här klippen ligger inte i `moov/meta`
utan sannolikt i en `mebx`-spårs sampeldata — se §1.4).

**Verifierat, inte antaget:** parsern kördes mot alla 70 filer i
`data/shaft/clips/own/`, ingen kastade fel, och resultaten (fps, tidsbas,
sampelantal) stämmer exakt mot de fps/varaktighetstal
[own-clips-stability.md](own-clips-stability.md) §6 redan hade mätt via
`run_pose_clip.py`/OpenCV för de klipp som förekommer i båda (3555: 119,9→
119,936; 3655: 115,3→115,317; alla övriga 30,0). Ingen referens-ffprobe fanns
att stämma av mot på den här maskinen — siffrorna är interna (box-läsning mot
box-läsning, två oberoende kodvägar: OpenCV:s avkodare i förra rundan, en
handskriven box-parser här), inte externt validerade mot ett tredje verktyg.

---

## 1. Fråga 1 — hur många av de 70 är slow-mo, och hur gick det?

### 1.1 Facit: en enda Apple-nyckel skiljer perfekt

`com.apple.quicktime.full-frame-rate-playback-intent` — dokumenterad av Apple
som QuickTime-metadatanyckeln för klipp inspelade i Slo-Mo-läge — förekommer i
filen (rå bytesökning, inte bara boxstruktur) hos **exakt 11 av 70** klipp,
och i **noll** av de övriga 59. Samma 11 klipp, och bara de, bär också:

- **codec `hvc1` (HEVC)** i videospåret — alla övriga 59 kör `avc1` (H.264).
  100 % korrelation, noll undantag (kontrollerat på alla 70, inte ett urval).
- **filändelse `.MOV`** — men `.MOV` i sig räcker INTE: en tolfte `.MOV`-fil
  (`juli132025-1134fm-7TBr3k.MOV`, det udda, icke-`IMG_`-namngivna klippet)
  saknar taggen, kör `avc1`, och är alltså sannolikt inte en direkt
  iPhone-kameraexport (troligen delad/nedladdad, se
  [source-split.md](source-split.md)-resonemanget om `own`-katalogens
  blandade proveniens).
- **`ftyp`-major-brand `qt  `** — samma för alla 12 `.MOV`, inte
  diskriminerande i sig.

Ingen `elst`-post hos någon av de 70 klippen har `media_rate ≠ 1.0`
(kontrollerat på alla videospår) — hypotesen "tidssträckningen är kodad som en
avspelningstakt i edit-listan" **håller inte**. Se §1.4 för vad som faktiskt
händer i stället.

### 1.2 De 11 slow-mo-klippen — två sorter, ren census

| klipp | videospårets egen fps (beräknad ur `stts`) | distinkta `stts`-deltan | filens varaktighet (`mvhd`) | utfall i [own-clips-stability.md](own-clips-stability.md) |
|---|---:|---:|---:|---|
| `IMG_3555.MOV` | **119,94** | 2 | 0,78 s | 0 accepterade — "ingen adressplatå" (119,9 fps äkta höghastighet) |
| `IMG_3655.MOV` | **115,32** | 5 | 6,18 s | **1 accepterad** (`OWN-005`) — äkta höghastighet, bär §3:s max-ruteskillnad |
| `IMG_3550.MOV` | 30,00 | 1 | 6,17 s | 0 accepterade — kullad: burst för lång (6,13 s > 5,5 s) |
| `IMG_3556.MOV` | 30,00 | 1 | 3,93 s | 0 accepterade — "ingen adressplatå" (**inte** ett längdfel) |
| `IMG_3557.MOV` | 30,00 | 1 | 12,20 s | 0 accepterade — kullad: burst för lång (9,10 s) |
| `IMG_3558.MOV` | 30,00 | 1 | 11,13 s | 0 accepterade — kullad: burst för lång (7,13 s) |
| `IMG_3569.MOV` | 30,00 | 1 | 13,60 s | 0 accepterade — kullad: burst för lång (6,03 s) + 2 andra kandidater förkastade |
| `IMG_3575.MOV` | 30,00 | 1 | 4,77 s | 0 accepterade — "klippt svans" (**inte** ett längdfel) |
| `IMG_3583.MOV` | 30,00 | 1 | 12,77 s | 0 accepterade — kullad: burst för lång (11,23 s) |
| `IMG_3587.MOV` | 30,00 | 1 | 22,70 s | 0 accepterade — 3 burstar kullade (korta/långsamma) + 1 "klippt svans" |
| `IMG_3597.MOV` | 30,00 | 1 | 51,53 s | **1 accepterad** (`OWN-003`) — men tappad senare vid den kalla E3-kontrollen (orelaterat till längd) |

**11, inte 7 eller 9.** Uppgiftens bakgrund räknade 7 (de som fastnade på
`MAX_BURST_SEC`/`MAX_ENVELOPE_SEC`) plus 2 äkta höghastighetsklipp nämnda
separat = 9 kända sedan tidigare. Metadatacensusen hittar **2 till**:
`IMG_3556.MOV` och `IMG_3597.MOV` bär samma Slo-Mo-flagga men syns inte i en
"för lång"-sökning eftersom de aldrig föll på en längdgräns —
`IMG_3556.MOV` föll på "ingen adressplatå" (en trolig konsekvens av att
klippet börjar redan i rörelse, se §1.4), och `IMG_3597.MOV` **klarade sig
faktiskt igenom** segmentering och grind (1 accepterad sving) och föll först
vid ett senare, orelaterat kontrollsteg. Slow-mo-andelen bland de egna
klippen är alltså **11/70 = 15,7 %**, inte de 9 som gick att räkna fram från
avslagsskälen allena — och av de 11 gav bara 2 någonsin en mätbar rad
(`OWN-005` från `3655`; `OWN-003` från `3597`, senare tappad).

### 1.3 De 59 icke-slow-mo-klippen — inga falska positiva hittade

Samtliga 59 saknar taggen, kör `avc1`, och 51 av dem har en video-`stts` med
**exakt en** konstant delta (perfekt jämn bildtakt — inget tecken på dold
tidsstretchning). 8 st (`att.qSm7...mp4`, `IMG_1558.MP4`, `IMG_4571.MP4`,
`IMG_4603.MP4`, `IMG_4982.MP4`, `IMG_4986.MP4`, `IMG_5385.MP4`,
`IMG_5407.MP4`) har **2** distinkta deltan som skiljer med 1 tick (t.ex.
`≈29,99` i stället för exakt `30,00`) — klassisk NTSC-drift-avrundning i
kodaren, inte ett slow-mo-tecken (samma mönster finns inte i något av de 11
flaggade klippen). Ingen av de 59 har ett videospår vars beräknade fps
avviker uppåt från ~30 — **ingen dold, oflaggad höghastighetsfil hittades**,
men se förbehållet i §1.4/§4: metadataanalys kan bara hitta det som lämnar ett
spår, och det finns ett läge där spåret försvinner helt.

### 1.4 Vad som faktiskt "avslöjar" en inbakad slow-mo — och vad som INTE gör det

**Det tydliga svaret: filändelse `.MOV` + codec `hvc1` + Apple-nyckeln
`full-frame-rate-playback-intent` slår fel på inget av de 70 klippen.** Det
är en giltig, perfekt separerande signal på det här urvalet.

**Vad som INTE avslöjar det: videospårets egen bildtakt/tidsbas.** De 9
"flata" slow-mo-klippen (`3550`, `3556`, `3557`, `3558`, `3569`, `3575`,
`3583`, `3587`, `3597`) har ett videospår som är **exakt, konstant 30,000
fps** — samma `stts`-form (en enda post, en enda delta) som en helt vanlig,
äkta 30 fps-inspelning. Det finns ingen `elst`-avspelningstakt, ingen
sekundär höghastighetskopia av bildspåret, ingenting i `mvhd`/`mdhd`/`stts`
som skiljer dem från en genuint 30 fps-lång golfsession. **Tidssträckningen
är bakad in i själva bildplaceringen, inte representerad som en avvikande
takt** — konsekvent med hur Apples Slo-Mo fungerar: inspelningen sker hela
tiden i en konstant hög bildtakt (120/240 fps), en `mebx`-tidsmetadataspår
markerar VILKET tidsintervall som ska spelas "sakta", och när klippet
exporteras/delas (inte bara visas i Bilder) renderar iOS en NY fil där
partierna utanför markeringen decimeras ned till exportens bildtakt (30 fps)
medan det markerade intervallet behåller VARJE högtakts-bildruta på samma
30 fps-tidslinje — vilket sträcker just det intervallets verkliga
uppspelningstid med samma faktor som förhållandet mellan fångst- och
exporttakten (≈4× vid 120→30, ≈8× vid 240→30). Efter den renderingen är
resultatet, bild-för-bild, oskiljbart i tid från en ärligt inspelad 30
fps-fil — det finns ingen kvarvarande flagga att läsa av i själva
bildspåret. **Det enda som avslöjar det i efterhand är den fristående
Apple-capture-mode-taggen (§1.1), inte något tidsmått.**

`IMG_3550.MOV`/`3557`/`3558`/`3569`/`3583` har alla en extra `mebx`
("Core Media Metadata")-spår med hög, men **oregelbunden** beräknad takt
(t.ex. `3550`: 47,0 med 38 distinkta deltan över 258 poster) — det skiljer
sig från de rena höghastighetsklippens jämnare `mebx`-mönster, men samma
sorts `mebx`-spår med liknande spridning finns **också** i minst ett av de
icke-flaggade kontrollklippen (`IMG_4613.MP4` bär två `mebx`-spår vid ~120
Hz) — de här spåren är sannolikt sensor-/exponeringstelemetri som iPhone
lägger till på ALL kameraappsvideo, inte en slow-mo-specifik signal, och
dög alltså inte som egen diskriminator. Den strukturerade avkodningen av VAD
`full-frame-rate-playback-intent`-spåret faktiskt kodar per tidpunkt (dvs.
exakt VILKET delintervall av filen som är det sträckta) gjordes inte — bara
att nyckeln finns i filen någonstans är verifierat, inte dess tidsupplösta
värde. Det är utanför vad den här omgången hann täcka; se §4.

---

## 2. Fråga 2 — hur når en video från Bilder appens pipeline?

**Vägen, läst rad för rad, ingen omkodning någonstans i `src/`:**

1. `src/components/Camera/CameraView.tsx:444–450` — filväljaren:
   `<input type="file" accept="video/*" onChange={handleFileUpload} />`,
   den enda uppladdningsingången i appen (`ShaftPreviewView.tsx` och
   `DatasetExtractorView.tsx` har likadana `accept="video/*"`-väljare, men
   de är dev-verktyg, inte den skarpa camera-flödet).
2. `handleFileUpload` (rad 141–147) tar `e.target.files[0]` **rakt av** och
   skickar den vidare som `File`-objektet (en `Blob`-subtyp) — ingen
   transkodning, ingen omvandling.
3. `processVideo` (rad 108–139) sätter `blob = file` och anropar
   `extractFrames(blob, …)` (rad 116) direkt.
4. `extractFrames` (`src/lib/frameExtractor.ts:95`) → `selectViaPose` (rad
   237) → `extractPoseTrajectory(videoBlob)` (`src/lib/poseTrajectory.ts:62`,
   anropad rad 243).
5. `extractPoseTrajectory` skapar en dold `<video>`, sätter
   `video.src = URL.createObjectURL(videoBlob)` (rad 72–77), och läser
   **`video.duration`** (rad 90) — det är den ENDA platsen "längd" kommer
   ifrån. Ingen kod i pipelinen läser containerns egen `fps`-,
   `timescale`- eller codec-metadata NÅGONSIN.
6. Samplingen sker på en **fast väggklockstakt**, `SAMPLE_FPS = 15`
   (`poseTrajectory.ts:15`), oberoende av klippets egen inkodade bildtakt:
   `count = round(min(duration, MAX_ANALYSIS_SEC) * 15)` (rad 98–101), och
   varje sampel hämtas genom att sätta `video.currentTime` och vänta på
   `onseeked` (`seekTo`, rad 194–199) — ren väggklockstid, inte
   bildruteindex.

**Konsekvensen är rak:** hela pipelinen litar blint på `HTMLVideoElement
.duration`, vilket är webbläsarens avmuxare/avkodares tolkning av
containerns EGNA tidsstämplar (`mvhd`/`mdhd`-varaktigheten från §1). Om en
fil har renderats med den sträckta tiden bakad in (§1.4) rapporterar
webbläsaren exakt den sträckta längden som "sann" — pipelinen kan inte se
skillnaden, för den ber aldrig om bildtakt, bara om `duration` och
`currentTime`. `MAX_BURST_SEC`/`MAX_ENVELOPE_SEC` (fråga 3) mäts alltså på
precis det tal en sträckt fil ljuger med.

**Uppdatering 2026-10-22 (S-42):** telefontest på prod bekräftar att väljaren lämnar ut den
**tidssträckta** filen — ett Slo-mo-klipp ur iOS Bilder gav span 0–19,23 s, en burst på 6,85 s fälld
av `MAX_BURST_SEC` (5,5 s) och 0 svingar. Om Apples spår (nyckeln nedan, `hvc1`, `mebx`) överlever
väljaren läses av med dev-panelen *Container metadata* i Frame Preview. **Svar (Eriks telefontest
2026-10-22, `IMG_3584.mov`):** nyckeln finns kvar (`full-frame-rate-playback-intent = 0`), `mvhd`
19,300 s = `video.duration`, men videon är **omkodad till `avc1`** (från `hvc1`) och bara ett
`mebx`-spår (`segment-identifier`) återstår. Nyckeln duger alltså som detektor; codec gör det inte.
Se §5 för om intervallet/faktorn följer med.

**Vad som INTE går att verifiera härifrån:** exakt vad iOS Bilder-väljaren
(`<input type=file>` i Safari/PWA-kontext) lämnar ut när användaren väljer
en video ur Bilder — om det är originalfilen orört, eller om iOS själv gör
något på vägen (t.ex. "Mest kompatibel"-transkodning inställd i
Inställningar → Kamera → Format) ligger utanför appens kod och kunde inte
läsas av härifrån. Ingen omkodning sker i `src/` — `package.json` och en
grep över `src/` gav noll träffar på ffmpeg/transcode/webcodec — men vad OS:et
gjorde INNAN filen nådde väljaren är okänt, inte uteslutet.

---

## 3. Fråga 3 — tidsbaserade trösklar som slår fel på en N× för lång sving

Alla mått nedan är väggklocksekunder i klippets EGEN, rapporterade
`video.duration`-tidslinje (§2) — ingen av dem känner till containerns
verkliga bildtakt.

| konstant | värde | fil:rad | vad den gör | hur den slår mot en N× sträckt sving |
|---|---:|---|---|---|
| `MAX_BURST_SEC` | **5,5 s** (= `MAX_ENVELOPE_SEC` + `POST_FINISH_TAIL_SEC`) | `poseSegments.ts:116`, testad rad 358/375 | Grovgallring: en rörelsebursts YTTRE längdtak, INNAN `detectSwingEnvelope` ens körs | **Den dominerande dödsorsaken** i den här datan: `3550` (6,13 s), `3557` (9,10 s), `3558` (7,13 s), `3583` (11,23 s), delar av `3569`/`3587` kulllas här, tyst innan envelope-steget nås |
| `MAX_ENVELOPE_SEC` | **3,0 s** | `poseSegments.ts:54`, testad rad 441 (`isSwing`) | Kvalitetsgrind: en accepterad envelope (start→finish) får inte vara längre | Andra linjens dödsorsak — träffar kandidater som klarade burst-taket men vars envelope ändå sträcker sig för långt (t.ex. `IMG_5405.MP4` i [own-clips-stability.md](own-clips-stability.md) §5: envelope 3,90 s > 3,0 s — inte ett slow-mo-klipp i den här censusen, men samma mekanism) |
| `MAX_DOWNSWING_SEC` | **0,6 s** | `poseSegments.ts:131` | Kvalitetsgrind: top→impact får inte ta längre tid (bara tillämpad NÄR en `impact` hittades) | Skulle träffa ett sträckt klipp vars nedsving (normalt ~0,25 s) blir >0,6 s efter en ≥2,4× sträckning — men bara OM `detectSwingEnvelope` ändå hittade en konfident impact; i praktiken fångar `MAX_ENVELOPE_SEC`/`MAX_BURST_SEC` de flesta sträckta fallen först |
| `MIN_BURST_SEC` | 0,7 s | `poseSegments.ts:88` | Grovgallring, undre gräns (waggle/ryck) | Sträckning gör en burst LÄNGRE, aldrig kortare — den här gränsen blir om något LÄTTARE att klara på ett sträckt klipp, inte svårare |
| `MIN_ENVELOPE_SEC` | 0,7 s | `poseSegments.ts:53` | Kvalitetsgrind, undre gräns | Samma riktning som ovan — sträckning för bort från den här gränsen, inte mot den |
| `MIN_DOWNSWING_SEC` | 0,12 s | `poseSegments.ts:124`, `poseEnvelope.ts:119` | Kvalitetsgrind/impact-grind, undre gräns | Sträckning för bort från den här gränsen (nedsvingen blir längre, inte kortare) |
| `POST_FINISH_TAIL_SEC` | 2,5 s | `poseSegments.ts:96` | Eftersläp efter bursten innan stillhet krävs — komponent i `MAX_BURST_SEC` | Sträcks den riktiga finish-hållningen (normalt ~1,2–2,1 s uppmätt, se `poseSegments.ts:92`) längre än 2,5 s hittas ingen ö efter bursten, och bursten fortsätter växa mot `MAX_BURST_SEC` i stället för att stängas — bidrar till att förvärra `MAX_BURST_SEC`-fallet, är inte en egen felkälla |
| `MIN_ADDRESS_SEC` | 0,3 s | `poseSegments.ts:70`, `poseEnvelope.ts:44` | Kortaste stillnadsö som bryter två rörelsebursta åt, och kortaste address-platå `detectSwingEnvelope` kräver | Sträckning gör en äkta address-hållning LÄNGRE — lättare att klara, inte svårare. Men en KORT, icke-address-paus (waggle-topp, ett kort andrum) som normalt är för kort för att räknas som en ö kan efter sträckning BLI lång nog — det kan i teorin klyva en sträckt sving i flera falska burstar i stället för att bara göra den för lång. Inte bekräftat i den här datan (ingen av de 11 slow-mo-klipp visar fler kandidater än väntat), men mekanismen finns |
| `FINISH_MIN_HOLD_FRAMES` | 3 sampel ≈ 0,2 s vid `SAMPLE_FPS`=15 | `poseEnvelope.ts:85` | Kräver en hållen, låghastighets finish (skiljer finish från backswing-toppens korta dvala) | Ramtal, inte sekunder — vid fast 15 Hz-sampling (§2) blir 3 sampel alltid ≈0,2 s oavsett sträckning; sträckning gör den riktiga finish-hållningen LÄNGRE i sampel, lättare att klara |
| `COOLDOWN_SEC` | 2,0 s | `poseSegments.ts:147` | Skydd mot dubbelräkning av samma accepterade sving | Sträckning ökar avståndet mellan svingar i den rapporterade tidslinjen — gör den HÄR gränsen lättare att klara (falsk cooldown-avvisning blir mindre trolig, inte mer) |
| `MAX_ANALYSIS_SEC` | 300 s | `poseTrajectory.ts:40` | Tak på hur mycket av klippet som pose-analyseras alls (trunkerar, tyst degraderar aldrig samplingstakten) | Ingen av de 70 klippen når 300 s (längsta filen `IMG_5356.MP4`, 63,5 s, ett normalt klipp, inte slow-mo) — men en tillräckligt sträckt session (t.ex. 8× på en 40 s session) SKULLE trunkeras här, med tyst bortfall av allt bortom 300 s |

**Sammanfattning av vilken tröskel som faktiskt gör jobbet:** i den här
datan är det nästan uteslutande `MAX_BURST_SEC` (5,5 s, grovgallringen,
INNAN envelope-detektion) som fäller de sträckta klippen — inte
`MAX_ENVELOPE_SEC`. De två är olika storheter (bursten är en obeskuren
övermängd av envelopen, se `poseSegments.ts:97–114`s egen motivering), och
en 4–8× sträckning slår normalt igenom på burst-nivån långt innan den ens
hinner till envelope-gränsen. De undre gränserna (`MIN_*`) är strukturellt
ofarliga mot sträckning — de blir bara lättare att klara — vilket betyder
att en falsk NEGATIV från sträckning (en sving som borde accepterats men
kastas) i det här systemet så gott som alltid går via en ÖVRE
tidsgräns, aldrig en undre.

---

## 4. Vad det här INTE säger

- **Ingen kod är ändrad, ingen tröskel är föreslagen ändrad.** Allt citerat
  ovan är läst, aldrig rört.
- **Metadatametoden hittade ingen dold, oflaggad slow-mo bland de 59 övriga
  klippen** — men den kan per konstruktion bara hitta det som lämnar ett
  spår. Om ett klipp genomgått SAMMA export-till-30fps-process som §1.4
  beskriver men senare passerat genom ett verktyg som stripat Apples
  `com.apple.quicktime.*`-nycklar (t.ex. ompaketering via tredjepartsapp)
  skulle det vara omöjligt att skilja från en äkta 30 fps-inspelning med
  metoderna här — samma slutsats som §1.4 drar för de 9 flaggade klippen
  själva, fast en nivå djupare (utan flaggan finns inte ens den signalen).
- **`full-frame-rate-playback-intent`-nyckelns TIDSUPPLÖSTA värde (vilket
  delintervall som är "sakta") avkodades inte.** Bara närvaron av nyckeln
  i filen är verifierad. En fullständig avkodning kräver att tolka
  `mebx`-spårets lokala nyckeltabell (i `stsd`) och sampeldata per
  chunk-offset (`stsc`/`stco`/`co64`) — inte gjort här, se ovan.
- **Ingen ffprobe-referens fanns att stämma av mot** (§0) — siffrorna vilar
  på en egenskriven parser, verifierad mot en oberoende tidigare mätning
  (OpenCV) för de klipp som överlappar, men inte mot ett tredje,
  branschstandard-verktyg.
- **Extrapolera inte "11/70" till hela användarbasen.** Det är en andel av
  ERIKS eget urval (samma försiktighet [own-clips-stability.md](own-clips-stability.md)
  §7 redan gav) — inget sagt om hur vanligt Slo-Mo-inspelade svingar är
  bland riktiga användare.
- **Ingen fix föreslås.** Uppgiften bad uttryckligen om diagnos, inte åtgärd.

## 5. S-43 — bär filen VILKET intervall som är slowat, och med vilken faktor?

**Nej, inte som uppgift i filen.** Allt som avkodats, alla 11 egna Slo-Mo-klipp (TS-parsern
`src/lib/mp4Probe.ts`, ingen pipelinekod rörd):

- **`elst`:** en enda post per spår, `media_rate` = 1 överallt. Ingen avspelningstakt.
- **`moov/meta`:** `full-frame-rate-playback-intent` (0 för de 10 renderade, **1** för äkta
  höghastighet `3655`) + plats, modell, mjukvara, datum, (3555/3655) lins. Inget intervall, ingen takt.
- **`mebx`-nyckeltabeller (`stsd` → `keys`/`keyd`/`dtyp`) och sampeldata (`stsz`/`stsc`/`stco`):**
  `segment-identifier` är ett enda sampel över hela klippet med ett **UUID** (36 B ASCII,
  t.ex. `59AFE015-530E-444F-8515-F01A123FF489` för 3550) — en identitet, inte ett intervall.
  `3655` bär dessutom `video-orientation` (6) och `detected-face`; inget av det är tid.

**Implicit och exakt — men bara när telemetrispåret finns.** `scene-illuminance` skrivs i fast
fångsttakt (120 Hz). När iOS renderar Slo-Mo-exporten sträcks telemetrins sampel med bilden, så varje
sampels Δ / bas-Δ (1/120 s) **är** den lokala uppspelningsfaktorn (`stretchProfile` i parsern):

| klipp | 1× | ramp upp | **platå** | ramp ner | 1× | verklig tid i platån |
|---|---|---|---|---|---|---:|
| `IMG_3550` | 0–0,48 s | 0,48–0,93 (via 2×) | **4× 0,93–5,43 s** | 5,43–5,70 | 5,70–6,15 | 1,12 s |
| `IMG_3587` | 0–1,28 | 1,28–1,75 | **4× 1,75–21,16** | 21,16–21,44 | 21,44–22,70 | 4,83 s |
| `IMG_3597` | 0–2,67 | 2,67–3,12 | **4× 3,12–48,60** | 48,60–48,86 | 48,87–51,50 | 11,32 s |
| `IMG_3655` (äkta 120 fps) | 0–6,18 | — | — | — | — | — |

Det rättar §1.4: spårets "oregelbundna takt" (38 distinkta Δ i 3550) är inte sensorbrus — den är
själva sträckningen. 4× = 120 → 30 fps. **Men 8 av 11 lokala klipp och telefonens väljar-fil
`IMG_3584` saknar spåret helt** (bara `segment-identifier`). Där finns intervall + faktor inte i filen
— och det är precis den fil appen får.

**Näst bästa observerbara: ljudet.** Det slowade partiet renderas med sänkt tonhöjd (omsampling, inte
tystnad). Nollgenomgångsfrekvens per 0,25 s (`audioProfile.ts`, avkodat i webbläsaren) utanför/innanför
telemetri-facit: 3550 ×3,0, 3587 ×4,35, 3597 ×4,74, och stegen ligger vid telemetrins ramper. Som
detektor duger det **inte**: den automatiska "low-pitch run" bryts av bollträffens transient (3587:
slutar 16,0 s mot facit 21,16), ger en falsk körning på icke-sträckta `3655` (×2,81), och
faktorskattningen spretar 3,1–8,4 mot sanna 4×. Panelen visar det som rådata + heuristik, inte som svar.

**Inte gjort:** jämförelse mot Bilder-appens slow-reglage (går inte att läsa härifrån); avkodning av
`detected-face`/`live-photo-info` (ej tidsrelevanta). Om originalet av 3584 hade telemetrispåret och
väljarens omkodning tog bort det, eller om det aldrig fanns, går inte att avgöra från filen.

## Kör om

**Rättelse 2026-10-22 (S-42):** §0:s "den strukturerade `meta`-läsningen gav tomt" stämmer inte för
TS-porten — `full-frame-rate-playback-intent` ligger strukturerat i `moov/meta` (`keys`+`ilst`) med
värdet `0` hos de Slo-Mo-klipp som kontrollerats (3550, 3555), inte i ett `mebx`-spår. Census-utfallet
(11/70) är oförändrat. Parsern finns nu committad som `src/lib/mp4Probe.ts` (samma tal på alla 70
klipp); `src/lib/mp4Probe.local.test.ts` kör den mot 3550/3555/5410 lokalt.


`mp4_probe.py` och `census.py` (scratchpad-only, ej committade) kräver
ingenting utöver systemets Python 3.11 (stdlib only — inga paket). Peka
`census.py <out.json>` mot `data/shaft/clips/own/` (hårdkodad relativ sökväg
i skriptet, kör från repo-roten) för att återskapa hela 70-klipps-tabellen.
