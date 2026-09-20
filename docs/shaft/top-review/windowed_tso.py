# ONE-OFF, READ-ONLY (S-40): does reading the three top-anchored measurements over a
# WINDOW of frames, instead of on one, make the OUTCOME steadier? WRITES NOTHING BUT
# STDOUT (plus a bridge file in --work).
#
#   <venv>/python.exe docs/shaft/top-review/windowed_tso.py <poseDir> \
#       --clipPoseDir <clipPoseDir> --denseDir <denseDir> --work <tmp> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section f1|f2|f3|f4|all]
#
# THE KEY IS ALREADY SEEN. resultat.md, subframe.md, crossing-selection.md, multiswing.md,
# envelope-audit.md, e2-and-floor.md, hard-core.md and verdict-sensitivity.md are all
# written and read, so the risk here is not measurement error, it is FITTING. Therefore:
# no parameter swept, none tuned, NO WIDTH CHOSEN. The widths 3/5/7 are the ones the task
# named; width 1 is the control that has to reproduce S-39. E4 is subframe.py's own bracket
# plus interpolation, unchanged. The human intervals are the annotators' own.
#
# EVERYTHING IS MEASURED WARM -- run_pose_clip.py's whole-clip trajectories, the
# configuration e2-and-floor.md section 1 showed production runs. The COLD run is loaded
# for two purposes, both printed: the control line, and FRAGA 1's cold-vs-warm disturbance,
# where the cold tracker is NOISE and not ground truth.
#
# NOTHING IS DECIDED HERE. No threshold, no estimator, no classifier, no calibration, no
# shift, no change to S-30's gate, no production code written. src/lib/shaft/measure/,
# NEAR_VERTICAL_GATE_DEG, ON_PLANE_BAND_DEG and the sign convention are untouched -- they
# are IMPORTED and called through windowed_outcomes.ts, never re-implemented here.
# score_round.py, subframe.py, crossing_selection.py, e2_and_floor.py, hard_core.py and
# verdict_sensitivity.py are imported and REUSED; nothing is re-implemented.
import argparse
import collections
import json
import statistics as st
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR            # noqa: E402
import subframe as SF               # noqa: E402
import e2_and_floor as E2F          # noqa: E402
import envelope_audit as EA         # noqa: E402
import hard_core as HC              # noqa: E402
import verdict_sensitivity as VS    # noqa: E402

EST = SF.EST
ESTS = HC.ESTS
MEAS = VS.MEAS                      # the three measurements, S-39's own list
HANDEDNESS = VS.HANDEDNESS          # the same assumption, for the same reason
SRC = Path('src') / 'lib'

# The task's own widths, plus the width-1 control. Not swept, NOT CHOSEN.
WIDTHS = (1, 3, 5, 7)

# The three disturbances the task names, each a PAIR of candidate tops that ought to give
# the same answer. None of them is a frame error: they are the floor S-38/S-39 measured.
PAIRS = [
    ('E4 kall mot E4 varm', 'E4kall', 'E4',
     'samma modell, samma vikter, samma bildrutor -- bara sparartillstandet skiljer'),
    ('E3 mot E4', 'E3', 'E4',
     'E4 ar E3:s egen bracket plus interpolation; de kan inte ligga mer an 1 ruta isar'),
]


# -- the bridge to production code --------------------------------------------

def build_bridge(work):
    """esbuild the TS bridge. It imports src/lib/shaft/measure/, src/lib/frameExtractor.ts
    and src/lib/poseEnvelopeSelection.ts and calls them; if that no longer builds, this
    stops rather than measuring something else."""
    src = Path('docs/shaft/top-review/windowed_outcomes.ts')
    out = work / 'windowed_outcomes.mjs'
    esbuild = Path('node_modules/.bin/esbuild')
    if Path(str(esbuild) + '.cmd').exists():
        esbuild = Path(str(esbuild) + '.cmd')
    if not esbuild.exists():
        raise SystemExit('esbuild saknas -- kor npm install')
    # `ANALYSIS_FRAME_COUNT` lives in frameExtractor.ts, which pulls in logger.ts, which
    # reads `import.meta.env` at module scope -- a Vite build constant Node does not have.
    # It is supplied here as the PRODUCTION build's value (DEV false, remote logging off)
    # so the bundle initialises. It configures the logger and nothing this run measures:
    # neither `selectEnvelopeFrames` nor `src/lib/shaft/measure/` reads any of it.
    env = '{"DEV":false,"PROD":true,"MODE":"production","VITE_REMOTE_LOG":"false"}'
    subprocess.run([str(esbuild), str(src), '--bundle', '--platform=node', '--format=esm',
                    '--define:import.meta.env=%s' % env,
                    '--outfile=%s' % out], check=True,
                   stdout=subprocess.DEVNULL, stderr=None)
    return out


def run_bridge(bridge, payload, work):
    infile = work / 'windowed_in.json'
    infile.write_text(json.dumps(payload), encoding='utf-8')
    with open(infile, 'rb') as fh:
        res = subprocess.run(['node', str(bridge)], stdin=fh, check=True,
                             stdout=subprocess.PIPE)
    return json.loads(res.stdout.decode('utf-8'))


# -- reading a window's outcome -------------------------------------------------

