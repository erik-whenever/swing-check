# ONE-OFF, READ-ONLY DIAGNOSIS (S-37): which tracker configuration does production run, what
# does E2 look like measured in E3's detail, what would E2's anchor have to be, how big is the
# run-to-run floor for E1/E2/E3/E4, and do production's own unread flags carry anything?
# WRITES NOTHING BUT STDOUT.
#
#   python docs/shaft/top-review/e2_and_floor.py <envPoseDir> --clipPoseDir <clipPoseDir> \
#       [--section config | e2 | anchor | floor | flags | all]
#
# NOTHING IS DECIDED HERE. No new estimator, no threshold, no calibration, no shift applied,
# no change to S-30's lock and no production code written. src/lib/poseDetector.ts,
# src/lib/poseTrajectory.ts, src/lib/frameExtractor.ts and src/lib/livePoseLoop.ts are READ in
# section `config` -- to answer which running mode production uses and whether the landmarker
# instance is reused between frames -- and are quoted line by line, never reimplemented.
#
# THE KEY WAS SEEN. resultat.md, subframe.md, crossing-selection.md, multiswing.md and
# envelope-audit.md were all read before this was written, so the risk here is not measurement
# error, it is fitting. Therefore: no parameter swept, none tuned, nothing chosen. E2's
# smoothing window (3) and E3's hysteresis (0.10) are their own and are unchanged. The tail is
# subframe.md section 7's own quantile cut, unchanged. The 16 clips are S-35 part D's own list.
# Every other script in this directory is imported and reused, never re-implemented.
import argparse
import collections
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR          # noqa: E402
import subframe as SF             # noqa: E402
import crossing_selection as CS   # noqa: E402
import multiswing as MS           # noqa: E402
import envelope_audit as EA       # noqa: E402

EST = SF.EST
HYST, WIN = SF.HYST, SF.WIN
E2_WIN = 3          # analyze_pose.e2_slowest's own default. Not swept, not tuned.
SRC = Path('src') / 'lib'
TAIL_CUT = 26       # subframe.md section 7's own p90 of |distance|. A quantile of the
                    # outcome, not a band of mine, and it is not moved here.

# The production lines section `config` must find. If a line has moved or been renamed the
# script STOPS rather than reporting a configuration that is no longer there.
PROD_ANCHORS = [
    ('poseDetector.ts', "runningMode: 'VIDEO'"),
    ('poseDetector.ts', 'export async function resetPoseLandmarker'),
    ('poseDetector.ts', 'export async function createPoseLandmarker'),
    ('poseTrajectory.ts', 'const SAMPLE_FPS = 15'),
    ('poseTrajectory.ts', 'await resetPoseLandmarker();'),
    ('poseTrajectory.ts', 'const landmarker = await getPoseLandmarker();'),
    ('poseTrajectory.ts', 'landmarker.detectForVideo(video, tsMs)'),
    ('frameExtractor.ts', "await import('./poseTrajectory')"),
    ('livePoseLoop.ts', 'this.landmarker.detectForVideo(this.video, tsMs)'),
    ('livePoseLoop.ts', 'export const ACTIVE_FPS = 15'),
    # section 5 rests on these three: the two flags are derived from the SAME quantity as
    # covariates the round already carries, and that is a property of the code, not of n=103.
    ('dataset/datasetGate.ts', 'export const MULTI_SWING_SUSPECT_SEC = 3.0'),
    ('dataset/datasetGate.ts', 'return envelope.finishSec - envelope.startSec >'),
    ('dataset/slowmo.ts', 'export const SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0'),
    ('dataset/slowmo.ts', 'envelopeDurationSec > SLOWMO_ENVELOPE_THRESHOLD_SEC'),
    ('poseEnvelope.ts', 'if (impactIdx >= 0 && (atEnvelopeEnd || clippedTail)) {'),
]


def find_line(fname, needle):
    p = SRC / fname
    txt = p.read_text(encoding='utf-8').splitlines()
    for i, ln in enumerate(txt, 1):
        if needle in ln:
            return i, ln.strip()
    raise SystemExit('%s no longer contains %r -- the configuration claim in '
                     'e2-and-floor.md cannot be checked against the code' % (p, needle))


# -- FRAGA 1: vilken konfiguration ar produktionens? ---------------------------

