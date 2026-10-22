# Håller S-39:s instabilitet på Eriks eget iPhone-material?

> 2026-09-20, `stream-shaft`. Read-only mätning — **inga kodändringar, inga
> tröskeländringar, ingen commit.** `src/lib/shaft/measure/`,
> `src/lib/poseEnvelope.ts`, `src/lib/poseSegments.ts`, `NEAR_VERTICAL_GATE_DEG`,
> `ON_PLANE_BAND_DEG` och teckenkonventionen är **importerade och anropade, aldrig
> ändrade**. Inget facit behövs och inget jämförs mot facit — frågan är bara om
> kall/varm-utfallet håller, och det kräver ingen mänsklig bedömning.

## 0. Vad frågan var, och blockeringen som styrde upplägget

Uppgiften bad om en ren omkörning av S-39:s störningstest
([verdict-sensitivity.md](top-review/verdict-sensitivity.md) §1, kontrollraden
"E4 kall mot E4 varm") på egna källklipp. **Den går inte att köra som en ren
omkörning**, och det är mätt, inte antaget:
`data/shaft/top-round/registry/registry.json` — S-32-rundans 103 svingar i 81
klipp, som hela S-39-pipelinen (och varenda tidigare rapport i den här strömmen)
är byggd ovanpå — har **exakt 1 sving** med `source: "own"` (`S32-032`,
`IMG_5427.MP4`). De övriga 69 filerna i `data/shaft/clips/own/` har aldrig
körts genom någon granskningsrunda: ingen envelope, ingen fasetikett, ingen
CVAT-export.

Erik godkände (uttryckligen, efter en fråga i sessionen) att den här omgången
i stället **bygger ny envelope-detektion** för de egna klippen — men
återanvänder produktionens egen kod för det, inte en ny uppskattning:
`detectSessionSwings()` i `src/lib/poseSegments.ts` (ADR-003:s
sessionssegmenterare, oförändrad) körs på varje klipps **varma helklippsbana**
via en ny, liten TS-brygga (`envelope_bridge.ts`, i skriptets scratchpad, **inte**
committad och **inte** under `docs/shaft/`). Bryggan importerar och anropar
`detectSessionSwings` — den skriver ingen egen segmenteringslogik.
`segmentSwingCandidates` och `isSwing` i samma fil (stillhet/hastighet →
kandidatfönster, kvalitetsgrind) körs också oförändrade genom den vägen.

**Det här är nytt i den här strömmen, och det ska sägas rakt ut: ingen tidigare
S-31…S-41-omgång har behövt upptäcka svingar — S-32:s registrering gjorde det
åt dem.** Den här omgången gör det själv, första gången. Det finns därför
**inget "facit var sett"-stycke att skriva** — inte för att risken för
anpassning saknas av någon annan anledning, utan för att frågan (byter utfallet
mellan spårartillstånd) inte kräver ett facit alls, och inget är hämtat.

Övriga skript återanvänds **oförändrade**, exakt som i S-39:
`docs/shaft/top-review/run_pose_clip.py` (varm, helklipp),
`docs/shaft/top-from-pose/run_pose.py` (kall, per sving, start env−0,6 s),
`docs/shaft/top-from-dense-signal/run_dense.py` (shaft-v2.onnx på varje
envelope-bildruta), samt ur `docs/shaft/top-review/verdict_sensitivity.py`:
`load_dense`, `clip_landmarks`, `payload_for`, `build_bridge`, `run_bridge`,
`verdict`, `HANDEDNESS` — importerade i en ny, liten drivrutin
(`own_clips_stability.py`, samma scratchpad) som upprepar S-39:s egen
sele (registrering → kall kontrollrad → varm bana → täta detektorbanor →
payload → TS-bryggan `verdict_outcomes.ts`, **oförändrad**) men pekar den mot
en egen registerfil i stället för S-32:s, och lägger till de två extra
uppdelningarna uppgiften bad om (se §2 och §3). Mönstret är exakt det
`coarse_tso.py` (S-41) redan etablerat för att återanvända S-39:s brygga utan
att skriva om den.

### Hur det verifierades att körningen var varm

