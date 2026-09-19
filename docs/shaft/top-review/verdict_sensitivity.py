# ONE-OFF, READ-ONLY (S-39): does the frame the top is set on change the OUTCOME of the
# three top-anchored measurements? WRITES NOTHING BUT STDOUT (plus a bridge file in --work).
#
#   <venv>/python.exe docs/shaft/top-review/verdict_sensitivity.py <poseDir> \
#       --clipPoseDir <clipPoseDir> --denseDir <denseDir> --work <tmp> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section f1|f2|f3|f4|f5|all]
#
# THE KEY IS ALREADY SEEN. resultat.md, subframe.md, crossing-selection.md, multiswing.md,
# envelope-audit.md, e2-and-floor.md and hard-core.md are all written and read, so the risk
# here is not measurement error, it is FITTING. Therefore: no parameter swept, none tuned,
# nothing chosen. The offsets +-1/2/3/5 are the ones the task named. E4 is subframe.py's own
# bracket + interpolation, unchanged. The human intervals are the annotators' own.
#
# EVERYTHING IS MEASURED WARM -- run_pose_clip.py's whole-clip trajectories, the
# configuration e2-and-floor.md section 1 showed production runs. The COLD run is loaded for
# exactly one purpose: the control line, which must reproduce S-32 to S-38 or this stops.
#
# NOTHING IS DECIDED HERE. No threshold, no estimator, no classifier, no calibration, no
# shift, no change to S-30's gate, no production code written. src/lib/shaft/measure/,
# NEAR_VERTICAL_GATE_DEG, ON_PLANE_BAND_DEG and the sign convention are untouched -- they are
# IMPORTED and called through verdict_outcomes.ts, never re-implemented here.
import argparse
import collections
import json
import math
import statistics as st
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR          # noqa: E402  -- reused, never re-implemented
import subframe as SF             # noqa: E402
import crossing_selection as CS   # noqa: E402
import multiswing as MS           # noqa: E402
import envelope_audit as EA       # noqa: E402
import e2_and_floor as E2F        # noqa: E402
import hard_core as HC            # noqa: E402

EST = SF.EST
HYST, WIN = SF.HYST, SF.WIN
ESTS = HC.ESTS
SRC = Path('src') / 'lib'

# The task's own offsets. Not swept, not chosen here.
OFFSETS = [-5, -3, -2, -1, 1, 2, 3, 5]

# The three top-anchored measurements, by the id production gives them.
MEAS = [('tso', 'top-shaft-orientation'),
        ('p4', 'shaft-position-p4'),
        ('sabp', 'shaft-angle-by-phase (top-hinken)')]

# HANDEDNESS IS AN ASSUMPTION, NOT A MEASUREMENT. `handedness` is `unknown` on all 103
# swings (docs/shaft/STATUS.md section 4), and `top-shaft-orientation` REJECTS a swing with
# no handedness before it looks at a frame. With the production value there is no outcome to
# move, so the run passes `right` and the report says so in its first paragraph. Two swings
# are confirmed mirrored (`S32-075`, `S32-017`, both 093.mp4) and are wrong under it; they
# are named rather than dropped.
HANDEDNESS = 'right'


# -- the bridge to production code --------------------------------------------

def build_bridge(work):
    """esbuild the TS bridge. It imports src/lib/shaft/measure/ and calls it; if that no
    longer builds, this stops rather than measuring something else."""
    src = Path('docs/shaft/top-review/verdict_outcomes.ts')
    out = work / 'verdict_outcomes.mjs'
    esbuild = Path('node_modules/.bin/esbuild')
    # On Windows the extensionless file is a shell script CreateProcess cannot run; the
    # .cmd beside it is the one that works, so it wins where it exists.
    if Path(str(esbuild) + '.cmd').exists():
        esbuild = Path(str(esbuild) + '.cmd')
    if not esbuild.exists():
        raise SystemExit('esbuild saknas -- kor npm install')
    subprocess.run([str(esbuild), str(src), '--bundle', '--platform=node', '--format=esm',
                    '--outfile=%s' % out], check=True,
                   stdout=subprocess.DEVNULL, stderr=None)
    return out


def run_bridge(bridge, payload, work):
    infile = work / 'verdict_in.json'
    infile.write_text(json.dumps(payload), encoding='utf-8')
    with open(infile, 'rb') as fh:
        res = subprocess.run(['node', str(bridge)], stdin=fh, check=True,
                             stdout=subprocess.PIPE)
    return json.loads(res.stdout.decode('utf-8'))


# -- outcomes ------------------------------------------------------------------

