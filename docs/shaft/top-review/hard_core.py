# ONE-OFF, READ-ONLY DIAGNOSIS (S-38): the WARM baseline, the hard core, whether the core is
# predictable without the key, the ceiling a gated solution could reach, and the flag bug.
# WRITES NOTHING BUT STDOUT.
#
#   python docs/shaft/top-review/hard_core.py <envPoseDir> --clipPoseDir <clipPoseDir> \
#       [--section baslinje | karna | forutsag | taket | bugg | all]
#
# PREMISE, HANDED IN AND NOT CHOSEN HERE: everything is measured WARM -- on
# run_pose_clip.py's whole-clip trajectories, the configuration e2-and-floor.md section 1
# showed production actually runs. The COLD run is loaded for exactly one purpose: the
# control row, which must reproduce resultat.md / subframe.md / crossing-selection.md /
# multiswing.md / envelope-audit.md / e2-and-floor.md before anything below may be read.
# No cold number is reported as a result.
#
# NOTHING IS DECIDED HERE. No new estimator, no threshold, no classifier, no calibration,
# no shift, no change to S-30's lock and no production code written. Section `bugg` READS
# src/lib/dataset/datasetGate.ts, src/lib/dataset/slowmo.ts, src/lib/poseSegments.ts and
# src/lib/dataset/extractDataset.ts and quotes them line by line; the script STOPS if a
# quoted line has moved, so the diagnosis cannot drift from the code without it showing.
#
# THE KEY WAS SEEN. resultat.md, subframe.md, crossing-selection.md, multiswing.md,
# envelope-audit.md and e2-and-floor.md were read before this was written, so the risk here
# is not measurement error, it is fitting. Therefore: no parameter swept, none tuned, nothing
# chosen. E2's smoothing window (3) and E3's hysteresis (0.10) are their own. Section
# `forutsag` reports the separation of each runtime quantity ONE AT A TIME and sets no
# threshold on any of them; there is no combined score and no gate.
# Every other script in this directory is imported and reused, never re-implemented.
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR          # noqa: E402
import subframe as SF             # noqa: E402
import crossing_selection as CS   # noqa: E402
import multiswing as MS           # noqa: E402
import envelope_audit as EA       # noqa: E402
import e2_and_floor as E2F        # noqa: E402

EST = SF.EST
HYST, WIN = SF.HYST, SF.WIN
E2_WIN = E2F.E2_WIN
SRC = Path('src') / 'lib'
ESTS = ('E1', 'E2', 'E3', 'E4')

# Production lines section `bugg` must find. If one has moved the script STOPS rather than
# reporting a bug against code that is no longer there.
BUG_ANCHORS = [
    ('dataset/datasetGate.ts', 'export const MULTI_SWING_SUSPECT_SEC = 3.0'),
    ('dataset/datasetGate.ts', 'export function isSuspectMultiSwing'),
    ('dataset/datasetGate.ts', 'return envelope.finishSec - envelope.startSec >'),
    ('dataset/datasetGate.ts', 'suspectMultiSwing: isSuspectMultiSwing(s.envelope)'),
    ('dataset/datasetGate.ts', 'suspectMultiSwing: isSuspectMultiSwing(r.envelope)'),
    ('dataset/slowmo.ts', 'export const SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0'),
    ('dataset/slowmo.ts', 'export const SLOWMO_FRAME_CAP_FRAC = 0.15'),
    ('dataset/slowmo.ts', 'export function deriveSlowmo'),
    ('dataset/slowmo.ts', 'envelopeDurationSec > SLOWMO_ENVELOPE_THRESHOLD_SEC'),
    ('poseSegments.ts', 'const MAX_ENVELOPE_SEC = 3.0'),
    ('poseSegments.ts', 'if (envSec > MAX_ENVELOPE_SEC) return no('),
    ('dataset/extractDataset.ts',
     'const slowmo = deriveSlowmo(envelopeDurationSec, clip.slowmoMode)'),
    ('dataset/extractDataset.ts', 'export function slowmoSummary'),
    ('dataset/extractDataset.ts', 'multiSwingSuspectSec: MULTI_SWING_SUSPECT_SEC'),
    ('dataset/extractDataset.ts', 'slowmoThresholdSec: SLOWMO_ENVELOPE_THRESHOLD_SEC'),
]


def find_line(fname, needle):
    p = SRC / fname
    for i, ln in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
        if needle in ln:
            return i, ln.strip()
    raise SystemExit('%s no longer contains %r -- the claim in hard-core.md cannot be '
                     'checked against the code' % (p, needle))


# -- small statistics ---------------------------------------------------------

def q(xs, f):
    return SR.pct(sorted(xs), f) if xs else None


def auc(pos, neg):
    """P(a random `pos` ranks above a random `neg`), ties counted as half.

    A SEPARATION measure, not a classifier and not a threshold: it is the whole ROC, read
    off without choosing a point on it. 0.50 means the two distributions are interleaved;
    0 or 1 means they do not overlap at all. Nothing downstream consumes it.
    """
    if not pos or not neg:
        return None
    s = 0.0
    for a in pos:
        for b in neg:
            s += 1.0 if a > b else (0.5 if a == b else 0.0)
    return s / (len(pos) * len(neg))


