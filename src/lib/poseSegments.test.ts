// Segmentation regression harness (Ström D, ADR-003 steg A + C).
//
// Kör HELA kedjan — segmentSwingCandidates → detectSwingEnvelope (OFÖRÄNDRAD) →
// isSwing — mot frysta pose-fixturer, precis som poseEnvelopeRegression.test.ts gör
// för enkelklippsvägen.
//
// ── LÄS DETTA INNAN DU ÄNDRAR EN SIFFRA HÄR ────────────────────────────────────
// Segmenteringen (steg A) FUNGERAR: den isolerar sessionsklippets tre svingar rent.
// Kedjan hittar ändå NOLL svingar, för `detectSwingEnvelope` — som per uppdrag är
// orörd — inte kan producera en confident impact i något av de tre segmenten.
// Blockeringen är mätt, inte gissad; se ADR-003 → *Mätt blockering* och de två
// KNOWN GAP-testerna nedan. Golden-siffran 0 är alltså inte ett beteende vi vill ha,
// det är en dokumenterad baslinje som ska flippa till 3 när blockeringen lyfts.

import { describe, it, expect } from 'vitest';
import { detectSwingEnvelope } from './poseEnvelope';
import { detectSessionSwings, segmentSwingCandidates, isSwing } from './poseSegments';
import type { PoseSample } from './poseTrajectory';

/** Antal rörelse-burstar i session-multi som bär svingenergi (steg A:s golden). */
const SESSION_MULTI_SWING_CANDIDATES = 3;

/**
 * Antal svingar kedjan FAKTISKT accepterar i session-multi idag. Noll — se filhuvudet.
 * När poseEnvelope-blockeringen lyfts ska denna bli 3 i samma commit som lyfter den;
 * verifierat i probe att exakt tre envelope-ändringar räcker (ADR-003 → Mätt blockering).
 */
const SESSION_MULTI_SWINGS = 0;

/** Tolerans för tidsassertar: ±1 sampelframe (ur fixturens eget dt) + float-epsilon. */
const TOL_FRAMES = 1;

interface FixtureFile {
  samples: PoseSample[];
}
const rawFixtures = import.meta.glob<FixtureFile>('./__fixtures__/*.json', {
  eager: true,
  import: 'default',
});
const fixtures = new Map<string, FixtureFile>();
for (const [path, data] of Object.entries(rawFixtures)) {
  fixtures.set(path.split('/').pop()!.replace(/\.json$/, ''), data);
}

function medianDt(samples: PoseSample[]): number {
  const dts: number[] = [];
  for (let i = 1; i < samples.length; i++) dts.push(samples[i].t - samples[i - 1].t);
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)] || 1 / 15;
}

