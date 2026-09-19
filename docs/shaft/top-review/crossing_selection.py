# ONE-OFF, READ-ONLY (S-34): is E3/E4's TAIL a WRONGLY CHOSEN sign flip? WRITES ONLY STDOUT.
#
#   <venv>/python.exe docs/shaft/top-review/crossing_selection.py <poseDir> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section counts|alternatives|class|contrast|clamp|all]
#
# THE KEY IS SEEN. resultat.md (S-32) and subframe.md (S-33) are written and were read before
# this was. The risk here is therefore NOT measurement error, it is FITTING -- so this file
# defines NO new estimator, sets NO threshold, sweeps NO parameter and selects NOTHING. It
# only counts what E3's own search would have found had it kept looking, and describes how
# those candidates differ. Every number below is a count or a quantile of the existing round.
# If any parameter had been touched, this comment would have to say so. None was.
#
# THE CANDIDATE SET IS E3'S OWN. e3_signflip arms when the smoothed v_y drops below -hyst and
# returns the FIRST frame above +hyst, backing up to the last frame with v_y <= 0. `crossings`
# below runs that identical loop and collects EVERY armed crossing instead of returning the
# first. A "candidate" is therefore exactly a frame E3 could have returned had it not stopped
# -- not an invented alternative on an invented series. hyst=0.10 and win=3 are E3's own
# defaults (analyze_pose.DEFAULTS), unchanged, and E3's answer is always candidate #1.
#
# WHY THE SPLIT IS ON E4 AND NOT E3. The question asked is about the tail that survived S-33's
# interpolation, and S-33's E4 (linear crossing on the raw v_y inside E3's bracket, rounded to
# a whole frame) is the form directly comparable with a whole-frame interval. E3's own in/out
# is printed beside it everywhere so the choice of reference can be checked, not trusted.
#
# NOT MEASURED HERE, by construction: the 12 swings where at least one annotator answered
# `osaker` have no human SPAN, so they cannot appear in any span-scored number. They are
# reported separately in section `class`, scored against whichever annotator did answer, and
# the 5 where BOTH were silent are not scored at all.
#
# No production code is read or written. src/lib/shaft/measure/, NEAR_VERTICAL_GATE_DEG,
# ON_PLANE_BAND_DEG, the sign convention and S-30's gate are untouched.
import argparse
import collections
import json
import math
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR      # noqa: E402  -- reused, never re-implemented
import subframe as SF         # noqa: E402  -- e3_bracket / crossing_fraction / rnd reused

EST = SF.EST
HYST, WIN = SF.HYST, SF.WIN


# -- E3's search, with every crossing kept instead of the first ----------------

def crossings(vy, hyst=HYST):
    """Every armed -> + crossing in `vy`, in time order, as bracket indices j.

    Identical arming and back-up rule to analyze_pose.e3_signflip; the only change is that
    the loop continues after a crossing (re-arming on the next dip below -hyst) rather than
    returning. crossings(...)[0] IS E3's answer -- asserted in main(), not assumed.
    """
    out, armed = [], False
    for i, (_, v) in enumerate(vy):
        if v is None:
            continue
        if v < -hyst:
            armed = True
        elif armed and v > hyst:
            j = i
            while j > 0 and (vy[j][1] is None or vy[j][1] > 0):
                j -= 1
            if not out or out[-1] != j:
                out.append(j)
            armed = False
    return out


def zero_crossings(vy):
    """Every place the series changes sign at all, either direction. Wider than `crossings`
    because it ignores the hysteresis and the direction -- reported for the distribution
    question only; E3 can never return most of these."""
    pts = [(i, v) for i, (_, v) in enumerate(vy) if v is not None]
    n = 0
    for (_, a), (_, b) in zip(pts, pts[1:]):
        if (a <= 0 < b) or (a >= 0 > b):
            n += 1
    return n


def sub_point(vy_raw, j):
    """E4's answer for a bracket: 1-based frame index + the interpolated fraction. Falls back
    to the bracket start when the raw series carries no crossing there (which is the same
    `klamd mot bracketen` case S-33 counted, kept visible rather than dropped)."""
    c = SF.crossing_fraction(vy_raw, j)
    if c is None:
        return j + 1.0, None
    return j + 1.0 + c[0], c[1]


# -- how a candidate looks, in measurable terms -------------------------------