def fmt(x, n=2):
    return '--' if x is None else ('%.*f' % (n, x))


# -- the runtime quantities ---------------------------------------------------

def runtime_row(d, ch, s):
    """Everything section `forutsag` measures, per swing, from the WARM trajectory alone.

    NO ground truth is read here: every quantity exists at run time, before any annotator.
    Each one is either a property of the pose trajectory inside the envelope, a property of
    the envelope itself, or a disagreement between the estimators. Nothing is combined.
    """
    tr = EST['track'](d)                                # (t, midpoint) per envelope frame
    n = len(tr)
    h = [None if m is None else -m[1] for _, m in tr]   # up = larger, EA.clip_track's sign
    posed = [i for i, v in enumerate(h) if v is not None]
    sp = EST['speed_series'](d, E2_WIN)
    vy = EST['vy_series'](d, WIN)

    # 1. pose-presence: the share of envelope frames the model returned a pose for
    presence = len(posed) / n if n else None

    # 2. the largest frame step in the trajectory (normalised image units), over pairs that
    #    BOTH carry a pose and are adjacent -- a gap in the pose is not a step
    steps = []
    for a, b in zip(posed, posed[1:]):
        if b == a + 1:
            pa, pb = tr[a][1], tr[b][1]
            steps.append(((pb[0] - pa[0]) ** 2 + (pb[1] - pa[1]) ** 2) ** 0.5)
    max_step = max(steps) if steps else None

    # 3. envelope length, in frames and in seconds
    dur = s['env'][1] - s['env'][0]

    # 4. monotonicity at the window's end: is the hand still RISING at the last posed frame
    #    (envelope-audit section 5's own predicate, h[k] > h[k-1]), and how long the final
    #    rising run is
    rising = rise_run = None
    if len(posed) >= 2:
        rising = h[posed[-1]] > h[posed[-2]]
        r = 0
        rev = list(reversed(posed))
        for a, b in zip(rev, rev[1:]):
            if h[a] > h[b]:
                r += 1
            else:
                break
        rise_run = r

    # 5. amplitude: the vertical excursion of the hand track inside the envelope
    hv = [h[i] for i in posed]
    amp = (max(hv) - min(hv)) if hv else None

    # 6. how many sign changes there are: E3's own armed candidates, and the unarmed set
    #    E3 searches inside before the 0.10 gate removes most of it
    n_arm = len(CS.crossings(vy))
    n_raw = len(MS.unarmed_crossings(vy))

    # 7./8. disagreement between the estimators themselves -- the only quantities here that
    #       read no annotation at all AND compare two answers rather than the trajectory
    pts = {e: ch.get(e) for e in ESTS}
    d24 = (abs(pts['E2'] - pts['E4'])
           if pts['E2'] is not None and pts['E4'] is not None else None)
    d34 = (abs(pts['E3'] - pts['E4'])
           if pts['E3'] is not None and pts['E4'] is not None else None)
    have = [v for v in pts.values() if v is not None]
    spread4 = (max(have) - min(have)) if len(have) == 4 else None
    have3 = [pts[e] for e in ('E2', 'E3', 'E4') if pts[e] is not None]
    spread3 = (max(have3) - min(have3)) if len(have3) == 3 else None

    # speed at the envelope's last frame relative to the envelope's own peak -- the other
    # half of envelope-audit section 5's reading of why a window ends
    spv = [v for _, v in sp if v is not None]
    peak = max(spv) if spv else None
    last_sp = None
    for i in range(len(sp) - 1, -1, -1):
        if sp[i][1] is not None:
            last_sp = sp[i][1]
            break
    end_frac = (last_sp / peak) if (peak and last_sp is not None) else None

    return dict(presence=presence, max_step=max_step, env_n=n, env_sec=dur,
                rising=rising, rise_run=rise_run, amp=amp, n_arm=n_arm, n_raw=n_raw,
                d24=d24, d34=d34, spread4=spread4, spread3=spread3, end_frac=end_frac)


# -- FRAGA 1: den varma baslinjen ---------------------------------------------

def dist_rows(ch, ivs, by_id, est):
    return [(by_id[sid]['clip'], SR.point_to_interval(ch[sid][est], ivs[sid]))
            for sid in sorted(ch)
            if ivs.get(sid) and ch[sid].get(est) is not None]


def describe(label, rows, missing):
    d = [v for _, v in rows]
    a = [abs(x) for x in d]
    cv = list(SR.by_clip(rows).values())
    print('    %-12s n=%-3d rader / %-2d klipp  inne %2d (%4.1f %%)  median %+.1f  '
          '|median| %.1f  p90 %5.1f  max %6.1f  MAD %.1f  klippniva |median| %.1f  '
          'utan svar %d'
          % (label, len(d), len(SR.by_clip(rows)), sum(1 for x in d if x == 0),
             100 * sum(1 for x in d if x == 0) / len(d) if d else 0,
             SR.median(d), SR.median(a), SR.pct(a, 0.9), max(a), SR.mad(d),
             SR.median([abs(x) for x in cv]), missing))


