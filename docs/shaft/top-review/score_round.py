# ONE-OFF, READ-ONLY (S-32): score the blind top round. WRITES NOTHING BUT STDOUT.
#
#   <venv>/python.exe docs/shaft/top-review/score_round.py <poseDir> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \n#       [--restrict <answer file: score only the ids it holds>] \
#       [--section controls|a|b|c|silence|covariates|pass2|all]
#
# `pass2` is separate from `all` and needs a DIFFERENT pair of --answers: Erik's pass-1 file
# and his pass-2 file (docs/shaft/top-review/build_pass2.py), not Erik-and-Lisa, e.g.:
#   ... --answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-erik-pass2.json \
#       --section pass2
# It computes no estimator choice and is unaffected by --section all.
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
#   (silence) whether E3 is worst exactly where the people hesitated -- unsure, disagreeing
#       or wide. Cut on the ANSWERS only, never on the estimator, and it proposes no rule:
#       it measures whether a rule would have anything to stand on.
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

def control_outcome(swing, ans):
    """One control swing, one annotator: ('hit'|'miss'|'unsure', offset in export frames).

    Lifted out of section_controls so the main round, pass 2 and the drift split below all
    score a control the same way. `unsure` stays a third category: never a hit, never a miss.
    """
    iv = interval(ans)
    if iv is None:
        return 'unsure', None
    lo_i, ids = nearest_export_index(swing, iv[0])
    hi_i, _ = nearest_export_index(swing, iv[1])
    want = ids.index(swing['control']['frame'])
    span = range(min(lo_i, hi_i), max(lo_i, hi_i) + 1)
    if want in span:
        return 'hit', 0
    return 'miss', (span.start - want) if span.start > want else (span.stop - 1 - want)


def thirds(ans):
    """{swing id: 0|1|2} by the annotator's OWN order -- each annotator saw a different
    shuffle, so `late in the round` means a different set of swings for each of them."""
    order = {sid: a.get('order') for sid, a in ans.items() if a.get('order') is not None}
    n = len(order)
    return {sid: (0 if o <= n / 3 else (1 if o <= 2 * n / 3 else 2))
            for sid, o in order.items()}


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
    by_id = {s['id']: s for s in reg['swings']}
    print('  %d kontrollsvingar i %d klipp (av %d svingar i %d klipp)'
          % (len(controls), len({s['clip'] for s in controls}),
             reg['swingCount'], reg['clipCount']))
    missed = {}
    for name, a in answers.items():
        hits, miss, unsure, offs = 0, 0, 0, []
        missed[name] = []
        for s in controls:
            out, off = control_outcome(s, a.get(s['id']))
            if out == 'unsure':
                unsure += 1
                continue
            offs.append((s['clip'], off))
            if out == 'hit':
                hits += 1
            else:
                miss += 1
                missed[name].append(s)
        print('  %-6s ratt %d / fel %d / osaker-eller-tomt %d  (av %d)'
              % (name, hits, miss, unsure, len(controls)))
        summary(offs, '%s: avstand i exportrutor' % name, 'exportrutor')
        print('    missade kontroller (klipp): %s'
              % (', '.join('%s/%s' % (s['clip'].replace('.mp4', ''), s['id'])
                           for s in missed[name]) or '--'))

    # -- same controls, or different ones? The question the annotator-vs-material split
    # turns on: shared misses are the material, private misses are the person.
    if len(answers) >= 2:
        names = list(answers)
        sets = {n: {s['id'] for s in missed[n]} for n in names}
        shared = set.intersection(*sets.values())
        print('  -- missade kontroller: samma svingar eller olika? --')
        print('  missade av alla %d bedomare: %s'
              % (len(names), ', '.join(sorted(by_id[i]['clip'].replace('.mp4', '')
                                              for i in shared)) or '--'))
        for n in names:
            only = sets[n] - set.union(*[sets[m] for m in names if m != n])
            print('  bara %-6s: %s'
                  % (n, ', '.join(sorted(by_id[i]['clip'].replace('.mp4', '')
                                         for i in only)) or '--'))

    # -- drift over the annotator's own order: tiredness leaves a slope, material does not.
    print('  -- drift over egen ordning (tredjedelar av den egna blandningen) --')
    for name, a in answers.items():
        th = thirds(a)
        for t in (0, 1, 2):
            ids = [sid for sid, k in th.items() if k == t]
            hits = sum(1 for sid in ids if sid in {s['id'] for s in controls}
                       and control_outcome(by_id[sid], a[sid])[0] == 'hit')
            ctrl = [sid for sid in ids if by_id[sid]['isControl']]
            miss = sum(1 for sid in ctrl if control_outcome(by_id[sid], a[sid])[0] == 'miss')
            uns = sum(1 for sid in ids if a[sid].get('unsure'))
            widths = [interval(a[sid])[1] - interval(a[sid])[0] + 1
                      for sid in ids if interval(a[sid])]
            print('  %-6s tredjedel %d: %2d svingar, osaker %2d (%4.1f %%); kontroller '
                  '%2d: ratt %2d fel %2d osaker %2d; bredd median %.1f'
                  % (name, t + 1, len(ids), uns, 100 * uns / len(ids) if ids else 0,
                     len(ctrl), hits, miss, len(ctrl) - hits - miss,
                     median(widths) if widths else float('nan')))
    print('  Missar bedomarna kontrollerna ska siffrorna nedan inte tolkas.')