def shape(vy, vy_raw, j, t0, t1):
    """The measurable properties of one candidate crossing. Descriptive only -- nothing here
    is combined into a score, and no property is preferred over another."""
    n = len(vy)
    v0, v1 = vy[j][1], vy[j + 1][1] if j + 1 < n else None
    dt = (vy[j + 1][0] - vy[j][0]) if j + 1 < n else None
    slope = None if (v0 is None or v1 is None or not dt) else (v1 - v0) / dt
    # the negative run that armed this crossing, and the positive run that followed it
    lo = j
    while lo > 0 and vy[lo - 1][1] is not None and vy[lo - 1][1] <= 0:
        lo -= 1
    amp_before = min([v for _, v in vy[lo:j + 1] if v is not None] or [None],
                     key=lambda x: math.inf if x is None else x)
    hi = j + 1
    while hi + 1 < n and vy[hi + 1][1] is not None and vy[hi + 1][1] >= 0:
        hi += 1
    after = [v for _, v in vy[j + 1:hi + 1] if v is not None]
    amp_after = max(after) if after else None
    p, clamped = sub_point(vy_raw, j)
    c = SF.crossing_fraction(vy_raw, j)
    t = vy[j][0]
    return dict(j=j, p=p, clamped=clamped, frac=None if c is None else c[0],
                slope=slope, amp_before=amp_before, amp_after=amp_after,
                neg_len=j - lo + 1, pos_len=hi - j, t=t,
                in_env=None if t1 <= t0 else (t - t0) / (t1 - t0),
                frame=j + 1)


def summarise(label, rows, key, fmt='%+.3f'):
    vals = [r[key] for r in rows if r.get(key) is not None]
    if not vals:
        return '%s --' % label
    return ('%s median ' + fmt + '  (p10 ' + fmt + ', p90 ' + fmt + ', n=%d)') % (
        label, SR.median(vals), SR.pct(vals, 0.10), SR.pct(vals, 0.90), len(vals))


def nclips(rows, by_id):
    return len({by_id[r]['clip'] for r in rows})


def share(sel, rows, by_id, label):
    n = len(rows)
    if not n:
        return '     %-26s -- inget underlag' % label
    k = len([r for r in rows if sel(by_id[r])])
    return '     %-26s %2d av %2d rader (%3.0f %%), %d klipp' % (
        label, k, n, 100 * k / n, len({by_id[r]['clip'] for r in rows if sel(by_id[r])}))


# -- 1. how many crossings are there at all? ----------------------------------

def section_counts(D, spans, by_id):
    print('\n=== 1. HUR MANGA TECKENVAXLINGAR FINNS I ENVELOPEN PER SVING? ===')
    print('  `E3-kandidat` = en armad -> + vaxling med E3:s egen hysteres 0,10 pa E3:s egen')
    print('  utjamnade v_y (fonster 3). E3 returnerar alltid kandidat nr 1. `alla nollgenom-')
    print('  gangar` raknar varje teckenbyte at bada hallen och ar en vidare mangd som E3')
    print('  mestadels inte kan valja ur -- den star har for fordelningens skull.')
    ids = sorted(D)
    print('\n  -- alla %d svingar med posebana (%d klipp) --' % (ids and len(ids), nclips(ids, by_id)))
    for key, lab in (('ncand', 'E3-kandidater'), ('nzero', 'alla nollgenomgangar')):
        c = collections.Counter(D[i][key] for i in ids)
        v = [D[i][key] for i in ids]
        print('     %-22s median %.0f  p90 %.0f  max %d   fordelning %s'
              % (lab, SR.median(v), SR.pct(v, 0.9), max(v),
                 '  '.join('%d:%d' % (k, c[k]) for k in sorted(c))))
    sp = sorted(spans)
    print('\n  -- uppdelat pa om E4 (RND) ligger inne i det manskliga spannet --')
    print('     n=%d rader i %d klipp har ett spann; de ovriga %d har minst en osaker och'
          % (len(sp), nclips(sp, by_id), len(ids) - len(sp)))
    print('     kan inte delas sa har alls.')
    inside = [i for i in sp if D[i]['d_e4r'] == 0]
    outside = [i for i in sp if D[i]['d_e4r'] != 0]
    for lab, sel in (('E4 inne', inside), ('E4 utanfor', outside)):
        c = collections.Counter(D[i]['ncand'] for i in sel)
        v = [D[i]['ncand'] for i in sel]
        print('     %-12s n=%-3d (%2d klipp)  kandidater: median %.0f, max %d, fordelning %s'
              % (lab, len(sel), nclips(sel, by_id), SR.median(v), max(v),
                 '  '.join('%d:%d' % (k, c[k]) for k in sorted(c))))
    print('     Samma uppdelning pa E3:s egen ruta i stallet for E4:')
    for lab, sel in (('E3 inne', [i for i in sp if D[i]['d_e3'] == 0]),
                     ('E3 utanfor', [i for i in sp if D[i]['d_e3'] != 0])):
        v = [D[i]['ncand'] for i in sel]
        print('       %-12s n=%-3d  kandidater median %.0f, max %d'
              % (lab, len(sel), SR.median(v), max(v)))


