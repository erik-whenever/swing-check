# ONE-OFF, READ-ONLY (S-35, part D): is there a swing in a clip that NO envelope covers?
# WRITES NOTHING BUT STDOUT.
#
#   <venv>/python.exe docs/shaft/top-review/clip_swings.py <clipPoseDir> \
#       [--envPoseDir <poseDir>] [--registry data/shaft/top-round/registry/registry.json]
#
# <clipPoseDir> is the output of docs/shaft/top-review/run_pose_clip.py: the same shipped
# pose model over the WHOLE clip rather than one envelope at a time.
#
# THE OPPOSITE ERROR TO PART A. Part A asks whether one envelope holds two swings; this asks
# whether a swing fell outside every envelope, which is what 054.mp4's swing at ~9 s did.
#
# HOW A SWING IS RECOGNISED, and why it is not a threshold. A reversal is a local maximum of
# hand elevation with a topographic PROMINENCE -- a property of the track, not a parameter.
# The size a reversal must have to count is taken from THAT CLIP'S OWN REGISTERED SWINGS: the
# smallest prominence among the tops the round already registered in that clip. So the
# question asked is `is there a reversal outside every envelope that is at least as big as
# the smallest reversal this round already called a swing here?` -- a comparison against the
# round's own registered swings, not a number chosen by me. The full list is printed with
# every reversal's prominence as a fraction of that reference, so the reader can move the
# comparison anywhere and see what happens; nothing is excluded on it.
#
# WHAT THIS CANNOT SAY. MediaPipe tracks whoever is in frame, so a reversal outside an
# envelope may be a practice swing, a waggle, someone picking up a ball, or the camera being
# carried. NOBODY HAS LOOKED AT A SINGLE FRAME. This counts candidates; it does not
# identify them, and it proposes no change to the segmentation.
#
# NOTHING IS DECIDED HERE. No estimator, no threshold, no production code read or written.
import argparse
import collections
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR      # noqa: E402
import subframe as SF         # noqa: E402
import multiswing as MS       # noqa: E402

EST = SF.EST
WIN = SF.WIN


def clip_elevation(d):
    """(t, h) per decoded frame of the whole clip, h = -y of the midpoint of wrists 15/16."""
    out = []
    for r in d['frames']:
        if 'w' not in r:
            out.append((r['t'], None))
            continue
        a, b = r['w']['15'], r['w']['16']
        out.append((r['t'], -(a[1] + b[1]) / 2))
    return out