def wread(sw, label, width):
    """The three measurements' production results when the top is read over a window of
    `width` frames centred on `label`'s frame.

    THE CONSTRUCTION, in one place: the window's median is `circularMedianDeg` over the
    admitted window frames -- production's own function, run by production's own
    `shaftAngleByPhase`. A medoid names a FRAME, so `top-shaft-orientation` and
    `shaft-position-p4` are then read on that frame through their unmodified path. The
    `top` bucket is taken from the WINDOW's own reading, because its level ("every window
    frame usable") is something a single frame cannot report.

    When the window holds no admitted frame there is no median frame; the reading then
    falls back to the CENTRE frame, which is itself in the window and therefore also not
    admitted -- so production answers its own silence, with its own reason, rather than
    this script inventing one.
    """
    w = sw['win'].get((label, width))
    if w is None:
        return None
    if w.get('outside'):
        return {'outside': True}
    at = w['medianIndex'] if w['medianIndex'] is not None else w['index']
    pf = sw['pf'][at]
    return {'tso': pf['tso'], 'p4': pf['p4'], 'sabp': w['sabpWindow'],
            'frameReasons': pf['frameReasons'], 'index': at, 'win': w}


def verdict(res, key):
    """S-39's own `verdict`, imported and reused -- the outcome definitions do not change
    because the reading is windowed."""
    if res is None:
        return None
    return VS.verdict(res, key)


def answered(res, key):
    return res is not None and not res.get('outside') and res[key]['answers']


def binary(res, key):
    """The ANSWER/SILENCE axis alone, for all three measurements on the same footing.

    `top-shaft-orientation` is the only one with a category, so comparing its category
    flips against the other two's silence flips compares two different things. This
    collapses all three to the outcome every one of them has -- which is the fair
    comparison FRAGA 4 asks for.
    """
    if res is None:
        return None
    if res.get('outside'):
        return 'utanfor-envelopen'
    return 'svar' if res[key]['answers'] else 'tyst'


def vote(sw, label, width, key):
    """CONTROL AGGREGATOR, not a candidate: the majority of the window frames' own
    per-frame production verdicts. Ties are reported, never broken by a rule."""
    w = sw['win'].get((label, width))
    if w is None:
        return None
    if w.get('outside'):
        return 'utanfor-envelopen'
    c = collections.Counter(
        VS.verdict({'tso': sw['pf'][i]['tso'], 'p4': sw['pf'][i]['p4'],
                    'sabp': sw['pf'][i]['sabp'], 'frameReasons': sw['pf'][i]['frameReasons']},
                   key)
        for i in range(w['lo'], w['hi'] + 1))
    top = c.most_common()
    if len(top) > 1 and top[0][1] == top[1][1]:
        return 'oavgjort'
    return top[0][0]


def pct(a, b):
    return '%5.1f %%' % (100.0 * a / b) if b else '   -- '


def clips_of(sids, by_id):
    return len({by_id[s]['clip'] for s in sids})


def flips(OUT, a, b, width, key, reader=verdict, only_answering=False):
    """(n, flips, ids). `only_answering` keeps S-39 section 2's own denominator: the rows
    where the measurement answers at AT LEAST ONE end, since a row silent in both ends
    cannot flip and dilutes the share."""
    n = f = 0
    ids = []
    for sid, sw in OUT.items():
        x, y = wread(sw, a, width), wread(sw, b, width)
        if x is None or y is None or x.get('outside') or y.get('outside'):
            continue
        if only_answering and not (answered(x, key) or answered(y, key)):
            continue
        n += 1
        if reader(x, key) != reader(y, key):
            f += 1
            ids.append(sid)
    return n, f, ids


# -- assembling the payload ----------------------------------------------------

def payload_for(reg, by_id, dense, lms, warm_ch, cold_ch, spans, ivs1, ivs2, n1, n2,
                times, flags):
    """One entry per swing, with every candidate top the four questions need and the
    envelope FRAGA 3 replays through production's own selector.

    Indices are 0-BASED here (the TS side indexes an array); everything printed is the
    registry's own 1-based frame index, as in every earlier round.
    """
    swings, grid, labels = [], [], {}
    for s in reg['swings']:
        sid = s['id']
        if sid not in dense or sid not in lms:
            continue
        c = []
        e4 = warm_ch.get(sid, {}).get('E4')
        if e4 is not None:
            c.append(('E4', e4))
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
        labels[sid] = dict(c)
        swings.append(dict(
            id=sid, clip=s['clip'], swingIndex=int(s['swing'].rsplit('_s', 1)[1]),
            cameraAngle=VS.VIEW.get(s['viewBucket']),
            imageSize=dict(width=s['size'][0], height=s['size'][1]),
            modelFile='shaft-v2.onnx',
            frames=[dict(t=r['t'],
                         **({} if 'bx' not in r else
                            dict(bx=r['bx'], by=r['by'], bs=r['bs'],
                                 hx=r['hx'], hy=r['hy'], hs=r['hs'])),
                         lm=lm)
                    for r, lm in zip(dense[sid]['frames'], lms[sid])],
            windows=[dict(label=lab, index=i - 1, widths=list(WIDTHS)) for lab, i in c],
        ))
        # FRAGA 3: production's grid for THIS envelope. `topSecForLabelOnly` is E4's time
        # and cannot move a pick -- see the TS file and the report.
        t4 = times[sid][e4 - 1] if (e4 is not None and 1 <= e4 <= len(times[sid])) else None
        grid.append(dict(id=sid, startSec=s['env'][0], finishSec=s['env'][1],
                         impactSec=s['impact'] if s['hasConfidentImpact'] else None,
                         topSecForLabelOnly=t4,
                         # Production derives the pose trajectory at 15 fps
                         # (poseSampling.ts); sampleDt only floors the phase-LABEL
                         # tolerance, never a pick's time.
                         sampleDt=1.0 / 15.0,
                         # production's OWN flag, off the export manifest -- the registry
                         # does not carry it. It is echoed by the selector, never read by it.
                         clippedTail=bool((flags.get(sid) or {}).get('clippedTail'))))
    return dict(handedness=HANDEDNESS, swings=swings, grid=grid), labels