def verdict(res, key):
    """The production OUTCOME of one measurement on one candidate top frame.

    `top-shaft-orientation` is the only one of the three with a categorical result in
    production code: across-the-line / on-plane / laid-off / cannot-determine. The other two
    return a NUMBER and have no pass/fail anywhere in src/ -- see the report's section 1.
    Their only production-defined outcome is `answers` vs `no value`, and that is what is
    reported for them. No threshold is invented here to manufacture a third one.
    """
    if res.get('outside'):
        return 'utanfor-envelopen'
    m = res[key]
    if not m['answers']:
        why = [r for r in m['reasons'] if r != 'sparse-usable-frames']
        if not why:
            # `shaft-angle-by-phase` answers as a MEASUREMENT while its `top` bucket is
            # absent, so the measurement-level reasons can be empty. What is absent then is
            # the top frame itself: it did not survive plausibility and never reached the
            # bucket. The frame's own flag is the honest reason.
            why = res.get('frameReasons') or ['top-rutan-forkastad']
        return 'inget-svar:%s' % ','.join(sorted(set(why)))
    if key == 'tso':
        return m['category']
    return 'svar'


def answered(res, key):
    return not res.get('outside') and res[key]['answers']


def level_of(res, key):
    if res.get('outside'):
        return 'utanfor-envelopen'
    if key == 'sabp':
        # The `top` bucket's OWN level. The measurement-level one is set by the other
        # phase buckets and cannot move when only the top frame moves.
        return res[key]['topLevel'] or 'inget-svar'
    return res[key]['level']


def pct(a, b):
    return '%5.1f %%' % (100.0 * a / b) if b else '   -- '


def clips_of(sids, by_id):
    return len({by_id[s]['clip'] for s in sids})


# -- assembling the payload ----------------------------------------------------

def load_dense(dense_dir, reg):
    """The shipped shaft detector's output, one row per ENVELOPE video frame.

    run_dense.py (S-28) is used unchanged. Every swing's rows are checked frame by frame
    against the registry's own `frameTimes`; a mismatch stops the run, because a detection
    series that is not the same frames as the pose series would compare two different
    swings and look like a finding.
    """
    out = {}
    for s in reg['swings']:
        p = Path(dense_dir) / ('%s.json' % s['swing'])
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        ts = [r['t'] for r in d['frames']]
        if len(ts) != len(s['frameTimes']) or any(
                abs(a - b) > 1e-3 for a, b in zip(ts, s['frameTimes'])):
            raise SystemExit('detektorbanan och registrets frameTimes ar inte samma rutor '
                             'for %s (%d mot %d)'
                             % (s['swing'], len(ts), len(s['frameTimes'])))
        out[s['id']] = d
    return out


def clip_landmarks(clip_pose_dir, reg):
    """{swing id: [per envelope frame: {landmark index: [x, y, visibility]}]} out of the WARM
    whole-clip pose run, matched frame by frame on time -- E2F.build_warm's own construction,
    so the body reference and the estimator read the same rutor."""
    out = {}
    for s in reg['swings']:
        p = Path(clip_pose_dir) / ('%s.json' % s['clip'].replace('.', '_'))
        if not p.exists():
            continue
        dc = json.loads(p.read_text(encoding='utf-8'))
        ts = [r['t'] for r in dc['frames']]
        rows, ok = [], True
        for ft in s['frameTimes']:
            k = EA.nearest(ts, ft)
            if abs(ts[k] - ft) > 1e-2:
                ok = False
                break
            r = dc['frames'][k]
            lm = {}
            for grp in ('w', 'x'):
                for idx, v in (r.get(grp) or {}).items():
                    # `w` rows are [x, y, z, visibility, presence]; `x` rows are
                    # [x, y, visibility, presence]. fromDetection.ts reads x, y and
                    # visibility, and MIN_LANDMARK_VISIBILITY does the rest.
                    lm[idx] = [v[0], v[1], v[3] if grp == 'w' else v[2]]
            rows.append(lm)
        if ok:
            out[s['id']] = rows
    return out


VIEW = {'dtl': 'dtl', 'face_on': 'face-on'}


