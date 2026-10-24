#!/usr/bin/env python
"""Pose parity reference for the native app (N-3.2): one still through Python's MediaPipe.

    training\\.venv-pose\\Scripts\\python.exe training/pose_parity.py

Separate venv because mediapipe pins its own numpy/protobuf (training/requirements-pose.txt).

What it does:
  1. Takes one frame from a clip (default: IMG_5410.MP4 frame 60, the shaft parity frame) or an
     image given with --image, upright as OpenCV decodes it, and writes it as a lossless PNG.
  2. Downloads the .task models from apps/mobile/modules/pose/models.json (the same table the
     app's Gradle build reads) into training/runs/pose-models/ and checks their sha256.
  3. Runs the PNG's pixels (re-read from the PNG, RGBA) through PoseLandmarker in IMAGE mode on
     CPU, lite and full, with MediaPipe's default confidences and one pose, as the app does.
  4. Writes apps/mobile/assets/parity/pose.png and pose-reference.json (33 × [x, y, z,
     visibility] per model). The app's dev screen runs the same PNG through
     PoseProbe.detectImage and compares (apps/mobile/src/parity.ts).

IMAGE mode on both sides, because VIDEO mode tracks across frames and depends on history.
Both files stay out of git (identifiable person) and Metro serves them from this machine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_JSON = REPO_ROOT / "apps" / "mobile" / "modules" / "pose" / "models.json"
MODEL_CACHE = REPO_ROOT / "training" / "runs" / "pose-models"
DEFAULT_CLIP = REPO_ROOT / "data" / "shaft" / "clips" / "own" / "IMG_5410.MP4"
DEFAULT_FRAME = 60
DEFAULT_OUT = REPO_ROOT / "apps" / "mobile" / "assets" / "parity"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_model(name: str, entry: dict) -> Path:
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    path = MODEL_CACHE / entry["file"]
    if path.exists() and sha256(path.read_bytes()) == entry["sha256"]:
        return path
    with urllib.request.urlopen(entry["url"]) as res:
        data = res.read()
    got = sha256(data)
    if got != entry["sha256"]:
        raise SystemExit("{}: sha256 {}, expected {} ({})".format(entry["file"], got, entry["sha256"], entry["url"]))
    path.write_bytes(data)
    return path


def read_frame(clip: Path, index: int) -> np.ndarray:
    cap = cv2.VideoCapture(str(clip))
    if not cap.isOpened():
        raise SystemExit("Cannot open clip {}".format(clip))
    cap.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, bgr = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("Cannot read frame {} of {}".format(index, clip.name))
    return bgr


def detect(model_path: Path, rgba: np.ndarray) -> dict:
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path), delegate=BaseOptions.Delegate.CPU),
        running_mode=RunningMode.IMAGE,
        num_poses=1,
    )
    with PoseLandmarker.create_from_options(options) as landmarker:
        result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGBA, data=rgba))
    if not result.pose_landmarks:
        return {"status": "no-pose", "landmarks": []}
    # visibility is Optional in MediaPipe; the app writes 0 when it is missing (PoseModels.pack).
    return {
        "status": "ok",
        "landmarks": [
            [lm.x, lm.y, lm.z, lm.visibility if lm.visibility is not None else 0.0]
            for lm in result.pose_landmarks[0]
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clip", type=Path, default=DEFAULT_CLIP)
    ap.add_argument("--frame", type=int, default=DEFAULT_FRAME)
    ap.add_argument("--image", type=Path, help="use this image instead of a clip frame")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    if args.image:
        bgr = cv2.imread(str(args.image), cv2.IMREAD_COLOR)
        if bgr is None:
            raise SystemExit("Cannot read {}".format(args.image))
        source = {"image": args.image.name}
    else:
        bgr = read_frame(args.clip, args.frame)
        source = {"clip": args.clip.name, "frameIndex": args.frame}

    args.out.mkdir(parents=True, exist_ok=True)
    png = args.out / "pose.png"
    if not cv2.imwrite(str(png), bgr):
        raise SystemExit("Cannot write {}".format(png))
    # Re-read what the app will decode, so both sides start from the PNG's exact pixels.
    rgba = cv2.cvtColor(cv2.imread(str(png), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGBA)
    height, width = rgba.shape[:2]

    table = json.loads(MODELS_JSON.read_text(encoding="utf-8"))
    models = {}
    for name in ("lite", "full"):
        path = fetch_model(name, table[name])
        models[name] = {"sha256": table[name]["sha256"], **detect(path, np.ascontiguousarray(rgba))}
        print("{}: {} ({} landmarks)".format(name, models[name]["status"], len(models[name]["landmarks"])))

    reference = {
        "kind": "swingcheck-pose-parity",
        "source": source,
        "image": {"file": png.name, "width": width, "height": height, "sha256": sha256(png.read_bytes())},
        "mediapipe": mp.__version__,
        "delegate": "cpu",
        "runningMode": "IMAGE",
        "models": models,
    }
    (args.out / "pose-reference.json").write_text(json.dumps(reference, indent=1), encoding="utf-8")
    print("Wrote {} ({}x{}) and pose-reference.json, mediapipe {}".format(png, width, height, mp.__version__))
    return 0


if __name__ == "__main__":
    sys.exit(main())