# -- FRAGA 1 -------------------------------------------------------------------

def section_f1(OUT, by_id, n1, n2):
    print('\n=== FRAGA 1. BYTER UTFALLET SALLAN NAR DET LASES OVER ETT FONSTER? ===')
    print('  Samma tre STORNINGAR som S-39 matte, men utfallet last over 1 (kontroll), 3, 5')
    print('  och 7 rutor centrerat pa den valda toppen. BREDD 1 AR KONTROLLEN och maste')
    print('  reproducera verdict-sensitivity.md; gor den inte det galler ingenting nedan.')
    print('  Det som mats ar STABILITET, inte traffsakerhet. INGEN BREDD VALJS.')
    print('  Medianen ar produktionens egen: circularMedianDeg over fonstrets tillatna')
    print('  rutor, korda av shaftAngleByPhase sjalv. Medoiden pekar ut en RUTA, och')
    print('  top-shaft-orientation och shaft-position-p4 lases pa den genom sin egen,')
    print('  oforandrade vag.')

    pop = [sid for sid, sw in OUT.items()
           if wread(sw, 'E4', 1) and not wread(sw, 'E4', 1).get('outside')]
    print('\n  Populationen: %d rader i %d klipp med ett varmt E4-val och en detektorbana.'
          % (len(pop), clips_of(pop, by_id)))

    for key, name in MEAS:
        print('\n  ---- %s ----' % name)
        print('     %-38s %s' % ('storning', ' '.join('%14s' % ('bredd %d' % w) for w in WIDTHS)))
        rows = [('%s kall mot varm (S-39: 9/100)' % 'E4', 'E4kall', 'E4', False),
                ('E3 mot E4 (S-39: 13/101)', 'E3', 'E4', False),
                ('%s forsta mot sista ruta' % n1, '%s_lo' % n1, '%s_hi' % n1, False),
                ('   samma, bland de svarande', '%s_lo' % n1, '%s_hi' % n1, True),
                ('%s forsta mot sista ruta' % n2, '%s_lo' % n2, '%s_hi' % n2, False),
                ('   samma, bland de svarande', '%s_lo' % n2, '%s_hi' % n2, True),
                ('spannet (unionen), forsta mot sista', 'SPAN_lo', 'SPAN_hi', False),
                ('   samma, bland de svarande', 'SPAN_lo', 'SPAN_hi', True)]
        for lab, a, b, only in rows:
            cells = []
            for w in WIDTHS:
                n, f, _ = flips(OUT, a, b, w, key, only_answering=only)
                cells.append('%6s (%s)' % ('%d/%d' % (f, n), pct(f, n).strip()))
            print('     %-38s %s' % (lab, ' '.join('%14s' % c for c in cells)))

    print('\n  ---- vilka rader som fortfarande byter, top-shaft-orientation ----')
    print('     Raderna namnges sa att de gar att folja mellan bredderna; de ar inte en')
    print('     klass och ingen regel dras ur dem.')
    for lab, a, b in (('E4 kall mot varm', 'E4kall', 'E4'),
                      ('E3 mot E4', 'E3', 'E4'),
                      ('spannet, forsta mot sista', 'SPAN_lo', 'SPAN_hi')):
        print('     -- %s --' % lab)
        for w in WIDTHS:
            n, f, ids = flips(OUT, a, b, w, 'tso')
            print('        bredd %d (%d av %d): %s' % (w, f, n, ', '.join(sorted(ids)) or '--'))
    print('\n     Och vad de fem kvarvarande spann-raderna vid bredd 7 byter MELLAN:')
    for sid in sorted(flips(OUT, 'SPAN_lo', 'SPAN_hi', 7, 'tso')[2]):
        x = wread(OUT[sid], 'SPAN_lo', 7)
        y = wread(OUT[sid], 'SPAN_hi', 7)
        print('        %-9s %-11s %-24s -> %-24s (rutor %d resp %d)'
              % (sid, by_id[sid]['clip'], verdict(x, 'tso'), verdict(y, 'tso'),
                 x['index'] + 1, y['index'] + 1))

    print('\n  ---- samma tabell pa SVAR/TYSTNAD-axeln, alla tre pa samma fot ----')
    print('     top-shaft-orientation ar den enda med en kategori, sa kategoribyten och')
    print('     tystnadsbyten ar inte samma sak. Har ar alla tre kollapsade till svar mot')
    print('     tyst -- det enda utfall alla tre faktiskt har.')
    for key, name in MEAS:
        print('     -- %s --' % name)
        for lab, a, b in (('E4 kall mot varm', 'E4kall', 'E4'),
                          ('E3 mot E4', 'E3', 'E4'),
                          ('spannet forsta mot sista', 'SPAN_lo', 'SPAN_hi')):
            cells = []
            for w in WIDTHS:
                n, f, _ = flips(OUT, a, b, w, key, reader=binary)
                cells.append('%d/%d' % (f, n))
            print('        %-34s %s' % (lab, ' '.join('%14s' % c for c in cells)))

    print('\n  ---- vilka rutor fonstret faktiskt lander pa ----')
    print('     Flyttar medianen avlasningen fran mittrutan, och hur langt?')
    print('     %-8s %6s %10s %10s %10s %10s' % ('bredd', 'n', 'lika ruta', '|median|',
                                                 'p90', 'max'))
    for w in WIDTHS:
        d = []
        for sid, sw in OUT.items():
            r = wread(sw, 'E4', w)
            if r is None or r.get('outside'):
                continue
            d.append(abs(r['index'] - r['win']['index']))
        if d:
            print('     %-8d %6d %10s %10.1f %10.1f %10d'
                  % (w, len(d), '%d' % sum(1 for x in d if x == 0), st.median(d),
                     HC.q(d, 0.9), max(d)))
    print('\n     och hur manga rutor fonstret faktiskt hade att valja pa (tillatna av')
    print('     plausibility.ts), samt hur ofta det var TOMT:')
    print('     %-8s %6s %12s %10s %10s' % ('bredd', 'n', 'median tillatna', 'tomma',
                                            'kapade mot envelopekant'))
    for w in WIDTHS:
        na, empty, clipped, n = [], 0, 0, 0
        for sid, sw in OUT.items():
            r = wread(sw, 'E4', w)
            if r is None or r.get('outside'):
                continue
            n += 1
            na.append(r['win']['nAdmitted'])
            empty += r['win']['nAdmitted'] == 0
            clipped += r['win']['nFrames'] < w
        print('     %-8d %6d %12.0f %10d %10d' % (w, n, st.median(na), empty, clipped))

    print('\n  ---- hade medianen nagot att gora? ----')
    print('     circularMedianDeg arbetar i den RIKTADE vinkelrymden (butt -> hosel), dar')
    print('     ett ombytt punktpar syns som ~180 grader -- den avvikare dess egen docstring')
    print('     sager att den finns for. Rakningen sager om aggregeringen faktiskt rostade')
    print('     bort nagot eller bara valde bland naranog lika rutor. E4:s eget fonster.')
    print('     %-8s %6s %16s %14s %14s %12s'
          % ('bredd', 'n', 'fonster med >=1', 'avvikare tot', 'spridning', 'spridning'))
    print('     %-8s %6s %16s %14s %14s %12s'
          % ('', '', 'riktad avvikare', '', 'median grader', 'p90 grader'))
    for w in WIDTHS:
        n = nout = tot = 0
        sp = []
        for sid, sw in OUT.items():
            r = wread(sw, 'E4', w)
            if r is None or r.get('outside'):
                continue
            n += 1
            o = r['win'].get('outliers') or 0
            nout += o > 0
            tot += o
            if r['win'].get('spread') is not None:
                sp.append(r['win']['spread'])
        print('     %-8d %6d %16d %14d %14.2f %12.2f'
              % (w, n, nout, tot, st.median(sp) if sp else 0.0,
                 HC.q(sp, 0.9) if sp else 0.0))

    print('\n  ---- MEKANISMEN: hur ofta de tva avlasningarna blir SAMMA RUTA ----')
    print('     Ett fonster kan bara minska bytena pa tva satt: genom att de tva storda')
    print('     valen far samma medianruta, eller genom att en avvikande ruta rostas bort.')
    print('     Det forsta ar matbart rakt av, och det ar det som avgor hur mycket av')
    print('     stabiliteten som ar aggregering och hur mycket som ar fonsteroverlapp.')
    print('     %-38s %s' % ('storning', ' '.join('%14s' % ('bredd %d' % w) for w in WIDTHS)))
    for lab, a, b in (('E4 kall mot varm', 'E4kall', 'E4'),
                      ('E3 mot E4', 'E3', 'E4'),
                      ('%s forsta mot sista' % n1, '%s_lo' % n1, '%s_hi' % n1),
                      ('%s forsta mot sista' % n2, '%s_lo' % n2, '%s_hi' % n2),
                      ('spannet, forsta mot sista', 'SPAN_lo', 'SPAN_hi')):
        cells, over = [], []
        for w in WIDTHS:
            n = same = 0
            ov = []
            for sid, sw in OUT.items():
                x, y = wread(sw, a, w), wread(sw, b, w)
                if x is None or y is None or x.get('outside') or y.get('outside'):
                    continue
                n += 1
                same += x['index'] == y['index']
                wx, wy = x['win'], y['win']
                ov.append(max(0, min(wx['hi'], wy['hi']) - max(wx['lo'], wy['lo']) + 1))
            cells.append('%d/%d' % (same, n))
            over.append(st.median(ov) if ov else 0)
        print('     %-38s %s' % (lab, ' '.join('%14s' % c for c in cells)))
        print('     %-38s %s' % ('   fonstrens overlapp (median rutor)',
                                 ' '.join('%14.0f' % o for o in over)))

    print('\n  ---- KONTROLLAGGREGATORN: majoritetsrost i stallet for median ----')
    print('     Inte en kandidat. Den star har for att visa om svaret hanger pa vilken')
    print('     aggregator som valdes. "oavgjort" ar redovisat, aldrig brutet av en regel.')
    print('     %-38s %s' % ('storning (top-shaft-orientation)',
                             ' '.join('%14s' % ('bredd %d' % w) for w in WIDTHS)))
    for lab, a, b in (('E4 kall mot varm', 'E4kall', 'E4'),
                      ('E3 mot E4', 'E3', 'E4'),
                      ('spannet forsta mot sista', 'SPAN_lo', 'SPAN_hi')):
        cells = []
        for w in WIDTHS:
            n = f = 0
            for sid, sw in OUT.items():
                x, y = vote(sw, a, w, 'tso'), vote(sw, b, w, 'tso')
                if x is None or y is None or 'utanfor' in (x, y):
                    continue
                n += 1
                f += x != y
            cells.append('%d/%d' % (f, n))
        print('     %-38s %s' % (lab, ' '.join('%14s' % c for c in cells)))
    tied = collections.Counter()
    for w in WIDTHS:
        for sid, sw in OUT.items():
            if vote(sw, 'E4', w, 'tso') == 'oavgjort':
                tied[w] += 1
    print('     oavgjorda roster pa E4:s eget fonster: %s'
          % ', '.join('bredd %d: %d' % (w, tied[w]) for w in WIDTHS))


