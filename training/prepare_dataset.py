#!/usr/bin/env python
"""Convert CVAT COCO Keypoints exports of the shaft dataset into YOLO-pose format.

INPUT is pairs: one CVAT COCO export ZIP (the annotations, no images) plus the batch
ZIP it was annotated from (the images plus `manifest.json`). Pass `--pair COCO BATCH`
once per batch.

OUTPUT is a YOLO dataset directory:

    <out>/images/{train,val}/<frameId>.jpg
    <out>/labels/{train,val}/<frameId>.txt
    <out>/data.yaml
    <out>/frame-meta.json      <- phase/view/blur sidecar, NOT training input

One label line per image:

    0 xc yc w h  bx by bv  hx hy hv        (all normalised to [0,1])

Keypoint order is butt then hosel, fixed by docs/shaft/annotation-spec.md.

    py -3.11 training/prepare_dataset.py \
        --pair data/shaft/training/batch-01/annotated-v2.zip \
               data/shaft/training/batch-01/batch.zip
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import zipfile
from collections import Counter
from math import hypot, sqrt
from pathlib import Path
from random import Random

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shaft_coco import (  # noqa: E402
    KEYPOINT_NAMES,
    ShaftDataError,
    frame_id_from_file_name,
    parse_export,
    read_coco,
    read_manifest,
    read_phase_corrected,
    read_reserved_ids,
    read_zip_entry,
    resolve_phase,
    swing_key,
    verify_visibility_coding,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "training" / "datasets" / "shaft"
DEFAULT_RESERVED = REPO_ROOT / "data" / "shaft" / "calibration" / "reserved-ids.txt"

#: Fraction of the enclosing rectangle's longer side added as padding on every edge.
DEFAULT_MARGIN = 0.06
#: Floor on that padding, as a fraction of the image's shorter side. A shaft that is
#: exactly vertical has a zero-width enclosing rectangle; without a floor the box
#: would be degenerate and the box loss undefined.
DEFAULT_MIN_PAD = 0.01
#: Train/val split. The calibration set is NOT the val set -- see README.
DEFAULT_VAL_FRAC = 0.15
DEFAULT_SEED = 20260913


# -----------------------------------------------------------------------------
# Geometry
# -----------------------------------------------------------------------------


def enclosing_box(points, margin: float, min_pad: float, width: int, height: int):
    """Enclosing rectangle of the placed points, padded, clipped to the image.

    The shaft has no natural bounding box -- it is a line segment between two
    annotated endpoints. We take the rectangle the two points span and grow it, which
    keeps the box's area tied to the shaft's actual extent (the pose loss normalises
    keypoint error by box area, so a box that does not track the object's scale
    reweights the very quantity we care about).
    """
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    pad = max(margin * max(x1 - x0, y1 - y0), min_pad * min(width, height))
    x0, y0 = max(0.0, x0 - pad), max(0.0, y0 - pad)
    x1, y1 = min(float(width), x1 + pad), min(float(height), y1 + pad)
    return x0, y0, x1, y1


def square_box(point, side: float, margin: float, min_pad: float, width: int, height: int):
    """Stand-in box for a frame where only one endpoint is placed.

    See README -> *Bounding box*. `side` is the dataset-median shaft length divided by
    sqrt(2), i.e. the enclosing-rectangle side a shaft of median length spans at 45
    degrees -- so these boxes land in the same area distribution as the real ones and
    do not distort the keypoint loss's area normalisation.
    """
    half = side / 2.0
    x0, y0 = point.x - half, point.y - half
    x1, y1 = point.x + half, point.y + half
    pad = max(margin * side, min_pad * min(width, height))
    x0, y0 = max(0.0, x0 - pad), max(0.0, y0 - pad)
    x1, y1 = min(float(width), x1 + pad), min(float(height), y1 + pad)
    return x0, y0, x1, y1


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def label_line(box, points, width: int, height: int) -> str:
    """Format one YOLO-pose label line, normalised.

    An unplaced point is written as `0 0 0`, never as its coordinate: CVAT leaves the
    last dragged position of an `outside` point in the export, and writing that ghost
    would train the model toward a position the annotator explicitly refused to set.
    Ultralytics masks keypoints with v=0 out of the loss.
    """
    x0, y0, x1, y1 = box
    xc = _clamp01(((x0 + x1) / 2.0) / width)
    yc = _clamp01(((y0 + y1) / 2.0) / height)
    bw = _clamp01((x1 - x0) / width)
    bh = _clamp01((y1 - y0) / height)

    parts = ["0", f"{xc:.6f}", f"{yc:.6f}", f"{bw:.6f}", f"{bh:.6f}"]
    for point in points:
        if point.placed:
            parts += [
                f"{_clamp01(point.x / width):.6f}",
                f"{_clamp01(point.y / height):.6f}",
                str(int(point.v)),
            ]
        else:
            parts += ["0.000000", "0.000000", "0"]
    return " ".join(parts)


# -----------------------------------------------------------------------------
# Pipeline
# -----------------------------------------------------------------------------


class Dropped(Counter):
    """Reasons frames fell out, so the run can report why and not just how many."""


def collect_records(args, reserved: set, dropped: Dropped, notes: list):
    """Read every pair into a flat list of per-frame records, dropping exclusions."""
    records = []
    seen: dict = {}

    for coco_zip, batch_zip in args.pair:
        coco_zip, batch_zip = Path(coco_zip), Path(batch_zip)
        for path in (coco_zip, batch_zip):
            if not path.is_file():
                raise ShaftDataError("missing input: {}".format(path))

        coco = read_coco(coco_zip)
        for warning in verify_visibility_coding(coco):
            notes.append("{}: visibility check -- {}".format(coco_zip.name, warning))

        export = parse_export(coco)
        manifest = read_manifest(batch_zip)

        corrected: dict = {}
        corrected_path = None
        explicit = args.phase_corrected_map.get(str(coco_zip))
        candidates = [Path(explicit)] if explicit else [batch_zip.parent / "phase-corrected.json"]
        for candidate in candidates:
            if candidate.is_file():
                corrected = read_phase_corrected(candidate)
                corrected_path = candidate
                break
        notes.append(
            "{}: phase from {}".format(
                coco_zip.name,
                "{} ({} frames)".format(corrected_path.name, len(corrected))
                if corrected_path
                else "manifest/annotations (no phase-corrected.json found)",
            )
        )

        if export.images_without_shaft:
            dropped["no shaft annotation on the image"] += len(export.images_without_shaft)
        if export.duplicate_annotations:
            notes.append(
                "{}: {} image(s) carried more than one shaft object; kept the one with "
                "the most placed points ({})".format(
                    coco_zip.name,
                    len(export.duplicate_annotations),
                    ", ".join(sorted(export.duplicate_annotations)),
                )
            )

        with zipfile.ZipFile(batch_zip) as zf:
            available = {frame_id_from_file_name(i.filename) for i in zf.infolist()}

        for frame_id, ann in sorted(export.frames.items()):
            if frame_id in reserved:
                dropped["reserved for the calibration evalset"] += 1
                continue
            if ann.no_shaft:
                dropped["no_shaft=true (kept out of training by the spec)"] += 1
                continue
            if ann.n_placed == 0:
                dropped["no point placed (all keypoints outside)"] += 1
                continue
            if frame_id not in available:
                dropped["image not present in the batch ZIP"] += 1
                continue
            if frame_id in seen:
                raise ShaftDataError(
                    "frame {} appears in two pairs ({} and {}); ids are stable, so this "
                    "means the same frame is annotated twice".format(
                        frame_id, seen[frame_id], coco_zip.name
                    )
                )
            seen[frame_id] = coco_zip.name

            phase, phase_source = resolve_phase(
                frame_id, corrected, annotation_phase=ann.phase, manifest=manifest
            )
            manifest_record = manifest.get(frame_id) or {}
            records.append(
                {
                    "frame_id": frame_id,
                    "ann": ann,
                    "batch_zip": batch_zip,
                    "entry": ann.file_name,
                    "phase": phase,
                    "phase_source": phase_source,
                    "view": ann.view,
                    "blur": ann.blur,
                    "source": manifest_record.get("source", ""),
                    "gate": manifest_record.get("gate", ""),
                    "swing": swing_key(frame_id),
                }
            )
    return records


def median_shaft_side(records) -> float:
    """Median shaft length as a fraction of image height, over two-point frames."""
    lengths = []
    for rec in records:
        points = rec["ann"].placed_points
        if len(points) == 2:
            lengths.append(
                hypot(points[0].x - points[1].x, points[0].y - points[1].y) / rec["ann"].height
            )
    if not lengths:
        return 0.0
    return statistics.median(lengths)


def split_records(records, val_frac: float, seed: int):
    """Group-aware train/val split: a swing lands entirely on one side.

    The calibration set is deliberately NOT the val set. `best.pt` is chosen on val,
    so a val set drawn from the evalset would make every eval number a number the
    model was selected against.
    """
    groups: dict = {}
    for rec in records:
        groups.setdefault(rec["swing"], []).append(rec)

    keys = sorted(groups)
    Random(seed).shuffle(keys)

    target_val = int(round(val_frac * len(records)))
    val_ids: set = set()
    val_count = 0
    for key in keys:
        if val_count >= target_val:
            break
        for rec in groups[key]:
            val_ids.add(rec["frame_id"])
        val_count += len(groups[key])

    for rec in records:
        rec["split"] = "val" if rec["frame_id"] in val_ids else "train"
    return records


def write_dataset(records, out_dir: Path, args, single_point_side: float):
    """Write images, labels, data.yaml and the phase sidecar."""
    for split in ("train", "val"):
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    open_zips: dict = {}
    meta: dict = {}
    try:
        for rec in records:
            ann = rec["ann"]
            batch_zip = rec["batch_zip"]
            if batch_zip not in open_zips:
                open_zips[batch_zip] = zipfile.ZipFile(batch_zip)
            image_bytes = read_zip_entry(open_zips[batch_zip], rec["entry"])

            split = rec["split"]
            (out_dir / "images" / split / (rec["frame_id"] + ".jpg")).write_bytes(image_bytes)

            placed = ann.placed_points
            if len(placed) == 2:
                box = enclosing_box(placed, args.margin, args.min_pad, ann.width, ann.height)
            else:
                box = square_box(
                    placed[0],
                    single_point_side * ann.height,
                    args.margin,
                    args.min_pad,
                    ann.width,
                    ann.height,
                )

            (out_dir / "labels" / split / (rec["frame_id"] + ".txt")).write_text(
                label_line(box, ann.points, ann.width, ann.height) + "\n", encoding="utf-8"
            )

            meta[rec["frame_id"]] = {
                "split": split,
                "phase": rec["phase"],
                "phaseSource": rec["phase_source"],
                "view": rec["view"],
                "blur": rec["blur"],
                "source": rec["source"],
                "gate": rec["gate"],
                "swing": rec["swing"],
                "width": ann.width,
                "height": ann.height,
                "placedPoints": [
                    name for name, point in zip(KEYPOINT_NAMES, ann.points) if point.placed
                ],
                "visibility": {
                    name: point.v for name, point in zip(KEYPOINT_NAMES, ann.points)
                },
            }
    finally:
        for zf in open_zips.values():
            zf.close()

    write_data_yaml(out_dir, args)
    (out_dir / "frame-meta.json").write_text(
        json.dumps(
            {
                "note": (
                    "phase/view/blur ride along for evaluation grouping only; they are "
                    "never training input"
                ),
                "keypointOrder": list(KEYPOINT_NAMES),
                "frames": meta,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return meta


def write_data_yaml(out_dir: Path, args) -> None:
    """Write data.yaml.

    `flip_idx` is the identity mapping [0, 1] and horizontal flipping is switched OFF
    in train.py (`fliplr=0.0`). butt and hosel are not mirror-symmetric: they are the
    two ends of a directed vector, so there is no index permutation that makes a
    mirrored frame correctly labelled. The identity mapping exists only to satisfy
    Ultralytics' schema check; it is never exercised, because the augmentation that
    would use it is off.
    """
    text = """# Generated by training/prepare_dataset.py -- do not edit by hand.
