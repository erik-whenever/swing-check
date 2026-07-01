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
- [ ] **A-2 — Energi-trigger med adaptiv tröskel (MVP)** — `EnergyTrigger` + `useEnergyTrigger`.
- [ ] **A-3 — Integrera röststart med session-läge + `swingStartTimestamp`**.
- [ ] **A-4 — Wake-word "start" via Porcupine + settings-toggle**.
- [ ] **A-5 — Range-validering + tröskeltrimning** (kräver Eriks fälttest).
