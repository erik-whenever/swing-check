# SPIKE, READ-ONLY (S-31): does MediaPipe's wrist track carry an OBSERVED top where the shaft
# line does not? Reads the trajectories written by run_pose.py; writes nothing but stdout.
#
#   <venv>/python.exe docs/shaft/top-from-pose/analyze_pose.py <poseDir> [--sweep]
#
# Three estimators, kept apart, no blending, no threshold fitted to Erik's answers.
import sys, json, math, argparse, statistics as st
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('poseDir', type=Path)
ap.add_argument('--reviewRows', type=Path, required=True)
ap.add_argument('--section', default='all')
args = ap.parse_args()

SW = {}
for p in sorted(args.poseDir.glob('*.json')):
    d = json.load(open(p))
    SW[d['swing']] = d

ROWS = json.load(open(args.reviewRows, encoding='utf-8'))
LOCAL = [r for r in ROWS if r.get('local')]


def med(xs):
    return st.median(xs) if xs else float('nan')


def q(xs, f):
    if not xs:
        return float('nan')
    s = sorted(xs)
    return s[min(len(s) - 1, int(f * len(s)))]


def env_frames(d):
    return [r for r in d['frames'] if r['inEnv']]


def mid(r):
    """Hands point = midpoint of wrists 15/16. None when no pose was returned."""
    if 'w' not in r:
        return None
    a, b = r['w']['15'], r['w']['16']
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def smooth(series, win):
    """Centred moving average over (t, value) with a gap-tolerant window of `win` samples."""
    if win <= 1:
        return list(series)
    out, h = [], win // 2
    for i in range(len(series)):
        lo, hi = max(0, i - h), min(len(series), i + h + 1)
        vals = [v for _, v in series[lo:hi] if v is not None]
        out.append((series[i][0], sum(vals) / len(vals) if vals else None))
    return out


def track(d):
    """Per-envelope-frame (t, midpoint) with None where no pose was returned."""
    return [(r['t'], mid(r)) for r in env_frames(d)]


# ---------------------------------------------------------------- estimators
def e1_highest(d, win=1):
    """E1: extremum in wrist y (highest hands) inside the envelope."""
    tr = track(d)
    ys = smooth([(t, None if m is None else m[1]) for t, m in tr], win)
    cand = [(v, t) for t, v in ys if v is not None]
    if not cand:
        return None
    return min(cand)[1]


def speed_series(d, win):
    tr = track(d)
    sp = []
    for i in range(len(tr)):
        j, k = i - 1, i + 1
        if j < 0 or k >= len(tr) or tr[j][1] is None or tr[k][1] is None:
            sp.append((tr[i][0], None))
            continue
        dt = tr[k][0] - tr[j][0]
        if dt <= 0:
            sp.append((tr[i][0], None))
            continue
        dx = tr[k][1][0] - tr[j][1][0]
        dy = tr[k][1][1] - tr[j][1][1]
        sp.append((tr[i][0], math.hypot(dx, dy) / dt))
    return smooth(sp, win)


def e2_slowest(d, win=3):
    """E2: minimum in 2D wrist speed between backswing and downswing.

    Non-circular definition: the fastest frame in the envelope is the downswing (hands peak
    around impact); walk BACKWARDS from it to the first local minimum. That dip is the
    transition. Free parameter: the smoothing window only.
    """
    sp = speed_series(d, win)
    idx = [i for i, (_, v) in enumerate(sp) if v is not None]
    if len(idx) < 3:
        return None
    imax = max(idx, key=lambda i: sp[i][1])
    i = imax
    while True:
        prev = [j for j in idx if j < i]
        if not prev:
            return sp[i][0]
        j = prev[-1]
        if sp[j][1] >= sp[i][1]:
            return sp[i][0]
        i = j


def vy_series(d, win):
    tr = track(d)
    vy = []
    for i in range(len(tr)):
        j, k = i - 1, i + 1
        if j < 0 or k >= len(tr) or tr[j][1] is None or tr[k][1] is None:
            vy.append((tr[i][0], None))
            continue
        dt = tr[k][0] - tr[j][0]
        vy.append((tr[i][0], None if dt <= 0 else (tr[k][1][1] - tr[j][1][1]) / dt))
    return smooth(vy, win)