def payload_for(reg, by_id, dense, lms, warm_ch, cold_ch, spans, ivs1, ivs2, n1, n2):
    """One entry per swing, with every candidate top frame the four questions need.

    Indices are 0-BASED into the envelope here (the TS side indexes an array); everything
    printed by this script is the registry's own 1-based frame index, as in every earlier
    round.
    """
    swings, cands = [], {}
    for s in reg['swings']:
        sid = s['id']
        if sid not in dense or sid not in lms:
            continue
        e4 = warm_ch.get(sid, {}).get('E4')
        c = []
        if e4 is not None:
            c.append(('E4', e4))
            for k in OFFSETS:
                c.append(('E4%+d' % k, e4 + k))
        # Two controls for the same question, neither of them a new estimator:
        # E4 off the COLD run (the meaningless disturbance e2-and-floor.md section 4
        # measured as the floor) and E3, which is E4's own bracket before interpolation
        # and therefore never more than a frame away.
        c4 = cold_ch.get(sid, {}).get('E4')
        if c4 is not None:
            c.append(('E4kall', c4))
        e3 = warm_ch.get(sid, {}).get('E3')
        if e3 is not None:
            c.append(('E3', e3))
        for nm, ivs in ((n1, ivs1), (n2, ivs2)):
            iv = ivs.get(sid)
            if iv:
                c.append(('%s_lo' % nm, iv[0]))
                c.append(('%s_hi' % nm, iv[1]))
        sp = spans.get(sid)
        if sp:
            c.append(('SPAN_lo', sp[0]))
            c.append(('SPAN_hi', sp[1]))
            c.append(('SPAN_mid', SF.rnd(SR.mid(sp))))
        cands[sid] = dict(c)
        swings.append(dict(
            id=sid, clip=s['clip'], swingIndex=int(s['swing'].rsplit('_s', 1)[1]),
            cameraAngle=VIEW.get(s['viewBucket']),
            imageSize=dict(width=s['size'][0], height=s['size'][1]),
            modelFile='shaft-v2.onnx',
            frames=[dict(t=r['t'],
                         **({} if 'bx' not in r else
                            dict(bx=r['bx'], by=r['by'], bs=r['bs'],
                                 hx=r['hx'], hy=r['hy'], hs=r['hs'])),
                         lm=lm)
                    for r, lm in zip(dense[sid]['frames'], lms[sid])],
            candidates=[dict(label=lab, index=i - 1) for lab, i in c],
        ))
    return dict(handedness=HANDEDNESS, swings=swings), cands


# -- FRAGA 1 -------------------------------------------------------------------

