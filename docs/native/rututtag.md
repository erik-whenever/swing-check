# Rututtaget i appen (förarbete till N-3.4)

**Datum:** 2026-10-23 · **Ström:** N · **Status:** underlag och rekommendation. Inget är byggt eller beslutat.

## Antaganden

Underlaget säger inte detta uttryckligen, så jag har valt det rimligaste och fortsatt utifrån det:

1. **Kameran levererar som i N-2:** bakre kameran, 1920×1080 (1080×1920 upprätt), 30 fps, en frame output till pose.
2. **Vision-rutorna och skaftrutorna har samma tidpunkter.** Webbens sessionsväg (`useSessionCapture.ts:244`) och
   skaftvyn (`shaftPreview.ts:143`) kör båda `selectEnvelopeFrames(envelope, ANALYSIS_FRAME_COUNT = 32, …)`. Efter
   dedupe blir det cirka 26 rutor, och det är de "26 skaftrutorna" i N-2. Skillnaden ligger i härledningen: Vision får
   en beskärning (`planCrop`, längsta sida ≤ 900, JPEG 0,8), skaftet får hela rutan letterboxad till 960 (som
   `extractDataset`, och därmed träningsdatat).
3. **"Svingens video" betyder webbens fönster:** envelopen −1 s … +1 s, högst 10 s (`WINDOW_PRE_SEC`, `WINDOW_POST_SEC`,
   `MAX_WINDOW_SEC`). Hela sessionen sparas inte.
4. **Pose körs live i 30 fps.** Core matas i 15 fps tills N-4, genom att decimera på tid och inte på index.
5. **Uppladdning ur Bilder ingår inte i N-3.4.** Den nämns bara där den påverkar valet.

## Kort svar

**Väg 3, ett hybridval:** kör en hårdvarukodad ringbuffert i minnet, matad från samma `Frame` som posen. När en
sving detekteras remuxas fönstret till en MP4 på disk, utan omkodning. Den filen är historikens video. Rutorna
avkodas sedan sekventiellt ur filen och blir Vision-JPEG:er och skaftets letterbox. Vägen kostar cirka 15–20 MB RAM i
stället för 190–750 MB. Den ger exakt samma klocka som posen, full 1080p till både Vision och skaftet, och
historikvideon på köpet. Den kräver ingen video output från VisionCamera alls. Priset är 0,3–0,8 s extra latens
efter detektion jämfört med en rå ringbuffert, och en kodare som går hela sessionen. Kodarens värmekostnad är
inte mätt.

---

## Vad webben gör i dag (utgångsläget)

```
livePoseLoop (rAF, 5→15 fps) → PoseRingBuffer (450 sampel, ~1,9 MB)
  → LiveSwingDetector.run() var 0,5 s → LiveSwingReport { envelope, cropBounds }
  → VideoChunkRing.materialize(env −1 s, env +1 s)   ← klipps VID DETEKTION (ADR-003 §4.3)
  → kö: selectEnvelopeFrames(32) → grabFramesAtTimes (seek i <video>, planCrop, JPEG 0,8) → Vision
```

Tre egenskaper ska behållas i native, eftersom var och en är en lärdom från D-5:

- **Fönstret klipps vid detektion, inte när kön hinner fram.** Retentionen får inte bero på ködjupet (ADR-003 §4.3).
- **En klocka.** Webben fick slå ihop pose- och videoklockan med `epochMs`, eftersom de skilde sig åt med sekunder.
- **Tidsbasen gissas inte.** `poseFrameGrab` provar var uppspelningen landar. I native kan vi göra bättre och bära
  varje rutas tid explicit, se §5.

Detektionen landar 0,6–1,1 s efter impact, och den latensen är strukturell (`liveSwingDetector.ts`). Ringen måste
därför täcka hela intervallet från `envelope.start − 1 s` fram till detektionen:

> ≤ 1 s (före) + 3,0 s (`MAX_ENVELOPE_SEC`) + 1,1 s (latens) + 0,5 s (detektionsintervall) ≈ **5,6 s**.
> Med marginal: **8 s** för en rå ring som måste kopieras ut vid detektion.

Live sträcks aldrig (S-44), så tidstaken skalas inte.