def e3_signflip(d, hyst=0.10, win=3):
    """E3: sign flip in vertical velocity with hysteresis.

    Image y grows downwards: backswing has vy < -hyst (hands rising), downswing vy > +hyst.
    The chosen frame is the FIRST frame above +hyst that follows a frame below -hyst; the
    top is taken as the last frame at or before it whose vy is still <= 0 (the crossing).
    Free parameters: hysteresis band and smoothing window.
    """
    vy = vy_series(d, win)
    armed = False
    for i, (t, v) in enumerate(vy):
        if v is None:
            continue
        if v < -hyst:
            armed = True
            last_neg = i
        elif armed and v > hyst:
            j = i
            while j > 0 and (vy[j][1] is None or vy[j][1] > 0):
                j -= 1
            return vy[j][0]
    return None


EST = {
    'E1': lambda d, p: e1_highest(d, win=p.get('win', 1)),
    'E2': lambda d, p: e2_slowest(d, win=p.get('win', 3)),
    'E3': lambda d, p: e3_signflip(d, hyst=p.get('hyst', 0.10), win=p.get('win', 3)),
}


# ---------------------------------------------------------------- facit
def erik_top(row, d):
    """Erik's top for a row, as (point, interval) in seconds, or (None, None).

    `top`        -> the judged frame itself.
    `backswing*` -> his reason is that the club hangs more in the NEXT frame, so the top is
                    the next envelope frame; the true top lies in [judged, next].
    """
    ef = sorted(d['envFrames'], key=lambda f: f['t'])
    ts = [f['t'] for f in ef]
    if row['fid'] not in [f['id'] for f in ef]:
        return None, None
    i = [f['id'] for f in ef].index(row['fid'])
    ans = row['ans'].lower()
    if ans.startswith('top'):
        return ts[i], (ts[i], ts[i])
    if row['star'] or ans.startswith('backswing*'):
        if i + 1 < len(ts):
            return ts[i + 1], (ts[i], ts[i + 1])
    return None, None


def nearest_env_offset(d, row, t):
    """Estimator choice expressed as an offset in ENVELOPE frames from the judged frame."""
    ef = sorted(d['envFrames'], key=lambda f: f['t'])
    ids = [f['id'] for f in ef]
    if row['fid'] not in ids or t is None:
        return None
    i = ids.index(row['fid'])
    j = min(range(len(ef)), key=lambda k: abs(ef[k]['t'] - t))
    return j - i


def frame_step(d):
    ts = [r['t'] for r in env_frames(d)]
    diffs = [b - a for a, b in zip(ts, ts[1:]) if b > a]
    return med(diffs) if diffs else 1 / 30