def section_f1(OUT, cands, by_id, spans):
    print('\n=== FRAGA 1. BILDRUTEFEL -> UTFALLSFEL ===')
    print('  E4:s VARMA val flyttas +-1, +-2, +-3 och +-5 bildrutor. Fragan ar hur ofta')
    print('  UTFALLET byter, inte hur mycket vardet andras. Utfallet ar det produktionen')
    print('  sjalv returnerar: for top-shaft-orientation kategorin (across-the-line /')
    print('  on-plane / laid-off / cannot-determine), for de tva andra svar mot inget svar')
    print('  -- de har ingen pass/fail nagonstans i src/ (se rapportens section 1).')
    print('  Ingen troskel satts har for att tillverka en.')
    pop = [sid for sid, r in OUT.items() if 'E4' in r and not r['E4'].get('outside')]
    print('  Populationen ar varje sving med ett E4-val och en detektorbana: %d rader i %d'
          % (len(pop), clips_of(pop, by_id)))
    print('  klipp. Den ar storre an de 91 med manskligt spann -- fraga 1 behover inget facit.')
    for key, name in MEAS:
        print('\n  -- %s --' % name)
        print('     Vanster block: ALLA rader med bada rutorna. Hoger block: bara de rader')
        print('     dar matvardet FAKTISKT SVARAR pa E4:s egen ruta -- en rad som ar tyst')
        print('     i bada andarna kan per konstruktion inte byta utfall och spader ut')
        print('     andelen till vanster.')
        print('     %-7s %5s %6s %8s | %5s %6s %8s | %s'
              % ('skift', 'n', 'byter', 'andel', 'n', 'byter', 'andel', 'utanfor envelopen'))
        for k in OFFSETS:
            n = flip = outside = nl = flipl = 0
            for sid, res in OUT.items():
                base = res.get('E4')
                shift = res.get('E4%+d' % k)
                if base is None or shift is None:
                    continue
                if shift.get('outside'):
                    outside += 1
                    continue
                n += 1
                changed = verdict(base, key) != verdict(shift, key)
                flip += changed
                if answered(base, key):
                    nl += 1
                    flipl += changed
            print('     %+6d %5d %6d %8s | %5d %6d %8s | %d rader saknar rutan helt'
                  % (k, n, flip, pct(flip, n), nl, flipl, pct(flipl, nl), outside))
        # The cumulative reading: a shift of AT MOST k, in either direction.
        print('     -- kumulativt: minst ett av skiften inom +-k byter utfall --')
        for kmax in (1, 2, 3, 5):
            n = any_flip = nl = any_flipl = 0
            names = []
            for sid, res in OUT.items():
                base = res.get('E4')
                if base is None:
                    continue
                shifts = [res.get('E4%+d' % k) for k in OFFSETS if abs(k) <= kmax]
                shifts = [x for x in shifts if x is not None and not x.get('outside')]
                if not shifts:
                    continue
                n += 1
                hit = any(verdict(base, key) != verdict(x, key) for x in shifts)
                any_flip += hit
                if answered(base, key):
                    nl += 1
                    any_flipl += hit
                    if hit and kmax == 1:
                        names.append(sid)
            print('       inom +-%d ruta: %d av %d (%s)  |  bland de svarande: %d av %d (%s)'
                  % (kmax, any_flip, n, pct(any_flip, n), any_flipl, nl, pct(any_flipl, nl)))
            if kmax == 1 and names:
                print('         raderna som byter redan vid +-1: %s' % ', '.join(sorted(names)))

    print('\n  -- top-shaft-orientation: VILKEN SORTS byte det ar --')
    print('     (a) kallat utfall -> ett ANNAT kallat utfall (across/on-plane/laid-off/')
    print('         cannot-determine sinsemellan) -- matvardet sager nagot annat om svingen.')
    print('     (b) svar -> tystnad eller tvartom -- matvardet slutar eller borjar svara.')
    for k in OFFSETS:
        a = b = n = 0
        for sid, res in OUT.items():
            base, shift = res.get('E4'), res.get('E4%+d' % k)
            if base is None or shift is None or shift.get('outside'):
                continue
            va, vb = verdict(base, 'tso'), verdict(shift, 'tso')
            if va == vb:
                continue
            n += 1
            if va.startswith('inget-svar') or vb.startswith('inget-svar'):
                b += 1
            else:
                a += 1
        print('     skift %+d: %d byten -- %d av typ (a), %d av typ (b)' % (k, n, a, b))
    print('     Sarskilt: hur ofta byter riktningen TECKEN, alltsa across-the-line <->')
    print('     laid-off? Det ar det grovsta felet matvardet kan gora.')
    for k in OFFSETS:
        sign = 0
        for sid, res in OUT.items():
            base, shift = res.get('E4'), res.get('E4%+d' % k)
            if base is None or shift is None or shift.get('outside'):
                continue
            va, vb = verdict(base, 'tso'), verdict(shift, 'tso')
            if {va, vb} == {'across-the-line', 'laid-off'}:
                sign += 1
        print('       skift %+d: %d teckenbyten' % (k, sign))

    print('\n  -- vilka utfall det ar, pa E4:s egen ruta (fordelningen som byter) --')
    for key, name in MEAS:
        c = collections.Counter(verdict(r['E4'], key) for r in OUT.values() if 'E4' in r)
        print('     %-34s %s' % (name, ';  '.join('%s %d' % (k, v)
                                                  for k, v in c.most_common())))

    print('\n  -- KONTROLLEN: vad gor en storning som INTE ar ett bildrutefel? --')
    print('     (a) E4 ur den KALLA korningen mot E4 ur den varma. Samma modell, samma')
    print('         vikter, samma bildrutor -- bara sparartillstandet skiljer, och')
    print('         e2-and-floor.md section 4 matte att den flyttar rutan |median| 1 ruta.')
    print('         Byter UTFALLET med den, ar utfallet inte reproducerbart ens utan ett')
    print('         bildrutefel.')
    print('     (b) E3 mot E4. E4 ar E3:s egen bracket plus interpolation, sa de kan per')
    print('         konstruktion inte ligga mer an 1 ruta isar.')
    for lab, other in (('E4 kall mot E4 varm', 'E4kall'), ('E3 mot E4', 'E3')):
        print('     -- %s --' % lab)
        for key, name in MEAS:
            n = flip = nsame = 0
            for sid, res in OUT.items():
                a, b = res.get('E4'), res.get(other)
                if a is None or b is None or a.get('outside') or b.get('outside'):
                    continue
                n += 1
                nsame += a['index'] == b['index']
                flip += verdict(a, key) != verdict(b, key)
            print('        %-34s %d av %d byter (%s); rutan ar lika pa %d av %d'
                  % (name, flip, n, pct(flip, n), nsame, n))

    print('\n  -- kontroll: byter KVALITETSNIVAN (usable/uncertain/rejected)? --')
    print('     Samma skift, samma rader; nivan ar den andra utfallsaxeln som finns i koden.')
    for key, name in MEAS:
        line = []
        for k in OFFSETS:
            n = flip = 0
            for sid, res in OUT.items():
                base, shift = res.get('E4'), res.get('E4%+d' % k)
                if base is None or shift is None or shift.get('outside'):
                    continue
                n += 1
                flip += level_of(base, key) != level_of(shift, key)
            line.append('%+d: %d/%d' % (k, flip, n))
        print('     %-34s %s' % (name, '  '.join(line)))


# -- FRAGA 2 -------------------------------------------------------------------