describe('session segmentation (ADR-003 steg A + C)', () => {
  const multi = fixtures.get('session-multi');

  if (!multi) {
    it.todo('session-multi: fixture missing — export into src/lib/__fixtures__/session-multi.json');
  } else {
    // ── Steg A: det som fungerar ─────────────────────────────────────────────
    it(`session-multi: segmentation isolates ${SESSION_MULTI_SWING_CANDIDATES} swing-energy bursts`, () => {
      const seg = segmentSwingCandidates(multi.samples);

      // refSpeed MÅSTE vara p95, inte max: klippets max (2.23) är en handledsbyte-
      // artefakt (se poseSegments.ts) och skulle sätta tröskeln tre gånger för högt.
      expect(seg.refSpeed).toBeGreaterThan(0.5);
      expect(seg.refSpeed).toBeLessThan(1.0);

      // Tre kandidater bär svingenergi (peak 1.27 / 2.23 / 1.89). Övriga är bollplock,
      // waggle och gå-runt — alla under 1.0.
      // OSÄKER: den svagaste "övriga" är bursten 60.3–62.7 (peak 0.95, visibleFrac 0.55,
      // envelope-varaktighet 0.13 s, händerna går NED). Den ser ut som klubbplock/uttåg,
      // inte som Eriks eventuella fjärde sving — men den ligger närmast gränsen av allt
      // i klippet och är den kandidat som ska verifieras mot videon först.
      const energetic = seg.candidates.filter((c) => c.peakSpeed >= 1.2);
      const rest = seg.candidates.filter((c) => c.peakSpeed < 1.2);
      const dump = seg.candidates
        .map((c) => `${c.startSec.toFixed(1)}-${c.endSec.toFixed(1)} pk=${c.peakSpeed.toFixed(2)}`)
        .join(', ');
      expect(energetic.length, dump).toBe(SESSION_MULTI_SWING_CANDIDATES);
      for (const c of rest) expect(c.peakSpeed, dump).toBeLessThan(1.0);

      // De tre ligger där svingarna ligger i klippet, väl separerade.
      const starts = energetic.map((c) => c.burstStartSec);
      expect(starts[1] - starts[0]).toBeGreaterThan(10);
      expect(starts[2] - starts[1]).toBeGreaterThan(10);

      // Varje kandidat måste vara analyserbar: padding före/efter och nog med sampel.
      for (const c of energetic) {
        expect(c.startSec).toBeLessThan(c.burstStartSec);
        expect(c.endSec).toBeGreaterThan(c.burstEndSec);
        expect(c.endIdx - c.startIdx).toBeGreaterThan(20);
        expect(c.visibleFrac).toBeGreaterThanOrEqual(0.5);
      }
    });

    // ── Steg C end-to-end: den dokumenterade baslinjen ───────────────────────
    it(`session-multi: chain accepts ${SESSION_MULTI_SWINGS} swings (KNOWN GAP — see file header)`, () => {
      const result = detectSessionSwings(multi.samples);
      const summary = result.swings
        .map((s) => `${s.envelope.startSec.toFixed(2)}→${s.envelope.finishSec.toFixed(2)} @${s.impactSec.toFixed(2)}`)
        .join(', ');
      expect(result.swings.length, `accepted: [${summary}]`).toBe(SESSION_MULTI_SWINGS);

      // Konsistensvakt som gäller oavsett hur många som accepteras: rätt ANTAL får
      // aldrig uppstå ur två fel som tar ut varandra.
      let prevImpact = -Infinity;
      for (const s of result.swings) {
        expect(s.envelope.valid).toBe(true);
        expect(s.envelope.clippedTail).toBe(false);
        expect(s.envelope.impact).not.toBeNull();
        expect(s.impactSec - prevImpact).toBeGreaterThanOrEqual(2);
        expect(s.envelope.impact!.downswingSec).toBeLessThanOrEqual(0.6);
        expect(s.envelope.finishSec - s.envelope.startSec).toBeLessThanOrEqual(3.0);
        prevImpact = s.impactSec;
      }
    });

    it('session-multi: the three swing candidates fail ONLY on the missing impact (KNOWN GAP)', () => {
      // Pinnar blockeringen till exakt ett skäl. Faller detta har antingen envelopen
      // ändrats (bra — flippa golden till 3) eller så har grinden börjat kasta de tre
      // av något ANNAT skäl (dåligt — segmenteringen har regredierat).
      const result = detectSessionSwings(multi.samples);
      const energetic = result.rejected.filter((r) => r.candidate.peakSpeed >= 1.2);
      expect(energetic.length).toBe(SESSION_MULTI_SWING_CANDIDATES);
      for (const r of energetic) {
        expect(r.envelope?.valid).toBe(true);
        expect(r.envelope?.clippedTail).toBe(false);
        expect(r.envelope?.impact).toBeNull();
        expect(r.reason).toMatch(/vertical excursion|no confident impact/);
      }
    });

    it('session-multi: whole-clip envelope is the silent failure ADR-003 describes', () => {
      // Vaktar PROBLEMFORMULERINGEN, inte lösningen: så länge detta är sant får
      // segmenteringen aldrig tas bort. Utan segmentering svarar detektorn med EN
      // "sving" på 26 s, valid + confident — ett tyst fel som spänner över två svingar.
      const whole = detectSwingEnvelope(multi.samples);
      expect(whole.valid).toBe(true);
      expect(whole.impact).not.toBeNull();
      expect(whole.finishSec - whole.startSec).toBeGreaterThan(10);
      // Och att grinden fångar just det felet är hela poängen med steg C.
      expect(isSwing(whole, segmentSwingCandidates(multi.samples).refSpeed).accepted).toBe(false);
    });
  }

  // ── Ett segment in = identiskt ut (ADR-003 Risker §5) ──────────────────────
  // Segmentering får inte ändra beteendet för de klipp appen redan är verifierad på.
  for (const stem of ['dtl-full', 'face-on'] as const) {
    const fx = fixtures.get(stem);
    if (!fx) {
      it.todo(`${stem}: fixture missing`);
      continue;
    }
    it(`${stem}: single-swing clip yields exactly one swing, envelope unchanged`, () => {
      const direct = detectSwingEnvelope(fx.samples);
      const result = detectSessionSwings(fx.samples);
      const tol = medianDt(fx.samples) * TOL_FRAMES + 1e-6;

      expect(result.swings.length).toBe(1);
      const seg = result.swings[0].envelope;
      expect(Math.abs(seg.startSec - direct.startSec)).toBeLessThanOrEqual(tol);
      expect(Math.abs(seg.finishSec - direct.finishSec)).toBeLessThanOrEqual(tol);
      expect(seg.impact).not.toBeNull();
      expect(Math.abs(seg.impact!.timeSec - direct.impact!.timeSec)).toBeLessThanOrEqual(tol);
    });
  }

  // dtl-clipped har per definition ingen fullföljd (clippedTail) — grinden SKA
  // förkasta den. Kontraktet "hellre missa en sving än gissa", i praktiken.
  const clipped = fixtures.get('dtl-clipped');
  if (!clipped) {
    it.todo('dtl-clipped: fixture missing');
  } else {
    it('dtl-clipped: clipped tail is rejected by the gate', () => {
      const result = detectSessionSwings(clipped.samples);
      expect(result.swings.length).toBe(0);
      expect(result.rejected.some((r) => /clipped tail/.test(r.reason))).toBe(true);
    });
  }

  it('empty input degrades quietly', () => {
    expect(segmentSwingCandidates([]).candidates).toEqual([]);
    expect(segmentSwingCandidates([]).reason).toBe('too few pose samples');
    expect(detectSessionSwings([]).swings).toEqual([]);
  });
});