def section_config():
    print('\n=== 1. VILKEN KONFIGURATION AR PRODUKTIONENS? ===')
    print('  Koden ar LAST och citerad, inte reimplementerad och inte andrad. Skriptet')
    print('  stannar om nagon av raderna har flyttat, sa pastaendet kan inte driva ifran')
    print('  koden utan att det syns.')
    for fname, needle in PROD_ANCHORS:
        i, ln = find_line(fname, needle)
        print('    src/lib/%-20s :%-4d %s' % (fname, i, ln))
    print('\n  -- vad raderna sager, i tur och ordning --')
    print('  a) runningMode ar VIDEO pa BADA vagarna. VIDEO ar ett SPARNINGSLAGE: varje ruta')
    print('     seedas med foregaende rutas detektion i stallet for att kora hela')
    print('     detektorn. Det ar inte min tolkning -- poseDetector.ts:s egen kommentar till')
    print('     resetPoseLandmarker skriver ut det, med uppmatta tal (posesDetected 924/929/')
    print('     924 over tre korningar av ett klipp, refSpeed-svang ~11 %).')
    print('  b) Landmarker-instansen ATERANVANDS mellan rutor. poseTrajectory.ts hamtar EN')
    print('     instans och anropar detectForVideo i en slinga over klippets sampel; inget')
    print('     i slingan bygger om den.')
    print('  c) Den ar KALL exakt en gang per extraktion: resetPoseLandmarker() anropas')
    print('     forst i extractPoseTrajectory, alltsa en gang per KLIPP -- aldrig per sving.')
    print('  d) Klippvagen samplar 15 fps over hela klippet fran t=0 (SAMPLE_FPS), alltsa')
    print('     varm genom hela klippet och kall bara vid klippets forsta sampel.')
    print('  e) Livevagen (livePoseLoop.ts) ar varmare an sa: en egen instans som lever hela')
    print('     inspelningen, detectForVideo per rAF-ruta, 5/15 fps. Den ar dock en')
    print('     PARALLELL vag -- useLiveSwingDetection.ts:s egen kommentar sager att den')
    print('     aldrig ror frameExtractor, blobben eller sessionen; analysen gar fortfarande')
    print('     via extractFrames -> selectViaPose -> extractPoseTrajectory.')
    print('\n  -- de tva matkonfigurationerna, mot produktionen --')
    print('     run_pose.py       : KALL sparare per SVING, avkodning fran envelope-0,6 s.')
    print('     run_pose_clip.py  : KALL sparare per KLIPP, avkodning fran t=0.')
    print('     produktionen      : KALL sparare per KLIPP (per extraktion), fran t=0.')
    print('     Det ar alltsa run_pose_clip.py -- den VARMA korningen -- som motsvarar')
    print('     produktionens sparningstillstand. run_pose.py gor det inte.')
    print('     SAMTLIGA tal i S-31 till S-35 ar matta pa run_pose.py, alltsa pa den kalla.')
    print('\n  -- vad som fortfarande INTE ar produktionen ens i den varma korningen --')
    print('     15 fps (produktionen) mot 30 fps (bada korningarna); WASM/GPU-delegat i')
    print('     webblasaren mot python-CPU; sokning per sampel mot sekventiell avkodning.')
    print('     De star oprovade, precis som top-from-pose.md:s fem paritetsavvikelser.')


# -- shared: the warm trajectories --------------------------------------------

def build_warm(reg, clip_pose_dir):
    """Each swing's envelope frames taken out of the WHOLE-CLIP run, matched frame by frame
    on time. Identical to envelope_audit.section_stability's own construction, and EA.nearest
    is imported rather than copied."""
    warm = {}
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
            r = dict(dc['frames'][k])
            r['inEnv'] = True
            rows.append(r)
        if ok:
            warm[s['id']] = dict(frames=rows)
    return warm


def choices_for(reg, getd):
    """{id: {E1,E2,E3,E4: frame index}} off whichever trajectory is handed in.

    E1/E2/E3 come out of EST, which score_round lifts from analyze_pose.py by name; E4 is
    subframe.py's own bracket + crossing fraction. Nothing here is a second implementation.
    """
    out = {}
    for s in reg['swings']:
        d = getd(s['id'])
        if d is None:
            continue
        ch = {name: SR.to_index(s['frameTimes'], fn(d, {}))
              for name, fn in EST['EST'].items()}
        vy = EST['vy_series'](d, WIN)
        j = SF.e3_bracket(vy)
        if j is None:
            ch['E4'] = None
        else:
            c = SF.crossing_fraction(EST['vy_series'](d, 1), j)
            ch['E4'] = SF.rnd(j + 1.0 if c is None else j + c[0] + 1.0)
        out[s['id']] = ch
    return out


def describe(label, rows):
    d = [x[1] for x in rows]
    a = [abs(x) for x in d]
    clips = SR.by_clip([(c, v) for c, v, _, _ in rows])
    cv = list(clips.values())
    print('    %-24s rader n=%-3d klipp n=%-3d  inne %2d  median %+.1f  |median| %.1f  '
          'p90 %.1f  max %.1f  MAD %.1f   (klippniva: median %+.1f, |median| %.1f)'
          % (label, len(d), len(clips), sum(1 for x in d if x == 0), SR.median(d),
             SR.median(a), SR.pct(a, 0.9), max(a), SR.mad(d),
             SR.median(cv), SR.median([abs(x) for x in cv])))


# -- FRAGA 2: E2 i samma detalj som E3 ----------------------------------------