# -- 2. is there another crossing that WOULD have been inside? -----------------

def section_alternatives(D, spans, answers, by_id):
    print('\n=== 2. FINNS DET EN ANNAN VAXLING SOM LIGGER INNE I INTERVALLET? ===')
    print('  Fragan skiljer "fel vaxling vald" fran "ingen vaxling finns dar". En kandidat')
    print('  raknas som inne om dess E4-svar avrundat till hel ruta ligger i intervallet.')
    print('  SUB (det oavrundade subrutesvaret, strikt) star bredvid, aldrig i stallet for.')
    for tname, ivs in [('spannet', spans)] + [
            (n, {i: SR.interval(a.get(i)) for i in D if SR.interval(a.get(i))})
            for n, a in answers.items()]:
        rows = sorted(ivs)
        out = [i for i in rows if SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i]) != 0]
        print('\n  -- mot %-8s n=%d rader i %d klipp; E4 (RND) utanfor pa %d rader i %d klipp --'
              % (tname, len(rows), nclips(rows, by_id), len(out), nclips(out, by_id)))
        hit_r = [i for i in out if any(
            SR.point_to_interval(SF.rnd(c['p']), ivs[i]) == 0 for c in D[i]['cand'][1:])]
        hit_s = [i for i in out if any(
            SR.point_to_interval(c['p'], ivs[i]) == 0 for c in D[i]['cand'][1:])]
        only1 = [i for i in out if len(D[i]['cand']) == 1]
        if not out:
            continue
        print('     en ANNAN kandidat ligger inne (RND): %d av %d rader (%.0f %%), %d klipp'
              % (len(hit_r), len(out), 100 * len(hit_r) / len(out), nclips(hit_r, by_id)))
        print('     samma fraga, SUB (strikt):           %d av %d rader (%.0f %%)'
              % (len(hit_s), len(out), 100 * len(hit_s) / len(out)))
        print('     ingen annan kandidat FINNS alls:     %d av %d rader (%.0f %%), %d klipp'
              % (len(only1), len(out), 100 * len(only1) / len(out), nclips(only1, by_id)))
        rest = [i for i in out if i not in set(hit_r) and i not in set(only1)]
        print('     kandidater finns men ingen traffar:  %d av %d rader (%.0f %%), %d klipp'
              % (len(rest), len(out), 100 * len(rest) / len(out), nclips(rest, by_id)))
        if tname != 'spannet':
            continue
        d = [abs(SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i])) for i in out]
        print('     de utanfor ligger |avstand| median %.0f, p90 %.0f, max %.0f rutor fran spannet'
              % (SR.median(d), SR.pct(d, 0.9), max(d)))
        for lab, sel in (('fel vaxling vald', hit_r), ('ingen kandidat alls', only1),
                         ('ingen kandidat traffar', rest)):
            dd = [abs(SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i])) for i in sel]
            if dd:
                print('       %-24s |avstand| median %.0f, p90 %.0f, max %.0f (n=%d)'
                      % (lab, SR.median(dd), SR.pct(dd, 0.9), max(dd), len(dd)))
        print('     -- hur nara kommer den BASTA kandidaten, nar ingen traffar? --')
        print('     TILLAGT EFTER att raden ovan kom tillbaka nastan tom: om ingen kandidat')
        print('     ligger inne ar naturliga foljdfragan om nagon ligger i NARHETEN. `basta`')
        print('     ar bara den med minst |avstand| -- det ar INTE "den ratta", och')
        print('     ingenting valjs pa den. Ren beskrivning.')
        best = {i: min(abs(SR.point_to_interval(SF.rnd(c['p']), ivs[i]))
                       for c in D[i]['cand']) for i in out}
        bv = sorted(best.values())
        print('       basta kandidatens |avstand|: median %.0f, p90 %.0f, max %.0f (n=%d)'
              % (SR.median(bv), SR.pct(bv, 0.9), max(bv), len(bv)))
        ch = [abs(SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i])) for i in out]
        print('       den VALDA kandidatens |avstand|: median %.0f, p90 %.0f, max %.0f'
              % (SR.median(ch), SR.pct(ch, 0.9), max(ch)))
        same = sum(1 for i in out if best[i] == abs(
            SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i])))
        print('       den valda ar redan den basta pa %d av %d rader (%.0f %%)'
              % (same, len(out), 100 * same / len(out)))
        b1 = sum(1 for v in best.values() if v <= 1)
        print('       basta kandidaten ligger <=1 ruta fran spannet pa %d av %d (%.0f %%)'
              % (b1, len(out), 100 * b1 / len(out)))
        print('     -- vilket nummer i ordningen bar den traffande kandidaten? --')
        c = collections.Counter()
        for i in hit_r:
            for k, cc in enumerate(D[i]['cand'][1:], start=2):
                if SR.point_to_interval(SF.rnd(cc['p']), ivs[i]) == 0:
                    c[k] += 1
                    break
        print('       %s  (E3 tar alltid nr 1)'
              % ('  '.join('nr %d: %d' % (k, c[k]) for k in sorted(c)) or '--'))
        print('     -- rad for rad (n=%d) --' % len(out))
        print('       %-9s %-9s %6s %5s %6s %8s' %
              ('id', 'klipp', 'avst', 'kand', 'traff', 'spann'))
        for i in sorted(out, key=lambda i: -abs(
                SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i]))):
            k = [n for n, cc in enumerate(D[i]['cand'], start=1)
                 if SR.point_to_interval(SF.rnd(cc['p']), ivs[i]) == 0]
            print('       %-9s %-9s %+6.0f %5d %6s %8s'
                  % (i, by_id[i]['clip'],
                     SR.point_to_interval(SF.rnd(D[i]['p_e4']), ivs[i]),
                     len(D[i]['cand']), ','.join(map(str, k)) or '-',
                     '%d-%d' % ivs[i]))


