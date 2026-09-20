# ONE-OFF, READ-ONLY (S-41): does reading top-shaft-orientation COARSELY -- across /
# on-plane / laid-off plus silence -- make the OUTCOME steadier than the fine category
# does? WRITES NOTHING BUT STDOUT (plus a bridge file in --work).
#
#   <venv>/python.exe docs/shaft/top-review/coarse_tso.py <poseDir> \
#       --clipPoseDir <clipPoseDir> --denseDir <denseDir> --work <work> \
#       [--registry data/shaft/top-round/registry/registry.json] \
#       [--answers data/shaft/top-round/svar-erik.json data/shaft/top-round/svar-lisa.json] \
#       [--section f1|f2|f3|f4|f5|all]
#
# THE KEY IS ALREADY SEEN. resultat.md, subframe.md, crossing-selection.md, multiswing.md,
# envelope-audit.md, e2-and-floor.md, hard-core.md, verdict-sensitivity.md and
# windowed-tso.md are all written and read, so the risk here is not measurement error, it
# is FITTING. Therefore: no parameter swept, none tuned, NOTHING CHOSEN. The coarse
# reading is the task's own; the fine reading is S-39's own `verdict`, imported.
#
# WHAT "COARSE" IS, EXACTLY, AND WHAT IT IS NOT. It is a RELABELLING of what production
# already returned, applied after the fact by this script. ON_PLANE_BAND_DEG and
# NEAR_VERTICAL_GATE_DEG are READ, never written: the band still decides on-plane and the
# gate still decides cannot-determine, inside src/lib/shaft/measure/, unchanged. The only
# thing that happens here is that outcomes production hands back are merged into fewer
# buckets before they are compared. A merge can only REMOVE flips, never add one -- that
# is a property of the construction, it is asserted in main(), and it is why the fine row
# is printed beside every coarse row.
#
# EVERYTHING IS MEASURED WARM -- run_pose_clip.py's whole-clip trajectories, the
# configuration e2-and-floor.md section 1 showed production runs. The COLD run is loaded
# for two purposes, both printed: the control line, and FRAGA 1's cold-vs-warm
# disturbance, where the cold tracker is NOISE and not ground truth.
#
# NOTHING IS DECIDED HERE. No threshold, no estimator, no classifier, no calibration, no
# shift, no change to S-30's gate, no production code written. verdict_sensitivity.py's
# bridge (verdict_outcomes.ts), payload, loaders and `verdict` are IMPORTED and reused;
# nothing is re-implemented.
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_round as SR            # noqa: E402
import subframe as SF               # noqa: E402
import crossing_selection as CS     # noqa: E402
import e2_and_floor as E2F          # noqa: E402
import hard_core as HC              # noqa: E402
import verdict_sensitivity as VS    # noqa: E402

EST = SF.EST
WIN = SF.WIN
ESTS = HC.ESTS
HANDEDNESS = VS.HANDEDNESS          # the same assumption, for the same reason

# The three categories the task keeps. `cannot-determine` is NOT among them: it is
# reached only through NEAR_VERTICAL_GATE_DEG and means the shaft sat within 16 deg of
# the VERTICAL, while on-plane means within ON_PLANE_BAND_DEG of the HORIZONTAL. The two
# sit at opposite ends of the same scale (derived.ts says so in as many words), so
# cannot-determine cannot be folded into on-plane. Silence is the only bucket left for
# it, and that is a COST, counted in FRAGA 2.
KEPT = ('across-the-line', 'on-plane', 'laid-off')
SIGNED = ('across-the-line', 'laid-off')


# -- the four readings ---------------------------------------------------------

def fine(res, key='tso'):
    """S-39's own outcome, imported unchanged: across-the-line / on-plane / laid-off /
    cannot-determine / `inget-svar:<reasons>` -- and the REASONS are part of it, so two
    silences with different reasons are two different outcomes."""
    return VS.verdict(res, key)


def coarse3(res, key='tso'):
    """THE TASK'S OWN READING: across / on-plane / laid-off, plus silence. Everything
    that is not one of the three calls -- cannot-determine and every no-value reason --
    becomes one `tystnad`."""
    v = VS.verdict(res, key)
    if v == 'utanfor-envelopen':
        return v
    return v if v in KEPT else 'tystnad'


