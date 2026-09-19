# ONE-OFF, READ-ONLY (S-33): is E3's one-frame offset QUANTISATION? WRITES NOTHING BUT STDOUT.
#
#   <venv>/python.exe docs/shaft/top-review/subframe.py <poseDir> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section e456|tail|controls|all]
#
# THE KEY IS ALREADY SEEN. docs/shaft/top-review/resultat.md is written and read, so the risk
# here is not measurement error, it is FITTING. Three variants are defined below and no
# fourth is tried; no parameter is swept, tuned or chosen after a number was seen; every
# fitted quantity is fitted leave-one-CLIP-out. If any parameter had been adjusted, the
# document would have to say so in plain words -- none was, and there is nothing to declare.
#
# WHAT IS MEASURED
#   E4  linear interpolation of v_y's zero crossing between the two frames E3's sign flip
#       brackets, on the RAW (unsmoothed) v_y. Answer in sub-frames AND, separately, rounded
#       to the nearest whole frame.
#   E5  the same crossing on the SMOOTHED v_y -- E3's own window (3), not a new one.
#   E6  E4 computed on a SINGLE wrist. E3 today reads the MIDPOINT of wrists 15/16
#       (analyze_pose.py `mid`), so the swap is midpoint -> single wrist, not the reverse.
#
# E3 already smooths v_y at window 3, so a literal reading would make E4 and E5 the same
# estimator. They are split the only way that leaves them distinct without inventing a new
# parameter: E4 interpolates on the raw series, E5 on the window-3 series E3 thresholds.
# The BRACKET is E3's own in both, so exactly one thing differs between them.
#
# Handedness is `unknown` for all 103 swings (docs/shaft/STATUS.md section 4), so there is no
# defensible way to pick THE single wrist for E6. Both wrists are therefore reported side by
# side and NEITHER is selected: picking the better one after seeing these numbers is exactly
# the fitting this round is trying to avoid.
#
# NOTHING IS DECIDED HERE. No threshold, no calibration applied, no production code read or
# written. src/lib/shaft/measure/, NEAR_VERTICAL_GATE_DEG, ON_PLANE_BAND_DEG, the sign
# convention and S-30's gate are untouched.
import argparse
import collections
import json
import math
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR  # noqa: E402  -- reused, never re-implemented

EST = SR.load_estimators()
POSE_DIR = None  # set in main(); e2_walk re-reads a trajectory rather than caching 103
HYST, WIN = 0.10, 3  # E3's own defaults (analyze_pose.py DEFAULTS['E3']); not swept here.


# -- the bracket E3 already chooses -------------------------------------------

def e3_bracket(vy, hyst=HYST):
    """Index j of the frame E3 returns: the last frame at or before the first +hyst crossing
    whose v_y is still <= 0. Identical control flow to analyze_pose.e3_signflip, returning
    the index instead of the time, so E4/E5/E6 sit on E3's decision and not beside it."""
    armed = False
    for i, (_, v) in enumerate(vy):
        if v is None:
            continue
        if v < -hyst:
            armed = True
        elif armed and v > hyst:
            j = i
            while j > 0 and (vy[j][1] is None or vy[j][1] > 0):
                j -= 1
            return j
    return None


def crossing_fraction(series, j):
    """Where in [j, j+1] the linear zero crossing of `series` falls: (fraction, clamped).

    Returns None when the bracket cannot carry a crossing at all (an end of the series, a
    gap, or a flat pair). A fraction outside [0, 1] means the series given here does not
    actually change sign inside E3's bracket; it is clamped to the bracket and COUNTED, not
    quietly dropped.
    """
    if j is None or j + 1 >= len(series):
        return None
    v0, v1 = series[j][1], series[j + 1][1]
    if v0 is None or v1 is None or v1 == v0:
        return None
    f = (0.0 - v0) / (v1 - v0)
    return (min(1.0, max(0.0, f)), not (0.0 <= f <= 1.0))


# -- the three variants -------------------------------------------------------

