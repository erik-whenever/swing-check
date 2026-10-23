#!/usr/bin/env python
"""Convert shaft-v2.onnx to Core ML (.mlpackage, same weights, no retraining), float32 and float16.

    docker build -t swingcheck-coreml -f training/Dockerfile.coreml training
    docker run --rm -v C:\\SwingCheck:/work swingcheck-coreml python training/export_coreml.py

Linux container (or macOS) because coremltools has no Windows wheel: the sdist installs, but
saving an ML Program then fails with "BlobWriter not loaded" (training/requirements-coreml.txt).
From a worktree, mount the main checkout too and pass the paths:
    docker run --rm -v C:\\SwingCheck-coreml:/work -v C:\\SwingCheck:/main swingcheck-coreml \\
        python training/export_coreml.py --onnx /main/public/models/shaft-v2.onnx \\
        --parity /main/apps/spike/assets/parity --out /main/data/shaft/coreml

What it does:
  1. coremltools converts from PyTorch, not ONNX, and no shaft-v2 .pt exists any more. So
     onnx2torch rebuilds a torch module from the ONNX graph's own initializers (same weights),
     and that module is checked against ONNX Runtime on the parity frame before anything else.
  2. Traces it and converts to an ML Program twice: compute precision float32 and float16.
     Input is an image (RGB, scale 1/255), output the raw head [1, 11, 18900], no NMS --
     the same layout as ONNX and TFLite, so the TS decoder reads all three alike.
  3. Reloads each saved .mlpackage spec and checks input/output name, shape and dtype, and
     that the float16 package really stores float16 weights. Logs size and sha256.
  4. Copies the parity fixture (frame960.rgb + reference.json from export_tflite.py) next to
     the packages, so one folder goes to the Mac for training/coreml_parity.py.

Core ML cannot run a prediction off macOS, so the Core ML numbers come from coreml_parity.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_tflite import (  # noqa: E402
    SIZE, deviation, onnx_session, points, run_onnx, select_best, sha256, to_cn,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ONNX = REPO_ROOT / "public" / "models" / "shaft-v2.onnx"
DEFAULT_PARITY = REPO_ROOT / "apps" / "spike" / "assets" / "parity"
DEFAULT_OUT = REPO_ROOT / "data" / "shaft" / "coreml"

INPUT_NAME = "images"
OUTPUT_NAME = "output0"
OUTPUT_SHAPE = [1, 11, 18900]
# Same threshold as export_onnx.py: float noise is ~1e-3, a broken graph is 0.1 or more.
MAX_ABS_DIFF = 1e-2
# OSÄKER: iOS 15 is the oldest target an ML Program runs on, and the floor Expo sets. A later
# target lets coremltools use newer ops; nothing here needs them. Raise it if Xcode warns.
DEPLOYMENT_TARGET = "iOS15"
VARIANTS = {"float32": "FLOAT32", "float16": "FLOAT16"}


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

def load_parity(parity: Path):
    ref = json.loads((parity / "reference.json").read_text(encoding="utf-8"))
    raw = (parity / ref["frameFile"]).read_bytes()
    frame = np.frombuffer(raw, dtype=np.uint8).reshape(SIZE, SIZE, 3)
    return ref, frame


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

def torch_from_onnx(onnx_path: Path, sess, frame: np.ndarray, ref: dict):
    """onnx2torch module, verified against ORT on the parity frame (raw head and decoded points)."""
    import onnx
    import torch
    from onnx2torch import convert

    module = convert(onnx.load(str(onnx_path))).eval()
    x = (frame.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
    with torch.no_grad():
        torch_cn, _ = to_cn(module(torch.from_numpy(x)).numpy())
    onnx_cn, _ = to_cn(run_onnx(sess, frame))
    diff = float(np.max(np.abs(torch_cn - onnx_cn)))
    if diff > MAX_ABS_DIFF:
        raise SystemExit("onnx2torch module differs from ORT: max abs diff {:.4g} > {}".format(
            diff, MAX_ABS_DIFF))
    best, kps = select_best(torch_cn)
    pts = points(best, kps, ref["letterbox"])
    return module, x, {"maxAbsDiffVsOnnx": diff, "points": pts,
                       "deviationVsOnnx": deviation(ref["onnx"]["points"], pts, kps)}


def convert(module, example: np.ndarray, precision: str, onnx_sha: str):
    import coremltools as ct
    import torch

    traced = torch.jit.trace(module, torch.from_numpy(example))
    # The image input does uint8 -> float and /255 inside the model, so the Swift module hands
    # Core ML a letterboxed CVPixelBuffer and never touches pixels itself. RGB: Core ML reorders
    # a BGRA buffer to the channel order the weights were trained on (Ultralytics: RGB).
    model = ct.convert(
        traced,
        inputs=[ct.ImageType(name=INPUT_NAME, shape=example.shape, scale=1 / 255.0,
                             bias=[0.0, 0.0, 0.0], color_layout=ct.colorlayout.RGB)],
        outputs=[ct.TensorType(name=OUTPUT_NAME)],
        convert_to="mlprogram",
        compute_precision=getattr(ct.precision, precision),
        minimum_deployment_target=getattr(ct.target, DEPLOYMENT_TARGET),
    )
    model.short_description = ("shaft-v2 club detector (YOLOv8n-pose, 2 keypoints: butt, hosel). "
                               "Raw head, no NMS; decode with shaftPostprocess.selectBest.")
    model.input_description[INPUT_NAME] = ("960x960 RGB, letterboxed like letterbox.ts "
                                           "(scale to fit, centered, pad 114). Scaled 1/255 inside.")
    model.output_description[OUTPUT_NAME] = ("[1, 11, 18900] channel-major: cx, cy, w, h, conf, "
                                             "then x, y, score per keypoint. Model px.")
    model.user_defined_metadata.update({
        "source": "shaft-v2.onnx", "sourceSha256": onnx_sha, "inputSize": str(SIZE),
        "padValue": "114", "outputLayout": "CN",
    })
    return model


def _feature_type(feature) -> dict:
    kind = feature.type.WhichOneof("Type")
    if kind == "imageType":
        from coremltools.proto import FeatureTypes_pb2 as ft
        img = feature.type.imageType
        return {"kind": "image", "width": img.width, "height": img.height,
                "colorSpace": ft.ImageFeatureType.ColorSpace.Name(img.colorSpace)}
    if kind == "multiArrayType":
        from coremltools.proto import FeatureTypes_pb2 as ft
        arr = feature.type.multiArrayType
        return {"kind": "multiArray", "shape": [int(v) for v in arr.shape],
                "dtype": ft.ArrayFeatureType.ArrayDataType.Name(arr.dataType)}
    return {"kind": kind}


def _const_dtypes(spec) -> dict[str, int]:
    """Element count per dtype over the program's const tensors (weights, biases, scalars)."""
    from coremltools.proto import MIL_pb2 as mil
    counts: dict[str, int] = {}
    for fn in spec.mlProgram.functions.values():
        for block in fn.block_specializations.values():
            for op in block.operations:
                if op.type != "const":
                    continue
                for out in op.outputs:
                    t = out.type.tensorType
                    n = int(np.prod([d.constant.size for d in t.dimensions])) if t.dimensions else 1
                    name = mil.DataType.Name(t.dataType)
                    counts[name] = counts.get(name, 0) + n
    return counts


