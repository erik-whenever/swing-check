# ONE-OFF, READ-ONLY (S-35): does an envelope hold MORE than one swing, and what did E3's
# hysteresis filter away? WRITES NOTHING BUT STDOUT.
#
#   <venv>/python.exe docs/shaft/top-review/multiswing.py <poseDir> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section flag|cross|arming|c054|all]
#
# THE KEY IS SEEN. resultat.md (S-32), subframe.md (S-33) and crossing-selection.md (S-34)
# are written and were read before this was, so the risk here is FITTING, not measurement
# error. This file therefore defines NO estimator, sets NO threshold, sweeps NO parameter and
# excludes NOTHING. Part A is a DIAGNOSIS: every envelope keeps its place in every number
# above; the flag is printed as a full distribution and at several cut levels beside each
# other, so no single level is privileged and none is proposed.
#
# WHAT IS MEASURED
#   A  a multi-swing flag on the WRIST track of all 103 envelopes: topographic PROMINENCE of
#      every local maximum of hand elevation, and whether the track comes back down to
#      ADDRESS height between the two most prominent ones. Prominence needs no parameter --
#      it is a property of the track -- and address height is the envelope's own first frame.
#   B  on the 49 rows where E4 (RND) lies outside the human span, and above all on the 23
#      that have no armed crossing inside the humans' interval: is there an UNARMED sign
#      change in v_y in there, and what in E3's hysteresis dropped it (amplitude on the
#      negative side, amplitude on the positive side, or E3 having already returned)?
#   C  S32-084 (054.mp4) alone: where the wrist track's reversal sits, what happens at frame
#      53.5, and whether the CVAT label f00 @ 3.327 s `backswing` can hold with a top at 17-18.
#
# The series are E3's own: EST['vy_series'](d, 3) is the smoothed v_y E3 thresholds and
# EST['track'](d) is the midpoint-of-wrists trajectory E1/E2/E3 all read. HYST = 0.10 and
# WIN = 3 are analyze_pose's defaults, unchanged. Nothing is re-implemented: score_round.py,
# subframe.py and crossing_selection.py are imported.
#
# NOTHING IS DECIDED HERE. No threshold, no calibration, no production code read or written.
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR             # noqa: E402  -- reused, never re-implemented
import subframe as SF                # noqa: E402  -- e3_bracket / rnd reused
import crossing_selection as CS      # noqa: E402  -- crossings / shape / nclips reused

EST = SF.EST
HYST, WIN = SF.HYST, SF.WIN


# -- the flag: prominence on the hand-elevation track --------------------------

def elevation(d):
    """(t, h) per envelope frame, h = -y of the midpoint of wrists 15/16, so UP is larger.

    EST['track'] is the trajectory E1/E2/E3 already read; only the sign is flipped, so a
    `peak` below is literally the highest the hands get."""
    return [(t, None if m is None else -m[1]) for t, m in EST['track'](d)]


def prominences(hs):
    """[(index, height, prominence)] for every local maximum of `hs`, tallest first.

    Topographic prominence: the standard definition, and a property of the series rather
    than a parameter. Walk out from the peak in both directions until the series rises
    above it (or the series ends), take the lowest point reached on each side, and the
    prominence is the peak height minus the HIGHER of those two minima. For the global
    maximum that is simply peak minus the series minimum. Nothing is thresholded here: the
    full list is returned and the cutting is done, visibly, by the caller.
    """
    pts = [(i, v) for i, v in enumerate(hs) if v is not None]
    if len(pts) < 3:
        return []
    out = []
    for k in range(len(pts)):
        i, v = pts[k]
        if k and pts[k - 1][1] > v:
            continue
        if k + 1 < len(pts) and pts[k + 1][1] > v:
            continue
        if k and pts[k - 1][1] == v:
            continue          # a flat top is counted once, at its first frame
        lo_l = v
        for j in range(k - 1, -1, -1):
            if pts[j][1] > v:
                break
            lo_l = min(lo_l, pts[j][1])
        lo_r = v
        for j in range(k + 1, len(pts)):
            if pts[j][1] > v:
                break
            lo_r = min(lo_r, pts[j][1])
        out.append((i, v, v - max(lo_l, lo_r)))
    return sorted(out, key=lambda r: -r[2])


def runs(series, keep):
    """Maximal runs of consecutive frames where keep(value) holds: [(start, end)].

    Frames with no pose are transparent -- they neither break a run nor extend it -- so a
    dropped landmark in the middle of a descent does not manufacture an extra run.
    """
    out, cur = [], None
    for i, v in enumerate(series):
        if v is None:
            continue
        if keep(v):
            cur = (i, i) if cur is None else (cur[0], i)
        elif cur is not None:
            out.append(cur)
            cur = None
    if cur is not None:
        out.append(cur)
    return out