---

## Vägarna

### Väg 1 — rå ringbuffert av rutor i minnet

En native ring av kopierade YUV-rutor, indexerad på rutans PTS. Vid detektion plockas de ~26 tidpunkterna ut.
Rutorna går inte att behålla som VC5-frames: poolen är liten, och om rutorna inte släpps "stalls the pipeline and
subsequent frames will be dropped" ([Frame Output](https://visioncamera.margelo.com/docs/frame-output)). **Ringen
måste alltså kopiera.**

**Minne** (NV12 = 1,5 byte/px, 30 fps, 8 s = 240 rutor):

| Upplösning (upprätt) | Per ruta | 8 s-ring | Kommentar |
| --- | --- | --- | --- |
| 1080×1920 | 3,11 MB | **746 MB** | orimligt |
| 720×1280 (webbens nivå) | 1,38 MB | **332 MB** | tungt, jetsam-risk på Android med 4–6 GB |
| 540×960 | 0,78 MB | **187 MB** | exakt vad skaftet ser (1080×1920 → 960-letterbox = 540×960) |
| 1b: JPEG-ring 1080p, q 0,9 | ~0,3–0,5 MB // OSÄKER | ~72–120 MB | kräver 30 JPEG-kodningar/s på CPU, se batteri |

540×960 räcker för skaftet utan förlust. Vision förlorar däremot upplösning: en golfare som fyller 80 % av höjden blir
768 px från webbens 720p men bara 576 px från 540p. Det är en kvalitetsförändring i Vision-underlaget som inte är mätt.

- **Latens:** minst av alla. Kopiering, beskärning, JPEG och letterbox för 26 rutor tar cirka 0,2–0,3 s efter
  detektion. // OSÄKER: uppskattningen bygger på ~5–10 ms per ruta, inte på en mätning.
- **Tidsprecision:** exakt. Det är samma buffert som posen, och närmaste ruta ligger ≤ 16,7 ms från en vald tidpunkt.
- **Batteri/värme:** en GPU-nedskalning och 30 kopior per sekund (23–41 MB/s), vilket är billigt. Det stora
  resident-minnet ökar däremot risken att iOS dödar appen under minnestryck eller i bakgrunden. Variant 1b flyttar
  kostnaden till JPEG-kodning 30 gånger per sekund, och det är just det som en videokodare gör billigare i hårdvara.
- **Historikvideo:** finns inte. Fönstret måste kodas efteråt ur ringen (~150 rutor, ~0,3 s hårdvarukodning), alltså
  behövs **en kodare ändå**, och då i 540p.