# -- (a) Erik against Lisa ----------------------------------------------------

# `bred` below is Erik's own p90 in pass 1 (4 frames), not a quality threshold and not a
# decision: it names the subset his own hand marked as hard, so the pair distance can be read
# separately there. Widths are frames, inclusive of both bounds.
WIDE = 4


def mid(iv):
    return (iv[0] + iv[1]) / 2


def inside(point, iv):
    return iv[0] <= point <= iv[1]


def pair_block(label, rows, n1, n2):
    """One subset of the Erik/Lisa pairs: agreement counted the three ways that differ.

    Overlapping at all is the weakest claim, midpoint inside the other's interval the
    strongest one either annotator can make about the other; the midpoint distance is the
    number, and it is reported as rows AND clips like everything else.
    """
    if not rows:
        print('  -- %s: inget underlag --' % label)
        return
    clips = {r['clip'] for r in rows}
    ov = sum(1 for r in rows if r['gap'] == 0)
    i12 = sum(1 for r in rows if inside(mid(r['i1']), r['i2']))
    i21 = sum(1 for r in rows if inside(mid(r['i2']), r['i1']))
    print('  -- %s: %d svingar i %d klipp --' % (label, len(rows), len(clips)))
    print('     overlappar alls %d (%.0f %%); %s mittpunkt inne hos %s %d (%.0f %%); '
          '%s mittpunkt inne hos %s %d (%.0f %%)'
          % (ov, 100 * ov / len(rows), n1, n2, i12, 100 * i12 / len(rows),
             n2, n1, i21, 100 * i21 / len(rows)))
    summary([(r['clip'], r['middiff']) for r in rows], 'mittpunktsskillnad (%s->%s)' % (n1, n2))
    summary([(r['clip'], r['union']) for r in rows], 'union av bada (manskligt spann)')