# -- FRAGA 2 -------------------------------------------------------------------

def section_f2(OUT, by_id, spans):
    print('\n=== FRAGA 2. VAD AGGREGERINGEN KOSTAR ===')
    print('  Referensen ar S-39:s egen och den flyttar sig inte med bredden: ENRUTSAVLASNINGEN')
    print('  vid en topp satt MITT i manniskornas spann (SPAN_mid, halv-upp avrundad). Det ar')
    print('  det narmaste ett facit som finns for ett UTFALL -- det finns ingen bedomd')
    print('  across/laid-off-etikett per sving, sa "ratt" betyder har "det enrutsavlasningen')
    print('  vid manniskornas mittruta sager" och ingenting mer.')

    print('\n  (a) Flyttar fonstret referensen sjalv? Fonstret vid SPAN_mid mot enrutan dar.')
    print('     %-34s %s' % ('matvarde', ' '.join('%14s' % ('bredd %d' % w) for w in WIDTHS)))
    for key, name in MEAS:
        cells = []
        for w in WIDTHS:
            n = f = 0
            for sid, sw in OUT.items():
                a, b = wread(sw, 'SPAN_mid', 1), wread(sw, 'SPAN_mid', w)
                if a is None or b is None or a.get('outside') or b.get('outside'):
                    continue
                n += 1
                f += verdict(a, key) != verdict(b, key)
            cells.append('%d/%d' % (f, n))
        print('     %-34s %s' % (name, ' '.join('%14s' % c for c in cells)))

    print('\n  (b) E4:s utfall mot referensen. S-39:s tal ar bredd 1: top-shaft-orientation')
    print('     65 av 91, de tva andra 79 av 91.')
    print('     %-34s %-22s %s' % ('matvarde', 'referens', ' '.join('%14s' % ('bredd %d' % w)
                                                                    for w in WIDTHS)))
    for key, name in MEAS:
        for reflab, refw in (('enrutan vid SPAN_mid', 1), ('samma bredd vid SPAN_mid', None)):
            cells = []
            for w in WIDTHS:
                n = same = 0
                for sid, sw in OUT.items():
                    a = wread(sw, 'E4', w)
                    b = wread(sw, 'SPAN_mid', refw if refw else w)
                    if a is None or b is None or a.get('outside') or b.get('outside'):
                        continue
                    n += 1
                    same += verdict(a, key) == verdict(b, key)
                cells.append('%d/%d' % (same, n))
            print('     %-34s %-22s %s' % (name, reflab,
                                           ' '.join('%14s' % c for c in cells)))

    print('\n  (c) DEN EGENTLIGA KOSTNADSFRAGAN. Bland raderna dar ENRUTSAVLASNINGEN pa E4')
    print('     redan gav referensens utfall -- hur manga TAPPAR fonstret? Och bland dem den')
    print('     hade fel pa -- hur manga RATTAR det? Netto, per bredd, med n.')
    print('     %-34s %-8s %6s %8s %8s %8s %s'
          % ('matvarde', 'bredd', 'n', 'ratt@1', 'tappade', 'rattade', 'netto'))
    lost_ids = {}
    for key, name in MEAS:
        for w in WIDTHS:
            n = right1 = lost = gained = 0
            ids = []
            for sid, sw in OUT.items():
                a1, aw = wread(sw, 'E4', 1), wread(sw, 'E4', w)
                ref = wread(sw, 'SPAN_mid', 1)
                if None in (a1, aw, ref) or a1.get('outside') or aw.get('outside') \
                        or ref.get('outside'):
                    continue
                n += 1
                ok1 = verdict(a1, key) == verdict(ref, key)
                okw = verdict(aw, key) == verdict(ref, key)
                right1 += ok1
                if ok1 and not okw:
                    lost += 1
                    ids.append(sid)
                if okw and not ok1:
                    gained += 1
            print('     %-34s %-8d %6d %8d %8d %8d %+d'
                  % (name, w, n, right1, lost, gained, gained - lost))
            lost_ids[(key, w)] = ids
    print('\n     Raderna som fonstret byter BORT (bredd 3, 5, 7), per matvarde:')
    for key, name in MEAS:
        for w in (3, 5, 7):
            ids = lost_ids.get((key, w)) or []
            print('       %-34s bredd %d: %s' % (name, w, ', '.join(ids) or 'inga'))