def wrist_track(d, which):
    """(t, y) per envelope frame for one wrist landmark, None where no pose came back."""
    return [(r['t'], None if 'w' not in r else r['w'][which][1])
            for r in EST['env_frames'](d)]


def vy_from_y(ys, win):
    """Central-difference v_y over (t, y), then EST['smooth'] -- the same two steps
    analyze_pose.vy_series takes, so a single wrist is differentiated exactly as the
    midpoint is."""
    out = []
    for i in range(len(ys)):
        j, k = i - 1, i + 1
        if j < 0 or k >= len(ys) or ys[j][1] is None or ys[k][1] is None:
            out.append((ys[i][0], None))
            continue
        dt = ys[k][0] - ys[j][0]
        out.append((ys[i][0], None if dt <= 0 else (ys[k][1] - ys[j][1]) / dt))
    return EST['smooth'](out, win)


def variants(d):
    """{name: (sub-frame offset from the bracket start, bracket index j, clamped)}.

    All four series share E3's bracket. The sub-frame answer is j + fraction; E3's own answer
    is j. The difference between them is, by construction, the quantisation this round is
    about.
    """
    vy_s = EST['vy_series'](d, WIN)          # E3's series: midpoint, smoothed at 3
    vy_r = EST['vy_series'](d, 1)            # midpoint, unsmoothed
    j = e3_bracket(vy_s)
    out = {'E3': (None if j is None else (float(j), j, False))}
    for name, series in (('E4', vy_r), ('E5', vy_s)):
        c = crossing_fraction(series, j)
        out[name] = None if c is None else (j + c[0], j, c[1])
    for which in ('15', '16'):
        c = crossing_fraction(vy_from_y(wrist_track(d, which), 1), j)
        out['E6w%s' % which] = None if c is None else (j + c[0], j, c[1])
    return out


NAMES = ['E3', 'E4', 'E5', 'E6w15', 'E6w16']
LABEL = {'E3': 'E3  (teckenvaxling, ruta)', 'E4': 'E4  (interpolerad, ra v_y)',
         'E5': 'E5  (interpolerad, utjamnad v_y, fonster 3)',
         'E6w15': 'E6  (E4 pa handled 15)', 'E6w16': 'E6  (E4 pa handled 16)'}


# -- small helpers ------------------------------------------------------------

def rnd(x):
    """Half-up, so a crossing exactly between two frames goes to the later one. Python's
    round() is half-to-even and would send half of those backwards."""
    return math.floor(x + 0.5)


def dist(p, iv):
    return SR.point_to_interval(p, iv)


def dist_gen(p, iv):
    """The same distance under the generous reading of a frame index: frame k covers
    [k-0.5, k+0.5], so an interval [lo, hi] covers [lo-0.5, hi+0.5]. Reported BESIDE the
    strict number, never instead of it -- a sub-frame answer and a whole-frame interval do
    not have one obvious convention, and choosing the kinder one silently would be fitting."""
    lo, hi = iv[0] - 0.5, iv[1] + 0.5
    if lo <= p <= hi:
        return 0.0
    return p - hi if p > hi else p - lo


def line(label, pairs, extra=''):
    if not pairs:
        print('    %-30s -- inget underlag' % label)
        return
    v = [x for _, x in pairs]
    a = [abs(x) for x in v]
    clips = SR.by_clip(pairs)
    print('    %-30s rader n=%-3d klipp n=%-3d  median %+.2f  |median| %.2f  p90 %.2f  '
          'max %.2f  MAD %.2f%s'
          % (label, len(v), len(clips), SR.median(v), SR.median(a), SR.pct(a, 0.9),
             max(a), SR.mad(v), extra))