def excursions(series, h_addr):
    """Every run ABOVE address height, with its own highest point.

    A golf swing crosses address height twice in elevation: once going up into the top and
    once coming up into the finish. So ONE swing gives two excursions and two swings give
    four; the count is the flag, and the baseline of two is measured below rather than
    assumed. Returns [(start, end, peak index, peak height above address)].
    """
    out = []
    for a, b in runs(series, lambda v: v > h_addr):
        k = max((i for i in range(a, b + 1) if series[i] is not None),
                key=lambda i: series[i])
        out.append((a, b, k, series[k] - h_addr))
    return out


def flag_row(d, swing):
    """Everything part A measures for one envelope. No cut is applied here."""
    hs_t = elevation(d)
    raw = [v for _, v in hs_t]
    sm = [v for _, v in EST['smooth'](hs_t, WIN)]
    # how steady the track itself is. A wrist landmark that jumps makes reversals out of
    # nothing, so the flag cannot tell `two swings` from `a track that jumps` -- and that
    # has to be visible in the table rather than argued about afterwards.
    jumps = [abs(raw[i + 1] - raw[i]) for i in range(len(raw) - 1)
             if raw[i] is not None and raw[i + 1] is not None]
    vis = [min(r['w']['15'][3], r['w']['16'][3])
           for r in EST['env_frames'](d) if 'w' in r]
    row = dict(n=len(raw), dur=swing['env'][1] - swing['env'][0],
               jump=SR.median(jumps), jump_max=max(jumps) if jumps else None,
               vis=SR.median(vis) if vis else None)
    for tag, series in (('raw', raw), ('sm', sm)):
        pk = prominences(series)
        h_addr = next((v for v in series if v is not None), None)
        if not pk or h_addr is None:
            row[tag] = None
            continue
        top_i, top_h, p1 = pk[0]
        p2 = pk[1][2] if len(pk) > 1 else 0.0
        lift = top_h - h_addr
        exc = excursions(series, h_addr)
        big = max([e[3] for e in exc] or [0.0])
        # runs at or below address height that do NOT touch either end of the envelope: the
        # hands coming back down to where they started, once per swing at impact.
        below = [r for r in runs(series, lambda v: v <= h_addr)
                 if r[0] > 0 and r[1] < len(series) - 1]
        row[tag] = dict(npk=len(pk), top_i=top_i, top_h=top_h, p1=p1, p2=p2,
                        ratio=(p2 / p1) if p1 > 0 else None,
                        lift=lift, p2_lift=(p2 / lift) if lift > 0 else None,
                        peaks=pk[:4], h_addr=h_addr, exc=exc, exc_max=big,
                        nexc={q: sum(1 for e in exc if big > 0 and e[3] >= q * big)
                              for q in (0.3, 0.5, 0.7)},
                        nprom={q: sum(1 for _, _, p in pk if p1 > 0 and p >= q * p1)
                               for q in (0.3, 0.5, 0.7)},
                        nback=len(below), below=below)
    return row


def flagged(F, i):
    """Part A's two criteria as one boolean, used only for the cross-tabs in A2.

    K1 >= 3 full-amplitude excursions above address height, K2 >= 2 returns to address
    height inside the envelope, or K3 >= 3 reversals carrying half the top's prominence. A
    single swing produces one or two of each -- the top, and the finish that E1 already
    showed can stand higher than the top -- so three is the first count a single swing
    cannot make. All are counts, none is a threshold on a fitted quantity, and the 0.5 is
    the middle of the three levels A prints side by side. Nothing is excluded by this
    anywhere; it is a LABEL for a group.
    """
    x = F.get(i, {}).get('raw')
    return bool(x and (x['nexc'][0.5] >= 3 or x['nback'] >= 2 or x['nprom'][0.5] >= 3))


# -- part B: the unarmed crossings E3's hysteresis dropped ---------------------

def runs_around(vy, j):
    """The negative run leading into bracket j and the positive run leaving it.

    The same walk crossing_selection.shape does: back from j while v_y <= 0, forward from
    j+1 while v_y >= 0. Returns (neg run length, its minimum, pos run length, its maximum).
    """
    n = len(vy)
    lo = j
    while lo > 0 and vy[lo - 1][1] is not None and vy[lo - 1][1] <= 0:
        lo -= 1
    hi = j + 1
    while hi + 1 < n and vy[hi + 1][1] is not None and vy[hi + 1][1] >= 0:
        hi += 1
    neg = [v for _, v in vy[lo:j + 1] if v is not None]
    pos = [v for _, v in vy[j + 1:hi + 1] if v is not None]
    return (j - lo + 1, min(neg) if neg else None,
            hi - j, max(pos) if pos else None)