def coarse_cd(res, key='tso'):
    """CONTROL, not a candidate: only the SILENCE REASONS are merged; cannot-determine
    stays its own outcome. It separates the two merges coarse3 performs, so the report
    can say which one any stability comes from."""
    v = VS.verdict(res, key)
    if v == 'utanfor-envelopen':
        return v
    return v if (v in KEPT or v == 'cannot-determine') else 'tystnad'


def coarse2(res, key='tso'):
    """The task's two-way reading: across / laid-off, on-plane counted as silence."""
    v = coarse3(res, key)
    return 'tystnad' if v == 'on-plane' else v


READINGS = [('fin (S-39)', fine, lambda r: r['tso']['answers']),
            ('grov 3-vags', coarse3, lambda r: coarse3(r) in KEPT),
            ('kontroll: cd kvar', coarse_cd,
             lambda r: coarse_cd(r) in KEPT or coarse_cd(r) == 'cannot-determine'),
            ('grov 2-vags', coarse2, lambda r: coarse2(r) in SIGNED)]


def speaks(res, sp):
    return res is not None and not res.get('outside') and sp(res)


def flips(OUT, a, b, reader, sp=None):
    """(n, flips, ids). With `sp` the denominator is the rows where the reading SPEAKS at
    at least one end -- a row silent in both ends cannot flip and dilutes the share. The
    predicate belongs to the READING, so the coarse denominators are not the fine one."""
    n = f = 0
    ids = []
    for sid, sw in OUT.items():
        x, y = sw.get(a), sw.get(b)
        if x is None or y is None or x.get('outside') or y.get('outside'):
            continue
        if sp is not None and not (speaks(x, sp) or speaks(y, sp)):
            continue
        n += 1
        if reader(x) != reader(y):
            f += 1
            ids.append(sid)
    return n, f, ids


def agree(OUT, a, b, reader, rows=None):
    """(n, same, ids-that-differ) -- the same comparison read as agreement, for FRAGA 3."""
    n = s = 0
    ids = []
    for sid, sw in OUT.items():
        if rows is not None and sid not in rows:
            continue
        x, y = sw.get(a), sw.get(b)
        if x is None or y is None or x.get('outside') or y.get('outside'):
            continue
        n += 1
        if reader(x) == reader(y):
            s += 1
        else:
            ids.append(sid)
    return n, s, ids


def clips_of(sids, by_id):
    return len({by_id[s]['clip'] for s in sids})


def nclip(OUT, a, b, by_id):
    """How many independent CLIPS the population of one pair-comparison spans."""
    ids = [sid for sid, sw in OUT.items()
           if sw.get(a) and sw.get(b)
           and not sw[a].get('outside') and not sw[b].get('outside')]
    return clips_of(ids, by_id)


def pct(a, b):
    return '%.1f %%' % (100.0 * a / b) if b else '--'


# -- FRAGA 1 -------------------------------------------------------------------

