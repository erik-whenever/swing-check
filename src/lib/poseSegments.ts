// STEG A + C (Ström D, ADR-003) — SEGMENTERING för kontinuerligt sessionsläge.
//
// Problemet (ADR-003 §Problem, mätt): `detectSwingEnvelope` letar EN envelope över
// hela spannet. Matad med en 64-sekunders session med tre svingar svarar den
// `[8.26 → 34.46]`, impact 34.26, `valid: true`, `impactReason: "confident"` — den
// spänner över sving 1:s start och sving 2:s finish och rapporterar det som lyckat.
// Det farliga är inte felet, det är TYSTNADEN.
//
// Lösningen (ADR-003 §Beslut): WRAPPA, skriv inte om. Den här filen lägger ett
// segmenteringssteg FÖRE envelope-detektionen och en kvalitetsgrind EFTER, så att
// `detectSwingEnvelope` får exakt det kontrakt den redan uppfyller — en adress, en
// sving, en finish.
//
//   segmentSwingCandidates()  ← steg A: stillhet/hastighet → kandidatfönster
//     → detectSwingEnvelope() ← en gång per kandidat, logiken oförändrad
//       → isSwing()           ← steg C: kvalitetsgrind, förkastar bollplock/waggle
//
// Envelope-LOGIKEN är orörd. Två saker under den ändrades dock när mätningarna visade
// att signalen, inte logiken, var trasig: handpositionen är nu en visibility-viktad
// mittpunkt av båda handlederna (se nedan), och `IMPACT_ADDRESS_TOL` räknades om mot den
// städade signalen. Båda ligger i poseEnvelope.ts och gäller alltså även enkelklipp.
//
// Durabel princip från ADR-003, som hela grinden bygger på: *varje gräns som har ett
// minimum måste också ha ett maximum.* `MIN_DOWNSWING_SEC` utan `MAX_DOWNSWING_SEC` är
// precis varför en 20-sekunders "downswing" kunde passera som confident.
//
// Ren funktion, inget I/O, ingen pose-körning — testbar mot frysta fixturer.

import { detectSwingEnvelope, type SwingEnvelope } from './poseEnvelope';
import type { PoseSample } from './poseTrajectory';

// ── Trösklar: wrist-serie (speglar poseEnvelope.ts) ──────────────────────────
const WRIST_LEFT = 15;
const WRIST_RIGHT = 16;
/** Landmark-visibility under detta räknas som otillförlitlig (samma som envelopen).
 *  Filtrerar INTE positionsserien — den viktar i stället (se weightedHands). Används
 *  bara för handledsvalet i diagnostiken och för visibleFrac-grinden. */
const MIN_VISIBILITY = 0.4;
/** Glidande medelvärde, halvfönster i sampel (samma som envelopen). */
const SMOOTH_HALF = 1;
/** Andel sampel med användbar handled som krävs för att lita på läsningen. */
const MIN_VISIBLE_FRAC = 0.5;
/** Färre sampel än så och `detectSwingEnvelope` bailar ändå ("too few pose samples"). */
const MIN_SEGMENT_SAMPLES = 6;

// ── Svingens varaktighet — delad av grinden och burst-taket ──────────────────
/**
 * ENVELOPE-VARAKTIGHET (start→finish). Under: waggle. Över: mer än en sving, eller
 * gå-runt. Detta är den EGENTLIGA kvalitetsgränsen på hur länge en sving får hålla på;
 * grovgallringens burst-tak nedan härleds ur den i stället för att gissas.
 * Mätt över alla fyra fixturerna efter viktningen: 1.41 / 1.53 / 1.60 / 1.60 s.
 */
const MIN_ENVELOPE_SEC = 0.7;
const MAX_ENVELOPE_SEC = 3.0;

// ── Trösklar: steg A, segmentering ───────────────────────────────────────────
/**
 * REFERENSHASTIGHET = p95, INTE max (ADR-003 §1.1). Med `max` sätter strömmens
 * hårdaste driver tröskeln för allt som kommer efter: ett chip med halva hastigheten
 * hamnar då under QUIET-gränsen och segmenteras aldrig ut. p95 är robust mot den
 * enskilda toppen men följer fortfarande sessionens allmänna rörelsenivå.
 * Mätt på session-multi (64 s, 3 svingar) efter den viktade signalen: max 1.173 mot
 * p95 0.565. Före viktningen var max 2.23 — men den toppen var en handledsbyte-artefakt,
 * inte rörelse, vilket är ett andra och starkare skäl att aldrig normalisera mot max.
 */
