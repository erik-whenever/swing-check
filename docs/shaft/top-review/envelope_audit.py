# ONE-OFF, READ-ONLY DIAGNOSIS (S-36): did the humans and the estimator see the same frames,
# where are the envelopes that miss a turn, and what does that do to the numbers already
# reported? WRITES NOTHING BUT STDOUT.
#
#   python docs/shaft/top-review/envelope_audit.py <envPoseDir> --clipPoseDir <clipPoseDir> \
#       [--section window | outside | downstream | c001 | why | stability | all]
#
# NOTHING IS DECIDED HERE. No estimator, no threshold, no calibration, no change to S-30's
# lock or to the envelope logic. src/lib/poseEnvelope.ts is READ in section `why` -- to name
# the rule that ends a window -- and is not reimplemented, not scored against and not
# touched. Every other script in this directory is reused, never re-implemented.
#
# THE KEY WAS SEEN. resultat.md, subframe.md, crossing-selection.md and multiswing.md were
# all read before this was written, so the risk here is not measurement error, it is fitting.
# Therefore: no parameter swept, none tuned, and every band used to name a group is either a
# constant lifted from production (SETTLE_SPEED_FRAC) or a quantity taken from the clip's own
# registered swings. Where a classification turns on a band of mine it says so on the line.
import argparse
import collections
import json
import statistics as st
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR          # noqa: E402
import subframe as SF             # noqa: E402
import crossing_selection as CS   # noqa: E402
import multiswing as MS           # noqa: E402

EST = SF.EST
HYST, WIN = SF.HYST, SF.WIN
CLIPS = Path('data/shaft/clips')
FRAMES = Path('data/shaft/top-round/frames')

# run_pose.py's own constant, quoted so the two decode rules can be compared side by side.
MARGIN_SEC = 0.6
# build_round.py's own constants, same reason.
MAX_LONG_SIDE, JPEG_QUALITY = 1280, 92
# src/lib/poseEnvelope.ts's and src/lib/poseSegments.ts's own constants. Read, quoted, NOT
# reimplemented: they are used below only to say how far a measured number is from the rule
# production actually applies. Neither file is modified by anything here.
SETTLE_SPEED_FRAC = 0.2          # poseEnvelope.ts: finish = held run below this x peakSpeed
FINISH_MIN_HOLD_FRAMES = 3       # poseEnvelope.ts: how long that run has to be
REF_SPEED_QUANTILE = 0.95        # poseSegments.ts: refSpeed is the p95 of speed, not the max
ADDRESS_SPEED_FRAC = 0.15        # poseSegments.ts: QUIET/MOVING boundary, x refSpeed
MIN_ADDRESS_SEC = 0.3            # poseSegments.ts: the shortest quiet island that cuts a burst
MAX_ENVELOPE_SEC = 3.0           # poseSegments.ts: above this the quality gate rejects


# -- shared small helpers ------------------------------------------------------

def clip_track(d):
    """(t, h) per decoded frame of a whole clip, h = -y of the wrist midpoint (up = larger).
    Identical to clip_swings.clip_elevation; that function is inside the part D script and
    is imported rather than copied wherever the import is possible."""
    out = []
    for r in d['frames']:
        if 'w' not in r:
            out.append((r['t'], None))
            continue
        a, b = r['w']['15'], r['w']['16']
        out.append((r['t'], -(a[1] + b[1]) / 2))
    return out


def clip_speed(d):
    """(t, |d(midpoint)/dt|) per decoded frame, smoothed with EST['smooth'] at window 3.

    This is the quantity poseEnvelope.ts calls `speedSm` and thresholds the finish on. It is
    NOT the same number production computes: production runs its trajectory at 15 fps and
    this runs at 30, and the smoothing half-width is the same 1 sample rather than the same
    duration. Only RATIOS to the clip's own peak are read below, and the deviation is stated
    rather than corrected."""
    pts = []
    for r in d['frames']:
        if 'w' not in r:
            pts.append((r['t'], None))
            continue
        a, b = r['w']['15'], r['w']['16']
        pts.append((r['t'], ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)))
    out = []
    for i in range(len(pts)):
        j, k = i - 1, i + 1
        if j < 0 or k >= len(pts) or pts[j][1] is None or pts[k][1] is None:
            out.append((pts[i][0], None))
            continue
        dt = pts[k][0] - pts[j][0]
        if dt <= 0:
            out.append((pts[i][0], None))
            continue
        dx = pts[k][1][0] - pts[j][1][0]
        dy = pts[k][1][1] - pts[j][1][1]
        out.append((pts[i][0], (dx * dx + dy * dy) ** 0.5 / dt))
    return EST['smooth'](out, WIN)


def nearest(ts, t):
    return min(range(len(ts)), key=lambda k: abs(ts[k] - t))


def fmt(x, n=2, plus=False):
    if x is None:
        return '--'
    return ('%+.*f' if plus else '%.*f') % (n, x)


def load_flags(registry_swings):
    """clippedTail / suspectMultiSwing / hasConfidentImpact / gate straight off the export
    manifests -- production's OWN flags for each envelope, which no round so far has read."""
    import zipfile
    per_swing = {}
    for z in sorted(Path('data/shaft/exports').glob('*.zip')):
        man = json.loads(zipfile.ZipFile(z).read('manifest.json'))
        for f in man['frames']:
            per_swing.setdefault(f['id'].rsplit('_f', 1)[0], f)
    out = {}
    for s in registry_swings:
        f = per_swing.get(s['swing'])
        if f:
            out[s['id']] = {k: f.get(k) for k in
                            ('clippedTail', 'suspectMultiSwing', 'hasConfidentImpact',
                             'gate', 'slowmo', 'envelopeDurationSec')}
    return out


# -- FRAGA 1: sag manniskorna och estimatorn samma bildrutor? ------------------

def decode_window(clip_path, seek_sec, lo, hi):
    """Every decoded frame time in [lo, hi] after seeking to seek_sec. This is the decode
    loop both build_round.extract() and run_pose.py run, with each rule's own seek and
    window handed in -- the estimator's MediaPipe call cannot change which frames the
    decoder returns, so the comparison needs no pose model."""
    cap = cv2.VideoCapture(str(clip_path))
    cap.set(cv2.CAP_PROP_POS_MSEC, seek_sec * 1000)
    out = []
    while True:
        ok, _ = cap.read()
        if not ok:
            break
        t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
        if t > hi + 1e-3:
            break
        if t < lo - 1e-3:
            continue
        out.append(t)
    cap.release()
    return out