def section_a(reg, answers):
    print('\n=== (a) ERIK MOT LISA -- det manskliga spannet ===')
    if len(answers) < 2:
        print('  kraver tva svarsfiler')
        return
    (n1, a1), (n2, a2) = list(answers.items())
    by_id = {s['id']: s for s in reg['swings']}
    gaps, mids, widths = [], [], {n1: [], n2: []}
    overlap, both, only_one_unsure, both_unsure = 0, 0, 0, 0
    union, rows = [], []
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
        mids.append((s['clip'], mid(i2) - mid(i1)))
        union.append((s['clip'], max(i1[1], i2[1]) - min(i1[0], i2[0]) + 1))
        rows.append(dict(id=s['id'], clip=s['clip'], i1=i1, i2=i2, gap=g,
                         middiff=mid(i2) - mid(i1),
                         union=max(i1[1], i2[1]) - min(i1[0], i2[0]) + 1,
                         w1=i1[1] - i1[0] + 1, w2=i2[1] - i2[0] + 1,
                         slowmo=s['slowmo'], view=s['viewBucket']))
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

    # -- the same pair distance, split on what was registered but never shown -------------
    print('\n  -- uppdelningar (samma matt, delmangder av samma %d svingar) --' % both)
    pair_block('alla', rows, n1, n2)
    for label, pred in (
            ('slow-mo', lambda r: r['slowmo']),
            ('normal takt', lambda r: not r['slowmo']),
            ('face-on', lambda r: r['view'] == 'face_on'),
            ('dtl', lambda r: r['view'] == 'dtl'),
            ('%s bred i pass 1 (>=%d rutor)' % (n1, WIDE), lambda r: r['w1'] >= WIDE),
            ('%s smal i pass 1 (<%d rutor)' % (n1, WIDE), lambda r: r['w1'] < WIDE)):
        pair_block(label, [r for r in rows if pred(r)], n1, n2)


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
            dists, n_inside, novalue, unsure = [], 0, 0, 0
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
                    n_inside += 1
            print('    %s: inne i intervallet %d av %d rader; inget val %d; osaker %d'
                  % (est_name, n_inside, len(dists), novalue, unsure))
            summary(dists, '%s mot %s' % (est_name, name))

    # -- against the HUMAN SPAN, which is the point of the round ---------------------------
    # The span is the UNION of the two intervals on the swings where both answered. It is not
    # a merged truth and no estimator is scored `right` by it: it is the width the two people
    # together left open, so `inside` here means `inside what neither of them ruled out`.
    if len(answers) >= 2:
        (n1, a1), (n2, a2) = list(answers.items())[:2]
        print('  -- mot det manskliga spannet (unionen av %s och %s, bara dar bada svarade) --'
              % (n1, n2))
        spans = {}
        for sid in choices:
            i1, i2 = interval(a1.get(sid)), interval(a2.get(sid))
            if i1 and i2:
                spans[sid] = (min(i1[0], i2[0]), max(i1[1], i2[1]))
        print('    %d svingar i %d klipp har ett manskligt spann'
              % (len(spans), len({by_id[s]['clip'] for s in spans})))
        for est_name in ('E1', 'E2', 'E3'):
            dists, ins = [], 0
            for sid, iv in spans.items():
                p = choices[sid].get(est_name)
                if p is None:
                    continue
                d = point_to_interval(p, iv)
                dists.append((by_id[sid]['clip'], d))
                ins += d == 0
            print('    %s: inne i spannet %d av %d rader' % (est_name, ins, len(dists)))
            summary(dists, '%s mot spannet' % est_name)
        # The same question turned around: how often does an estimator land inside BOTH
        # intervals -- the only sense in which it agrees with the two people at once.
        for est_name in ('E1', 'E2', 'E3'):
            both_in = sum(1 for sid, iv in spans.items()
                          if choices[sid].get(est_name) is not None
                          and inside(choices[sid][est_name], interval(a1[sid]))
                          and inside(choices[sid][est_name], interval(a2[sid])))
            print('    %s inne hos bada samtidigt: %d av %d' % (est_name, both_in, len(spans)))


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


# -- pass 2: fatigue or material? ---------------------------------------------