# -- FRAGA 3 -------------------------------------------------------------------

def section_f3(OUT, reg, by_id, grid, times, spans, budget):
    print('\n=== FRAGA 3. VAD FONSTRET MOTSVARAR I PRODUKTIONENS RUTNAT ===')
    print('  Rutnatet ar inte beskrivet har, det ar KORT: selectEnvelopeFrames() med')
    print('  ANALYSIS_FRAME_COUNT, bada importerade, pa varje svings egen envelope.')
    print('  UPPGIFTENS "~20 valda rutor" ar inaktuell: ANALYSIS_FRAME_COUNT ar %d sedan'
          % budget)
    print('  2026-08-11 (den hojdes 10 -> 20 -> 32). Talen nedan star pa %d.' % budget)
    print('  Klippvagen skickar INGA clusterPhases (frameExtractor.ts och shaftPreview.ts')
    print('  anropar bart), sa toppen far bara den UNIFORMA baslinjen -- klustret hamnar')
    print('  pa nedslaget.')
    print('  ALLT RAKNAS I BILDRUTOR, inte i sekunder: en vald tidpunkt hamnar pa den')
    print('  avkodade bildruta som ligger narmast (grabFramesAtTimes), sa tva val inom')
    print('  samma bildruta ar samma ruta. Det tar bort varje tolerans ur rakningen.')

    G = {g['id']: g for g in grid}
    rows = []
    for sid, g in G.items():
        s = by_id[sid]
        ts = times[sid]
        sw = OUT.get(sid)
        if sw is None:
            continue
        r1 = wread(sw, 'E4', 1)
        if r1 is None or r1.get('outside'):
            continue
        e4 = r1['win']['index']                       # 0-based envelope frame
        # Each pick resolves to the nearest decoded envelope frame.
        idx = sorted({EA.nearest(ts, p['t']) for p in g['picks']
                      if ts[0] - 1e-9 <= p['t'] <= ts[-1] + 1e-9})
        if len(idx) < 2:
            continue
        steps = [b - a for a, b in zip(idx, idx[1:])]
        below = [i for i in idx if i <= e4]
        above = [i for i in idx if i >= e4]
        loc = (above[0] - below[-1]) if (below and above and above[0] > below[-1]) else None
        rows.append(dict(sid=sid, idx=idx, steps=steps, e4=e4, loc=loc,
                         span=spans.get(sid), n=len(ts), nraw=len(g['picks']),
                         cluster=g['impactClusterApplied']))

    print('\n  %d svingar. Vad produktionen faktiskt valjer:' % len(rows))
    npick = [len(r['idx']) for r in rows]
    nraw = [r['nraw'] for r in rows]
    allst = [x for r in rows for x in r['steps']]
    loc = [r['loc'] for r in rows if r['loc'] is not None]
    print('     picks efter selectEnvelopeFrames egen dedupe: median %.0f (min %d, max %d)'
          % (st.median(nraw), min(nraw), max(nraw)))
    print('     DISTINKTA bildrutor de landar pa: median %.0f (min %d, max %d) av budgeten %d'
          % (st.median(npick), min(npick), max(npick), budget))
    print('     kluster pa nedslaget tillampat: %d av %d svingar'
          % (sum(1 for r in rows if r['cluster']), len(rows)))
    print('     steg mellan tva valda grannrutor, hela rutnatet: median %.0f bildrutor'
          % st.median(allst))
    print('       (p10 %.0f, p90 %.0f -- klustret pa nedslaget ar den tata anden)'
          % (HC.q(allst, 0.1), HC.q(allst, 0.9)))
    print('     steget DAR TOPPEN LIGGER (de tva valda rutor som omsluter E4): median %.0f'
          % st.median(loc))
    print('       bildrutor (p10 %.0f, p90 %.0f, max %d), n = %d svingar'
          % (HC.q(loc, 0.1), HC.q(loc, 0.9), max(loc), len(loc)))
    hit = sum(1 for r in rows if r['e4'] in r['idx'])
    print('     E4:s egen ruta ar en av produktionens valda rutor pa %d av %d svingar'
          % (hit, len(rows)))
    insp = [sum(1 for i in r['idx'] if r['span'][0] <= i + 1 <= r['span'][1])
            for r in rows if r['span']]
    if insp:
        print('     valda rutor INNE i manniskornas spann: median %.0f (noll pa %d av %d rader)'
              % (st.median(insp), sum(1 for x in insp if x == 0), len(insp)))

    print('\n  Vad ett fonster ar, och vad rutnatet rymmer av det. Fonstret ar w pa varandra')
    print('  foljande videobildrutor; rutnatet ar glesare an sa overallt utom i klustret.')
    print('     %-7s %9s %18s %16s %16s'
          % ('bredd', 'sekunder', 'valda rutor i det', 'rader med >= 2', 'rader med alla w'))
    for w in WIDTHS:
        half = (w - 1) // 2
        cnt = []
        for r in rows:
            lo, hi = max(0, r['e4'] - half), min(r['n'] - 1, r['e4'] + half)
            cnt.append(sum(1 for i in r['idx'] if lo <= i <= hi))
        print('     %-7d %9.3f %18s %16s %16s'
              % (w, (w - 1) / 30.0, 'median %.0f' % st.median(cnt),
                 '%d av %d' % (sum(1 for c in cnt if c >= 2), len(cnt)),
                 '%d av %d' % (sum(1 for c in cnt if c >= w), len(cnt))))

    print('\n  VILKA RUTOR SOM FAKTISKT SKULLE BEHOVA DETEKTERAS. Rakningen ar exakt: de')
    print('  bildrutor i fonstret som INTE redan ar en av produktionens valda rutor.')
    print('     %-7s %14s %14s %16s %12s'
          % ('bredd', 'nya per sving', 'p90', 'som andel av %d' % budget, 'totalt nya'))
    for w in WIDTHS:
        half = (w - 1) // 2
        extra = []
        for r in rows:
            lo, hi = max(0, r['e4'] - half), min(r['n'] - 1, r['e4'] + half)
            want = set(range(lo, hi + 1))
            extra.append(len(want - set(r['idx'])))
        print('     %-7d %14s %14.0f %16s %12d'
              % (w, 'median %.0f' % st.median(extra), HC.q(extra, 0.9),
                 '%.0f %%' % (100.0 * st.median(extra) / budget), sum(extra)))
    print('\n     Och budgeten ar inte fri: fittable() i poseEnvelopeSelection.ts kapar')
    print('     redan ned de begarda picksen, och flera av dem landar pa samma bildruta.')
    print('     Extrarutorna maste darfor antingen tas UTOVER budgeten eller atas ur den')
    print('     uniforma baslinjen. (median %.0f picks -> %.0f distinkta rutor.)'
          % (st.median(nraw), st.median(npick)))

    print('\n  Och den bit av kostnaden som inte ar bildrutor: i dag kors matlagret inte')
    print('  alls i produktion. Vad src/ faktiskt anropar (test- och devfiler utskrivna):')
    for ident in ('buildShaftMeasurements', 'buildShaftSwingSeries', 'checkShaftSeries',
                  'detectShaft', 'ANALYSIS_FRAME_COUNT'):
        hits = []
        for p in sorted(Path('src').rglob('*.ts')) + sorted(Path('src').rglob('*.tsx')):
            q = p.as_posix()
            if 'shaft/measure' in q:
                continue
            try:
                txt = p.read_text(encoding='utf-8')
            except OSError:
                continue
            if ident in txt:
                hits.append(q)
        print('     %-26s %s' % (ident, ', '.join(hits) if hits
                                 else 'INGENSTANS utanfor src/lib/shaft/measure/'))