def section_window(reg, pose_dir):
    print('\n=== 1. SAG MANNISKORNA OCH ESTIMATORN SAMMA BILDRUTOR? ===')
    print('  Bedomarvyn: build_round.extract() soker till envelopens START och behaller')
    print('  [start, finish]. Estimatorn: run_pose.py soker till start-0,6 s, behaller')
    print('  [start-0,6, finish+0,6] och markerar inEnv = [start, finish]. De tva reglerna')
    print('  har alltsa OLIKA sokpunkt, och en OpenCV-sokning landar pa en nyckelruta --')
    print('  det ar darfor fragan inte ar trivial. Bada avkodningarna kors har om, ruta')
    print('  for ruta, per sving. Ingen posemodell behovs: MediaPipe kan inte andra vilka')
    print('  rutor avkodaren lamnar ut.')
    local = {p.name: p for p in CLIPS.rglob('*') if p.is_file()}
    rows, bad = [], []
    for s in reg['swings']:
        start, finish = s['env']
        cp = local.get(s['clip'])
        if cp is None:
            bad.append((s['id'], 'klippet saknas lokalt'))
            continue
        view = decode_window(cp, start, start, finish)
        lo = max(0.0, start - MARGIN_SEC)
        est_all = decode_window(cp, lo, lo, finish + MARGIN_SEC)
        est = [t for t in est_all if start - 1e-3 <= t <= finish + 1e-3]
        jd = FRAMES / s['id']
        jpg = len(list(jd.glob('*.jpg'))) if jd.is_dir() else None
        pose = None
        p = Path(pose_dir) / ('%s.json' % s['swing']) if pose_dir else None
        if p is not None and p.exists():
            pose = [r['t'] for r in EST['env_frames'](
                json.loads(p.read_text(encoding='utf-8')))]
        rows.append(dict(id=s['id'], clip=s['clip'], view=view, est=est, pose=pose,
                         reg=s['frameTimes'], jpg=jpg, margin=len(est_all) - len(est),
                         size=s.get('size')))
    print('\n  -- ruta for ruta, alla %d svingar --' % len(rows))
    diff_len, diff_t, diff_first, diff_last = [], [], [], []
    worst_t = 0.0
    for r in rows:
        if len(r['view']) != len(r['est']):
            diff_len.append(r['id'])
            continue
        if not r['view']:
            continue
        if abs(r['view'][0] - r['est'][0]) > 1e-9:
            diff_first.append(r['id'])
        if abs(r['view'][-1] - r['est'][-1]) > 1e-9:
            diff_last.append(r['id'])
        d = max(abs(a - b) for a, b in zip(r['view'], r['est']))
        worst_t = max(worst_t, d)
        if d > 1e-3:
            diff_t.append((r['id'], d))
    print('     svingar dar ANTALET rutor skiljer:             %d' % len(diff_len))
    print('     svingar dar FORSTA rutan skiljer:              %d' % len(diff_first))
    print('     svingar dar SISTA rutan skiljer:               %d' % len(diff_last))
    print('     svingar med nagon ruta > 1 ms isar:            %d' % len(diff_t))
    print('     storsta tidsskillnad pa nagon ruta i nagon sving: %.3e s (ett rutsteg '
          'ar %.4f s)' % (worst_t, 1 / 30))
    for sid in diff_len:
        r = next(x for x in rows if x['id'] == sid)
        print('     AVVIKELSE %s (%s): vy %d rutor, estimator %d rutor'
              % (sid, r['clip'], len(r['view']), len(r['est'])))
    for sid, d in diff_t:
        print('     AVVIKELSE %s: storsta rutavvikelse %.4f s' % (sid, d))
    for sid, why in bad:
        print('     EJ MATT %s: %s' % (sid, why))

    print('\n  -- forsta och sista rutan, per sving, vy mot estimator --')
    print('     Hela listan star ute; sok efter en rad dar kolumnerna skiljer.')
    print('     %-9s %-13s %6s %6s %11s %11s %11s %11s'
          % ('id', 'klipp', 'n vy', 'n est', 'vy forsta', 'est forsta', 'vy sista',
             'est sista'))
    for r in rows:
        print('     %-9s %-13s %6d %6d %11.4f %11.4f %11.4f %11.4f'
              % (r['id'], r['clip'], len(r['view']), len(r['est']),
                 r['view'][0] if r['view'] else -1, r['est'][0] if r['est'] else -1,
                 r['view'][-1] if r['view'] else -1, r['est'][-1] if r['est'] else -1))

    print('\n  -- och mot de tva tredjeparter som ocksa ska vara samma rutor --')

    def cmpset(key, label):
        n_len, worst, miss = 0, 0.0, 0
        for r in rows:
            other = r[key]
            if other is None:
                miss += 1
                continue
            if len(other) != len(r['view']):
                n_len += 1
                continue
            if r['view']:
                worst = max(worst, max(abs(a - b) for a, b in zip(r['view'], other)))
        print('     %-46s antal skiljer pa %d sving(ar), storsta tidsavvikelse %.3e s%s'
              % (label, n_len, worst, '' if not miss else ', %d utan underlag' % miss))

    cmpset('reg', 'registret (det bedomarvyn byggdes av)')
    cmpset('pose', 'posebanans inEnv-rutor (det estimatorn fick)')
    print('     (registret avrundar tiden till 4 decimaler -- darav ~3e-5 s, inte en ruta.)')
    tot_view = sum(len(r['view']) for r in rows)
    print('\n     summa bildrutor: vy %d, estimator %d, register %d, JPEG pa disk %d, '
          'posebana %d'
          % (tot_view, sum(len(r['est']) for r in rows), sum(len(r['reg']) for r in rows),
             sum(r['jpg'] or 0 for r in rows),
             sum(len(r['pose']) for r in rows if r['pose'] is not None)))
    nojpg = [r['id'] for r in rows if r['jpg'] is None or r['jpg'] != len(r['view'])]
    print('     svingar dar antalet JPEG pa disk INTE ar antalet avkodade rutor: %d%s'
          % (len(nojpg), '' if not nojpg else ' -- ' + ', '.join(nojpg)))

    print('\n  -- vad som INTE ar samma: bildpunkterna --')
    big = [r for r in rows if r['size'] and max(r['size']) > MAX_LONG_SIDE]
    print('     Samma bildrutor ar inte samma bilder. Bedomaren fick JPEG (kvalitet %d)'
          % JPEG_QUALITY)
    print('     med langsidan kapad vid %d px; estimatorn fick den RA avkodade rutan i'
          % MAX_LONG_SIDE)
    print('     klippets egen upplosning, utan omkodning.')
    print('     svingar dar bedomarens bild ar NEDSKALAD:            %d av %d'
          % (len(big), len(rows)))
    print('     svingar i klippets egen upplosning (men JPEG-omkodad): %d'
          % (len(rows) - len(big)))
    print('     Det ar en skillnad i bildkvalitet, inte i vilket OGONBLICK som visades,')
    print('     och den ar inte matt har.')
    marg = sorted(r['margin'] for r in rows)
    print('\n     estimatorns marginalrutor UTANFOR envelopen (avkodade, aldrig bedomda):')
    print('       median %d, min %d, max %d per sving. De ger sparningen en historia som'
          % (SR.median(marg), min(marg), max(marg)))
    print('       bedomaren inte sag, men ingen estimator laser dem: E1/E2/E3 kor pa inEnv.')
    return rows


# -- the clip-level picture every section below reads --------------------------

def build_clips(clip_pose_dir, reg):
    """One row per clip: the whole-clip track, its envelopes, its registered tops and the
    reversals that fall outside every envelope.

    The candidate rule is S-35 part D's, unchanged: a reversal counts when its topographic
    prominence reaches the SMALLEST prominence among that clip's own registered tops. That
    selection lives inline in clip_swings.main(), so it is repeated here through the same
    calls (MS.prominences, the same in-envelope test, the same reference); main() asserts
    that it reproduces part D's 16 clips by name and stops if it does not.
    """
    by_clip = collections.defaultdict(list)
    for s in reg['swings']:
        by_clip[s['clip']].append(s)
    out = {}
    for p in sorted(Path(clip_pose_dir).glob('*.json')):
        d = json.loads(p.read_text(encoding='utf-8'))
        clip = d['clip']
        hs = clip_track(d)
        ts = [t for t, _ in hs]
        h = [v for _, v in hs]
        sp = [v for _, v in clip_speed(d)]
        envs = d['envs']
        pk = MS.prominences(h)
        regs = []
        for e in envs:
            ins = [(i, pr) for i, _, pr in pk
                   if e['env'][0] - 1e-3 <= ts[i] <= e['env'][1] + 1e-3]
            if not ins:
                continue
            k, pr = max(ins, key=lambda r: r[1])
            regs.append(dict(id=e['id'], env=e['env'], i=k, t=ts[k], prom=pr))
        ref = min([r['prom'] for r in regs] or [None]) if regs else None
        refmax = max([r['prom'] for r in regs] or [None]) if regs else None
        cand = []
        if ref:
            for i, _, pr in pk:
                if pr < ref:
                    continue
                if any(e['env'][0] - 1e-3 <= ts[i] <= e['env'][1] + 1e-3 for e in envs):
                    continue
                w = [k for k in range(len(ts)) if abs(ts[k] - ts[i]) <= 0.5]
                cov = sum(1 for k in w if h[k] is not None) / len(w) if w else 0
                cand.append(dict(i=i, t=ts[i], prom=pr, q_ref=pr / ref, q_max=pr / refmax,
                                 pose=cov))
        cand.sort(key=lambda c: c['t'])
        spv = sorted(v for v in sp if v is not None)
        peak = spv[-1] if spv else 0.0
        p95 = SR.pct(spv, REF_SPEED_QUANTILE) if spv else 0.0
        out[clip] = dict(clip=clip, ts=ts, h=h, sp=sp, envs=envs, regs=regs, ref=ref, p95=p95,
                         refmax=refmax, cand=cand, peak=peak, fps=d['fps'],
                         dur=ts[-1] if ts else 0.0,
                         cov=sum(e['env'][1] - e['env'][0] for e in envs),
                         swings=by_clip.get(clip, []))
    # A clip whose own reference is a thousandth of the round's typical registered top has
    # no usable reference: the selection then lets everything through, which is exactly what
    # S-35 part D already said about 001.mp4. The 0.1 x band IS mine; the full list of every
    # clip's reference is printed beside it so the reader can see where the break sits.
    allprom = sorted(r['prom'] for C in out.values() for r in C['regs'])
    med = SR.median(allprom) if allprom else None
    for C in out.values():
        C['round_median_prom'] = med
        C['degenerate'] = bool(med and C['ref'] is not None and C['ref'] < 0.1 * med)
    return out


