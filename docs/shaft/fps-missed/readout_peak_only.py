# ONE-OFF, READ-OUT (S-49 stängning): would variant (ii) — only the finish-gate speed series
# from finish-gate-s49.patch, hold kept at 3 samples — change 4613/5406 in 15 fps?
# No new extraction and no segmenter run: reads the stored 15 fps pose
# (data/shaft/fps-missed/rates/own) and the candidate windows the OLD segmenter logged
# (data/shaft/fps-missed/fix/own-before.json), and replicates poseEnvelope.ts's finish gate
# on them. Validated by reproducing the S-49 diagnosis (longest settle run 1 and 2 today).
#
#   python docs/shaft/fps-missed/readout_peak_only.py
import json
import math

SMOOTH_HALF, ADDR_FRAC, MIN_ADDR_SEC, QUIET, TOL = 1, 0.15, 0.3, 0.04, 0.12


def hands(s):
    lm = s['landmarks']
    l = lm[15] if len(lm) > 15 else None
    r = lm[16] if len(lm) > 16 else None
    wl = (l.get('visibility', 1) if l else 0) or 0
    wr = (r.get('visibility', 1) if r else 0) or 0
    if wl + wr <= 0:
        return None
    return ((l['x'] * wl if l else 0) + (r['x'] * wr if r else 0)) / (wl + wr), \
           ((l['y'] * wl if l else 0) + (r['y'] * wr if r else 0)) / (wl + wr)


def interp(raw):
    n, out, last = len(raw), [None] * len(raw), -1
    for i, p in enumerate(raw):
        if p is None:
            continue
        if last < 0:
            for j in range(i):
                out[j] = p
        elif last < i - 1:
            a = raw[last]
            for j in range(last + 1, i):
                f = (j - last) / (i - last)
                out[j] = (a[0] + (p[0] - a[0]) * f, a[1] + (p[1] - a[1]) * f)
        out[i] = p
        last = i
    for j in range(last + 1, n):
        out[j] = raw[last]
    return out


def smooth(v, w):
    out = []
    for i in range(len(v)):
        s = k = 0
        for j, wj in zip((-1, 0, 1), w):
            if 0 <= i + j < len(v):
                s += v[i + j] * wj
                k += wj
        out.append(s / k)
    return out


def speed_series(p, t, dt, w):
    xs, ys = smooth([q[0] for q in p], w), smooth([q[1] for q in p], w)
    sp = [0.0] + [math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / ((t[i] - t[i - 1]) or dt) for i in range(1, len(p))]
    return xs, ys, sp, smooth(sp, w)


def longest_settle(samples, variant):
    t = [s['t'] for s in samples]
    dts = sorted(t[i] - t[i - 1] for i in range(1, len(t)))
    dt = dts[len(dts) // 2]
    filled = interp([hands(s) for s in samples])
    third = [1 / 3] * 3
    xs, ys, sp, sm = speed_series(filled, t, dt, third)
    vy = [0.0] + [(ys[i] - ys[i - 1]) / ((t[i] - t[i - 1]) or dt) for i in range(1, len(t))]
    peak = max(sm)
    thr = peak * ADDR_FRAC
    need = max(2, round(MIN_ADDR_SEC / dt))
    run = 0
    for i, v in enumerate(sm):
        run = run + 1 if v < thr else 0
        if run >= need:
            a0, a1 = i - need + 1, i
            break
    addr = sorted(ys[a0:a1 + 1])[(a1 - a0 + 1) // 2]
    start = next(i for i in range(a1 + 1, len(t)) if sm[i] >= thr)
    while start > a1 + 1 and sm[start - 1] > QUIET:
        start -= 1
    best, pas = -1, -1
    for i in range(start + 1, len(t)):
        if vy[i] > 0 and abs(ys[i] - addr) <= TOL and sm[i] > best:
            best, pas = sm[i], i
    fs = sm
    if variant != 'today':
        ref = (2 * SMOOTH_HALF * (SMOOTH_HALF + 1) / 3 + 1 / 12) * (1 / 30) ** 2
        a = min(1 / 3, max(0.0, (ref / dt ** 2 - 1 / 12) / 4))
        fs = speed_series(filled, t, dt, [a, 1 - 2 * a, a])[3]
    settle = max(fs) * 0.2
    longest = run = 0
    for i in range(pas + 1, len(t)):
        run = run + 1 if fs[i] < settle else 0
        longest = max(longest, run)
    return dict(peak=round(max(fs), 3), longestRun=longest, passSec=round(t[pas], 2))


before = {(r['clip'], r['rate']): r for r in json.load(open('data/shaft/fps-missed/fix/own-before.json'))}
for clip in ('IMG_4613.MP4', 'IMG_5406.MP4'):
    data = json.load(open('data/shaft/fps-missed/rates/own/%s.r15.json' % clip.replace('.', '_')))
    for rej in before[(clip, 15)]['prod']['rejected']:
        seg = [s for s in data['samples'] if rej['candStartSec'] - 1e-9 <= s['t'] <= rej['candEndSec'] + 1e-9]
        if len(seg) < 6:
            continue
        print(clip, '%.2f-%.2f' % (rej['candStartSec'], rej['candEndSec']), rej['reason'][:30])
        for v in ('today', 'peak-only'):
            print('   %-9s' % v, longest_settle(seg, v), 'needs 3 (2 with the full patch)')
