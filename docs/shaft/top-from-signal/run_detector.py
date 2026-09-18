# SPIKE, READ-ONLY (S-27): run the shipped detector (shaft-v2, production thresholds) on every
# envelope frame in data/shaft/exports. Writes coordinates only, to the given out dir -- never into the repo.
import sys, json, zipfile, math, csv
from pathlib import Path
sys.path.insert(0, str(Path('training').resolve()))
import numpy as np, cv2, onnxruntime as ort
from prelabel_batch import preprocess, select_best, model_to_image, DEFAULT_MODEL, DEFAULT_CONF, MIN_SHAFT_FRACTION
out = Path(sys.argv[1])
session = ort.InferenceSession(str(DEFAULT_MODEL), providers=['CPUExecutionProvider'])
imgsz = session.get_inputs()[0].shape[2]
rows = []; meta = []
for z in sorted(Path('data/shaft/exports').glob('*.zip')):
    with zipfile.ZipFile(z) as zf:
        man = json.loads(zf.read('manifest.json'))
        meta.append(dict(export=z.name, manifest=man))
        names = [n for n in zf.namelist() if n.startswith('frames/') and n.endswith('.jpg')]
        for i, n in enumerate(names):
            img = cv2.imdecode(np.frombuffer(zf.read(n), np.uint8), cv2.IMREAD_COLOR)
            h, w = img.shape[:2]
            t, s, px, py = preprocess(img, imgsz)
            raw = session.run(None, {session.get_inputs()[0].name: t})[0][0]
            b = select_best(raw, DEFAULT_CONF)
            r = dict(export=z.name, id=n[7:-4], w=w, h=h)
            if b:
                bx, by = model_to_image(s, px, py, *b['butt']); hx, hy = model_to_image(s, px, py, *b['hosel'])
                r.update(conf=b['conf'], bs=b['butt_score'], hs=b['hosel_score'], bx=bx, by=by, hx=hx, hy=hy,
                         len_frac=math.dist((bx, by), (hx, hy)) / h)
            rows.append(r)
        print(z.name, len(names), flush=True)
out.mkdir(exist_ok=True)
json.dump(rows, open(out / 'detections.json', 'w'))
json.dump(meta, open(out / 'export_manifests.json', 'w'))
print('frames', len(rows), 'imgsz', imgsz, 'model', DEFAULT_MODEL.name)