def addr_height(C, env):
    """The envelope's own address height -- part A's `adresshojd`, no chosen level: the
    first frame inside the envelope that carried a pose. None when none of them did."""
    k0 = nearest(C['ts'], env[0])
    k1 = nearest(C['ts'], env[1])
    for k in range(k0, k1 + 1):
        if C['h'][k] is not None:
            return C['h'][k]
    return None


def right_min(C, i):
    """(index, value) of the lowest point to the RIGHT of the reversal at i before the track
    rises above it again -- the same walk MS.prominences already makes, so the descent
    measured below is the descent that reversal's own prominence is built on. Parameter-free
    and local: it needs no address height, which over a 40 s clip is not one level anyway."""
    v = C['h'][i]
    if v is None:
        return None, None
    best_i, best_v = None, None
    for k in range(i + 1, len(C['h'])):
        x = C['h'][k]
        if x is None:
            continue
        if x > v:
            break
        if best_v is None or x < best_v:
            best_i, best_v = k, x
    return best_i, best_v


def descent(C, i):
    """(fastest falling rate after the reversal at i, seconds from the reversal to the low
    point). The SHAPE test: a golf swing comes down off the top fast, a waggle, a practice
    lift or picking a ball up does not. Read only as a ratio to the clip's OWN registered
    swings, so no speed of mine enters the classification, and amplitude -- which
    resultat.md 3 showed cannot tell a top from a finish -- is not what decides."""
    j, _ = right_min(C, i)
    if j is None:
        return None, None
    best = 0.0
    for k in range(i, j):
        a, b = C['h'][k], C['h'][k + 1]
        if a is None or b is None:
            continue
        dt = C['ts'][k + 1] - C['ts'][k]
        if dt > 0:
            best = max(best, (a - b) / dt)
    return (best or None), C['ts'][j] - C['ts'][i]


def crosses_below(C, i, j, h_addr):
    """Does the track dip to or below h_addr anywhere strictly between i and j?

    This is what separates `the envelope cut the edge of this same excursion` from `this is
    a different movement`: inside one excursion the hands never come back to address."""
    a, b = (i, j) if i < j else (j, i)
    for k in range(a + 1, b):
        if C['h'][k] is not None and h_addr is not None and C['h'][k] <= h_addr:
            return True
    return False


def classify(C, c):
    """One candidate reversal -> (bucket, what decided it, the numbers).

    THE RULE, written down before the rows were looked at:
      1. `kapad kant`  -- the candidate and an envelope edge lie in the SAME excursion above
         that envelope's address height, i.e. the track never returns to address between
         them. Purely geometric; no level of mine.
      2. otherwise the candidate is a separate excursion, and the question is whether it has
         a swing's SHAPE: is the descent off it at least as fast as the descent off the
         clip's own WEAKEST registered top? Yes -> `missad sving`. No -> `rorelse
         efter/utanfor svingen`, sub-labelled by where it sits relative to the envelopes.
      3. `ej avgorbar` when the pose is too sparse around the candidate to measure a shape,
         or when the clip's own reference is degenerate (see `ref` in the per-clip block).
    Amplitude is deliberately NOT the discriminator: resultat.md 3 already showed the finish
    stands higher than the top, which is what sank E1.
    The one band that is mine is the pose-coverage floor; it is named on the line.
    """
    envs = sorted(C['envs'], key=lambda e: e['env'][0])
    t = c['t']
    before = [e for e in envs if e['env'][1] < t]
    after = [e for e in envs if e['env'][0] > t]
    if not before:
        pos = 'fore alla envelopes'
    elif not after:
        pos = 'efter alla envelopes'
    else:
        pos = 'mellan tva envelopes'
    edges = []
    for e in envs:
        edges.append((abs(t - e['env'][0]), e['env'][0], e['id'], 'start'))
        edges.append((abs(t - e['env'][1]), e['env'][1], e['id'], 'slut'))
    gap, edge_t, edge_id, edge_which = min(edges)
    env = next(e for e in envs if e['id'] == edge_id)
    h_addr = addr_height(C, env['env'])
    ei = nearest(C['ts'], edge_t)
    same = (h_addr is not None and C['h'][c['i']] is not None
            and C['h'][c['i']] > h_addr
            and not crosses_below(C, c['i'], ei, h_addr))
    # A cut edge is not one thing. If the track never returns to address between the
    # envelope's OWN registered reversal and this one, the window cut the top itself. If it
    # does, the candidate is a LATER excursion in the same swing -- and the later excursion
    # of a golf swing is the finish, which resultat.md 3 already measured as standing HIGHER
    # than the top. Those two have to be told apart or `kapad kant` would quietly absorb E1's
    # old mistake.
    regt = next((r for r in C['regs'] if r['id'] == edge_id), None)
    same_as_top = (same and regt is not None and h_addr is not None
                   and not crosses_below(C, regt['i'], c['i'], h_addr))
    desc, dur = descent(C, c['i'])
    refdesc = [d for d in (descent(C, r['i'])[0] for r in C['regs']) if d]
    refdur = [d for d in (descent(C, r['i'])[1] for r in C['regs']) if d]
    weakest = min(refdesc) if refdesc else None
    ratio = (desc / weakest) if (desc and weakest) else None
    info = dict(pos=pos, gap=gap, edge=edge_id, which=edge_which, h_addr=h_addr,
                desc=desc, dur=dur, weakest=weakest, ratio=ratio, same=same,
                refdur=SR.median(refdur) if refdur else None,
                degenerate=C['degenerate'])
    if c['pose'] < 0.5:
        return ('ej avgorbar',
                'pose pa %.0f %% av +-0,5 s (posegolvet 50 %% ar mitt band)'
                % (100 * c['pose']), info)
    if same and same_as_top:
        return ('kapad kant (toppen)',
                'ingen atervandning till adresshojd mellan %s:s egen registrerade vandning '
                '(t %.2f s), envelopekanten (%s, %.2f s isar) och den har vandningen -- allt '
                'ar en och samma utflykt' % (edge_id, regt['t'], edge_which, gap),
                info)
    if same:
        return ('finishtopp utanfor envelopen',
                'samma utflykt som envelopekanten (%s, %.2f s isar), men banan gar tillbaka '
                'till adresshojd mellan %s:s registrerade vandning och den har -- alltsa en '
                'SENARE utflykt i samma sving, och den senare utflykten ar finishen'
                % (edge_which, gap, edge_id), info)
    if C['degenerate']:
        return ('ej avgorbar', 'klippets referens ar degenererad (%.4f, se klippraden) -- '
                'urvalet slapper igenom allt' % C['ref'], info)
    if desc is None or ratio is None:
        return ('ej avgorbar', 'ingen matbar nedgang efter vandningen eller ingen matbar '
                'registrerad nedsving att jamfora med', info)
    if ratio >= 1.0:
        return 'missad sving', ('nedgangen ar %.2f x klippets svagaste registrerade '
                                'nedsving' % ratio), info
    return 'rorelse efter/utanfor svingen', ('nedgangen ar bara %.2f x klippets svagaste '
                                             'registrerade nedsving' % ratio), info