def section_e2(reg, answers, cold, spans, by_id, warm_ch):
    print('\n=== 2. E2, MATT I SAMMA DETALJ SOM E3 ===')
    print('  E2 ar analyze_pose.e2_slowest oforandrad: fartminimum bakat fran envelopens')
    print('  snabbaste ruta, utjamningsfonster 3. Ingen parameter rord.')
    (n1, a1), (n2, a2) = list(answers.items())[:2]
    targets = ((n1, {s: SR.interval(a1.get(s)) for s in cold}),
               (n2, {s: SR.interval(a2.get(s)) for s in cold}),
               ('spannet', spans))

    print('\n  -- (a) mot vardera annotatoren och mot spannet --')
    for tname, ivs in targets:
        for est in ('E2', 'E3'):
            rows = [(by_id[sid]['clip'], SR.point_to_interval(cold[sid][est], ivs[sid]),
                     cold[sid][est], ivs[sid])
                    for sid in sorted(cold)
                    if ivs.get(sid) and cold[sid].get(est) is not None]
            describe('%s mot %s' % (est, tname), rows)

    print('\n  -- (b) forskjutningen: konstant eller spridd? IQR, riktning, naivt skift, LOCO --')
    print('     Samma procedur som resultat.md section 4 och subframe.loco_shift_hits:')
    print('     skiftet ett klipp bedoms med ar medianen av de ANDRA klippens medianer.')
    for tname, ivs in targets:
        for est in ('E2', 'E3'):
            rows = [(by_id[sid]['clip'], SR.point_to_interval(cold[sid][est], ivs[sid]),
                     cold[sid][est], ivs[sid])
                    for sid in sorted(cold)
                    if ivs.get(sid) and cold[sid].get(est) is not None]
            d = [x[1] for x in rows]
            nz = [x for x in d if x != 0]
            neg = sum(1 for x in nz if x < 0)
            clip_med = SR.by_clip([(c, v) for c, v, _, _ in rows])
            shift = st.median(list(clip_med.values()))
            naive = sum(1 for _, _, p, iv in rows
                        if SR.point_to_interval(p - round(shift), iv) == 0)
            hits, _ = SF.loco_shift_hits(rows, whole=True)
            print('     %-3s mot %-8s IQR %+.1f..%+.1f  p10..p90 %+.1f..%+.1f  '
                  'ej inne: %d fore / %d efter (%.0f %% at samma hall)'
                  % (est, tname, SR.pct(d, 0.25), SR.pct(d, 0.75), SR.pct(d, 0.10),
                     SR.pct(d, 0.90), neg, len(nz) - neg,
                     100 * max(neg, len(nz) - neg) / len(nz) if nz else 0))
            print('     %-3s mot %-8s klippmedianernas median %+.1f -> naivt skift: '
                  'traff %d -> %d av %d;  LOCO: %d -> %d av %d'
                  % (est, tname, shift, sum(1 for x in d if x == 0), naive, len(d),
                     sum(1 for x in d if x == 0), hits, len(d)))

    print('\n  -- (c) forspranget pa 15 rader: parvis, pa exakt samma rader --')
    print('     Netto sager inget om omsattningen; darfor bada.')
    for other in ('E3', 'E4'):
        both = only2 = onlyo = neither = 0
        for sid, iv in sorted(spans.items()):
            p2, po = cold[sid].get('E2'), cold[sid].get(other)
            if p2 is None or po is None:
                continue
            i2 = SR.point_to_interval(p2, iv) == 0
            io = SR.point_to_interval(po, iv) == 0
            both += i2 and io
            only2 += i2 and not io
            onlyo += io and not i2
            neither += not i2 and not io
        n = both + only2 + onlyo + neither
        print('     E2 mot %-3s (n=%d): bada inne %d, bara E2 %d, bara %s %d, ingen %d  '
              '-> netto %+d, omsattning %d rader'
              % (other, n, both, only2, other, onlyo, neither, only2 - onlyo,
                 only2 + onlyo))

    print('\n  -- (d) stabilitet under varm/kall-storningen --')
    print('     Detaljen for E2 och E3; alla fyra estimatorer star i avsnitt 4.')
    if not warm_ch:
        print('     -- ingen helklippsbana inlast (--clipPoseDir saknas)')
        return
    stability_one(cold, warm_ch, spans, 'E2')
    stability_one(cold, warm_ch, spans, 'E3')


def stability_one(cold, warm, spans, est):
    same = within1 = lost = gained = 0
    diffs = []
    for sid in sorted(set(cold) & set(warm)):
        a, b = warm[sid].get(est), cold[sid].get(est)
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
            within1 += abs(a - b) <= 1
    n = same + len(diffs) + lost + gained
    allad = sorted([0] * same + [abs(x) for x in diffs])
    hc = ho = io = oi = mv = nsp = 0
    for sid, iv in sorted(spans.items()):
        if sid not in warm:
            continue
        pc, pw = cold[sid].get(est), warm[sid].get(est)
        if pc is None or pw is None:
            continue
        nsp += 1
        xc = SR.point_to_interval(pc, iv) == 0
        xw = SR.point_to_interval(pw, iv) == 0
        hc += xc
        ho += xw
        io += xc and not xw
        oi += xw and not xc
        mv += SR.point_to_interval(pc, iv) != SR.point_to_interval(pw, iv)
    print('     %-3s ruta lika %d av %d, inom 1 ruta %d, tappar/far val %d/%d; '
          '|skillnad| median %.0f p75 %.0f p90 %.0f max %.0f'
          % (est, same, n, within1, lost, gained,
             SR.median(allad) if allad else 0, SR.pct(allad, 0.75) if allad else 0,
             SR.pct(allad, 0.9) if allad else 0, max(allad) if allad else 0))
    print('     %-3s inne i spannet: kall %d, varm %d av %d  -> netto %+d, '
          '%d inne->utanfor, %d utanfor->inne, %d rader byter avstand alls'
          % (est, hc, ho, nsp, ho - hc, io, oi, mv))
    return dict(same=same, n=n, net=ho - hc, io=io, oi=oi, mv=mv, cold=hc, warm=ho,
                nsp=nsp, allad=allad)


# -- FRAGA 3: E2:s ankare ------------------------------------------------------

def walk_from(sp, idx, i0):
    """E2's own backward walk, with ONLY the starting frame handed in.

    This is not a new estimator and nothing returns it: it is subframe.e2_walk's loop with
    the start made a parameter, so that the question `which frames WOULD work as an anchor`
    can be asked without proposing one. The control below checks that starting it at the
    fastest frame reproduces e2_walk exactly, on every swing.
    """
    i, steps = i0, 0
    while True:
        prev = [j for j in idx if j < i]
        if not prev:
            return i, steps
        j = prev[-1]
        if sp[j][1] >= sp[i][1]:
            return i, steps
        i, steps = j, steps + 1