`run_pose_clip.py` rad 61–63 skapar **en** `PoseLandmarker`-instans **per
klipp**, `running_mode=RunningMode.VIDEO`, och kör `detect_for_video` på **samma
instans** över hela klippets bildrutor i sekvens innan den stängs (`lm.close()`
rad 92) — det är den konfiguration [e2-and-floor.md](top-review/e2-and-floor.md)
§1 visade motsvarar produktionens `extractPoseTrajectory` (kall spårare **per
klipp**, inte per sving, `resetPoseLandmarker()` en gång per extraktion). Filen
är läst rad för rad i den här sessionen, inte antagen. Samma fps-bana som
produktionens varma väg används genomgående: `run_pose.py` (den kalla
störningen) och `run_pose_clip.py` avkodar båda **native fps**, aldrig 15 fps —
det är samma, redan dokumenterade avvikelse S-39 §"vad som INTE mättes" och
S-37 lämnade öppen ("15 fps mot 30"), oförändrad här, inte något den här
omgången introducerar.

### Miljön, verifierad, inte antagen

| | |
|---|---|
| Spårare (mediapipe/opencv/numpy) | `data/shaft/top-review/.venv`: mediapipe **1.0.1**, opencv-python **5.0.0**, numpy **2.4.6** — samma pinnar S-33…S-41 körde |
| Detektor (onnxruntime) | `training/.venv`: onnxruntime **1.30.0** |
| Modeller | `public/models/pose_landmarker_lite.task`, `public/models/shaft-v2.onnx` — bekräftat på disk |
| esbuild | `node_modules/.bin/esbuild.cmd` — bekräftat på disk, samma byggkommando som `verdict_outcomes.ts` |

(`docs/shaft/top-review/.venv`, som S-41:s handoff-anteckning nämner, finns
**inte** på den här maskinen under `docs/` — den ligger under **`data/shaft/
top-review/.venv`**. Ren sökväg-förväxling i anteckningen, inget annat; venv:et
i sig har rätt pinnar.)

---

## 1. Huvudtalet: byter TSO-utfallet mellan spårartillstånden?

**n = 77 rader i 55 oberoende klipp** (78 svingar hittades av
`detectSessionSwings`, 1 — `OWN-003`, `IMG_3597.MOV` — tappades vid samma
konsistenskontroll S-39 använder: `e3_bracket` gav inget värde på den kalla
banan, se §5).

| mätvärde | byter (egna klippen) | jämför webbrundan (S-39) |
|---|---:|---:|
| `top-shaft-orientation` | **5 av 77 (6,5 %)** | **9 av 100 (9,0 %)** |
| `shaft-position-p4` | **3 av 77 (3,9 %)** | **2 av 100 (2,0 %)** |
| `shaft-angle-by-phase` → `top` | **3 av 77 (3,9 %)** | **2 av 100 (2,0 %)** |

**Läsning: instabiliteten håller, den är inte större på eget material — och
skillnaderna mellan 6,5 % och 9,0 %, eller 3,9 % och 2,0 %, är inom det uppgiften
själv satte som brusgräns (±3 rader; 3,9 % mot 2,0 % på n=77/100 är en skillnad
på 1–2 rader).** Det här är **inte** en förbättring att fira och **inte** en
försämring att larma om — det är samma golv som webbrundan mätte, återfunnet på
ett litet, annat urval. `top-shaft-orientation` är fortfarande det mest känsliga
av de tre, som i webbrundan.

De fem bytande TSO-raderna: `OWN-002`, `OWN-005`, `OWN-020`, `OWN-050`,
`OWN-076`.

---

## 2. Vilken sorts byte det är

| mätvärde | svar↔svar (kategori mot kategori) | tystnad↔svar |
|---|---:|---:|
| `top-shaft-orientation` | **2** | **3** |
| `shaft-position-p4` | 0 (per konstruktion — mätvärdet har ingen kategori) | 3 |
| `shaft-angle-by-phase` → `top` | 0 (per konstruktion) | 3 |

De tre tystnad↔svar-bytena för P4 och SABP-top är **samma tre rader**
(`OWN-005`, `OWN-020`, `OWN-076`) — inte en slump: alla tre är rader där
`cameraAngle` (satt `null`, se §0 och §6) kombineras med `phase-missing` på ena
sidan av störningen. De två svar↔svar-bytena för TSO (`OWN-002`: `laid-off` →
`across-the-line` mellan kall/varm; `OWN-050`: `laid-off` → `cannot-determine`)
är riktiga omdömesbyten, inte bara tystnad — samma mönster S-39 §1 såg (57 % av
dess ±1-bytena var kategori mot kategori). **Noll rena teckenbyten**
(across-the-line ↔ laid-off) bland de fem — webbrundans egen kontrollrad hade
också noll vid ±1 ruta, så det håller.

