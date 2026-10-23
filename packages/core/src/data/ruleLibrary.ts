import type { CameraAngle } from '../lib/cameraAngle';

export interface Drill {
  title: string;
  description: string;
}

export interface LibraryRule {
  id: string;
  title: string;
  description: string;
  phase: 'address' | 'backswing' | 'top' | 'downswing' | 'impact' | 'follow';
  weight: 1 | 2 | 3;
  /** Camera angles this rule can be verified from. */
  angles: CameraAngle[];
  drills: Drill[];
}

export const RULE_LIBRARY: LibraryRule[] = [
  // ── Address ──
  {
    id: 'lib-weight-distribution',
    title: 'Weight distribution',
    description: 'Weight evenly distributed, knees slightly flexed.',
    phase: 'address',
    weight: 2,
    angles: ['face-on'],
    drills: [
      {
        title: 'Athletic landing drill',
        description:
          'Stand without club, jump slightly and land in athletic position. Repeat 10x to find natural balance.',
      },
    ],
  },
  {
    id: 'lib-ball-position',
    title: 'Ball position',
    description: 'Ball in line with left heel for driver.',
    phase: 'address',
    weight: 2,
    angles: ['face-on'],
    drills: [
      {
        title: 'Alignment stick drill',
        description:
          'Place two alignment sticks on ground to mark ball position and stance. Rehearse setup 20x.',
      },
    ],
  },
  {
    id: 'lib-spine-angle',
    title: 'Spine angle',
    description: 'Neutral spine, not rounded.',
    phase: 'address',
    weight: 2,
    angles: ['dtl'],
    drills: [
      {
        title: 'Club-on-spine check',
        description:
          'Hold club against spine while bending into setup. Check in mirror that club touches head, upper back and tailbone.',
      },
    ],
  },
  {
    id: 'lib-grip',
    title: 'Grip',
    description: 'Left hand showing 2-3 knuckles.',
    phase: 'address',
    weight: 2,
    angles: ['face-on'],
    drills: [
      {
        title: 'Grip-only routine',
        description:
          'Practice grip-only routine before each session. Check in mirror.',
      },
    ],
  },

  // ── Backswing ──
  {
    id: 'lib-connected-takeaway',
    title: 'Connected takeaway',
    description: 'Hands pass right thigh without arms lifting from body.',
    phase: 'backswing',
    weight: 2,
    angles: ['dtl'],
    drills: [
      {
        title: 'Headcover under armpit',
        description:
          'Place headcover under right armpit. Make takeaway without dropping it.',
      },
    ],
  },
  {
    id: 'lib-shoulder-rotation',
    title: 'Shoulder rotation',
    description: 'Left shoulder rotates under chin at top.',
    phase: 'backswing',
    weight: 3,
    angles: ['face-on', 'dtl'],
    drills: [
      {
        title: 'Cross-arm rotation',
        description:
          'Cross arms on chest, rotate until left shoulder touches chin. Repeat 20x.',
      },
    ],
  },
  {
    id: 'lib-right-knee-stability',
    title: 'Right knee stability',
    description: 'Right knee maintains flex throughout backswing.',
    phase: 'backswing',
    weight: 2,
    angles: ['face-on'],
    drills: [
      {
        title: 'Ball under arch',
        description:
          'Place ball under right foot arch. Maintain pressure on ball during backswing.',
      },
    ],
  },
  {
    id: 'lib-club-alignment-top',
    title: 'Club alignment at top',
    description: 'Clubhead parallel to target line at top.',
    phase: 'backswing',
    weight: 2,
    angles: ['dtl'],
    drills: [
      {
        title: 'Slow-motion mirror check',
        description:
          'Slow-motion swings stopping at top. Check position in mirror or with camera.',
      },
    ],
  },

  // ── Downswing ──
  {
    id: 'lib-hip-initiation',
    title: 'Hip initiation',
    description: 'Hips lead downswing before arms move.',
    phase: 'downswing',
    weight: 3,
    angles: ['face-on'],
    drills: [
      {
        title: 'Feet together drill',
        description:
          'Make swings with feet together. Forces proper sequencing.',
      },
    ],
  },
  {
    id: 'lib-inside-path',
    title: 'Inside path',
    description: 'Hands drop inside rather than over the ball.',
    phase: 'downswing',
    weight: 2,
    angles: ['dtl'],
    drills: [
      {
        title: 'Headcover gate drill',
        description:
          'Place headcover just outside ball. Practice swinging without hitting it.',
      },
    ],
  },

  // ── Impact ──
  {
    id: 'lib-forward-shaft-lean',
    title: 'Forward shaft lean',
    description: 'Hands ahead of ball at contact.',
    phase: 'impact',
    weight: 3,
    angles: ['dtl'],
    drills: [
      {
        title: 'Punch shot drill',
        description:
          'Hit punch shots with conscious forward press. Focus on hands-first contact.',
      },
    ],
  },
  {
    id: 'lib-stable-left-side',
    title: 'Stable left side',
    description: 'Left side extended and stable at impact.',
    phase: 'impact',
    weight: 2,
    angles: ['face-on'],
    drills: [
      {
        title: 'Left arm only swings',
        description:
          'Left arm only swings. Feel the left side bracing through impact.',
      },
    ],
  },

  // ── Follow-through ──
  {
    id: 'lib-full-rotation-finish',
    title: 'Full rotation finish',
    description: 'Chest pointing at target in finish.',
    phase: 'follow',
    weight: 2,
    angles: ['face-on', 'dtl'],
    drills: [
      {
        title: 'Hold finish drill',
        description:
          'Hold finish position for 3 seconds every swing. Check chest direction.',
      },
    ],
  },
  {
    id: 'lib-weight-transfer',
    title: 'Weight transfer',
    description: '90%+ weight on left foot in finish.',
    phase: 'follow',
    weight: 2,
    angles: ['face-on'],
    drills: [
      {
        title: 'Right foot lift',
        description:
          'Practice lifting right foot completely off ground at finish.',
      },
    ],
  },
];
