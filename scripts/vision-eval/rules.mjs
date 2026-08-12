// The eight rules this evaluation judges. Five depend on seeing the SHAFT; three depend
// only on the BODY and act as the control group.
//
// Why a control group at all: a shaft rule that disagrees with itself across three runs
// tells us nothing on its own — the frames could simply be hard, or the whole pipeline
// noisy. What we want to know is whether the SHAFT is the thing Vision cannot hold
// steady. The body rules run on the exact same frames, in the exact same request, with
// the same phase spread. If body rules are stable and shaft rules are not, the shaft is
// the variable, and shaft detection of our own is worth building. If both wobble
// equally, the problem is the frames, and shaft detection would not fix it.
//
// These are ordinary `Rule` objects — the same shape the app's rules store holds — so the
// production prompt builder consumes them unchanged. They are NOT written into the app.
//
// `angles` is deliberately left empty on every rule. Production filters rules by camera
// angle before analysing; here we want the face-on and down-the-line answers side by
// side, including the ones production would have filtered out, because "Vision quietly
// guesses when the angle is wrong" is exactly one of the failure modes worth seeing.

/** @typedef {{id: string, title: string, description: string, phase: string, weight: 1|2|3, active: boolean, group: 'shaft'|'body'}} EvalRule */

/** @type {EvalRule[]} */
export const EVAL_RULES = [
  // ── Shaft-dependent (the thing under test) ─────────────────────────────────
  {
    id: 'eval-shaft-plane',
    title: 'Svingplan',
    description:
      'Följer skaftet ett konsekvent svingplan under baksvingen? Jämför skaftets vinkel ' +
      'halvvägs upp i baksvingen med skaftets vinkel vid adress. Godkänt när skaftet ' +
      'ligger på eller nära adressplanet (eller strax ovanför det), underkänt när skaftet ' +
      'tydligt lyfts brantare eller läggs plattare än adressplanet.',
    phase: 'backswing',
    weight: 3,
    active: true,
    group: 'shaft',
  },
  {
    id: 'eval-shaft-p2',
    title: 'Skaftläge P2',
    description:
      'Vid P2 — det ögonblick i baksvingen då ledarmen (vänster arm för högerspelare) är ' +
      'parallell med marken — ska skaftet peka längs mållinjen och vara ungefär parallellt ' +
      'med den. Godkänt när skaftet är parallellt med mållinjen, underkänt när skaftet ' +
      'pekar tydligt utanför eller innanför bollinjen.',
    phase: 'backswing',
    weight: 3,
    active: true,
    group: 'shaft',
  },
  {
    id: 'eval-shaft-top',
    title: 'Skaftläge i toppen (across-the-line / laid-off)',
    description:
      'Vart pekar skaftet i toppen av baksvingen? Godkänt när skaftet är ungefär parallellt ' +
      'med mållinjen. Underkänt vid across-the-line (skaftet pekar höger om målet för en ' +
      'högerspelare) eller laid-off (skaftet pekar vänster om målet).',
    phase: 'top',
    weight: 3,
    active: true,
    group: 'shaft',
  },
  {
    id: 'eval-club-path',
    title: 'Klubbväg i nedsvingen',
    description:
      'Vilken väg tar klubbhuvudet in mot bollen i nedsvingen? Följ klubbhuvudet från ' +
      'toppen ner till bollen. Godkänt när klubban kommer in från insidan eller neutralt, ' +
      'underkänt vid over-the-top (klubban kastas ut utanför handplanet och kommer in ' +
      'brant utifrån).',
    phase: 'downswing',
    weight: 3,
    active: true,
    group: 'shaft',
  },
  {
    id: 'eval-clubface-impact',
    title: 'Klubbladsläge vid impact',
    description:
      'Hur står klubbladet i träffögonblicket? Godkänt när bladet är kvadratiskt mot ' +
      'mållinjen (ledhandens knogar och bladets framkant pekar mot målet), underkänt när ' +
      'bladet är tydligt öppet (pekar höger) eller stängt (pekar vänster) för en ' +
      'högerspelare.',
    phase: 'impact',
    weight: 3,
    active: true,
    group: 'shaft',
  },

  // ── Body-only control group (same frames, same request) ────────────────────
  {
    id: 'eval-head-stability',
    title: 'Huvudet stabilt i baksvingen',
    description:
      'Håller sig huvudet på ungefär samma plats genom baksvingen? Jämför huvudets läge ' +
      'vid adress med läget i toppen. Godkänt vid liten förflyttning, underkänt när ' +
      'huvudet tydligt glider i sidled eller lyfts/sänks markant.',
    phase: 'backswing',
    weight: 2,
    active: true,
    group: 'body',
  },
  {
    id: 'eval-lead-arm',
    title: 'Ledarmen sträckt i toppen',
    description:
      'Är ledarmen (vänster arm för en högerspelare) sträckt i toppen av baksvingen? ' +
      'Godkänt vid rak eller nästan rak arm, underkänt vid tydligt böjd armbåge.',
    phase: 'top',
    weight: 2,
    active: true,
    group: 'body',
  },
  {
    id: 'eval-hip-rotation',
    title: 'Höftrotation i finishen',
    description:
      'Har höften roterat mot målet i finishen? Godkänt när bäckenet är vänt mot målet ' +
      'och vikten står på den främre foten, underkänt när höften fortfarande pekar mot ' +
      'bollen eller vikten hänger kvar bak.',
    phase: 'follow',
    weight: 2,
    active: true,
    group: 'body',
  },
];

/** The rule objects as the production prompt builder wants them (no `group` field). */
export function promptRules() {
  return EVAL_RULES.map(({ group, ...rule }) => rule);
}

export const RULES_BY_ID = new Map(EVAL_RULES.map((r) => [r.id, r]));
