// Segmentation regression harness (Ström D, ADR-003 steg A + C).
//
// Kör HELA kedjan — segmentSwingCandidates → detectSwingEnvelope (OFÖRÄNDRAD) →
// isSwing — mot frysta pose-fixturer, precis som poseEnvelopeRegression.test.ts gör
// för enkelklippsvägen.
//
import { describe, it, expect } from 'vitest';
import { detectSwingEnvelope } from './poseEnvelope';
import { detectSessionSwings, segmentSwingCandidates, isSwing } from './poseSegments';
import type { PoseSample } from './poseTrajectory';

/** Antal rörelse-burstar i session-multi som bär svingenergi (steg A:s golden). */
const SESSION_MULTI_SWING_CANDIDATES = 3;

/**
 * Antal svingar kedjan accepterar i session-multi. Uppmätt 2026-08-06 efter
 * viktad-handsignal + omräknade trösklar; PENDING Eriks perceptuella verifiering mot
 * klippet. Envelopes: [8.26→9.86] impact 9.26 · [31.53→33.13] impact 32.53 ·
 * [54.46→56.25] impact 55.59 — tre nedsving på 0.27/0.27/0.33 s och exkursion
 * 0.265/0.267/0.267, alltså tre svingar som liknar varandra på alla mått som betyder
 * något. Bollplock, waggle och uttåg (peak 0.31–0.61) förkastas.
 */
const SESSION_MULTI_SWINGS = 3;

/** Tolerans för tidsassertar: ±2 sampelframes (ur fixturens eget dt) + float-epsilon —
 *  samma motivering som i poseEnvelopeRegression.test.ts (±1 var falsk precision). */
const TOL_FRAMES = 2;

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

/** |actual − expected| ≤ tol — ett absolut fönster (till skillnad från toBeCloseTo,
 *  som arbetar i decimalsiffror). Samma hjälpare som i poseEnvelopeRegression.test.ts. */
function expectWithin(actual: number, expected: number, tol: number): void {
  expect(
    Math.abs(actual - expected),
    `${actual} should be within ${tol} of ${expected}`,
  ).toBeLessThanOrEqual(tol);
}