def section_f2(OUT, by_id, ivs1, ivs2, spans, n1, n2):
    print('\n=== FRAGA 2. SAMMA TEST MOT MANNISKORNAS EGNA INTERVALLGRANSER ===')
    print('  Ingen estimator inblandad: toppen satts pa intervallets FORSTA och SISTA ruta,')
    print('  och fragan ar om utfallet skiljer sig mellan de tva. Racker en bedomares eget')
    print('  spann for att vanda ett utfall ar matvardet for kansligt oavsett estimator.')
    for lab, a, b in (('%s eget intervall' % n1, '%s_lo' % n1, '%s_hi' % n1),
                      ('%s eget intervall' % n2, '%s_lo' % n2, '%s_hi' % n2),
                      ('spannet (unionen)', 'SPAN_lo', 'SPAN_hi')):
        print('\n  -- %s --' % lab)
        print('     %-34s %5s %6s %8s | %5s %6s %8s | %s'
              % ('matvarde', 'n', 'byter', 'andel', 'n sv', 'byter', 'andel', 'intervallbredd'))
        for key, name in MEAS:
            n = flip = nl = flipl = 0
            widths, flipw, names = [], [], []
            for sid, res in OUT.items():
                x, y = res.get(a), res.get(b)
                if x is None or y is None or x.get('outside') or y.get('outside'):
                    continue
                n += 1
                w = abs(y['index'] - x['index']) + 1
                widths.append(w)
                changed = verdict(x, key) != verdict(y, key)
                flip += changed
                if answered(x, key) or answered(y, key):
                    nl += 1
                    flipl += changed
                if changed:
                    flipw.append(w)
                    names.append('%s(%s->%s, %d rutor)'
                                 % (sid, verdict(x, key), verdict(y, key), w))
            print('     %-34s %5d %6d %8s | %5d %6d %8s | median %s (bytarna: %s)'
                  % (name, n, flip, pct(flip, n), nl, flipl, pct(flipl, nl),
                     '%.0f' % st.median(widths) if widths else '--',
                     '%.0f' % st.median(flipw) if flipw else '--'))
            for x in names:
                print('        %s' % x)
        # Width is the obvious confound: a one-frame interval cannot flip anything.
        n_one = sum(1 for sid, res in OUT.items()
                    if res.get(a) and res.get(b)
                    and not res[a].get('outside') and not res[b].get('outside')
                    and res[a]['index'] == res[b]['index'])
        print('     (%d av raderna har ett intervall pa EN ruta och kan per konstruktion '
              'inte byta nagot.)' % n_one)


# -- FRAGA 3 -------------------------------------------------------------------

def section_f3(OUT, by_id, spans):
    print('\n=== FRAGA 3. E4 MOT FACIT, I UTFALL ===')
    print('  Pa de rader med ett manskligt spann: hur ofta ger E4:s val SAMMA utfall som en')
    print('  topp satt mitt i spannet (SPAN_mid, halv-upp avrundad)? Det ar det')
    print('  produktrelevanta mattet -- inte andel inne i spannet.')
    print('\n     %-34s %6s %6s %8s %8s' % ('matvarde', 'n', 'lika', 'andel', 'klipp'))
    detail = collections.defaultdict(list)
    for key, name in MEAS:
        n = same = 0
        sids = []
        for sid, res in OUT.items():
            a, b = res.get('E4'), res.get('SPAN_mid')
            if a is None or b is None or a.get('outside') or b.get('outside'):
                continue
            n += 1
            sids.append(sid)
            if verdict(a, key) == verdict(b, key):
                same += 1
            else:
                detail[key].append((sid, verdict(a, key), verdict(b, key),
                                    a['index'] - b['index']))
        print('     %-34s %6d %6d %8s %8d' % (name, n, same, pct(same, n), clips_of(sids, by_id)))
    print('\n  -- uppdelat pa om E4 lag INNE i spannet eller inte (spannet ar hard-core.md')
    print('     section 1:s eget, och uppdelningen ar gjord pa svaret -- inte pa nagot som')
    print('     matts efterat) --')
    print('     %-34s %-10s %5s %6s %8s' % ('matvarde', 'E4', 'n', 'lika', 'andel'))
    for key, name in MEAS:
        for lab, want in (('inne', True), ('utanfor', False)):
            n = same = 0
            for sid, res in OUT.items():
                a, b = res.get('E4'), res.get('SPAN_mid')
                if a is None or b is None or a.get('outside') or b.get('outside'):
                    continue
                sp = spans.get(sid)
                if sp is None:
                    continue
                inside = SR.point_to_interval(a['index'] + 1, sp) == 0
                if inside != want:
                    continue
                n += 1
                same += verdict(a, key) == verdict(b, key)
            print('     %-34s %-10s %5d %6d %8s' % (name, lab, n, same, pct(same, n)))

    print('\n  -- jamforelsetalet: E4 inne i spannet ar 44 av 91 (48 %). Andelen SAMMA UTFALL')
    print('     ar en annan fraga och far inte lasas som att estimatorn blivit battre.')
    for key, name in MEAS:
        if not detail[key]:
            continue
        print('\n  -- %s: raderna dar utfallet skiljer sig --' % name)
        print('     %-9s %-11s %-22s %-22s %s'
              % ('id', 'klipp', 'E4:s utfall', 'mitt i spannet', 'rutor isar'))
        for sid, va, vb, d in sorted(detail[key]):
            print('     %-9s %-11s %-22s %-22s %+d'
                  % (sid, by_id[sid]['clip'], va, vb, d))
    print('\n  -- och samma fraga stalld mot vardera INTERVALLETS mitt vore en tredje fraga;')
    print('     den stalls inte har. SPAN_mid ar unionens mitt, sa den ar den generosaste')
    print('     lasningen av "mitt i manniskornas intervall".')