---

## 3. E4:s ruteskillnad mellan körningarna

| | egna klippen | webbrundan (S-39) |
|---|---:|---:|
| rutan lika (varm == kall) | **50 av 77 (65,0 %)** | **73 av 100 (73,0 %)** |
| median (varm − kall) | +0,0 | (ej separat rapporterad, se S-39 §1) |
| \|median\| | 0,0 rutor | — |
| p90 | 1,0 rutor | — |
| max | **63,0 rutor** | — |

**Agreement-talet (65 % mot 73 %) är lägre, men läs det bredvid den enskilda
extremraden innan någon slutsats dras.** `max = 63` kommer från **en** sving,
`OWN-005` (`IMG_3655.MOV`) — ett klipp inspelat i **115,3 fps** (iPhone-slowmo,
se §6), inte 30 fps som resten av rundan. 63 bildrutor på 115 fps är **0,55 s**
— i samma storleksordning som webbrundans p90-svans, inte en ny sorts fel, men
den syns som ett mycket större *rutetal* därför att rutorna är tätare. **Utan
den raden** (n=76): rutan lika 50 av 76 (65,8 %), och den näst största
skillnaden är `OWN-011` (−21 rutor, `IMG_4613.MP4`, 30 fps → 0,70 s — och
noterbart: den raden byter **inte** TSO-utfallet, `laid-off` i båda banorna,
samma mönster som S-39 §4 beskrev för `S32-013`/`S32-080`, en stor
rute­förskjutning som inte alltid kostar utfallet). **Slutsats: agreement-talet
är inte direkt jämförbart rad-för-rad mellan rundorna eftersom fps varierar
inom den egna rundan på ett sätt webbrundan (konsekvent 30 fps, S-39 §0.3) inte
gjorde — ett rutetal på en 115 fps-bana och ett på en 30 fps-bana är olika
enheter.** Ingen korrigering görs här; det bara sägs.

---

## 4. n: rader mot oberoende klipp

- **70 egna klippfiler** i `data/shaft/clips/own/` skannade (samtliga filer i
  katalogen: `IMG_*.MP4`/`.MOV`, plus `att.qSm7J1...mp4` och
  `juli132025-1134fm-7TBr3k.MOV`). En av dem (`IMG_5427.MP4`) bär sedan tidigare
  S-32-rundans enda `own`-sving (`S32-032`) — den här omgångens egen
  auto-segmentering av samma fil är **oberoende** av den (ny körning, egen
  envelope) och räknas normalt här, inte särbehandlad.
- **56 klipp** gav minst en accepterad sving via `detectSessionSwings`; **14 gav
  noll** (bortfall, se §5).
- **78 svingar** accepterade totalt; **77** klarade den kalla
  konsistenskontrollen och går in i §1–§3:s tal, i **55 oberoende klipp**.
- Rader och klipp **skiljer sig** eftersom flera klipp gav mer än en sving
  (t.ex. `IMG_5407.MP4`: 4, `IMG_5410.MP4`: 4, `IMG_5425.MP4`: 4,
  `IMG_5356.MP4`: 3, `IMG_5408.MP4`: 3) — precis som webbrundans 103 svingar i
  81 klipp.

---

## 5. Bortfall — 14 klipp med noll accepterade svingar, och varför

Ingen ströks tyst. `detectSessionSwings` rapporterar varje förkastad kandidat
med skäl (`SessionSwings.rejected[].reason`); där en hel burst aldrig blev en
kandidat (grovgallringen i `segmentSwingCandidates`, före kvalitetsgrinden)
räknas den separat som en **kulling**, inte ett `rejected`-skäl — båda listas.