# ---------------------------------------------------------------- step 1
def step1():
    print('=== STEG 1 — observerbarhet (grind fore estimator) ===')
    rows = []
    for k, d in SW.items():
        fr = env_frames(d)
        n = len(fr)
        nopose = sum(1 for r in fr if 'w' not in r)
        pr = {i: [r['w'][i][4] for r in fr if 'w' in r] for i in ('15', '16')}
        vi = {i: [r['w'][i][3] for r in fr if 'w' in r] for i in ('15', '16')}
        def longest_gap(pred):
            best = cur = 0
            for r in fr:
                cur = cur + 1 if pred(r) else 0
                best = max(best, cur)
            return best
        rows.append(dict(
            swing=k, n=n, nopose=nopose,
            presMed=min(med(pr['15']), med(pr['16'])),
            visMed=min(med(vi['15']), med(vi['16'])),
            presLo=sum(1 for r in fr if 'w' not in r or min(r['w']['15'][4], r['w']['16'][4]) < 0.5) / n,
            visLo=sum(1 for r in fr if 'w' not in r or min(r['w']['15'][3], r['w']['16'][3]) < 0.5) / n,
            gapPres=longest_gap(lambda r: 'w' not in r or min(r['w']['15'][4], r['w']['16'][4]) < 0.5),
            gapVis=longest_gap(lambda r: 'w' not in r or min(r['w']['15'][3], r['w']['16'][3]) < 0.5),
            gapPose=longest_gap(lambda r: 'w' not in r),
        ))
    tot = sum(r['n'] for r in rows)
    print(f"swingar {len(rows)}, envelope-bildrutor {tot}, utan pose alls {sum(r['nopose'] for r in rows)}")
    for key, lab in (('presMed', 'presence median (samsta handled)'), ('visMed', 'visibility median (samsta handled)')):
        xs = [r[key] for r in rows]
        print(f"  {lab}: median {med(xs):.3f}  p10 {q(xs,0.1):.3f}  p90 {q(xs,0.9):.3f}  min {min(xs):.3f}")
    for key, lab in (('presLo', 'andel bildrutor presence<0.5'), ('visLo', 'andel bildrutor visibility<0.5')):
        xs = [r[key] for r in rows]
        print(f"  {lab}: median {med(xs):.3f}  p90 {q(xs,0.9):.3f}  max {max(xs):.3f}  "
              f"(svingar med 0: {sum(1 for x in xs if x==0)})")
    for key, lab in (('gapPose', 'langsta lucka helt utan pose'), ('gapPres', 'langsta lucka presence<0.5'),
                     ('gapVis', 'langsta lucka visibility<0.5')):
        xs = [r[key] for r in rows]
        print(f"  {lab}: median {med(xs):.0f}  p90 {q(xs,0.9):.0f}  max {max(xs)} bildrutor")

    # where in the envelope do the sub-threshold frames sit?
    for lab, idx, thr in (('presence<0.5', 4, 0.5), ('visibility<0.5', 3, 0.5)):
        dec = [0] * 10
        cnt = [0] * 10
        for k, d in SW.items():
            fr = env_frames(d)
            for i, r in enumerate(fr):
                b = min(9, int(10 * i / len(fr)))
                cnt[b] += 1
                if 'w' not in r or min(r['w']['15'][idx], r['w']['16'][idx]) < thr:
                    dec[b] += 1
        print(f"  andel {lab} per tiondel av envelopen: " + ' '.join(f'{d/c:.2f}' for d, c in zip(dec, cnt)))

    print('\n--- de bedomda raderna, +-0,5 s runt Eriks topp ---')
    print(f"{'#':>3} {'sving':26} {'pres.med':>8} {'vis.med':>8} {'pres<0.5':>8} {'vis<0.5':>8} {'lucka':>6}")
    for row in sorted(LOCAL, key=lambda r: r['n']):
        d = SW.get(row['sw'])
        if not d:
            continue
        top, _ = erik_top(row, d)
        fr = [r for r in d['frames'] if top is not None and abs(r['t'] - top) <= 0.5 + 1e-6]
        if not fr:
            print(f"{row['n']:>3} {row['sw'][:26]:26} {'-':>8} (ingen utpekad topp)")
            continue
        pm = min(med([r['w']['15'][4] for r in fr if 'w' in r]), med([r['w']['16'][4] for r in fr if 'w' in r]))
        vm = min(med([r['w']['15'][3] for r in fr if 'w' in r]), med([r['w']['16'][3] for r in fr if 'w' in r]))
        pl = sum(1 for r in fr if 'w' not in r or min(r['w']['15'][4], r['w']['16'][4]) < 0.5)
        vl = sum(1 for r in fr if 'w' not in r or min(r['w']['15'][3], r['w']['16'][3]) < 0.5)
        gp = 0; cur = 0
        for r in fr:
            cur = cur + 1 if ('w' not in r or min(r['w']['15'][4], r['w']['16'][4]) < 0.5) else 0
            gp = max(gp, cur)
        print(f"{row['n']:>3} {row['sw'][:26]:26} {pm:8.3f} {vm:8.3f} {pl:4d}/{len(fr):<3d} {vl:4d}/{len(fr):<3d} {gp:>6}")