# -- FRAGA 4 -------------------------------------------------------------------

def section_f4(reg, by_id, warm, warm_ch, spans, dense, lms, OUT, answers):
    print('\n=== FRAGA 4. DE 4 OFORKLARADE RADERNA I KARNAN ===')
    print('  Karnan, ankarmangden och vaxlingsmangden ar hard_core.py:s och e2_and_floor.py:s')
    print('  egna funktioner, importerade -- ingenting ar raknat om har.')
    core, rest = HC.build_core(warm_ch, spans)
    A = E2F.anchor_sets(warm, reg, spans, by_id)
    noanchor = {sid for sid, v in A.items() if not v['adm']}
    nocross = set()
    for sid in sorted(spans):
        if sid not in warm:
            continue
        vy = EST['vy_series'](warm[sid], WIN)
        lo, hi = spans[sid]
        if not [j for j in MS.unarmed_crossings(vy) if j + 1 <= hi and j + 2 >= lo]:
            nocross.add(sid)
    unexplained = sorted(set(core) - noanchor - nocross)
    print('  karnan %d rader; utan ankarruta %d; utan vaxling som overlappar spannet %d;'
          % (len(core), len(noanchor), len(nocross)))
    print('  KVAR UTAN NAGON AV DE TVA FORKLARINGARNA: %d rader i %d klipp -- %s'
          % (len(unexplained), clips_of(unexplained, by_id), ', '.join(unexplained)))
    print('\n  BESKRIVNING, INGA SLUTSATSER. Vad banan gor dar, rad for rad.')
    for sid in unexplained:
        s = by_id[sid]
        lo, hi = spans[sid]
        d = warm[sid]
        vy_s = EST['vy_series'](d, WIN)
        vy_r = EST['vy_series'](d, 1)
        tr = EST['track'](d)
        ts = [r['t'] for r in EST['env_frames'](d)]
        arm = CS.crossings(vy_s)
        raw = MS.unarmed_crossings(vy_s)
        adm = A[sid]['adm']
        print('\n  %s  %s  envelope %d rutor (%.3f s), spann %d-%d (%d rutor breda)'
              % (sid, s['clip'], len(ts), ts[-1] - ts[0], lo, hi, hi - lo + 1))
        print('     flaggor: %s%s%s%s'
              % ('lang envelope (>3,0 s)' if s['slowmo'] else 'normal envelopelangd',
                 ', utan sakert nedslag' if not s['hasConfidentImpact'] else '',
                 ', vy=%s' % s['viewBucket'],
                 ', kontroll' if s['isControl'] else ''))
        print('     estimatorernas rutor: ' + ';  '.join(
            '%s %s (%s)' % (e, warm_ch[sid].get(e),
                            '%+d' % SR.point_to_interval(warm_ch[sid][e], (lo, hi))
                            if warm_ch[sid].get(e) is not None else '--')
            for e in ESTS))
        print('     teckenvaxlingar (oarmade) vid bracket j, alltsa mellan ruta j+1 och j+2:')
        print('       %s' % (', '.join('j=%d -> [%d,%d]%s' % (j, j + 1, j + 2,
                                                             ' INNE' if j + 1 <= hi and j + 2 >= lo else '')
                                       for j in raw) or 'inga'))
        print('       armade (E3:s hysteres 0,10): %s'
              % (', '.join('j=%d' % j for j in arm) or 'inga'))
        print('     tillatna ankarrutor for E2: %s'
              % ('%d st, %d-%d' % (len(adm), min(adm), max(adm)) if adm else 'inga'))
        # What the wrist track actually does across the span and around it.
        ys = [None if m is None else m[1] for _, m in tr]
        def at(i):
            return ys[i - 1] if 1 <= i <= len(ys) and ys[i - 1] is not None else None
        win = range(max(1, lo - 4), min(len(ys), hi + 5) + 1)
        print('     handledens y (bildhojdsandel; lagre = hogre upp i bild) och v_y:')
        print('       %-6s %s' % ('ruta', ' '.join('%7d' % i for i in win)))
        print('       %-6s %s' % ('y', ' '.join(
            '%7.4f' % at(i) if at(i) is not None else '     --' for i in win)))
        print('       %-6s %s' % ('v_y', ' '.join(
            '%+7.3f' % vy_r[i - 1][1] if vy_r[i - 1][1] is not None else '     --'
            for i in win)))
        print('       %-6s %s' % ('spann', ' '.join(
            '%7s' % ('###' if lo <= i <= hi else '') for i in win)))
        vals = [at(i) for i in win if at(i) is not None]
        if vals:
            print('     y varierar %.4f over fonstret (%.4f..%.4f); minsta y (hogsta hand) '
                  'vid ruta %s'
                  % (max(vals) - min(vals), min(vals), max(vals),
                     min((i for i in win if at(i) is not None), key=lambda i: at(i))))
        # And what the three measurements answered there.
        res = OUT.get(sid, {})
        if 'E4' in res:
            print('     matvardenas utfall pa E4:s ruta: %s'
                  % ';  '.join('%s %s' % (n, verdict(res['E4'], k)) for k, n in MEAS))
        for nm, rows in answers.items():
            a = rows.get(sid)
            print('     %s: %s' % (nm, 'osaker/inget svar' if SR.interval(a) is None
                                   else '%d-%d' % SR.interval(a)))