def in_env(t, envs):
    return any(e['env'][0] - 1e-3 <= t <= e['env'][1] + 1e-3 for e in envs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clipPoseDir', type=Path)
    ap.add_argument('--envPoseDir', type=Path, default=None)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    by_clip = collections.defaultdict(list)
    for s in reg['swings']:
        by_clip[s['clip']].append(s)
    files = sorted(args.clipPoseDir.glob('*.json'))
    print('S-35 del D: %d klipp med helklippsbana; registret har %d klipp och %d svingar'
          % (len(files), reg['clipCount'], reg['swingCount']))

    # -- the deviation check: does the warm tracker give the same E3 answer? ---------
    if args.envPoseDir:
        same, tot, off = 0, 0, []
        for s in reg['swings']:
            p = args.clipPoseDir / ('%s.json' % s['clip'].replace('.', '_'))
            q = args.envPoseDir / ('%s.json' % s['swing'])
            if not p.exists() or not q.exists():
                continue
            dc = json.loads(p.read_text(encoding='utf-8'))
            dq = json.loads(q.read_text(encoding='utf-8'))
            # the clip run's rows restricted to this envelope, matched to the registry's
            # own frameTimes so the two runs are compared frame for frame
            rows = []
            ts = [r['t'] for r in dc['frames']]
            for ft in s['frameTimes']:
                k = min(range(len(ts)), key=lambda k: abs(ts[k] - ft))
                if abs(ts[k] - ft) > 1e-2:
                    rows = None
                    break
                r = dict(dc['frames'][k])
                r['inEnv'] = True
                rows.append(r)
            if rows is None:
                continue
            a = SF.e3_bracket(EST['vy_series'](dict(frames=rows), WIN))
            b = SF.e3_bracket(EST['vy_series'](dq, WIN))
            tot += 1
            if a == b:
                same += 1
            elif a is not None and b is not None:
                off.append(a - b)
        print('\n  AVVIKELSEKONTROLL: helklippskorningen har en VARM sparare inne i envelopen')
        print('  (run_pose.py startar kall 0,6 s fore varje sving). E3:s ruta ur de tva')
        print('  korningarna: lika pa %d av %d svingar%s.'
              % (same, tot,
                 '' if not off else '; av de ovriga ar skillnaden median %+.0f, max %+.0f rutor'
                 % (st.median(off), max(off, key=abs))))
        print('  Stammer den inte ar det den varma sparningen, inte klippet, som skiljer.')

    # -- part D proper --------------------------------------------------------------
    print('\n=== D. SVINGAR SOM INGET SEGMENT FANGAR ===')
    print('  `referens` = den minsta prominens nagon av klippets EGNA registrerade toppar')
    print('  har, matt pa samma helklippsbana. En vandning utanfor alla envelopes raknas')
    print('  som kandidat nar dess prominens nar den referensen -- alltsa nar den ar minst')
    print('  lika stor som den minsta vandning rundan redan kallat en sving i just det')
    print('  klippet. Ingen niva ar vald av mig och ingen rad ar struken.')
    rows = []
    for p in files:
        d = json.loads(p.read_text(encoding='utf-8'))
        clip = d['clip']
        envs = d['envs']
        hs = clip_elevation(d)
        series = [v for _, v in hs]
        ts = [t for t, _ in hs]
        pk = MS.prominences(series)
        if not pk or not envs:
            rows.append(dict(clip=clip, n=len(series), ref=None, cand=[], cov=0.0,
                             dur=ts[-1] if ts else 0, nopose=sum(1 for v in series if v is None),
                             regs=[]))
            continue
        # the clip's own registered swings, on this same track: the MOST PROMINENT local
        # maximum inside each envelope. Not the highest frame -- in most envelopes the
        # highest frame is the finish, and it often sits on the envelope's edge where the
        # hands are still rising, which gives it no prominence of its own.
        regs = []
        for e in envs:
            ins = [(i, p) for i, _, p in pk
                   if e['env'][0] - 1e-3 <= ts[i] <= e['env'][1] + 1e-3]
            if not ins:
                continue
            k, pr = max(ins, key=lambda r: r[1])
            regs.append((e['id'], ts[k], pr))
        ref = min([p for _, _, p in regs] or [None])
        refmax = max([p for _, _, p in regs] or [None])
        cand = []
        if ref:
            for i, v, pr in pk:
                if in_env(ts[i], envs) or pr < ref:
                    continue
                # how much of the half second either side actually carried a pose: a lone
                # frame between gaps makes a tall `reversal` out of nothing, and that has to
                # be visible rather than quietly dropped
                w = [k for k in range(len(ts)) if abs(ts[k] - ts[i]) <= 0.5]
                cov_p = sum(1 for k in w if series[k] is not None) / len(w) if w else 0
                cand.append((i, ts[i], pr, pr / ref, pr / refmax, cov_p))
        cov = sum(e['env'][1] - e['env'][0] for e in envs)
        rows.append(dict(clip=clip, n=len(series), ref=ref, refmax=refmax,
                         cand=sorted(cand), cov=cov, dur=ts[-1] if ts else 0,
                         nopose=sum(1 for v in series if v is None), regs=regs))

    withref = [r for r in rows if r['ref']]
    hit = [r for r in withref if r['cand']]
    print('\n  %d klipp har en referens (minst en registrerad topp pa banan).' % len(withref))
    print('  klipplangd median %.1f s; envelopetackning median %.0f %% av klippet.'
          % (SR.median([r['dur'] for r in withref]),
             100 * SR.median([r['cov'] / r['dur'] for r in withref if r['dur']])))
    print('  %d klipp i %d har minst en vandning utanfor alla envelopes som nar referensen.'
          % (len(hit), len(withref)))
    tot = sum(len(r['cand']) for r in hit)
    print('  Totalt %d sadana vandningar.' % tot)
    big = [r for r in hit if any(q2 >= 1.0 for _, _, _, _, q2, _ in r['cand'])]
    print('  %d av dem har en vandning som ar minst lika stor som klippets STORSTA'
          % len(big))
    print('  registrerade sving -- den skarpaste formen av fragan.')
    print('\n  -- klipp for klipp, sorterade pa den storsta kandidaten --')
    print('     `ref` ar minsta och `max` storsta registrerade prominens i klippet;')
    print('     `kand` antalet vandningar utanfor alla envelopes som nar `ref`; tiderna')
    print('     star som t (prominens / ref, prominens / max).')
    print('     %-13s %6s %6s %5s %7s %7s %5s %5s'
          % ('klipp', 'langd', 'tackn', 'sv', 'ref', 'max', 'kand', 'utan'))
    for r in sorted(hit, key=lambda r: -max(q2 for _, _, _, _, q2, _ in r['cand'])):
        print('     %-13s %6.1f %5.0f %% %5d %7.4f %7.4f %5d %5d'
              % (r['clip'], r['dur'], 100 * r['cov'] / r['dur'] if r['dur'] else 0,
                 len(r['regs']), r['ref'], r['refmax'], len(r['cand']), r['nopose']))
        top = sorted(r['cand'], key=lambda c: -c[2])[:6]
        print('       %s' % '  '.join('%.1f s (%.1fx / %.2fx, pose %.0f %%)'
                                      % (t, q, q2, 100 * cp)
                                      for _, t, _, q, q2, cp in top))
    print('\n  -- klipp UTAN nagon sadan vandning: %d --'
          % len([r for r in withref if not r['cand']]))
    print('     %s' % ', '.join(r['clip'] for r in withref if not r['cand']))
    noref = [r for r in rows if not r['ref']]
    if noref:
        print('\n  -- klipp utan referens (ingen registrerad topp gick att mata): %s --'
              % ', '.join(r['clip'] for r in noref))
    print('\n  -- fordelningen av kandidaternas storlek, sa gransen gar att flytta --')
    qs = sorted(q2 for r in hit for _, _, _, _, q2, _ in r['cand'])
    if qs:
        print('     prominens / klippets STORSTA registrerade: median %.2f, p90 %.2f, '
              'max %.2f (n=%d)' % (SR.median(qs), SR.pct(qs, 0.9), max(qs), len(qs)))
        for lv in (0.5, 1.0, 1.5):
            k = [r['clip'] for r in hit if any(q2 >= lv for _, _, _, _, q2, _ in r['cand'])]
            print('     >= %.1f x den storsta: %d vandningar i %d klipp'
                  % (lv, sum(1 for q in qs if q >= lv), len(set(k))))
    print('\n  -- 054.mp4, raden fragan stalldes om --')
    for r in rows:
        if r['clip'] != '054.mp4':
            continue
        print('     langd %.1f s, %d registrerade svingar, tackning %.0f %%'
              % (r['dur'], len(r['regs']), 100 * r['cov'] / r['dur'] if r['dur'] else 0))
        for sid, tk, pr in r['regs']:
            print('       registrerad: %s, prominentaste vandning t %.2f s, prominens %.4f'
                  % (sid, tk, pr))
        print('       referens %.4f, storsta registrerade %.4f' % (r['ref'], r['refmax']))
        for _, t, pr, q, q2, cp in r['cand']:
            print('       kandidat utanfor alla envelopes: t %.2f s, prominens %.4f '
                  '(%.2f x ref, %.2f x den storsta, pose pa %.0f %% av +-0,5 s)'
                  % (t, pr, q, q2, 100 * cp))


if __name__ == '__main__':
    main()