const REF_SPEED_QUANTILE = 0.95;
/** QUIET/MOVING-gräns som andel av refSpeed (samma andel som envelopens address-platå). */
const ADDRESS_SPEED_FRAC = 0.15;
/** Kortaste stillnadsö (sekunder) som får bryta två rörelse-burstar från varandra. */
const MIN_ADDRESS_SEC = 0.3;
/**
 * PADDING FÖRE bursten. `detectSwingEnvelope` KRÄVER en address-platå inne i sitt
 * eget spann (annars `fail('no address plateau')`) och mäter den mot sin egen,
 * per-segment `peakSpeed`. Att padda med exakt `MIN_ADDRESS_SEC` ger precis 5 sampel
 * vid 15 fps — noll marginal, och envelopens platå-sökning måste hitta ett *helt*
 * kvalificerande löpande fönster inuti det. Dubbelt upp ger platån utrymme att
 * existera utan att sträcka sig in i föregående burst (stillnadsön är per definition
 * längre än MIN_ADDRESS_SEC, så paddingen äter aldrig grannens rörelse).
 */
const PAD_BEFORE_SEC = 2 * MIN_ADDRESS_SEC;
/**
 * PADDING EFTER bursten (ADR-003 §1.4). Envelopen behöver se settle-finishen — den
 * hållna följdrörelsen efter impact — annars sätter clip-cutoff-skyddet `clippedTail`
 * och grinden förkastar en fullgod sving.
 */
const PAD_AFTER_SEC = 1.0;
/** Grovgallring: kortare burst än så är waggle/ryck, inte en sving. */
const MIN_BURST_SEC = 0.7;
/**
 * EFTERSLÄPET efter finishen. Bursten mäts mot en känslig tröskel (0.15 × refSpeed) och
 * fortsätter därför bortom svingens finish, genom att golfaren sänker klubban, tills
 * stillheten infinner sig. Uppmätt som `burstEnd − envelope.finishSec` efter viktningen:
 * dtl-full 1.20 s, session-multi 1.60 och 2.06 s. 2.5 ger ~20 % marginal över det längsta
 * observerade.
 */
const POST_FINISH_TAIL_SEC = 2.5;
/**
 * Grovgallring, ÖVRE gräns — HÄRLEDD, inte gissad: en burst får rymma en maximalt lång
 * sving plus dess eftersläp, alltså `MAX_ENVELOPE_SEC + POST_FINISH_TAIL_SEC` = 5.5 s.
 *
 * ADR-003 §1.5 föreslog 3.0 s (samma fönster som envelope-varaktigheten). Det är fel
 * storhet: bursten är en ÖVERMÄNGD av envelopen. Mätningen mot den städade, viktade
 * signalen visar dessutom att ett burst-tak inte kan skilja sving från skräp alls —
 * fördelningarna överlappar helt:
 *
 *   äkta svingar (5 st, alla fixturer): 1.68 · 2.53 · 3.20 · 3.67 · 4.27 s
 *   skräp som klarar MIN_BURST_SEC + peak-grinden: 0.93 … 2.33 s
 *
 * Ett tak vid 4.0 gallrade sving 3 (4.27 s) innan grinden ens såg den, och ett tak som
 * skulle bita mot skräpet hade tagit fyra av fem svingar med sig. Takets enda uppgift är
 * därför att hindra ett orimligt LÅNGT fönster (en promenad, eller två svingar i samma
 * burst) från att skickas in i `detectSwingEnvelope` som ett spann. 5.5 s klarar den
 * uppgiften — svingarna i sessionsklippet ligger >20 s isär — utan att kapa något äkta.
 * Diskrimineringen sköts av peak-grinden, exkursionen och envelope-varaktigheten.
 */
