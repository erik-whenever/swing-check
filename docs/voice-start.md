# Voice-triggad svingstart (Ström A)

> Hands-free svingstart i headset-session: användaren monterar telefonen på tripod,
> tar på hörlurar, säger **"start"** (eller klappar) och slår sin sving — utan att röra skärmen.
> Auktoritativ status för gjort/kvar: [BACKLOG.md](BACKLOG.md). Denna fil beskriver **arkitektur och varför**.

## Varför inte Web Speech API

Den självklara vägen — `SpeechRecognition` för att lyssna efter ordet "start" — **finns inte i
iOS standalone-PWA**. `webkitSpeechRecognition` är antingen odefinierad eller kastar direkt när
appen körs från hemskärmen (standalone), och det är exakt vårt målscenario. Därför bygger vi på
**rå ljud-amplitud** via Web Audio (`getUserMedia` → `AnalyserNode`), som fungerar i standalone-PWA.

Konsekvens: vi kan inte "känna igen ord" gratis. Vi börjar med en **energibaserad trigger**
(A-2, spik över adaptiv bakgrund) och uppgraderar sedan till **on-device wake-word** via Picovoice
Porcupine (A-4), som kör offline utan API-kostnad. Energitriggern blir kvar som fallback.

## Signalkedja

```
getUserMedia({audio})            // rå mic, all processing AV
  → MediaStreamAudioSourceNode
  → AnalyserNode (fftSize 1024)  // 512 tidsdomän-sampel/frame
  → rAF-loop: RMS → energy (0–1) // amplitud-envelope, ingen detektering här
```

`useMicTrigger` (A-1) äger **bara** capture + energiström. All trigger-/tröskellogik ligger i
`EnergyTrigger` / `useEnergyTrigger` (A-2) ovanpå. Separationen gör att wake-word (A-4) kan byta ut
detekteringslagret utan att röra capture-lagret.

## Energi-trigger (A-2)

`EnergyTrigger` (`src/lib/audioTrigger.ts`) är en ren, testbar klass utan React/audio-beroenden —
man matar den ett energi-sampel per frame via `push(energy, now)` och den returnerar `true` exakt
den frame en trigger avfyras. `useEnergyTrigger(onTrigger, config?)` lägger den ovanpå A-1, matar
`mic.energy` per frame, och vid trigger: kallar `onTrigger`, säger TTS-ack **"Startar inspelning"**
(sv, quick-röst) och höjer en `pulse`-flagga i 600 ms för visuell puls.

### Varför adaptiv tröskel

En range är akustiskt bullrig: **träffljud liknar klapp**, vind ger brus och absoluta nivåer
driver med mic-gain och avstånd. En fast tröskel skulle antingen missa "start" i en högljudd bås
eller trigga konstant i en tyst. Därför spårar vi en **rullande baslinje** (EMA av energin) och
triggar bara på en spik som är BÅDE ett stort multipel av baslinjen OCH över ett absolut golv.
Baslinjen **fryses medan en spik pågår** — annars drar ett högt "start" upp baslinjen och dövar
just den jämförelse vi förlitar oss på. EMA:n är frame-rate-oberoende (α härleds ur verklig
förfluten tid mot `baselineTauMs`), så ~1.5 s minne håller vid 30 såväl som 120 fps.

### Tröskelparametrar (defaults i `DEFAULT_ENERGY_TRIGGER_CONFIG`)

| Parameter | Default | Syfte |
| --- | --- | --- |
| `thresholdFactor` | `3.5` | Trigga när momentan energi > baslinje × faktor. |
| `absoluteFloor` | `0.02` | Hårt golv — spik under denna råa energi triggar aldrig (dödar tyst-rums-jitter). |
| `cooldownMs` | `2500` | Debounce efter trigger: ignorera fler spikar så länge (ett ord + eko → en trigger). |
| `baselineTauMs` | `1500` | Tidskonstant för baslinjens EMA (~1.5 s kontext). |
| `calibrationMs` | `1000` | Startfönster där baslinjen lärs in men ingen trigger tillåts. |

