// V-1 — regeluppsättningen som facit sätts mot (docs/eval/v1-facit.md).
//
// Två delar:
//   1. Hela regelbiblioteket, byggt som appen bygger en regel ur biblioteket
//      (src/store/rules.ts → addFromLibrary), men med stabilt id `r-<libraryId>` i stället
//      för uuid, som S-48:s measure.cjs. Texten läses ur RULE_LIBRARY, inte kopierad, så
//      prompten är byte för byte den appen skickar. Att biblioteket inte ändras under
//      facit-arbetet garanteras av `rulesHash` (v1-lib.ts), som fryses i facit-filen.
//   2. Avsiktligt många SKAFTBEROENDE regler. De finns inte i biblioteket och är inte
//      produktregler: de ska visa var Vision brister när domen hänger på skaftets vinkel,
//      vilket är frågan om skaftmått behövs i domarna (BACKLOG V-1, N-3.5). Formulerade
//      som biblioteksreglerna — en mening, observerbar i bild, engelska som biblioteket.
//
// Vinklar: skaftplan och across/laid-off kan bara läsas down-the-line; skaftlutning mot
// målet (forward lean) bara face-on. Samma uppdelning som MEASUREMENT_ASSUMPTIONS i
// packages/core/src/lib/shaft/measure/derived.ts.
//
// Antal per vinkel: DTL 7 + 6 = 13, face-on 9 + 3 = 12. Quick-taket blir 200 + 120·13 =
// 1760 < Workerns 2000 (README S-48 §2), så körningen klipps inte ens om Workern inte är
// deployad med 4096.

import { RULE_LIBRARY, type LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import type { Rule } from '@swingcheck/core/types';

export function ruleFromLibrary(l: LibraryRule): Rule {
  return {
    id: `r-${l.id}`,
    title: l.title,
    description: l.description,
    phase: l.phase,
    weight: l.weight,
    active: true,
    angles: l.angles,
    libraryId: l.id,
    drills: l.drills,
  };
}

/** Skaftberoende eval-regler. Id-prefix `v1-shaft-` så att de aldrig förväxlas med biblioteket. */
export const V1_SHAFT_RULES: Rule[] = [
  // ── Down-the-line: skaftplan ──
  {
    id: 'v1-shaft-plane-address',
    title: 'Shaft plane at address',
    description:
      'At address, an extension of the shaft line points at or just below the belt buckle — not at the chest and not below the thighs.',
    phase: 'address',
    weight: 2,
    active: true,
    angles: ['dtl'],
  },
  {
    id: 'v1-shaft-takeaway-parallel',
    title: 'Shaft parallel to target line at P2',
    description:
      'When the shaft first reaches parallel to the ground in the backswing, it is also parallel to the target line, with the clubhead covering the hands rather than outside or inside them.',
    phase: 'backswing',
    weight: 2,
    active: true,
    angles: ['dtl'],
  },
  {
    id: 'v1-shaft-butt-points-line',
    title: 'Butt end points at target line',
    description:
      'When the lead arm is parallel to the ground in the backswing, an extension of the shaft from the butt end points at the ball-to-target line, not above the ball or between the ball and the feet.',
    phase: 'backswing',
    weight: 2,
    active: true,
    angles: ['dtl'],
  },
  {
    id: 'v1-shaft-top-not-across-laid-off',
    title: 'Shaft on line at top',
    description:
      'At the top, the shaft points parallel to the target line — neither across the line (pointing right of the target) nor laid off (pointing left of it).',
    phase: 'top',
    weight: 3,
    active: true,
    angles: ['dtl'],
  },
  {
    id: 'v1-shaft-downswing-shallow',
    title: 'Shaft shallows in transition',
    description:
      'When the lead arm returns to parallel in the downswing, the shaft is at or flatter than its angle at the same point in the backswing — not steeper.',
    phase: 'downswing',
    weight: 3,
    active: true,
    angles: ['dtl'],
  },
  {
    id: 'v1-shaft-impact-returns-to-address',
    title: 'Shaft returns to address plane at impact',
    description:
      'At impact, the shaft angle relative to the ground is within a few degrees of its address angle — not clearly more upright or flatter.',
    phase: 'impact',
    weight: 2,
    active: true,
    angles: ['dtl'],
  },

  // ── Face-on: skaftlutning ──
  {
    id: 'v1-shaft-lean-address',
    title: 'Shaft lean at address',
    description:
      'At address, the shaft is vertical or leans slightly toward the target (hands even with or just ahead of the clubhead) — not leaning away from the target.',
    phase: 'address',
    weight: 2,
    active: true,
    angles: ['face-on'],
  },
  {
    id: 'v1-shaft-top-not-past-parallel',
    title: 'Shaft not past parallel at top',
    description:
      'At the top, the shaft is at or short of parallel to the ground — the clubhead does not drop below the hands past horizontal.',
    phase: 'top',
    weight: 2,
    active: true,
    angles: ['face-on'],
  },
  {
    id: 'v1-shaft-lean-impact',
    title: 'Forward shaft lean at impact',
    description:
      'At impact, the shaft leans toward the target with the hands ahead of the clubhead — not vertical and not leaning back toward the trail side.',
    phase: 'impact',
    weight: 3,
    active: true,
    angles: ['face-on'],
  },
];

/** Biblioteket först (i biblioteksordning), sedan skaftreglerna. Ordningen ingår i rulesHash. */
export const V1_RULES: Rule[] = [...RULE_LIBRARY.map(ruleFromLibrary), ...V1_SHAFT_RULES];