# ---------------------------------------------------------------- step 2 + 3
DEFAULTS = {'E1': {'win': 1}, 'E2': {'win': 3}, 'E3': {'hyst': 0.10, 'win': 3}}


def step23():
    print('\n=== STEG 2+3 — tre estimatorer, var for sig, mot facit ===')
    print('val per bedomd rad. dt = estimatorns tid minus Eriks topp (s / videobildrutor);')
    print('env = offset i envelope-bildrutor fran den bedomda rutan (0 = samma ruta).')
    for name in ('E1', 'E2', 'E3'):
        print(f'\n--- {name}  {DEFAULTS[name]} ---')
        print(f"{'#':>3} {'sving':22} {'Eriks svar':12} {'val (s)':>8} {'env':>4} {'dt (s)':>8} {'dt (rutor)':>10} {'dt intervall':>13}")
        for row in sorted(LOCAL, key=lambda r: r['n']):
            d = SW.get(row['sw'])
            if not d:
                continue
            t = EST[name](d, DEFAULTS[name])
            top, iv = erik_top(row, d)
            off = nearest_env_offset(d, row, t)
            step = frame_step(d)
            if t is None:
                print(f"{row['n']:>3} {row['sw'][:22]:22} {row['ans'][:12]:12} {'-':>8}")
                continue
            if top is None:
                print(f"{row['n']:>3} {row['sw'][:22]:22} {row['ans'][:12]:12} {t:8.3f} {off:>4} {'-':>8} {'-':>10} {'-':>13}")
            else:
                dt = t - top
                dv = 0.0 if iv[0] <= t <= iv[1] else (t - iv[1] if t > iv[1] else t - iv[0])
                print(f"{row['n']:>3} {row['sw'][:22]:22} {row['ans'][:12]:12} {t:8.3f} {off:>4} "
                      f"{dt:+8.3f} {dt/step:+10.1f} {dv:+8.3f} s")

    print('\n--- (a) diskriminering ---')
    print('Grupp A: rader dar Erik svarade nagot annat an `top` OCH ingen topp ligger intill')
    print('(1, 7, 11, 15, 19, 29). En traff = estimatorn valjer just den rutan (env-offset 0).')
    print('Grupp B: stjarnraderna (12, 16, 31, 32), dar den bedomda rutan ar underkanten pa')
    print("Eriks toppintervall -- ett val dar ar hogst en envelope-ruta for tidigt, inte ett fel.")
    A = [1, 7, 11, 15, 19, 29]
    B = [12, 16, 31, 32]
    for name in ('E1', 'E2', 'E3'):
        ha, hb = [], []
        for row in sorted(LOCAL, key=lambda r: r['n']):
            d = SW.get(row['sw'])
            if not d:
                continue
            t = EST[name](d, DEFAULTS[name])
            off = nearest_env_offset(d, row, t)
            if off != 0:
                continue
            if row['n'] in A:
                ha.append(row['n'])
            elif row['n'] in B:
                hb.append(row['n'])
        print(f'  {name}: grupp A {len(ha)} av {len(A)} {ha}   |   grupp B {len(hb)} av {len(B)} {hb}')

    print('\n--- var i envelopen landar estimatorn, alla 103 svingar (tiondel 0-9) ---')
    for name in ('E1', 'E2', 'E3'):
        dec = [0] * 10
        miss = 0
        for k, d in SW.items():
            t = EST[name](d, DEFAULTS[name])
            if t is None:
                miss += 1
                continue
            a, b = d['env']
            dec[min(9, max(0, int(10 * (t - a) / (b - a))))] += 1
        print(f"  {name}: " + ' '.join(f'{x:3d}' for x in dec) + f'   (utan val: {miss})')

    print('\n--- (b) avstand till Eriks topp, de rader dar en sadan finns ---')
    for name in ('E1', 'E2', 'E3'):
        ds, dfs, exact = [], [], 0
        per = []
        for row in sorted(LOCAL, key=lambda r: r['n']):
            d = SW.get(row['sw'])
            if not d:
                continue
            top, iv = erik_top(row, d)
            if top is None:
                continue
            t = EST[name](d, DEFAULTS[name])
            if t is None:
                per.append((row['n'], None))
                continue
            step = frame_step(d)
            dv = 0.0 if iv[0] - 1e-6 <= t <= iv[1] + 1e-6 else (t - iv[1] if t > iv[1] else t - iv[0])
            ds.append(abs(dv)); dfs.append(abs(dv) / step)
            if abs(dv) < 1e-6:
                exact += 1
            per.append((row['n'], dv))
        n = len([p for p in per if p[1] is not None])
        print(f"  {name}: n={n}  inne i Eriks intervall: {exact}  "
              f"median |dt| {med(ds):.3f} s / {med(dfs):.1f} rutor  max {max(ds):.3f} s")
        print('      per rad: ' + ', '.join(f"{a}:{'-' if b is None else f'{b:+.2f}s'}" for a, b in per))