# -- 3. are the wrongly-chosen ones one class of clip? -------------------------

def section_class(D, spans, answers, by_id, wide_ids, unsure):
    print('\n=== 3. AR DE FELVALDA EN KLASS? ===')
    print('  Grupperna ar skurna pa SVARET (E4 inne/utanfor spannet) och pa kovariater som')
    print('  registret bar; ingen grupp ar skuren pa nagot som mattes efterat.')
    rows = sorted(spans)
    inside = [i for i in rows if D[i]['d_e4r'] == 0]
    out = [i for i in rows if D[i]['d_e4r'] != 0]
    wrong = [i for i in out if any(
        SR.point_to_interval(SF.rnd(c['p']), spans[i]) == 0 for c in D[i]['cand'][1:])]
    none_ = [i for i in out if len(D[i]['cand']) == 1]
    miss = [i for i in out if i not in set(wrong) and i not in set(none_)]
    groups = [('E4 inne', inside), ('fel vaxling vald', wrong),
              ('ingen kandidat alls', none_), ('ingen kandidat traffar', miss),
              ('alla utanfor', out), ('alla med spann', rows)]
    covs = [('slow-mo', lambda s: s['slowmo']),
            ('utan sakert nedslag', lambda s: not s['hasConfidentImpact']),
            ('  (= FALLBACK_BOUNDS)', lambda s: not s['hasConfidentImpact']),
            ('spegelvand, bekraftad', lambda s: str(s['mirrored']).startswith('confirmed')),
            ('face-on', lambda s: s['viewBucket'] == 'face_on'),
            ('kallan ar `own`', lambda s: s['source'] != 'web'),
            ('kontrollsving', lambda s: s['isControl'])]
    for lab, sel in groups:
        print('\n  -- %s: n=%d rader i %d klipp --' % (lab, len(sel), nclips(sel, by_id)))
        for cl, fn in covs:
            if cl.startswith('  ('):
                continue
            print(share(fn, sel, by_id, cl))
        k = len([i for i in sel if i in wide_ids])
        print('     %-26s %2d av %2d rader (%3.0f %%)'
              % ('Erik bred i pass 1 (>=4)', k, len(sel), 100 * k / len(sel) if sel else 0))
    print('\n  -- de svingar dar NAGON satte osaker --')
    print('     De har inget manskligt SPANN och kan darfor inte ligga i nagon grupp ovan.')
    print('     De poangsatts har mot den bedomare som faktiskt svarade; de dar BADA teg')
    print('     poangsatts inte alls.')
    one, both = unsure
    print('     exakt en osaker: %d svingar i %d klipp; bada osakra: %d svingar i %d klipp'
          % (len(one), nclips(one, by_id), len(both), nclips(both, by_id)))
    hit = 0
    for i in one:
        iv = next((SR.interval(a.get(i)) for a in answers.values() if SR.interval(a.get(i))),
                  None)
        if iv is None or i not in D:
            continue
        d4 = SR.point_to_interval(SF.rnd(D[i]['p_e4']), iv)
        alt = [n for n, c in enumerate(D[i]['cand'], start=1)
               if SR.point_to_interval(SF.rnd(c['p']), iv) == 0]
        hit += d4 == 0
        print('       %-9s %-9s E4 %+4.0f rutor, %d kandidater, traffar: %s%s'
              % (i, by_id[i]['clip'], d4, len(D[i]['cand']),
                 ','.join(map(str, alt)) or '-',
                 '  [slow-mo]' if by_id[i]['slowmo'] else ''))
    print('       E4 inne pa %d av %d av dem.' % (hit, len(one)))
    for i in both:
        if i in D:
            print('       %-9s %-9s inget intervall alls; %d kandidater%s'
                  % (i, by_id[i]['clip'], len(D[i]['cand']),
                     '  [slow-mo]' if by_id[i]['slowmo'] else ''))


