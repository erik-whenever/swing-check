# ONE-OFF, READ-ONLY (S-35): run the shipped pose model over the WHOLE clip, not just the
# envelopes. Writes landmark coordinates to the given out dir -- never into the repo.
#
#   <venv>/python.exe docs/shaft/top-review/run_pose_clip.py <out>
#       [--registry data/shaft/top-round/registry/registry.json] [--only 054.mp4,...]
#
# WHY A SECOND RUNNER. docs/shaft/top-from-pose/run_pose.py decodes one SWING's envelope
# (plus 0.6 s either side). Part D of S-35 asks the opposite question -- is there a swing in
# a clip that NO envelope covers? -- and that cannot be answered from frames the envelopes
# already chose. This runner is the same model, the same options and the same output row
# shape, over the whole file; run_pose.py is NOT edited, so S-31/S-33/S-34 keep running on
# exactly the script they ran on.
#
# PARITY with run_pose.py (and so with src/lib/poseTrajectory.ts):
#   - same public/models/pose_landmarker_lite.task, RunningMode.VIDEO, num_poses = 1
#   - the RAW decoded frame at native resolution, no JPEG re-encode
#   - a COLD landmarker per clip, strictly increasing ms timestamps
# DEVIATION, stated rather than hidden: run_pose.py creates a cold landmarker per SWING and
# starts decoding 0.6 s before that swing's envelope; this one creates it once per CLIP and
# starts at t=0, so inside an envelope the tracker has seen a longer history. Whether that
# moves a landmark is not assumed -- clip_swings.py re-scores E3 on these frames and prints
# the agreement with the envelope run before anything else is read.
#
# NOTHING IS DECIDED HERE. No estimator, no threshold, no production code read or written.
import argparse, json, time
from pathlib import Path
import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

CLIPS = Path('data/shaft/clips')
MODEL = Path('public/models/pose_landmarker_lite.task')

ap = argparse.ArgumentParser()
ap.add_argument('out', type=Path)
ap.add_argument('--registry', type=Path,
                default=Path('data/shaft/top-round/registry/registry.json'))
ap.add_argument('--only', default='')
args = ap.parse_args()

reg = json.loads(args.registry.read_text(encoding='utf-8'))
local = {p.name: p for p in CLIPS.rglob('*') if p.is_file()}
clips = sorted({s['clip'] for s in reg['swings']})
if args.only:
    want = set(args.only.split(','))
    clips = [c for c in clips if c in want]
missing = [c for c in clips if c not in local]
if missing:
    print('VARNING: %d klipp saknas lokalt: %s' % (len(missing), ', '.join(missing)))
clips = [c for c in clips if c in local]

args.out.mkdir(parents=True, exist_ok=True)
print('%d klipp' % len(clips), flush=True)

for c in clips:
    target = args.out / ('%s.json' % c.replace('.', '_'))
    if target.exists():
        continue
    t0 = time.perf_counter()
    lm = PoseLandmarker.create_from_options(PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL)),
        running_mode=RunningMode.VIDEO, num_poses=1))
    cap = cv2.VideoCapture(str(local[c]))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    rows, last_ms, w, h = [], -1, 0, 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
        hh, ww = bgr.shape[:2]
        h, w = hh, ww
        img = mp.Image(image_format=mp.ImageFormat.SRGB,
                       data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        ts = int(round(t * 1000))
        if ts <= last_ms:
            ts = last_ms + 1
        last_ms = ts
        res = lm.detect_for_video(img, ts)
        r = dict(t=t)
        if res.pose_landmarks:
            pts = res.pose_landmarks[0]
            r['w'] = {str(i): [round(pts[i].x, 5), round(pts[i].y, 5), round(pts[i].z, 5),
                               round(pts[i].visibility, 5), round(pts[i].presence, 5)]
                      for i in (15, 16)}
            r['x'] = {str(i): [round(pts[i].x, 5), round(pts[i].y, 5),
                               round(pts[i].visibility, 5), round(pts[i].presence, 5)]
                      for i in (11, 12, 23, 24)}
        rows.append(r)
    cap.release()
    lm.close()
    envs = sorted((s['env'], s['id']) for s in reg['swings'] if s['clip'] == c)
    json.dump(dict(clip=c, fps=fps, size=[w, h], nframes=len(rows),
                   envs=[dict(id=i, env=e) for e, i in envs], frames=rows,
                   wall_s=time.perf_counter() - t0), open(target, 'w'))
    print('%s: %d rutor, %.1f s' % (c, len(rows), time.perf_counter() - t0), flush=True)
