#!/usr/bin/env python
"""Export a YOLOv8n-pose checkpoint to ONNX and verify numerically.

    py -3.11 training/export_onnx.py --weights training/runs/shaft-v1/weights/best.pt
    py -3.11 training/export_onnx.py --weights ... --imgsz 1280 --opset 17 --out shaft.onnx

After export, the script:
  1. Loads the ONNX file with onnxruntime on CPU.
  2. Pulls the first frame from data/shaft/calibration/calibration.zip.
  3. Runs it through BOTH the PyTorch model (on CPU) and the ONNX session.
  4. Compares outputs element-wise; exits 1 if max absolute difference exceeds
     MAX_ABS_DIFF.  A silent broken export is the worst outcome here.
  5. Reads the channel count off the exported graph and says WHICH keypoint schema it
     implements, so a two-point checkpoint cannot be shipped as a four-point model
     without anyone noticing.  See `describe_channels`.
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shaft_coco import KEYPOINT_NAMES, LEGACY_KEYPOINT_NAMES  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
CALIBRATION_ZIP = REPO_ROOT / "data" / "shaft" / "calibration" / "calibration.zip"

#: Box (cx, cy, w, h) plus objectness.  Everything after this is keypoints.
BOX_CHANNELS = 5
#: Per keypoint: x, y, visibility.
CHANNELS_PER_KEYPOINT = 3
#: What a four-point export must emit: 5 + 4 x 3.
EXPECTED_CHANNELS = BOX_CHANNELS + CHANNELS_PER_KEYPOINT * len(KEYPOINT_NAMES)
#: What every checkpoint trained before the schema change emits: 5 + 2 x 3.  Still a
#: valid thing to export -- shaft-v2 is one -- so it is named, not treated as corruption.
LEGACY_CHANNELS = BOX_CHANNELS + CHANNELS_PER_KEYPOINT * len(LEGACY_KEYPOINT_NAMES)

# Threshold for float32 round-trip through ONNX simplification.
# onnxslim introduces single-element noise in the 1e-3 range; real export corruption
# (wrong operator mapping, missing graph nodes) shows diffs of 0.1 or more.
MAX_ABS_DIFF = 1e-2


# ---------------------------------------------------------------------------
# Checkpoint helpers
# ---------------------------------------------------------------------------

def _read_imgsz_from_ckpt(weights: Path) -> int:
    import torch

    ckpt = torch.load(str(weights), map_location="cpu", weights_only=False)
    for key in ("train_args", "args"):
        args = ckpt.get(key)
        if isinstance(args, dict):
            v = args.get("imgsz")
            if v is not None:
                return int(v)
        # Ultralytics sometimes stores an argparse.Namespace
        if hasattr(args, "imgsz"):
            return int(args.imgsz)
    raise SystemExit(
        "Cannot read imgsz from checkpoint — pass --imgsz explicitly.\n"
        "  Checkpoint keys: {}".format(list(ckpt.keys()))
    )


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _pick_calibration_frame() -> bytes:
    """Return JPEG bytes of the first frame found in the calibration ZIP."""
    if not CALIBRATION_ZIP.is_file():
        raise SystemExit("Calibration ZIP not found: {}".format(CALIBRATION_ZIP))
    with zipfile.ZipFile(CALIBRATION_ZIP) as zf:
        for name in sorted(zf.namelist()):
            if name.startswith("frames/") and name.endswith(".jpg"):
                return zf.read(name)
    raise SystemExit("No frames/*.jpg in {}".format(CALIBRATION_ZIP))


def _preprocess(jpeg_bytes: bytes, imgsz: int):
    """Decode JPEG → float32 [1, 3, imgsz, imgsz] in 0–1 range (RGB)."""
    import cv2
    import numpy as np

    buf = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    img_bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise SystemExit("cv2.imdecode failed on calibration image")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (imgsz, imgsz), interpolation=cv2.INTER_LINEAR)
    arr = img_resized.astype(np.float32) / 255.0
    return arr.transpose(2, 0, 1)[None]  # HWC → NCHW [1, 3, H, W]


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def _run_pytorch(weights: Path, img_np) -> "np.ndarray":
    """Raw forward pass on CPU; returns the primary prediction array."""
    import numpy as np
    import torch
    from ultralytics import YOLO

    model = YOLO(str(weights))
    pt = model.model.to("cpu").eval()
    img_t = torch.from_numpy(img_np)

    with torch.no_grad():
        raw = pt(img_t)

    # Ultralytics returns (predictions, features) in eval mode; take predictions.
    if isinstance(raw, (list, tuple)):
        raw = raw[0]
    if isinstance(raw, (list, tuple)):
        raw = raw[0]

    return raw.cpu().numpy() if hasattr(raw, "cpu") else np.array(raw)


def _run_onnx(onnx_path: Path, img_np) -> "np.ndarray":
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    return sess.run(None, {inp: img_np})[0]


# ---------------------------------------------------------------------------
# Shape pretty-printer
# ---------------------------------------------------------------------------

def describe_channels(channels: int) -> str:
    """What keypoint schema an output of `channels` channels implements.

    The web integration decodes this tensor positionally (src/lib/shaft/
    shaftPostprocess.ts), so the channel count IS the contract.  Both counts below are
    legitimate today: the four-point schema is what the annotation spec describes, and
    the two-point one is what every checkpoint trained before it emits.  Anything else
    is a different model than this repo knows how to read.
    """
    if channels == EXPECTED_CHANNELS:
        return "{} channels = 4-point schema ({})".format(
            channels, ", ".join(KEYPOINT_NAMES)
        )
    if channels == LEGACY_CHANNELS:
        return (
            "{} channels = legacy 2-point schema ({}). Valid, but it is NOT the "
            "annotation schema: toe/heel are absent and the web integration reports "
            "them as null.".format(channels, ", ".join(LEGACY_KEYPOINT_NAMES))
        )
    keypoints = (channels - BOX_CHANNELS) / CHANNELS_PER_KEYPOINT
    return (
        "{} channels = UNRECOGNISED ({:.2f} keypoints after the {} box channels). "
        "The decoder expects {} (4-point) or {} (legacy 2-point).".format(
            channels, keypoints, BOX_CHANNELS, EXPECTED_CHANNELS, LEGACY_CHANNELS
        )
    )


def _print_onnx_shapes(onnx_path: Path) -> None:
    import onnx

    m = onnx.load(str(onnx_path))
    print("\nONNX input shapes:")
    for t in m.graph.input:
        dims = [d.dim_value if d.dim_value else "?" for d in t.type.tensor_type.shape.dim]
        print("  {}: {}".format(t.name, dims))
    print("ONNX output shapes:")
    for t in m.graph.output:
        dims = [d.dim_value if d.dim_value else "?" for d in t.type.tensor_type.shape.dim]
        print("  {}: {}".format(t.name, dims))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--weights", type=Path, required=True, help="Path to best.pt")
    p.add_argument(
        "--imgsz",
        type=int,
        default=None,
        help="Inference resolution (default: read from checkpoint)",
    )
    p.add_argument("--opset", type=int, default=17, help="ONNX opset (default: %(default)s)")
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path for the .onnx file (default: <weights_dir>/<stem>.onnx)",
    )
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    if not args.weights.is_file():
        raise SystemExit("Weights not found: {}".format(args.weights))

    # Resolve imgsz.
    if args.imgsz is None:
        imgsz = _read_imgsz_from_ckpt(args.weights)
        print("imgsz read from checkpoint: {}".format(imgsz))
    else:
        imgsz = args.imgsz
        print("imgsz (from --imgsz): {}".format(imgsz))

    out_path = (args.out or args.weights.with_suffix(".onnx")).resolve()
    print("Target ONNX path: {}".format(out_path))

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------
    from ultralytics import YOLO

    print("\nExporting…")
    model = YOLO(str(args.weights))
    exported = model.export(
        format="onnx",
        imgsz=imgsz,
        opset=args.opset,
        dynamic=False,
        simplify=True,
    )

    exported_path = Path(str(exported)).resolve()
    if exported_path != out_path:
        import shutil
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(exported_path), str(out_path))

    file_mb = out_path.stat().st_size / 1024 / 1024
    print("File size: {:.2f} MB ({})".format(file_mb, out_path))

    _print_onnx_shapes(out_path)

    # ------------------------------------------------------------------
    # Verify: PyTorch ↔ ONNX
    # ------------------------------------------------------------------
    import numpy as np

    print("\nVerifying: running a calibration frame through PyTorch and ONNX…")
    jpeg = _pick_calibration_frame()
    img_np = _preprocess(jpeg, imgsz)
    print("Preprocessed input shape: {}  dtype: {}".format(img_np.shape, img_np.dtype))

    pt_out = _run_pytorch(args.weights, img_np)
    onnx_out = _run_onnx(out_path, img_np)

    print("PyTorch output shape: {}".format(pt_out.shape))
    print("ONNX    output shape: {}".format(onnx_out.shape))

    # [1, C, N] -- C is the contract with src/lib/shaft/shaftPostprocess.ts.
    if len(onnx_out.shape) == 3:
        channels = int(onnx_out.shape[1])
        print("Keypoint schema: {}".format(describe_channels(channels)))
        if channels not in (EXPECTED_CHANNELS, LEGACY_CHANNELS):
            print(
                "\nERROR: the exported graph emits a channel count this repo cannot "
                "decode.",
                file=sys.stderr,
            )
            return 1
    else:
        print(
            "NOTE: output is not [1, C, N]; keypoint schema not checked."
        )

    if pt_out.shape != onnx_out.shape:
        print(
            "\nERROR: shape mismatch — PyTorch {} vs ONNX {}.".format(
                pt_out.shape, onnx_out.shape
            ),
            file=sys.stderr,
        )
        return 1

    max_diff = float(np.max(np.abs(pt_out - onnx_out)))
    mean_diff = float(np.mean(np.abs(pt_out - onnx_out)))
    print(
        "Max |Δ|: {:.2e}   Mean |Δ|: {:.2e}   Threshold: {:.2e}".format(
            max_diff, mean_diff, MAX_ABS_DIFF
        )
    )

    if max_diff > MAX_ABS_DIFF:
        print(
            "\nERROR: numerical mismatch exceeds threshold "
            "({:.2e} > {:.2e}).  The exported model is unreliable.".format(
                max_diff, MAX_ABS_DIFF
            ),
            file=sys.stderr,
        )
        return 1

    print("\nOK — export verified successfully.")
    print("ONNX model: {}".format(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