def section_pass2(reg, answers):
    """S-32 pass 2 (docs/shaft/top-review/build_pass2.py): Erik re-judges his own round's
    last third (order 69-103, 35 swings) under a fresh shuffle he cannot recognise. Erik
    against Erik, nothing else -- no estimator is touched here and this is not part of
    --section all.

    Needs exactly one pass-1 file (name without '-pass2') and one pass-2 file (name ending
    '-pass2'); which 35 swings this covers is read from the pass-2 file's OWN id set, not
    from any external list, so this stays correct even if build_pass2.py's slice changes.
    """
    print('\n=== PASS 2 -- trotthet eller materialet? (Erik mot Erik, samma svingar) ===')
    p1_name = next((n for n in answers if not n.endswith('-pass2')), None)
    p2_name = next((n for n in answers if n.endswith('-pass2')), None)
    if not p1_name or not p2_name:
        print('  kraver en pass-1-fil och en pass-2-fil (svarsfilens "annotator" slutar pa '
              '"-pass2"), t.ex. svar-erik.json + svar-erik-pass2.json')
        return
    a1, a2 = answers[p1_name], answers[p2_name]
    by_id = {s['id']: s for s in reg['swings']}
    ids = sorted(a2)
    missing_p1 = [i for i in ids if i not in a1]
    if missing_p1:
        print('  VARNING: %d av pass-2-svingarna saknas i pass 1: %s'
              % (len(missing_p1), ', '.join(missing_p1[:5])))
    print('  %d svingar (pass 2:s egen mangd); %d kontroller; %d av S-31:s sex; %d slow-mo'
          % (len(ids), sum(1 for i in ids if by_id[i]['isControl']),
             sum(1 for i in ids if by_id[i]['priorJudgement']),
             sum(1 for i in ids if by_id[i]['slowmo'])))

    # -- (a) intra-annotator span: pass 1 vs pass 2, same swings ------------------
    print('\n  -- (a) pass 1 mot pass 2: intra-annotatorsspann --')
    gaps, mids, widths1, widths2 = [], [], [], []
    both, only1, only2, neither, overlap = 0, 0, 0, 0, 0
    for i in ids:
        s = by_id[i]
        iv1, iv2 = interval(a1.get(i)), interval(a2.get(i))
        if iv1:
            widths1.append((s['clip'], iv1[1] - iv1[0] + 1))
        if iv2:
            widths2.append((s['clip'], iv2[1] - iv2[0] + 1))
        if iv1 is None and iv2 is None:
            neither += 1
            continue
        if iv1 is None or iv2 is None:
            only2 += iv1 is None
            only1 += iv1 is not None
            continue
        both += 1
        g = interval_gap(iv1, iv2)
        gaps.append((s['clip'], g))
        overlap += g == 0
        mids.append((s['clip'], ((iv2[0] + iv2[1]) / 2) - ((iv1[0] + iv1[1]) / 2)))
    print('  bada svarade: %d; bara pass1: %d; bara pass2: %d; ingendera (bada osakra): %d'
          % (both, only1, only2, neither))
    print('  intervallen overlappar i %d av %d (%.0f %%)'
          % (overlap, both, 100 * overlap / both if both else 0))
    summary(widths1, '%s: intervallbredd' % p1_name)
    summary(widths2, '%s: intervallbredd' % p2_name)
    summary(gaps, 'glapp mellan passen (pass1->pass2)')
    summary(mids, 'mittpunktsskillnad (pass1->pass2)')

    # -- (b) controls: pass 2 outcome vs pass 1 outcome, same control swings ------
    print('\n  -- (b) kontroller: pass 2 mot pass 1 --')
    control_ids = [i for i in ids if by_id[i]['isControl']]
    outcomes = {}
    for name, a in ((p1_name, a1), (p2_name, a2)):
        hits, miss, unsure, offs, per_id = 0, 0, 0, [], {}
        for i in control_ids:
            s = by_id[i]
            iv = interval(a.get(i))
            if iv is None:
                unsure += 1
                per_id[i] = 'unsure'
                continue
            lo_i, ex_ids = nearest_export_index(s, iv[0])
            hi_i, _ = nearest_export_index(s, iv[1])
            want = ex_ids.index(s['control']['frame'])
            span = range(min(lo_i, hi_i), max(lo_i, hi_i) + 1)
            if want in span:
                hits += 1
                per_id[i] = 'hit'
                offs.append((s['clip'], 0))
            else:
                miss += 1
                per_id[i] = 'miss'
                offs.append((s['clip'], (span.start - want) if span.start > want
                             else (span.stop - 1 - want)))
        outcomes[name] = per_id
        print('  %-16s ratt %d / fel %d / osaker %d  (av %d)'
              % (name, hits, miss, unsure, len(control_ids)))
        summary(offs, '%s: avstand i exportrutor' % name, 'exportrutor')

    # -- (c) samma svingar som missar bada gangerna, eller andra? -----------------
    print('\n  -- (c) missar pass 2 samma kontroller som pass 1, eller andra? --')
    o1, o2 = outcomes[p1_name], outcomes[p2_name]
    for k in ('hit', 'miss', 'unsure'):
        print('  pass1=%-6s  ' % k + '  '.join(
            'pass2=%s:%d' % (k2, sum(1 for i in control_ids if o1[i] == k and o2[i] == k2))
            for k2 in ('hit', 'miss', 'unsure')))
    repeat_miss = [i for i in control_ids if o1[i] == 'miss' and o2[i] == 'miss']
    fixed = [i for i in control_ids if o1[i] == 'miss' and o2[i] == 'hit']
    new_miss = [i for i in control_ids if o1[i] != 'miss' and o2[i] == 'miss']
    print('  upprepad miss (bada passen): %s' % (', '.join(repeat_miss) or '--'))
    print('  ratt i pass 2 fast miss i pass 1: %s' % (', '.join(fixed) or '--'))
    print('  ny miss i pass 2 (ej miss i pass 1): %s' % (', '.join(new_miss) or '--'))
    print('  Samma svingar bada gangerna pekar pa materialet. Spridda, olika missar pekar pa trotthet.')

    print('\n  -- osaker, alla %d svingar (inte bara kontroller) --' % len(ids))
    u1 = sum(1 for i in ids if a1.get(i, {}).get('unsure'))
    u2 = sum(1 for i in ids if a2.get(i, {}).get('unsure'))
    both_u = sum(1 for i in ids if a1.get(i, {}).get('unsure') and a2.get(i, {}).get('unsure'))
    print('  osaker i %s: %d/%d;  osaker i %s: %d/%d;  osaker i bada: %d'
          % (p1_name, u1, len(ids), p2_name, u2, len(ids), both_u))

    # -- (d) breddforandring mellan passen, slow-mo mot resten --------------------
    print('\n  -- (d) breddforandring pass1 -> pass2, slow-mo mot resten --')
    delta_by_id = {}
    for i in ids:
        iv1, iv2 = interval(a1.get(i)), interval(a2.get(i))
        if iv1 and iv2:
            delta_by_id[i] = (iv2[1] - iv2[0] + 1) - (iv1[1] - iv1[0] + 1)
    summary([(by_id[i]['clip'], d) for i, d in delta_by_id.items()],
             'breddforandring (pass2 - pass1)')
    for label, pred in (('slow-mo', lambda i: by_id[i]['slowmo']),
                        ('normal', lambda i: not by_id[i]['slowmo'])):
        sub = [(by_id[i]['clip'], d) for i, d in delta_by_id.items() if pred(i)]
        summary(sub, 'breddforandring, %s' % label)
    print('  Ingen troskel satts har -- det handlar om Erik ar konsekvent mot sig sjalv, inte om ratt svar.')