def unarmed_crossings(vy):
    """Every - -> + sign change in `vy`, with NO hysteresis at all, as bracket indices j.

    Not a new estimator, and nothing returns it: this is the set E3 searches INSIDE, before
    the 0.10 gate removes most of it. A bracket j means v_y[j] <= 0 < v_y[j+1].
    """
    out = []
    pts = [(i, v) for i, (_, v) in enumerate(vy) if v is not None]
    for (i, a), (_, b) in zip(pts, pts[1:]):
        if a <= 0 < b:
            out.append(i)
    return out


def why_dropped(vy, j, e3_j):
    """Which part of E3 removed the crossing at bracket j. Descriptive, ordered, exclusive.

    E3 arms when the smoothed v_y falls below -HYST and returns the FIRST frame above
    +HYST. A crossing can therefore be missing from E3's answer for exactly three reasons,
    checked here in the order E3 itself would hit them. Nothing is proposed as a fix.
    """
    neg_len, neg_min, pos_len, pos_max = runs_around(vy, j)
    armed = neg_min is not None and neg_min < -HYST
    confirmed = pos_max is not None and pos_max > HYST
    if armed and confirmed and e3_j is not None and j > e3_j:
        why = 'E3 hade redan returnerat'
    elif armed and confirmed:
        why = 'ar en kandidat'
    elif not armed and not confirmed:
        why = 'amplitud, bada sidor'
    elif not armed:
        why = 'amplitud, negativa sidan'
    else:
        why = 'amplitud, positiva sidan'
    return dict(j=j, why=why, neg_len=neg_len, neg_min=neg_min,
                pos_len=pos_len, pos_max=pos_max, armed=armed, confirmed=confirmed)


# -- A. the multi-swing flag ---------------------------------------------------