def n_runs(adm, idx):
    """How many contiguous stretches the admissible set falls into, counted on the frames
    that actually carry a speed value (a gap in the pose is not a gap in the set)."""
    if not adm:
        return 0
    pos = {v: k for k, v in enumerate(idx)}
    r = 1
    for a, b in zip(adm, adm[1:]):
        if pos[b] != pos[a] + 1:
            r += 1
    return r


def anchor_sets(POSE, reg, spans, by_id):
    """Per swing: the set of envelope frames that, used as E2's anchor, land inside the span."""
    out = {}
    for s in reg['swings']:
        sid = s['id']
        if sid not in spans or sid not in POSE:
            continue
        d = POSE[sid]
        sp = EST['speed_series'](d, E2_WIN)
        idx = [i for i, (_, v) in enumerate(sp) if v is not None]
        if len(idx) < 3:
            continue
        imax = max(idx, key=lambda i: sp[i][1])
        peak = sp[imax][1]
        # control: E2's own answer must come out of the same walk
        land_max, steps_max = walk_from(sp, idx, imax)
        ref = SF.e2_walk(d)
        if ref is None or ref[0] != imax or ref[1] != land_max or ref[2] != steps_max:
            raise SystemExit('walk_from reproducerar inte subframe.e2_walk pa %s' % sid)
        lo, hi = spans[sid]
        adm = [i for i in idx if lo <= walk_from(sp, idx, i)[0] + 1 <= hi]
        n = len(sp)
        out[sid] = dict(
            clip=by_id[sid]['clip'], n=n, idx=idx, imax=imax, peak=peak,
            adm=adm, span=(lo, hi),
            frac=[i / (n - 1) for i in adm],
            spd=[sp[i][1] / peak for i in adm] if peak else [],
            imax_in=imax in adm,
            imax_frac=imax / (n - 1),
            imax_to_adm=(min(abs(imax - i) for i in adm) if adm else None),
            imax_signed=(min((i - imax for i in adm), key=abs) if adm else None),
            runs=n_runs(adm, idx),
            e2_dist=SR.point_to_interval(land_max + 1, spans[sid]),
            impact=(SR.to_index(s['frameTimes'], s['impact'])
                    if s.get('hasConfidentImpact') and s.get('impact') is not None else None),
        )
    return out