# -- FRAGA 5 -------------------------------------------------------------------

# Every place a round split on the flag and CALLED it slow motion. The quoted fragment is
# looked up in the file; if it has moved, this stops rather than "correcting" a line that is
# no longer there. Documents are S-31 to S-38's own reports, in order.
LABEL_SITES = [
    ('docs/shaft/top-from-pose.md', 'S-31'),
    ('docs/shaft/top-review/resultat.md', 'S-32'),
    ('docs/shaft/top-review/subframe.md', 'S-33'),
    ('docs/shaft/top-review/crossing-selection.md', 'S-34'),
    ('docs/shaft/top-review/multiswing.md', 'S-35'),
    ('docs/shaft/top-review/envelope-audit.md', 'S-36'),
    ('docs/shaft/top-review/e2-and-floor.md', 'S-37'),
    ('docs/shaft/top-review/hard-core.md', 'S-38'),
]


def section_f5(reg, flags):
    print('\n=== FRAGA 5. 3,0-BUGGENS SPRIDNING ===')
    print('  Forst: ar flaggan verkligen envelopelangd? Samma matning som hard-core.md')
    print('  section 5, pa samma 103 svingar -- om den inte reproducerar galler inget nedan.')
    sm = {s['id'] for s in reg['swings'] if s['slowmo']}
    ms = {i for i, f in flags.items() if f.get('suspectMultiSwing')}
    lng = {i for i, f in flags.items()
           if f.get('envelopeDurationSec') is not None and f['envelopeDurationSec'] > 3.0}
    print('     slowmo %d;  suspectMultiSwing %d;  envelope > 3,0 s %d'
          % (len(sm), len(ms), len(lng)))
    print('     slowmo == suspectMultiSwing: %s;  slowmo == (envelope > 3,0 s): %s'
          % ('JA' if sm == ms else 'NEJ', 'JA' if sm == lng else 'NEJ'))
    if not (sm == ms == lng):
        raise SystemExit('flaggmangderna ar inte identiska -- hard-core.md section 5 '
                         'reproducerar inte, och etikettrattningen vilar pa den')
    print('\n  Etiketten "slow-mo" i S-31 till S-38 ar alltsa etiketten "envelope > 3,0 s".')
    print('  Var den star som en UPPDELNING (inte som ett kodkonstantnamn), per dokument:')
    for path, s in LABEL_SITES:
        p = Path(path)
        if not p.exists():
            raise SystemExit('%s finns inte -- listan har drivit ifran repot' % path)
        lines = p.read_text(encoding='utf-8').splitlines()
        hits = [(i + 1, ln.strip()) for i, ln in enumerate(lines)
                if 'slow-mo' in ln.lower() or 'slowmo' in ln.lower()]
        print('     %-46s %-5s %d rader namner flaggan' % (path, s, len(hits)))
    print('\n  Sjalva rattningen ar textandringar i de atta dokumenten, inte en siffra har.')
    print('  Den star i verdict-sensitivity.md section 5, dokument for dokument.')