def section_f1(OUT, by_id, n1, n2):
    print('\n=== FRAGA 1. BYTER UTFALLET SALLAN NAR TSO LASES GROVT? ===')
    print('  Samma tre STORNINGAR som S-39 och S-40 matte. Ingen av dem ar ett bildrutefel:')
    print('  de ar golvet e2-and-floor.md section 4 och verdict-sensitivity.md section 1')
    print('  matte. DEN FINA RADEN AR KONTROLLEN och maste reproducera S-39 (9/100, 16-18 %,')
    print('  13/101); gor den inte det galler ingenting nedan.')
    print('  Grovheten ar en RELABELLERING av produktionens egna svar, gjord har. Den kan')
    print('  per konstruktion bara TA BORT byten, aldrig lagga till nagot.')

    pairs = [('E4 kall mot varm (S-39: 9/100)', 'E4kall', 'E4'),
             ('%s forsta mot sista ruta (S-39: 11/93)' % n1, '%s_lo' % n1, '%s_hi' % n1),
             ('%s forsta mot sista ruta (S-39: 11/95)' % n2, '%s_lo' % n2, '%s_hi' % n2),
             ('spannet, forsta mot sista (S-39: 12/91)', 'SPAN_lo', 'SPAN_hi'),
             ('E3 mot E4 (S-39: 13/101)', 'E3', 'E4')]

    print('\n  (a) ALLA rader med bada rutorna inne i envelopen.')
    print('     %-44s %s' % ('storning', ' '.join('%20s' % r[0] for r in READINGS)))
    for lab, a, b in pairs:
        cells = []
        for _, reader, _sp in READINGS:
            n, f, _ = flips(OUT, a, b, reader)
            cells.append('%s (%s)' % ('%d/%d' % (f, n), pct(f, n)))
        print('     %-44s %s' % (lab, ' '.join('%20s' % c for c in cells)))
        print('     %-44s %s' % ('', '(%d oberoende klipp)' % nclip(OUT, a, b, by_id)))

    print('\n  (b) BLAND DE SVARANDE -- och namnaren ar lasningens EGEN. Den fina raden')
    print('     raknar cannot-determine som ett svar (den ar ett resultat i koden); de')
    print('     grova gor det inte, sa namnarna ar inte samma namnare och far inte')
    print('     jamforas rakt av. Bada star darfor utskrivna.')
    print('     %-44s %s' % ('storning', ' '.join('%20s' % r[0] for r in READINGS)))
    for lab, a, b in pairs:
        cells = []
        for _, reader, sp in READINGS:
            n, f, _ = flips(OUT, a, b, reader, sp)
            cells.append('%s (%s)' % ('%d/%d' % (f, n), pct(f, n)))
        print('     %-44s %s' % (lab, ' '.join('%20s' % c for c in cells)))

    print('\n  (c) VILKA RADER som fortfarande byter, och vad de byter MELLAN.')
    for lab, a, b in pairs:
        print('     -- %s --' % lab)
        for rname, reader, _sp in READINGS:
            n, f, ids = flips(OUT, a, b, reader)
            print('        %-20s %2d av %-4d %s'
                  % (rname, f, n, ', '.join(sorted(ids)) or '--'))
        _, _, ids3 = flips(OUT, a, b, coarse3)
        for sid in sorted(ids3):
            print('          %-9s %-11s %-16s -> %-16s   (fint: %s -> %s)'
                  % (sid, by_id[sid]['clip'], coarse3(OUT[sid][a]), coarse3(OUT[sid][b]),
                     fine(OUT[sid][a]), fine(OUT[sid][b])))

    print('\n  (d) RENA TECKENBYTEN, across <-> laid-off, under varje storning. Det ar det')
    print('     grovsta felet matvardet kan gora, och det enda byte den tvavagsa lasningen')
    print('     kan gora mellan tva SVAR.')
    for lab, a, b in pairs:
        n = sign = 0
        ids = []
        for sid, sw in OUT.items():
            x, y = sw.get(a), sw.get(b)
            if x is None or y is None or x.get('outside') or y.get('outside'):
                continue
            n += 1
            u, v = coarse3(x), coarse3(y)
            if {u, v} == {'across-the-line', 'laid-off'}:
                sign += 1
                ids.append(sid)
        print('     %-44s %d av %d  %s' % (lab, sign, n, ', '.join(sorted(ids)) or '--'))


# -- FRAGA 2 -------------------------------------------------------------------