def section_anchor(POSE, reg, spans, by_id, cold):
    print('\n=== 3. E2:s ANKARE -- vad skulle det behova vara? ===')
    print('  Fragan stalls som en MATNING och inte som ett forslag: E2:s bakatgaende')
    print('  sokning halls oforandrad och bara STARTRUTAN varieras, ruta for ruta genom')
    print('  envelopen. `tillaten ankarruta` = en ruta dar E2:s egen sokning bakat landar')
    print('  inne i det manskliga spannet. INGEN estimator foreslas och ingen troskel satts.')
    print('  Kontroll: startar man i envelopens snabbaste ruta reproduceras subframe.e2_walk')
    print('  exakt pa varje sving, annars stannar skriptet.')
    A = anchor_sets(POSE, reg, spans, by_id)
    tail = [sid for sid in A if abs(A[sid]['e2_dist']) >= TAIL_CUT]
    print('\n  n = %d rader i %d klipp med spann och fartserie.'
          % (len(A), len({v['clip'] for v in A.values()})))
    print('  Kontroll pa E2 sjalv: envelopens snabbaste ruta ar en tillaten ankarruta pa '
          '%d av %d -- samma tal som E2:s traff i resultat.md section 3.'
          % (sum(1 for v in A.values() if v['imax_in']), len(A)))
    print('  Svansen (|avstand| >= %d, subframe.md section 7:s egen kvantil): %d rader i '
          '%d klipp.' % (TAIL_CUT, len(tail), len({A[s]['clip'] for s in tail})))

    for lab, sel in (('alla med spann', sorted(A)),
                     ('E2 inne (traffarna)', [s for s in sorted(A) if A[s]['e2_dist'] == 0]),
                     ('E2 utanfor', [s for s in sorted(A) if A[s]['e2_dist'] != 0]),
                     ('E2:s svans', sorted(tail))):
        rows = [A[s] for s in sel]
        if not rows:
            continue
        empty = [r for r in rows if not r['adm']]
        ok = [r for r in rows if r['adm']]
        print('\n  -- %s: n=%d rader i %d klipp --'
              % (lab, len(rows), len({r['clip'] for r in rows})))
        print('     ingen tillaten ankarruta alls: %d av %d (%.0f %%)'
              % (len(empty), len(rows), 100 * len(empty) / len(rows)))
        if not ok:
            continue
        sizes = sorted(len(r['adm']) for r in ok)
        share = sorted(len(r['adm']) / len(r['idx']) for r in ok)
        print('     dar den finns: %d av %d rader; antal tillatna rutor median %.0f '
              '(p10 %.0f, p90 %.0f, max %d), andel av envelopen median %.0f %%'
              % (len(ok), len(rows), SR.median(sizes), SR.pct(sizes, 0.1),
                 SR.pct(sizes, 0.9), max(sizes), 100 * SR.median(share)))
        f_lo = sorted(min(r['frac']) for r in ok)
        f_hi = sorted(max(r['frac']) for r in ok)
        print('     dar de ligger i envelopen (0 = forsta rutan, 1 = sista): forsta '
              'tillatna median %.2f (p10 %.2f, p90 %.2f), sista median %.2f '
              '(p10 %.2f, p90 %.2f)'
              % (SR.median(f_lo), SR.pct(f_lo, 0.1), SR.pct(f_lo, 0.9),
                 SR.median(f_hi), SR.pct(f_hi, 0.1), SR.pct(f_hi, 0.9)))
        s_lo = sorted(min(r['spd']) for r in ok if r['spd'])
        s_hi = sorted(max(r['spd']) for r in ok if r['spd'])
        s_md = sorted(SR.median(r['spd']) for r in ok if r['spd'])
        if s_lo:
            print('     deras fart, som andel av envelopens toppfart: langsammaste tillatna '
                  'median %.2f (p10 %.2f), snabbaste tillatna median %.2f (p90 %.2f), '
                  'mittvardet median %.2f'
                  % (SR.median(s_lo), SR.pct(s_lo, 0.1), SR.median(s_hi),
                     SR.pct(s_hi, 0.9), SR.median(s_md)))
        runs = sorted(r['runs'] for r in ok)
        print('     sammanhangande: %d av %d rader har mangden i ETT stycke (antal stycken '
              'median %.0f, max %d)'
              % (sum(1 for r in ok if r['runs'] == 1), len(ok), SR.median(runs), max(runs)))
        inn = [r for r in ok if not r['imax_in']]
        if inn:
            dd = sorted(r['imax_to_adm'] for r in inn)
            sg = [r['imax_signed'] for r in inn]
            print('     dar envelopens snabbaste ruta INTE ar tillaten (n=%d): avstand till '
                  'narmaste tillatna median %.0f rutor (p90 %.0f, max %d); den tillatna '
                  'ligger FORE den snabbaste pa %d rader och EFTER den pa %d'
                  % (len(inn), SR.median(dd), SR.pct(dd, 0.9), max(dd),
                     sum(1 for x in sg if x < 0), sum(1 for x in sg if x > 0)))
            fm = sorted(r['imax_frac'] for r in inn)
            print('     och den snabbaste rutan sjalv ligger pa %.2f av envelopen i median '
                  '(p10 %.2f, p90 %.2f)' % (SR.median(fm), SR.pct(fm, 0.1), SR.pct(fm, 0.9)))
        imp = [r for r in ok if r['impact'] is not None]
        if imp:
            rel_lo = sorted(min(r['adm']) + 1 - r['impact'] for r in imp)
            rel_hi = sorted(max(r['adm']) + 1 - r['impact'] for r in imp)
            print('     mot det detekterade nedslaget (n=%d med sakert nedslag): forsta '
                  'tillatna median %+.0f rutor, sista tillatna median %+.0f rutor '
                  '(negativt = fore nedslaget)'
                  % (len(imp), SR.median(rel_lo), SR.median(rel_hi)))
        rel = sorted(min(r['adm']) + 1 - r['span'][1] for r in ok)
        rel2 = sorted(max(r['adm']) + 1 - r['span'][1] for r in ok)
        print('     mot spannets slut (negativt = fore det): forsta tillatna ankarrutan '
              'median %+.0f rutor (p10 %+.0f, p90 %+.0f), sista tillatna median %+.0f '
              '(p10 %+.0f, p90 %+.0f)'
              % (SR.median(rel), SR.pct(rel, 0.1), SR.pct(rel, 0.9),
                 SR.median(rel2), SR.pct(rel2, 0.1), SR.pct(rel2, 0.9)))

    print('\n  -- svansen rad for rad --')
    print('     %-9s %-11s %6s %6s %9s %11s %11s %9s'
          % ('id', 'klipp', 'E2', 'rutor', 'tillatna', 'lage lo-hi', 'fart lo-hi', 'imax lage'))
    for sid in sorted(tail, key=lambda s: -abs(A[s]['e2_dist'])):
        r = A[sid]
        if r['adm']:
            lage = '%.2f-%.2f' % (min(r['frac']), max(r['frac']))
            fart = '%.2f-%.2f' % (min(r['spd']), max(r['spd']))
        else:
            lage = fart = '--'
        print('     %-9s %-11s %+6d %6d %9d %11s %11s %9.2f'
              % (sid, r['clip'], r['e2_dist'], r['n'], len(r['adm']), lage, fart,
                 r['imax_frac']))


# -- FRAGA 4: matgolvet --------------------------------------------------------