describe('session segmentation (ADR-003 steg A + C)', () => {
  const multi = fixtures.get('session-multi');

  if (!multi) {
    it.todo('session-multi: fixture missing — export into src/lib/__fixtures__/session-multi.json');
  } else {
    // ── Steg A: det som fungerar ─────────────────────────────────────────────
    it(`session-multi: segmentation isolates ${SESSION_MULTI_SWING_CANDIDATES} swing-energy bursts`, () => {
      const seg = segmentSwingCandidates(multi.samples);

      // refSpeed är p95, inte max. Med den gamla handledsväxlingen var klippets max 2.23
      // — ren artefakt — och p95 0.744. Efter viktningen: max 1.173, p95 0.565.
      expect(seg.refSpeed).toBeGreaterThan(0.4);
      expect(seg.refSpeed).toBeLessThan(0.8);

      // Tre kandidater bär svingenergi (peak 1.04 / 1.15 / 1.17). Övriga är bollplock,
      // waggle och uttåg — alla under 0.7. Separationen är ren, vilket är vad som gör
      // peak-grinden meningsfull.
      const energetic = seg.candidates.filter((c) => c.peakSpeed >= 1.0);
      const rest = seg.candidates.filter((c) => c.peakSpeed < 1.0);
      const dump = seg.candidates
        .map((c) => `${c.startSec.toFixed(1)}-${c.endSec.toFixed(1)} pk=${c.peakSpeed.toFixed(2)}`)
        .join(', ');
      expect(energetic.length, dump).toBe(SESSION_MULTI_SWING_CANDIDATES);
      for (const c of rest) expect(c.peakSpeed, dump).toBeLessThan(0.7);

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

    // ── Steg C end-to-end ─────────────────────────────────────────────────────
    it(`session-multi: chain accepts ${SESSION_MULTI_SWINGS} swings`, () => {
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

    it('session-multi: the three accepted swings land where the swings are', () => {
      // Pinnar TIDERNA, inte bara antalet — rätt antal kan uppstå ur fel segment.
      // Golden från mätningen 2026-08-06; ±2 frames.
      const EXPECTED: { envelope: [number, number]; impact: number }[] = [
        { envelope: [8.26, 9.86], impact: 9.26 },
        { envelope: [31.53, 33.13], impact: 32.53 },
        { envelope: [54.46, 56.25], impact: 55.59 },
      ];
      const result = detectSessionSwings(multi.samples);
      const tol = medianDt(multi.samples) * TOL_FRAMES + 1e-6;
      expect(result.swings.length).toBe(EXPECTED.length);
      result.swings.forEach((s, i) => {
        expectWithin(s.envelope.startSec, EXPECTED[i].envelope[0], tol);
        expectWithin(s.envelope.finishSec, EXPECTED[i].envelope[1], tol);
        expectWithin(s.impactSec, EXPECTED[i].impact, tol);
      });
    });

    it('session-multi: rejected candidates are rejected for an honest reason', () => {
      // Falska negativ måste vara diagnostiserbara, och skälet måste peka på ORSAKEN.
      // Utan impact är `apexY` odefinierad och exkursionen läser ≈ 0, så ett
      // exkursionsskäl på en impact-lös envelope vore en felaktig diagnos — grinden
      // testar därför impact först.
      const result = detectSessionSwings(multi.samples);
      expect(result.rejected.length).toBeGreaterThan(0);
      for (const r of result.rejected) {
        expect(r.reason).toMatch(/^(envelope invalid|no confident impact|clipped tail|vertical excursion|envelope \d|peak speed|downswing|cooldown|wrist visibility|segment too short)/);
        if (r.envelope && !r.envelope.impact) {
          expect(r.reason).not.toMatch(/^vertical excursion/);
        }
      }
    });

    it('session-multi: whole-clip envelope is the silent failure ADR-003 describes', () => {
      // Vaktar PROBLEMFORMULERINGEN, inte lösningen: så länge detta är sant får
      // segmenteringen aldrig tas bort. Utan segmentering svarar detektorn med EN
      // "sving" som spänner över hela sessionen (uppmätt [0.33→56.25], impact 55.66),
      // valid + confident — ett tyst fel över alla tre svingarna.
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
    it('dtl-clipped: an incomplete swing yields nothing', () => {
      const result = detectSessionSwings(clipped.samples);
      expect(result.swings.length).toBe(0);

      // Var i kedjan den stoppas är inte kontraktet — ATT den stoppas är. Efter
      // viktningen faller den redan i grovgallringen (rörelsebursten når inte
      // MIN_BURST_SEC), tidigare nådde den fram till grinden och föll på clippedTail.
      // Båda är rätt svar; asserta därför utfallet, inte vägen dit.
      const whole = detectSwingEnvelope(clipped.samples);
      expect(whole.clippedTail).toBe(true);
      expect(whole.impact).toBeNull();
    });
  }

  const diagFixture = fixtures.get('session-multi') ?? fixtures.get('dtl-full');
  if (diagFixture) {
    it('segmentation diagnostics account for every frame and every burst', () => {
      // Diagnostiken är dev-preview:ns enda fönster in i segmenteringssteget. Om den
      // tappar frames eller burstar ljuger panelen, och då är den värre än ingen panel.
      const seg = segmentSwingCandidates(diagFixture.samples);
      const d = seg.diagnostics;
      expect(d.totalFrames).toBe(diagFixture.samples.length);
      expect(d.quietFrames + d.movingFrames).toBe(d.totalFrames);
      expect(d.bursts.length).toBeGreaterThan(0);

      // Varje burst är antingen admitted ELLER har ett skäl — aldrig tyst bortgallrad.
      for (const b of d.bursts) {
        if (b.admitted) expect(b.culledBy).toBeUndefined();
        else expect(b.culledBy).toBeTruthy();
        expect(b.endSec).toBeGreaterThanOrEqual(b.startSec);
      }
      // Kandidaterna kommer ur de admitted burstarna; sammanslagning kan bara minska.
      const admitted = d.bursts.filter((b) => b.admitted).length;
      expect(admitted).toBeGreaterThanOrEqual(seg.candidates.length);
    });
  }

  it('empty input degrades quietly', () => {
    expect(segmentSwingCandidates([]).candidates).toEqual([]);
    expect(segmentSwingCandidates([]).reason).toBe('too few pose samples');
    expect(detectSessionSwings([]).swings).toEqual([]);
  });
});