| klipp | vad hände |
|---|---|
| `IMG_3550.MOV` | 1 burst, kullad: för lång (6,13 s > 5,5 s) |
| `IMG_3555.MOV` | 1 kandidat, förkastad: ingen adressplatå (klippet börjar redan i rörelse — 119,9 fps, se §6) |
| `IMG_3556.MOV` | 1 kandidat, förkastad: ingen adressplatå |
| `IMG_3557.MOV` | 1 burst, kullad: för lång (9,10 s) |
| `IMG_3558.MOV` | 1 burst, kullad: för lång (7,13 s) |
| `IMG_3569.MOV` | 4 burstar; kullad för lång (6,03 s); 2 kandidater förkastade (klippt svans; vertikal exkursion −0,001 — ingen höjning, möjligt bollplock) |
| `IMG_3575.MOV` | 1 kandidat, förkastad: klippt svans (ingen hållen finish) |
| `IMG_3583.MOV` | 1 burst, kullad: för lång (11,23 s) |
| `IMG_3587.MOV` | 4 burstar, 3 kullade (för korta/för långsamma), 1 kandidat förkastad: klippt svans |
| `IMG_3703.MP4` | 1 kandidat, förkastad: klippt svans |
| `IMG_5074.MP4` | 3 burstar kullade (för korta/långsamma), 1 kandidat förkastad: klippt svans |
| `IMG_5186.MP4` | **0 burstar alls** — `segmentSwingCandidates` gav `low wrist visibility` |
| `IMG_5245.MP4` | 3 burstar; 2 kullade, 1 kandidat förkastad: vertikal exkursion 0,035 < 0,08 |
| `IMG_5405.MP4` | 4 burstar; 3 kullade, 1 kandidat förkastad: envelope 3,90 s > 3,0 s (mer än en sving) |

**Läsning, ärligt sagt: kan inte avgöras utan att öppna bildrutor.** De sju
"för lång burst"-fallen (`3550/3557/3558/3583` samt delar av `3569/3587/5405`)
är den mest sannolika förklaringen en golfsession — flera svingar, waggle och
mellanrum i en enda sammanhängande rörelseö som aldrig delas av en tillräckligt
lång stillnadsö (`MIN_ADDRESS_SEC = 0,3 s`, ADR-003) — men det är en tolkning
av ett tröskelutfall, inte en granskad bildruta. De två "ingen adressplatå"-
fallen (`3555`, `3556`) är höghastighetsklipp (119,9 fps) där kameran
sannolikt redan var igång när svingen startade. De fyra "klippt svans"-fallen
betyder att en rörelseburst hittades men aldrig avslutades i en hållen,
lågfarts-finish inom klippets slut — antingen filmades klippet för kort, eller
så gick golfaren ur bild innan finishen höll. **Ingen av de 14 är bekräftat en
missad äkta sving** och ingen är bekräftat brus; status är okänd tills någon
tittar.

---

## 6. Per klipp: fps, upplösning, vy, långsam envelope, och observerad
   envelopekvalitet

**Vy är inte uppmätt, med avsikt.** Registret sätter `viewBucket: null` för
varenda sving här — ingen har klassat DTL/face-on manuellt, och att gissa
`dtl` hade varit en annan sorts fel än att gissa `web`s upplösning i
[source-split.md](source-split.md) (samma försiktighet, motsatt riktning). Med
`cameraAngle: null` läser produktionens egen `cameraGate` (`derived.ts:824`)
det som `{level: 'uncertain', reasons: ['camera-angle-unknown']}` — **inte**
`rejected` — precis som S-39 §0(b) förutspådde utan att kunna mäta det. Det
märks i data: 18 av 77 rader bär skälet `camera-angle-unknown,phase-missing`
tillsammans (aldrig `camera-angle-unknown` ensamt) — den ovissa vinkeln
blockerar alltså aldrig ett svar på egen hand här, den samverkar bara med ett
redan förkastat toppramat. Det är en **mätning**, inte en gissning: den här
omgången är första gången i strömmen det går att se `cameraAngle: null` slå
igenom i produktionskoden i stället för att bara läsas i källan.

**Ingen av de 78 accepterade svingarna har `envelopeDurationSec > 3,0 s`** (den
etikett S-38 rättade från "slow-mo" till "lång envelope", `MAX_ENVELOPE_SEC` /
`SLOWMO_ENVELOPE_THRESHOLD_SEC`, båda 3,0 s, samma konstant, oberoende namngiven
— se [hard-core.md](top-review/hard-core.md) §5). Det är inte förvånande: en
envelope över 3,0 s **kan per konstruktion inte accepteras** —
`isSwing()`s `MAX_ENVELOPE_SEC`-test i `poseSegments.ts` förkastar den innan
den når registret (fem sådana kandidater syns i tabellen ovan/nedan, alla
`rejected`, aldrig `accepted`). Så "0 av 78 långa" är en egenskap hos grinden,
inte ett fynd om golfsvingarna.