def section_floor(cold, warm_ch, spans, answers, reg, by_id):
    print('\n=== 4. MATGOLVET -- varm/kall-storningen pa E1, E2, E3 och E4 ===')
    print('  Storningen ar densamma som envelope-audit.md section 6: en varm sparare i')
    print('  stallet for en kall, samma modell, samma vikter, samma bildrutor. Den borde')
    print('  inte betyda nagonting, och det ar precis darfor den duger som mattstock.')
    print('  Ingenting ar anpassat; bara underlaget byts.')
    got = {}
    for est in ('E1', 'E2', 'E3', 'E4'):
        print('')
        got[est] = stability_one(cold, warm_ch, spans, est)
    print('\n  -- sammanstallt: hur manga rader flyttar var och en? --')
    print('     %-4s %12s %12s %14s %8s %12s %6s'
          % ('', 'ruta lika', 'inom 1 ruta', 'inne kall/varm', 'netto', 'omsattning', 'max'))
    for est in ('E1', 'E2', 'E3', 'E4'):
        g = got[est]
        print('     %-4s %6d av %-3d %6d av %-3d %6d / %-7d %+8d %12d %6.0f'
              % (est, g['same'], g['n'], sum(1 for x in g['allad'] if x <= 1), g['n'],
                 g['cold'], g['warm'], g['net'], g['io'] + g['oi'],
                 max(g['allad']) if g['allad'] else 0))
    print('\n  -- spridningsmatten sjalva, kall mot varm --')
    print('     S-33 section 5 rapporterade att interpolationen tar p90 fran 3,0 till 2,1-2,8')
    print('     och max fran 26,0 till 25,1. Fragan har ar hur mycket SAMMA matt ror sig nar')
    print('     bara sparaen byts. Inget ar anpassat.')
    print('     %-3s %10s %8s %8s %8s' % ('', 'korning', '|median|', 'p90', 'max'))
    for est in ('E1', 'E2', 'E3', 'E4'):
        for lab, ch in (('kall', cold), ('varm', warm_ch)):
            a = [abs(SR.point_to_interval(ch[sid][est], iv))
                 for sid, iv in sorted(spans.items())
                 if sid in ch and ch[sid].get(est) is not None]
            print('     %-3s %10s %8.1f %8.1f %8.1f'
                  % (est, lab, SR.median(a), SR.pct(a, 0.9), max(a)))

    print('\n  -- och ar SVANSEN samma rader i de tva korningarna? --')
    print('     Snittet ar varje estimators egen p90 av |avstand| i den KALLA korningen --')
    print('     samma sorts kvantil subframe.md section 7 skar E2:s svans med -- och det')
    print('     flyttas inte. Fragan ar bara om samma rader ligger over det bada gangerna.')
    for est in ('E1', 'E2', 'E3', 'E4'):
        pairs = []
        for sid, iv in sorted(spans.items()):
            pc = cold.get(sid, {}).get(est)
            pw = warm_ch.get(sid, {}).get(est)
            if pc is None or pw is None:
                continue
            pairs.append((sid, abs(SR.point_to_interval(pc, iv)),
                          abs(SR.point_to_interval(pw, iv))))
        cut = SR.pct([x[1] for x in pairs], 0.9)
        ct_ = [s for s, a, _ in pairs if a >= cut]
        wt = [s for s, _, b in pairs if b >= cut]
        print('     %-3s snitt p90 = %2.0f rutor: kall svans %2d rader, varm %2d, '
              'gemensamma %2d (%.0f %% av den kalla)'
              % (est, cut, len(ct_), len(wt), len(set(ct_) & set(wt)),
                 100 * len(set(ct_) & set(wt)) / len(ct_) if ct_ else 0))

    print('\n  -- resultat.md section 5:s tystnadstal, matt i bada korningarna --')
    print('     Pa de svingar dar BADA bedomarna satte osaker finns inget spann, sa ingen')
    print('     estimator kan poangsattas dar. Det enda talet S-32 rapporterade ar |E3 - E2|,')
    print('     och det gar att rakna om utan ett facit. Grupperna ar S-32:s egna.')
    (n1, a1), (n2, a2) = list(answers.items())[:2]
    both_unsure = [s['id'] for s in reg['swings']
                   if SR.interval(a1.get(s['id'])) is None
                   and SR.interval(a2.get(s['id'])) is None
                   and (a1.get(s['id']) or a2.get(s['id']))]
    rest = [s['id'] for s in reg['swings'] if s['id'] in spans]
    for lab, sel in (('bada osakra', both_unsure), ('resten (med spann)', rest)):
        for run, ch in (('kall', cold), ('varm', warm_ch)):
            v = [abs(ch[i]['E3'] - ch[i]['E2']) for i in sel
                 if i in ch and ch[i].get('E3') is not None and ch[i].get('E2') is not None]
            if not v:
                continue
            print('     %-20s %-5s n=%-3d  |E3 - E2| median %.1f  p90 %.1f  max %.1f'
                  % (lab, run, len(v), SR.median(v), SR.pct(v, 0.9), max(v)))

    print('\n     `omsattning` = rader som byter sida (inne->utanfor plus utanfor->inne).')
    print('     Den ar golvet, inte nettot: ett netto pa noll kan dolja flera rader at')
    print('     vardera hallet.')


# -- FRAGA 5: de oanvanda flaggorna --------------------------------------------