const MAX_BURST_SEC = MAX_ENVELOPE_SEC + POST_FINISH_TAIL_SEC;
/** Grovgallring: burstens topphastighet måste nå denna andel av refSpeed. */
const MIN_BURST_PEAK_FRAC = 0.4;

// ── Trösklar: steg C, kvalitetsgrind ─────────────────────────────────────────
// (Envelope-varaktigheten MIN/MAX_ENVELOPE_SEC står längre upp — den delas med det
// härledda burst-taket.)
/** Nedsving (top→impact). Nedre gränsen speglar envelopens egen MIN_DOWNSWING_SEC. */
const MIN_DOWNSWING_SEC = 0.12;
/**
 * NEDSVINGETS ÖVRE GRÄNS — den gräns som stänger den tysta buggen. En riktig
 * top→impact är ~0.2–0.3 s; 0.6 s ger gott om marginal för en långsam övningssving.
 * Utan den passerade den uppmätta 20.36-sekunders "downswingen" över tre svingar som
 * "confident". Detta är ADR-003:s min-kräver-max-princip i sin renaste form.
 */
const MAX_DOWNSWING_SEC = 0.6;
/**
 * VERTIKAL EXKURSION (normaliserad y, origo uppe till vänster → mindre y = högre upp).
 * `addressY − apexY` måste vara positiv och stor: i en sving går händerna UPP.
 * Detta är testet som fångar BOLLPLOCK — där går händerna NED, alltså fel tecken.
 * Mätt på session-multi efter viktningen: äkta svingar 0.265 / 0.267 / 0.267,
 * bollplock och uttåg 0.004–0.019. Separationen är över en tiopotens.
 */
const MIN_VERTICAL_EXCURSION = 0.08;
/** Segmentets egen topphastighet mot sessionens refSpeed — sållar gester/vinkningar. */
const MIN_PEAK_SPEED_FRAC = 0.4;
/**
 * COOLDOWN mot föregående ACCEPTERAD impact. Två accepterade svingar närmare varandra
 * än så är dubbelräkning av samma rörelse (paddade grannsegment kan överlappa), inte
 * två slag — ingen golfare slår två bollar på under två sekunder.
 */
const COOLDOWN_SEC = 2.0;

// ── Typer ────────────────────────────────────────────────────────────────────

export interface SwingCandidate {
  /** Segmentets index i samples[] (inklusiva), redan paddade. */
  startIdx: number;
  endIdx: number;
  /** Segmentets tidsgränser (paddade), sekunder. */
  startSec: number;
  endSec: number;
  /** Den oaddade rörelse-burstens gränser — diagnostik. */
  burstStartSec: number;
  burstEndSec: number;
  /** Högsta utjämnade handledshastighet inuti bursten. */
  peakSpeed: number;
  /** Andel sampel i segmentet där MINST en handled klarar MIN_VISIBILITY. */
  visibleFrac: number;
}

export interface SegmentationResult {
  candidates: SwingCandidate[];
  /** p95 av den utjämnade hastighetsserien — grindens normaliserare. */
  refSpeed: number;
  /** QUIET/MOVING-gränsen som användes (refSpeed × ADDRESS_SPEED_FRAC). */
  quietThreshold: number;
  sampleDt: number;
  /** Bäst spårade handled — DIAGNOSTIK. Serien är en viktad mittpunkt av båda. */
  trackedWrist: 'left' | 'right';
  visibleFrac: number;
  /** Satt när ingen segmentering var möjlig (för loggen). */
  reason?: string;
}

export interface SwingGate {
  accepted: boolean;
  /** Varför den accepterades eller föll — alltid ifylld, alltid loggbar. */
  reason: string;
}

export interface DetectedSwing {
  candidate: SwingCandidate;
  envelope: SwingEnvelope;
  /** Impact-tid i KLIPPETS tidsbas (envelopens tider är redan absoluta). */
  impactSec: number;
}

export interface SessionSwings {
  swings: DetectedSwing[];
  /** Varje kandidat som föll, med skäl — falska negativ ska vara diagnostiserbara. */
  rejected: { candidate: SwingCandidate; envelope: SwingEnvelope | null; reason: string }[];
  refSpeed: number;
  segmentation: SegmentationResult;
}

interface Vec {
  x: number;
  y: number;
}

