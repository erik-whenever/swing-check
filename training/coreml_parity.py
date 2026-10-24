#!/usr/bin/env python
"""Core ML parity for shaft-v2 on macOS: same frame, same decoder, compared with ONNX.

    python3.11 -m venv training/.venv-coreml
    training/.venv-coreml/bin/pip install coremltools==9.0 numpy==1.26.4 opencv-python-headless==4.11.0.86 pillow==11.2.1
    training/.venv-coreml/bin/python training/coreml_parity.py --dir <folder export_coreml.py wrote>

macOS only: coremltools.predict needs the Core ML framework. Copy the whole output folder of
export_coreml.py (both .mlpackages + parity/) to the Mac.

Feeds parity/frame960.rgb (IMG_5410 frame 60, already letterboxed by export_tflite.py) as an
RGB PIL image -- the model's image input does the /255 itself, as it will for the Swift
module's CVPixelBuffer. Decodes with the selectBest port and compares butt/hosel with the
ONNX points in reference.json. Fails if any keypoint moves more than MAX_DEVIATION_PX in
source pixels, or if a model finds nothing. Writes parity/coreml-parity.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_tflite import SIZE, deviation, points, select_best, to_cn  # noqa: E402

INPUT_NAME = "images"
OUTPUT_NAME = "output0"
# Source px (1280x720 clip). TFLite + Core ML delegate came in at <= 0.45 px in N-2.
MAX_DEVIATION_PX = 2.0
VARIANTS = ("float32", "float16")
COMPUTE_UNITS = ("ALL", "CPU_ONLY")


def load_fixture(parity: Path):
    ref = json.loads((parity / "reference.json").read_text(encoding="utf-8"))
    raw = (parity / ref["frameFile"]).read_bytes()
    frame = np.frombuffer(raw, dtype=np.uint8).reshape(SIZE, SIZE, 3)
    return ref, frame


def coreml_predictor(pkg: Path, compute_units: str):
    import coremltools as ct
    from PIL import Image
    model = ct.models.MLModel(str(pkg), compute_units=getattr(ct.ComputeUnit, compute_units))

    def predict(frame: np.ndarray) -> np.ndarray:
        return np.asarray(model.predict({INPUT_NAME: Image.fromarray(frame)})[OUTPUT_NAME])
    return predict


def check(predict, frame: np.ndarray, ref: dict) -> dict:
    """One run: raw head -> selectBest -> source px, compared with the ONNX reference."""
    raw = predict(frame)
    if list(raw.shape) != [1, 11, 18900]:
        return {"ok": False, "error": "output shape {}".format(list(raw.shape))}
    cn, layout = to_cn(raw.astype(np.float32))
    best, kps = select_best(cn)
    pts = points(best, kps, ref["letterbox"])
    dev = deviation(ref["onnx"]["points"], pts, kps)
    worst = max(d["sourcePx"] for d in dev.values()) if dev else None
    return {"ok": worst is not None and worst <= MAX_DEVIATION_PX, "outputLayout": layout,
            "points": pts, "deviationVsOnnx": dev, "worstSourcePx": worst}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", type=Path, required=True,
                   help="Folder with shaft-v2-float32/16.mlpackage and parity/")
    args = p.parse_args()
    if sys.platform != "darwin":
        raise SystemExit("coremltools.predict needs macOS (Core ML framework)")

    ref, frame = load_fixture(args.dir / "parity")
    report = {"maxDeviationPx": MAX_DEVIATION_PX, "frame": ref["source"], "runs": {}}
    ok = True
    for variant in VARIANTS:
        pkg = args.dir / "shaft-v2-{}.mlpackage".format(variant)
        for units in COMPUTE_UNITS:
            r = check(coreml_predictor(pkg, units), frame, ref)
            report["runs"]["{}/{}".format(variant, units)] = r
            ok = ok and r["ok"]
            dev = r.get("deviationVsOnnx")
            print("{:8s} {:8s} {}  {}".format(variant, units, "PASS" if r["ok"] else "FAIL", ", ".join(
                "{} {:.3f} px".format(n, d["sourcePx"]) for n, d in dev.items()) if dev
                else r.get("error", "NO DETECTION")))

    out = args.dir / "parity" / "coreml-parity.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("wrote {}".format(out))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
