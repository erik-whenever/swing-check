# SPIKE, READ-ONLY (S-31): run the SHIPPED pose model (public/models/pose_landmarker_lite.task,
# the asset `npm run pose:model` fetches) on every video frame inside each swing's envelope,
# for the swings whose source clip is in data/shaft/clips. Writes landmark coordinates only,
# to the given out dir -- never into the repo.
#
#   <venv>/python.exe docs/shaft/top-from-pose/run_pose.py <out> --manifests <export_manifests.json>
#
# PARITY with the production chain (src/lib/poseTrajectory.ts + poseDetector.ts):
#   - same .task asset, same running mode (VIDEO), num_poses = 1
#   - the RAW decoded frame at the video's native resolution is handed to the model, exactly as
#     the browser hands it the <video> element (no JPEG re-encode, unlike S-28's shaft run --
#     the shaft ONNX was trained on JPEGs, MediaPipe is not fed one in production)
#   - per-clip timeline starting at 0, strictly increasing ms timestamps
# Deviations are listed in docs/shaft/top-from-pose.md; do not "fix" them silently here.
import sys, json, time, argparse
from pathlib import Path
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

CLIPS = Path('data/shaft/clips')
MODEL = Path('public/models/pose_landmarker_lite.task')
MARGIN_SEC = 0.6  # decoded either side of the envelope so a +-0.5 s window around a top fits

ap = argparse.ArgumentParser()
ap.add_argument('out', type=Path)
ap.add_argument('--manifests', type=Path, required=True)
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--only', default='')
args = ap.parse_args()

local = {p.name: p for p in CLIPS.rglob('*') if p.is_file()}
swings = {}
for e in json.load(open(args.manifests)):
    for f in e['manifest']['frames']:
        k = f['id'].rsplit('_f', 1)[0]
        s = swings.setdefault(k, dict(clip=f['clipName'], env=f['envelopeSec'], impact=f['impactSec'],
                                      source=f['source'], slowmo=f.get('slowmo'), gate=f.get('gate'),
                                      frames=[]))
        s['frames'].append(dict(id=f['id'], t=f['tSec'], phase=f['phase']))
todo = sorted(k for k, v in swings.items() if v['clip'] in local)
if args.only:
    todo = [k for k in todo if k in set(args.only.split(','))]
if args.limit:
    todo = todo[:args.limit]

args.out.mkdir(parents=True, exist_ok=True)
print(f'{len(todo)} swings', flush=True)

for k in todo:
    target = args.out / f'{k}.json'
    if target.exists():
        continue
    v = swings[k]
    start, finish = v['env']
    lo, hi = max(0.0, start - MARGIN_SEC), finish + MARGIN_SEC
    t0 = time.perf_counter()
    # A COLD landmarker per swing: VIDEO mode is a tracking mode, and state from the previous
    # clip must not seed this one (same reason resetPoseLandmarker() exists in production).
    lm = PoseLandmarker.create_from_options(PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL)),
        running_mode=RunningMode.VIDEO, num_poses=1))
    cap = cv2.VideoCapture(str(local[v['clip']]))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    cap.set(cv2.CAP_PROP_POS_MSEC, lo * 1000)
    rows, decode_s, detect_s, last_ms = [], 0.0, 0.0, -1
    w = h = 0
    while True:
        a = time.perf_counter()
        ok, bgr = cap.read()
        if not ok:
            break
        t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
        if t > hi + 1e-3:
            break
        if t < lo - 1e-3:
            decode_s += time.perf_counter() - a
            continue
        h, w = bgr.shape[:2]
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        b_ = time.perf_counter(); decode_s += b_ - a
        ts = int(round(t * 1000))
        if ts <= last_ms:
            ts = last_ms + 1
        last_ms = ts
        res = lm.detect_for_video(img, ts)
        r = dict(t=t, inEnv=(start - 1e-3 <= t <= finish + 1e-3))
        if res.pose_landmarks:
            pts = res.pose_landmarks[0]
            wrists = {}
            for i in (15, 16):
                p = pts[i]
                wrists[str(i)] = [round(p.x, 5), round(p.y, 5), round(p.z, 5), round(p.visibility, 5),
                                  round(p.presence, 5)]
            # a few extra landmarks, for reference only -- no estimator below reads them
            extra = {}
            for i in (11, 12, 23, 24):
                p = pts[i]
                extra[str(i)] = [round(p.x, 5), round(p.y, 5), round(p.visibility, 5), round(p.presence, 5)]
            r.update(w=wrists, x=extra)
        rows.append(r)
        detect_s += time.perf_counter() - b_
    cap.release()
    lm.close()
    wall = time.perf_counter() - t0
    json.dump(dict(swing=k, clip=v['clip'], fps=fps, env=v['env'], impact=v['impact'], source=v['source'],
                   slowmo=v['slowmo'], gate=v['gate'], size=[w, h], envFrames=v['frames'], frames=rows,
                   wall_s=wall, decode_s=decode_s, detect_s=detect_s), open(target, 'w'))
    print(f'{k}: {len(rows)} frames ({sum(1 for r in rows if r["inEnv"])} in env), '
          f'{wall:.1f} s ({detect_s:.1f} detect, {decode_s:.1f} decode)', flush=True)