def loco_shift_hits(pairs_with_point, whole=False):
    """(hits after a leave-one-clip-out shift, the shifted distances).

    The shift a clip is judged by is the median of the OTHER clips' medians -- the same
    procedure score_round.section_c uses, so the two rounds' LOCO numbers mean the same
    thing. `whole` rounds the shift to a frame, which is what a whole-frame estimator can
    actually be calibrated by and what score_round did; a sub-frame estimator can carry a
    sub-frame shift, so there it is left continuous.
    """
    clip_med = SR.by_clip([(c, v) for c, v, _, _ in pairs_with_point])
    clips = sorted(clip_med)
    hits, out = 0, []
    for clip in clips:
        others = [v for c, v in clip_med.items() if c != clip]
        if not others:
            continue
        s_i = round(st.median(others)) if whole else st.median(others)
        for c, _, p, iv in pairs_with_point:
            if c != clip:
                continue
            dd = dist(p - s_i, iv)
            out.append((c, dd))
            hits += dd == 0
    return hits, out


# -- section: the three variants ----------------------------------------------

def section_e456(reg, answers, choices, spans):
    by_id = {s['id']: s for s in reg['swings']}
    print('\n=== E4 / E5 / E6 -- ar E3:s enrutasforskjutning kvantisering? ===')
    print('Avstand i envelope-bildrutor. 0 = inne i bedomarens intervall.')
    print('SUB = svaret i subrutor (strikt: inne betyder lo <= p <= hi).')
    print('RND = samma svar avrundat till narmaste hela ruta (halvor uppat).')
    print('GEN = subrutesvaret mot [lo-0.5, hi+0.5], den generosa lasningen. Bada redovisas.')

    # -- how far the crossing actually sits inside E3's bracket -----------------
    print('\n  -- kvantiseringen sjalv: var i E3:s tvarutasbracket ligger nollgenomgangen? --')
    for name in ('E4', 'E5', 'E6w15', 'E6w16'):
        fr = [(by_id[sid]['clip'], ch[name][0] - ch[name][1])
              for sid, ch in choices.items() if ch.get(name) and ch.get('E3')]
        cl = sum(1 for sid, ch in choices.items() if ch.get(name) and ch[name][2])
        nov = sum(1 for ch in choices.values() if ch.get('E3') and not ch.get(name))
        if not fr:
            print('    %-30s -- inget underlag' % LABEL[name])
            continue
        v = [x for _, x in fr]
        print('    %-30s n=%-3d  fraktion median %.2f  p10 %.2f  p90 %.2f  '
              '(klamd mot bracket: %d; utan varde: %d)'
              % (LABEL[name], len(v), SR.median(v), SR.pct(v, 0.10), SR.pct(v, 0.90),
                 cl, nov))
    print('    En median nara 0,5 betyder att E3:s val ar systematiskt en halv ruta for')
    print('    tidigt AV RUTNATET -- det ar precis den kvantisering hypotesen pekar ut.')

    # -- against each annotator, and against the human span ---------------------
    targets = [(n, {sid: SR.interval(a.get(sid)) for sid in choices}) for n, a in answers.items()]
    targets.append(('spannet', spans))
    for tname, ivs in targets:
        pairs_all, pairs_rnd = {}, {}
        print('\n  -- mot %s --' % tname)
        for name in NAMES:
            rows_sub, rows_rnd, rows_gen = [], [], []
            pts, pts_r, per_sid, per_sid_r = [], [], {}, {}
            for sid, ch in choices.items():
                iv = ivs.get(sid)
                if iv is None or not ch.get(name):
                    continue
                p = ch[name][0] + 1.0          # bracket index -> 1-based frame index
                clip = by_id[sid]['clip']
                rows_sub.append((clip, dist(p, iv)))
                rows_gen.append((clip, dist_gen(p, iv)))
                rows_rnd.append((clip, dist(rnd(p), iv)))
                pts.append((clip, dist(p, iv), p, iv))
                pts_r.append((clip, dist(rnd(p), iv), rnd(p), iv))
                per_sid[sid] = dist(p, iv)
                per_sid_r[sid] = dist(rnd(p), iv)
            if not rows_sub:
                print('    %-30s -- inget underlag' % LABEL[name])
                continue
            n = len(rows_sub)
            ins_s = sum(1 for _, v in rows_sub if v == 0)
            ins_g = sum(1 for _, v in rows_gen if v == 0)
            ins_r = sum(1 for _, v in rows_rnd if v == 0)
            print('  %s' % LABEL[name])
            print('    INNE: SUB %d/%d (%.0f %%)   RND %d/%d (%.0f %%)   GEN %d/%d (%.0f %%)'
                  % (ins_s, n, 100 * ins_s / n, ins_r, n, 100 * ins_r / n,
                     ins_g, n, 100 * ins_g / n))
            line('SUB', rows_sub)
            line('RND', rows_rnd)
            line('GEN', rows_gen)
            hits, loco = loco_shift_hits(pts, whole=(name == 'E3'))
            print('    LOCO (skift anpassat utan det egna klippet): SUB inne %d -> %d av %d'
                  % (ins_s, hits, len(loco)))
            line('SUB, LOCO-skiftad', loco)
            hits_r, loco_r = loco_shift_hits(pts_r, whole=True)
            print('    LOCO, samma skift pa RND (hela rutor, som score_round gor): '
                  'inne %d -> %d av %d' % (ins_r, hits_r, len(loco_r)))
            line('RND, LOCO-skiftad', loco_r)
            pairs_all[name] = per_sid
            pairs_rnd[name] = per_sid_r
        # how much of E3's error the interpolation removes, row by row on the same swings
        if 'E3' in pairs_all:
            print('    -- mot E3, pa exakt de rader bada gav ett varde --')
            base = pairs_all['E3']
            for name in ('E4', 'E5', 'E6w15', 'E6w16'):
                if name not in pairs_all:
                    continue
                shared = sorted(set(base) & set(pairs_all[name]))
                pair = [(base[k], pairs_all[name][k]) for k in shared]
                if not pair:
                    continue
                better = sum(1 for a, b in pair if abs(b) < abs(a))
                worse = sum(1 for a, b in pair if abs(b) > abs(a))
                moved_in = sum(1 for a, b in pair if a != 0 and b == 0)
                fell_out = sum(1 for a, b in pair if a == 0 and b != 0)
                print('      %-8s SUB (n=%d) narmare %2d, langre bort %2d, oforandrat %2d; '
                      'in i intervallet %2d, ut ur det %2d'
                      % (name, len(pair), better, worse, len(pair) - better - worse,
                         moved_in, fell_out))
                sh = sorted(set(pairs_rnd['E3']) & set(pairs_rnd.get(name, {})))
                pr = [(pairs_rnd['E3'][k], pairs_rnd[name][k]) for k in sh]
                if pr:
                    print('      %-8s RND (n=%d) narmare %2d, langre bort %2d, '
                          'oforandrat %2d; in i intervallet %2d, ut ur det %2d'
                          % ('', len(pr),
                             sum(1 for a, b in pr if abs(b) < abs(a)),
                             sum(1 for a, b in pr if abs(b) > abs(a)),
                             sum(1 for a, b in pr if abs(b) == abs(a)),
                             sum(1 for a, b in pr if a != 0 and b == 0),
                             sum(1 for a, b in pr if a == 0 and b != 0)))


