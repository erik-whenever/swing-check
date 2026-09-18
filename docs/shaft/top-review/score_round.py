# ONE-OFF, READ-ONLY (S-32): score the blind top round. WRITES NOTHING BUT STDOUT.
#
#   <venv>/python.exe docs/shaft/top-review/score_round.py <poseDir> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section controls|a|b|c|covariates|all]
#
# <poseDir> is the output of docs/shaft/top-from-pose/run_pose.py -- the same wrist
# trajectories S-31 measured on. This script does not run MediaPipe and does not re-decode a
# frame; if the pose dir is missing, rerun that script, do not approximate it here.
#
# WHAT IT MEASURES, KEPT APART. Three questions, three sections, no blending:
#   (a) Erik against Lisa -- the HUMAN span in frames. Two people who cannot agree within k
#       frames put a floor under what any estimator can be asked to do, and S-31 had no such
#       floor: it scored E3 against one person's interval and called the remainder error.
#   (b) each estimator against each annotator, separately. Never against a merged "truth":
#       merging two annotators into one answer invents an agreement neither of them gave.
#   (c) E3's systematic offset. Today it sits 1-2 frames early in 5 of 6 rows. A CONSTANT
#       offset is a calibration; a SPREADING one is noise wearing a median. The two are
#       distinguished here by leave-one-clip-out: fit the shift on every clip but one, apply
#       it to the held-out clip, and see whether it still helps. Fitting the shift and
#       reporting its own improvement would only measure that arithmetic works.
#
# THE UNIT IS THE CLIP, NOT THE ROW. 103 swings live in 81 clips; 093.mp4 alone carries two
# of S-31's six judged tops. Every headline number is the median over CLIPS of the per-clip
# median, with the per-row number printed beside it so the difference is visible rather than
# claimed. n is always given as rows AND clips.
#
# `osaker` IS A THIRD CATEGORY, never a miss and never a hit -- the same rule
# docs/shaft/phase-audit/README.md set and docs/shaft/across-sign-result.md followed. An
# interval nobody could draw is not an interval an estimator failed to hit.
#
# NO THRESHOLD IS SET HERE, and no production code is read or written.
# src/lib/shaft/measure/, NEAR_VERTICAL_GATE_DEG, ON_PLANE_BAND_DEG and the sign convention
# are untouched. This script reports distances; deciding what distance is good enough is a
# separate decision on a separate day.
import argparse
import ast
import collections
import json
import statistics as st
from pathlib import Path

ROOT = Path.cwd()
ANALYZE = ROOT / 'docs' / 'shaft' / 'top-from-pose' / 'analyze_pose.py'

# The estimator helpers lifted out of S-31's analysis, by name.
WANTED = ['med', 'q', 'env_frames', 'mid', 'smooth', 'track',
          'e1_highest', 'speed_series', 'e2_slowest', 'vy_series', 'e3_signflip', 'EST']


def load_estimators():
    """E1/E2/E3 exactly as S-31 pre-registered them, taken from analyze_pose.py itself.

    Not re-implemented and not copied. A copy drifts, and a drifted estimator scored against
    a fresh key would report a difference that is really an edit. analyze_pose.py parses
    argv and loads a pose dir at import time, so it cannot simply be imported; instead its
    module is parsed and only the named pure functions are kept, compiled and executed. If a
    name has moved or been renamed there, this STOPS rather than silently scoring something
    else.
    """
    tree = ast.parse(ANALYZE.read_text(encoding='utf-8'), filename=str(ANALYZE))
    keep = []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            keep.append(node)
        elif isinstance(node, ast.FunctionDef) and node.name in WANTED:
            keep.append(node)
        elif isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id in WANTED for t in node.targets):
            keep.append(node)
    ns = {}
    exec(compile(ast.Module(body=keep, type_ignores=[]), str(ANALYZE), 'exec'), ns)
    missing = [n for n in WANTED if n not in ns]
    if missing:
        raise SystemExit('analyze_pose.py no longer defines: %s -- S-31 and S-32 would be '
                         'scoring different estimators' % ', '.join(missing))
    return ns


# -- small statistics ---------------------------------------------------------

def median(xs):
    return st.median(xs) if xs else None