// ── Steg A: segmentering ─────────────────────────────────────────────────────

/**
 * Dela en kontinuerlig pose-ström i kandidatfönster som var och en kan matas till
 * `detectSwingEnvelope` som om den vore ett enkelsvingsklipp (ADR-003 §2 steg A).
 * Kastar aldrig; på otolkbar indata returneras en tom kandidatlista med `reason`.
 */
export function segmentSwingCandidates(samples: PoseSample[]): SegmentationResult {
  const n = samples.length;
  const t = samples.map((s) => s.t);
  const sampleDt = medianDt(t);

  const empty = (reason: string, extra?: Partial<SegmentationResult>): SegmentationResult => ({
    candidates: [],
    refSpeed: 0,
    quietThreshold: 0,
    sampleDt,
    trackedWrist: 'right',
    visibleFrac: 0,
    reason,
    ...extra,
  });

  if (n < MIN_SEGMENT_SAMPLES) return empty('too few pose samples');

  // ── Handpositionsserien byggs EXAKT som i poseEnvelope.ts ─────────────────
  // Medvetet duplicerad, inte utbruten: poseEnvelope.ts är låst (D-3-cutover,
  // regressionsharness grön) och en refaktorering som flyttar dess interna hjälpare
  // vore en beteendeförändring förklädd till städning. Håll dem i synk för hand —
  // inklusive VIKTNINGEN nedan, som MÅSTE vara identisk på båda ställena: grinden
  // jämför `envelope.peakSpeed` mot `refSpeed` härifrån, så är serierna byggda olika
  // betyder jämförelsen ingenting.
  //
  // VISIBILITY-VIKTAD MITTPUNKT av båda handlederna — händerna sitter på samma grepp
  // och är ett fysiskt objekt. Full motivering i poseEnvelope.ts; kort: den gamla
  // `primary ?? backup` växlade handled per frame och injicerade avståndet mellan
  // handlederna (~0.4 i x) som förflyttning → skenbar hastighet 2.23 på session-multi,
  // klippets högsta, som impact-sökningen tog för ett nedslag. Efter fixen: max 1.173,
  // p95 0.744 → 0.565.
  const leftVisible = countVisible(samples, WRIST_LEFT);
  const rightVisible = countVisible(samples, WRIST_RIGHT);
  const trackedWrist: 'left' | 'right' = rightVisible >= leftVisible ? 'right' : 'left';

  const raw: (Vec | null)[] = samples.map((s) => weightedHands(s));
  // Kvalitetsmåttet är fortfarande en visibility-fråga även om serien inte filtrerar
  // på den: en frame räknas som spårad när MINST en handled klarar MIN_VISIBILITY.
  const tracked = samples.map(
    (s) => usable(s, WRIST_LEFT) !== null || usable(s, WRIST_RIGHT) !== null,
  );
  const visibleFrac = tracked.filter(Boolean).length / n;
  if (visibleFrac < MIN_VISIBLE_FRAC) {
    return empty('low wrist visibility', { trackedWrist, visibleFrac });
  }
  const pos = smoothVec(interpolate(raw), SMOOTH_HALF);

  const speed = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dt = t[i] - t[i - 1] || sampleDt;
    speed[i] = Math.hypot(pos[i].x - pos[i - 1].x, pos[i].y - pos[i - 1].y) / dt;
  }
  const speedSm = smooth(speed, SMOOTH_HALF);

  const refSpeed = quantile(speedSm, REF_SPEED_QUANTILE);
  const quietThreshold = refSpeed * ADDRESS_SPEED_FRAC;
  if (!(refSpeed > 0)) {
    return empty('no wrist motion', { trackedWrist, visibleFrac });
  }

  // ── Stillnadsöar ──────────────────────────────────────────────────────────
  // En ö är ett QUIET-löp som är minst MIN_ADDRESS_SEC långt. Kortare QUIET-dippar
  // (t.ex. det korta uppehållet i backswingens topp) är AVSIKTLIGT inga öar — de får
  // inte klyva en sving i två burstar.
  const isIsland = new Array<boolean>(n).fill(false);
  {
    let i = 0;
    while (i < n) {
      if (speedSm[i] >= quietThreshold) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && speedSm[j + 1] < quietThreshold) j++;
      if (t[j] - t[i] >= MIN_ADDRESS_SEC) {
        for (let k = i; k <= j; k++) isIsland[k] = true;
      }
      i = j + 1;
    }
  }

  // ── Burstar = maximala icke-ö-löp, grovgallrade ───────────────────────────
  const candidates: SwingCandidate[] = [];
  {
    let i = 0;
    while (i < n) {
      if (isIsland[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && !isIsland[j + 1]) j++;

      const burstSec = t[j] - t[i];
      let peak = 0;
      for (let k = i; k <= j; k++) peak = Math.max(peak, speedSm[k]);

      if (
        burstSec >= MIN_BURST_SEC &&
        burstSec <= MAX_BURST_SEC &&
        peak >= refSpeed * MIN_BURST_PEAK_FRAC
      ) {
        const startIdx = indexAtOrAfter(t, t[i] - PAD_BEFORE_SEC);
        const endIdx = indexAtOrBefore(t, t[j] + PAD_AFTER_SEC);
        candidates.push({
          startIdx,
          endIdx,
          startSec: t[startIdx],
          endSec: t[endIdx],
          burstStartSec: t[i],
          burstEndSec: t[j],
          peakSpeed: peak,
          visibleFrac: fracVisible(tracked, startIdx, endIdx),
        });
      }
      i = j + 1;
    }
  }

  return {
    candidates: mergeOverlapping(candidates, tracked, t),
    refSpeed,
    quietThreshold,
    sampleDt,
    trackedWrist,
    visibleFrac,
  };
}