def section_baslinje(answers, cold, warm_ch, spans, by_id):
    print('\n=== 1. DEN VARMA BASLINJEN -- den enda som galler framat ===')
    print('  Allt nedan ar matt pa run_pose_clip.py:s helklippsbanor (VARM sparare, en per')
    print('  klipp, fran t=0) -- den konfiguration e2-and-floor.md section 1 visade att')
    print('  produktionen kor. Envelopens rutor ar hamtade ur helklippsbanan ruta for ruta')
    print('  pa tid, envelope_audit.py:s egen konstruktion. Ingen kalibrering, inget skift,')
    print('  ingen troskel.')
    (n1, a1), (n2, a2) = list(answers.items())[:2]
    targets = ((n1, {s: SR.interval(a1.get(s)) for s in warm_ch}),
               (n2, {s: SR.interval(a2.get(s)) for s in warm_ch}),
               ('spannet', spans))
    for tname, ivs in targets:
        print('\n  -- mot %s --' % tname)
        for est in ESTS:
            rows = dist_rows(warm_ch, ivs, by_id, est)
            miss = sum(1 for sid in warm_ch
                       if ivs.get(sid) and warm_ch[sid].get(est) is None)
            describe(est + ' varm', rows, miss)

    print('\n  -- vad den ersatter: samma cell, kall mot varm, sida vid sida --')
    print('     Den KALLA kolumnen ar kontrollraden overst och ar INTE ett resultat har.')
    print('     Det ar de tal som star som `inne` i resultat.md section 3, subframe.md')
    print('     section 3, crossing-selection.md section 0, multiswing.md section 0,')
    print('     envelope-audit.md section 0 och e2-and-floor.md section 0. Varje sadan')
    print('     siffra ersatts av den varma bredvid.')
    print('     %-10s %-4s %14s %14s %8s' % ('mot', 'est', 'inne KALL', 'inne VARM', 'netto'))
    for tname, ivs in targets:
        for est in ESTS:
            rc = dist_rows(cold, ivs, by_id, est)
            rw = dist_rows(warm_ch, ivs, by_id, est)
            hc = sum(1 for _, v in rc if v == 0)
            hw = sum(1 for _, v in rw if v == 0)
            print('     %-10s %-4s %9d av %-3d %9d av %-3d %+8d'
                  % (tname, est, hc, len(rc), hw, len(rw), hw - hc))
    print('\n  -- manniskorna, oforandrade (de ar inte matta pa en posebana) --')
    print('     resultat.md section 2: Eriks mittpunkt inne i Lisas intervall 73 av 91')
    print('     (80 %), Lisas inne i Eriks 61 av 91 (67 %). Det ar jamforelsetalet i')
    print('     fraga 4, och det rors inte av vilken sparare som kordes.')


# -- FRAGA 2: den harda karnan ------------------------------------------------

def build_core(warm_ch, spans):
    """The rows where NONE of E1-E4 lands inside the human span, measured warm.

    An estimator with no answer at all counts as not inside -- it certainly did not hit.
    """
    core, rest = [], []
    for sid in sorted(spans):
        if sid not in warm_ch:
            continue
        hits = [e for e in ESTS
                if warm_ch[sid].get(e) is not None
                and SR.point_to_interval(warm_ch[sid][e], spans[sid]) == 0]
        (rest if hits else core).append(sid)
    return core, rest