def package_digest(pkg: Path) -> tuple[int, str, dict[str, str]]:
    """Size, one sha256 over every file (sorted relpath + content hash), and per-file hashes.
    Manifest.json and model.mlmodel differ between two runs on the same input, so the package
    hash does too; weight.bin is byte-identical across runs and is the file to compare."""
    files = {}
    size = 0
    for f in sorted(p for p in pkg.rglob("*") if p.is_file()):
        rel = f.relative_to(pkg).as_posix()
        files[rel] = sha256(f)
        size += f.stat().st_size
    combined = hashlib.sha256("".join("{}\0{}\n".format(k, v) for k, v in files.items()).encode())
    return size, combined.hexdigest(), files


def inspect(pkg: Path, variant: str) -> dict:
    import coremltools as ct
    spec = ct.models.MLModel(str(pkg), skip_model_load=True).get_spec()
    inputs = {f.name: _feature_type(f) for f in spec.description.input}
    outputs = {f.name: _feature_type(f) for f in spec.description.output}
    consts = _const_dtypes(spec)

    problems = []
    inp = inputs.get(INPUT_NAME)
    if inp != {"kind": "image", "width": SIZE, "height": SIZE, "colorSpace": "RGB"}:
        problems.append("input {}".format(inputs))
    out = outputs.get(OUTPUT_NAME)
    if not out or out.get("shape") != OUTPUT_SHAPE or out.get("dtype") != "FLOAT32":
        problems.append("output {}".format(outputs))
    weight_dtype = max(consts, key=consts.get) if consts else None
    want = "FLOAT16" if variant == "float16" else "FLOAT32"
    if weight_dtype != want:
        problems.append("weights stored as {} (want {}): {}".format(weight_dtype, want, consts))
    if problems:
        raise SystemExit("{}: {}".format(pkg.name, "; ".join(problems)))

    size, digest, files = package_digest(pkg)
    return {"file": pkg.name, "specificationVersion": int(spec.specificationVersion),
            "input": inputs, "output": outputs, "constElementsByDtype": consts,
            "sizeBytes": size, "sha256": digest, "files": files}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--onnx", type=Path, default=DEFAULT_ONNX)
    p.add_argument("--parity", type=Path, default=DEFAULT_PARITY,
                   help="Folder with frame960.rgb + reference.json from export_tflite.py")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT,
                   help="Writes the .mlpackages, parity/ and coreml-export.json here")
    args = p.parse_args()

    import coremltools as ct
    import torch

    ref, frame = load_parity(args.parity)
    onnx_sha = sha256(args.onnx)
    if onnx_sha != ref["onnx"]["sha256"]:
        raise SystemExit("{} is not the model reference.json was made from".format(args.onnx))

    sess = onnx_session(args.onnx)
    module, example, torch_check = torch_from_onnx(args.onnx, sess, frame, ref)

    args.out.mkdir(parents=True, exist_ok=True)
    report = {
        "source": {"file": args.onnx.name, "sha256": onnx_sha},
        "tools": {"coremltools": ct.__version__, "torch": torch.__version__},
        "deploymentTarget": DEPLOYMENT_TARGET,
        "torchFromOnnx": torch_check,
        "coreml": {},
    }
    for variant, precision in VARIANTS.items():
        pkg = args.out / "{}-{}.mlpackage".format(args.onnx.stem, variant)
        if pkg.exists():
            shutil.rmtree(pkg)
        convert(module, example, precision, onnx_sha).save(str(pkg))
        report["coreml"][variant] = inspect(pkg, variant)

    parity = args.out / "parity"
    parity.mkdir(exist_ok=True)
    for name in ("reference.json", ref["frameFile"]):
        shutil.copyfile(args.parity / name, parity / name)
    (args.out / "coreml-export.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    dev = torch_check["deviationVsOnnx"]
    print("onnx2torch vs ORT: maxAbsDiff {:.4g}, {}".format(torch_check["maxAbsDiffVsOnnx"], ", ".join(
        "{} {:.3f} px".format(n, d["sourcePx"]) for n, d in dev.items()) if dev else "NO DETECTION"))
    for variant, r in report["coreml"].items():
        print("{:8s} {}  in {}  out {}  consts {}  {:.1f} MB  weight.bin {}".format(
            variant, r["file"], r["input"][INPUT_NAME], r["output"][OUTPUT_NAME],
            r["constElementsByDtype"], r["sizeBytes"] / 1e6,
            next((h for f, h in r["files"].items() if f.endswith("weight.bin")), "-")[:16]))
    print("wrote {}".format(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