def is_slowmo(C):
    return any(s.get('slowmo') for s in C['swings'])


def section_outside(CL, reg):
    print('\n=== 2. DE 16 KLIPPEN MED EN VANDNING UTANFOR VARJE ENVELOPE ===')
    hit = [C for C in CL.values() if C['cand']]
    withref = [C for C in CL.values() if C['ref']]
    print('  %d klipp har en referens, %d av dem har minst en vandning utanfor varje'
          % (len(withref), len(hit)))
    print('  envelope som nar den (S-35 del D:s egen rakning, oforandrad).')
    print('\n  KLASSNINGSREGELN, skriven fore raderna last:')
    print('   1. vandningen och en envelopekant ligger i SAMMA utflykt over envelopens')
    print('      adresshojd -- banan gar aldrig tillbaka till adress mellan dem. Rent')
    print('      geometriskt, ingen niva vald av mig. Tva fall, och de maste skiljas at:')
    print('      a. `kapad kant (toppen)` om banan inte heller gar ned till adress mellan')
    print('         envelopens EGEN registrerade vandning och den har -- allt ar en utflykt,')
    print('         och fonstret kapade sjalva toppen.')
    print('      b. `finishtopp utanfor envelopen` om den gor det -- da ar vandningen en')
    print('         SENARE utflykt i samma sving, och den senare utflykten i en golfsving ar')
    print('         finishen. resultat.md 3 matte att finishen star HOGRE an toppen, sa utan')
    print('         den delningen hade `kapad kant` tyst svalt E1:s gamla misstag.')
    print('   2. annars ar vandningen en egen utflykt, och fragan ar om den har en SVINGS')
    print('      FORM: kommer handerna tillbaka ned genom adresshojd efter den, och ar den')
    print('      nedgangen minst lika snabb som klippets EGNA svagaste registrerade')
    print('      nedsving? Ja -> `missad sving`. Nej -> `rorelse efter/utanfor svingen`.')
    print('   3. `ej avgorbar` nar posen ar for gles runt vandningen for att mata en form.')
    print('  AMPLITUD ar med flit inte det som skiljer: resultat.md 3 matte redan att')
    print('  finishen star hogre an toppen, vilket ar det som sankte E1.')
    print('  Det enda bandet som ar mitt ar posegolvet 50 %; det star pa raden.')

    rows = []
    for C in sorted(hit, key=lambda C: C['clip']):
        for c in C['cand']:
            b, why, info = classify(C, c)
            rows.append((C, c, b, why, info))
    print('\n  -- klipp for klipp --')
    for C in sorted(hit, key=lambda C: C['clip']):
        print('\n    %s  %s  langd %.1f s, %d registrerad(e) sving(ar), envelopetackning %.0f %%'
              % (C['clip'], '(slow-mo)' if is_slowmo(C) else '         ', C['dur'],
                 len(C['regs']), 100 * C['cov'] / C['dur'] if C['dur'] else 0))
        print('      referens (minsta registrerade prominens) %.4f; rundans median %.4f%s'
              % (C['ref'], C['round_median_prom'] or 0,
                 '   <-- DEGENERERAD REFERENS' if C['degenerate'] else ''))
        for e in sorted(C['envs'], key=lambda e: e['env'][0]):
            r = next((r for r in C['regs'] if r['id'] == e['id']), None)
            print('      envelope %s  %.2f--%.2f s%s'
                  % (e['id'], e['env'][0], e['env'][1],
                     '' if not r else '  registrerad vandning t %.2f s, prominens %.4f'
                     % (r['t'], r['prom'])))
        for C2, c, b, why, info in rows:
            if C2 is not C:
                continue
            print('      vandning t %.2f s  prominens %.4f (%.2f x klippets storsta '
                  'registrerade)' % (c['t'], c['prom'], c['q_max']))
            print('        lage: %s, %.2f s fran %s %s; pose %.0f %% av +-0,5 s'
                  % (info['pos'], info['gap'], info['edge'], info['which'], 100 * c['pose']))
            print('        nedgang efter: %s pa %s s   klippets svagaste registrerade: %s '
                  '(median %s s)   kvot %s'
                  % (fmt(info['desc'], 3), fmt(info['dur']), fmt(info['weakest'], 3),
                     fmt(info['refdur']), fmt(info['ratio'])))
            marg = (info['ratio'] is not None and 0.8 <= info['ratio'] <= 1.25
                    and b in ('missad sving', 'rorelse efter/utanfor svingen'))
            print('        KLASS: %-30s (%s)%s'
                  % (b, why, '  -- MARGINELL: kvoten ligger inom 0,8-1,25 av bandet 1,0, '
                     'sa klassen vander med bandet' if marg else ''))

    print('\n  -- klassningen sammanraknad --')
    cnt = collections.Counter(b for _, _, b, _, _ in rows)
    for b, n in cnt.most_common():
        cl = len({C['clip'] for C, _, bb, _, _ in rows if bb == b})
        print('     %-32s %3d vandningar i %d klipp' % (b, n, cl))
    print('     summa %d vandningar i %d klipp'
          % (len(rows), len({C['clip'] for C, _, _, _, _ in rows})))
    print('\n     Per klipp (klippet ar den oberoende enheten): en klass per klipp, den')
    print('     allvarligaste av dess vandningar i ordningen missad sving > kapad kant >')
    print('     rorelse > ej avgorbar.')
    order = ['missad sving', 'kapad kant (toppen)', 'finishtopp utanfor envelopen',
             'rorelse efter/utanfor svingen', 'ej avgorbar']
    per_clip = {}
    for C, c, b, why, info in rows:
        cur = per_clip.get(C['clip'])
        if cur is None or order.index(b) < order.index(cur):
            per_clip[C['clip']] = b
    for b in order:
        ks = sorted(k for k, v in per_clip.items() if v == b)
        print('     %-32s %2d klipp  %s' % (b, len(ks), ', '.join(ks)))

    print('\n  -- sammanfattning, en rad per klipp; `storsta` ar klippets prominentaste --')
    print('     vandning utanfor alla envelopes, och det ar den raden klassen star pa.')
    print('     %-11s %3s %5s %8s %8s %7s %7s %6s  %s'
          % ('klipp', 'sm', 'kand', 'ref', 'storst t', 'prom', 'kvot', 'pose', 'klass'))
    for C in sorted(hit, key=lambda C: C['clip']):
        c = max(C['cand'], key=lambda c: c['prom'])
        b, why, info = classify(C, c)
        marg = (info['ratio'] is not None and 0.8 <= info['ratio'] <= 1.25
                and b in ('missad sving', 'rorelse efter/utanfor svingen'))
        print('     %-11s %3s %5d %8.4f %8.2f %7.4f %7s %5.0f%%  %s%s%s'
              % (C['clip'], 'ja' if is_slowmo(C) else '-', len(C['cand']), C['ref'],
                 c['t'], c['prom'], fmt(info['ratio']), 100 * c['pose'], b,
                 '  MARGINELL (kvoten ligger inom 0,8-1,25 av bandet 1,0 -- klassen '
                 'vander med bandet)' if marg else '',
                 '  (degenererad referens)' if C['degenerate'] else ''))

    print('\n  -- kanslighet: var bandet mot klippets svagaste registrerade nedsving ligger --')
    rr = sorted(info['ratio'] for _, _, _, _, info in rows if info['ratio'] is not None)
    if rr:
        print('     kvoten nedgang / klippets svagaste registrerade nedsving, alla %d'
              % len(rr))
        print('     vandningar med ett varde: median %.2f, p10 %.2f, p90 %.2f, min %.2f, '
              'max %.2f' % (SR.median(rr), SR.pct(rr, 0.1), SR.pct(rr, 0.9), min(rr),
                            max(rr)))
        for lv in (0.5, 0.75, 1.0, 1.25, 1.5):
            n = sum(1 for x in rr if x >= lv)
            print('       vid bandet %.2f skulle %d av %d vandningar heta `missad sving` '
                  '(av dem som nar hit)' % (lv, n, len(rr)))
    print('     Klassningen flyttar sig alltsa med bandet. Den star kvar som den star.')

    print('\n  -- slow-mo, utbrutet --')
    n_sm_hit = sum(1 for C in hit if is_slowmo(C))
    n_sm_all = sum(1 for C in CL.values() if is_slowmo(C))
    print('     bland de %d klippen med en vandning utanfor: %d slow-mo (%.0f %%)'
          % (len(hit), n_sm_hit, 100 * n_sm_hit / len(hit) if hit else 0))
    print('     i rundan i stort (%d klipp med helklippsbana):  %d slow-mo (%.0f %%)'
          % (len(CL), n_sm_all, 100 * n_sm_all / len(CL) if CL else 0))
    rest = [C for C in CL.values() if not C['cand']]
    print('     bland de %d klippen UTAN en sadan vandning:     %d slow-mo (%.0f %%)'
          % (len(rest), sum(1 for C in rest if is_slowmo(C)),
             100 * sum(1 for C in rest if is_slowmo(C)) / len(rest) if rest else 0))
    print('     klassningen per klipp, slow-mo mot normal takt:')
    for lab, sel in (('slow-mo', [C for C in hit if is_slowmo(C)]),
                     ('normal takt', [C for C in hit if not is_slowmo(C)])):
        c2 = collections.Counter(per_clip[C['clip']] for C in sel)
        print('       %-12s n=%d klipp: %s'
              % (lab, len(sel), ', '.join('%s %d' % kv for kv in c2.most_common()) or '--'))
    return rows, per_clip