# -- 4. what distinguishes the chosen crossing from the right one? -------------

def section_contrast(D, spans, by_id):
    print('\n=== 4. VAD SKILJER DEN VALDA VAXLINGEN FRAN DEN RATTA? ===')
    print('  Bara pa de rader dar E4 ligger utanfor spannet OCH en annan kandidat ligger')
    print('  inne -- dar finns bada att jamfora. BESKRIVANDE: ingen storhet vags ihop, ingen')
    print('  grans satts, och ingenting valjs pa det som star har.')
    pairs = []
    for i in sorted(spans):
        if D[i]['d_e4r'] == 0:
            continue
        right = next((c for c in D[i]['cand'][1:]
                      if SR.point_to_interval(SF.rnd(c['p']), spans[i]) == 0), None)
        if right is not None:
            pairs.append((i, D[i]['cand'][0], right))
    print('\n  n=%d rader i %d klipp.' % (len(pairs), nclips([i for i, _, _ in pairs], by_id)))
    if not pairs:
        return
    chosen = [c for _, c, _ in pairs]
    right = [r for _, _, r in pairs]
    fields = [('slope', 'lutning i bracketen (1/s^2)', '%+.2f'),
              ('amp_before', 'amplitud fore (min v_y)', '%+.3f'),
              ('amp_after', 'amplitud efter (max v_y)', '%+.3f'),
              ('neg_len', 'negativ lopa, rutor', '%+.0f'),
              ('pos_len', 'positiv lopa, rutor', '%+.0f'),
              ('in_env', 'lage i envelopen (0-1)', '%+.2f'),
              ('frac', 'fraktion i bracketen', '%+.2f'),
              ('frame', 'ruta i envelopen', '%+.0f')]
    for key, lab, fmt in fields:
        print('    %-28s' % lab)
        print('      ' + summarise('vald  ', chosen, key, fmt))
        print('      ' + summarise('ratt  ', right, key, fmt))
        d = [r[key] - c[key] for _, c, r in pairs
             if c.get(key) is not None and r.get(key) is not None]
        if d:
            print(('      skillnad (ratt - vald) median ' + fmt + ', p10 ' + fmt +
                   ', p90 ' + fmt + ', ratt storre pa %d av %d')
                  % (SR.median(d), SR.pct(d, 0.1), SR.pct(d, 0.9),
                     sum(1 for x in d if x > 0), len(d)))
    ncl = sum(1 for c in chosen if c['clamped'])
    print('\n    klamd mot bracketen (ra v_y byter inte tecken dar): vald %d av %d, ratt %d av %d'
          % (ncl, len(chosen), sum(1 for r in right if r['clamped']), len(right)))
    print('\n  -- rad for rad --')
    print('    %-9s %-9s %6s %6s %8s %8s %8s %8s %6s %6s'
          % ('id', 'klipp', 'vald', 'ratt', 'lutn-v', 'lutn-r', 'amp-v', 'amp-r',
             'env-v', 'env-r'))
    for i, c, r in pairs:
        print('    %-9s %-9s %6.1f %6.1f %8.2f %8.2f %8.3f %8.3f %6.2f %6.2f'
              % (i, by_id[i]['clip'], c['p'], r['p'],
                 c['slope'] or float('nan'), r['slope'] or float('nan'),
                 c['amp_before'] or float('nan'), r['amp_before'] or float('nan'),
                 c['in_env'] or float('nan'), r['in_env'] or float('nan')))
    print('    `lutn` = (v_y[j+1]-v_y[j])/dt over bracketen, `amp` = mest negativa v_y i den')
    print('    negativa lopa som armade vaxlingen, `env` = lage i envelopen 0-1.')


