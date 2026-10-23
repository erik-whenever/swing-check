# ONE-OFF (S-49 fix): diff run_segmenter.cjs output before/after the finish-gate change.
#
#   python docs/shaft/fps-missed/compare_fix.py data/shaft/fps-missed/fix
#
# Expects own-before.json, own-after.json, web-before.json, web-after.json in that folder.
# "Same swing" = accepted envelopes overlapping by >= 50 % of the shorter one (locked in
# fps-missed-swings.md §5 before the first run).
import json
import sys
from pathlib import Path

D = Path(sys.argv[1])
ROOT = Path.cwd()


def load(name):
    return {(r['clip'], r['rate']): r for r in json.loads((D / name).read_text())}


def same(a, b):
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    shorter = min(a[1] - a[0], b[1] - b[0])
    return shorter > 0 and (hi - lo) >= 0.5 * shorter


def spans(swings):
    return [(s['startSec'], s['finishSec']) for s in swings]


def match(xs, ys):
    """Greedy one-to-one match; returns (unmatched xs, unmatched ys)."""
    ys_left = list(ys)
    ux = []
    for x in xs:
        hit = next((y for y in ys_left if same(x, y)), None)
        if hit is None:
            ux.append(x)
        else:
            ys_left.remove(hit)
    return ux, ys_left


def fmt(s):
    return '%.2f–%.2f' % s


own_b, own_a = load('own-before.json'), load('own-after.json')
web_b, web_a = load('web-before.json'), load('web-after.json')
clips = sorted({c for c, _ in own_a})

print('== (a) fps invariance, own clips, after (and before for context) ==')
for tag, runs in (('before', own_b), ('after', own_a)):
    n15 = sum(len(runs[(c, 15)]['prod']['swings']) for c in clips)
    n30 = sum(len(runs[(c, 30)]['prod']['swings']) for c in clips)
    diff = []
    for c in clips:
        u15, u30 = match(spans(runs[(c, 15)]['prod']['swings']), spans(runs[(c, 30)]['prod']['swings']))
        if u15 or u30:
            diff.append((c, [fmt(x) for x in u15], [fmt(x) for x in u30]))
    print(f'{tag}: 15 fps {n15} swings, 30 fps {n30} swings, {len(clips)} clips, {len(diff)} clips differ')
    for c, a, b in diff:
        print(f'   {c}: only 15 fps {a}  only 30 fps {b}')

print('\n== 30 fps before vs after (should be ~unchanged) ==')
for c in clips:
    b = spans(own_b[(c, 30)]['prod']['swings'])
    a = spans(own_a[(c, 30)]['prod']['swings'])
    if b != a:
        print(f'   {c}: before {[fmt(x) for x in b]} after {[fmt(x) for x in a]}')

print('\n== 15 fps before vs after (own, production path) ==')
for c in clips:
    b = spans(own_b[(c, 15)]['prod']['swings'])
    a = spans(own_a[(c, 15)]['prod']['swings'])
    if b != a:
        print(f'   {c}: before {[fmt(x) for x in b]} after {[fmt(x) for x in a]}')

print('\n== (b) the three ==')
for c in ('IMG_4613.MP4', 'IMG_5406.MP4', 'IMG_5063.MP4'):
    for rate in (15, 30):
        a = own_a[(c, rate)]['prod']
        print(f'   {c} r{rate}: after {[fmt(x) for x in spans(a["swings"])]}'
              f'  rejected {[(x["reason"][:40]) for x in a["rejected"]]}')

print('\n== (c) S-45 facit (15 fps, production path) ==')
key = json.loads((ROOT / 'data/shaft/practice-review/key.json').read_text())['key']
verdict = {a['id']: a['verdict'] for a in json.loads((ROOT / 'data/shaft/practice-review/svar-erik.json').read_text())['answers']}
by_clip = {}
for k in key:
    by_clip.setdefault(k['clip'], []).append(k)
for tag, runs in (('before', own_b), ('after', own_a)):
    lost_slag, kept_false, new = [], [], []
    for c in clips:
        acc = spans(runs[(c, 15)]['prod']['swings'])
        facit = by_clip.get(c, [])
        fs = [(k['envStartSec'], k['envFinishSec']) for k in facit]
        left = list(acc)
        for k, f in zip(facit, fs):
            hit = next((y for y in left if same(f, y)), None)
            if hit is not None:
                left.remove(hit)
                if verdict[k['id']] != 'slag':
                    kept_false.append((k['id'], c, fmt(f), verdict[k['id']]))
            elif verdict[k['id']] == 'slag':
                lost_slag.append((k['id'], c, fmt(f)))
        new += [(c, fmt(x)) for x in left]
    print(f'{tag}: lost slag {len(lost_slag)} {lost_slag}')
    print(f'{tag}: false accepted {len(kept_false)}')
    print(f'{tag}: envelopes not in S-45 ({len(new)}): {new}')

print('\n== (d) web clips behind S-32, 15 fps: every changed envelope ==')
reg = json.loads((ROOT / 'data/shaft/top-round/registry/registry.json').read_text())['swings']
s32 = {}
for s in reg:
    s32.setdefault(s['clip'], []).append(tuple(s['env']))
for path in ('dataset', 'prod'):
    nb = sum(len(web_b[k][path]['swings']) for k in web_b)
    na = sum(len(web_a[k][path]['swings']) for k in web_a)
    print(f'{path}: before {nb} swings, after {na}')
    for k in sorted(web_a):
        b = spans(web_b[k][path]['swings'])
        a = spans(web_a[k][path]['swings'])
        if b == a:
            continue
        ub, ua = match(b, a)
        print(f'   {k[0]}: before {[fmt(x) for x in b]} after {[fmt(x) for x in a]}')
        for x in b:
            if x not in a:
                tag = 'S-32' if any(same(x, e) for e in s32.get(k[0], [])) else 'not S-32'
                print(f'      changed/removed {fmt(x)} ({tag})')
        if ub or ua:
            print(f'      unmatched: before {[fmt(x) for x in ub]} after {[fmt(x) for x in ua]}')

print('\n== (e) 3587 ==')
for rate in (15, 30):
    for tag, runs in (('before', own_b), ('after', own_a)):
        r = runs[('IMG_3587.MOV', rate)]['prod']
        print(f'   r{rate} {tag}: {[(fmt((s["startSec"], s["finishSec"])), s["impactSec"]) for s in r["swings"]]}')