def section_flag(F, by_id):
    print('\n=== A. FLERSVINGSFLAGGA -- alla envelopes, matt pa handledsbanan ===')
    print('  h = -y for mittpunkten mellan handled 15 och 16, sa storre h betyder hogre')
    print('  hander. Adresshojden ar envelopens EGNA forsta ruta -- ingen vald niva.')
    print('  K1  antal separata UTFLYKTER over adresshojd med full amplitud. En golfsving')
    print('      passerar adresshojd tva ganger i hojdled: upp i toppen och upp i finishen,')
    print('      sa EN sving ger tva utflykter och tva svingar fyra. Basnivan tva ar matt')
    print('      nedan, inte antagen. `Full amplitud` = utflyktens hogsta punkt over adress')
    print('      ar minst q ganger den storsta utflyktens; q = 0,3 / 0,5 / 0,7 star bredvid')
    print('      varandra sa att ingen niva ar privilegierad.')
    print('  K2  antal ganger banan kommer TILLBAKA till adresshojd inne i envelopen: rutor')
    print('      i foljd med h <= adresshojd som inte ror nagon av envelopens andar. En')
    print('      sving ger en sadan (nedslaget). Helt parameterfritt.')
    print('  K3  antal vandningar med topografisk PROMINENS minst q ganger den hogsta')
    print('      toppens. Prominens ar en egenskap hos banan och behover ingen parameter,')
    print('      och till skillnad fran K1/K2 beror den inte alls pa adressrutan.')
    print('  En sving ger 1-2 av var och en: toppen, och den finish som E1 redan visat kan')
    print('  sta HOGRE an toppen. Tre ar alltsa forsta talet en enda sving inte kan ge.')
    print('  r = P2/P1 star bredvid som beskrivning, aldrig som flagga.')
    print('  INGEN GRANS SATTS OCH INGEN SVING UTESLUTS.')
    ids = sorted(F)
    for tag, lab in (('raw', 'ra bana'), ('sm', 'utjamnad bana, E3:s fonster 3')):
        have = [i for i in ids if F[i][tag]]
        rows = [F[i][tag] for i in have]
        print('\n  -- %s: n=%d svingar i %d klipp --'
              % (lab, len(rows), CS.nclips(have, by_id)))
        for q in (0.3, 0.5, 0.7):
            c = collections.Counter(x['nexc'][q] for x in rows)
            print('     K1 vid q=%.1f: fordelning %s   (>=3: %d svingar i %d klipp)'
                  % (q, '  '.join('%d:%d' % (k, c[k]) for k in sorted(c)),
                     sum(v for k, v in c.items() if k >= 3),
                     CS.nclips([i for i in have if F[i][tag]['nexc'][q] >= 3], by_id)))
        c = collections.Counter(x['nback'] for x in rows)
        print('     K2 atervandningar: fordelning %s   (>=2: %d svingar i %d klipp)'
              % ('  '.join('%d:%d' % (k, c[k]) for k in sorted(c)),
                 sum(v for k, v in c.items() if k >= 2),
                 CS.nclips([i for i in have if F[i][tag]['nback'] >= 2], by_id)))
        for q in (0.3, 0.5, 0.7):
            c = collections.Counter(x['nprom'][q] for x in rows)
            print('     K3 vid q=%.1f: fordelning %s   (>=3: %d svingar i %d klipp)'
                  % (q, '  '.join('%d:%d' % (k, c[k]) for k in sorted(c)),
                     sum(v for k, v in c.items() if k >= 3),
                     CS.nclips([i for i in have if F[i][tag]['nprom'][q] >= 3], by_id)))
        r = sorted(x['ratio'] for x in rows if x['ratio'] is not None)
        npk = [x['npk'] for x in rows]
        print('     (beskrivning) lokala toppar: median %.0f, p90 %.0f, max %d;  '
              'r = P2/P1: median %.2f, p90 %.2f, max %.2f'
              % (SR.median(npk), SR.pct(npk, 0.9), max(npk),
                 SR.median(r), SR.pct(r, 0.9), max(r)))
    print('\n  -- kandidaterna (K1>=3 eller K2>=2 eller K3>=3, q=0,5), ra banan --')
    print('     `K1`/`K3` star vid q=0,3 / 0,5 / 0,7, `K2` ar antalet atervandningar till')
    print('     adresshojd, `langd` envelopens langd i sekunder, `utflykter` deras hogsta')
    print('     rutor med hojden over adress inom parentes.')
    jj = sorted(F[i]['jump'] for i in ids if F[i]['jump'] is not None)
    vv = sorted(F[i]['vis'] for i in ids if F[i]['vis'] is not None)
    print('     Hela rundan som jamforelse: rutsteget i h har median %.4f (p90 %.4f, max'
          % (SR.median(jj), SR.pct(jj, 0.9)))
    print('     %.4f), och den lagsta handledens visibility har median %.2f (p10 %.2f).'
          % (max(jj), SR.median(vv), SR.pct(vv, 0.1)))
    cand = [i for i in ids if F[i]['raw'] and flagged(F, i)]
    print('     %-9s %-13s %11s %4s %11s %6s %6s %7s %5s  %s'
          % ('id', 'klipp', 'K1 .3/.5/.7', 'K2', 'K3 .3/.5/.7', 'langd', 'r', 'rutsteg',
             'vis', 'kriterium'))
    for i in sorted(cand, key=lambda i: (-F[i]['raw']['nexc'][0.5],
                                         -F[i]['raw']['nprom'][0.5],
                                         -F[i]['raw']['nback'])):
        x = F[i]['raw']
        crit = []
        if x['nexc'][0.5] >= 3:
            crit.append('K1>=3')
        if x['nback'] >= 2:
            crit.append('K2>=2')
        if x['nprom'][0.5] >= 3:
            crit.append('K3>=3')
        print('     %-9s %-13s %11s %4d %11s %6.1f %6.2f %7.4f %5.2f  %s'
              % (i, by_id[i]['clip'],
                 '%d/%d/%d' % (x['nexc'][0.3], x['nexc'][0.5], x['nexc'][0.7]),
                 x['nback'],
                 '%d/%d/%d' % (x['nprom'][0.3], x['nprom'][0.5], x['nprom'][0.7]),
                 F[i]['dur'], x['ratio'] or 0, F[i]['jump'] or 0, F[i]['vis'] or 0,
                 '+'.join(crit)))
        print('       utflykter: %s   (storsta rutsteg %.4f)'
              % ('  '.join('ruta %d (+%.3f)' % (e[2] + 1, e[3]) for e in x['exc']),
                 F[i]['jump_max'] or 0))
    print('\n     %d kandidater i %d klipp. Ingen ar utesluten nagonstans, och ingen siffra'
          % (len(cand), CS.nclips(cand, by_id)))
    print('     i resultat.md, subframe.md eller crossing-selection.md ar omraknad utan dem.')
    print('\n  -- klipp som bar mer an en REGISTRERAD sving (registret, inte banan) --')
    per = collections.Counter(by_id[i]['clip'] for i in ids)
    multi = sorted(c for c, k in per.items() if k > 1)
    print('     %d klipp med >1 sving i rundan: %s' % (len(multi), ', '.join(multi)))


# -- A2. the flag crossed against E2's tail and E4's outside rows ---------------

