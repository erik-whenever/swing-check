"""ONE-OFF (S-45): build the blind slag-vs-provsving package from segment_clips.cjs output.

    <venv>/python.exe docs/shaft/practice-review/build_package.py \
        data/shaft/practice-review/segments.json data/shaft/clips/own data/shaft/practice-review

Reads ONLY the accepted envelopes production's `detectSessionSwings` returned (rejected
candidates and missed swings are out of scope for this step). Per swing it writes every
decoded video frame from envelope start - MARGIN_SEC to finish + MARGIN_SEC as
frames/<id>/001.jpg, ... and fills viewer.html into erik/index.html.

Blinding: ids P45-001... are handed out in a mulberry32/Fisher-Yates shuffle (the same
generator as S-32's build_round.py, imported, so a printed seed means the same thing), and
the view shows swings in id order. The view gets an id, a frame count it never prints, and a
playback interval -- no clip name, no seconds, no envelope length, no segmenter flag. The
mapping lives in key.json, a separate file.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'top-review'))
from build_round import shuffled  # noqa: E402  (mulberry32 Fisher-Yates, S-32)

SEED = 0x45A1C0DE
MARGIN_SEC = 1.0
MAX_PLAY_FPS = 60  # a 120 fps clip is thinned to every 2nd frame; nothing is interpolated
LONG_SIDE = 960
JPEG_QUALITY = 88
HERE = Path(__file__).resolve().parent


def write_frames(clip_path, t0, t1, out_dir):
    cap = cv2.VideoCapture(str(clip_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, math.ceil(fps / MAX_PLAY_FPS))
    out_dir.mkdir(parents=True, exist_ok=True)
    n, k = 0, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if t > t1:
            break
        if t < t0:
            continue
        k += 1
        if (k - 1) % step:
            continue
        h, w = frame.shape[:2]
        scale = min(1.0, LONG_SIDE / max(h, w))
        if scale < 1.0:
            frame = cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        n += 1
        cv2.imwrite(str(out_dir / f'{n:03d}.jpg'), frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    cap.release()
    return n, fps, step


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('segments')
    ap.add_argument('clipDir')
    ap.add_argument('outDir')
    args = ap.parse_args()
    seg = json.loads(Path(args.segments).read_text(encoding='utf-8'))
    out = Path(args.outDir)
    clip_dir = Path(args.clipDir)

    flat = []
    for r in seg['results']:
        for n, s in enumerate(r['swings']):
            flat.append(dict(clip=r['clip'], swingIndex=n, timeStretched=r['timeStretched'],
                             clipDurationSec=r['durationSec'], **s))
    order = shuffled(flat, SEED)

    frames_root = out / 'frames'
    if frames_root.exists():
        shutil.rmtree(frames_root)
    key, view = [], []
    for n, s in enumerate(order, 1):
        sid = f'P45-{n:03d}'
        t0 = max(0.0, s['envStartSec'] - MARGIN_SEC)
        t1 = s['envFinishSec'] + MARGIN_SEC
        count, fps, step = write_frames(clip_dir / s['clip'], t0, t1, frames_root / sid)
        if count == 0:
            raise SystemExit(f'{sid} ({s["clip"]}): no frames decoded in [{t0:.2f}, {t1:.2f}]')
        ms = round(1000 * step / fps)
        view.append(dict(id=sid, frames=count, ms=ms))
        key.append(dict(id=sid, windowSec=[t0, t1], frames=count, videoFps=fps, frameStep=step, **s))
        print(f'{sid}: {count} frames', flush=True)

    zero = [r['clip'] for r in seg['results'] if not r['swings']]
    (out / 'key.json').write_text(json.dumps(dict(
        round='S-45', seed=f'0x{SEED:08x}', marginSec=MARGIN_SEC,
        clips=len(seg['results']), swings=len(key), zeroSwingClips=zero, key=key,
    ), indent=1), encoding='utf-8')

    round_ = dict(annotator='erik', seed=f'0x{SEED:08x}', swings=view)
    html = (HERE / 'viewer.html').read_text(encoding='utf-8')
    html = html.replace('/*__ROUND__*/ null', json.dumps(round_))
    (out / 'erik').mkdir(parents=True, exist_ok=True)
    (out / 'erik' / 'index.html').write_text(html, encoding='utf-8')
    print(f'clips {len(seg["results"])}, swings {len(key)}, zero-swing clips {len(zero)}, seed 0x{SEED:08x}')


if __name__ == '__main__':
    main()