def section_f2(OUT, by_id, spans):
    print('\n=== FRAGA 2. VAD GROVHETEN KOSTAR ===')
    print('  Populationen ar raderna med ett manskligt spann, last pa E4:s egen ruta.')
    print('  "Forlorar en distinktion" betyder exakt: den fina lasningen gav raden ett annat')
    print('  namn an den grova ger den. Ingen tolkning, en rakning.')

    rows = [sid for sid in spans if sid in OUT and OUT[sid].get('E4')
            and not OUT[sid]['E4'].get('outside')]
    print('\n  n = %d rader i %d klipp.' % (len(rows), clips_of(rows, by_id)))

    c = collections.Counter(fine(OUT[sid]['E4']) for sid in rows)
    print('\n  (a) Den FINA fordelningen pa E4:s ruta:')
    for k, v in c.most_common():
        print('     %-52s %3d' % (k, v))

    print('\n  (b) Vad de tre grova lasningarna gor av den:')
    for rname, reader, _sp in READINGS[1:]:
        cc = collections.Counter(reader(OUT[sid]['E4']) for sid in rows)
        print('     %-20s %s' % (rname, ';  '.join('%s %d' % kv for kv in cc.most_common())))

    print('\n  (c) RADER SOM FORLORAR EN DISTINKTION -- fint namn skiljt fran grovt namn.')
    for rname, reader, _sp in READINGS[1:]:
        lost = [sid for sid in rows if fine(OUT[sid]['E4']) != reader(OUT[sid]['E4'])]
        print('     %-20s %d av %d (%s), %d klipp'
              % (rname, len(lost), len(rows), pct(len(lost), len(rows)),
                 clips_of(lost, by_id)))
        cc = collections.Counter(fine(OUT[sid]['E4']) for sid in lost)
        for k, v in cc.most_common():
            print('        %-49s %3d' % ('fint: %s' % k, v))

    print('\n  (d) OCH VAD SOM SLAS IHOP MED VAD. Varje fint namn som hamnar i `tystnad`,')
    print('     och hur manga rader det bar. Det ar de distinktioner som forsvinner.')
    merged = collections.defaultdict(list)
    for sid in rows:
        if coarse3(OUT[sid]['E4']) == 'tystnad':
            merged[fine(OUT[sid]['E4'])].append(sid)
    print('     3-vags: %d fina namn slas ihop till ett, over %d rader:'
          % (len(merged), sum(len(v) for v in merged.values())))
    for k, v in sorted(merged.items(), key=lambda kv: -len(kv[1])):
        print('        %-49s %3d rader i %d klipp' % (k, len(v), clips_of(v, by_id)))
    op = [sid for sid in rows if fine(OUT[sid]['E4']) == 'on-plane']
    print('     2-vags slar dessutom ihop `on-plane` (%d rader, %d klipp) med samma hink.'
          % (len(op), clips_of(op, by_id)))

    print('\n  (e) Och hur manga rader som byter namn mellan de tva grova lasningarna:')
    d32 = [sid for sid in rows if coarse3(OUT[sid]['E4']) != coarse2(OUT[sid]['E4'])]
    print('     %d av %d (det ar per konstruktion exakt on-plane-raderna).'
          % (len(d32), len(rows)))

    print('\n  (f) HUR OFTA MELLANKATEGORIN ALLS UPPSTAR. Skillnaden mellan den 3-vagsa och')
    print('     den 2-vagsa lasningen ar bara `on-plane`, sa den ar vard sitt eget tal.')
    print('     Rakningen gar over VARJE kandidatruta produktionen svarade pa i rundan --')
    print('     alla etiketter, alla svingar -- inte bara E4:s ruta.')
    tot = collections.Counter()
    for sw in OUT.values():
        for res in sw.values():
            if res.get('outside'):
                continue
            tot[fine(res)] += 1
    n = sum(tot.values())
    for k, v in tot.most_common():
        print('     %-52s %4d av %d (%s)' % (k, v, n, pct(v, n)))


# -- FRAGA 3 -------------------------------------------------------------------