def section_cross(F, by_id, spans, D, tail_ids):
    print('\n=== A2. FLAGGAN KORSAD MOT E2:s SVANS OCH MOT E4:s UTANFOR-RADER ===')
    print('  `flaggad` = K1>=3 eller K2>=2 eller K3>=3 pa RA banan (q=0,5) -- samma tre')
    print('  kriterier som i A, slagna ihop till en grupp bara for att grupperna ar sma.')
    print('  Flaggan ar en diagnos: ingen rad ar struken och ingen siffra omraknad.')
    rows = sorted(spans)
    out = [i for i in rows if D[i]['d_e4r'] != 0]
    none_ = [i for i in out if len(D[i]['cand']) == 1]
    rest = [i for i in out if len(D[i]['cand']) > 1]
    groups = [('E2:s svans (subframe.md 7)', tail_ids),
              ('E4 utanfor spannet', out),
              ('  darav: ingen armad kandidat', none_),
              ('  darav: kandidater finns', rest),
              ('E4 inne i spannet', [i for i in rows if D[i]['d_e4r'] == 0]),
              ('alla med spann', rows),
              ('alla med posebana', sorted(F))]
    print('\n     %-32s %6s %7s %9s %8s %10s'
          % ('grupp', 'n', 'klipp', 'flaggade', 'andel', 'rutsteg p90'))
    for lab, sel in groups:
        sel = [i for i in sel if i in F]
        k = [i for i in sel if flagged(F, i)]
        j = sorted(F[i]['jump_max'] for i in sel if F[i]['jump_max'] is not None)
        print('     %-32s %6d %7d %9d %7.0f %% %10s'
              % (lab, len(sel), CS.nclips(sel, by_id), len(k),
                 100 * len(k) / len(sel) if sel else 0,
                 '%.4f' % SR.pct(j, 0.9) if j else '--'))
    jm = sorted(F[i]['jump_max'] for i in F if F[i]['jump_max'] is not None)
    print('\n  -- E2:s svans, rad for rad (de 10 i subframe.md 7) --')
    print('     `storsta rutsteg` ar det storsta |h[i+1]-h[i]| i envelopen; hela rundans')
    print('     median ar %.4f, p90 %.4f och max %.4f.'
          % (SR.median(jm), SR.pct(jm, 0.9), max(jm)))
    print('     %-9s %-13s %6s %4s %6s %6s %8s %5s %6s %s'
          % ('id', 'klipp', 'K1', 'K2', 'K3', 'langd', 'rutsteg', 'kand', 'E4',
             'grupp i crossing-selection 2'))
    for i in tail_ids:
        if i not in F or not F[i]['raw']:
            print('     %-9s %-13s  -- ingen bana att mata' % (i, by_id[i]['clip']))
            continue
        x = F[i]['raw']
        if i not in spans:
            grp = '-- inget spann'
        elif D[i]['d_e4r'] == 0:
            grp = 'E4 inne'
        elif len(D[i]['cand']) == 1:
            grp = 'ingen kandidat alls'
        else:
            grp = 'kandidater finns'
        print('     %-9s %-13s %6d %4d %6d %6.1f %8.4f %5s %6s %s'
              % (i, by_id[i]['clip'], x['nexc'][0.5], x['nback'], x['nprom'][0.5],
                 F[i]['dur'], F[i]['jump_max'] or 0,
                 len(D[i]['cand']) if i in D else '--',
                 ('%+d' % D[i]['d_e4r']) if i in spans else '--', grp))
    print('\n  -- de %d utan armad kandidat, rad for rad --' % len(none_))
    print('     %-9s %-13s %6s %4s %6s %6s %6s'
          % ('id', 'klipp', 'K1', 'K2', 'K3', 'langd', 'E4'))
    for i in sorted(none_, key=lambda i: -((F[i]['raw'] or {}).get('nexc', {}).get(0.5) or 0)):
        x = F[i]['raw']
        if not x:
            print('     %-9s %-13s  -- ingen bana att mata' % (i, by_id[i]['clip']))
            continue
        print('     %-9s %-13s %6d %4d %6d %6.1f %+6d'
              % (i, by_id[i]['clip'], x['nexc'][0.5], x['nback'], x['nprom'][0.5],
                 F[i]['dur'], D[i]['d_e4r']))


# -- B. the arming ------------------------------------------------------------