// ── Steg C: kvalitetsgrind ───────────────────────────────────────────────────

/**
 * Avgör om en per-segment-envelope är en riktig sving (ADR-003 §2 steg C).
 *
 * STRIKT MED FLIT (ADR-003 Risker §4): ett falskt positiv kostar ett Vision-anrop och
 * förvirrar användaren med feedback på ett bollplock; en missad sving kostar ingenting
 * mer än att golfaren slår igen. Vid tvekan — förkasta.
 *
 * @param refSpeed sessionens p95-hastighet från `segmentSwingCandidates`.
 * @param prevAcceptedImpactSec impact-tiden för närmast föregående ACCEPTERADE sving,
 *   eller null/undefined för den första. Driver cooldown-testet.
 */
export function isSwing(
  envelope: SwingEnvelope,
  refSpeed: number,
  prevAcceptedImpactSec?: number | null,
): SwingGate {
  const no = (reason: string): SwingGate => ({ accepted: false, reason });

  if (!envelope.valid) return no(`envelope invalid (${envelope.reason ?? 'unknown'})`);
  if (envelope.clippedTail) return no('clipped tail: motion without a settled finish');
  if (envelope.visibleFrac < MIN_VISIBLE_FRAC) {
    return no(`wrist visibility ${envelope.visibleFrac.toFixed(2)} < ${MIN_VISIBLE_FRAC}`);
  }

  const envSec = envelope.finishSec - envelope.startSec;
  if (envSec < MIN_ENVELOPE_SEC) return no(`envelope ${envSec.toFixed(2)}s < ${MIN_ENVELOPE_SEC}s (waggle?)`);
  if (envSec > MAX_ENVELOPE_SEC) return no(`envelope ${envSec.toFixed(2)}s > ${MAX_ENVELOPE_SEC}s (not one swing)`);

  if (envelope.peakSpeed < refSpeed * MIN_PEAK_SPEED_FRAC) {
    return no(
      `peak speed ${envelope.peakSpeed.toFixed(2)} < ${MIN_PEAK_SPEED_FRAC}×refSpeed (${(refSpeed * MIN_PEAK_SPEED_FRAC).toFixed(2)}) — gesture?`,
    );
  }

  // IMPACT TESTAS FÖRE EXKURSIONEN — ordningen är en loggkorrekthetsfråga, inte en
  // smaksak. `apexY` (baksvingstoppen) beräknas i poseEnvelope bara när en impact
  // finns: topp-loopen är bunden av `impactIdx`, så utan impact blir `apexY` =
  // positionen vid `startIdx` och exkursionen läser ≈ 0. Med exkursionen först
  // rapporterade grinden därför "vertical excursion −0.003 (ball pickup?)" för
  // äkta svingar vars ENDA fel var att impact saknades — ett skäl som pekade på fel
  // orsak och skickade felsökningen åt fel håll. Nu faller de på impact, som är
  // sanningen, och exkursionstestet ser bara envelopes där `apexY` betyder något.
  //
  // En sving utan verifierad impact släpps aldrig igenom oavsett: envelopens impact
  // är "confident-only" (aldrig en fallback). Grinden ska vara strikt — hellre missa.
  if (!envelope.impact) return no(`no confident impact (${envelope.impactReason})`);

  // Vertikal exkursion: händerna måste ha gått UPP. Fel tecken = bollplock.
  const excursion = envelope.addressY - envelope.apexY;
  if (excursion < MIN_VERTICAL_EXCURSION) {
    return no(
      `vertical excursion ${excursion.toFixed(3)} < ${MIN_VERTICAL_EXCURSION} (hands never rose — ball pickup?)`,
    );
  }

  const ds = envelope.impact.downswingSec;
  if (ds < MIN_DOWNSWING_SEC) return no(`downswing ${ds.toFixed(2)}s < ${MIN_DOWNSWING_SEC}s`);
  if (ds > MAX_DOWNSWING_SEC) return no(`downswing ${ds.toFixed(2)}s > ${MAX_DOWNSWING_SEC}s (envelope spans more than one swing)`);

  if (prevAcceptedImpactSec != null) {
    const gap = envelope.impact.timeSec - prevAcceptedImpactSec;
    if (gap < COOLDOWN_SEC) {
      return no(`cooldown: ${gap.toFixed(2)}s since previous accepted impact < ${COOLDOWN_SEC}s`);
    }
  }

  return {
    accepted: true,
    reason: `swing (env ${envSec.toFixed(2)}s, ds ${ds.toFixed(2)}s, excursion ${excursion.toFixed(3)})`,
  };
}