def section_contrast_near(D, spans, by_id):
    print()
    print('  === 4b. SAMMA JAMFORELSE MOT NARMASTE KANDIDAT ===')
    print('  TILLAGT EFTER att 4 ovan visade sig ha n=1. `narmaste` ar kandidaten med minst')
    print('  |avstand| till spannet -- det ar INTE "den ratta", bara den minst fel, och')
    print('  ingenting valjs pa den. Bara rader dar narmaste inte ar den valda tas med, sa')
    print('  det finns tva olika vaxlingar att beskriva.')
    pairs = []
    for i in sorted(spans):
        if D[i]['d_e4r'] == 0 or len(D[i]['cand']) < 2:
            continue
        near = min(D[i]['cand'],
                   key=lambda c: abs(SR.point_to_interval(SF.rnd(c['p']), spans[i])))
        if near is not D[i]['cand'][0]:
            pairs.append((i, D[i]['cand'][0], near))
    print('  n=%d rader i %d klipp.' % (len(pairs), nclips([i for i, _, _ in pairs], by_id)))
    if not pairs:
        return
    chosen = [c for _, c, _ in pairs]
    near = [r for _, _, r in pairs]
    for key, lab, fmt in [('slope', 'lutning i bracketen (1/s^2)', '%+.2f'),
                          ('amp_before', 'amplitud fore (min v_y)', '%+.3f'),
                          ('amp_after', 'amplitud efter (max v_y)', '%+.3f'),
                          ('neg_len', 'negativ lopa, rutor', '%+.0f'),
                          ('pos_len', 'positiv lopa, rutor', '%+.0f'),
                          ('in_env', 'lage i envelopen (0-1)', '%+.2f'),
                          ('frac', 'fraktion i bracketen', '%+.2f')]:
        print('    %-28s' % lab)
        print('      ' + summarise('vald    ', chosen, key, fmt))
        print('      ' + summarise('narmaste', near, key, fmt))
        d = [r[key] - c[key] for _, c, r in pairs
             if c.get(key) is not None and r.get(key) is not None]
        if d:
            print(('      skillnad (narmaste - vald) median ' + fmt +
                   ', narmaste storre pa %d av %d') % (SR.median(d),
                                                       sum(1 for x in d if x > 0), len(d)))
    dd = [abs(SR.point_to_interval(SF.rnd(r['p']), spans[i])) -
          abs(SR.point_to_interval(SF.rnd(c['p']), spans[i])) for i, c, r in pairs]
    print('    hur mycket narmare ar den narmaste: median %+.0f rutor, max %+.0f'
          % (SR.median(dd), min(dd)))
    print('    -- ALLA kandidater i de har svingarna, sa beskrivningen gar att kontrollera --')
    print('      %-9s %-9s %3s %6s %6s %7s %8s %8s %4s %4s %5s %5s' %
          ('id', 'klipp', '#', 'svar', 'avst', 'lutning', 'amp-fore', 'amp-efter',
           'neg', 'pos', 'lage', 'frakt'))
    for i, c, r in pairs:
        for k, cc in enumerate(D[i]['cand'], start=1):
            tag = ' <= VALD' if cc is c else (' <= NARMAST' if cc is r else '')
            print('      %-9s %-9s %3d %6.2f %+6.0f %7.2f %8.3f %8.3f %4d %4d %5.2f %5.2f%s'
                  % (i, by_id[i]['clip'], k, cc['p'],
                     SR.point_to_interval(SF.rnd(cc['p']), spans[i]),
                     cc['slope'], cc['amp_before'], cc['amp_after'], cc['neg_len'],
                     cc['pos_len'], cc['in_env'],
                     cc['frac'] if cc['frac'] is not None else float('nan'), tag))