def pct(xs, f):
    if not xs:
        return None
    s = sorted(xs)
    return s[min(len(s) - 1, int(f * len(s)))]


def mad(xs):
    """Median absolute deviation from the median -- spread that one bad row cannot set."""
    if not xs:
        return None
    m = st.median(xs)
    return st.median([abs(x - m) for x in xs])


def by_clip(pairs):
    """[(clip, value)] -> the per-clip medians. The clip is the independent unit: two swings
    out of one video are one observation of one golfer, one camera and one lighting."""
    groups = collections.defaultdict(list)
    for clip, value in pairs:
        groups[clip].append(value)
    return {c: st.median(v) for c, v in groups.items()}


def summary(pairs, label, unit='rutor'):
    """One line per measure, rows and clips side by side, absolute and signed both shown."""
    if not pairs:
        print('  %-34s  --  inget underlag' % label)
        return
    rows = [v for _, v in pairs]
    clips = list(by_clip(pairs).values())
    print('  %-34s  rader n=%-3d median %+.1f  |median| %.1f  p90 %.1f  max %.1f'
          % (label, len(rows), median(rows), median([abs(v) for v in rows]),
             pct([abs(v) for v in rows], 0.9), max(abs(v) for v in rows)))
    print('  %-34s  klipp n=%-3d median %+.1f  |median| %.1f  (%s)'
          % ('', len(clips), median(clips), median([abs(v) for v in clips]), unit))


# -- the round ----------------------------------------------------------------

def read_answers(path):
    doc = json.loads(Path(path).read_text(encoding='utf-8'))
    if doc.get('round') != 'S-32':
        raise SystemExit('%s is not an S-32 answer file' % path)
    return doc['annotator'], {a['id']: a for a in doc['answers']}


def interval(a):
    """The judged interval as 1-based frame indices, or None for `osaker`/unanswered.

    `unsure` wins over a half-filled interval: a bound set and then doubted is not an answer.
    """
    if not a or a.get('unsure') or a.get('first') is None or a.get('last') is None:
        return None
    return (int(a['first']), int(a['last']))


def to_index(times, t):
    """A time in seconds -> the nearest envelope frame index, 1-based, or None."""
    if t is None or not times:
        return None
    return 1 + min(range(len(times)), key=lambda k: abs(times[k] - t))


def point_to_interval(p, iv):
    """Signed distance in frames from a point to an interval: 0 inside, + after, - before.
    Same convention as docs/shaft/top-from-pose.md, so the two rounds' numbers compare."""
    lo, hi = iv
    if lo <= p <= hi:
        return 0
    return p - hi if p > hi else p - lo


def interval_gap(x, y):
    """Signed gap between two intervals: 0 when they overlap, + when y lies after x."""
    if x[1] >= y[0] and y[1] >= x[0]:
        return 0
    return y[0] - x[1] if y[0] > x[1] else y[1] - x[0]


def nearest_export_index(swing, frame_index):
    """Which exported envelope frame a judged frame index is nearest.

    The controls' answer sits on the sparse export grid (up to 7 frames per swing), not on
    the video grid, so `did the annotator pick the same EXPORTED frame` is the only control
    question that grid can answer -- and it needs no tolerance, so it sets no threshold.
    """
    t = swing['frameTimes'][frame_index - 1]
    ef = sorted(swing['exportFrames'], key=lambda f: f['tSec'])
    return min(range(len(ef)), key=lambda k: abs(ef[k]['tSec'] - t)), [f['id'] for f in ef]


# -- (controls) ---------------------------------------------------------------