// ── Kedjan ───────────────────────────────────────────────────────────────────

/**
 * Hela ADR-003-kedjan: segmentera → `detectSwingEnvelope` per segment (OFÖRÄNDRAD)
 * → grinda. Ett segment in ger identiskt resultat som dagens enkelklippsväg ut —
 * det är hela poängen med att wrappa i stället för att skriva om.
 */
export function detectSessionSwings(samples: PoseSample[]): SessionSwings {
  const segmentation = segmentSwingCandidates(samples);
  const swings: DetectedSwing[] = [];
  const rejected: SessionSwings['rejected'] = [];

  for (const candidate of segmentation.candidates) {
    const slice = samples.slice(candidate.startIdx, candidate.endIdx + 1);
    if (slice.length < MIN_SEGMENT_SAMPLES) {
      rejected.push({ candidate, envelope: null, reason: 'segment too short to analyse' });
      continue;
    }
    const envelope = detectSwingEnvelope(slice);
    const prev = swings.length > 0 ? swings[swings.length - 1].impactSec : null;
    const gate = isSwing(envelope, segmentation.refSpeed, prev);
    if (gate.accepted) {
      swings.push({ candidate, envelope, impactSec: envelope.impact!.timeSec });
    } else {
      rejected.push({ candidate, envelope, reason: gate.reason });
    }
  }

  return { swings, rejected, refSpeed: segmentation.refSpeed, segmentation };
}

// ── hjälpare (speglar poseEnvelope.ts) ───────────────────────────────────────

function usable(sample: PoseSample, idx: number): Vec | null {
  const p = sample.landmarks[idx];
  if (!p) return null;
  if (p.visibility !== undefined && p.visibility < MIN_VISIBILITY) return null;
  return { x: p.x, y: p.y };
}

function countVisible(samples: PoseSample[], idx: number): number {
  let c = 0;
  for (const s of samples) if (usable(s, idx)) c++;
  return c;
}

function fracVisible(tracked: boolean[], from: number, to: number): number {
  let c = 0;
  for (let i = from; i <= to; i++) if (tracked[i]) c++;
  return c / (to - from + 1);
}