# -- FRAGA 4 -------------------------------------------------------------------

def section_f4(OUT, by_id, n1, n2):
    print('\n=== FRAGA 4. DE TVA TYSTA MATVARDENA ===')
    print('  shaft-position-p4 och top-hinken i shaft-angle-by-phase lases inte av nagon')
    print('  regel. Fragan har tva halvor: vad som skulle kravas for att koppla dem, och om')
    print('  deras svar/tystnad-utfall ar stabilare an top-shaft-orientations under samma')
    print('  storningar. Bara den andra halvan ar en matning.')

    print('\n  (a) VAD SOM LASER DEM I DAG -- last ur src/, inte antaget.')
    for ident in ('shaftPositionAtP4', 'topShaftOrientation', 'shaftAngleByPhase',
                  'MeasurementId', 'buildShaftMeasurements'):
        hits = []
        for p in sorted(Path('src').rglob('*.ts')) + sorted(Path('src').rglob('*.tsx')):
            if 'shaft/measure' in p.as_posix():
                continue
            try:
                txt = p.read_text(encoding='utf-8')
            except OSError:
                continue
            if ident in txt:
                hits.append(p.as_posix())
        print('     %-26s %s' % (ident, ', '.join(hits) if hits
                                 else 'inga traffar utanfor src/lib/shaft/measure/'))

    print('\n  (b) SPARRARNA, raknade pa den har rundan. Var och en maste falla innan ett')
    print('     tal nar en regel.')
    nh = sum(1 for s in by_id.values() if str(s.get('handedness', '')).startswith('unknown'))
    print('     handedness okand pa %d av %d svingar. top-shaft-orientation avvisar dem'
          % (nh, len(by_id)))
    print('       innan den tittar pa en bildruta; de tva tysta bryr sig inte om den alls,')
    print('       sa handigheten ar INTE det som hindrar dem.')
    vb = collections.Counter(s['viewBucket'] for s in by_id.values())
    print('     kameravinkel i rundan: %s. I appen ar cameraAngle ofta null, och da blir'
          % dict(vb))
    print('       cameraGate uncertain i stallet for rejected -- alltsa ett flaggat tal')
    print('       dar rundan har tystnad.')

    print('\n  (c) AR DE STABILARE? Samma storningar, samma bredder, SVAR/TYSTNAD for alla')
    print('     tre -- det enda utfall alla tre har. Lagre ar stabilare.')
    for lab, a, b in (('E4 kall mot E4 varm', 'E4kall', 'E4'),
                      ('E3 mot E4', 'E3', 'E4'),
                      ('%s forsta mot sista ruta' % n1, '%s_lo' % n1, '%s_hi' % n1),
                      ('%s forsta mot sista ruta' % n2, '%s_lo' % n2, '%s_hi' % n2),
                      ('spannet, forsta mot sista', 'SPAN_lo', 'SPAN_hi')):
        print('     -- %s --' % lab)
        for key, name in MEAS:
            cells = []
            for w in WIDTHS:
                n, f, _ = flips(OUT, a, b, w, key, reader=binary)
                cells.append('%d/%d' % (f, n))
            print('        %-34s %s' % (name, ' '.join('%14s' % c for c in cells)))
        # And the category axis for TSO alongside, so the two are never confused.
        cells = []
        for w in WIDTHS:
            n, f, _ = flips(OUT, a, b, w, 'tso')
            cells.append('%d/%d' % (f, n))
        print('        %-34s %s' % ('(top-shaft-orientation, KATEGORI)',
                                    ' '.join('%14s' % c for c in cells)))

    print('\n  (d) Och vad deras tystnad beror pa, pa E4:s egen ruta per bredd.')
    for key, name in MEAS:
        print('     -- %s --' % name)
        for w in WIDTHS:
            c = collections.Counter()
            for sid, sw in OUT.items():
                r = wread(sw, 'E4', w)
                if r is None or r.get('outside'):
                    continue
                c[verdict(r, key)] += 1
            print('        bredd %d: %s' % (w, ';  '.join('%s %d' % kv
                                                          for kv in c.most_common())))


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
    ap.add_argument('--section', default='all', help='f1 | f2 | f3 | f4 | all')
    args = ap.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)

    reg = json.loads(args.registry.read_text(encoding='utf-8'))
    answers = collections.OrderedDict()
    for p in args.answers:
        name, rows = SR.read_answers(p)
        answers[name] = rows
    by_id = {s['id']: s for s in reg['swings']}
    flags = EA.load_flags(reg['swings'])
    times = {s['id']: s['frameTimes'] for s in reg['swings']}
    print('S-40 fonsterlasning: %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))
    print('bredder: %s (1 ar kontrollen; ingen bredd valjs)' % ', '.join(map(str, WIDTHS)))

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
        if SF.e3_bracket(EST['vy_series'](d, SF.WIN)) is not None:
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
    print('  KONTROLLRAD, den KALLA korningen. Den ar INTE ett resultat -- den ar det enda')
    print('  som visar att pipelinen reproducerar. Stammer den inte med resultat.md,')
    print('  subframe.md och verdict-sensitivity.md har underlaget drivit och inget')
    print('  nedan galler:')
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
    print('  DEN VARMA BASLINJEN, hard-core.md section 1, oforandrad: ' + ';  '.join(
        '%s %d av %d' % (e, sum(1 for s in spans
                                if warm_ch.get(s, {}).get(e) is not None
                                and SR.point_to_interval(warm_ch[s][e], spans[s]) == 0),
                         len(spans)) for e in ESTS))

    dense = VS.load_dense(args.denseDir, reg)
    lms = VS.clip_landmarks(args.clipPoseDir, reg)
    print('  %d svingar har en DETEKTORBANA; %d har dessutom en varm kroppsreferens.'
          % (len(dense), len(set(dense) & set(lms))))

    payload, labels = payload_for(reg, by_id, dense, lms, warm_ch, cold, spans,
                                  ivs1, ivs2, n1, n2, times, flags)
    nwin = sum(len(s['windows']) * len(WIDTHS) for s in payload['swings'])
    print('  %d svingar skickas till produktionskoden: %d fonsterlasningar och en'
          % (len(payload['swings']), nwin))
    print('  enrutsavlasning per envelope-bildruta.')
    print('  HANDIGHET: `unknown` pa alla 103 (STATUS.md section 4). `%s` ar satt HAR for'
          % HANDEDNESS)
    print('  att det ska finnas ett utfall att flytta -- ett antagande, inte en matning,')
    print('  ovantaget fran S-39 sa talen ar jamforbara.')

    bridge = build_bridge(args.work)
    got = run_bridge(bridge, payload, args.work)
    OUT = {}
    for s in got['swings']:
        OUT[s['id']] = dict(
            pf={r['index']: r for r in s['perFrame']},
            win={(w['label'], w['width']): w for w in s['windows']})
    print('  produktionskoden svarade pa %d svingar.' % len(OUT))

    if args.section in ('all', 'f1'):
        section_f1(OUT, by_id, n1, n2)
    if args.section in ('all', 'f2'):
        section_f2(OUT, by_id, spans)
    if args.section in ('all', 'f3'):
        section_f3(OUT, reg, by_id, got['grid'], times, spans, got['budget'])
    if args.section in ('all', 'f4'):
        section_f4(OUT, by_id, n1, n2)


if __name__ == '__main__':
    main()