def section_flags(reg, POSE, cold, spans, by_id, flags, D):
    print('\n=== 5. DE OANVANDA FLAGGORNA -- bar clippedTail och suspectMultiSwing nagot? ===')
    print('  Flaggorna ar produktionens egna, direkt ur exportmanifestet, och ingen omgang')
    print('  hade last dem forran envelope-audit.md raknade dem. Har korsas de mot de fel')
    print('  omgangarna redan matt. Ingen troskel satts och ingen regel foreslas.')
    ct = {sid for sid, f in flags.items() if f.get('clippedTail')}
    sm = {sid for sid, f in flags.items() if f.get('suspectMultiSwing')}
    print('\n  clippedTail: %d av %d svingar. suspectMultiSwing: %d av %d. Bada: %d.'
          % (len(ct), len(flags), len(sm), len(flags), len(ct & sm)))

    # Are the flags new information at all? Both are derived in production from a quantity
    # the registry already carries, and section `config` quotes the lines. Here the identity
    # is MEASURED on the round rather than assumed from reading the code.
    allslow = {s['id'] for s in reg['swings'] if s['slowmo']}
    allnoimp = {s['id'] for s in reg['swings'] if not s['hasConfidentImpact']}
    print('\n  -- ar de ny information? (matt pa alla %d svingar, inte bara de med spann) --'
          % len(flags))
    print('     slowmo: %d svingar. suspectMultiSwing: %d. Identiska mangder: %s '
          '(bara i sM: %d, bara slow-mo: %d).'
          % (len(allslow), len(sm), 'JA' if sm == allslow else 'nej',
             len(sm - allslow), len(allslow - sm)))
    print('     utan sakert nedslag: %d svingar. clippedTail: %d, varav %d ligger i den '
          'mangden -- delmangd: %s.'
          % (len(allnoimp), len(ct), len(ct & allnoimp),
             'JA' if ct <= allnoimp else 'nej'))

    # the groups the earlier rounds built, rebuilt from their own scripts
    out49 = [sid for sid in sorted(spans) if D[sid]['d_e4r'] != 0]
    none23 = [sid for sid in out49 if len(D[sid]['cand']) == 1]
    no22 = []
    for sid in none23:
        vy = EST['vy_series'](POSE[sid], WIN)
        lo, hi = spans[sid]
        if not [j for j in MS.unarmed_crossings(vy) if lo <= j + 1 <= hi]:
            no22.append(sid)
    tail10 = [sid for sid in sorted(spans)
              if cold[sid].get('E2') is not None
              and abs(SR.point_to_interval(cold[sid]['E2'], spans[sid])) >= TAIL_CUT]
    in16 = [sid for sid in sorted(spans) if by_id[sid]['clip'] in EA.PART_D_CLIPS]
    print('  KONTROLL mot de omgangar som byggde grupperna: E4 utanfor %d rader (S-34: 49), '
          'utan armad kandidat %d (S-34: 23), helt utan vaxling inne %d (S-35: 22), E2:s '
          'svans %d (S-33: 10), och de 16 klippen bidrar med %d rader i %d klipp (S-36 rad '
          'tre i section 3 raknade KLIPP: 14).'
          % (len(out49), len(none23), len(no22), len(tail10), len(in16),
             len({by_id[s]['clip'] for s in in16})))

    groups = [
        ('alla med spann', sorted(spans)),
        ('E2 inne i spannet', [s for s in sorted(spans)
                               if cold[s].get('E2') is not None
                               and SR.point_to_interval(cold[s]['E2'], spans[s]) == 0]),
        ('E2 utanfor spannet', [s for s in sorted(spans)
                                if cold[s].get('E2') is not None
                                and SR.point_to_interval(cold[s]['E2'], spans[s]) != 0]),
        ('E2:s svans (>=%d)' % TAIL_CUT, tail10),
        ('E3 inne i spannet', [s for s in sorted(spans)
                               if cold[s].get('E3') is not None
                               and SR.point_to_interval(cold[s]['E3'], spans[s]) == 0]),
        ('E3 utanfor spannet', [s for s in sorted(spans)
                                if cold[s].get('E3') is not None
                                and SR.point_to_interval(cold[s]['E3'], spans[s]) != 0]),
        ('E4 utanfor spannet', out49),
        ('utan armad kandidat', none23),
        ('utan vaxling alls inne', no22),
        ('rader i de 16 klippen', in16),
    ]
    print('\n  %-24s %6s %6s %11s %11s %12s %12s'
          % ('grupp', 'rader', 'klipp', 'clipTail', 'suspMulti', '|E2| median', '|E3| median'))
    for lab, sel in groups:
        if not sel:
            continue
        e2 = [abs(SR.point_to_interval(cold[s]['E2'], spans[s])) for s in sel
              if cold[s].get('E2') is not None]
        e3 = [abs(SR.point_to_interval(cold[s]['E3'], spans[s])) for s in sel
              if cold[s].get('E3') is not None]
        print('  %-24s %6d %6d %4d (%3.0f %%) %4d (%3.0f %%) %12s %12s'
              % (lab, len(sel), len({by_id[s]['clip'] for s in sel}),
                 sum(1 for s in sel if s in ct),
                 100 * sum(1 for s in sel if s in ct) / len(sel),
                 sum(1 for s in sel if s in sm),
                 100 * sum(1 for s in sel if s in sm) / len(sel),
                 '%.1f' % SR.median(e2) if e2 else '--',
                 '%.1f' % SR.median(e3) if e3 else '--'))

    print('\n  -- andra hallet: hur gar de flaggade raderna? --')
    for lab, sel in (('clippedTail', sorted(ct & set(spans))),
                     ('suspectMultiSwing', sorted(sm & set(spans))),
                     ('ingen av flaggorna', sorted(set(spans) - ct - sm))):
        if not sel:
            continue
        e2 = [SR.point_to_interval(cold[s]['E2'], spans[s]) for s in sel
              if cold[s].get('E2') is not None]
        e3 = [SR.point_to_interval(cold[s]['E3'], spans[s]) for s in sel
              if cold[s].get('E3') is not None]
        print('     %-20s n=%-3d rader i %-2d klipp   E2 inne %d av %d, |median| %.1f   '
              'E3 inne %d av %d, |median| %.1f'
              % (lab, len(sel), len({by_id[s]['clip'] for s in sel}),
                 sum(1 for x in e2 if x == 0), len(e2), SR.median([abs(x) for x in e2]),
                 sum(1 for x in e3 if x == 0), len(e3), SR.median([abs(x) for x in e3])))

    print('\n  -- ar flaggan bara slow-mo? (svansen ar 6 av 10 slow-mo, subframe.md sect 7) --')
    slow = {s for s in spans if by_id[s]['slowmo']}
    for lab, sel in (('suspectMultiSwing', sm & set(spans)),
                     ('clippedTail', ct & set(spans)),
                     ('E2:s svans', set(tail10))):
        print('     %-20s n=%-3d  varav slow-mo %d (%.0f %%)   -- rundans egen slow-mo-andel: '
              '%d av %d (%.0f %%)'
              % (lab, len(sel), len(sel & slow), 100 * len(sel & slow) / len(sel),
                 len(slow), len(spans), 100 * len(slow) / len(spans)))
    print('     korsat pa svansen (n=%d): slow-mo fangar %d av %d, suspectMultiSwing %d av '
          '%d, bada tillsammans %d; utanfor svansen tander de pa %d respektive %d av %d.'
          % (len(tail10), len(set(tail10) & slow), len(tail10),
             len(set(tail10) & sm), len(tail10), len(set(tail10) & (slow | sm)),
             len(slow - set(tail10)), len((sm & set(spans)) - set(tail10)),
             len(spans) - len(tail10)))

    print('\n  -- mot S-35 del A:s egen flagga (den som tander pa 7) --')
    F = {}
    for s in reg['swings']:
        if s['id'] in POSE:
            F[s['id']] = MS.flag_row(POSE[s['id']], s)
    own = {i for i in F if MS.flagged(F, i)}
    print('     del A:s flagga: %d svingar; suspectMultiSwing: %d; overlapp: %d; '
          'clippedTail: %d; overlapp: %d.'
          % (len(own), len(sm), len(own & sm), len(ct), len(own & ct)))

    print('\n  -- rad for rad, de flaggade som ocksa har ett spann --')
    print('     %-9s %-11s %4s %4s %6s %6s %-8s %s'
          % ('id', 'klipp', 'cT', 'sM', 'E2', 'E3', 'i de 16', 'grupp'))
    for sid in sorted((ct | sm) & set(spans)):
        g = []
        if sid in tail10:
            g.append('E2-svans')
        if sid in no22:
            g.append('ingen vaxling')
        elif sid in none23:
            g.append('ingen kandidat')
        elif sid in out49:
            g.append('E4 utanfor')
        print('     %-9s %-11s %4s %4s %+6d %+6d %-8s %s'
              % (sid, by_id[sid]['clip'], 'ja' if sid in ct else '-',
                 'ja' if sid in sm else '-',
                 SR.point_to_interval(cold[sid]['E2'], spans[sid])
                 if cold[sid].get('E2') is not None else 0,
                 SR.point_to_interval(cold[sid]['E3'], spans[sid])
                 if cold[sid].get('E3') is not None else 0,
                 'ja' if by_id[sid]['clip'] in EA.PART_D_CLIPS else '-',
                 ', '.join(g) or 'inne'))


