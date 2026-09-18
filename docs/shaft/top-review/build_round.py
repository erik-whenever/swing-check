# ONE-OFF, READ-ONLY (S-32): build the BLIND top-judgement round.
#
#   python docs/shaft/top-review/build_round.py [--dry-run] [--limit N] [--force]
#
# WHAT IT BUILDS. Every swing whose source clip is in data/shaft/clips (103 of the 205 in
# data/shaft/exports) gets a judging view: every video frame inside the swing envelope,
# steppable one frame at a time, with the frame index readable. The answer asked for is an
# INTERVAL -- the first and the last frame that could plausibly be the top -- not one frame.
# That is the shape S-31 needed and did not have: docs/shaft/top-from-pose.md scored six
# tops in five clips against an interval Erik never drew; it was inferred from a phase label.
#
# WHAT IT MUST NOT LEAK. The round is blind against the estimators it exists to measure:
#   - E1/E2/E3 are never computed here. This script does not import analyze_pose.py, does
#     not read a pose run, and holds no estimator. Their choices cannot leak out of a file
#     that never held them.
#   - Swing keys are replaced by opaque round ids. `045-224bdedb_s00` is committed text in
#     docs/shaft/phase-audit/review.md next to Erik's answer for it; a folder wearing that
#     name would hand both annotators the answer to six swings and hand Lisa Erik's prior.
#     The id map lives in the registry, the file nobody opens until both answers are in.
#   - Id assignment and each annotator's order are three SEPARATE shuffles under three
#     separate seeds. Nothing about position carries information.
#   - The viewer shows a frame index and nothing else. No clip name, no seconds, no fps, no
#     slow-mo flag, no phase, no envelope bounds, no impact.
#
# WHERE THINGS LAND. All image material goes under data/shaft/top-round/, which
# `data/shaft/*` in .gitignore already covers -- the same identifiable people as the clips,
# published never. This script and the report beside it are the only things in docs/.
#
# IT CHANGES NO PRODUCTION CODE. src/lib/shaft/measure/, NEAR_VERTICAL_GATE_DEG,
# ON_PLANE_BAND_DEG and the sign convention are untouched, and nothing here sets a
# threshold. The round produces a key; it does not produce a detector.
import argparse
import collections
import json
import zipfile
from pathlib import Path

import cv2

ROOT = Path.cwd()
if not (ROOT / 'package.json').exists():
    raise SystemExit('run from the repo root -- %s has no package.json' % ROOT)

EXPORTS = ROOT / 'data' / 'shaft' / 'exports'
CLIPS = ROOT / 'data' / 'shaft' / 'clips'
TRAINING = ROOT / 'data' / 'shaft' / 'training'
OUT = ROOT / 'data' / 'shaft' / 'top-round'
TEMPLATE = ROOT / 'docs' / 'shaft' / 'top-review' / 'viewer.html'

# Three seeds, three shuffles, one job each. Distinct from the phase round's 0xfa5ec0de and
# the across-the-line round's 0x5ca1ab1e: two rounds sharing a seed share an order.
SEED_IDS = 0x70BC0DE5       # swing key -> opaque round id
ANNOTATORS = {
    'erik': 0xE71C0DE5,     # Erik's presentation order
    'lisa': 0x715A0DE5,     # Lisa's presentation order
}

# The long side the judging JPEGs are capped at. Never upscaled: the material runs from
# 1080x1920 down to 360x614, and inventing pixels for the small clips would make them look
# to the judging eye like the big ones.
MAX_LONG_SIDE = 1280
JPEG_QUALITY = 92

# Mirroring is not a measurement in this repo, it is a list of clips somebody actually
# looked at. 093.mp4 reads the range signs mirrored (docs/shaft/STATUS.md section 4).
# Every other clip is `unknown` -- NOT `false`. Nobody checked them.
MIRRORED_CLIPS = {'093.mp4': 'confirmed (bakgrundstexten ar spegelvand, STATUS.md 4)'}
UNCHECKED_MIRROR = 'unknown (ingen har tittat)'

# Phases that count as an annotated before/after bracket around an annotated top. Reporting
# only: the control rule below does not require a bracket, because only 3 of 103 swings have
# one and a control set of 3 measures nothing.
BEFORE = {'address', 'backswing', 'idle'}
AFTER = {'downswing', 'impact', 'through', 'finish'}


