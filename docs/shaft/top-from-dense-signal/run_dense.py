# SPIKE, READ-ONLY (S-28): run the shipped detector (shaft-v2, production thresholds) on EVERY
# video frame inside each swing's envelope, for the swings whose source clip is in data/shaft/clips.
# Writes coordinates only, to the given out dir -- never into the repo.
#
#   training/.venv/Scripts/python.exe docs/shaft/top-from-dense-signal/run_dense.py <out> [--limit N] [--only id,id]
#
# Decoding follows trace_swing.py: container timestamps (CAP_PROP_POS_MSEC read after the grab),
# and each frame is JPEG re-encoded before detection so the model sees the kind of image it was
# trained on. Detection and thresholds are prelabel_batch.py's own functions, imported.
import sys, json, time, math, argparse
from pathlib import Path
sys.path.insert(0, str(Path('training').resolve()))
import numpy as np, cv2, onnxruntime as ort
from prelabel_batch import preprocess, select_best, model_to_image, DEFAULT_MODEL, DEFAULT_CONF

CLIPS = Path('data/shaft/clips')

ap = argparse.ArgumentParser()
ap.add_argument('out', type=Path)
ap.add_argument('--manifests', type=Path, required=True, help='export_manifests.json from run_detector.py')
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--only', default='')
args = ap.parse_args()

local = {p.name: p for p in CLIPS.rglob('*') if p.is_file()}
swings = {}
for e in json.load(open(args.manifests)):
    for f in e['manifest']['frames']:
        k = f['id'].rsplit('_f', 1)[0]
        swings.setdefault(k, dict(clip=f['clipName'], env=f['envelopeSec']))
todo = sorted(k for k, v in swings.items() if v['clip'] in local)
if args.only:
    todo = [k for k in todo if k in set(args.only.split(','))]
if args.limit:
    todo = todo[:args.limit]

session = ort.InferenceSession(str(DEFAULT_MODEL), providers=['CPUExecutionProvider'])
imgsz = session.get_inputs()[0].shape[2]
args.out.mkdir(parents=True, exist_ok=True)

for k in todo:
    target = args.out / f'{k}.json'
    if target.exists():
        continue
    v = swings[k]
    start, finish = v['env']
    t0 = time.perf_counter()
    cap = cv2.VideoCapture(str(local[v['clip']]))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, start - 0.2) * 1000)
    rows, decode_s, detect_s = [], 0.0, 0.0
    while True:
        a = time.perf_counter()
        ok, bgr = cap.read()
        if not ok:
            break
        t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
        if t > finish + 1e-3:
            break
        if t < start - 1e-3:
            decode_s += time.perf_counter() - a
            continue
        img = cv2.imdecode(cv2.imencode('.jpg', bgr)[1], cv2.IMREAD_COLOR)
        b_ = time.perf_counter(); decode_s += b_ - a
        h = img.shape[0]
        tensor, s, px, py = preprocess(img, imgsz)
        raw = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]
        best = select_best(raw, DEFAULT_CONF)
        r = dict(t=t)
        if best:
            bx, by = model_to_image(s, px, py, *best['butt']); hx, hy = model_to_image(s, px, py, *best['hosel'])
            r.update(conf=best['conf'], bs=best['butt_score'], hs=best['hosel_score'], bx=bx, by=by, hx=hx, hy=hy,
                     len_frac=math.dist((bx, by), (hx, hy)) / h)
        rows.append(r)
        detect_s += time.perf_counter() - b_
    cap.release()
    wall = time.perf_counter() - t0
    json.dump(dict(swing=k, clip=v['clip'], fps=fps, env=v['env'], frames=rows,
                   wall_s=wall, decode_s=decode_s, detect_s=detect_s), open(target, 'w'))
    print(f'{k}: {len(rows)} frames, {wall:.1f} s ({detect_s:.1f} detect, {decode_s:.1f} decode)', flush=True)