# -- FRAGA 3: kopplingen till nedstromsfelen ----------------------------------

def section_downstream(reg, POSE, by_id, spans, D, per_clip, window_ok):
    print('\n=== 3. LIGGER NEDSTROMSFELEN I DE FELPLACERADE KLIPPEN? ===')
    print('  Grupperna ar crossing-selection 2:s och multiswing B:s, oforandrade: E4:s')
    print('  utanfor-rader, och de bland dem som inte har nagon ALTERNATIV armad kandidat.')
    print('  Ingen rad ar struken och ingen siffra omraknad.')
    rows = sorted(spans)
    out = [i for i in rows if D[i]['d_e4r'] != 0]
    none_ = [i for i in out if len(D[i]['cand']) == 1]
    inside = [i for i in rows if D[i]['d_e4r'] == 0]
    # multiswing B: rows with no sign change of ANY kind inside the human interval
    nocross = []
    for i in none_:
        vy = EST['vy_series'](POSE[i], WIN)
        js = MS.unarmed_crossings(vy)
        lo, hi = spans[i]
        if not any(lo <= j + 1 <= hi for j in js):
            nocross.append(i)
    print('\n  %d rader har ett manskligt spann; E4 ligger utanfor pa %d, inne pa %d.'
          % (len(rows), len(out), len(inside)))
    print('  Av de %d utan alternativ armad kandidat saknar %d en teckenvaxling av nagot'
          % (len(none_), len(nocross)))
    print('  slag inne i intervallet (multiswing B:s 22 av 23).')

    flagged_clips = set(per_clip) if per_clip else set()
    missed = {k for k, v in (per_clip or {}).items() if v == 'missad sving'}
    cut = {k for k, v in (per_clip or {}).items() if v.startswith('kapad kant')}
    fin = {k for k, v in (per_clip or {}).items() if v.startswith('finishtopp')}
    groups = [('E4 utanfor spannet', out),
              ('  darav: ingen armad kandidat', none_),
              ('    darav: ingen vaxling alls inne', nocross),
              ('E4 inne i spannet', inside),
              ('alla med spann', rows)]
    print('\n     %-38s %5s %6s %10s %10s %10s %10s %9s'
          % ('grupp', 'n', 'klipp', 'i de 16', 'missad sv.', 'kapad topp', 'finishtopp',
             'fel fonster'))
    for lab, sel in groups:
        cl = {by_id[i]['clip'] for i in sel}
        a = len(cl & flagged_clips)
        b = len(cl & missed)
        c = len(cl & cut)
        print('     %-38s %5d %6d %6d %3.0f%% %10d %10d %10d %9s'
              % (lab, len(sel), len(cl), a, 100 * a / len(cl) if cl else 0, b, c,
                 len(cl & fin),
                 '0' if window_ok else ('?' if window_ok is None else 'se fraga 1')))
    print('\n  `i de 16` = klippet ar ett av dem som har en vandning utanfor varje envelope.')
    print('  `fel fonster` = klippet ar ett dar bedomarvyn och estimatorn fick olika rutor')
    print('  (fraga 1). Kolumnen ar noll overallt om och bara om fraga 1 kom ut tom.')
    print('\n  -- de utanfor-rader som ligger i ett av de 16 klippen, rad for rad --')
    for i in out:
        clip = by_id[i]['clip']
        if clip not in flagged_clips:
            continue
        print('     %-9s %-13s E4 %+4d rutor, %d teckenvaxlingskandidat(er) i envelopen, '
              'klippets klass: %s'
              % (i, clip, D[i]['d_e4r'], len(D[i]['cand']), per_clip[clip]))
    print('\n  -- och de rader UTAN vaxling alls som ligger i ett av dem --')
    for i in nocross:
        clip = by_id[i]['clip']
        if clip in flagged_clips:
            print('     %-9s %-13s klippets klass: %s' % (i, clip, per_clip[clip]))
    n_in = len({by_id[i]['clip'] for i in nocross} & flagged_clips)
    print('     %d av de %d radernas klipp ar ett av de 16.' % (n_in, len(nocross)))
    return out, none_, nocross


# -- FRAGA 4: 001.mp4 ----------------------------------------------------------

