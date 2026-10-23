# ONE-OFF (S-49): the own-clips-stability tracker (python-mediapipe, run_pose_clip.py's
# exact options) at native fps and decimated to 15 fps, written in extract_browser.cjs's
# sample format so the SAME JS segmenter reads both.
#
#   data/shaft/top-review/.venv/Scripts/python.exe docs/shaft/fps-missed/extract_python.py \
#       <clipDir> <outDir> <clip,clip,...>
#
# PARITY with run_pose_clip.py (not imported: it is registry-driven): same model, VIDEO
# mode, num_poses 1, raw decoded frame, cold landmarker per clip AND per config, strictly
# increasing ms timestamps, t from CAP_PROP_POS_MSEC. py15 feeds the landmarker only
# every k-th decoded frame, k = round(fps / 15), so the tracker sees the 15 fps sequence,
# not a 30 fps run read back at 15.
import json, sys
from pathlib import Path
import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

MODEL = 'public/models/pose_landmarker_lite.task'
clip_dir, out_dir, only = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3].split(',')
out_dir.mkdir(parents=True, exist_ok=True)

for clip in only:
    for config in ('pyNative', 'py15'):
        target = out_dir / ('%s.%s.json' % (clip.replace('.', '_'), config))
        if target.exists():
            continue
        lm = PoseLandmarker.create_from_options(PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL),
            running_mode=RunningMode.VIDEO, num_poses=1))
        cap = cv2.VideoCapture(str(clip_dir / clip))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        step = 1 if config == 'pyNative' else max(1, round(fps / 15))
        samples, last_ms, k = [], -1, 0
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
            k += 1
            if (k - 1) % step:
                continue
            img = mp.Image(image_format=mp.ImageFormat.SRGB,
                           data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            ts = int(round(t * 1000))
            if ts <= last_ms:
                ts = last_ms + 1
            last_ms = ts
            res = lm.detect_for_video(img, ts)
            landmarks = [None] * 17
            if res.pose_landmarks:
                for i in (15, 16):
                    p = res.pose_landmarks[0][i]
                    landmarks[i] = dict(x=p.x, y=p.y, z=p.z, visibility=p.visibility)
            else:
                landmarks = []
            samples.append(dict(t=t, landmarks=landmarks))
        cap.release()
        lm.close()
        json.dump(dict(clip=clip, config=config, videoFps=fps, samples=samples), open(target, 'w'))
        print('%s %s: %d samples @ video %.2f fps' % (clip, config, len(samples), fps), flush=True)