def section_karna(reg, warm, warm_ch, spans, by_id, answers, cold):
    print('\n=== 2. DEN HARDA KARNAN ===')
    print('  Definition, satt i fragan och inte har: karnan ar de rader med ett manskligt')
    print('  spann dar INGEN av E1, E2, E3, E4 hamnar inne i spannet. Matt VARMT. En')
    print('  estimator utan svar raknas som inte inne.')
    core, rest = build_core(warm_ch, spans)
    n = len(core) + len(rest)
    allclips = {by_id[s]['clip'] for s in core + rest}
    print('\n  KARNAN: %d rader av %d (%.0f %%) i %d klipp av %d.'
          % (len(core), n, 100 * len(core) / n,
             len({by_id[s]['clip'] for s in core}), len(allclips)))
    print('  RESTEN: %d rader i %d klipp.'
          % (len(rest), len({by_id[s]['clip'] for s in rest})))

    print('\n  -- hur manga av de fyra som traffar, rad for rad --')
    hist = collections.Counter()
    for sid in core + rest:
        hist[sum(1 for e in ESTS
                 if warm_ch[sid].get(e) is not None
                 and SR.point_to_interval(warm_ch[sid][e], spans[sid]) == 0)] += 1
    for k in sorted(hist):
        print('     %d av 4 inne: %3d rader (%.0f %%)' % (k, hist[k], 100 * hist[k] / n))

    print('\n  -- kanslighet: hanger karnans storlek pa E1, som redan ar underkand? --')
    core3 = [sid for sid in core + rest
             if not [e for e in ('E2', 'E3', 'E4')
                     if warm_ch[sid].get(e) is not None
                     and SR.point_to_interval(warm_ch[sid][e], spans[sid]) == 0]]
    print('     karnan definierad pa E2/E3/E4 utan E1: %d rader (mot %d med E1). E1 ar ensam'
          % (len(core3), len(core)))
    print('     inne pa %d rader, sa karnan hanger inte pa E1 over huvud taget.'
          % len(set(core3) - set(core)))

    print('\n  -- hur HARD ar karnan? hur nara kommer den bASTA av de fyra pa dess rader --')
    print('     `bast` ar bara den med minst |avstand| -- det ar inte `den ratta`, och')
    print('     ingenting valjs pa den. Ren beskrivning. Golvet att lasa den mot ar')
    print('     e2-and-floor.md section 4: en meningslos storning flyttar rutan |median|')
    print('     1 bildruta, och det manskliga spannet ar median 2 rutor brett.')
    for lab, sel in (('karnan', core), ('resten', rest)):
        best = []
        for sid in sel:
            ds = [abs(SR.point_to_interval(warm_ch[sid][e], spans[sid]))
                  for e in ESTS if warm_ch[sid].get(e) is not None]
            if ds:
                best.append(min(ds))
        if not best:
            continue
        b = sorted(best)
        print('     %-7s n=%-3d  median %.0f  p75 %.0f  p90 %.0f  max %.0f   | <=1 ruta: %d '
              '(%.0f %%), <=2: %d (%.0f %%), <=3: %d (%.0f %%), >=10: %d'
              % (lab, len(b), SR.median(b), SR.pct(b, 0.75), SR.pct(b, 0.9), max(b),
                 sum(1 for x in b if x <= 1), 100 * sum(1 for x in b if x <= 1) / len(b),
                 sum(1 for x in b if x <= 2), 100 * sum(1 for x in b if x <= 2) / len(b),
                 sum(1 for x in b if x <= 3), 100 * sum(1 for x in b if x <= 3) / len(b),
                 sum(1 for x in b if x >= 10)))

    print('\n  -- kanslighet: overlever karnan som KLASS matgolvet? --')
    print('     Samma storning som e2-and-floor.md section 4: kall sparare i stallet for')
    print('     varm, samma modell, samma bildrutor. De kalla talen anvands inte som')
    print('     resultat -- de anvands har bara for att se om KARNAN ar samma rader.')
    cc, _ = build_core(cold, spans)
    cs, ws = set(cc), set(core)
    print('     karnan kall: %d rader. karnan varm: %d. Gemensamma: %d (%.0f %% av den varma).'
          % (len(cs), len(ws), len(cs & ws), 100 * len(cs & ws) / len(ws) if ws else 0))
    print('     bara kall %d, bara varm %d -- omsattning %d rader.'
          % (len(cs - ws), len(ws - cs), len(cs ^ ws)))

    print('\n  -- kanslighet: karnan mot vardera annotatoren i stallet for mot spannet --')
    print('     (Spannet ar unionen, sa det ar det GENEROSASTE malet: en karna mot en enskild')
    print('     bedomare kan bara bli storre. Talen star for att visa hur mycket.)')
    for aname, arows in list(answers.items())[:2]:
        ivs = {s: SR.interval(arows.get(s)) for s in spans}
        ivs = {s: v for s, v in ivs.items() if v}
        c2, r2 = build_core(warm_ch, ivs)
        print('     mot %-6s karnan %d av %d rader (%.0f %%) i %d klipp'
              % (aname, len(c2), len(c2) + len(r2),
                 100 * len(c2) / (len(c2) + len(r2)),
                 len({by_id[s]['clip'] for s in c2})))

    print('\n  -- ar det samma svingar som de tva tidigare grupperna? (bada omraknade VARMT) --')
    A = E2F.anchor_sets(warm, reg, spans, by_id)
    noanchor = {sid for sid, v in A.items() if not v['adm']}
    print('     (a) INGEN tillaten ankarruta for E2 alls: %d av %d rader (%.0f %%) i %d '
          'klipp.' % (len(noanchor), len(A), 100 * len(noanchor) / len(A) if A else 0,
                      len({A[s]['clip'] for s in noanchor})))
    print('         e2-and-floor.md section 3 matte 19 av 91 (21 %) KALLT; talet ovan ar')
    print('         samma matning pa den varma banan.')
    # Two predicates, because they are not the same question and the difference is real.
    # A crossing at bracket j lies BETWEEN frames j+1 and j+2 (1-based). S-34/S-35 asked
    # `lo <= j+1 <= hi`, which misses a crossing whose interpolated answer rounds to j+2 --
    # and that is exactly how E4 can be inside on a row this test calls empty. The
    # bracket-overlap version is the honest `is there a sign change inside the humans'
    # interval`; the strict version is kept beside it because it is the earlier rounds' own.
    nocross, nocross_strict, nocross_arm = set(), set(), set()
    for sid in sorted(spans):
        if sid not in warm:
            continue
        vy = EST['vy_series'](warm[sid], WIN)
        lo, hi = spans[sid]
        if not [j for j in MS.unarmed_crossings(vy) if j + 1 <= hi and j + 2 >= lo]:
            nocross.add(sid)
        if not [j for j in MS.unarmed_crossings(vy) if lo <= j + 1 <= hi]:
            nocross_strict.add(sid)
        if not [j for j in CS.crossings(vy) if j + 1 <= hi and j + 2 >= lo]:
            nocross_arm.add(sid)
    have = {s for s in spans if s in warm}
    print('     (b) INGEN teckenvaxling alls (oarmad, ingen hysteres) som overlappar '
          'spannet: %d av %d rader (%.0f %%) i %d klipp.'
          % (len(nocross), len(have), 100 * len(nocross) / len(have),
             len({by_id[s]['clip'] for s in nocross})))
    print('         En vaxling vid bracket j ligger MELLAN ruta j+1 och j+2, sa testet ar')
    print('         att [j+1, j+2] skar spannet. Det ar noderna en interpolerande estimator')
    print('         kan runda till, och det ar darfor E4 kan ligga inne pa en rad som det')
    print('         striktare testet kallar tom.')
    print('         S-34/S-35:s strikta test (lo <= j+1 <= hi): %d av %d (%.0f %%).'
          % (len(nocross_strict), len(have), 100 * len(nocross_strict) / len(have)))
    print('         ingen ARMAD kandidat (E3:s egen hysteres 0,10) som overlappar spannet: '
          '%d av %d (%.0f %%).'
          % (len(nocross_arm), len(have), 100 * len(nocross_arm) / len(have)))
    print('         S-34/S-35:s 22 av 23 raknades KALLT och bara INOM de 23 rader dar E4 lag')
    print('         utanfor och svingen hade exakt en armad kandidat. Den restriktionen ar')
    print('         borta har: talen galler varenda rad med spann, sa det ar en storre')
    print('         namnare och inte samma brak.')

    cset = set(core)
    for lab, S in (('ingen ankarruta (a)', noanchor), ('ingen vaxling inne (b)', nocross)):
        inter = cset & S
        print('\n     karnan mot %s: karnan %d, gruppen %d, snittet %d.'
              % (lab, len(cset), len(S), len(inter)))
        print('       av karnan ligger %d av %d (%.0f %%) i gruppen'
              % (len(inter), len(cset), 100 * len(inter) / len(cset) if cset else 0))
        print('       av gruppen ligger %d av %d (%.0f %%) i karnan'
              % (len(inter), len(S), 100 * len(inter) / len(S) if S else 0))
        print('       bara i karnan %d, bara i gruppen %d, i ingendera %d'
              % (len(cset - S), len(S - cset), len(have - cset - S)))
    print('\n     alla tre samtidigt: %d rader. Karnan utan nagon av de tva forklaringarna: '
          '%d rader.' % (len(cset & noanchor & nocross), len(cset - noanchor - nocross)))

    print('\n  -- karnan rad for rad (varm; avstand i bildrutor, + = efter spannet) --')
    print('     %-9s %-11s %7s %7s %7s %7s %9s %5s %5s %s'
          % ('id', 'klipp', 'E1', 'E2', 'E3', 'E4', 'spann', 'ank', 'vax', 'flaggor'))
    for sid in core:
        lo, hi = spans[sid]
        ds = []
        for e in ESTS:
            p = warm_ch[sid].get(e)
            ds.append('--' if p is None else '%+d' % SR.point_to_interval(p, spans[sid]))
        fl = []
        if by_id[sid]['slowmo']:
            fl.append('slow-mo')
        if not by_id[sid]['hasConfidentImpact']:
            fl.append('utan nedslag')
        print('     %-9s %-11s %7s %7s %7s %7s %4d-%-4d %5s %5s %s'
              % (sid, by_id[sid]['clip'], ds[0], ds[1], ds[2], ds[3], lo, hi,
                 'nej' if sid in noanchor else 'ja',
                 'nej' if sid in nocross else 'ja', ', '.join(fl) or '-'))
    return core, rest