def section_arming(POSE, by_id, spans, D):
    print('\n=== B. ARMNINGEN -- finns en OARMAD teckenvaxling inne i manniskornas intervall? ===')
    print('  Bara matning. En `oarmad vaxling` ar ett - -> + teckenbyte i E3:s egen')
    print('  utjamnade v_y utan hysteres alls: v_y[j] <= 0 < v_y[j+1]. Det ar inte en ny')
    print('  estimator och ingenting returnerar den -- det ar mangden E3 soker INNE i,')
    print('  innan 0,10-grinden tar bort det mesta av den. `inne i intervallet` betyder att')
    print('  E3:s egen svarsruta for den vaxlingen (j+1) ligger i bedomarnas union.')
    print('  INGEN NY TROSKEL SATTS OCH INGEN FORESLAS.')
    rows = sorted(spans)
    out = [i for i in rows if D[i]['d_e4r'] != 0]
    none_ = [i for i in out if len(D[i]['cand']) == 1]
    rest = [i for i in out if len(D[i]['cand']) > 1]
    for lab, sel in (('de %d utan armad kandidat' % len(none_), none_),
                     ('de ovriga utanfor-raderna', rest),
                     ('alla utanfor-rader', out),
                     ('raderna dar E4 ligger inne', [i for i in rows if D[i]['d_e4r'] == 0])):
        det = []
        for i in sel:
            vy = EST['vy_series'](POSE[i], WIN)
            e3_j = SF.e3_bracket(vy)
            lo, hi = spans[i]
            det.append((i, [j for j in unarmed_crossings(vy) if lo <= j + 1 <= hi],
                        vy, e3_j))
        hits = sum(1 for _, x, _, _ in det if x)
        tot = len(det)
        print('\n  -- %s: n=%d rader i %d klipp --' % (lab, tot, CS.nclips(sel, by_id)))
        print('     en oarmad vaxling ligger inne i intervallet pa %d av %d (%.0f %%)'
              % (hits, tot, 100 * hits / tot if tot else 0))
        # the same question one frame either side, so the count above cannot be an artefact
        # of where the crossing's own frame is said to sit
        gen, near = 0, []
        for i, _, vy, _ in det:
            lo, hi = spans[i]
            js = unarmed_crossings(vy)
            if any(lo - 1 <= j + 1 <= hi + 1 for j in js):
                gen += 1
            if js:
                near.append(min(abs(SR.point_to_interval(j + 1, spans[i])) for j in js))
        print('     samma fraga med en rutas marginal at bada hallen: %d av %d (%.0f %%)'
              % (gen, tot, 100 * gen / tot if tot else 0))
        if near:
            print('     narmaste oarmade vaxling, |avstand| till intervallet: median %.0f, '
                  'p90 %.0f, max %.0f rutor' % (SR.median(near), SR.pct(near, 0.9), max(near)))
        wid = [len(x) for _, x, _, _ in det if x]
        if wid:
            print('     dar den finns: %.0f i median (max %d) oarmade vaxlingar i intervallet'
                  % (SR.median(wid), max(wid)))
        why = collections.Counter()
        for _, inside, vy, e3_j in det:
            for j in inside:
                why[why_dropped(vy, j, e3_j)['why']] += 1
        if why:
            print('     varfor E3 inte tog dem (per vaxling, n=%d):' % sum(why.values()))
            for k, v in why.most_common():
                print('       %-28s %d' % (k, v))
        if sel is not none_:
            continue
        print('     -- rad for rad; `neg`/`pos` ar den negativa respektive positiva lopans')
        print('        extremvarde och langd, att jamfora med E3:s +-0,10 --')
        print('       %-9s %-11s %5s %7s %8s %6s %8s %6s  %s'
              % ('id', 'klipp', 'ruta', 'spann', 'neg-min', 'neg-n', 'pos-max', 'pos-n',
                 'varfor'))
        negs, poss = [], []
        for i, inside, vy, e3_j in det:
            if not inside:
                js = unarmed_crossings(vy)
                if js:
                    j = min(js, key=lambda j: abs(SR.point_to_interval(j + 1, spans[i])))
                    print('       %-9s %-11s   -- ingen oarmad vaxling inne i %d-%d; '
                          'narmaste ligger pa ruta %d (%+d rutor)%s'
                          % (i, by_id[i]['clip'], spans[i][0], spans[i][1], j + 1,
                             SR.point_to_interval(j + 1, spans[i]),
                             ', och den ar E3:s egen' if j == e3_j else ''))
                else:
                    print('       %-9s %-11s   -- ingen oarmad vaxling alls i envelopen'
                          % (i, by_id[i]['clip']))
                continue
            for j in inside:
                w = why_dropped(vy, j, e3_j)
                if w['neg_min'] is not None:
                    negs.append(w['neg_min'])
                if w['pos_max'] is not None:
                    poss.append(w['pos_max'])
                print('       %-9s %-11s %5d %7s %8s %6d %8s %6d  %s'
                      % (i, by_id[i]['clip'], j + 1, '%d-%d' % spans[i],
                         '%+.3f' % w['neg_min'] if w['neg_min'] is not None else '--',
                         w['neg_len'],
                         '%+.3f' % w['pos_max'] if w['pos_max'] is not None else '--',
                         w['pos_len'], w['why']))
        print('     -- hur nara grinden lag de? --')
        if negs:
            print('       negativa lopans min: median %+.3f (p10 %+.3f, p90 %+.3f); '
                  'under -0,10 pa %d av %d'
                  % (SR.median(negs), SR.pct(negs, 0.1), SR.pct(negs, 0.9),
                     sum(1 for v in negs if v < -HYST), len(negs)))
        if poss:
            print('       positiva lopans max: median %+.3f (p10 %+.3f, p90 %+.3f); '
                  'over +0,10 pa %d av %d'
                  % (SR.median(poss), SR.pct(poss, 0.1), SR.pct(poss, 0.9),
                     sum(1 for v in poss if v > HYST), len(poss)))
        print('       Talen star som de ar. Att nagot av dem skulle vara en battre hysteres')
        print('       ar inte matt har och foreslas inte.')