# -- main ----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path)
    ap.add_argument('--clipPoseDir', type=Path, required=True)
    ap.add_argument('--denseDir', type=Path, required=True)
    ap.add_argument('--work', type=Path, required=True)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all', help='f1 | f2 | f3 | f4 | f5 | all')
    args = ap.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    by_id = {s['id']: s for s in reg['swings']}
    flags = EA.load_flags(reg['swings'])
    print('S-39 kanslighet: %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))

    # -- the control line, on the COLD run. Not a result here.
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
        D[s['id']] = True

    (n1, a1), (n2, a2) = list(answers.items())[:2]
    ivs1 = {s: SR.interval(a1.get(s)) for s in D}
    ivs1 = {k: v for k, v in ivs1.items() if v}
    ivs2 = {s: SR.interval(a2.get(s)) for s in D}
    ivs2 = {k: v for k, v in ivs2.items() if v}
    spans = {}
    for sid in D:
        if sid in ivs1 and sid in ivs2:
            spans[sid] = (min(ivs1[sid][0], ivs2[sid][0]), max(ivs1[sid][1], ivs2[sid][1]))

    cold = E2F.choices_for(reg, lambda sid: POSE.get(sid))
    print('  %d svingar med kall posebana; %d med ett E3-val; %d med ett manskligt spann.'
          % (len(POSE), len(D), len(spans)))
    print('  KONTROLLRAD, den KALLA korningen. Den ar INTE ett resultat har -- den ar det')
    print('  enda som visar att pipelinen reproducerar. Stammer den inte med resultat.md,')
    print('  subframe.md, crossing-selection.md, multiswing.md, envelope-audit.md,')
    print('  e2-and-floor.md och hard-core.md har underlaget drivit och inget nedan galler:')
    for tname, ivs in ((n1, ivs1), (n2, ivs2), ('spannet', spans)):
        line = []
        for est in ESTS:
            d = [SR.point_to_interval(cold[s][est], ivs[s]) for s in D
                 if ivs.get(s) and cold[s].get(est) is not None]
            line.append('%s inne %d av %d (median %+.0f)'
                        % (est, sum(1 for v in d if v == 0), len(d), SR.median(d)))
        print('    mot %-8s %s' % (tname, ';  '.join(line)))

    warm = E2F.build_warm(reg, args.clipPoseDir)
    warm_ch = E2F.choices_for(reg, lambda sid: warm.get(sid))
    print('  %d svingar har en VARM bana; %d av dem har ocksa ett manskligt spann.'
          % (len(warm), len(set(warm) & set(spans))))
    print('  DEN VARMA BASLINJEN, hard-core.md section 1, oforandrad: ' + ';  '.join(
        '%s %d av %d' % (e, sum(1 for s in spans
                                if warm_ch.get(s, {}).get(e) is not None
                                and SR.point_to_interval(warm_ch[s][e], spans[s]) == 0),
                         len(spans)) for e in ESTS))

    dense = load_dense(args.denseDir, reg)
    lms = clip_landmarks(args.clipPoseDir, reg)
    print('  %d svingar har en DETEKTORBANA (shaft-v2 pa varje envelope-ruta); %d har '
          'dessutom en varm poserad kroppsreferens.' % (len(dense), len(set(dense) & set(lms))))

    payload, cands = payload_for(reg, by_id, dense, lms, warm_ch, cold, spans,
                                 ivs1, ivs2, n1, n2)
    print('  %d svingar skickas till produktionskoden, %d kandidatrutor totalt.'
          % (len(payload['swings']), sum(len(s['candidates']) for s in payload['swings'])))
    print('  HANDIGHET: `unknown` pa alla 103 (STATUS.md section 4). Produktionen skulle')
    print('  avvisa top-shaft-orientation pa varenda rad pa den grunden -- antagandet')
    print('  `%s` ar satt HAR for att det ska finnas ett utfall att flytta, och det ar' % HANDEDNESS)
    print('  ett antagande, inte en matning.')

    bridge = build_bridge(args.work)
    got = run_bridge(bridge, payload, args.work)
    OUT = {}
    for s in got['swings']:
        OUT[s['id']] = {r['label']: r for r in s['results']}
    print('  produktionskoden svarade pa %d svingar.' % len(OUT))

    if args.section in ('all', 'f1'):
        section_f1(OUT, cands, by_id, spans)
    if args.section in ('all', 'f2'):
        section_f2(OUT, by_id, ivs1, ivs2, spans, n1, n2)
    if args.section in ('all', 'f3'):
        section_f3(OUT, by_id, spans)
    if args.section in ('all', 'f4'):
        section_f4(reg, by_id, warm, warm_ch, spans, dense, lms, OUT, answers)
    if args.section in ('all', 'f5'):
        section_f5(reg, flags)


if __name__ == '__main__':
    main()