# -- FRAGA 3: gar karnan att forutsaga utan facit? ----------------------------

QUANTS = [
    ('pose-presence (andel rutor med pose)', 'presence', 3),
    ('storsta rutsteg i banan (bildenheter)', 'max_step', 4),
    ('envelopelangd (rutor)', 'env_n', 0),
    ('envelopelangd (s)', 'env_sec', 2),
    ('stigande run vid fonstrets slut (rutor)', 'rise_run', 0),
    ('fart vid sista rutan / envelopens toppfart', 'end_frac', 3),
    ('amplitud (vertikal exkursion)', 'amp', 3),
    ('antal ARMADE vaxlingar (E3:s kandidater)', 'n_arm', 0),
    ('antal OARMADE teckenbyten', 'n_raw', 0),
    ('|E2 - E4| (rutor)', 'd24', 1),
    ('|E3 - E4| (rutor)', 'd34', 1),
    ('spridning E1-E4, max-min (rutor)', 'spread4', 1),
    ('spridning E2/E3/E4, max-min (rutor)', 'spread3', 1),
]


def section_forutsag(RT, core, rest, by_id):
    print('\n=== 3. GAR KARNAN ATT FORUTSAGA UTAN FACIT? ===')
    print('  Varje storhet finns vid KORTID: den lases ur posebanan, ur envelopen eller ur')
    print('  estimatorernas inbordes oenighet, aldrig ur en annotering. Separationen')
    print('  redovisas EN STORHET I TAGET. INGEN troskel satts, ingen klassificerare byggs,')
    print('  ingen sammanvagd poang raknas. AUC ar hela ROC-kurvan avlast utan att valja en')
    print('  punkt pa den: 0,50 = fordelningarna ar helt omlott, 0 eller 1 = de overlappar')
    print('  inte alls. Den ar ett SEPARATIONSMATT, inte en regel.')
    print('\n  %-42s %8s %22s %22s %6s'
          % ('storhet', 'n k/r', 'KARNAN med (p25-p75)', 'RESTEN med (p25-p75)', 'AUC'))
    for lab, key, dec in QUANTS:
        cv = [RT[s][key] for s in core if s in RT and RT[s][key] is not None]
        rv = [RT[s][key] for s in rest if s in RT and RT[s][key] is not None]
        if not cv or not rv:
            print('  %-42s %8s %22s' % (lab, '--', 'inget underlag'))
            continue
        cell_c = '%s (%s-%s)' % (fmt(SR.median(cv), dec), fmt(q(cv, 0.25), dec),
                                 fmt(q(cv, 0.75), dec))
        cell_r = '%s (%s-%s)' % (fmt(SR.median(rv), dec), fmt(q(rv, 0.25), dec),
                                 fmt(q(rv, 0.75), dec))
        print('  %-42s %3d/%-4d %22s %22s %6s'
              % (lab, len(cv), len(rv), cell_c, cell_r, fmt(auc(cv, rv), 2)))

    print('\n  -- de binara storheterna, som andelar --')
    cv = [RT[s]['rising'] for s in core if s in RT and RT[s]['rising'] is not None]
    rv = [RT[s]['rising'] for s in rest if s in RT and RT[s]['rising'] is not None]
    print('     %-44s karnan %d av %d (%.0f %%), resten %d av %d (%.0f %%)'
          % ('banan stiger vid envelopens sista ruta', sum(cv), len(cv),
             100 * sum(cv) / len(cv) if cv else 0, sum(rv), len(rv),
             100 * sum(rv) / len(rv) if rv else 0))
    for lab, sel in (('slow-mo (produktionens egen flagga)', lambda s: by_id[s]['slowmo']),
                     ('utan sakert nedslag', lambda s: not by_id[s]['hasConfidentImpact'])):
        cv = [sel(s) for s in core]
        rv = [sel(s) for s in rest]
        print('     %-44s karnan %d av %d (%.0f %%), resten %d av %d (%.0f %%)'
              % (lab, sum(cv), len(cv), 100 * sum(cv) / len(cv) if cv else 0,
                 sum(rv), len(rv), 100 * sum(rv) / len(rv) if rv else 0))

    print('\n  -- sarskilt: ar estimatorernas egen oenighet en indikator? --')
    print('     Det ar de enda storheterna i tabellen som jamfor tva SVAR med varandra i')
    print('     stallet for att beskriva banan -- en grind som byggdes pa dem skulle inte')
    print('     krava facit. Overlappen i klartext, kvantil for kvantil:')
    for lab, key in (('|E2 - E4|', 'd24'), ('|E3 - E4|', 'd34'),
                     ('spridning E2/E3/E4', 'spread3')):
        cv = sorted(RT[s][key] for s in core if s in RT and RT[s][key] is not None)
        rv = sorted(RT[s][key] for s in rest if s in RT and RT[s][key] is not None)
        if not cv or not rv:
            continue
        print('     %-20s karnan (n=%d) p10 %s p25 %s median %s p75 %s p90 %s max %s'
              % (lab, len(cv), fmt(q(cv, .1), 1), fmt(q(cv, .25), 1),
                 fmt(SR.median(cv), 1), fmt(q(cv, .75), 1), fmt(q(cv, .9), 1),
                 fmt(max(cv), 1)))
        print('     %-20s resten (n=%d) p10 %s p25 %s median %s p75 %s p90 %s max %s'
              % ('', len(rv), fmt(q(rv, .1), 1), fmt(q(rv, .25), 1),
                 fmt(SR.median(rv), 1), fmt(q(rv, .75), 1), fmt(q(rv, .9), 1),
                 fmt(max(rv), 1)))
        lo, hi = q(rv, .25), q(rv, .75)
        ov = sum(1 for x in cv if lo <= x <= hi)
        print('     %-20s karnans rader inne i RESTENS IQR (%s-%s): %d av %d (%.0f %%)'
              % ('', fmt(lo, 1), fmt(hi, 1), ov, len(cv), 100 * ov / len(cv)))