/**
 * Visibility-viktad mittpunkt av de två handlederna — identisk med poseEnvelope.ts.
 * Inget visibility-golv: en lågt synlig handled nedviktas, den kastas inte. Null bara
 * när MediaPipe inte gav någon handled alls (då fyller interpolationen luckan).
 */
function weightedHands(sample: PoseSample): Vec | null {
  const l = sample.landmarks[WRIST_LEFT];
  const r = sample.landmarks[WRIST_RIGHT];
  const wl = l ? (l.visibility ?? 1) : 0;
  const wr = r ? (r.visibility ?? 1) : 0;
  const sum = wl + wr;
  if (sum <= 0) return null;
  return {
    x: ((l ? l.x * wl : 0) + (r ? r.x * wr : 0)) / sum,
    y: ((l ? l.y * wl : 0) + (r ? r.y * wr : 0)) / sum,
  };
}

/** Fyll null-luckor linjärt; klampa ledande/avslutande luckor till närmaste. */
function interpolate(raw: (Vec | null)[]): Vec[] {
  const n = raw.length;
  const out: Vec[] = new Array(n);
  let lastIdx = -1;
  for (let i = 0; i < n; i++) {
    if (raw[i]) {
      const cur = raw[i]!;
      if (lastIdx < 0) {
        for (let j = 0; j < i; j++) out[j] = cur;
      } else if (lastIdx < i - 1) {
        const a = raw[lastIdx]!;
        const span = i - lastIdx;
        for (let j = lastIdx + 1; j < i; j++) {
          const f = (j - lastIdx) / span;
          out[j] = { x: a.x + (cur.x - a.x) * f, y: a.y + (cur.y - a.y) * f };
        }
      }
      out[i] = cur;
      lastIdx = i;
    }
  }
  if (lastIdx < n - 1 && lastIdx >= 0) {
    for (let j = lastIdx + 1; j < n; j++) out[j] = raw[lastIdx]!;
  }
  return out;
}

function smooth(v: number[], half: number): number[] {
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    let sum = 0;
    let k = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < v.length) {
        sum += v[j];
        k++;
      }
    }
    out[i] = sum / k;
  }
  return out;
}

function smoothVec(v: Vec[], half: number): Vec[] {
  const xs = smooth(v.map((p) => p.x), half);
  const ys = smooth(v.map((p) => p.y), half);
  return xs.map((x, i) => ({ x, y: ys[i] }));
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function medianDt(t: number[]): number {
  if (t.length < 2) return 1 / 15;
  const dts: number[] = [];
  for (let i = 1; i < t.length; i++) dts.push(t[i] - t[i - 1]);
  return median(dts) || 1 / 15;
}

/** Nearest-rank-kvantil (ingen interpolation — robust och beroendefri). */
function quantile(v: number[], q: number): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
}

function indexAtOrAfter(t: number[], sec: number): number {
  for (let i = 0; i < t.length; i++) if (t[i] >= sec) return i;
  return t.length - 1;
}

function indexAtOrBefore(t: number[], sec: number): number {
  for (let i = t.length - 1; i >= 0; i--) if (t[i] <= sec) return i;
  return 0;
}

/**
 * Slå ihop kandidater vars PADDADE fönster överlappar. Två närliggande burstar
 * (t.ex. takeaway och ett kort avbrott) skulle annars ge två segment som båda
 * innehåller samma sving → dubbelräkning. Cooldown i grinden är sista skyddet,
 * detta är det första.
 */
function mergeOverlapping(
  cands: SwingCandidate[],
  tracked: boolean[],
  t: number[],
): SwingCandidate[] {
  if (cands.length < 2) return cands;
  const out: SwingCandidate[] = [];
  for (const c of cands) {
    const prev = out[out.length - 1];
    if (prev && c.startIdx <= prev.endIdx) {
      prev.endIdx = Math.max(prev.endIdx, c.endIdx);
      prev.endSec = t[prev.endIdx];
      prev.burstEndSec = c.burstEndSec;
      prev.peakSpeed = Math.max(prev.peakSpeed, c.peakSpeed);
      prev.visibleFrac = fracVisible(tracked, prev.startIdx, prev.endIdx);
    } else {
      out.push({ ...c });
    }
  }
  return out;
}