Alla 78 accepterade svingar har **`clippedTail: false`** — `isSwing()`
förkastar en klippt svans direkt (§5), så en accepterad sving har per
konstruktion en hållen, lågfarts-finish inom klippet. Det säger dock **inget**
om huruvida toppens **kant** kapades eller om envelopen **tände på finishen** i
stället för toppen — de frågorna kräver att någon tittar på en bildruta, och
ingen har gjort det här. **Okänt, inte "nej".**

| klipp | fps | upplösning | svingar accepterade | vy | lång envelope (>3s) | anmärkning |
|---|---:|---|---:|---|---|---|
| `att.qSm7...mp4` | 30,0 | 576×1024 | 1 | okänd | nej | — |
| `IMG_1558.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 4 kandidater förkastade, varav 2 för långa (>3s, ej en sving) |
| `IMG_3550.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3555.MOV` | **119,9** | 1080×1920 | **0** | okänd | — | äkta höghastighetsklipp; se §5 |
| `IMG_3556.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3557.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3558.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3569.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3575.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3583.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3587.MOV` | 30,0 | 1080×1920 | **0** | okänd | — | se §5 |
| `IMG_3597.MOV` | 30,0 | 1080×1920 | 1 | okänd | nej | den enda raden (`OWN-003`) tappad vid kall E3-kontrollen, §0/§4 |
| `IMG_3641.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 1 kandidat förkastad: ingen höjning (bollplock?) |
| `IMG_3655.MOV` | **115,3** | 2160×3840 | 1 | okänd | nej | äkta höghastighetsklipp; bär rundans max ruteskillnad (§3) |
| `IMG_3656.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 1 kandidat förkastad: waggle (0,40 s < 0,7 s) |
| `IMG_3703.MP4` | 30,0 | 720×1280 | **0** | okänd | — | se §5 |
| `IMG_3705.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_4571.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4603.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4613.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | rundans näst största ruteskillnad (−21, §3), TSO byter INTE |
| `IMG_4617.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4619.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4629.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4942.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 1 kandidat förkastad: ingen adressplatå |
| `IMG_4949.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4962.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4965.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4979.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | en av de två (`OWN-020`) byter TSO |
| `IMG_4981.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_4982.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 1 kandidat förkastad: ingen rörelse efter adress |
| `IMG_4986.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_5056.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 1 kandidat förkastad: ingen höjning (bollplock?) |
| `IMG_5063.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 2 kandidater förkastade (ingen adressplatå; klippt svans) |
| `IMG_5073.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5074.MP4` | 30,0 | 720×1280 | **0** | okänd | — | se §5 |
| `IMG_5094.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5096.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5098.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5106.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_5186.MP4` | 30,0 | 720×1280 | **0** | okänd | — | se §5 (0 burstar alls) |
| `IMG_5245.MP4` | 30,0 | 720×1280 | **0** | okänd | — | se §5 |
| `IMG_5246.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5269.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_5356.MP4` | 30,0 | 720×1280 | 3 | okänd | nej | 12 burstar kullade, 5 kandidater förkastade — flest av alla klipp |
| `IMG_5357.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5360.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 2 kandidater förkastade: waggle |
| `IMG_5383.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5384.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5385.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5396.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5405.MP4` | 30,0 | 720×1280 | **0** | okänd | — | se §5 |
| `IMG_5406.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5407.MP4` | 30,0 | 720×1280 | 4 | okänd | nej | 2 kandidater förkastade: waggle; envelope >3s (ej en sving) |
| `IMG_5408.MP4` | 30,0 | 720×1280 | 3 | okänd | nej | |
| `IMG_5409.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_5410.MP4` | 30,0 | 720×1280 | 4 | okänd | nej | |
| `IMG_5411.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5412.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 1 kandidat förkastad: waggle |
| `IMG_5413.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | 2 kandidater förkastade: klippt svans; envelope >3s |
| `IMG_5414.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5416.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5417.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5418.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5423.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_5425.MP4` | 30,0 | 720×1280 | 4 | okänd | nej | |
| `IMG_5426.MP4` | 30,0 | 720×1280 | 2 | okänd | nej | |
| `IMG_5427.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | bär även S-32:s `S32-032` (oberoende sving, se ovan) |
| `IMG_5428.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `IMG_5449.MP4` | 30,0 | 720×1280 | 1 | okänd | nej | |
| `juli132025-...MOV` | 30,0 | 360×640 | 2 | okänd | nej | lägsta upplösningen i rundan |