# -- FRAGA 4: taket ------------------------------------------------------------

def section_taket(warm_ch, spans, by_id, core, rest):
    print('\n=== 4. TAKET FOR EN GRINDAD LOSNING ===')
    print('  Om karnan utesluts: hur stor andel ligger varje estimator inne pa RESTEN?')
    print('  Det star i klartext for att talet inte ska lasas som ett resultat: karnan ar')
    print('  DEFINIERAD som de rader dar ingen estimator ar inne, sa att stryka den lyfter')
    print('  andelen pa resten MEKANISKT. Talet ar ett TAK -- vad en grind som kande karnan')
    print('  perfekt skulle kunna na -- inte vad nagon grind naar. Fraga 3 matte')
    print('  separationen; den satter ingen grind, och ingen perfekt grind finns.')
    print('\n     %-4s %-28s %s' % ('', 'PA RESTEN', 'PA ALLA RADER MED SPANN'))
    for est in ESTS:
        rr = [SR.point_to_interval(warm_ch[s][est], spans[s]) for s in rest
              if warm_ch[s].get(est) is not None]
        aa = [SR.point_to_interval(warm_ch[s][est], spans[s]) for s in core + rest
              if warm_ch[s].get(est) is not None]
        nr, na = len(rest), len(core) + len(rest)
        print('     %-4s inne %3d av %-3d (%4.1f %%)      inne %3d av %-3d (%4.1f %%)'
              % (est, sum(1 for x in rr if x == 0), nr,
                 100 * sum(1 for x in rr if x == 0) / nr,
                 sum(1 for x in aa if x == 0), na,
                 100 * sum(1 for x in aa if x == 0) / na))
    print('\n     klippniva: resten ligger i %d klipp, karnan i %d, hela rundan i %d.'
          % (len({by_id[s]['clip'] for s in rest}), len({by_id[s]['clip'] for s in core}),
             len({by_id[s]['clip'] for s in core + rest})))
    print('\n  -- jamforelsen: manniskorna mot varandra (resultat.md section 2, oforandrad) --')
    print('     Eriks mittpunkt inne i Lisas intervall: 73 av 91 (80 %)')
    print('     Lisas mittpunkt inne i Eriks intervall: 61 av 91 (67 %)')
    print('     De talen ar raknade pa ALLA 91 rader, inte pa en delmangd. Jamforelsen med')
    print('     kolumnen `pa resten` ar alltsa i estimatorernas favor, inte tvartom.')