#
# flip_idx is identity and horizontal flip is DISABLED in train.py (fliplr=0.0).
# butt/hosel are the two ends of a directed vector, not a mirror-symmetric pair, so
# no permutation makes a mirrored frame correctly labelled. Keep fliplr at 0.

path: {path}
train: images/train
val: images/val

kpt_shape: [2, 3]
flip_idx: [0, 1]

names:
  0: shaft
""".format(path=out_dir.resolve().as_posix())
    (out_dir / "data.yaml").write_text(text, encoding="utf-8")


# -----------------------------------------------------------------------------
# Reporting
# -----------------------------------------------------------------------------


def report(records, dropped: Dropped, notes: list, meta: dict, single_point_side: float) -> None:
    total_in = len(records) + sum(dropped.values())
    print()
    print("Frames read from the exports : {}".format(total_in))
    print("Frames written to the dataset: {}".format(len(records)))
    print("Frames dropped               : {}".format(sum(dropped.values())))
    for reason, count in sorted(dropped.items(), key=lambda kv: (-kv[1], kv[0])):
        print("  - {:<48} {}".format(reason, count))

    if records:
        by_split = Counter(rec["split"] for rec in records)
        print()
        print("Split (grouped by swing, so no swing straddles the split):")
        for split in ("train", "val"):
            print("  {:<6} {:>4} images".format(split, by_split.get(split, 0)))
        print("  swings {:>4}".format(len({rec["swing"] for rec in records})))

        one_point = [rec for rec in records if rec["ann"].n_placed == 1]
        print()
        coverage = "Keypoint coverage: {} frames with both points, {} with one".format(
            len(records) - len(one_point), len(one_point)
        )
        if one_point:
            coverage += " (square stand-in box, side = {:.3f} x image height)".format(
                single_point_side
            )
        print(coverage)

        print()
        print("Phase (sidecar only, never trained against):")
        phase_counts = Counter(rec["phase"] or "(missing)" for rec in records)
        for phase, count in phase_counts.most_common():
            print("  {:<12} {:>4}  ({:.1f} %)".format(phase, count, 100.0 * count / len(records)))
        print("  phase source: {}".format(dict(Counter(r["phase_source"] for r in records))))

        for field_name in ("view", "blur"):
            counts = Counter(rec[field_name] or "(unset)" for rec in records)
            print("  {:<12} {}".format(field_name, dict(counts)))

    if notes:
        print()
        print("Notes:")
        for note in notes:
            print("  - {}".format(note))


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--pair",
        nargs=2,
        action="append",
        metavar=("COCO_ZIP", "BATCH_ZIP"),
        required=True,
        help="a CVAT COCO Keypoints export ZIP and the batch ZIP holding its images; "
        "repeat for several batches",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="dataset output directory (default: %(default)s)",
    )
    parser.add_argument(
        "--phase-corrected",
        nargs=2,
        action="append",
        default=[],
        metavar=("COCO_ZIP", "JSON"),
        help="explicit phase-corrected.json for one pair; by default the file is looked "
        "for next to each batch ZIP",
    )
    parser.add_argument(
        "--reserved-ids",
        type=Path,
        default=DEFAULT_RESERVED,
        help="evalset reservation list; frames listed here are never written "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--allow-missing-reserved",
        action="store_true",
        help="proceed when the reservation list is absent. A missing list looks exactly "
        "like nothing to exclude, and that mistake surfaces months later as "
        "suspiciously good eval numbers -- so it is an error by default.",
    )
    parser.add_argument("--val-frac", type=float, default=DEFAULT_VAL_FRAC)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--margin",
        type=float,
        default=DEFAULT_MARGIN,
        help="box padding as a fraction of the enclosing rectangle's longer side "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--min-pad",
        type=float,
        default=DEFAULT_MIN_PAD,
        help="floor on that padding as a fraction of the image's shorter side; keeps a "
        "vertical shaft from getting a zero-width box (default: %(default)s)",
    )
    parser.add_argument(
        "--single-point",
        choices=("square", "drop"),
        default="square",
        help="what to do with frames where only one endpoint is placed "
        "(default: %(default)s; see README -> Bounding box)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="read and report, write nothing",
    )
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    args.phase_corrected_map = {coco: json_path for coco, json_path in args.phase_corrected}

    if args.reserved_ids.is_file():
        reserved = read_reserved_ids(args.reserved_ids)
        print("Reserved (evalset) ids loaded: {} from {}".format(len(reserved), args.reserved_ids))
    elif args.allow_missing_reserved:
        reserved = set()
        print("WARNING: no reservation list at {} -- proceeding on "
              "--allow-missing-reserved".format(args.reserved_ids))
    else:
        raise SystemExit(
            "refusing to build training data without {}.\n"
            "The calibration set is the permanent evalset and must never be trained on "
            "(docs/shaft/annotation-spec.md -> reserved-ids.txt ar bindande).\n"
            "Pass --allow-missing-reserved only if you know there is nothing to "
            "exclude.".format(args.reserved_ids)
        )

    dropped = Dropped()
    notes: list = []
    records = collect_records(args, reserved, dropped, notes)

    if not records:
        raise SystemExit("no frames survived the filters; nothing to write")

    single_point_side = median_shaft_side(records) / sqrt(2)
    if args.single_point == "drop":
        before = len(records)
        records = [rec for rec in records if rec["ann"].n_placed == 2]
        dropped["only one point placed (--single-point drop)"] += before - len(records)
    elif single_point_side <= 0.0 and any(rec["ann"].n_placed == 1 for rec in records):
        raise SystemExit(
            "no two-point frame to take a median shaft length from, so single-point "
            "frames have no box scale; rerun with --single-point drop"
        )

    records = split_records(records, args.val_frac, args.seed)

    leaked = {rec["frame_id"] for rec in records} & reserved
    if leaked:
        raise SystemExit("reserved evalset ids reached the dataset: {}".format(sorted(leaked)))

    meta: dict = {}
    if args.dry_run:
        notes.append("--dry-run: nothing written to {}".format(args.out))
    else:
        args.out.mkdir(parents=True, exist_ok=True)
        meta = write_dataset(records, args.out, args, single_point_side)
        notes.append("wrote {} and frame-meta.json".format(args.out / "data.yaml"))

    report(records, dropped, notes, meta, single_point_side)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