# -- section: E2's tail -------------------------------------------------------

def e2_walk(d):
    """(index of the fastest envelope frame, index E2 stops at, local steps taken back).

    E2 walks BACKWARDS from the fastest frame to the first local minimum in 2D wrist speed.
    How far back it gets IS the estimator, so it is measured rather than guessed: a stop one
    or two frames behind the fastest frame is a micro-dip, not a transition.
    """
    sp = EST['speed_series'](d, 3)
    idx = [i for i, (_, v) in enumerate(sp) if v is not None]
    if len(idx) < 3:
        return None
    imax = max(idx, key=lambda i: sp[i][1])
    i, steps = imax, 0
    while True:
        prev = [j for j in idx if j < i]
        if not prev:
            return imax, i, steps
        j = prev[-1]
        if sp[j][1] >= sp[i][1]:
            return imax, i, steps
        i, steps = j, steps + 1


def section_tail(reg, answers, choices2, spans):
    """DIAGNOSIS ONLY. No new estimator, no rule, no threshold: the question is whether E2's
    p90 of 28-30 frames and max of 205 are one identifiable class of clip or scattered."""
    by_id = {s['id']: s for s in reg['swings']}
    walks = {}
    for s in reg['swings']:
        fp = Path(POSE_DIR) / ('%s.json' % s['swing'])
        if fp.exists():
            walks[s['id']] = e2_walk(json.loads(fp.read_text(encoding='utf-8')))
    print('\n=== E2:s SVANS -- en igenkannbar klass av klipp, eller utspridd? ===')
    rows = []
    for sid, iv in spans.items():
        p = choices2.get(sid)
        if p is None:
            continue
        s = by_id[sid]
        w = walks.get(sid)
        d = SR.point_to_interval(p, iv)
        a, b = s['env']
        times = s['frameTimes']
        t = times[min(len(times) - 1, max(0, p - 1))]
        rows.append(dict(id=sid, clip=s['clip'], d=d, dec=min(9, max(0, int(10 * (t - a) / (b - a)))),
                         slowmo=s['slowmo'], view=s['viewBucket'], impact=s['impact'],
                         hasImpact=s['hasConfidentImpact'], t=t, iv=iv, n=len(times),
                         span_t=times[min(len(times) - 1, iv[0] - 1)],
                         back=None if w is None else w[0] - w[1],
                         steps=None if w is None else w[2],
                         maxdec=None if w is None else min(9, max(0, int(
                             10 * (times[min(len(times) - 1, w[0])] - a) / (b - a)))),
                         maxoff=None if w is None else (w[0] + 1) - iv[1]))
    ad = sorted(abs(r['d']) for r in rows)
    cut = SR.pct(ad, 0.90)
    print('  n=%d svingar i %d klipp har ett manskligt spann och ett E2-val.'
          % (len(rows), len({r['clip'] for r in rows})))
    print('  Svansen definieras som |avstand| >= p90 av |avstand| = %.0f rutor -- en'
          % cut)
    print('  KVANTIL av utfallet, inte en vald grans, och den flyttas inte.')
    tail = [r for r in rows if abs(r['d']) >= cut]
    print('  svans: %d rader i %d klipp' % (len(tail), len({r['clip'] for r in tail})))
    late = [r for r in tail if r['d'] > 0]
    early = [r for r in tail if r['d'] < 0]
    print('  riktning: %d efter spannet (sent val), %d fore det (tidigt val)'
          % (len(late), len(early)))
    print('  %-9s %-9s %7s %4s %6s %8s %7s %9s %7s %6s' %
          ('id', 'klipp', 'avst', 'dec', 'slowmo', 'vy', 'nedslag', 'E2-tid',
           'steg', 'rutor'))
    for r in sorted(tail, key=lambda r: -abs(r['d'])):
        print('  %-9s %-9s %+7.0f %4d %6s %8s %7s %9.3f %7s %6s'
              % (r['id'], r['clip'], r['d'], r['dec'], 'ja' if r['slowmo'] else '-',
                 r['view'], 'ja' if r['hasImpact'] else 'nej', r['t'],
                 '-' if r['steps'] is None else r['steps'],
                 '-' if r['back'] is None else r['back']))
    print('  `steg` = antal lokala steg E2 gick bakat fran den snabbaste rutan i envelopen,')
    print('  `rutor` = hur langt bakat det blev. Det steget ar hela E2:s konstruktion.')
    rest = [r for r in rows if abs(r['d']) < cut]
    for label, sel in (('svans', tail), ('resten', rest)):
        stp = [r['steps'] for r in sel if r['steps'] is not None]
        bk = [r['back'] for r in sel if r['back'] is not None]
        if stp:
            print('     %-7s steg bakat median %.0f (p90 %.0f); bildrutor bakat median %.0f '
                  '(p90 %.0f), n=%d'
                  % (label, SR.median(stp), SR.pct(stp, 0.9), SR.median(bk),
                     SR.pct(bk, 0.9), len(stp)))
    print('  -- E2:s ankare: var ligger den SNABBASTE rutan (tiondel 0-9)? --')
    print("  E2 antar att den ar nedsvingen. Halls antagandet, ar svansen ett gafsel i")
    print('  backatgaendet; halls det inte, ar svansen ett trasigt ankare.')
    for label, sel in (('svans', tail), ('resten', rest)):
        c = collections.Counter(r['maxdec'] for r in sel if r['maxdec'] is not None)
        off = [r['maxoff'] for r in sel if r['maxoff'] is not None]
        print('     %-7s tiondel: %s   | snabbaste rutan %+.0f rutor efter spannets slut '
              '(median, p90 %+.0f)'
              % (label, ' '.join('%d:%d' % (k, c[k]) for k in range(10) if c[k]),
                 SR.median(off), SR.pct(off, 0.9)))
    print('  -- var i envelopen landar svansens val (tiondel 0-9)? --')
    dec = collections.Counter(r['dec'] for r in tail)
    print('     svans:  ' + ' '.join('%d:%d' % (k, dec[k]) for k in range(10) if dec[k]))
    dec2 = collections.Counter(r['dec'] for r in rows if abs(r['d']) < cut)
    print('     resten: ' + ' '.join('%d:%d' % (k, dec2[k]) for k in range(10) if dec2[k]))
    print('  -- ar svansen samma slags klipp som resten? --')
    for label, key in (('slow-mo', lambda r: r['slowmo']),
                       ('face-on', lambda r: r['view'] == 'face_on'),
                       ('utan sakert nedslag', lambda r: not r['hasImpact'])):
        t_ = sum(1 for r in tail if key(r))
        o_ = sum(1 for r in rows if abs(r['d']) < cut and key(r))
        print('     %-20s svans %d av %d (%.0f %%);  resten %d av %d (%.0f %%)'
              % (label, t_, len(tail), 100 * t_ / len(tail), o_, len(rows) - len(tail),
                 100 * o_ / (len(rows) - len(tail))))
    rep = collections.Counter(r['clip'] for r in tail)
    print('     klipp med mer an en svans-rad: %s'
          % (', '.join('%s x%d' % (c, n) for c, n in rep.items() if n > 1) or '--'))
    print('  -- ligger det sena valet efter nedslaget (dvs i finishen)? --')
    for r in sorted(late, key=lambda r: -r['d']):
        imp = r['impact']
        print('     %-9s E2 %.3f s, nedslag %s, spannets start %.3f s -> %s'
              % (r['id'], r['t'], ('%.3f s' % imp) if imp else 'saknas', r['span_t'],
                 'EFTER nedslaget' if imp and r['t'] > imp else
                 ('fore nedslaget' if imp else 'okant -- inget nedslag')))