- **VC5:** stöds. Frame output med `getNativeBuffer()`/`sampleBuffer`/`image`
  ([Native Frame Processor Plugins](https://visioncamera.margelo.com/docs/native-frame-processor-plugins)).
- **Swift:** ring av `CVPixelBuffer` ur en egen `CVPixelBufferPool`, nedskalning med vImage eller Metal,
  beskärning, JPEG via ImageIO, letterbox, och `AVAssetWriter` för historiken.
- **Kotlin:** ring av `ByteBuffer`, nedskalning av YUV (CPU eller GL), YUV→RGB, `Bitmap.compress`, och MediaCodec +
  MediaMuxer för historiken.

### Väg 2 — kontinuerlig inspelning i segment, avkodning efter slaget

VC5:s `CameraVideoOutput` + `Recorder` spelar in segment om några sekunder. Efter detektion avkodas rutorna med
`AVAssetImageGenerator` på iOS och `MediaMetadataRetriever` på Android.

- **VC5:s stöd räcker inte.** `RecorderSettings` har bara `filePath`, `location`, `maxDuration` och `maxFileSize`:
  ingen codec, ingen bitrate och ingen segmentering
  ([RecorderSettings](https://visioncamera.margelo.com/api/react-native-vision-camera/interfaces/RecorderSettings)).
  En `Recorder` kan inte återanvändas, så segment betyder stop + ny `createRecorder` + start, och
  `onRecordingFinished` kommer först när filen är skriven
  ([Video Output](https://visioncamera.margelo.com/docs/video-output)). En sving som korsar en segmentgräns hamnar i
  glappet. // OSÄKER: glappets storlek i VC5 är inte dokumenterad och inte mätt.
- **Tidsprecision: sämst.** Videon är en **egen ström**. På Android är CameraX:s VideoCapture en annan yta än
  frame-strömmen (VC5 Android kör CameraX 1.7.0-alpha03,
  [releases](https://github.com/margelo/react-native-vision-camera/releases)). Filens tidslinje börjar på 0, och
  förskjutningen mot `Frame.timestamp` exponeras inte. Dessutom kan stabilisering eller beskärning skilja mellan
  strömmarna, och då hamnar pose-boxen (`cropBounds`, normaliserad mot frame-strömmen) fel i videoströmmens pixlar.
  // OSÄKER: om VC5 på iOS matar recordern ur samma buffertar som frame output framgår inte av dokumenten.
- **Latens:** först måste segmentet stängas (≤ segmentlängd + finalisering), sedan avkodas 26 rutor.
  `AVAssetImageGenerator` måste ha `requestedTimeToleranceBefore/After = .zero`, annars snäpper den till nyckelrutor
  ([Apple](https://developer.apple.com/documentation/avfoundation/avassetimagegenerator/requestedtimetolerancebefore)),
  och då avkodar varje anrop från närmaste nyckelruta. `MediaMetadataRetriever.getFrameAtTime(OPTION_CLOSEST)` gör
  samma sak per anrop ([Android](https://developer.android.com/reference/android/media/MediaMetadataRetriever)).
  Uppskattat blir det 1,5–3,5 s efter detektion på iOS och mer på Android. // OSÄKER: inte mätt, uppskattat
  från att varje rututtag avkodar en halv till en hel GOP.
- **Minne:** litet i RAM. Disken får 2 MB/s i skrivning och ständig radering av segment.
- **Batteri/värme:** samma kodare som väg 3, plus filskrivning och finalisering, plus en tredje kamerautgång. Android
  har haft en gräns på 3 samtidiga utgångar ([#2878](https://github.com/margelo/react-native-vision-camera/issues/2878),
  v4). // OSÄKER: gäller troligen fortfarande via CameraX:s ytkombinationer.
- **Swift/Kotlin:** lite egen kod (generator och retriever), men glappen och klockan går inte att lösa utan egen kod
  under VC.

**Förkastad.** Den är billigast att skriva och sämst på det N-3.4 kräver, nämligen samma klocka och samma pixlar
som posen.

### Väg 3 (rekommenderad) — hårdvarukodad ring i minnet, fönstret remuxas vid detektion

```
VC5 frame output (yuv, 1080p30)
  └ worklet: t = capture.append(frame)      ← läser native-PTS, ger bufferten till HW-kodaren (ingen JS-kopia)
             pose.detect(frame, t)          ← samma t på PoseSample
             (var annan ruta på tid → core, 15 fps tills N-4)
  kodare (HEVC/H.264, ingen B-ruta, nyckelruta var 0,5 s) → ring av kodade sampel, 12 s, bunden
  detektion → capture.cutWindow(env −1, env +1)  → MP4 på disk (remux, ingen omkodning) + rutornas t
  kö → extractor.extract(fil, tider)  → sekventiell HW-avkodning → Vision-JPEG (beskuren) + skaft-RGB 960²
```

Det är väg 1:s minnesring och väg 2:s avkodning efteråt, men med vår egen kodare på samma buffertar som posen. VC5
säger uttryckligen att native-buffertar "can be sampled on the GPU or passed to media encoders"
([Frame](https://visioncamera.margelo.com/api/react-native-vision-camera/hybrid-objects/Frame)).

**Minne:**

| Del | Beräkning | Storlek |
| --- | --- | --- |
| Ring, iOS HEVC 10 Mbit/s | 1,25 MB/s × 12 s | **15 MB** |
| Ring, Android H.264 14 Mbit/s | 1,75 MB/s × 12 s | **21 MB** |
| Kodarens interna köer | några rutor | ~10–20 MB // OSÄKER |
| Avkodning: Vision-pass | några ytor à 3,1 MB + 26 JPEG à ~60–100 kB | ~15 MB, kortvarigt |
| Avkodning: skaft-pass i satser om 8 | 8 × 960²×3 = 8 × 2,76 MB | **22 MB**, kortvarigt |
| Svingfil på disk | ~5 s × 1,25–1,75 MB/s | **6–9 MB/sving** (disk, inte RAM) |

Ringen är bunden av konstruktion (ADR-003:s princip). Fönstret skrivs till disk vid detektion, så RAM är **oberoende
av ködjupet**. Det är samma princip som webbens klipp vid detektion, utan att väntande svingar ligger kvar i minnet.

- **Latens efter detektion:** vänta tills `env + 1 s` är inspelat (0–0,5 s, ofta redan klart), skriv MP4:n (~6 MB,
  ~20–50 ms), avkoda sekventiellt från nyckelrutan före första valda tidpunkten till den sista (≤ 3,5 s ≈ 105 rutor),
  och gör sedan beskärning och JPEG för 26 rutor. Totalt **~0,5–1,2 s till Vision-anropet**, och skaftet är klart
  0,83 s efter sina rutor (N-2). // OSÄKER: hårdvaruavkodningen av 1080p är uppskattad till 2–4 ms per ruta och inte
  mätt. Sett i hela kedjan (impact → detektion 0,6–1,1 s → Vision i sekunder → TTS) kostar det 0,3–0,8 s mer än väg 1.
- **Tidsprecision: exakt, av konstruktion.** `append` läser rutans native-PTS (iOS
  `CMSampleBufferGetPresentationTimeStamp`, Android `ImageInfo.getTimestamp()` i ns) och returnerar
  `t = (pts − pts₀) / 1e9`, där `pts₀` är sessionens första ruta. Samma `t` hamnar på `PoseSample` och på
  kodarsamplet. `cutWindow` returnerar `frameTimesSec` för varje ruta i filen, så avkodaren mappar **ruta i → t på
  index**, inte via filens tidslinje. Inga B-rutor (`AllowFrameReordering = false` på iOS, ingen B-profil på
  Android) ger avkodningsordning = presentationsordning. Felet mellan vald tidpunkt och närmaste ruta är ≤ 16,7 ms.
  Det är samma golv som `IMPACT_CLUSTER_SPACING_SEC = 0,033` redan är byggt för: placeringen kommer ur 15 fps-pose
  och uttaget ur 30 fps-video. // OSÄKER: `Frame.timestamp` saknar dokumenterad enhet och klocka
  ([Frame](https://visioncamera.margelo.com/api/react-native-vision-camera/hybrid-objects/Frame)). Därför läses
  PTS natively och JS-sidans `timestamp` används inte.
- **Batteri/värme:** hårdvarukodning av 1080p30 är det kameraappen gör vid vanlig inspelning. iOS matar
  `IOSurface`-bufferten direkt (nollkopia). Android kopierar YUV in i kodarens indatabild (~3 MB/ruta, ~90 MB/s).
  // OSÄKER: kostnaden ovanpå pose är inte mätt. N-2 mätte pose ensam i 3 min (`nominal`); en session är 20–60 min.
  Den mätningen är grinden för väg 3, se *Risker*.
- **Historikvideo:** färdig vid detektion. Den är 1080p, utan omkodning, med verklig tidslinje och 30 fps.
- **Skaftdistribution:** shaft-v2 tränades på rutor ur komprimerad iPhone-video, sparade som JPEG 0,92
  (`extractDataset`). Avkodade rutor ur en egen HEVC/H.264-ström ligger närmare den distributionen än råa sensorrutor
  (väg 1). // OSÄKER: skillnaden är troligen liten åt båda hållen och ska mätas (risk 7).
- **VC5:** behöver bara preview + frame output. Ingen video output, vilket ger färre CameraX-ytkombinationer.
  Kodaren, ringen, muxen och avkodaren är vår egen Nitro-kod.

**Swift (iOS):**
- `VTCompressionSession` för HEVC (H.264 som reserv), med `RealTime`, `AllowFrameReordering = false`,
  `MaxKeyFrameIntervalDuration = 0.5` och `AverageBitRate`.
  ([VTCompressionSession](https://developer.apple.com/documentation/videotoolbox/vtcompressionsession))
- En ring av kodade `CMSampleBuffer` med PTS, som evictar hela GOP:er.
- `AVAssetWriter` med passthrough-input (`outputSettings: nil`) för fönstret. En variant är `mpeg4AppleHLS`-segment
  direkt i minnet via `didOutputSegmentData` ([WWDC20 10011](https://developer.apple.com/videos/play/wwdc2020/10011/)),
  men segmentintervallet är heltalssekunder, så egen ring ger finare GOP-kontroll.
- `AVAssetReader` + `VTDecompressionSession` (eller `AVAssetReaderTrackOutput` med avkodade `CVPixelBuffer`).
- Beskärning och rotation till upprätt, skalning, JPEG via ImageIO, och letterbox 960 med 114-grått enligt de
  parametrar TS skickar in.

**Kotlin (Android):**
- `MediaCodec`-kodare (`video/avc`, HEVC om enheten har den), med `KEY_I_FRAME_INTERVAL` (float från API 25) och
  `COLOR_FormatYUV420Flexible`. YUV-planen kopieras från `frame.image` till `getInputImage()`.
  ([MediaCodec](https://developer.android.com/reference/android/media/MediaCodec),
  [KEY_I_FRAME_INTERVAL](https://developer.android.com/reference/android/media/MediaFormat#KEY_I_FRAME_INTERVAL))
- En ring av `ByteBuffer` + `BufferInfo` + csd.
- `MediaMuxer` för fönstret ([MediaMuxer](https://developer.android.com/reference/android/media/MediaMuxer)).
- `MediaExtractor` + `MediaCodec`-avkodare till `ImageReader` (YUV_420_888), YUV→RGB för de valda rutorna (CPU räcker
  för 26 rutor), beskärning, rotation, `Bitmap.compress` och letterbox.
- Ett alternativ är nollkopia via `HardwareBuffer` → EGL → kodarens indata-`Surface`. Det är mer kod och väljs bara om
  kopieringen syns i mätningen.

Avkodningshalvan ("rutor ur en MP4 på givna tider") är samma kod som en framtida uppladdning ur Bilder behöver. Väg
3 bygger alltså inget som bara används här.

### Jämförelse

| | Väg 1: rå ring (540p) | Väg 2: VC-inspelning i segment | **Väg 3: kodad ring + remux** |
| --- | --- | --- | --- |
| RAM | 187 MB (332 MB i 720p) | litet | **15–21 MB** + kortvarigt ≤ 22 MB |
| Detektion → Vision-anrop | ~0,2–0,3 s | ~1,5–3,5 s (iOS) | ~0,5–1,2 s |
| Samma klocka och pixlar som pose | ja | **nej** (egen ström, okänd förskjutning) | ja, plus `frameTimesSec` |
| Upplösning till Vision | 540p (sämre än webben) | 1080p | 1080p |
| Historikvideo | kräver kodare efteråt | finns | finns vid detektion |
| Sving över segmentgräns | ej aktuellt | glapp | ej aktuellt |
| VC5-yta | frame output | frame + video output | frame output |
| Egen native-kod | medel | liten men otillräcklig | **störst** (kodare, ring, mux, avkodare) |
| Värme | låg CPU, stort minne | kodare + disk | kodare (ej mätt) |

---

## Slow-mo-fynden (S-42–S-46) och 15 fps

- **Filens tidslinje är inget facit (S-42, S-43).** iOS renderar Slo-Mo som en tidssträckt fil, och exporten via
  väljaren byter codec (`hvc1` → `avc1`). Väg 3 tar aldrig rutornas tid ur filens tidslinje: `frameTimesSec` kommer
  från fångsten. Det är samma princip som `poseFrameGrab`:s prob, men utan att behöva proba.
- **Live sträcks aldrig (S-44).** `cutWindow`-filer skrivs i realtid, 30 fps, utan `full-frame-rate-playback-intent`.
  `readTimeStretch` behövs alltså inte på livevägen, men `SessionSwing.timeStretched` ska fortsatt kunna sättas av
  uppladdningsvägen. VC5-formatet ska låsas till 30 fps. Högfrekvensformat ger fortfarande realtids-PTS, men ändrar
  allt annat (exponering, upplösning).
- **Dataset-frysningen (S-46)** berörs inte. Om appens historikfiler senare blir dataset, med egna `clipName`, gäller
  `frozenClips.ts`-regeln för dem.
- **15 fps tills N-4:** pose körs på varje ruta (30 fps), men bara en per ~66,7 ms skickas till
  `PoseRingBuffer`/`LiveSwingDetector`. Decimeringen görs **på tid** (`t − tSenast ≥ 1/15 − 1/60`), inte "varannan",
  eftersom tappade rutor annars förskjuter takten. Kedjans konstanter är kalibrerade i 15 fps (S-49). Valda
  tidpunkter blir kontinuerliga sekunder och mappas till närmaste 30 fps-ruta. Vid N-4 ändras bara decimeringen;
  rututtaget är oberoende av pose-takten.

---

## Förslag: Nitro-spec

En tredje Nitro-modul, `capture`, bredvid `pose` och `shaft`. N-3.1:s ADR nämner två moduler, så den behöver kompletteras
med denna. Modulen äger rutornas klocka, så `pose` tar `t` som argument i stället för att läsa egen tid.

```ts
// apps/mobile/modules/capture/src/specs/Capture.nitro.ts  (förslag, inte skapad)
import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

export type VideoCodec = 'hevc' | 'h264';

export interface CaptureConfig {
  /** iOS: 'hevc'. Android: 'h264' (HEVC-kodare saknas på en del enheter). */
  codec: VideoCodec;
  /** 10e6 för HEVC, 14e6 för H.264 — nära iPhone-kamerans egna, som träningsdatat kom ur. */
  bitrateBps: number;
  /** 0,5 — styr hur långt före en vald tidpunkt avkodningen måste börja. */
  keyframeIntervalSec: number;
  /** 12 — ≥ 5,6 s behövs (se rututtag.md); marginalen kostar ~1,5 MB/s. */
  retentionSec: number;
  /** Katalog för svingfiler (appens dokumentkatalog, inte cache — det är historiken). */
  clipDirectory: string;
}

export interface CaptureStats {
  running: boolean;
  /** UPPRÄTT storlek efter rotation — det `planCrop`/`computeLetterbox` ska räkna mot. */
  width: number;
  height: number;
  framesIn: number;
  /** Rutor kodaren inte hann ta emot (backpressure). Ska vara 0. */
  framesDropped: number;
  ringStartSec: number;
  ringEndSec: number;
  ringBytes: number;
  appendMsP95: number;
}

export interface SwingClip {
  path: string;
  /** Sessionstid för filens första ruta (nyckelrutan ≤ begärd start). */
  startSec: number;
  endSec: number;
  /** Sessionstid för varje ruta i filen, i avkodningsordning. Facit för ruta ↔ tid. */
  frameTimesSec: number[];
  truncatedStart: boolean;
  truncatedEnd: boolean;
  bytes: number;
}

export interface Capture extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  start(config: CaptureConfig): void;
  /**
   * Anropas i frame-workleten för VARJE ruta, före pose. Läser rutans native-PTS, lämnar
   * bufferten till kodaren och returnerar t = sekunder sedan sessionens första ruta.
   * Samma t ska stå på rutans PoseSample. Blockerar aldrig på kodaren: vid backpressure
   * räknas rutan i framesDropped och t returneras ändå.
   */
  append(frame: Frame): number;
  stop(): void;
  readonly stats: CaptureStats;
  /**
   * Skriv [startSec, endSec] som MP4 (remux, ingen omkodning). Anropas VID DETEKTION.
   * Väntar högst maxWaitSec på att endSec ska spelas in; därefter truncatedEnd.
   */
  cutWindow(startSec: number, endSec: number, maxWaitSec: number): Promise<SwingClip>;
}

/** Källrektangel i UPPRÄTTA pixlar — `planCrop(...).rect`. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionOutput {
  /** Saknas → hela rutan. */
  crop?: CropRect;
  /** `planCrop(...).output` */
  outputWidth: number;
  outputHeight: number;
  jpegQuality: number;
}

/** `computeLetterbox(width, height, 960)` + PAD_VALUE — geometrin räknas i core, inte natively. */
export interface ShaftOutput {
  size: number;
  drawWidth: number;
  drawHeight: number;
  padX: number;
  padY: number;
  padValue: number;
}

export interface ExtractRequest {
  path: string;
  /** `SwingClip.frameTimesSec`. Saknas (uppladdad fil) → filens egna PTS används. */
  frameTimesSec?: number[];
  /** Sessionstider att ta ut; närmaste ruta väljs. */
  timesSec: number[];
  vision?: VisionOutput;
  shaft?: ShaftOutput;
}

export interface ExtractedFrame {
  requestedSec: number;
  /** Den faktiska rutans tid. |frameSec − requestedSec| ≤ en halv ruta. */
  frameSec: number;
  /** Ren base64-JPEG, satt när `vision` begärts. */
  visionJpegBase64?: string;
  /** RGB uint8, HWC, size×size, upprätt. Satt när `shaft` begärts. Skickas till shaft-modulen. */
  shaftRgb?: ArrayBuffer;
}

export interface FrameExtractor extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Sekventiell avkodning från nyckelrutan före första tiden. Rör aldrig ringen. */
  extract(request: ExtractRequest): Promise<ExtractedFrame[]>;
}
```

**Anropsmönster per sving:** `cutWindow` anropas direkt vid detektion. I kön körs först `extract` med bara `vision`,
och Vision-anropet startar så fort det är klart. Sedan körs `extract` med bara `shaft`, i satser om ≤ 8 tider (22 MB),
och varje sats går till shaft-modulen och släpps. `planCrop`, `computeLetterbox` och `selectEnvelopeFrames` stannar i
core (TS). Native ritar bara geometrin den får, så pariteten med Python ligger kvar i den testade TS-koden.

// OSÄKER: att ett `ArrayBuffer` från `capture` kan skickas till `shaft` utan kopia bygger på Nitros ArrayBuffer-ägarskap.
Det är inte prövat. Om det kopieras kostar det 2,76 MB per ruta, vilket är acceptabelt. Om skaftet ska ta en native-yta
direkt i stället, utan RGB-steget, behövs en delad HybridObject-typ mellan modulerna, och det stödet är inte undersökt.

---

## Risker som bara går att avgöra på en enhet

1. **Värme och batteri under en hel session.** Pose + kodare + preview i 20–30 min, på iPhone och Android.
   Mät thermal, ms/ruta och tappade rutor mot N-2:s pose-ensam-siffror. **Det här är grinden för väg 3.** Faller den,
   blir reservplanen väg 1 i 540p med kodning av fönstret efter detektion.
2. **Frame-poolen.** iOS-kodaren behåller `CVPixelBuffer` asynkront. Hinner den släppa bufferten innan poolen tar
   slut, när posen också håller rutan? Mät `framesDropped` och VC:s egna tappade rutor.
3. **Android: kostnaden för YUV-kopian** in i `MediaCodec` vid 30 fps, och om kodaren accepterar
   `YUV420Flexible` och HEVC på testtelefonen.
4. **PTS:** monotoni, enhet och klocka på båda plattformarna, och att pose-modulen verkligen får samma `t`.
   Test: en blixt eller klapp i bild, och samma ruta i pose-loggen och i den avkodade filen.
5. **Avkodningshastighet** för 1080p på målenheterna. Det avgör om latensen blir 0,5 eller 1,2 s.
6. **Rotation och färgordning** genom beskärning och letterbox. Verifieras med klubba i bild (samma punkt som N-3.3 och
   N-3.8).
7. **Skaftparitet på kodade och avkodade rutor:** samma ruta som rå buffert mot avkodad fil, mot gränsen 2 px från
   N-2.
8. **VC5 Android FrameOutput läcker en tråd per öppning**
   ([#4213](https://github.com/margelo/react-native-vision-camera/issues/4213), öppen, VC 5.1.1). Det påverkar
   sessioner där kameran öppnas och stängs, och gäller alla vägar.
9. **Diskskrivning vid detektion** (6–9 MB) parallellt med pose: ger den hack i rutflödet?
10. **Minnestryck på en billig Android.** Kontrollera att väg 3:s ~40 MB topp verkligen är vad som syns i profileraren.

## Öppet (inte N-3.4:s beslut)

- **Historikens lagringsbudget.** ~6–9 MB per sving i 1080p ger ~0,6–0,9 GB för 100 slag. Alternativen är att behålla
  bara de N senaste i full kvalitet, eller att koda ned till 720p i bakgrunden efter sessionen. Det hör till N-3.5 och
  N-3.6. Lokalt först: filerna ligger i appens katalog, och Supabase-uppladdning är en senare och valfri fråga.

## Källor

VisionCamera 5 (dokument och issues lästa 2026-10-23; senaste release 5.2.3, 2026-08-20):
- [Camera Outputs](https://visioncamera.margelo.com/docs/camera-outputs): utgångar och upplösningsförhandling
- [Frame Output](https://visioncamera.margelo.com/docs/frame-output): pool, `dispose`, pixelformat
- [Frame (API)](https://visioncamera.margelo.com/api/react-native-vision-camera/hybrid-objects/Frame): `timestamp` utan enhet, `getNativeBuffer` "passed to media encoders", `orientation`
- [FrameOutputOptions](https://visioncamera.margelo.com/api/react-native-vision-camera/interfaces/FrameOutputOptions): `dropFramesWhileBusy`, `enablePreviewSizedOutputBuffers`, `enablePhysicalBufferRotation`
- [Native Frame Processor Plugins](https://visioncamera.margelo.com/docs/native-frame-processor-plugins): `sampleBuffer` (iOS), `image` (Android), `AHardwareBuffer`
- [Video Output](https://visioncamera.margelo.com/docs/video-output) och [RecorderSettings](https://visioncamera.margelo.com/api/react-native-vision-camera/interfaces/RecorderSettings): ingen codec, bitrate eller segmentering
- [What's New in VisionCamera V5](https://margelo.com/blog/whats-new-in-visioncamera-v5) (2026-04-16): plugins är Nitro-moduler, GPU-resizer
- [Releases](https://github.com/margelo/react-native-vision-camera/releases): CameraX 1.7.0-alpha03, `AHardwareBuffer`-cache på 12
- Issues: [#4213](https://github.com/margelo/react-native-vision-camera/issues/4213) (trådläcka, öppen), [#2878](https://github.com/margelo/react-native-vision-camera/issues/2878) (max 3 utgångar på Android, v4)

Plattformarna (standardreferenser; bara WWDC-sessionen är kontrollerad i den här sessionen):
- [WWDC20 10011: Author fragmented MPEG-4 content with AVAssetWriter](https://developer.apple.com/videos/play/wwdc2020/10011/)
- [VTCompressionSession](https://developer.apple.com/documentation/videotoolbox/vtcompressionsession) · [AVAssetReader](https://developer.apple.com/documentation/avfoundation/avassetreader) · [AVAssetImageGenerator.requestedTimeToleranceBefore](https://developer.apple.com/documentation/avfoundation/avassetimagegenerator/requestedtimetolerancebefore)
- [MediaCodec](https://developer.android.com/reference/android/media/MediaCodec) · [MediaFormat.KEY_I_FRAME_INTERVAL](https://developer.android.com/reference/android/media/MediaFormat#KEY_I_FRAME_INTERVAL) · [MediaMuxer](https://developer.android.com/reference/android/media/MediaMuxer) · [MediaMetadataRetriever](https://developer.android.com/reference/android/media/MediaMetadataRetriever) · [CameraX ImageInfo.getTimestamp](https://developer.android.com/reference/androidx/camera/core/ImageInfo#getTimestamp())

Repo: `docs/oppna-fragor.md` F6 · `docs/BACKLOG.md` N-2, N-3, D-5, S-42–S-46, S-49 · `docs/decisions/ADR-003-draft.md`
§4.1, §4.3, §5.5 · `packages/core/src/lib/{poseRingBuffer,videoChunkRing,poseSegments,liveSwingDetector,poseEnvelopeSelection,poseCropBox,shaft/letterbox}.ts`
· `src/lib/{frameExtractor,poseFrameGrab}.ts` · `src/hooks/useSessionCapture.ts` · `src/lib/shaft/shaftPreview.ts`.