# -- FRAGA 5: buggen -----------------------------------------------------------

def section_bugg(reg, flags):
    print('\n=== 5. BUGGEN: samma uttryck bar tva skilda begrepp ===')
    print('  Koden ar LAST och citerad, inte reimplementerad och inte andrad. Skriptet')
    print('  stannar om nagon av raderna har flyttat.')
    for fname, needle in BUG_ANCHORS:
        i, ln = find_line(fname, needle)
        print('    src/lib/%-26s :%-4d %s' % (fname, i, ln))

    print('\n  -- var i koden: tre konstanter, tva begrepp, ett varde --')
    print('     poseSegments.ts   MAX_ENVELOPE_SEC              = 3,0')
    print('       PRODUKTIONENS AVVISNINGSGRANS: over den ar det `not one swing`.')
    print('     datasetGate.ts    MULTI_SWING_SUSPECT_SEC       = 3,0')
    print('       en uttalad SPEGLING av den ovan (kommentaren sager det), anvand som')
    print('       FLAGGA i stallet for avvisning.')
    print('     slowmo.ts         SLOWMO_ENVELOPE_THRESHOLD_SEC = 3,0')
    print('       ett OBEROENDE hardvalt varde for ett annat begrepp: filmhastighet.')
    print('     Bada flaggorna raknas pa samma storhet (envelopens varaktighet) och jamfors')
    print('     med samma tal, sa `suspectMultiSwing` och `slowmo` i auto-lage ar SAMMA')
    print('     PREDIKAT. Den enda vag dar de kan skilja sig ar overridelaget')
    print('     (force-normal/force-slowmo), som ror slowmo men INTE suspectMultiSwing.')

    print('\n  -- matt pa rundan, inte antaget ur koden --')
    slow = {s['id'] for s in reg['swings'] if s['slowmo']}
    dur3 = {s['id'] for s in reg['swings'] if s['env'][1] - s['env'][0] > 3.0}
    sm = {sid for sid, f in flags.items() if f.get('suspectMultiSwing')}
    ct = {sid for sid, f in flags.items() if f.get('clippedTail')}
    rel = {s['id'] for s in reg['swings'] if s['gate'] == 'dataset-relaxed'}
    prod = {s['id'] for s in reg['swings'] if s['gate'] == 'production'}
    noimp = {s['id'] for s in reg['swings'] if not s['hasConfidentImpact']}
    print('     slowmo: %d av %d svingar. suspectMultiSwing: %d. envelope > 3,0 s: %d.'
          % (len(slow), len(reg['swings']), len(sm), len(dur3)))
    print('     slowmo == suspectMultiSwing: %s (bara slowmo %d, bara sM %d)'
          % ('JA' if slow == sm else 'NEJ', len(slow - sm), len(sm - slow)))
    print('     suspectMultiSwing == (envelope > 3,0 s): %s'
          % ('JA' if sm == dur3 else 'NEJ'))
    print('     suspectMultiSwing ar en akta delmangd av dataset-relaxed: %s -- %d av %d '
          'relaxed bar den; production-grindade som bar den: %d av %d.'
          % ('JA' if sm <= rel else 'NEJ', len(sm & rel), len(rel), len(sm & prod),
             len(prod)))
    ds = sorted(s['env'][1] - s['env'][0] for s in reg['swings'])
    print('     envelopelangder narmast granskningen: %s'
          % ', '.join('%.3f' % x for x in ds if 2.3 <= x <= 4.2))
    print('     (`>` ar strikt pa alla tre stallena, sa raden pa exakt 3,000 s ar varken')
    print('     slowmo eller suspectMultiSwing och accepteras av produktionens isSwing --')
    print('     reglerna ar alltsa eniga aven i randen.)')
    print('     clippedTail: %d, varav %d utan sakert nedslag -- delmangd: %s'
          % (len(ct), len(ct & noimp), 'JA' if ct <= noimp else 'NEJ'))
    n_slow_frames = sum(len(s['frameTimes']) for s in reg['swings'] if s['slowmo'])
    tot = sum(len(s['frameTimes']) for s in reg['swings'])
    print('     bildrutor som bar flaggan: %d av %d (%.1f %%), mot SLOWMO_FRAME_CAP_FRAC '
          '15,0 %%.' % (n_slow_frames, tot, 100 * n_slow_frames / tot))

    print('\n  -- vad som gar sonder NEDSTROMS --')
    print('     1. Slow-mo-kvoten mater segmenteringsfel. SLOWMO_FRAME_CAP_FRAC varnar nar')
    print('        over 15 % av rutorna kommer fran slow-mo; eftersom flaggan i praktiken')
    print('        ar `lang envelope` raknas varje misslyckad segmentering in i den kvoten.')
    print('        En ombalansering som foljer varningen tar bort fel rutor.')
    print('     2. Det finns ingen atgard som skiljer dem at. datasetGate.ts sager att')
    print('        suspectMultiSwing finns for att `a human can catch them in CVAT`; ett')
    print('        sadant utlatande har ingenstans att ta vagen och andrar inte slowmo-')
    print('        biten. Den enda spaken som finns, slowmoMode, flyttar slowmo men inte')
    print('        suspectMultiSwing -- mangderna kan alltsa bara skilja sig at genom ett')
    print('        manuellt ingrepp, aldrig genom en matning.')
    print('     3. Bada felen ar tysta. En akta slow-mo-sving under 3,0 s far ingen av')
    print('        flaggorna; en normalfilmad envelope med tva repetitioner far bada.')
    print('        Manifestet bar dem som tva kolumner som ser oberoende ut.')
    print('     4. Varje analys som delat rundan pa `slow-mo` har delat pa `lang envelope`.')
    print('        Det galler resultat.md section 6, subframe.md section 7,')
    print('        envelope-audit.md section 5 och e2-and-floor.md section 5. Riktningen i')
    print('        de slutsatserna andras inte -- men namnet pa orsaken gor det.')
    print('     5. suspectMultiSwing kan per konstruktion aldrig tanda pa en production-')
    print('        grindad sving, eftersom produktionen redan AVVISAR envelopes over samma')
    print('        3,0 s. For den del av materialet produktionen sjalv slapper igenom bar')
    print('        flaggan darfor noll information.')