# -- C. 054.mp4, inside S32-084 only ------------------------------------------

def section_c054(POSE, by_id, reg):
    sid = 'S32-084'
    print('\n=== C. S32-084 (054.mp4) -- inuti envelopen, ingenting omraknat ===')
    s = by_id[sid]
    d = POSE[sid]
    ft = s['frameTimes']
    print('  envelope %.3f-%.3f s, %d rutor, fps %.0f, nedslag %s, kontroll %s'
          % (s['env'][0], s['env'][1], len(ft), s['fps'], s['impact'],
             s['control']['frame'] if s['control'] else '--'))
    print('  Klippet ar 23 s och bar tre svingar (~2 s, ~9 s, ~19 s); rundan har tva av dem:')
    for o in reg['swings']:
        if o['clip'] == s['clip']:
            print('    %s  envelope %.3f-%.3f s' % (o['id'], o['env'][0], o['env'][1]))
    hs = elevation(d)
    vy = EST['vy_series'](d, WIN)
    sp = EST['speed_series'](d, WIN)
    pk = prominences([v for _, v in hs])
    h_addr = next(v for _, v in hs if v is not None)
    top_i, top_h, _ = pk[0]
    lift = top_h - h_addr
    print('\n  -- var ligger handledsbanans vandning i utsnittet? --')
    print('     hogsta punkt (= E1): ruta %d, t %.3f s' % (top_i + 1, ft[top_i]))
    print('       %+.1f rutor fran bedomarnas 17-18; %+.1f rutor fran facit 53,5'
          % ((top_i + 1) - 17.5, (top_i + 1) - 53.5))
    print('     lyft adress -> topp: %.4f normerade bildhojder' % lift)
    print('     alla lokala toppar med prominens, hogst forst:')
    for i, v, p in pk[:6]:
        print('       ruta %3d  t %.3f s  h %+.4f  prominens %.4f  (%3.0f %% av lyftet)'
              % (i + 1, ft[i], v, p, 100 * p / lift if lift > 0 else 0))
    j0 = SF.e3_bracket(vy)
    print('     E3:s ruta: %s;  bedomarna och Eriks pass 2: 17-18;  facit: 53,5'
          % ('--' if j0 is None else j0 + 1))
    x = flag_row(d, s)['raw']
    print('     flaggan i A: K1 %d/%d/%d, K2 %d, K3 %d/%d/%d'
          % (x['nexc'][0.3], x['nexc'][0.5], x['nexc'][0.7], x['nback'],
             x['nprom'][0.3], x['nprom'][0.5], x['nprom'][0.7]))
    print('     utflykterna over adresshojd, var for sig:')
    for a, b, k, amp in x['exc']:
        print('       rutor %d-%d (t %.3f-%.3f s), hogst i ruta %d, %+.4f over adress'
              % (a + 1, b + 1, ft[a], ft[b], k + 1, amp))
    print('\n  -- vad hander vid ruta 53,5? --')
    print('       %5s %8s %9s %9s %9s %8s %7s'
          % ('ruta', 't (s)', 'h', 'mot adress', 'mot topp', 'v_y', 'fart'))
    for k in range(47, 61):
        if k >= len(ft):
            break
        h = hs[k][1]
        print('       %5d %8.3f %9s %9s %9s %8s %7s'
              % (k + 1, ft[k],
                 '%+.4f' % h if h is not None else '--',
                 '%+.4f' % (h - h_addr) if h is not None else '--',
                 '%+.4f' % (h - top_h) if h is not None else '--',
                 '%+.3f' % vy[k][1] if vy[k][1] is not None else '--',
                 '%.3f' % sp[k][1] if sp[k][1] is not None else '--'))
    near = [r for r in pk if abs(r[0] + 1 - 53.5) <= 4]
    print('     lokala toppar inom +-4 rutor fran 53,5: %s'
          % (', '.join('ruta %d (prominens %.4f, %.0f %% av lyftet)'
                       % (i + 1, p, 100 * p / lift) for i, _, p in near) or 'inga'))
    vals = [v for _, v in hs if v is not None]
    print('     banans lagsta punkt i envelopen %+.4f; adress %+.4f; topp %+.4f'
          % (min(vals), h_addr, top_h))
    sps = [v for _, v in sp if v is not None]
    print('     farten vid ruta 53-54 mot envelopens fartmedian %.3f (max %.3f)'
          % (SR.median(sps), max(sps)))
    print('\n  -- ar CVAT-etiketten f00 @ 3,327 s `backswing` forenlig med topp vid 17-18? --')
    print('     Tva olika faskallor, hallna isar: `CVAT` ar det en manniska annoterade i')
    print('     exportzip:arna (registrets annotatedPhases -- det kontrollens facit kommer')
    print('     ur), `app` ar appens egen fas vid exporttillfallet (exportFrames.phase).')
    print('     %-6s %-10s %-10s %9s %7s %9s %8s'
          % ('id', 'CVAT', 'app', 't (s)', 'ruta', 'h', 'v_y'))
    for f in sorted(s['exportFrames'], key=lambda f: f['tSec']):
        k = min(range(len(ft)), key=lambda k: abs(ft[k] - f['tSec']))
        inside = s['env'][0] - 1e-3 <= f['tSec'] <= s['env'][1] + 1e-3
        cv = s['annotatedPhases'].get(f['id'], {}).get('phase') or '--'
        print('       %-6s %-10s %-10s %9.3f %7s %9s %8s'
              % (f['id'].rsplit('_', 1)[-1], cv, f['phase'] or '-', f['tSec'],
                 ('%d' % (k + 1)) if inside else 'utanfor',
                 '%+.4f' % hs[k][1] if inside and hs[k][1] is not None else '--',
                 '%+.3f' % vy[k][1] if inside and vy[k][1] is not None else '--'))
    k00 = min(range(len(ft)), key=lambda k: abs(ft[k] - 3.327))
    print('     hojd vid ruta 17 %+.4f och ruta 18 %+.4f; vid f00 (ruta %d) %+.4f'
          % (hs[16][1], hs[17][1], k00 + 1, hs[k00][1]))
    print('     v_y vid f00: %s  (negativ v_y = handerna pa vag UPP, eftersom y vaxer nedat)'
          % ('%+.3f' % vy[k00][1] if vy[k00][1] is not None else '--'))
    rise = [k for k in range(16, k00 + 1) if hs[k][1] is not None and hs[k][1] > hs[16][1]]
    print('     rutor mellan 17 och f00 som ligger HOGRE an ruta 17: %d av %d'
          % (len(rise), k00 - 16 + 1))
    print('     hogsta punkten mellan ruta 17 och f00: %+.4f (ruta %d)'
          % max((hs[k][1], k + 1) for k in range(16, k00 + 1) if hs[k][1] is not None))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all',
                    help='flag | cross | arming | c054 | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rowsa = SR.read_answers(p)
        answers[name] = rowsa
    by_id = {s['id']: s for s in reg['swings']}
    print('S-35 (flersving / armning / 054): %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))

    POSE, F, D = {}, {}, {}
    for s in reg['swings']:
        p = Path(args.poseDir) / ('%s.json' % s['swing'])
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        ts = [r['t'] for r in EST['env_frames'](d)]
        if len(ts) != len(s['frameTimes']) or any(
                abs(a - b) > 1e-3 for a, b in zip(ts, s['frameTimes'])):
            raise SystemExit('posebanan och registrets frameTimes ar inte samma rutor for %s'
                             % s['swing'])
        POSE[s['id']] = d
        F[s['id']] = flag_row(d, s)
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
    print('  KONTROLLRAD (maste stamma med resultat.md, subframe.md, crossing-selection.md):')
    for tname, ivs in ((n1, {s: SR.interval(a1.get(s)) for s in D}),
                       (n2, {s: SR.interval(a2.get(s)) for s in D}),
                       ('spannet', spans)):
        d3 = [SR.point_to_interval(D[s]['p_e3'], ivs[s]) for s in D if ivs.get(s)]
        d4 = [SR.point_to_interval(SF.rnd(D[s]['p_e4']), ivs[s]) for s in D if ivs.get(s)]
        print('    mot %-8s E3 inne %d av %d (median %+.0f);  E4 RND inne %d av %d'
              % (tname, sum(1 for v in d3 if v == 0), len(d3), SR.median(d3),
                 sum(1 for v in d4 if v == 0), len(d4)))

    # subframe.md section 7's tail, in its own order. A fixed list, not recomputed here:
    # it is the set that document already named, so the cross-tab cannot drift from it.
    tail_ids = ['S32-092', 'S32-078', 'S32-103', 'S32-085', 'S32-062',
                'S32-010', 'S32-037', 'S32-041', 'S32-013', 'S32-055']
    if args.section in ('all', 'flag'):
        section_flag(F, by_id)
    if args.section in ('all', 'cross'):
        section_cross(F, by_id, spans, D, tail_ids)
    if args.section in ('all', 'arming'):
        section_arming(POSE, by_id, spans, D)
    if args.section in ('all', 'c054'):
        section_c054(POSE, by_id, reg)


if __name__ == '__main__':
    main()