# -- silence: where the people could not answer -------------------------------

# The strata below are cut on the ANSWERS, never on an estimator, and each cut is named by
# the number it uses so nothing here is a hidden threshold: `oense` is >= 1 whole frame
# between the two midpoints (the grid's own step -- 0.5 is one bound moved by one frame),
# `bred` is a union of >= 4 frames, which is above both annotators' p90 of 3.
DISAGREE = 1.0
WIDE_SPAN = 4


def section_silence(reg, answers, choices):
    """Does E3 do worse exactly where the people are shaky -- and can it say so itself?

    Two different questions, kept apart. The first is measurable against the answers: E3's
    distance on the swings where somebody was unsure, where the two read the top differently,
    or where the intervals are wide, against the rest. The second -- whether E3 CARRIES a
    signal of its own difficulty -- has no answer here that does not invent a confidence
    score, so the only proxy reported is the distance between E3 and E2: two estimators built
    on different quantities, disagreeing, on swings a person could not call.

    No threshold is set and no rule is proposed. This measures whether a rule would have
    anything to stand on.
    """
    print('\n=== TYSTNAD -- ligger E3 samst dar manniskorna inte kunde svara? ===')
    if len(answers) < 2:
        print('  kraver tva svarsfiler')
        return
    (n1, a1), (n2, a2) = list(answers.items())[:2]
    by_id = {s['id']: s for s in reg['swings']}
    strata = collections.OrderedDict((k, []) for k in (
        'bada osakra', 'en osaker', 'oense (>=%.0f ruta isar)' % DISAGREE,
        'brett spann (>=%d rutor)' % WIDE_SPAN, 'resten (ense och smalt)'))
    for s in reg['swings']:
        sid = s['id']
        i1, i2 = interval(a1.get(sid)), interval(a2.get(sid))
        if i1 is None and i2 is None:
            strata['bada osakra'].append(sid)
        elif i1 is None or i2 is None:
            strata['en osaker'].append(sid)
        else:
            span = (min(i1[0], i2[0]), max(i1[1], i2[1]))
            wide = span[1] - span[0] + 1 >= WIDE_SPAN
            dis = abs(mid(i2) - mid(i1)) >= DISAGREE
            if dis:
                strata['oense (>=%.0f ruta isar)' % DISAGREE].append(sid)
            if wide:
                strata['brett spann (>=%d rutor)' % WIDE_SPAN].append(sid)
            if not dis and not wide:
                strata['resten (ense och smalt)'].append(sid)
    print('  Grupperna ar skurna pa SVAREN, aldrig pa E3. `oense` och `brett spann` overlappar')
    print('  med flit -- samma sving kan vara bada -- och redovisas darfor var for sig.')
    for label, sids in strata.items():
        clips = {by_id[i]['clip'] for i in sids}
        novalue = sum(1 for i in sids if i in choices and choices[i].get('E3') is None)
        nopose = sum(1 for i in sids if i not in choices)
        print('  -- %s: %d svingar i %d klipp (E3 utan val: %d; utan posebana: %d) --'
              % (label, len(sids), len(clips), novalue, nopose))
        for name, a in ((n1, a1), (n2, a2)):
            d = [(by_id[i]['clip'], point_to_interval(choices[i]['E3'], interval(a.get(i))))
                 for i in sids if i in choices and choices[i].get('E3') is not None
                 and interval(a.get(i))]
            if not d:
                print('     E3 mot %-6s -- inget intervall att mata mot' % name)
                continue
            ins = sum(1 for _, v in d if v == 0)
            print('     E3 mot %-6s inne %2d av %2d rader (%3.0f %%); |median| %.1f rutor; '
                  'klipp n=%d |median| %.1f'
                  % (name, ins, len(d), 100 * ins / len(d),
                     median([abs(v) for _, v in d]), len(by_clip(d)),
                     median([abs(v) for v in by_clip(d).values()])))
        # E3 against E2: available even where no human interval is, which is the only place
        # the `can it know` question can be asked at all.
        e32 = [(by_id[i]['clip'], choices[i]['E3'] - choices[i]['E2'])
               for i in sids if i in choices
               and choices[i].get('E3') is not None and choices[i].get('E2') is not None]
        if e32:
            print('     |E3 - E2| median %.1f rutor (rader n=%d, klipp n=%d)'
                  % (median([abs(v) for _, v in e32]), len(e32), len(by_clip(e32))))
    print('  Ingen troskel foljer av det har. En skillnad mellan grupperna sager att en')
    print('  tystnadsregel skulle ha nagot att sta pa -- inte var den skulle ga.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path,
                    help='output dir of docs/shaft/top-from-pose/run_pose.py')
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--restrict', type=Path, default=None,
                    help='score only the swing ids present in this answer file -- used to '
                         'put pass 2 and pass 1 on exactly the same swings')
    ap.add_argument('--section', default='all',
                    help='controls | a | b | c | silence | covariates | pass2 | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    if args.restrict:
        # A sensitivity check only compares if it compares the same swings. This subsets the
        # round; it never merges two passes and it never changes an answer.
        keep = {a['id'] for a in
                json.loads(args.restrict.read_text(encoding='utf-8'))['answers']}
        reg['swings'] = [s for s in reg['swings'] if s['id'] in keep]
        reg['swingCount'] = len(reg['swings'])
        reg['clipCount'] = len({s['clip'] for s in reg['swings']})
        reg['frameCount'] = sum(s['frameCount'] for s in reg['swings'])
        print('BEGRANSAD till de %d svingar som finns i %s'
              % (len(reg['swings']), args.restrict))
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
    if args.section in ('all', 'b', 'c', 'silence', 'covariates'):
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
    if args.section in ('all', 'silence'):
        section_silence(reg, answers, choices)
    if args.section == 'pass2':
        section_pass2(reg, answers)


if __name__ == '__main__':
    main()