def section_f3(OUT, by_id, spans, warm_ch):
    print('\n=== FRAGA 3. E4 GROVT MOT FACIT ===')
    print('  Referensen ar S-39:s och S-40:s egen och den ar oforandrad: ENRUTSAVLASNINGEN')
    print('  vid en topp satt MITT i manniskornas spann (SPAN_mid, unionens mitt, halv-upp')
    print('  avrundad), last med SAMMA lasning som E4. Det finns ingen bedomd')
    print('  across/laid-off-etikett per sving -- bedomarna ritade toppens BILDRUTA, inte')
    print('  dess kategori -- sa "facit" betyder har exakt det, och ingenting mer.')

    rows = [sid for sid in spans if sid in OUT and OUT[sid].get('E4')
            and OUT[sid].get('SPAN_mid') and not OUT[sid]['E4'].get('outside')
            and not OUT[sid]['SPAN_mid'].get('outside')]
    inside = {sid for sid in rows
              if warm_ch.get(sid, {}).get('E4') is not None
              and SR.point_to_interval(warm_ch[sid]['E4'], spans[sid]) == 0}
    outside = set(rows) - inside
    print('\n  n = %d rader i %d klipp. E4 INNE i spannet pa %d, utanfor pa %d.'
          % (len(rows), clips_of(rows, by_id), len(inside), len(outside)))

    print('\n     %-20s %16s %16s %16s' % ('lasning', 'alla', 'E4 inne', 'E4 utanfor'))
    for rname, reader, _sp in READINGS:
        cells = []
        for sub in (None, inside, outside):
            n, s, _ = agree(OUT, 'E4', 'SPAN_mid', reader, sub)
            cells.append('%s (%s)' % ('%d/%d' % (s, n), pct(s, n)))
        print('     %-20s %16s %16s %16s' % (rname, cells[0], cells[1], cells[2]))

    print('\n     De rader som SKILJER sig grovt (3-vags), med det fina utfallet bredvid:')
    _, _, diff = agree(OUT, 'E4', 'SPAN_mid', coarse3)
    for sid in sorted(diff):
        print('       %-9s %-11s %-16s mot %-16s  (fint: %s mot %s)%s'
              % (sid, by_id[sid]['clip'], coarse3(OUT[sid]['E4']),
                 coarse3(OUT[sid]['SPAN_mid']), fine(OUT[sid]['E4']),
                 fine(OUT[sid]['SPAN_mid']), '' if sid in inside else '  [E4 utanfor]'))

    print('\n     Uppdelat pa bytets art, 3-vags: vad som gar mot vad.')
    cc = collections.Counter((coarse3(OUT[sid]['E4']), coarse3(OUT[sid]['SPAN_mid']))
                             for sid in diff)
    for (u, v), k in cc.most_common():
        print('       %-18s mot %-18s %3d' % (u, v, k))

    print('\n     Och samma for den tvavagsa lasningen:')
    _, _, diff2 = agree(OUT, 'E4', 'SPAN_mid', coarse2)
    cc = collections.Counter((coarse2(OUT[sid]['E4']), coarse2(OUT[sid]['SPAN_mid']))
                             for sid in diff2)
    for (u, v), k in cc.most_common():
        print('       %-18s mot %-18s %3d' % (u, v, k))


# -- FRAGA 4 -------------------------------------------------------------------

def section_f4(OUT, by_id, n1, n2):
    print('\n=== FRAGA 4. GRINDEN -- HALLER SVAR/TYSTNAD LIKA BRA GROVT? ===')
    print('  S-40 matte svar/tystnad till 2/100, 5/91 och 6/101 med den FINA svarsmangden,')
    print('  dar cannot-determine raknas som ett svar. Den grova lasningens grind ar en')
    print('  ANNAN grind: cannot-determine ligger pa tystnadssidan av den. Bada star har.')

    pairs = [('E4 kall mot varm (S-40: 2/100)', 'E4kall', 'E4'),
             ('spannet, forsta mot sista (S-40: 5/91)', 'SPAN_lo', 'SPAN_hi'),
             ('E3 mot E4 (S-40: 6/101)', 'E3', 'E4'),
             ('%s forsta mot sista' % n1, '%s_lo' % n1, '%s_hi' % n1),
             ('%s forsta mot sista' % n2, '%s_lo' % n2, '%s_hi' % n2)]

    def bin_fine(res):
        if res.get('outside'):
            return 'utanfor'
        return 'svar' if res['tso']['answers'] else 'tyst'

    def bin3(res):
        v = coarse3(res)
        return 'utanfor' if v == 'utanfor-envelopen' else ('svar' if v in KEPT else 'tyst')

    def bin2(res):
        v = coarse2(res)
        return 'utanfor' if v == 'utanfor-envelopen' else ('svar' if v in SIGNED else 'tyst')

    print('\n     %-44s %16s %16s %16s'
          % ('storning', 'fin grind', 'grov 3-vags', 'grov 2-vags'))
    for lab, a, b in pairs:
        cells = []
        for rd in (bin_fine, bin3, bin2):
            n, f, _ = flips(OUT, a, b, rd)
            cells.append('%s (%s)' % ('%d/%d' % (f, n), pct(f, n)))
        print('     %-44s %16s %16s %16s' % (lab, cells[0], cells[1], cells[2]))

    print('\n     Hur mycket av skillnaden som ar cannot-determine-raderna: hur ofta de tva')
    print('     andarna skiljer sig fint OCH en av dem ar cannot-determine.')
    for lab, a, b in pairs:
        n = k = 0
        for sid, sw in OUT.items():
            x, y = sw.get(a), sw.get(b)
            if x is None or y is None or x.get('outside') or y.get('outside'):
                continue
            n += 1
            u, v = fine(x), fine(y)
            if u != v and 'cannot-determine' in (u, v):
                k += 1
        print('     %-44s %d av %d' % (lab, k, n))

    print('\n     Och hur ofta lasningen SVARAR alls, pa E4:s egen ruta:')
    rows = [sid for sid, sw in OUT.items()
            if sw.get('E4') and not sw['E4'].get('outside')]
    for rname, reader, sp in READINGS:
        k = sum(1 for sid in rows if speaks(OUT[sid]['E4'], sp))
        print('     %-20s %d av %d (%s)' % (rname, k, len(rows), pct(k, len(rows))))


