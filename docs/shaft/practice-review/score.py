"""S-45 steg 2: poängsätt slag vs provsving. Observationellt — ingen tröskel väljs här.

    python docs/shaft/practice-review/score.py data/shaft/practice-review

Läser svar-erik.json + key.json + measures.json (measure_swings.cjs). Kopplar varje svar
till sin envelope via (klipp, envelope-start) och skriver ut grindens egna mått per sving,
plus fördelningen slag vs falska. Härledda mått (adress-/finish-stillhet) räknas på
envelopens egen debug-serie mot segmenterarens egen quietThreshold.
"""
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
answers = {a['id']: a['verdict'] for a in json.loads((root / 'svar-erik.json').read_text('utf8'))['answers']}
key = json.loads((root / 'key.json').read_text('utf8'))['key']
measures = {r['clip']: r for r in json.loads((root / 'measures.json').read_text('utf8'))['results']}


def quiet_run(frames, idx, step, thr):
    """Sekunder i följd från idx (exklusive) i riktning step med speed < thr."""
    j = idx + step
    while 0 <= j < len(frames) and frames[j]['speed'] < thr:
        j += step
    last = j - step
    return abs(frames[last]['t'] - frames[idx]['t']) if last != idx else 0.0


rows = []
for k in key:
    m = measures[k['clip']]
    sw = [s for s in m['swings'] if abs(s['envStartSec'] - k['envStartSec']) < 1e-6]
    assert len(sw) == 1, (k['id'], k['clip'], 'no unique match — measures.json differs from segments.json')
    s = sw[0]
    e, c = s['envelope'], s['candidate']
    d = e.get('debug') or {}
    fr = d.get('frames') or []
    thr = m['quietThreshold']
    # Närmaste slag i samma klipp (enligt Eriks svar), i sekunder; + = efter detta, - = före.
    others = [o for o in key if o['clip'] == k['clip'] and o['id'] != k['id'] and answers[o['id']] == 'slag']
    near = min((o['envStartSec'] - k['envStartSec'] for o in others), key=abs, default=None)
    rows.append({
        'id': k['id'], 'verdict': answers[k['id']], 'clip': k['clip'],
        'start': e['startSec'], 'stretched': k['timeStretched'],
        'nSwingsClip': len(m['swings']), 'nearestSlag': near,
        'env': e['finishSec'] - e['startSec'],
        'impact': e['impact'] is not None,
        'ds': e['impact']['downswingSec'] if e['impact'] else None,
        'impactReason': e['impactReason'],
        'excursion': e['addressY'] - e['apexY'],
        'finishDrop': e['finishY'] - e['apexY'],
        'peakRel': e['peakSpeed'] / m['refSpeed'],
        'candPeakRel': c['peakSpeed'] / m['refSpeed'],
        'burst': c['burstEndSec'] - c['burstStartSec'],
        'vis': e['visibleFrac'],
        'addrHold': quiet_run(fr, d['startIdx'], -1, thr) if fr else None,
        'finishHold': quiet_run(fr, d['finishIdx'], 1, thr) if fr else None,
        'tailAfterFinish': c['endSec'] - e['finishSec'],
    })

json.dump(rows, open(root / 'scored.json', 'w', encoding='utf8'), indent=1)

fake = [r for r in rows if r['verdict'] != 'slag']
real = [r for r in rows if r['verdict'] == 'slag']
print(f'slag {len(real)}  falska {len(fake)}  (provsving {sum(r["verdict"] == "provsving" for r in fake)})\n')


def f(v, p=2):
    return '—' if v is None else (('ja' if v else 'nej') if isinstance(v, bool) else f'{v:.{p}f}' if isinstance(v, float) else str(v))


cols = ['id', 'verdict', 'clip', 'start', 'stretched', 'nSwingsClip', 'nearestSlag', 'env', 'impact', 'ds',
        'excursion', 'finishDrop', 'peakRel', 'candPeakRel', 'burst', 'vis', 'addrHold', 'finishHold', 'tailAfterFinish']
print(' | '.join(cols))
for r in sorted(fake, key=lambda r: (r['clip'], r['start'])):
    print(' | '.join(f(r[c], 3 if c in ('excursion', 'finishDrop') else 2) for c in cols), '|', r['impactReason'])

print('\nmått | falska min / median / max | slag min / p10 / median / p90 / max | slag inom falskas [min,max]')
for c in ['env', 'ds', 'excursion', 'finishDrop', 'peakRel', 'candPeakRel', 'burst', 'vis', 'addrHold', 'finishHold', 'tailAfterFinish']:
    for stretched in (False, None):
        fv = sorted(r[c] for r in fake if r[c] is not None and (stretched is None or r['stretched'] == stretched))
        rv = sorted(r[c] for r in real if r[c] is not None and (stretched is None or r['stretched'] == stretched))
        if not fv or not rv:
            continue
        q = lambda v, p: v[min(len(v) - 1, int(p * len(v)))]
        inside = sum(fv[0] <= x <= fv[-1] for x in rv)
        tag = 'alla' if stretched is None else 'realtid'
        print(f'{c:16s} {tag:7s} n={len(fv)}/{len(rv)} | {fv[0]:.3f} / {q(fv, .5):.3f} / {fv[-1]:.3f} | '
              f'{rv[0]:.3f} / {q(rv, .1):.3f} / {q(rv, .5):.3f} / {q(rv, .9):.3f} / {rv[-1]:.3f} | {inside}/{len(rv)}')
imp_f = sum(r['impact'] for r in fake)
imp_r = sum(r['impact'] for r in real)
print(f'\nimpact hittad: falska {imp_f}/{len(fake)}  slag {imp_r}/{len(real)}')
print(f'sträckta: falska {sum(r["stretched"] for r in fake)}/{len(fake)}  slag {sum(r["stretched"] for r in real)}/{len(real)}')