`thresholdFactor`, `cooldownMs` och `absoluteFloor` exponeras live via `config`/`setConfig` på
hooken (och `EnergyTrigger.setConfig`) för A-5-trimning och en framtida settings-toggle (A-4).

### Känd svaghet (mäts i A-5)

Energi-triggern **kan inte skilja ett ord från ett träffljud eller en vindby** — den ser bara
amplitud. Falska positiv i range-brus är därför förväntade; detta är en MVP för att komma till
fälttest, inte slutlösningen. A-4 (Porcupine wake-word) adresserar precisionen och A-5 mäter
false positive/negative på riktig range och trimmar defaults ovan.

### Varför all ljud-processing stängs AV

`echoCancellation`, `noiseSuppression` och `autoGainControl` är designade för röstsamtal och
**förvränger amplituden** — AGC drar upp tysta partier och komprimerar toppar, brusreducering
äter transienter. Men det är precis amplitud-spiken (ordet/klappen mot bakgrunden) som triggern
mäter. Alla tre stängs därför av i `getUserMedia`-constraints.

### Varför RMS

RMS över tidsdomän-sampel ≈ upplevd ljudstyrka och är billigt att räkna varje frame. Sampel från
`getFloatTimeDomainData` ligger redan i ~[-1, 1], så RMS blir i praktiken normaliserad 0–1 för vårt
bruk (klampas till 1). Bufferten återanvänds mellan frames → noll allokering per tick.

## AudioContext-livscykel på iOS

iOS är strikt: en `AudioContext` som skapas **utanför** en user gesture startar i läget
`'suspended'` och producerar aldrig sampel. Regler vi följer:

- **`start()` är async och ska anropas från en tap** (samma gest som startar sessionen). Den
  skapar/återanvänder kontexten och anropar en intern `resumeOnGesture()` som `resume()`:ar innan
  rAF-loopen startar.
- **`stop()` `suspend()`:ar** kontexten (stänger den inte), så nästa `start()` kan återanvända den.
  Kontexten `close()`:as först vid unmount.
- **Mic släpps genom att stoppa tracks** (`track.stop()`) — det är det som släcker OS-indikatorn.
  Enbart `suspend()` räcker inte.

## Livscykel & städning

`start()` är idempotent (andra anropet medan man redan lyssnar är no-op) och rullar tillbaka all
delvis förvärvad resurs om något kastar — ingen läckande track eller context. `stop()` är säker att
anropa upprepat. Unmount kör `stop()` + `close()`. Permission speglas från Permissions API där det
finns (`'microphone'`), annars stannar den på `'prompt'` tills första `getUserMedia`.

## API

```ts
const { start, stop, energy, isListening, permission } = useMicTrigger();
// start(): begär mic + startar RMS-loop (anropa från tap)
// stop():  stoppar loop, släpper mic, suspendar context
// energy:  senaste RMS (0–1), uppdateras ~1 ggr/rAF-frame
// permission: 'prompt' | 'granted' | 'denied'
```

`permission='denied'` sätts vid `NotAllowedError`/`SecurityError` utan att appen kraschar.

## Checklista A-1 … A-5

- [x] **A-1 — Mikrofon-capture-hook (`useMicTrigger`)**
      Capture + normaliserad RMS-energiström. Ingen trigger-logik. Bygger + lintar rent.
      Ej enhetsverifierad på iOS ännu (kräver Eriks telefon; verifiera via `npm run dev`).
- [x] **A-2 — Energi-trigger med adaptiv tröskel (MVP)** — `EnergyTrigger` (`lib/audioTrigger.ts`) +
      `useEnergyTrigger` (`hooks/useEnergyTrigger.ts`). Adaptiv baslinje, spik-detektering, cooldown,
      kalibrering, TTS-ack + puls, läs/skrivbar config. Bygger + lintar rent; range-brus mäts i A-5.
- [ ] **A-3 — Integrera röststart med session-läge + `swingStartTimestamp`**.
- [ ] **A-4 — Wake-word "start" via Porcupine + settings-toggle**.
- [ ] **A-5 — Range-validering + tröskeltrimning** (kräver Eriks fälttest).