# -- FRAGA 5 -------------------------------------------------------------------

def section_f5(reg):
    print('\n=== FRAGA 5. VAD SOM SAKNAS FOR EN OBSERVERAD TOPP I APPEN ===')
    print('  Last ur koden, inte antaget. Varje rad ar en grep eller en rakning.')

    print('\n  (a) VEM SATTER phaseSource. fromDetection.ts tar emot det fran anroparen och')
    print('     defaultar det INTE -- den skriver sjalv att appens vag darfor passerar')
    print('     envelope-impact eller envelope-fallback, aldrig observed.')
    for ident in ('phaseSource', "'observed'", 'derivePhaseWithSource', 'derivePhase',
                  'buildShaftSwingSeries', 'buildShaftMeasurements', 'DetectedFrame'):
        hits = []
        for p in sorted(Path('src').rglob('*.ts')) + sorted(Path('src').rglob('*.tsx')):
            q = p.as_posix()
            if 'shaft/measure' in q or '.test.' in q:
                continue
            try:
                txt = p.read_text(encoding='utf-8')
            except OSError:
                continue
            if ident in txt:
                hits.append(q)
        print('     %-26s %s' % (ident, ', '.join(hits) if hits
                                 else 'INGENSTANS utanfor src/lib/shaft/measure/ och testerna'))

    print('\n  (b) VAR ETT `top` ALLS KAN UPPSTA i appen, och pa vilket ankare.')
    print('     Bada faslaggarna ar tidsjamforelser mot envelope.impact.topSec:')
    print('       poseEnvelopeSelection.ts labelPhase()  -- brickornas etikett')
    print('       dataset/datasetPhase.ts derivePhase()  -- datasetattributet (dev)')
    print('     och topSec finns bara nar envelopen har ett SAKERT NEDSLAG: i')
    print('     poseEnvelope.ts satts impact = {topSec, ...} enbart i den grenen, och')
    print('     topIdx ar minsta y FORE impactIdx, alltsa odefinierad utan det.')
    conf = sum(1 for s in reg['swings'] if s.get('hasConfidentImpact'))
    print('     I den har rundan har %d av %d svingar ett sakert nedslag (%s).'
          % (conf, len(reg['swings']), pct(conf, len(reg['swings']))))
    print('     Pa de ovriga %d finns ingen topSec, alltsa ingen `top`-etikett alls, och'
          % (len(reg['swings']) - conf))
    print('     matvardet faller pa `phase-missing` innan S-30:s sparr ens lases.')

    print('\n  (c) TOLERANSEN som avgor VILKA rutor som far heta top, och rutnatet den')
    print('     lokaliseras pa. Konstanterna citeras ur filerna, inte ur minnet.')
    for ident, path in (('POINT_TOL_SEC', 'src/lib/dataset/datasetPhase.ts'),
                        ('SAMPLE_FPS', 'src/lib/poseTrajectory.ts'),
                        ('ANALYSIS_FRAME_COUNT', 'src/lib/frameExtractor.ts'),
                        ('NEAR_VERTICAL_GATE_DEG', 'src/lib/shaft/measure/derived.ts'),
                        ('ON_PLANE_BAND_DEG', 'src/lib/shaft/measure/derived.ts')):
        txt = Path(path).read_text(encoding='utf-8') if Path(path).exists() else ''
        line = next((ln.strip() for ln in txt.splitlines()
                     if ln.strip().startswith(('const %s' % ident,
                                               'export const %s' % ident))),
                    'HITTADES INTE i %s' % path)
        print('     %-26s %-46s %s' % (ident, line, path))

    print('\n  (d) DE ANDRA TVA SPARRARNA, raknade pa rundan. Appen har varken')
    print('     kameravinkeln eller handigheten -- rundan har bada av annotatorerna.')
    vb = collections.Counter(s['viewBucket'] for s in reg['swings'])
    hd = collections.Counter(str(s.get('handedness')) for s in reg['swings'])
    print('     viewBucket i rundan: %s' % dict(vb))
    print('     handedness i rundan: %s' % dict(hd))
    print('     (I appen ar cameraAngle ofta null, och cameraGate blir da `uncertain` i')
    print('      stallet for `rejected` -- mildare, inte strangare. handedness okand')
    print('      avvisar daremot top-shaft-orientation rakt av.)')


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
    print('S-41 grov TSO: %d svingar i %d klipp, %d envelope-bildrutor'
          % (reg['swingCount'], reg['clipCount'], reg['frameCount']))
    print('svarsfiler: ' + ', '.join(answers))
    print('lasningar: ' + ', '.join(r[0] for r in READINGS)
          + '  (den fina ar kontrollen; ingen troskel ar rord)')

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
    ivs1 = {k: v for k, v in ((s, SR.interval(a1.get(s))) for s in D) if v}
    ivs2 = {k: v for k, v in ((s, SR.interval(a2.get(s))) for s in D) if v}
    spans = {}
    for sid in D:
        if sid in ivs1 and sid in ivs2:
            spans[sid] = (min(ivs1[sid][0], ivs2[sid][0]), max(ivs1[sid][1], ivs2[sid][1]))

    cold = E2F.choices_for(reg, lambda sid: POSE.get(sid))
    print('  %d svingar med kall posebana; %d med ett E3-val; %d med ett manskligt spann.'
          % (len(POSE), len(D), len(spans)))
    print('  KONTROLLRAD, den KALLA korningen. Den ar INTE ett resultat -- den ar det enda')
    print('  som visar att pipelinen reproducerar. Stammer den inte med resultat.md,')
    print('  subframe.md, hard-core.md, verdict-sensitivity.md och windowed-tso.md har')
    print('  underlaget drivit och inget nedan galler:')
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

    payload, _cands = VS.payload_for(reg, by_id, dense, lms, warm_ch, cold, spans,
                                     ivs1, ivs2, n1, n2)
    print('  %d svingar skickas till produktionskoden, %d kandidatrutor totalt.'
          % (len(payload['swings']), sum(len(s['candidates']) for s in payload['swings'])))
    print('  HANDIGHET: `unknown` pa alla 103 (STATUS.md section 4). `%s` ar satt HAR for'
          % HANDEDNESS)
    print('  att det ska finnas ett utfall att flytta -- ett antagande, inte en matning,')
    print('  ovantaget fran S-39 och S-40 sa talen ar jamforbara.')

    bridge = VS.build_bridge(args.work)
    got = VS.run_bridge(bridge, payload, args.work)
    OUT = {}
    for s in got['swings']:
        OUT[s['id']] = {r['label']: r for r in s['results']}
    print('  produktionskoden svarade pa %d svingar.' % len(OUT))

    # The construction's own guarantee, asserted rather than claimed: every coarse
    # reading is a MERGE of the fine one, so a row that does not flip finely cannot flip
    # coarsely. If that is ever false the readings are not coarsenings and nothing below
    # means what it says.
    for a, b in (('E4kall', 'E4'), ('E3', 'E4'), ('SPAN_lo', 'SPAN_hi'),
                 ('E4', 'SPAN_mid')):
        for sid, sw in OUT.items():
            x, y = sw.get(a), sw.get(b)
            if x is None or y is None or x.get('outside') or y.get('outside'):
                continue
            if fine(x) != fine(y):
                continue
            for _, reader, _sp in READINGS:
                if reader(x) != reader(y):
                    raise SystemExit('grov lasning byter dar den fina inte gor det: '
                                     '%s (%s mot %s)' % (sid, a, b))
    print('  KONTROLL: ingen grov lasning byter dar den fina inte byter.')

    if args.section in ('all', 'f1'):
        section_f1(OUT, by_id, n1, n2)
    if args.section in ('all', 'f2'):
        section_f2(OUT, by_id, spans)
    if args.section in ('all', 'f3'):
        section_f3(OUT, by_id, spans, warm_ch)
    if args.section in ('all', 'f4'):
        section_f4(OUT, by_id, n1, n2)
    if args.section in ('all', 'f5'):
        section_f5(reg)


if __name__ == '__main__':
    main()
