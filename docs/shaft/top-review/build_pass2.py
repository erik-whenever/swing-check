# ONE-OFF, READ-ONLY (S-32 pass 2): re-present the last third of Erik's round in a fresh
# blind order, to separate two explanations for the sagging hit rate seen there --
# TROTTHET (attention fading through a 103-swing sitting) from MATERIALET (those particular
# swings are genuinely harder). A second, differently-ordered pass through the SAME 35
# swings answers that: if the same swings fail again, it is the material; if different ones
# fail, or the miss rate returns to the round's average, it was fatigue.
#
#   training/.venv/Scripts/python.exe docs/shaft/top-review/build_pass2.py
#
# WHAT THIS DOES NOT TOUCH:
#   - data/shaft/top-round/svar-erik.json (pass 1's answers) -- read ONLY, to find which 35
#     ids sat at order 69-103, cross-checked against registry.json's own recorded order so
#     the split does not depend on the exported file being trustworthy.
#   - No frame is re-decoded. Pass 1 already extracted every swing's JPEGs under
#     data/shaft/top-round/frames/<id>/; pass 2 points a new viewer at the same files. Only
#     the PRESENTATION ORDER changes.
#   - No estimator: this script does not import analyze_pose.py, same as build_round.py.
#
# WHAT MAKES THIS BLIND AGAIN, NOT A REPEAT OF THE SAME QUESTION:
#   - A FOURTH seed (below), distinct from build_round.py's three (0x70bc0de5 id assignment,
#     0xe71c0de5 Erik's round-1 order, 0x715a0de5 Lisa's), reshuffles just these 35 ids. Erik
#     will not recognise the sequence.
#   - The swing ids themselves are unchanged (S32-NNN, already opaque -- build_round.py's id
#     shuffle carries no information about round-1 viewing order, so reusing the ids here
#     leaks nothing new).
#   - The viewer's round payload holds only id + frame count, same as round 1 -- no clip, no
#     seconds, no phase, and NOTHING from svar-erik.json. Pass 1's answers never enter this
#     script's output.
#   - annotator = 'erik-pass2', not 'erik'. viewer.html keys its localStorage save under
#     'topround-s32-' + annotator, so this is a SEPARATE store from round 1's -- opening the
#     pass-2 page cannot show a pre-filled answer from round 1, by construction, not by
#     clearing state. The export button falls out of the same field: it writes
#     svar-erik-pass2.json, never svar-erik.json.
import json
from pathlib import Path

ROOT = Path.cwd()
if not (ROOT / 'package.json').exists():
    raise SystemExit('run from the repo root -- %s has no package.json' % ROOT)

OUT = ROOT / 'data' / 'shaft' / 'top-round'
REGISTRY = OUT / 'registry' / 'registry.json'
PASS1_ANSWERS = OUT / 'svar-erik.json'
TEMPLATE = ROOT / 'docs' / 'shaft' / 'top-review' / 'viewer.html'
ANNOTATOR = 'erik-pass2'

# Own seed, printed at build time -- distinct from all three of build_round.py's.
PASS2_SEED = 0x9A552A55

FIRST_ORDER, LAST_ORDER = 69, 103  # 1-based, inclusive: the round's last third for Erik


def mulberry32(seed):
    """Identical to build_round.py's -- same generator, so a printed seed means the same
    thing everywhere in this project (docs/shaft/phase-audit/select.ts too)."""
    state = seed & 0xFFFFFFFF

    def next_float():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return next_float


def shuffled(items, seed):
    out = list(items)
    rnd = mulberry32(seed)
    for i in range(len(out) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out


def write_viewer(order):
    payload = dict(
        annotator=ANNOTATOR,
        seed='0x%08x' % PASS2_SEED,
        swings=[dict(id=r['id'], frames=r['frameCount']) for r in order],
    )
    html = TEMPLATE.read_text(encoding='utf-8')
    marker = 'const ROUND = /*__ROUND__*/ null;'
    if marker not in html:
        raise SystemExit('%s has lost its __ROUND__ marker' % TEMPLATE)
    html = html.replace(marker, 'const ROUND = ' + json.dumps(payload, ensure_ascii=False) + ';')
    target = OUT / ANNOTATOR / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')
    print('wrote %s (%d swings)' % (target.relative_to(ROOT).as_posix(), len(order)))


def main():
    reg = json.loads(REGISTRY.read_text(encoding='utf-8'))
    by_id = {s['id']: s for s in reg['swings']}

    # registry.json's own recorded order is the primary source; svar-erik.json is read only
    # to CROSS-CHECK it, never as the thing pass 2 is built from.
    reg_order = reg['orders']['erik']
    last_third = reg_order[FIRST_ORDER - 1:LAST_ORDER]
    if len(last_third) != LAST_ORDER - FIRST_ORDER + 1:
        raise SystemExit('expected %d ids at order %d-%d, got %d'
                         % (LAST_ORDER - FIRST_ORDER + 1, FIRST_ORDER, LAST_ORDER, len(last_third)))

    if PASS1_ANSWERS.exists():
        pass1 = json.loads(PASS1_ANSWERS.read_text(encoding='utf-8'))
        by_order = {a['order']: a['id'] for a in pass1['answers']}
        check = [by_order[o] for o in range(FIRST_ORDER, LAST_ORDER + 1)]
        if check != last_third:
            raise SystemExit('svar-erik.json disagrees with registry.json about order %d-%d -- '
                             'stop, do not guess which is right' % (FIRST_ORDER, LAST_ORDER))
    else:
        print('note: %s not found, skipped the cross-check' % PASS1_ANSWERS.name)

    frames_dir = OUT / 'frames'
    missing = [rid for rid in last_third if not (frames_dir / rid).is_dir()]
    if missing:
        raise SystemExit('frames missing for: %s -- pass 1 must be built first '
                         '(build_round.py), this script decodes none' % ', '.join(missing))

    pass2_answers = OUT / ('svar-%s.json' % ANNOTATOR)
    if pass2_answers.exists() and pass2_answers.stat().st_size > 2:
        raise SystemExit('%s already has answers -- stop, do not overwrite a filled pass 2'
                         % pass2_answers.name)

    order = [by_id[i] for i in shuffled(last_third, PASS2_SEED)]

    print('pass 2: %d swings, %d distinct clips, seed 0x%08x'
          % (len(order), len({r['clip'] for r in order}), PASS2_SEED))
    print('  of these: %d controls, %d of S-31s prior-judged six, %d slow-mo'
          % (sum(1 for r in order if r['isControl']),
             sum(1 for r in order if r['priorJudgement']),
             sum(1 for r in order if r['slowmo'])))
    print('  same order as pass 1 at any position: %d / %d'
          % (sum(1 for a, b in zip(last_third, [r['id'] for r in order]) if a == b), len(order)))

    write_viewer(order)
    print('next: open %s and judge exactly like pass 1 (same keys, same view).'
          % (OUT / ANNOTATOR / 'index.html').relative_to(ROOT).as_posix())
    print('export saves as svar-erik-pass2.json -- do not rename it to svar-erik.json.')


if __name__ == '__main__':
    main()