def section_c001(CL, reg, POSE, answers, flags, clip='001.mp4'):
    print('\n=== 4. %s -- BESKRIVNING, n = 1, INGEN SLUTSATS ===' % clip)
    C = CL.get(clip)
    if C is None:
        print('  ingen helklippsbana for %s' % clip)
        return
    sw = [s for s in reg['swings'] if s['clip'] == clip]
    print('  klippet: %.1f s, %.0f fps, %d avkodade rutor, %d registrerad(e) sving(ar).'
          % (C['dur'], C['fps'], len(C['ts']), len(sw)))
    nop = sum(1 for v in C['h'] if v is None)
    print('  pose saknas pa %d av %d rutor (%.0f %%).'
          % (nop, len(C['h']), 100 * nop / len(C['h']) if C['h'] else 0))
    for s in sw:
        f = flags.get(s['id'], {})
        print('  %s: envelope %.3f--%.3f s (%.0f %% av klippet), %d envelope-rutor'
              % (s['id'], s['env'][0], s['env'][1],
                 100 * (s['env'][1] - s['env'][0]) / C['dur'] if C['dur'] else 0,
                 s['frameCount']))
        print('    manifestets egna flaggor: clippedTail=%s, suspectMultiSwing=%s, '
              'hasConfidentImpact=%s, gate=%s, slowmo=%s'
              % (f.get('clippedTail'), f.get('suspectMultiSwing'),
                 f.get('hasConfidentImpact'), f.get('gate'), f.get('slowmo')))
        print('    exportrutor: %s'
              % ', '.join('%s @ %.3f s (%s)' % (x['id'].rsplit('_', 1)[-1], x['tSec'],
                                                x['phase'])
                          for x in sorted(s['exportFrames'], key=lambda r: r['tSec'])))
        for name, a in answers.items():
            r = a.get(s['id'])
            iv = SR.interval(r)
            print('    %s: %s' % (name, 'osaker / inget intervall' if iv is None
                                  else 'rutor %d--%d' % iv))
    print('\n  -- handhojden over hela klippet, sekund for sekund --')
    print('     h = -y for handledsmittpunkten (upp = storre). `-` betyder ingen pose.')
    step = 1.0
    t = 0.0
    while t < C['dur']:
        w = [C['h'][k] for k in range(len(C['ts']))
             if t <= C['ts'][k] < t + step and C['h'][k] is not None]
        nw = sum(1 for k in range(len(C['ts'])) if t <= C['ts'][k] < t + step)
        inenv = any(e['env'][0] <= t + step / 2 <= e['env'][1] for e in C['envs'])
        bar = ''
        if w:
            lo = min(v for v in C['h'] if v is not None)
            hi = max(v for v in C['h'] if v is not None)
            k = int(round(40 * (max(w) - lo) / (hi - lo))) if hi > lo else 0
            bar = '#' * k
        print('     %5.1f--%4.1f s  %s  h %s..%s  pose %d/%d  %s'
              % (t, t + step, 'ENV' if inenv else '   ',
                 fmt(min(w) if w else None, 3), fmt(max(w) if w else None, 3),
                 len(w), nw, bar))
        t += step
    print('\n  -- varje vandning i klippet, storst prominens forst --')
    pk = MS.prominences(C['h'])
    for i, v, pr in pk[:12]:
        inenv = any(e['env'][0] - 1e-3 <= C['ts'][i] <= e['env'][1] + 1e-3 for e in C['envs'])
        print('     t %6.2f s  h %.3f  prominens %.4f  %s'
              % (C['ts'][i], v, pr, 'INNE i envelopen' if inenv else 'utanfor'))
    print('\n  -- var envelopen slutar, matt --')
    for e in C['envs']:
        k = nearest(C['ts'], e['env'][1])
        ha = addr_height(C, e['env'])
        sp = C['sp'][k]
        print('     %s slutar vid t %.3f s (ruta %d av %d i klippet)'
              % (e['id'], C['ts'][k], k, len(C['ts'])))
        print('       farten dar: %s; klippets toppfart %.3f; kvot %s (produktionens'
              % (fmt(sp, 3), C['peak'], fmt(sp / C['peak'] if sp else None)))
        print('       SETTLE_SPEED_FRAC ar %.2f -- under den kallas det en finish)'
              % SETTLE_SPEED_FRAC)
        print('       handhojden dar: %s; adresshojd (envelopens forsta ruta): %s'
              % (fmt(C['h'][k], 3), fmt(ha, 3)))
        print('       stiger banan fortfarande vid envelopens sista ruta? %s'
              % ('ja' if (C['h'][k] is not None and C['h'][k - 1] is not None
                          and C['h'][k] > C['h'][k - 1]) else 'nej'))
    print('\n  Ingen har oppnat en enda bildruta ur %s. n = 1 klipp.' % clip)


# -- FRAGA 5: varfor slutar en envelope for tidigt? ---------------------------

def settle_run(C, k, frac=SETTLE_SPEED_FRAC):
    """How many consecutive frames from k forward are below frac x the clip's peak speed.
    poseEnvelope.ts defines the finish as the first run of FINISH_MIN_HOLD_FRAMES such
    samples after the downswing pass; this counts the run at the envelope's last frame, so
    a window that ended on a genuine settle and one that was cut mid-motion separate."""
    thr = frac * C['peak']
    n = 0
    for i in range(k, len(C['sp'])):
        v = C['sp'][i]
        if v is None:
            continue
        if v < thr:
            n += 1
        else:
            break
    return n


def quiet_run_sec(C, k):
    """Length in seconds of the QUIET run (speed < ADDRESS_SPEED_FRAC x refSpeed, refSpeed =
    the clip's p95 speed) that contains the envelope's last frame, extended both ways.

    This is the other rule, and it comes first: poseSegments.ts cuts the session into bursts
    at any quiet island of at least MIN_ADDRESS_SEC, and detectSwingEnvelope only ever sees
    what is inside one burst. A window can therefore end early without the finish rule
    having anything to do with it."""
    thr = ADDRESS_SPEED_FRAC * C['p95']
    if C['sp'][k] is None or C['sp'][k] >= thr:
        return 0.0
    a = k
    while a > 0 and C['sp'][a - 1] is not None and C['sp'][a - 1] < thr:
        a -= 1
    b = k
    while b + 1 < len(C['sp']) and C['sp'][b + 1] is not None and C['sp'][b + 1] < thr:
        b += 1
    return C['ts'][b] - C['ts'][a]