# -- main ----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path)
    ap.add_argument('--clipPoseDir', type=Path, required=True)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all',
                    help='baslinje | karna | forutsag | taket | bugg | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    by_id = {s['id']: s for s in reg['swings']}
    flags = EA.load_flags(reg['swings'])
    print('S-38 den harda karnan: %d svingar i %d klipp, %d envelope-bildrutor'
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
        D[s['id']] = True

    (n1, a1), (n2, a2) = list(answers.items())[:2]
    spans = {}
    for sid in D:
        i1, i2 = SR.interval(a1.get(sid)), SR.interval(a2.get(sid))
        if i1 and i2:
            spans[sid] = (min(i1[0], i2[0]), max(i1[1], i2[1]))

    cold = E2F.choices_for(reg, lambda sid: POSE.get(sid))
    print('  %d svingar med kall posebana; %d med ett E3-val; %d med ett manskligt spann.'
          % (len(POSE), len(D), len(spans)))
    print('  KONTROLLRAD, den KALLA korningen. Den ar INTE ett resultat har -- den ar det')
    print('  enda som visar att pipelinen reproducerar. Stammer den inte med resultat.md,')
    print('  subframe.md, crossing-selection.md, multiswing.md, envelope-audit.md och')
    print('  e2-and-floor.md har posebanorna drivit och inget nedan galler:')
    for tname, ivs in ((n1, {s: SR.interval(a1.get(s)) for s in D}),
                       (n2, {s: SR.interval(a2.get(s)) for s in D}),
                       ('spannet', spans)):
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

    if args.section in ('all', 'baslinje'):
        section_baslinje(answers, cold, warm_ch, spans, by_id)
    core = rest = None
    if args.section in ('all', 'karna', 'forutsag', 'taket'):
        core, rest = section_karna(reg, warm, warm_ch, spans, by_id, answers, cold)
    if args.section in ('all', 'forutsag'):
        RT = {}
        for s in reg['swings']:
            sid = s['id']
            if sid in warm and sid in spans:
                RT[sid] = runtime_row(warm[sid], warm_ch[sid], s)
        section_forutsag(RT, core, rest, by_id)
    if args.section in ('all', 'taket'):
        section_taket(warm_ch, spans, by_id, core, rest)
    if args.section in ('all', 'bugg'):
        section_bugg(reg, flags)


if __name__ == '__main__':
    main()
