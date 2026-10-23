#!/usr/bin/env python
"""Convert shaft-v2.onnx to TFLite (same weights, no retraining) and write the parity fixture.

    training\\.venv-tflite\\Scripts\\python.exe training/export_tflite.py

Separate venv because onnx2tf pins its own TensorFlow/onnx stack (training/requirements-tflite.txt).

What it does:
  1. Converts the ONNX graph with onnx2tf (NCHW -> NHWC input, float32 and float16 TFLite).
  2. Picks one frame from a clip where the ONNX model finds the club with both keypoints,
     letterboxes it exactly like Ultralytics/`letterbox.ts` (size 960, pad 114).
  3. Runs that one tensor through ONNX Runtime and both TFLite files on CPU and decodes all
     three with a port of `shaftPostprocess.selectBest`.
  4. Writes the fixture the spike app (N-2) reads: the letterboxed frame as raw RGB bytes and
     reference.json with the ONNX points, the TFLite-CPU points, and the output layout.

The fixture is raw, already-letterboxed pixels on purpose: the app then needs no JPEG decoder
and no resize, so any deviation it reports is the model runtime (TFLite + Core ML delegate),
not image decoding. The frame and the models stay out of git (identifiable person, 12 MB).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ONNX = REPO_ROOT / "public" / "models" / "shaft-v2.onnx"
DEFAULT_CLIP = REPO_ROOT / "data" / "shaft" / "clips" / "own" / "IMG_5410.MP4"
DEFAULT_OUT = REPO_ROOT / "apps" / "spike" / "assets"

SIZE = 960
PAD_VALUE = 114
# Mirrors packages/core/src/lib/shaft/shaftPostprocess.ts.
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
KEYPOINT_THRESHOLD = 0.5
BOX_CHANNELS = 5
CHANNELS_PER_KEYPOINT = 3
KEYPOINT_NAMES = ["butt", "hosel", "toe", "heel"]

# Frame choice: confident box and both shaft keypoints visible, so the parity numbers are
# about a real detection and not about noise around a threshold.
PICK_MIN_BOX_CONF = 0.7
PICK_STEP = 5


# ---------------------------------------------------------------------------
# Letterbox + decode (ports of letterbox.ts / shaftPostprocess.ts)
# ---------------------------------------------------------------------------

def letterbox(img_rgb: np.ndarray, size: int = SIZE):
    h, w = img_rgb.shape[:2]
    scale = min(size / w, size / h)
    draw_w, draw_h = round(w * scale), round(h * scale)
    pad_x = max(0, round((size - draw_w) / 2 - 0.1))
    pad_y = max(0, round((size - draw_h) / 2 - 0.1))
    out = np.full((size, size, 3), PAD_VALUE, dtype=np.uint8)
    resized = cv2.resize(img_rgb, (draw_w, draw_h), interpolation=cv2.INTER_LINEAR)
    out[pad_y:pad_y + draw_h, pad_x:pad_x + draw_w] = resized
    transform = {"size": size, "scale": scale, "padX": pad_x, "padY": pad_y,
                 "drawWidth": draw_w, "drawHeight": draw_h}
    return out, transform


def model_to_image(t: dict, x: float, y: float):
    return (x - t["padX"]) / t["scale"], (y - t["padY"]) / t["scale"]


def _iou(a, b) -> float:
    w = min(a["x2"], b["x2"]) - max(a["x1"], b["x1"])
    h = min(a["y2"], b["y2"]) - max(a["y1"], b["y1"])
    if w <= 0 or h <= 0:
        return 0.0
    overlap = w * h
    area_a = max(0, a["x2"] - a["x1"]) * max(0, a["y2"] - a["y1"])
    area_b = max(0, b["x2"] - b["x1"]) * max(0, b["y2"] - b["y1"])
    union = area_a + area_b - overlap
    return overlap / union if union > 0 else 0.0


def select_best(out_cn: np.ndarray):
    """`out_cn` is [C, N], channel-major like the TS decoder reads it."""
    channels, _ = out_cn.shape
    keypoints = (channels - BOX_CHANNELS) // CHANNELS_PER_KEYPOINT
    idx = np.nonzero(out_cn[4] >= CONF_THRESHOLD)[0]
    cands = []
    for i in idx:
        cx, cy, w, h, conf = (float(v) for v in out_cn[:5, i])
        c = {"x1": cx - w / 2, "y1": cy - h / 2, "x2": cx + w / 2, "y2": cy + h / 2, "conf": conf}
        for k in range(len(KEYPOINT_NAMES)):
            if k < keypoints:
                base = BOX_CHANNELS + CHANNELS_PER_KEYPOINT * k
                c[KEYPOINT_NAMES[k]] = {"x": float(out_cn[base, i]), "y": float(out_cn[base + 1, i]),
                                        "score": float(out_cn[base + 2, i])}
            else:
                c[KEYPOINT_NAMES[k]] = None
        cands.append(c)
    cands.sort(key=lambda c: -c["conf"])
    kept = []
    for c in cands:
        if all(_iou(k, c) <= IOU_THRESHOLD for k in kept):
            kept.append(c)
    return kept[0] if kept else None, keypoints


def to_cn(raw: np.ndarray, channels_hint: int | None = None) -> tuple[np.ndarray, str]:
    """Squeeze the batch dim and return [C, N] plus the layout the graph emitted."""
    a = np.squeeze(raw, axis=0)
    if a.shape[0] < a.shape[1]:
        return a, "CN"
    return a.T, "NC"


def points(best, keypoints: int, t: dict):
    if best is None:
        return None
    out = {"boxConf": best["conf"]}
    for name in KEYPOINT_NAMES[:keypoints]:
        kp = best[name]
        sx, sy = model_to_image(t, kp["x"], kp["y"])
        out[name] = {"modelX": kp["x"], "modelY": kp["y"], "x": sx, "y": sy, "score": kp["score"]}
    return out


def deviation(ref, other, keypoints: int):
    """Per keypoint: Euclidean distance in source px and model px."""
    if ref is None or other is None:
        return None
    res = {}
    for name in KEYPOINT_NAMES[:keypoints]:
        a, b = ref[name], other[name]
        res[name] = {"sourcePx": float(np.hypot(a["x"] - b["x"], a["y"] - b["y"])),
                     "modelPx": float(np.hypot(a["modelX"] - b["modelX"], a["modelY"] - b["modelY"]))}
    return res


# ---------------------------------------------------------------------------
# Runtimes
# ---------------------------------------------------------------------------

def onnx_session(path: Path):
    import onnxruntime as ort
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def run_onnx(sess, frame_hwc_u8: np.ndarray) -> np.ndarray:
    x = (frame_hwc_u8.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
    return sess.run(None, {sess.get_inputs()[0].name: x})[0]


def run_tflite(path: Path, frame_hwc_u8: np.ndarray) -> tuple[np.ndarray, dict]:
    _shim_ai_edge_litert()
    from ai_edge_litert.interpreter import Interpreter
    interp = Interpreter(model_path=str(path))
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    out = interp.get_output_details()[0]
    x = (frame_hwc_u8.astype(np.float32) / 255.0)[None]
    if list(inp["shape"]) != list(x.shape):
        raise SystemExit("TFLite input {} != expected NHWC {}".format(list(inp["shape"]), list(x.shape)))
    interp.set_tensor(inp["index"], x.astype(inp["dtype"]))
    interp.invoke()
    io = {"input": {"shape": [int(v) for v in inp["shape"]], "dtype": str(np.dtype(inp["dtype"]))},
          "output": {"shape": [int(v) for v in out["shape"]], "dtype": str(np.dtype(out["dtype"]))}}
    return interp.get_tensor(out["index"]), io


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

def _shim_ai_edge_litert() -> None:
    """onnx2tf imports `ai_edge_litert.interpreter`, which has no Windows wheel. TensorFlow
    2.19 ships the same interpreter, so point the module name there before onnx2tf loads."""
    try:
        import ai_edge_litert.interpreter  # noqa: F401
        return
    except ImportError:
        pass
    import types
    from tensorflow.lite.python import interpreter as tfl
    pkg = types.ModuleType("ai_edge_litert")
    pkg.interpreter = tfl
    sys.modules["ai_edge_litert"] = pkg
    sys.modules["ai_edge_litert.interpreter"] = tfl


def convert(onnx_path: Path, models_dir: Path, sample_hwc_u8: np.ndarray) -> dict[str, Path]:
    _shim_ai_edge_litert()
    import onnx2tf
    import onnx2tf.onnx2tf as o2t
    # onnx2tf checks its conversion on a sample batch it downloads from GitHub (a pickled
    # .npy). Hand it our own letterboxed frame instead: no network, no pickle, and the
    # check runs on a real club rather than on stock photos.
    sample = (sample_hwc_u8.astype(np.float32) / 255.0)[None]
    o2t.download_test_image_data = lambda: sample
    models_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        onnx2tf.convert(input_onnx_file_path=str(onnx_path), output_folder_path=tmp,
                        non_verbose=True)
        stem = onnx_path.stem
        result = {}
        for variant in ("float32", "float16"):
            src = Path(tmp) / "{}_{}.tflite".format(stem, variant)
            if not src.is_file():
                raise SystemExit("onnx2tf wrote no {}".format(src.name))
            dst = models_dir / "{}-{}.tflite".format(stem, variant)
            shutil.copyfile(src, dst)
            result[variant] = dst
    return result


def pick_frame(clip: Path, sess):
    cap = cv2.VideoCapture(str(clip))
    if not cap.isOpened():
        raise SystemExit("Cannot open clip {}".format(clip))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    best_pick = None
    for index in range(0, total, PICK_STEP):
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, bgr = cap.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        frame, t = letterbox(rgb)
        best, kps = select_best(to_cn(run_onnx(sess, frame))[0])
        if best is None or best["conf"] < PICK_MIN_BOX_CONF:
            continue
        if all(best[n]["score"] >= KEYPOINT_THRESHOLD for n in KEYPOINT_NAMES[:kps]):
            best_pick = (index, rgb, frame, t)
            break
    cap.release()
    if best_pick is None:
        raise SystemExit("No frame in {} with box >= {} and visible keypoints".format(
            clip.name, PICK_MIN_BOX_CONF))
    return best_pick


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--onnx", type=Path, default=DEFAULT_ONNX)
    p.add_argument("--clip", type=Path, default=DEFAULT_CLIP)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT,
                   help="Writes models/ and parity/ under this folder (default: apps/spike/assets)")
    args = p.parse_args()

    sess = onnx_session(args.onnx)
    index, rgb, frame, t = pick_frame(args.clip, sess)
    models = convert(args.onnx, args.out / "models", frame)

    onnx_cn, onnx_layout = to_cn(run_onnx(sess, frame))
    onnx_best, kps = select_best(onnx_cn)
    ref = points(onnx_best, kps, t)

    report = {
        "source": {"clip": args.clip.name, "frameIndex": index,
                   "width": int(rgb.shape[1]), "height": int(rgb.shape[0])},
        "letterbox": t,
        "frameFile": "frame960.rgb",
        "frameFormat": "uint8 RGB, HWC, 960x960, already letterboxed; feed /255 as float32 NHWC",
        "onnx": {"file": args.onnx.name, "sha256": sha256(args.onnx), "outputLayout": onnx_layout,
                 "points": ref},
        "keypoints": kps,
        "tflite": {},
    }
    for variant, path in models.items():
        raw, io = run_tflite(path, frame)
        cn, layout = to_cn(raw)
        best, _ = select_best(cn)
        pts = points(best, kps, t)
        report["tflite"][variant] = {
            "file": path.name, "sha256": sha256(path), "io": io, "outputLayout": layout,
            "maxAbsDiffVsOnnx": float(np.max(np.abs(cn - onnx_cn))),
            "points": pts, "deviationVsOnnx": deviation(ref, pts, kps),
        }

    parity = args.out / "parity"
    parity.mkdir(parents=True, exist_ok=True)
    (parity / "frame960.rgb").write_bytes(np.ascontiguousarray(frame).tobytes())
    (parity / "reference.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print("frame {} of {} ({}x{}), box conf {:.3f}".format(
        index, args.clip.name, rgb.shape[1], rgb.shape[0], ref["boxConf"]))
    for variant, r in report["tflite"].items():
        dev = r["deviationVsOnnx"]
        devs = ", ".join("{} {:.3f} px".format(n, d["sourcePx"]) for n, d in dev.items()) if dev else "NO DETECTION"
        print("{:8s} {}  out {} {}  maxAbsDiff {:.4f}  {}".format(
            variant, r["file"], r["io"]["output"]["shape"], r["outputLayout"],
            r["maxAbsDiffVsOnnx"], devs))
    print("wrote {}".format(parity))
    return 0


if __name__ == "__main__":
    sys.exit(main())
