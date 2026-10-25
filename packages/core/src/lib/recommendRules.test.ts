import { describe, it, expect } from 'vitest';
import {
  recommendRules,
  accuracyVerdict,
  LEVEL_PROFILE,
  ACCURACY_GATE,
  type PlayerLevel,
  type RuleAccuracyMap,
} from './recommendRules';
import { RULE_LIBRARY } from '../data/ruleLibrary';
import { CAMERA_ANGLES, ruleMatchesAngle } from './cameraAngle';

const LEVELS: PlayerLevel[] = ['beginner', 'intermediate', 'advanced'];
const ids = (r: ReturnType<typeof recommendRules>) => r.map((x) => x.libraryId);
const byId = (id: string) => RULE_LIBRARY.find((r) => r.id === id)!;
const pass = { accuracy: 0.95, confidentErrorRate: 0, samples: 30 };
const fail = { accuracy: 0.5, confidentErrorRate: 0.3, samples: 30 };

describe('recommendRules', () => {
  it('nybörjare face-on: en regel per fas, uppställning och finish först', () => {
    expect(ids(recommendRules({ angle: 'face-on', level: 'beginner' }))).toEqual([
      'lib-weight-distribution',
      'lib-full-rotation-finish',
      'lib-shoulder-rotation',
    ]);
  });

  it('nybörjare DTL', () => {
    expect(ids(recommendRules({ angle: 'dtl', level: 'beginner' }))).toEqual([
      'lib-spine-angle',
      'lib-full-rotation-finish',
      'lib-shoulder-rotation',
    ]);
  });

  it('ger aldrig en regel som inte kan bedömas från vinkeln, och håller nivåns tak', () => {
    for (const angle of CAMERA_ANGLES) {
      for (const level of LEVELS) {
        const out = recommendRules({ angle, level });
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(LEVEL_PROFILE[level].maxRules);
        expect(new Set(ids(out)).size).toBe(out.length);
        for (const r of out) {
          expect(ruleMatchesAngle(byId(r.libraryId), angle)).toBe(true);
          expect(r.reasons).toContain('angle-match');
        }
      }
    }
  });

  it('är deterministisk', () => {
    const a = recommendRules({ angle: 'dtl', level: 'intermediate', goalPhase: 'impact' });
    const b = recommendRules({ angle: 'dtl', level: 'intermediate', goalPhase: 'impact' });
    expect(a).toEqual(b);
  });

  it('avancerad startar i nedsving och impact', () => {
    const out = ids(recommendRules({ angle: 'face-on', level: 'advanced' }));
    expect(out.slice(0, 2)).toEqual(['lib-hip-initiation', 'lib-stable-left-side']);
  });

  it('mål-fasens regler hamnar först och märks', () => {
    const out = recommendRules({ angle: 'face-on', level: 'beginner', goalPhase: 'impact' });
    expect(out[0].libraryId).toBe('lib-stable-left-side');
    expect(out[0].reasons[0]).toBe('goal-phase');
  });

  it('utan V-1-data är allt med men märkt ej validerat', () => {
    const out = recommendRules({ angle: 'dtl', level: 'advanced' });
    expect(out.every((r) => r.validation === 'unvalidated')).toBe(true);
  });

  it('V-1-underkända regler utesluts; godkända går före okända', () => {
    const accuracy: RuleAccuracyMap = {
      'lib-weight-distribution': fail,
      'lib-hip-initiation': pass,
    };
    const out = recommendRules({ angle: 'face-on', level: 'beginner', accuracy });
    expect(ids(out)).not.toContain('lib-weight-distribution');
    expect(out[0]).toMatchObject({ libraryId: 'lib-hip-initiation', validation: 'validated' });
    expect(out.slice(1).every((r) => r.validation === 'unvalidated')).toBe(true);
  });

  it('fyller taket när faserna inte räcker', () => {
    const lib = RULE_LIBRARY.filter((r) => r.phase === 'address');
    const out = recommendRules({ angle: 'face-on', level: 'intermediate', library: lib });
    expect(ids(out)).toEqual(['lib-weight-distribution', 'lib-ball-position', 'lib-grip']);
    expect(out[1].reasons).not.toContain('level-phase-priority');
  });

  it('tom rekommendation om V-1 underkänt allt — ingen gissning', () => {
    const accuracy = Object.fromEntries(RULE_LIBRARY.map((r) => [r.id, fail]));
    expect(recommendRules({ angle: 'dtl', level: 'beginner', accuracy })).toEqual([]);
  });
});

describe('accuracyVerdict', () => {
  it('okänd utan mätning eller med för få mätningar', () => {
    expect(accuracyVerdict(undefined)).toBe('unknown');
    expect(accuracyVerdict({ ...pass, samples: ACCURACY_GATE.minSamples - 1 })).toBe('unknown');
  });

  it('kräver både träffsäkerhet och få självsäkra fel', () => {
    expect(accuracyVerdict(pass)).toBe('pass');
    expect(accuracyVerdict({ ...pass, confidentErrorRate: 0.2 })).toBe('fail');
    expect(accuracyVerdict({ ...pass, accuracy: 0.7 })).toBe('fail');
  });
});