# -- 5. E6's clamping: is the bracket itself wrong for a single wrist? ---------

def section_clamp(D, spans, by_id):
    print('\n=== 5. E6:s KLAMNING -- ligger den ratta vaxlingen UTANFOR bracketen? ===')
    print('  E3:s bracket ar definierad pa MITTPUNKTENS utjamnade v_y. E6 interpolerar en')
    print('  ENSKILD handleds ra v_y i samma bracket. Klamd betyder att den handledens serie')
    print('  inte byter tecken dar alls, sa svaret faller pa en bracketkant. Fragan har ar')
    print('  var den handledens EGEN vaxling ligger i stallet -- ligger den utanfor')
    print('  bracketen ar det bracketen som ar fel konstruerad for den handleden, inte')
    print('  vaxlingsvalet. Ingen ny estimator: handledens egen vaxling hittas med E3:s egen')
    print('  sokning och E3:s egen hysteres, pa handledens ra v_y.')
    for which in ('15', '16'):
        key = 'w' + which
        rows = [i for i in sorted(D) if D[i][key] is not None]
        clamped = [i for i in rows if D[i][key]['clamped']]
        print('\n  -- handled %s: %d svingar i %d klipp, klamd pa %d i %d klipp --'
              % (which, len(rows), nclips(rows, by_id), len(clamped),
                 nclips(clamped, by_id)))
        if not clamped:
            continue
        own = [i for i in clamped if D[i][key]['own']]
        print('     har en EGEN armad vaxling nagon annanstans i envelopen: %d av %d (%.0f %%)'
              % (len(own), len(clamped), 100 * len(own) / len(clamped)))
        if own:
            off = [D[i][key]['own_off'] for i in own]
            outside = [i for i in own if abs(D[i][key]['own_off']) > 1]
            print('     dess avstand fran E3:s bracket: median %+.0f rutor, p10 %+.0f, p90 %+.0f'
                  % (SR.median(off), SR.pct(off, 0.1), SR.pct(off, 0.9)))
            print('     LIGGER UTANFOR bracketen (>1 ruta ifran): %d av %d (%.0f %%)'
                  % (len(outside), len(own), 100 * len(outside) / len(own)))
        sp = [i for i in clamped if i in spans]
        if sp:
            a = sum(1 for i in sp if SR.point_to_interval(SF.rnd(D[i][key]['p']), spans[i]) == 0)
            b = sum(1 for i in sp if D[i][key]['own'] and SR.point_to_interval(
                SF.rnd(D[i][key]['own_p']), spans[i]) == 0)
            print('     av de %d klamda som har ett spann (%d klipp): det klamda svaret ligger'
                  % (len(sp), nclips(sp, by_id)))
            print('     inne pa %d, handledens EGNA vaxling pa %d.' % (a, b))
        nsp = [i for i in rows if i in spans]
        cl = [i for i in nsp if D[i][key]['clamped']]
        ok = [i for i in nsp if not D[i][key]['clamped']]
        for lab, sel in (('klamda', cl), ('ej klamda', ok)):
            if not sel:
                continue
            d = [abs(SR.point_to_interval(SF.rnd(D[i][key]['p']), spans[i])) for i in sel]
            print('     %-11s n=%-3d  |avstand| median %.0f, p90 %.0f, max %.0f; inne %d'
                  % (lab, len(sel), SR.median(d), SR.pct(d, 0.9), max(d),
                     sum(1 for x in d if x == 0)))