**Två äkta höghastighetsklipp** (fps långt över 30, inte att förväxla med
`slowmo`-flaggan som mäter envelopelängd): `IMG_3555.MOV` (119,9 fps, 0
accepterade) och `IMG_3655.MOV` (115,3 fps, 1 accepterad — och den som bär
§3:s extremvärde). **Inget kandidat- eller kulltal pekar mot att en äkta sving
missades** i vare sig upplösning eller vy — men det påståendet vilar på
tröskelutfallen i tabellen, inte på en tittad bildruta, för alla 78+35 rader.

---

## 7. Vad det här INTE säger

- **Inget facit finns eller behövs för den här frågan.** Ingen siffra här är
  jämförd mot en mänsklig bedömning, och ingen ska läsas som "rätt"/"fel".
- **Extrapolera inte från det här n:et.** 77 rader i 55 klipp är mindre än
  webbrundans 100/101 i 73/79–81, och skillnader under ±3 rader (t.ex. 3,9 %
  mot 2,0 % på P4/SABP, eller 6,5 % mot 9,0 % på TSO) är brus, inte en trend.
  Ett enda extra bytande fall hade flyttat TSO-andelen från 6,5 % till 7,8 %.
- **Vy, händighet och envelopekvalitet (kapad kant/finish-tändning) är
  antaganden respektive okända**, inte mätta — se §0 och §6.
- **Bortfallet (§5, 14 klipp) är oklassificerat.** Ingen vet i dag om något av
  dem gömmer en missad äkta sving eller inte.
- **Produktionens egna paritetsavvikelser står kvar oförändrade**: 15 fps mot
  native (här upp till 120), WASM/GPU-delegat mot python-CPU, sökning per
  sampel mot sekventiell avkodning — samma lista S-39/S-37 redan förde.
- **Ingen tröskel, ingen estimator, ingen klassificerare är ändrad eller
  föreslagen.** `MAX_ENVELOPE_SEC`, `NEAR_VERTICAL_GATE_DEG`,
  `ON_PLANE_BAND_DEG` och envelope-/segmenteringströsklarna i
  `poseEnvelope.ts`/`poseSegments.ts` är lästa, aldrig rörda.

## Kör om

Kräver samma venv:er som S-39/S-41 (`data/shaft/top-review/.venv`:
mediapipe 1.0.1, opencv-python 5.0.0, numpy 2.4.6; `training/.venv`:
onnxruntime 1.30.0), samma modellfiler och `node_modules/.bin/esbuild`. Alla
skript i det här avsnittet är **scratchpad-only, inte committade** — de
återskapas av stegen nedan, inte hämtade ur repot.

```sh
# 1. lista klippen, bygg en upptäcktsregisterfil (env/id är platshållare)
<venv>/python.exe make_discovery_registry.py

# 2. varm helklippsbana, alla 70 egna klipp (run_pose_clip.py, ANVÄNDS OFÖRÄNDRAT)
<venv>/python.exe docs/shaft/top-review/run_pose_clip.py <out>/clippose \
    --registry <out>/discovery_registry.json

# 3. envelope-upptäckt: detectSessionSwings (poseSegments.ts), ANVÄND OFÖRÄNDRAD,
#    via en ny, liten TS-brygga
node_modules/.bin/esbuild envelope_bridge.ts --bundle --platform=node --format=esm \
    --outfile=envelope_bridge.mjs
node envelope_bridge.mjs <out>/clippose <out>/envelope_bridge_out.json

# 4. bygg registret + en manifests-fil av samma form som en CVAT-export
<venv>/python.exe build_own_registry.py

# 5. kall per-sving-bana (run_pose.py, ANVÄNDS OFÖRÄNDRAT)
<venv>/python.exe docs/shaft/top-from-pose/run_pose.py <out>/pose \
    --manifests <out>/own_manifests.json

# 6. skaftdetektorn på varje envelope-bildruta (run_dense.py, ANVÄNDS OFÖRÄNDRAT)
training/.venv/Scripts/python.exe docs/shaft/top-from-dense-signal/run_dense.py \
    <out>/dense --manifests <out>/own_manifests.json

# 7. själva mätningen (importerar verdict_sensitivity.py:s payload_for,
#    load_dense, clip_landmarks, build_bridge, run_bridge, verdict OFÖRÄNDRADE)
<venv>/python.exe own_clips_stability.py <out>/pose --clipPoseDir <out>/clippose \
    --denseDir <out>/dense --work <out>/work --registry <out>/own_registry.json
```