def mulberry32(seed):
    """The generator docs/shaft/phase-audit/select.ts shuffles with, so the two rounds are
    reproducible the same way and a printed seed means the same thing in both."""
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
    """Fisher-Yates, same direction as select.ts."""
    out = list(items)
    rnd = mulberry32(seed)
    for i in range(len(out) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out


# -- reading the sources ------------------------------------------------------

def read_manifests():
    """One entry per export zip, manifest.json verbatim -- the shape
    docs/shaft/top-from-pose/rows_from_review.py writes."""
    return [dict(export=z.name, manifest=json.loads(zipfile.ZipFile(z).read('manifest.json')))
            for z in sorted(EXPORTS.glob('*.zip'))]


def read_annotations():
    """Every human CVAT export, frame id -> [{source, view, phase}].

    An export whose `phase` attribute holds the SAME value on every frame carries no phase:
    batch-03/annotated-v1.zip is `address` on all 242 of its frames and `address` is that
    attribute's CVAT default_value. Its phases are dropped, its views kept. This is the
    judgement scripts/across-sign-candidates.ts and phase-audit/select.ts already make, and
    it has to stay the same one or the rounds are counting different frames.
    """
    per_frame = collections.defaultdict(list)
    for zip_path in sorted(TRAINING.rglob('annotated-*.zip')):
        rel = zip_path.relative_to(ROOT).as_posix()
        doc = json.loads(
            zipfile.ZipFile(zip_path).read('annotations/person_keypoints_default.json'))
        shaft_ids = {c['id'] for c in doc.get('categories', []) if c['name'] == 'shaft'}
        images = {i['id']: i['file_name'] for i in doc.get('images', [])}
        rows = []
        for ann in doc.get('annotations', []):
            if ann['category_id'] not in shaft_ids or ann['image_id'] not in images:
                continue
            name = images[ann['image_id']].split('/')[-1]
            attrs = ann.get('attributes') or {}
            rows.append((name[:-4] if name.lower().endswith('.jpg') else name,
                         attrs.get('view'), attrs.get('phase')))
        phases = {p for _, _, p in rows if p}
        phaseless = len(phases) == 1 and len(rows) > 1
        for fid, view, phase in rows:
            per_frame[fid].append(dict(source=rel, view=view,
                                       phase=None if phaseless else phase))
    return per_frame


def view_bucket(views):
    """prelabel_batch.py's view_bucket(), value for value. It is a SUBSET rule, not an
    equality one -- kept as it is so the number stays comparable with the earlier rounds,
    with the raw set recorded beside it so a reader sees what the bucket flattened."""
    if not views:
        return 'unknown'
    if all(v == 'dtl' for v in views):
        return 'dtl'
    if all(v in ('dtl', 'face_on') for v in views):
        return 'face_on'
    return 'other'


def build_swings(manifests):
    swings = {}
    for entry in manifests:
        for f in entry['manifest']['frames']:
            key = f['id'].rsplit('_f', 1)[0]
            s = swings.setdefault(key, dict(
                swing=key, clip=f['clipName'], env=f['envelopeSec'], impact=f['impactSec'],
                hasConfidentImpact=f.get('hasConfidentImpact'), source=f['source'],
                slowmo=f.get('slowmo'), gate=f.get('gate'), export=entry['export'],
                exportFrames=[]))
            s['exportFrames'].append(dict(id=f['id'], tSec=f['tSec'], phase=f['phase']))
    for s in swings.values():
        s['exportFrames'].sort(key=lambda r: r['tSec'])
    return swings


def annotate_swings(swings):
    """Attach the annotated view to every swing and mark the CONTROL swings.

    S-23's pattern: a control is a row whose answer an independent human already gave, mixed
    in unmarked, so the round measures the ANNOTATOR as well as the estimator. Here that is
    a swing where a CVAT annotator marked exactly one exported envelope frame `top`, every
    pass that touched that frame agreed, and no other frame in the swing is called `top`.

    The annotated top sits on the sparse export grid (up to 7 frames per swing), not on the
    video grid, so the control question is the only one that grid can answer: is the
    annotated frame the exported frame nearest the judged interval? That needs no tolerance
    and therefore sets no threshold.

    The stricter rule -- an annotated backswing before and an annotated downswing after, so
    the turn is pinned between two independent labels -- holds for 3 of 103 swings. It is
    recorded per swing as `bracketed` and it is NOT the control rule: a control set of 3
    measures nothing.
    """
    annotations = read_annotations()
    for s in swings.values():
        views, per_frame, disagreed = set(), {}, []
        for f in s['exportFrames']:
            entries = annotations.get(f['id'], [])
            for e in entries:
                if e['view']:
                    views.add(e['view'])
            phases = {e['phase'] for e in entries if e['phase']}
            if len(phases) > 1:
                # A frame whose own annotators disagree is not a phase to score against,
                # whichever pass one declares the later one. batch-01 has two passes.
                disagreed.append(dict(frame=f['id'], phases=sorted(phases)))
                continue
            if phases:
                per_frame[f['id']] = dict(
                    tSec=f['tSec'], phase=phases.pop(),
                    sources=sorted({e['source'] for e in entries if e['phase']}))
        s['annotatedViews'] = sorted(views)
        s['viewBucket'] = view_bucket(views)
        s['annotatedPhases'] = per_frame
        s['annotatorDisagreements'] = disagreed

        tops = [(fid, v) for fid, v in per_frame.items() if v['phase'] == 'top']
        if len(tops) == 1:
            fid, v = tops[0]
            pre = [x['tSec'] for x in per_frame.values()
                   if x['tSec'] < v['tSec'] and x['phase'] in BEFORE]
            post = [x['tSec'] for x in per_frame.values()
                    if x['tSec'] > v['tSec'] and x['phase'] in AFTER]
            s['control'] = dict(frame=fid, tSec=v['tSec'], sources=v['sources'],
                                bracketed=bool(pre and post),
                                bracketSec=[max(pre), min(post)] if pre and post else None)
        else:
            s['control'] = None
        s['mirrored'] = MIRRORED_CLIPS.get(s['clip'], UNCHECKED_MIRROR)
        # Handedness is not in the data model at all (docs/shaft/STATUS.md section 4). The
        # field exists so the round can be split on it LATER, once somebody measures it. It
        # is never guessed from the image here.
        s['handedness'] = 'unknown (omatt, se STATUS.md 4)'


def prior_judgements():
    """The six swings docs/shaft/phase-audit/review.md already judged a top in, as
    docs/shaft/top-from-pose.md reads them. They go into the round UNMARKED -- that is the
    point of them: if Erik's new interval does not contain his own old answer, the six were
    never the key S-31 treated them as.

    `star` is Erik's own mark: the judged frame and the next look the same in body position
    but the club head hangs more in the NEXT frame, so his top interval is [judged, next
    exported frame] rather than the judged frame alone. Recorded as he gave it, not resolved.
    """
    return {
        '073-bd53202e_s01': dict(frame='073-bd53202e_s01_f01', answer='backswing', star=True),
        '093-2c11c3c0_s00': dict(frame='093-2c11c3c0_s00_f02', answer='backswing', star=True),
        '061-f51f439d_s00': dict(frame='061-f51f439d_s00_f01', answer='top', star=False),
        '045-224bdedb_s00': dict(frame='045-224bdedb_s00_f01', answer='top', star=False),
        '093-2c11c3c0_s01': dict(frame='093-2c11c3c0_s01_f01', answer='backswing', star=True),
        '068-db6f6eec_s00': dict(frame='068-db6f6eec_s00_f02', answer='backswing', star=True),
    }


# -- frame extraction ---------------------------------------------------------

def extract(clip_path, env, out_dir, dry_run):
    """Every decoded video frame inside [start, finish], written as 001.jpg, 002.jpg, ...

    The envelope and nothing else: the question is where the top lies INSIDE the envelope,
    and a margin would let an annotator answer with a frame no estimator can choose.
    """
    start, finish = env
    cap = cv2.VideoCapture(str(clip_path))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
    times, size, n = [], None, 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
        if t > finish + 1e-3:
            break
        if t < start - 1e-3:
            continue
        h, w = bgr.shape[:2]
        if size is None:
            size = [w, h]
        n += 1
        times.append(round(t, 4))
        if dry_run:
            continue
        long_side = max(w, h)
        if long_side > MAX_LONG_SIDE:
            scale = MAX_LONG_SIDE / long_side
            bgr = cv2.resize(bgr, (round(w * scale), round(h * scale)),
                             interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(out_dir / ('%03d.jpg' % n)), bgr,
                    [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    cap.release()
    return fps, size, times


# -- writing the package ------------------------------------------------------

def write_viewer(annotator, seed, order, dry_run):
    """One self-contained page per annotator. The round data is INLINED rather than fetched:
    a file:// page cannot fetch a sibling JSON, and the round has to run without a server.

    Everything the page is given is in this payload -- an opaque id and a frame count. The
    covariates (clip, fps, slow-mo, view, source, mirroring) stay in the registry.
    """
    payload = dict(
        annotator=annotator,
        seed='0x%08x' % seed,
        swings=[dict(id=r['id'], frames=r['frameCount']) for r in order],
    )
    html = TEMPLATE.read_text(encoding='utf-8')
    marker = 'const ROUND = /*__ROUND__*/ null;'
    if marker not in html:
        raise SystemExit('%s has lost its __ROUND__ marker' % TEMPLATE)
    html = html.replace(marker, 'const ROUND = ' + json.dumps(payload, ensure_ascii=False) + ';')
    target = OUT / annotator / 'index.html'
    if dry_run:
        print('  would write %s (%d swings)' % (target.relative_to(ROOT).as_posix(), len(order)))
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')


def guard_filled_answers(force):
    """Never rebuild on top of a filled answer file without being told to. A rebuilt round is
    a different order, and an answer file keyed to the old one is silently wrong."""
    filled = [p for p in OUT.glob('svar-*.json') if p.stat().st_size > 2]
    if filled and not force:
        raise SystemExit('answers already exist: ' + ', '.join(p.name for p in filled)
                         + ' -- rerun with --force only if you mean to discard them')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true',
                    help='derive and print the round, decode nothing, write nothing')
    ap.add_argument('--limit', type=int, default=0, help='first N swings only, for a smoke test')
    ap.add_argument('--force', action='store_true', help='rebuild over filled answer files')
    args = ap.parse_args()

    swings = build_swings(read_manifests())
    annotate_swings(swings)
    priors = prior_judgements()

    local = {p.name: p for p in CLIPS.rglob('*') if p.is_file()}
    keys = sorted(k for k, v in swings.items() if v['clip'] in local)
    missing_priors = [k for k in priors if k not in keys]
    if missing_priors:
        raise SystemExit('prior-judged swings are not in the round: ' + ', '.join(missing_priors))
    if args.limit:
        keys = keys[:args.limit]

    # Opaque ids assigned in a shuffled order, so the id carries nothing: not the clip
    # number, not the export, not the alphabet.
    ids = {k: 'S32-%03d' % (i + 1) for i, k in enumerate(shuffled(keys, SEED_IDS))}

    controls = [k for k in keys if swings[k]['control']]
    print('%d swings with a local clip, %d distinct clips'
          % (len(keys), len({swings[k]['clip'] for k in keys})))
    print('  views: ' + ', '.join('%s=%d' % kv for kv in sorted(
        collections.Counter(swings[k]['viewBucket'] for k in keys).items())))
    print('  controls (exactly one agreed annotated top): %d swings in %d clips, %d bracketed'
          % (len(controls), len({swings[k]['clip'] for k in controls}),
             sum(1 for k in controls if swings[k]['control']['bracketed'])))
    print('  prior-judged swings carried in unmarked: %d' % sum(1 for k in keys if k in priors))
    print('  slow-mo %d, own source %d, confirmed mirrored %d, no confident impact %d'
          % (sum(1 for k in keys if swings[k]['slowmo']),
             sum(1 for k in keys if swings[k]['source'] == 'own'),
             sum(1 for k in keys if swings[k]['mirrored'] != UNCHECKED_MIRROR),
             sum(1 for k in keys if not swings[k]['hasConfidentImpact'])))

    if not args.dry_run:
        guard_filled_answers(args.force)
        OUT.mkdir(parents=True, exist_ok=True)

    rows, total_frames = [], 0
    for k in keys:
        s = swings[k]
        rid = ids[k]
        fps, size, times = extract(local[s['clip']], s['env'], OUT / 'frames' / rid, args.dry_run)
        total_frames += len(times)
        row = dict(s)
        row.update(id=rid, fps=fps, size=size, frameCount=len(times), frameTimes=times,
                   isControl=bool(s['control']), priorJudgement=priors.get(k))
        rows.append(row)
        print('  %s  %3d frames' % (rid, len(times)), flush=True)

    by_id = {r['id']: r for r in rows}
    orders = {}
    for name, seed in ANNOTATORS.items():
        order = [by_id[i] for i in shuffled([r['id'] for r in rows], seed)]
        orders[name] = [r['id'] for r in order]
        write_viewer(name, seed, order, args.dry_run)

    registry = dict(
        round='S-32',
        seeds=dict(ids='0x%08x' % SEED_IDS,
                   **{n: '0x%08x' % s for n, s in ANNOTATORS.items()}),
        maxLongSide=MAX_LONG_SIDE, jpegQuality=JPEG_QUALITY,
        swingCount=len(rows), clipCount=len({r['clip'] for r in rows}),
        frameCount=total_frames, orders=orders, swings=rows)

    print('%d envelope video frames' % total_frames)
    if args.dry_run:
        print('dry run -- nothing written')
        return
    reg_dir = OUT / 'registry'
    reg_dir.mkdir(parents=True, exist_ok=True)
    (reg_dir / 'registry.json').write_text(
        json.dumps(registry, ensure_ascii=False, indent=1), encoding='utf-8')
    (reg_dir / 'OPPNA-INTE-FORE-SVAREN.md').write_text(
        '# Registret\n\n'
        '> **Oppna inte den har mappen forran bada svarsfilerna ligger i\n'
        '> `data/shaft/top-round/`.** `registry.json` bar id-kartan, kontrollraderna och de\n'
        '> sex tidigare bedomda svingarna. Den som last den har inte langre bedomt blint.\n\n'
        'Registret bar inga estimatorval. E1/E2/E3 raknas aldrig av `build_round.py` -- de\n'
        'raknas forst av `score_round.py`, efter att svaren ar inne.\n',
        encoding='utf-8')
    print('wrote %s/registry.json and two viewers' % reg_dir.relative_to(ROOT).as_posix())


if __name__ == '__main__':
    main()