def section_controls(reg, answers):
    """The round's own error bar, reported BEFORE anything about the estimators.

    S-23's rule, unchanged: if the annotators miss the controls, the rest of the round is
    measuring the annotator and the estimator numbers below must not be read.
    """
    print('\n=== KONTROLLER -- omgangens eget felmatt (las detta forst) ===')
    print('En kontroll ar en sving dar en CVAT-annotator markt exakt en exporterad')
    print('envelope-bildruta som `top` och alla pass som rort den ar ense. Traff = samma')
    print('exporterade bildruta ar narmast bedomarens intervall.')
    controls = [s for s in reg['swings'] if s['isControl']]
    print('  %d kontrollsvingar i %d klipp (av %d svingar i %d klipp)'
          % (len(controls), len({s['clip'] for s in controls}),
             reg['swingCount'], reg['clipCount']))
    for name, a in answers.items():
        hits, miss, unsure, offs = 0, 0, 0, []
        for s in controls:
            iv = interval(a.get(s['id']))
            if iv is None:
                unsure += 1
                continue
            lo_i, ids = nearest_export_index(s, iv[0])
            hi_i, _ = nearest_export_index(s, iv[1])
            want = ids.index(s['control']['frame'])
            span = range(min(lo_i, hi_i), max(lo_i, hi_i) + 1)
            if want in span:
                hits += 1
                offs.append((s['clip'], 0))
            else:
                miss += 1
                offs.append((s['clip'], (span.start - want) if span.start > want
                             else (span.stop - 1 - want)))
        print('  %-6s ratt %d / fel %d / osaker-eller-tomt %d  (av %d)'
              % (name, hits, miss, unsure, len(controls)))
        summary(offs, '%s: avstand i exportrutor' % name, 'exportrutor')
    print('  Missar bedomarna kontrollerna ska siffrorna nedan inte tolkas.')


# -- (a) Erik against Lisa ----------------------------------------------------

def section_a(reg, answers):
    print('\n=== (a) ERIK MOT LISA -- det manskliga spannet ===')
    if len(answers) < 2:
        print('  kraver tva svarsfiler')
        return
    (n1, a1), (n2, a2) = list(answers.items())
    gaps, mids, widths = [], [], {n1: [], n2: []}
    overlap, both, only_one_unsure, both_unsure = 0, 0, 0, 0
    union = []
    for s in reg['swings']:
        i1, i2 = interval(a1.get(s['id'])), interval(a2.get(s['id']))
        for name, iv in ((n1, i1), (n2, i2)):
            if iv:
                widths[name].append((s['clip'], iv[1] - iv[0] + 1))
        if i1 is None and i2 is None:
            both_unsure += 1
            continue
        if i1 is None or i2 is None:
            only_one_unsure += 1
            continue
        both += 1
        g = interval_gap(i1, i2)
        gaps.append((s['clip'], g))
        if g == 0:
            overlap += 1
        mids.append((s['clip'], ((i2[0] + i2[1]) / 2) - ((i1[0] + i1[1]) / 2)))
        union.append((s['clip'], max(i1[1], i2[1]) - min(i1[0], i2[0]) + 1))
    print('  bada gav ett intervall: %d svingar i %d klipp; en osaker: %d; bada osakra: %d'
          % (both, len({c for c, _ in gaps}), only_one_unsure, both_unsure))
    print('  intervallen overlappar i %d av %d (%.0f %%)'
          % (overlap, both, 100 * overlap / both if both else 0))
    for name in (n1, n2):
        summary(widths[name], '%s: egen intervallbredd' % name)
    summary(union, 'union av bada (manskligt spann)')
    summary(gaps, 'glapp mellan intervallen (%s->%s)' % (n1, n2))
    summary(mids, 'mittpunktsskillnad (%s->%s)' % (n1, n2))
    print('  Ett systematiskt tecken i mittpunktsskillnaden ar tva personer som laser')
    print('  toppen olika, inte brus -- sag det, satt ingen korrigering pa det.')


# -- (b) estimators against each annotator ------------------------------------

def estimator_choices(reg, pose_dir, est):
    """{swing id: {E1/E2/E3: frame index}} -- computed HERE, after the answers are in.

    Nothing upstream of this function has ever held an estimator choice: build_round.py does
    not import this module and the registry carries no estimate. That is what makes the
    round blind rather than merely unlabelled.
    """
    out = {}
    missing = []
    for s in reg['swings']:
        p = Path(pose_dir) / ('%s.json' % s['swing'])
        if not p.exists():
            missing.append(s['swing'])
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        out[s['id']] = {name: to_index(s['frameTimes'], fn(d, {}))
                        for name, fn in est['EST'].items()}
    if missing:
        print('  VARNING: %d svingar saknar posebana och utesluts: %s'
              % (len(missing), ', '.join(missing[:5]) + (' ...' if len(missing) > 5 else '')))
    return out