# ---------------------------------------------------------------- step 4
SWEEPS = {
    'E1': [{'win': w} for w in (1, 3, 5, 7, 9)],
    'E2': [{'win': w} for w in (1, 3, 5, 7, 9)],
    'E3': [{'hyst': h, 'win': 3} for h in (0.02, 0.05, 0.10, 0.20, 0.40)],
}
SWEEPS_E3_WIN = [{'hyst': 0.10, 'win': w} for w in (1, 3, 5, 7, 9)]


def spread(name, params, swings):
    """How far the chosen frame moves across a parameter sweep, in video frames."""
    out = []
    for k, d in swings.items():
        step = frame_step(d)
        ts = [EST[name](d, p) for p in params]
        got = [t for t in ts if t is not None]
        if len(got) < 2:
            out.append((k, None, len(got)))
            continue
        out.append((k, (max(got) - min(got)) / step, len(got)))
    return out


def step4():
    print('\n=== STEG 4 — stabilitet: hur langt flyttar sig valet over parametersvepet? ===')
    jobs = [('E1', SWEEPS['E1'], 'utjamningsfonster 1-9 rutor'),
            ('E2', SWEEPS['E2'], 'utjamningsfonster 1-9 rutor'),
            ('E3', SWEEPS['E3'], 'hysteres 0,02-0,40 h/s (fonster 3)'),
            ('E3', SWEEPS_E3_WIN, 'utjamningsfonster 1-9 rutor (hysteres 0,10)')]
    for name, params, lab in jobs:
        res = spread(name, params, SW)
        vals = [v for _, v, _ in res if v is not None]
        miss = [k for k, v, n in res if v is None]
        print(f"\n  {name} — {lab}   (alla {len(SW)} svingar)")
        print(f"    median {med(vals):.0f} rutor  p90 {q(vals,0.9):.0f}  max {max(vals):.0f}  "
              f"star helt still: {sum(1 for v in vals if v < 0.5)}  flyttar >10 rutor: {sum(1 for v in vals if v > 10)}"
              f"  utan val vid >=2 parametrar: {len(miss)}")
        sub = {row['sw']: SW[row['sw']] for row in LOCAL if row['sw'] in SW}
        res2 = spread(name, params, sub)
        v2 = [v for _, v, _ in res2 if v is not None]
        print(f"    de {len(sub)} bedomda svingarna: median {med(v2):.0f} rutor, max {max(v2):.0f}")
        # per judged row with a top
        line = []
        for row in sorted(LOCAL, key=lambda r: r['n']):
            d = SW.get(row['sw'])
            if not d:
                continue
            top, _ = erik_top(row, d)
            if top is None:
                continue
            m = {a: b for a, b, _ in res2}.get(row['sw'])
            line.append(f"{row['n']}:{'-' if m is None else f'{m:.0f}'}")
        print('    rader med utpekad topp: ' + ', '.join(line))

    print('\n  --- traff mot Eriks topp over hela svepet (bar nagon parameter ratt svar?) ---')
    for name, params, lab in jobs:
        best = []
        for row in sorted(LOCAL, key=lambda r: r['n']):
            d = SW.get(row['sw'])
            if not d:
                continue
            top, iv = erik_top(row, d)
            if top is None:
                continue
            step = frame_step(d)
            ds = []
            for p in params:
                t = EST[name](d, p)
                if t is None:
                    continue
                dv = 0.0 if iv[0] - 1e-6 <= t <= iv[1] + 1e-6 else (t - iv[1] if t > iv[1] else t - iv[0])
                ds.append(abs(dv) / step)
            best.append((row['n'], min(ds) if ds else None))
        hit = sum(1 for _, b in best if b is not None and b < 0.5)
        print(f"    {name} ({lab}): basta parameter traffar intervallet i {hit} av {len(best)}; "
              + ', '.join(f"{a}:{'-' if b is None else f'{b:.0f}r'}" for a, b in best))