# -- main ----------------------------------------------------------------------

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
                    help='config | e2 | anchor | floor | flags | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    by_id = {s['id']: s for s in reg['swings']}
    flags = EA.load_flags(reg['swings'])
    print('S-37 E2-och-golvet: %d svingar i %d klipp, %d envelope-bildrutor'
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

    cold = choices_for(reg, lambda sid: POSE.get(sid))
    print('  %d svingar med posebana; %d med ett E3-val; %d med ett manskligt spann.'
          % (len(POSE), len(D), len(spans)))
    print('  KONTROLLRAD (maste stamma med resultat.md, subframe.md, crossing-selection.md,')
    print('  multiswing.md och envelope-audit.md -- gor den inte det har posebanorna drivit')
    print('  och inget nedan galler):')
    for tname, ivs in ((n1, {s: SR.interval(a1.get(s)) for s in D}),
                       (n2, {s: SR.interval(a2.get(s)) for s in D}),
                       ('spannet', spans)):
        line = []
        for est in ('E1', 'E2', 'E3', 'E4'):
            d = [SR.point_to_interval(cold[s][est], ivs[s]) for s in D
                 if ivs.get(s) and cold[s].get(est) is not None]
            line.append('%s inne %d av %d (median %+.0f)'
                        % (est, sum(1 for v in d if v == 0), len(d), SR.median(d)))
        print('    mot %-8s %s' % (tname, ';  '.join(line)))

    warm_ch = {}
    if args.clipPoseDir:
        warm = build_warm(reg, args.clipPoseDir)
        warm_ch = choices_for(reg, lambda sid: warm.get(sid))
        print('  %d svingar har en bana ur BADA korningarna (kall per sving / varm per klipp).'
              % len(warm))

    if args.section in ('all', 'config'):
        section_config()
    if args.section in ('all', 'e2'):
        section_e2(reg, answers, cold, spans, by_id, warm_ch)
    if args.section in ('all', 'anchor'):
        section_anchor(POSE, reg, spans, by_id, cold)
    if args.section in ('all', 'floor'):
        if not warm_ch:
            raise SystemExit('--clipPoseDir kravs for avsnitt 4')
        section_floor(cold, warm_ch, spans, answers, reg, by_id)
    if args.section in ('all', 'flags'):
        section_flags(reg, POSE, cold, spans, by_id, flags, D)


if __name__ == '__main__':
    main()
