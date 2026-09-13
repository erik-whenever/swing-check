#!/usr/bin/env python
"""Train YOLOv8n-pose on the 2-point shaft dataset, from COCO-pretrained weights.

    py -3.11 training/train.py
    py -3.11 training/train.py --epochs 400 --batch 8 --imgsz 1280
    py -3.11 training/train.py --dry-run          # resolve and print args, train nothing

Runs land in training/runs/<name>/. Horizontal flip is hard-off: butt and hosel are the
two ends of a directed vector, not a mirror-symmetric pair, so a mirrored frame has no
correct label under any index permutation.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = REPO_ROOT / "training" / "datasets" / "shaft" / "data.yaml"
DEFAULT_PROJECT = REPO_ROOT / "training" / "runs"

#: Defaults sized for ~146 images on 12 GB VRAM. See README -> *Trana*.
DEFAULT_EPOCHS = 300
DEFAULT_BATCH = 16
DEFAULT_IMGSZ = 960
DEFAULT_PATIENCE = 60

#: Augmentation. Moderate geometry and colour; every flip and every composite
#: augmentation switched off explicitly rather than left to the Ultralytics default,
#: so a default change upstream cannot silently turn mirroring back on.
AUGMENTATION = {
    "fliplr": 0.0,       # MUST stay 0 -- butt/hosel are not mirror-symmetric
    "flipud": 0.0,       # a golf swing is never upside down; pure label noise
    "degrees": 8.0,      # handheld camera roll
    "translate": 0.10,
    "scale": 0.40,       # distance to subject varies a lot between clips
    "shear": 2.0,
    "perspective": 0.0,
    "hsv_h": 0.015,
    "hsv_s": 0.50,
    "hsv_v": 0.40,       # indoor range vs outdoor sun
    "mosaic": 0.0,       # see --mosaic below
    "mixup": 0.0,        # blends two frames: two shafts, one label
    "copy_paste": 0.0,   # needs segmentation masks; meaningless for a 2-point skeleton
    "erasing": 0.0,      # can erase an endpoint while the label still claims it is there
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--data", type=Path, default=DEFAULT_DATA, help="dataset YAML (default: %(default)s)"
    )
    parser.add_argument(
        "--model",
        default="yolov8n-pose.pt",
        help="starting weights; the COCO-pretrained checkpoint is downloaded on first "
        "use (default: %(default)s)",
    )
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    parser.add_argument(
        "--batch",
        type=int,
        default=DEFAULT_BATCH,
        help="images per batch; %(default)s fits 12 GB at the default imgsz",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=DEFAULT_IMGSZ,
        help="training resolution. The shaft is a few pixels wide, so this is the knob "
        "that matters most for accuracy -- and for VRAM (default: %(default)s)",
    )
    parser.add_argument("--patience", type=int, default=DEFAULT_PATIENCE)
    parser.add_argument("--device", default="0", help="CUDA index, or cpu (default: %(default)s)")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--name", default="shaft-v1", help="run name under training/runs/")
    parser.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    parser.add_argument(
        "--mosaic",
        type=float,
        default=0.0,
        help="mosaic probability. Off by default: mosaic tiles four frames into one, "
        "quartering apparent shaft length, and for a thin 2-keypoint object a "
        "faithful scale distribution is worth more than the extra variety "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--cache",
        default="ram",
        choices=("ram", "disk", "none"),
        help="dataset cache; ~146 full-resolution frames fit in RAM easily "
        "(default: %(default)s)",
    )
    parser.add_argument("--resume", action="store_true", help="resume the run named by --name")
    parser.add_argument(
        "--export-onnx",
        action="store_true",
        help="export best.pt to ONNX when training finishes",
    )
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset (default: %(default)s)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the resolved configuration and exit without importing torch",
    )
    return parser


def resolve_config(args) -> dict:
    config = {
        "data": str(args.data),
        "epochs": args.epochs,
        "batch": args.batch,
        "imgsz": args.imgsz,
        "patience": args.patience,
        "device": args.device,
        "workers": args.workers,
        "seed": args.seed,
        "project": str(args.project),
        "name": args.name,
        "exist_ok": False,
        "resume": args.resume,
        "cache": False if args.cache == "none" else args.cache,
        "plots": True,
        "val": True,
        "deterministic": True,
    }
    config.update(AUGMENTATION)
    config["mosaic"] = args.mosaic
    if config["fliplr"] != 0.0:
        raise SystemExit(
            "fliplr must stay 0.0: butt and hosel are the two ends of a directed "
            "vector, so a mirrored frame has no correct label"
        )
    return config


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    config = resolve_config(args)

    if not args.data.is_file():
        message = "dataset YAML not found: {} -- run prepare_dataset.py first".format(args.data)
        if not args.dry_run:
            raise SystemExit(message)
        print("WARNING: " + message)

    print("Resolved training configuration:")
    print(json.dumps(config, indent=2, sort_keys=True))

    if args.dry_run:
        print("\n--dry-run: nothing trained.")
        return 0

    from ultralytics import YOLO  # imported late so --dry-run needs no torch

    args.project.mkdir(parents=True, exist_ok=True)
    model = YOLO(args.model)
    results = model.train(**config)

    save_dir = Path(getattr(results, "save_dir", args.project / args.name))
    best = save_dir / "weights" / "best.pt"
    print("\nBest weights: {}".format(best))

    if args.export_onnx:
        if not best.is_file():
            raise SystemExit("training finished but {} is missing".format(best))
        exported = YOLO(str(best)).export(
            format="onnx", imgsz=args.imgsz, opset=args.opset, dynamic=False, simplify=True
        )
        print("ONNX: {}".format(exported))

    print(
        "\nNext: py -3.11 training/evaluate.py --weights {} "
        "--annotations data/shaft/calibration/erik.zip".format(best)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