if args.section in ('all', '1'):
    step1()
if args.section in ('all', '23'):
    step23()
if args.section in ('all', '4'):
    step4()


def extra():
    """Two side checks: do E2 and E3 agree where there is no facit, and how wide is the
    plateau the estimators have to pick a single frame out of?"""
    print('\n=== SIDOKONTROLL ===')
    ds = []
    for k, d in SW.items():
        a, b = EST['E2'](d, DEFAULTS['E2']), EST['E3'](d, DEFAULTS['E3'])
        if a is None or b is None:
            continue
        ds.append(abs(a - b) / frame_step(d))
    print(f"E2 mot E3, alla {len(ds)} svingar med bada val: median {med(ds):.0f} rutor, "
          f"inom 3 rutor {sum(1 for x in ds if x <= 3)}, inom 10 {sum(1 for x in ds if x <= 10)}")

    print('\nplatans bredd vid toppen (rader med utpekad topp):')
    print(f"{'#':>3} {'hojdplata <1% H':>16} {'fartplata <20% av max':>22} {'fart vid Eriks topp':>20}")
    for row in sorted(LOCAL, key=lambda r: r['n']):
        d = SW.get(row['sw'])
        if not d:
            continue
        top, _ = erik_top(row, d)
        if top is None:
            continue
        step = frame_step(d)
        tr = [(t, m[1]) for t, m in track(d) if m is not None]
        ymin = min(v for _, v in tr)
        hplat = sum(1 for _, v in tr if v - ymin < 0.01)
        sp = [(t, v) for t, v in speed_series(d, DEFAULTS['E2']['win']) if v is not None]
        smax = max(v for _, v in sp)
        splat = sum(1 for _, v in sp if v < 0.20 * smax)
        near = min(sp, key=lambda x: abs(x[0] - top))
        print(f"{row['n']:>3} {hplat:>10} rutor {splat:>16} rutor {near[1]/smax:>19.2f} av max")


if args.section in ('all', 'x'):
    extra()


def e1_bounded():
    """POST HOC, added after E1's finish bias was visible -- NOT one of the three
    pre-registered estimators. `poseEnvelope.ts` already computes exactly this
    (`impact.topSec`: min wrist y bounded by the detected impact); it is reproduced here
    only to show what the production envelope detector already carries.
    """
    print('\n=== E1b (post hoc): E1 begransad till [envelope-start, impactSec] ===')
    print('Detta ar `impact.topSec` i src/lib/poseEnvelope.ts, inte en ny idé.')
    for row in sorted(LOCAL, key=lambda r: r['n']):
        d = SW.get(row['sw'])
        if not d:
            continue
        top, iv = erik_top(row, d)
        if top is None or d['impact'] is None:
            continue
        a = d['env'][0]
        tr = [(t, m[1]) for t, m in track(d) if m is not None and a <= t <= d['impact']]
        if not tr:
            continue
        t = min(tr, key=lambda x: x[1])[0]
        step = frame_step(d)
        dv = 0.0 if iv[0] - 1e-6 <= t <= iv[1] + 1e-6 else (t - iv[1] if t > iv[1] else t - iv[0])
        print(f"  rad {row['n']:>2}: val {t:.3f} s, impactSec {d['impact']}, "
              f"dt mot Eriks intervall {dv:+.3f} s / {dv/step:+.1f} rutor")


if args.section in ('all', 'b'):
    e1_bounded()