def section_why(CL, reg, flags, per_clip):
    print('\n=== 5. VAD AVSLUTAR FONSTRET? ===')
    print('  Regeln star i src/lib/poseEnvelope.ts och ar LAST, inte reimplementerad och')
    print('  inte andrad: envelopens slut ar `finish onset` = forsta rutan i den forsta')
    print('  foljden av FINISH_MIN_HOLD_FRAMES (%d) rutor med fart under SETTLE_SPEED_FRAC'
          % FINISH_MIN_HOLD_FRAMES)
    print('  (%.2f) x toppfarten, raknat framat fran `downswing pass` -- den SNABBASTE'
          % SETTLE_SPEED_FRAC)
    print('  NEDATGAENDE rutan nara adresshojd i hela klippet efter start. Hittas ingen')
    print('  sadan foljd satts clippedTail = true och slutet laggs pa sista rutan med')
    print('  betydande rorelse.')
    print('  MEN DEN REGELN KOMMER INTE FORST. src/lib/poseSegments.ts (ADR-003) delar')
    print('  forst sessionen i BURSTAR: refSpeed = p95 av farten, allt under')
    print('  ADDRESS_SPEED_FRAC (%.2f) x refSpeed ar QUIET, och en tyst o pa minst'
          % ADDRESS_SPEED_FRAC)
    print('  MIN_ADDRESS_SEC (%.1f s) BRYTER bursten. detectSwingEnvelope ser sedan bara'
          % MIN_ADDRESS_SEC)
    print('  det som ligger inne i en burst. Ett fonster kan alltsa ta slut utan att')
    print('  finish-regeln varit inblandad. Bada matts nedan, bredvid varandra.')
    print('  VARNING: talen nedan ar matta pa 30 fps-banan i det har repot, inte pa')
    print('  produktionens 15 fps-bana, och utjamningen ar samma antal sampel men inte')
    print('  samma tid. Bara KVOTER mot klippets egen toppfart lases, och avvikelsen star')
    print('  har i stallet for att korrigeras bort.')

    rows = []
    for C in CL.values():
        for s in C['swings']:
            k = nearest(C['ts'], s['env'][1])
            ha = addr_height(C, s['env'])
            sp = C['sp'][k]
            rows.append(dict(id=s['id'], clip=C['clip'], C=C, k=k,
                             frac=(sp / C['peak']) if (sp and C['peak']) else None,
                             q95=(sp / C['p95']) if (sp and C['p95']) else None,
                             quiet=quiet_run_sec(C, k),
                             dur=s['env'][1] - s['env'][0],
                             run=settle_run(C, k),
                             above=(C['h'][k] is not None and ha is not None
                                    and C['h'][k] > ha),
                             rising=(C['h'][k] is not None and C['h'][k - 1] is not None
                                     and C['h'][k] > C['h'][k - 1]),
                             flags=flags.get(s['id'], {}),
                             hit=C['clip'] in (per_clip or {}),
                             klass=(per_clip or {}).get(C['clip'])))
    def blk(lab, sel):
        if not sel:
            print('     %-40s -- inget underlag' % lab)
            return
        fr = sorted(r['frac'] for r in sel if r['frac'] is not None)
        q9 = sorted(r['q95'] for r in sel if r['q95'] is not None)
        qu = sorted(r['quiet'] for r in sel)
        du = sorted(r['dur'] for r in sel)
        print('     %-40s n=%-3d klipp=%-3d' % (lab, len(sel), len({r['clip'] for r in sel})))
        print('       fart/toppfart vid slutet median %s (p90 %s) mot finishregelns %.2f'
              % (fmt(SR.median(fr), 3) if fr else '--',
                 fmt(SR.pct(fr, 0.9), 3) if fr else '--', SETTLE_SPEED_FRAC))
        print('       fart/refSpeed(p95) vid slutet median %s; tyst o dar median %.2f s '
              '(over %.1f s pa %.0f %%) mot segmenterarens %.2f och %.1f s'
              % (fmt(SR.median(q9), 3) if q9 else '--', SR.median(qu) if qu else 0,
                 MIN_ADDRESS_SEC,
                 100 * sum(1 for r in sel if r['quiet'] >= MIN_ADDRESS_SEC) / len(sel),
                 ADDRESS_SPEED_FRAC, MIN_ADDRESS_SEC))
        print('       envelopelangd median %.2f s (over MAX_ENVELOPE_SEC %.1f pa %d rader); '
              'slutet over adress %.0f %%; banan stiger dar %.0f %%'
              % (SR.median(du) if du else 0, MAX_ENVELOPE_SEC,
                 sum(1 for r in sel if r['dur'] > MAX_ENVELOPE_SEC),
                 100 * sum(1 for r in sel if r['above']) / len(sel),
                 100 * sum(1 for r in sel if r['rising']) / len(sel)))
        print('       clippedTail %d, suspectMultiSwing %d, utan sakert nedslag %d, '
              'slow-mo %d'
              % (sum(1 for r in sel if r['flags'].get('clippedTail')),
                 sum(1 for r in sel if r['flags'].get('suspectMultiSwing')),
                 sum(1 for r in sel if r['flags'].get('hasConfidentImpact') is False),
                 sum(1 for r in sel if r['flags'].get('slowmo'))))
    print('\n  -- envelopens sista ruta, matt --')
    blk('alla envelopes', rows)
    blk('i de 16 klippen', [r for r in rows if r['hit']])
    blk('  darav klass `missad sving`', [r for r in rows if r['klass'] == 'missad sving'])
    blk('  darav klass `kapad kant (toppen)`',
        [r for r in rows if r['klass'] == 'kapad kant (toppen)'])
    blk('  darav klass `finishtopp utanfor`',
        [r for r in rows if r['klass'] == 'finishtopp utanfor envelopen'])
    blk('  darav klass `rorelse efter`',
        [r for r in rows if r['klass'] == 'rorelse efter/utanfor svingen'])
    blk('i de ovriga klippen', [r for r in rows if not r['hit']])
    blk('slow-mo, i de 16', [r for r in rows if r['hit'] and r['flags'].get('slowmo')])
    blk('slow-mo, i de ovriga',
        [r for r in rows if not r['hit'] and r['flags'].get('slowmo')])
    blk('normal takt, i de 16',
        [r for r in rows if r['hit'] and not r['flags'].get('slowmo')])
    blk('normal takt, i de ovriga',
        [r for r in rows if not r['hit'] and not r['flags'].get('slowmo')])

    print('\n  -- produktionens EGNA flaggor, som ingen tidigare omgang har last --')
    print('     De ligger i exportmanifestet, en per sving, och de sags aldrig av nagon')
    print('     bedomare. clippedTail betyder att ingen hallen finish hittades.')
    for fld in ('clippedTail', 'suspectMultiSwing'):
        on = [r for r in rows if r['flags'].get(fld)]
        print('     %-20s %d av %d svingar; i de 16 klippen %d, i de ovriga %d'
              % (fld, len(on), len(rows), sum(1 for r in on if r['hit']),
                 sum(1 for r in on if not r['hit'])))
        print('       %s' % ', '.join('%s (%s)' % (r['id'], r['clip']) for r in on))

    print('\n  -- de 16 klippens envelopeslut, rad for rad --')
    print('     %-9s %-11s %7s %7s %8s %8s %7s %6s %6s %5s %s'
          % ('id', 'klipp', 'slut s', 'langd', 'f/topp', 'f/p95', 'tyst s', 'ovr ad',
             'stiger', 'clipT', 'klippets klass'))
    for r in sorted([r for r in rows if r['hit']], key=lambda r: r['clip']):
        print('     %-9s %-11s %7.2f %7.2f %8s %8s %7.2f %6s %6s %5s %s'
              % (r['id'], r['clip'], r['C']['ts'][r['k']], r['dur'], fmt(r['frac'], 3),
                 fmt(r['q95'], 3), r['quiet'],
                 'ja' if r['above'] else 'nej', 'ja' if r['rising'] else 'nej',
                 'ja' if r['flags'].get('clippedTail') else 'nej', r['klass']))
    return rows


# -- DESSUTOM: vad instabiliteten mellan de tva korningarna satter for golv ----

def section_stability(reg, POSE, clip_pose_dir, answers, spans, D, by_id):
    print('\n=== 6. E3:s RUTA UR TVA KORNINGAR -- VILKET GOLV SATTER DET? ===')
    print('  Skillnaden mellan korningarna ar en VARM sparare: run_pose.py skapar en kall')
    print('  sparare per sving och borjar avkoda 0,6 s fore envelopen, run_pose_clip.py en')
    print('  per klipp fran t = 0. Samma modell, samma vikter, samma bildrutor (fraga 1).')
    print('  Det ar alltsa en storning som inte borde betyda nagot -- och det ar precis')
    print('  darfor den duger som mattstock pa hur reproducerbart talet ar.')
    warm = {}
    for s in reg['swings']:
        p = Path(clip_pose_dir) / ('%s.json' % s['clip'].replace('.', '_'))
        if not p.exists():
            continue
        dc = json.loads(p.read_text(encoding='utf-8'))
        ts = [r['t'] for r in dc['frames']]
        rows = []
        ok = True
        for ft in s['frameTimes']:
            k = nearest(ts, ft)
            if abs(ts[k] - ft) > 1e-2:
                ok = False
                break
            r = dict(dc['frames'][k])
            r['inEnv'] = True
            rows.append(r)
        if ok:
            warm[s['id']] = dict(frames=rows)
    print('\n  %d av %d svingar har en bana ur bada korningarna.' % (len(warm), len(reg['swings'])))
    same, within1, diffs, lost, gained = 0, 0, [], 0, 0
    for sid, d in warm.items():
        a = SF.e3_bracket(EST['vy_series'](d, WIN))
        b = SF.e3_bracket(EST['vy_series'](POSE[sid], WIN)) if sid in POSE else None
        if a is None and b is None:
            continue
        if a is None:
            lost += 1
            continue
        if b is None:
            gained += 1
            continue
        if a == b:
            same += 1
            within1 += 1
        else:
            diffs.append(a - b)
            if abs(a - b) <= 1:
                within1 += 1
    n = same + len(diffs) + lost + gained
    print('  E3:s ruta: lika pa %d av %d, inom 1 ruta pa %d av %d, %s'
          % (same, n, within1, n,
             'ingen sving tappar eller far ett val'
             if not (lost or gained) else '%d tappar sitt val, %d far ett' % (lost, gained)))
    if diffs:
        ad = sorted(abs(x) for x in diffs)
        allad = sorted([0] * same + ad)
        print('  av de %d som skiljer: median %+.0f, |median| %.0f, p90 %.0f, max %+d rutor'
              % (len(diffs), SR.median(diffs), SR.median(ad), SR.pct(ad, 0.9),
                 max(diffs, key=abs)))
        print('  over ALLA %d: |skillnad| median %.0f, p75 %.0f, p90 %.0f, max %.0f rutor'
              % (len(allad), SR.median(allad), SR.pct(allad, 0.75), SR.pct(allad, 0.9),
                 max(allad)))

    print('\n  -- vad det gor med rubriksiffrorna, samma matt, samma svar --')
    print('     `kall` ar den korning alla tidigare omgangar star pa; `varm` ar den andra.')
    print('     Ingenting ar anpassat: bara underlaget byts.')

    def score(getd):
        h3 = h4 = 0
        d3, d4 = [], []
        for sid in sorted(spans):
            d = getd(sid)
            if d is None:
                continue
            vy = EST['vy_series'](d, WIN)
            j = SF.e3_bracket(vy)
            if j is None:
                continue
            p3 = j + 1.0
            c = SF.crossing_fraction(EST['vy_series'](d, 1), j)
            p4 = j + 1.0 if c is None else j + c[0] + 1.0
            x3 = SR.point_to_interval(p3, spans[sid])
            x4 = SR.point_to_interval(SF.rnd(p4), spans[sid])
            d3.append(x3)
            d4.append(x4)
            h3 += x3 == 0
            h4 += x4 == 0
        return h3, h4, d3, d4

    got = {}
    for lab, getd in (('kall (envelopekorningen)', lambda s: POSE.get(s)),
                      ('varm (helklippskorningen)', lambda s: warm.get(s))):
        h3, h4, d3, d4 = score(getd)
        got[lab[:4]] = (d3, d4)
        print('     %-26s E3 inne %2d av %d (median %+.0f)   E4 RND inne %2d av %d '
              '(median %+.0f)'
              % (lab, h3, len(d3), SR.median(d3), h4, len(d4), SR.median(d4)))
    (k3, k4), (w3, w4) = got['kall'], got['varm']
    for nm, a, b in (('E3', k3, w3), ('E4 RND', k4, w4)):
        if len(a) != len(b):
            continue
        io = sum(1 for x, y in zip(a, b) if x == 0 and y != 0)
        oi = sum(1 for x, y in zip(a, b) if x != 0 and y == 0)
        mv = sum(1 for x, y in zip(a, b) if x != y)
        print('     %-7s netto %+d rader, men OMSATTNINGEN ar storre: %d gar fran inne '
              'till utanfor, %d fran utanfor till inne, %d rader byter avstand alls.'
              % (nm, oi - io, io, oi, mv))
    print('     Nettot ar alltsa inte golvet -- omsattningen ar det.')
    print('\n     Jamfor med de effekter tidigare omgangar rapporterat:')
    print('       S-33: interpolationen lyfte E3 30 -> 42 av 91 (12 rader).')
    print('       S-32: E3:s hela forskjutning ar -1 ruta, och LOCO-skiftet lyfte 30 -> 53.')
    print('       S-34: `en annan vaxling hade legat inne` galler 1 rad av 49.')
    print('     Ar skillnaden mellan kall och varm av samma storlek som nagon av dem, ar')
    print('     den siffran inte skild fran korningsbruset.')