def section_b(reg, answers, choices):
    print('\n=== (b) VARJE ESTIMATOR MOT VARDERA ANNOTATOREN ===')
    print('Avstand i envelope-bildrutor till bedomarens intervall; 0 = inne i intervallet.')
    by_id = {s['id']: s for s in reg['swings']}
    for name, a in answers.items():
        print('  -- mot %s --' % name)
        for est_name in ('E1', 'E2', 'E3'):
            dists, inside, novalue, unsure = [], 0, 0, 0
            for sid, ch in choices.items():
                iv = interval(a.get(sid))
                if iv is None:
                    unsure += 1
                    continue
                p = ch.get(est_name)
                if p is None:
                    novalue += 1
                    continue
                d = point_to_interval(p, iv)
                dists.append((by_id[sid]['clip'], d))
                if d == 0:
                    inside += 1
            print('    %s: inne i intervallet %d av %d rader; inget val %d; osaker %d'
                  % (est_name, inside, len(dists), novalue, unsure))
            summary(dists, '%s mot %s' % (est_name, name))


# -- (c) E3's systematic offset -----------------------------------------------

def section_c(reg, answers, choices):
    print('\n=== (c) E3:s SYSTEMATISKA FORSKJUTNING -- konstant eller spridd? ===')
    print('Idag: 1-2 rutor fore i 5 av 6 rader (docs/shaft/top-from-pose.md). Fragan ar om')
    print('den forskjutningen ar EN kalibrering eller ett brus som bar en median.')
    by_id = {s['id']: s for s in reg['swings']}
    for name, a in answers.items():
        pairs = []
        for sid, ch in choices.items():
            iv = interval(a.get(sid))
            if iv is None or ch.get('E3') is None:
                continue
            pairs.append((by_id[sid]['clip'], point_to_interval(ch['E3'], iv), ch['E3'], iv))
        if not pairs:
            print('  %-6s inget underlag' % name)
            continue
        d = [x[1] for x in pairs]
        nonzero = [x for x in d if x != 0]
        clips = sorted({c for c, *_ in pairs})
        print('  -- mot %s: %d rader i %d klipp --' % (name, len(d), len(clips)))
        print('     median %+.1f  MAD %.1f  IQR %.1f..%.1f  p10..p90 %.1f..%.1f'
              % (median(d), mad(d), pct(d, 0.25), pct(d, 0.75), pct(d, 0.10), pct(d, 0.90)))
        if nonzero:
            neg = sum(1 for x in nonzero if x < 0)
            print('     av de %d rader som INTE ligger inne: %d fore, %d efter '
                  '(%.0f %% at samma hall)'
                  % (len(nonzero), neg, len(nonzero) - neg,
                     100 * max(neg, len(nonzero) - neg) / len(nonzero)))
        clip_med = by_clip([(c, v) for c, v, *_ in pairs])
        shift = st.median(list(clip_med.values()))
        raw_hits = sum(1 for x in d if x == 0)
        naive = sum(1 for _, _, p, iv in pairs
                    if point_to_interval(p - round(shift), iv) == 0)
        print('     naiv skiftning med klippmedianen %+.0f rutor: traff %d -> %d av %d'
              % (shift, raw_hits, naive, len(d)))
        # Leave-one-clip-out: the shift a clip is judged by is fitted WITHOUT that clip.
        # A constant offset survives this; a median over noise does not.
        loco_hits, loco_dist = 0, []
        for clip in clips:
            others = [v for c, v in clip_med.items() if c != clip]
            if not others:
                continue
            s_i = round(st.median(others))
            for c, _, p, iv in pairs:
                if c != clip:
                    continue
                dd = point_to_interval(p - s_i, iv)
                loco_dist.append((c, dd))
                if dd == 0:
                    loco_hits += 1
        print('     LOCO (skift anpassat utan det egna klippet): traff %d -> %d av %d'
              % (raw_hits, loco_hits, len(loco_dist)))
        summary([(c, v) for c, v, *_ in pairs], 'E3 mot %s, oskiftad' % name)
        summary(loco_dist, 'E3 mot %s, LOCO-skiftad' % name)
        print('     Konstant forskjutning: LOCO lyfter traffen och spridningen kryper ihop.')
        print('     Spridd: LOCO lyfter lite eller inget, och MAD star kvar.')
        print('     Ingen av utfallen satter en tröskel har -- de beskriver bara vilket det ar.')
        # The old n = 6, recomputed on the same rows, for continuity with S-31 and for
        # nothing else: six rows in five clips did not carry a claim then and do not now.
        priors = [(by_id[sid]['clip'], point_to_interval(ch['E3'], interval(a.get(sid))))
                  for sid, ch in choices.items()
                  if by_id[sid]['priorJudgement'] and ch.get('E3') is not None
                  and interval(a.get(sid))]
        if priors:
            summary(priors, 'E3 pa S-31:s sex svingar (gammal n)')