# -- section: the controls both annotators missed -----------------------------

def section_controls(reg, answers):
    """The eight controls BOTH annotators missed set the ceiling for the whole round: no
    estimator can be scored past the point where the key itself is not what two independent
    pairs of eyes see. Diagnosis only -- no control is re-labelled here."""
    by_id = {s['id']: s for s in reg['swings']}
    names = list(answers)
    print('\n=== KONTROLLER SOM BADA MISSADE -- ar facit fel, eller ar svingen tvetydig? ===')
    controls = [s for s in reg['swings'] if s['isControl']]
    missed = []
    for s in controls:
        outs = {n: SR.control_outcome(s, answers[n].get(s['id'])) for n in names}
        if all(o[0] == 'miss' for o in outs.values()):
            missed.append((s, outs))
    print('  %d av %d kontroller missades av bada.' % (len(missed), len(controls)))
    for s, outs in sorted(missed, key=lambda x: x[0]['clip']):
        ef = sorted(s['exportFrames'], key=lambda f: f['tSec'])
        ids = [f['id'] for f in ef]
        want = ids.index(s['control']['frame'])
        times = s['frameTimes']
        print('\n  --- %s  (%s, %s, %s%s) ---'
              % (s['id'], s['clip'], s['viewBucket'],
                 'slow-mo' if s['slowmo'] else 'normal takt',
                 ', nedslag saknas' if not s['hasConfidentImpact'] else ''))
        print('      kontrollens facit: %s @ %.3f s  (exportruta %d av %d), kallor: %s'
              % (s['control']['frame'].split('_')[-1], s['control']['tSec'], want,
                 len(ef), ', '.join(x.split('/')[-2] + '/' + x.split('/')[-1]
                                    for x in s['control']['sources'])))
        print('      exportrutnatet: ' + '  '.join(
            '%s%d@%.2f%s' % ('>' if k == want else '', k, f['tSec'],
                             '(%s)' % s['annotatedPhases'][f['id']]['phase']
                             if f['id'] in s['annotatedPhases'] else '')
            for k, f in enumerate(ef)))
        if s['annotatorDisagreements']:
            print('      CVAT-annotatorerna ar OENSE om: %s'
                  % ', '.join('%s %s' % (d['frame'].split('_')[-1], '/'.join(d['phases']))
                              for d in s['annotatorDisagreements']))
        step = (times[-1] - times[0]) / (len(times) - 1) if len(times) > 1 else 1 / 30
        gaps = [(b['tSec'] - a['tSec']) / step for a, b in zip(ef, ef[1:])]
        print('      exportrutnatets steg: %.0f-%.0f videorutor (granne till facit: %s)'
              % (min(gaps), max(gaps),
                 ' / '.join('%.0f' % gaps[k] for k in (want - 1, want) if 0 <= k < len(gaps))))
        for n in names:
            a = answers[n].get(s['id'])
            iv = SR.interval(a)
            if iv is None:
                print('      %-6s osaker' % n)
                continue
            lo_i, _ = SR.nearest_export_index(s, iv[0])
            hi_i, _ = SR.nearest_export_index(s, iv[1])
            mt = (times[iv[0] - 1] + times[iv[1] - 1]) / 2
            print('      %-6s rutor %d-%d av %d  (%.3f-%.3f s)  -> exportrutor %d-%d, '
                  '%+d fran facit; mittpunkt %+.0f videorutor fran facit, %+.0f fran den '
                  'valda exportrutan'
                  % (n, iv[0], iv[1], len(times), times[iv[0] - 1], times[iv[1] - 1],
                     lo_i, hi_i, outs[n][1], (mt - s['control']['tSec']) / step,
                     (mt - ef[lo_i]['tSec']) / step))
        ivs = [SR.interval(answers[n].get(s['id'])) for n in names]
        if all(ivs):
            gap = SR.interval_gap(ivs[0], ivs[1])
            same = len({outs[n][1] for n in names}) == 1
            print('      de tva bedomarna: glapp %d rutor (%s), samma fel-riktning: %s'
                  % (gap, 'overlappar' if gap == 0 else 'OVERLAPPAR INTE',
                     'ja' if same else 'nej'))
            # Descriptive, not a verdict: the script says what the two agreed on, the report
            # says what that means. Re-labelling a control is not done here.
            print('      => %s'
                  % ('ense med varandra och pa samma andra exportruta som facit'
                     if same and gap == 0 else
                     'inte ense med varandra'))
            # Does the pair contradict a SECOND, independent CVAT label? A top placed before
            # a frame CVAT calls `backswing`, or after one it calls `downswing`, is not a
            # coarse-grid near-miss: it is a different event in the same envelope.
            span_lo = min(i[0] for i in ivs)
            span_hi = max(i[1] for i in ivs)
            lo_t, hi_t = times[span_lo - 1], times[span_hi - 1]
            before = [f for f in ef if f['id'] in s['annotatedPhases']
                      and s['annotatedPhases'][f['id']]['phase'] in ('backswing', 'address')
                      and f['tSec'] > hi_t]
            after = [f for f in ef if f['id'] in s['annotatedPhases']
                     and s['annotatedPhases'][f['id']]['phase'] in ('downswing', 'impact',
                                                                    'through', 'finish')
                     and f['tSec'] < lo_t]
            if before or after:
                print('      MOTSAGER OCKSA en annan CVAT-etikett: %s'
                      % ', '.join('%s=%s @%.2f s' % (f['id'].split('_')[-1],
                                                     s['annotatedPhases'][f['id']]['phase'],
                                                     f['tSec'])
                                  for f in before + after))
            else:
                print('      ingen annan CVAT-etikett motsagas -- bara facitrutan sjalv.')
            print('      klippet bidrar med %d svingar till rundan'
                  % sum(1 for x in reg['swings'] if x['clip'] == s['clip']))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all', help='e456 | tail | controls | all')
    args = ap.parse_args()

    global POSE_DIR
    POSE_DIR = args.poseDir
    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    print('S-33 (subrutor): %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))

    choices, choices2, misaligned, nopose = {}, {}, [], []
    for s in reg['swings']:
        p = Path(args.poseDir) / ('%s.json' % s['swing'])
        if not p.exists():
            nopose.append(s['swing'])
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        # The variants are indices into the envelope-frame list; the answers are indices into
        # registry frameTimes. If those two lists are not the same frames in the same order,
        # every number below is off by an unknown amount -- so it is checked, not assumed.
        # 1e-3 s, not 1e-6: the registry stores rounded times and the observed worst
        # difference is 3.3e-5 s. The tolerance is still 30x smaller than a frame step
        # (1/30 s), so it cannot hide a frame being off by one.
        ts = [r['t'] for r in EST['env_frames'](d)]
        if len(ts) != len(s['frameTimes']) or any(
                abs(a - b) > 1e-3 for a, b in zip(ts, s['frameTimes'])):
            misaligned.append(s['swing'])
            continue
        choices[s['id']] = variants(d)
        t2 = EST['EST']['E2'](d, {})
        choices2[s['id']] = SR.to_index(s['frameTimes'], t2)
    if nopose:
        print('  VARNING: %d svingar saknar posebana: %s' % (len(nopose), ', '.join(nopose[:5])))
    if misaligned:
        raise SystemExit('posebanan och registrets frameTimes ar inte samma rutor for: %s'
                         % ', '.join(misaligned[:5]))
    print('  %d svingar med posebana; rutnaten stammer overens for alla.' % len(choices))

    # E3 recomputed here must match what resultat.md scored, or the pose run drifted.
    (n1, a1), (n2, a2) = list(answers.items())[:2]
    by_id = {s['id']: s for s in reg['swings']}
    spans = {}
    for sid in choices:
        i1, i2 = SR.interval(a1.get(sid)), SR.interval(a2.get(sid))
        if i1 and i2:
            spans[sid] = (min(i1[0], i2[0]), max(i1[1], i2[1]))
    print('  KONTROLLRAD (maste stamma med resultat.md innan nagot nedan lases):')
    for tname, ivs in ((n1, {s: SR.interval(a1.get(s)) for s in choices}),
                       (n2, {s: SR.interval(a2.get(s)) for s in choices}),
                       ('spannet', spans)):
        d3 = [(by_id[sid]['clip'], SR.point_to_interval(ch['E3'][0] + 1, ivs[sid]))
              for sid, ch in choices.items() if ivs.get(sid) and ch.get('E3')]
        d2 = [(by_id[sid]['clip'], SR.point_to_interval(choices2[sid], ivs[sid]))
              for sid in choices if ivs.get(sid) and choices2.get(sid)]
        print('    mot %-8s E3 inne %d av %d (median %+.0f);  E2 inne %d av %d (p90 %.0f, max %.0f)'
              % (tname, sum(1 for _, v in d3 if v == 0), len(d3),
                 SR.median([v for _, v in d3]),
                 sum(1 for _, v in d2 if v == 0), len(d2),
                 SR.pct([abs(v) for _, v in d2], 0.9), max(abs(v) for _, v in d2)))

    if args.section in ('all', 'e456'):
        section_e456(reg, answers, choices, spans)
    if args.section in ('all', 'tail'):
        section_tail(reg, answers, choices2, spans)
    if args.section in ('all', 'controls'):
        section_controls(reg, answers)


if __name__ == '__main__':
    main()