# -- main ---------------------------------------------------------------------

# The 16 clips S-35 part D named. A fixed list, so the selection here cannot drift from the
# document it is auditing: main() stops if build_clips() reproduces a different set.
PART_D_CLIPS = ['001.mp4', '008.mp4', '011.mp4', '012.mp4', '033.mp4', '039.mp4',
                '045.mp4', '054.mp4', '056.mp4', '057.mp4', '059.mp4', '064.mp4',
                '072.mp4', '073.mp4', '082.mp4', '089.mp4']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path)
    ap.add_argument('--clipPoseDir', type=Path, default=None)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all',
                    help='window | outside | downstream | c001 | why | stability | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    by_id = {s['id']: s for s in reg['swings']}
    flags = load_flags(reg['swings'])
    print('S-36 envelope-audit: %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))

    POSE, D = {}, {}
    for s in reg['swings']:
        p = Path(args.poseDir) / ('%s.json' % s['swing'])
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        ts = [r['t'] for r in EST['env_frames'](d)]
        if len(ts) != len(s['frameTimes']) or any(
                abs(a - b) > 1e-3 for a, b in zip(ts, s['frameTimes'])):
            raise SystemExit('posebanan och registrets frameTimes ar inte samma rutor '
                             'for %s' % s['swing'])
        POSE[s['id']] = d
        vy_s = EST['vy_series'](d, WIN)
        j0 = SF.e3_bracket(vy_s)
        if j0 is None:
            continue
        js = CS.crossings(vy_s)
        if (js[0] if js else None) != j0:
            raise SystemExit('crossings() och e3_signflip ar oense om %s' % s['swing'])
        cand = [CS.shape(vy_s, EST['vy_series'](d, 1), j, s['env'][0], s['env'][1])
                for j in js]
        D[s['id']] = dict(cand=cand, p_e3=j0 + 1.0, p_e4=cand[0]['p'])
    (n1, a1), (n2, a2) = list(answers.items())[:2]
    spans = {}
    for sid in D:
        i1, i2 = SR.interval(a1.get(sid)), SR.interval(a2.get(sid))
        if i1 and i2:
            spans[sid] = (min(i1[0], i2[0]), max(i1[1], i2[1]))
    for sid in spans:
        D[sid]['d_e3'] = SR.point_to_interval(D[sid]['p_e3'], spans[sid])
        D[sid]['d_e4r'] = SR.point_to_interval(SF.rnd(D[sid]['p_e4']), spans[sid])
    print('  %d svingar med posebana; %d med ett E3-val; %d med ett manskligt spann.'
          % (len(POSE), len(D), len(spans)))
    print('  KONTROLLRAD (maste stamma med resultat.md, subframe.md, crossing-selection.md,')
    print('  multiswing.md -- gor den inte det har posebanorna drivit och inget nedan galler):')
    for tname, ivs in ((n1, {s: SR.interval(a1.get(s)) for s in D}),
                       (n2, {s: SR.interval(a2.get(s)) for s in D}),
                       ('spannet', spans)):
        d3 = [SR.point_to_interval(D[s]['p_e3'], ivs[s]) for s in D if ivs.get(s)]
        d4 = [SR.point_to_interval(SF.rnd(D[s]['p_e4']), ivs[s]) for s in D if ivs.get(s)]
        print('    mot %-8s E3 inne %d av %d (median %+.0f);  E4 RND inne %d av %d'
              % (tname, sum(1 for v in d3 if v == 0), len(d3), SR.median(d3),
                 sum(1 for v in d4 if v == 0), len(d4)))

    window_ok = None
    if args.section in ('all', 'window'):
        wrows = section_window(reg, args.poseDir)
        window_ok = all(len(r['view']) == len(r['est'])
                        and all(abs(a - b) <= 1e-3 for a, b in zip(r['view'], r['est']))
                        for r in wrows)
        print('\n  SVAR PA FRAGA 1: %s'
              % ('bedomarvyn och estimatorn fick SAMMA bildrutor, ruta for ruta, pa '
                 'alla %d svingar.' % len(wrows) if window_ok
                 else 'fonstren SKILJER sig -- se avvikelserna ovan.'))

    CL, per_clip = {}, {}
    if args.clipPoseDir and args.section in ('all', 'outside', 'downstream', 'c001', 'why',
                                             'stability'):
        CL = build_clips(args.clipPoseDir, reg)
        got = sorted(C['clip'] for C in CL.values() if C['cand'])
        if args.section in ('all', 'outside', 'downstream', 'why') and len(CL) >= 81:
            if got != sorted(PART_D_CLIPS):
                raise SystemExit('urvalet reproducerar inte S-35 del D:s 16 klipp.\n'
                                 '  har: %s\n  del D: %s' % (got, sorted(PART_D_CLIPS)))
            print('\n  KONTROLL: urvalet reproducerar S-35 del D:s %d klipp, namn for namn.'
                  % len(got))
        elif got:
            print('\n  VARNING: bara %d av 81 klipp har en helklippsbana -- urvalet ar '
                  'INTE jamforbart med del D:s 16.' % len(CL))
    if CL and args.section in ('all', 'outside', 'downstream', 'why'):
        _, per_clip = section_outside(CL, reg)
    if args.section in ('all', 'downstream'):
        section_downstream(reg, POSE, by_id, spans, D, per_clip, window_ok)
    if CL and args.section in ('all', 'c001'):
        section_c001(CL, reg, POSE, answers, flags)
    if CL and args.section in ('all', 'why'):
        section_why(CL, reg, flags, per_clip)
    if args.clipPoseDir and args.section in ('all', 'stability'):
        section_stability(reg, POSE, args.clipPoseDir, answers, spans, D, by_id)


if __name__ == '__main__':
    main()