# -- covariates ---------------------------------------------------------------

def section_covariates(reg, answers, choices):
    """Registered but never shown to the annotator: camera angle, fps, slow-mo, suspected
    mirroring, source. Broken out here, descriptively, because S-31 could not: all 32 of its
    judged rows were `dtl` by construction, so face-on had no key at all.

    Handedness is still `unknown` for every swing -- it is not in the data model
    (docs/shaft/STATUS.md section 4). The column exists so this split can be run the day
    somebody measures it; it is not guessed from the image here.
    """
    print('\n=== KOVARIATER -- registrerade, aldrig visade for bedomaren ===')
    by_id = {s['id']: s for s in reg['swings']}
    splits = [
        ('kameravinkel', lambda s: s['viewBucket']),
        ('slow-mo', lambda s: 'slowmo' if s['slowmo'] else 'normal'),
        ('kalla', lambda s: s['source']),
        ('spegelvand', lambda s: 'bekraftad' if s['mirrored'].startswith('confirmed') else 'okand'),
        ('sakert nedslag', lambda s: 'ja' if s['hasConfidentImpact'] else 'nej'),
        ('fps', lambda s: '%.0f' % s['fps'] if s['fps'] else 'okand'),
        ('handighet', lambda s: s['handedness'].split(' ')[0]),
    ]
    for label, key in splits:
        print('  -- %s --' % label)
        buckets = collections.defaultdict(list)
        for s in reg['swings']:
            buckets[key(s)].append(s)
        for value, rows in sorted(buckets.items()):
            line = '    %-10s %3d svingar i %2d klipp' % (
                value, len(rows), len({s['clip'] for s in rows}))
            for name, a in answers.items():
                d = [(s['clip'], point_to_interval(choices[s['id']]['E3'], interval(a.get(s['id']))))
                     for s in rows
                     if s['id'] in choices and interval(a.get(s['id']))
                     and choices[s['id']].get('E3') is not None]
                m = median([abs(v) for _, v in d]) if d else None
                line += '   %s: |E3| %s (n=%d)' % (
                    name, '%.1f' % m if m is not None else '--', len(d))
            print(line)
    print('  Grupperna ar smaa och konfunderade med kallan (102 av 103 svingar ar `web`).')
    print('  Talen ar beskrivande. En skillnad har ar en fraga, inte ett fynd.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path,
                    help='output dir of docs/shaft/top-from-pose/run_pose.py')
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all',
                    help='controls | a | b | c | covariates | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = read_answers(p)
        if name in answers:
            raise SystemExit('two answer files claim to be %s' % name)
        answers[name] = rows
    print('S-32: %d svingar i %d klipp, %d envelope-bildrutor; fron %s'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount'], reg['seeds']))
    print('svarsfiler: ' + ', '.join(answers))

    est = load_estimators()
    choices = None
    if args.section in ('all', 'b', 'c', 'covariates'):
        choices = estimator_choices(reg, args.poseDir, est)

    if args.section in ('all', 'controls'):
        section_controls(reg, answers)
    if args.section in ('all', 'a'):
        section_a(reg, answers)
    if args.section in ('all', 'b'):
        section_b(reg, answers, choices)
    if args.section in ('all', 'c'):
        section_c(reg, answers, choices)
    if args.section in ('all', 'covariates'):
        section_covariates(reg, answers, choices)


if __name__ == '__main__':
    main()