# -- main ---------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('poseDir', type=Path)
    ap.add_argument('--registry', type=Path,
                    default=Path('data/shaft/top-round/registry/registry.json'))
    ap.add_argument('--answers', type=Path, nargs='+',
                    default=[Path('data/shaft/top-round/svar-erik.json'),
                             Path('data/shaft/top-round/svar-lisa.json')])
    ap.add_argument('--section', default='all',
                    help='counts | alternatives | class | contrast | clamp | all')
    args = ap.parse_args()

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    by_id = {s['id']: s for s in reg['swings']}
    print('S-34 (vaxlingsval): %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))

    D, misaligned, nopose = {}, [], []
    for s in reg['swings']:
        p = Path(args.poseDir) / ('%s.json' % s['swing'])
        if not p.exists():
            nopose.append(s['swing'])
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        ts = [r['t'] for r in EST['env_frames'](d)]
        if len(ts) != len(s['frameTimes']) or any(
                abs(a - b) > 1e-3 for a, b in zip(ts, s['frameTimes'])):
            misaligned.append(s['swing'])
            continue
        vy_s = EST['vy_series'](d, WIN)
        vy_r = EST['vy_series'](d, 1)
        js = crossings(vy_s)
        j0 = SF.e3_bracket(vy_s)
        # E3's answer MUST be candidate #1, or `crossings` is not E3's search and nothing
        # below means what it says. Stop rather than measure something else.
        if (js[0] if js else None) != j0:
            raise SystemExit('crossings() och e3_signflip ar oense om %s (%s mot %s)'
                             % (s['swing'], js[:1], j0))
        if j0 is None:
            continue
        t0, t1 = s['env']
        cand = [shape(vy_s, vy_r, j, t0, t1) for j in js]
        row = dict(cand=cand, ncand=len(cand), nzero=zero_crossings(vy_s),
                   p_e3=j0 + 1.0, p_e4=cand[0]['p'])
        for which in ('15', '16'):
            wr = SF.vy_from_y(SF.wrist_track(d, which), 1)
            c = SF.crossing_fraction(wr, j0)
            ow = crossings(wr)
            if c is None:
                row['w' + which] = None
                continue
            near = min(ow, key=lambda j: abs(j - j0)) if ow else None
            row['w' + which] = dict(
                p=j0 + 1.0 + c[0], clamped=c[1], own=near is not None,
                own_off=None if near is None else near - j0,
                own_p=None if near is None else sub_point(wr, near)[0])
        D[s['id']] = row
    if misaligned:
        raise SystemExit('posebanan och registrets frameTimes ar inte samma rutor for: %s'
                         % ', '.join(misaligned[:5]))
    if nopose:
        print('  VARNING: %d svingar saknar posebana: %s'
              % (len(nopose), ', '.join(nopose[:5])))
    print('  %d svingar med posebana och ett E3-val; rutnaten stammer for alla.' % len(D))

    (n1, a1), (n2, a2) = list(answers.items())[:2]
    spans, one, both = {}, [], []
    for sid in D:
        i1, i2 = SR.interval(a1.get(sid)), SR.interval(a2.get(sid))
        if i1 and i2:
            spans[sid] = (min(i1[0], i2[0]), max(i1[1], i2[1]))
        elif i1 or i2:
            one.append(sid)
        else:
            both.append(sid)
    for sid in spans:
        D[sid]['d_e3'] = SR.point_to_interval(D[sid]['p_e3'], spans[sid])
        D[sid]['d_e4r'] = SR.point_to_interval(SF.rnd(D[sid]['p_e4']), spans[sid])
    wide = set()
    for sid in D:
        iv = SR.interval(a1.get(sid))
        if iv and iv[1] - iv[0] + 1 >= 4:
            wide.add(sid)

    # The control line: these must match resultat.md / subframe.md before anything is read.
    print('  KONTROLLRAD (maste stamma med resultat.md och subframe.md):')
    for tname, ivs in ((n1, dict((s, SR.interval(a1.get(s))) for s in D)),
                       (n2, dict((s, SR.interval(a2.get(s))) for s in D)),
                       ('spannet', spans)):
        d3 = [SR.point_to_interval(D[s]['p_e3'], ivs[s]) for s in D if ivs.get(s)]
        d4 = [SR.point_to_interval(SF.rnd(D[s]['p_e4']), ivs[s]) for s in D if ivs.get(s)]
        print('    mot %-8s E3 inne %d av %d (median %+.0f);  E4 RND inne %d av %d'
              % (tname, sum(1 for v in d3 if v == 0), len(d3), SR.median(d3),
                 sum(1 for v in d4 if v == 0), len(d4)))
    print('  Erik bred i pass 1 (>=4 rutor): %d svingar i %d klipp'
          % (len(wide), nclips(sorted(wide), by_id)))

    if args.section in ('all', 'counts'):
        section_counts(D, spans, by_id)
    if args.section in ('all', 'alternatives'):
        section_alternatives(D, spans, answers, by_id)
    if args.section in ('all', 'class'):
        section_class(D, spans, answers, by_id, wide, (one, both))
    if args.section in ('all', 'contrast'):
        section_contrast(D, spans, by_id)
        section_contrast_near(D, spans, by_id)
    if args.section in ('all', 'clamp'):
        section_clamp(D, spans, by_id)


if __name__ == '__main__':
    main()
