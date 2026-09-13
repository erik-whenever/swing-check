#!/usr/bin/env python
"""Evaluate a shaft detector against the calibration set -- the permanent evalset.

    py -3.11 training/evaluate.py --weights training/runs/shaft-v1/weights/best.pt
    py -3.11 training/evaluate.py --weights best.pt --annotations data/shaft/calibration/lisa.zip

The reference point is not a round number picked out of the air: it is what the two
human annotators achieved against each other on these same 97 frames
(docs/shaft/annotation-spec.md -> *Kalibreringsutfall 2026-09*, full report in
data/shaft/calibration/agreement.md). The report prints the model's numbers next to
the human numbers and the difference between them.

Angle is the headline. The rules measure shaft *direction*: an error along the shaft
costs nothing, the same error across it costs a rule. Distances are diagnostics for it.
"""

from __future__ import annotations

import argparse
import io
import math
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shaft_coco import (  # noqa: E402
    KEYPOINT_NAMES,
    ShaftDataError,
    frame_id_from_file_name,
    parse_export,
    read_coco,
    read_manifest,
    read_phase_corrected,
    read_zip_entry,
    resolve_phase,
    verify_visibility_coding,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
CALIBRATION = REPO_ROOT / "data" / "shaft" / "calibration"
DEFAULT_ANNOTATIONS = CALIBRATION / "erik.zip"
DEFAULT_IMAGES = CALIBRATION / "calibration.zip"
DEFAULT_OUT = REPO_ROOT / "training" / "eval-report.md"

#: Human inter-annotator agreement on this same set, from agreement.md via
#: docs/shaft/annotation-spec.md -> *Kalibreringsutfall 2026-09*. Medians.
HUMAN_BASELINE = {
    "angle_deg_median": 0.3,
    "angle_deg_p90": 1.3,
    "butt_pct_h_median": 0.17,
    "hosel_pct_h_median": 0.13,
}

GROUP_FIELDS = ("phase", "view", "blur")


# -----------------------------------------------------------------------------
# Statistics
# -----------------------------------------------------------------------------


def percentile(values, q: float):
    """Linear-interpolated percentile, matching numpy's default `linear` method.

    Same method as `scripts/measure-calibration.mjs`, so the model's numbers and the
    humans' numbers are computed the same way and are comparable.
    """
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * q
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return float(ordered[low])
    return float(ordered[low] + (ordered[high] - ordered[low]) * (position - low))


def median(values):
    return percentile(values, 0.5)


def angle_deg(p_from, p_to) -> float:
    """Direction of the butt -> hosel vector, in degrees."""
    return math.degrees(math.atan2(p_to[1] - p_from[1], p_to[0] - p_from[0]))


def angle_difference(a: float, b: float) -> float:
    """Absolute difference wrapped to [0, 180].

    Deliberately NOT folded at 90 degrees: butt->hosel is directed because the points
    are ordered, so swapped endpoints must show up as ~180 degrees rather than being
    quietly absorbed as 0.
    """
    return abs((a - b + 180.0) % 360.0 - 180.0)


def fmt(value, digits: int = 2, suffix: str = "") -> str:
    if value is None:
        return "--"
    return "{:.{d}f}{s}".format(value, d=digits, s=suffix)


def fmt_delta(model, human, digits: int = 2) -> str:
    if model is None or human is None:
        return "--"
    delta = model - human
    return "{:+.{d}f}".format(delta, d=digits)


# -----------------------------------------------------------------------------
# Prediction
# -----------------------------------------------------------------------------


def load_images(images_zip: Path):
    """Return {frameId: (entry name, jpeg bytes)} from the calibration image ZIP."""
    out = {}
    with zipfile.ZipFile(images_zip) as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            if not name.lower().endswith((".jpg", ".jpeg")):
                continue
            out[frame_id_from_file_name(name)] = (name, zf.read(info))
    if not out:
        raise ShaftDataError("no JPEG frames found in {}".format(images_zip))
    return out


def predict_frame(model, image_bytes: bytes, args):
    """Run the model on one frame; return the highest-confidence shaft instance.

    Returns `(points, box_conf)` where `points` is a list of `(x, y, conf)` per
    keypoint in butt/hosel order, or `(None, 0.0)` when nothing was detected.
    """
    import numpy as np
    from PIL import Image

    with Image.open(io.BytesIO(image_bytes)) as pil:
        rgb = np.asarray(pil.convert("RGB"))
    bgr = rgb[:, :, ::-1].copy()  # Ultralytics takes numpy arrays as BGR

    results = model.predict(
        bgr, imgsz=args.imgsz, conf=args.conf, device=args.device, verbose=False
    )
    result = results[0]
    if result.boxes is None or len(result.boxes) == 0 or result.keypoints is None:
        return None, 0.0

    confidences = result.boxes.conf.tolist()
    best = max(range(len(confidences)), key=confidences.__getitem__)

    xy = result.keypoints.xy[best].tolist()
    kpt_conf = result.keypoints.conf
    scores = kpt_conf[best].tolist() if kpt_conf is not None else [1.0] * len(xy)

    points = []
    for i in range(len(KEYPOINT_NAMES)):
        if i < len(xy):
            points.append((float(xy[i][0]), float(xy[i][1]), float(scores[i])))
        else:
            points.append((0.0, 0.0, 0.0))
    return points, float(confidences[best])


# -----------------------------------------------------------------------------
# Accumulation
# -----------------------------------------------------------------------------


class Bucket:
    def __init__(self):
        self.point_px = {name: [] for name in KEYPOINT_NAMES}
        self.point_pct = {name: [] for name in KEYPOINT_NAMES}
        self.angles = []
        self.frames = 0

    def add_point(self, name: str, px: float, pct: float) -> None:
        self.point_px[name].append(px)
        self.point_pct[name].append(pct)

    def summary(self) -> dict:
        out = {
            "frames": self.frames,
            "angle_n": len(self.angles),
            "angle_median": median(self.angles),
            "angle_p90": percentile(self.angles, 0.90),
        }
        for name in KEYPOINT_NAMES:
            out[name + "_n"] = len(self.point_px[name])
            out[name + "_px_median"] = median(self.point_px[name])
            out[name + "_pct_median"] = median(self.point_pct[name])
            out[name + "_pct_p90"] = percentile(self.point_pct[name], 0.90)
        return out


def evaluate(model, annotations, images, phase_lookup, manifest, args):
    overall = Bucket()
    groups = {field: defaultdict(Bucket) for field in GROUP_FIELDS}

    flag_counts = Counter()
    per_point_flags = {
        name: Counter() for name in KEYPOINT_NAMES
    }  # annotator_outside_model_predicted / annotator_placed_model_missing / ...
    no_shaft_frames = 0
    no_shaft_fired = 0
    missing_images = []
    undetected_frames = []
    rows = []

    for frame_id, ann in sorted(annotations.items()):
        if frame_id not in images:
            missing_images.append(frame_id)
            continue
        _, image_bytes = images[frame_id]
        predicted, box_conf = predict_frame(model, image_bytes, args)

        phase, _ = resolve_phase(
            frame_id, phase_lookup, annotation_phase=ann.phase, manifest=manifest
        )
        labels = {"phase": phase or "(missing)", "view": ann.view or "(unset)",
                  "blur": ann.blur or "(unset)"}

        if ann.no_shaft:
            # Negative example: the annotator says there is no placeable shaft here.
            no_shaft_frames += 1
            if predicted is not None and any(p[2] >= args.kpt_conf for p in predicted):
                no_shaft_fired += 1
            continue

        if predicted is None:
            undetected_frames.append(frame_id)

        overall.frames += 1
        for field in GROUP_FIELDS:
            groups[field][labels[field]].frames += 1

        annotated_angle = None
        predicted_angle = None
        if all(p.placed for p in ann.points):
            annotated_angle = angle_deg(
                (ann.points[0].x, ann.points[0].y), (ann.points[1].x, ann.points[1].y)
            )
        if predicted is not None and all(p[2] >= args.kpt_conf for p in predicted):
            predicted_angle = angle_deg(
                (predicted[0][0], predicted[0][1]), (predicted[1][0], predicted[1][1])
            )

        row = {"frame_id": frame_id, "phase": labels["phase"], "view": labels["view"],
               "blur": labels["blur"], "box_conf": box_conf, "angle": None}

        if annotated_angle is not None and predicted_angle is not None:
            difference = angle_difference(predicted_angle, annotated_angle)
            overall.angles.append(difference)
            for field in GROUP_FIELDS:
                groups[field][labels[field]].angles.append(difference)
            row["angle"] = difference

        for index, name in enumerate(KEYPOINT_NAMES):
            annotated_point = ann.points[index]
            model_has = (
                predicted is not None and predicted[index][2] >= args.kpt_conf
            )

            if annotated_point.placed and model_has:
                flag_counts["compared"] += 1
                distance = math.hypot(
                    predicted[index][0] - annotated_point.x,
                    predicted[index][1] - annotated_point.y,
                )
                pct = 100.0 * distance / ann.height
                overall.add_point(name, distance, pct)
                for field in GROUP_FIELDS:
                    groups[field][labels[field]].add_point(name, distance, pct)
                row[name + "_px"] = distance
                row[name + "_pct"] = pct
            elif annotated_point.placed and not model_has:
                per_point_flags[name]["annotator_placed_model_missing"] += 1
            elif not annotated_point.placed and model_has:
                per_point_flags[name]["annotator_outside_model_predicted"] += 1
            else:
                per_point_flags[name]["both_absent"] += 1

            if annotated_point.placed:
                per_point_flags[name]["annotator_placed"] += 1
            else:
                per_point_flags[name]["annotator_outside"] += 1

        rows.append(row)

    return {
        "overall": overall,
        "groups": groups,
        "flag_counts": flag_counts,
        "per_point_flags": per_point_flags,
        "no_shaft_frames": no_shaft_frames,
        "no_shaft_fired": no_shaft_fired,
        "missing_images": missing_images,
        "undetected_frames": undetected_frames,
        "rows": rows,
    }


# -----------------------------------------------------------------------------
# Report
# -----------------------------------------------------------------------------


def render_report(result, args, notes) -> str:
    overall = result["overall"].summary()
    lines = []
    add = lines.append

    add("# Skaftdetektor — utvärdering mot kalibreringssetet")
    add("")
    add("Genererad {} av `training/evaluate.py`.".format(
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ))
    add("")
    add("| | |")
    add("|---|---|")
    add("| Vikter | `{}` |".format(args.weights))
    add("| Annoteringar | `{}` |".format(args.annotations))
    add("| Bilder | `{}` |".format(args.images))
    add("| `imgsz` | {} |".format(args.imgsz))
    add("| Detektionströskel (`--conf`) | {} |".format(args.conf))
    add("| Punktströskel (`--kpt-conf`) | {} |".format(args.kpt_conf))
    add("| Frames utvärderade | {} |".format(overall["frames"]))
    add("")

    if notes:
        add("## 0. Anmärkningar")
        add("")
        for note in notes:
            add("- {}".format(note))
        add("")

    add("## 1. Mot människornas samstämmighet")
    add("")
    add(
        "Referensen är inte ett godtyckligt mål: det är vad de två annotatörerna uppnådde "
        "mot varandra på samma frames (`data/shaft/calibration/agreement.md`). En positiv "
        "differens betyder att modellen avviker mer än människorna gjorde."
    )
    add("")
    add("| Mått | Modell | Människor | Differens |")
    add("|---|---:|---:|---:|")
    add("| Vinkel, median | {} | {} | {} |".format(
        fmt(overall["angle_median"], 2, "°"),
        fmt(HUMAN_BASELINE["angle_deg_median"], 2, "°"),
        fmt_delta(overall["angle_median"], HUMAN_BASELINE["angle_deg_median"]),
    ))
    add("| Vinkel, p90 | {} | {} | {} |".format(
        fmt(overall["angle_p90"], 2, "°"),
        fmt(HUMAN_BASELINE["angle_deg_p90"], 2, "°"),
        fmt_delta(overall["angle_p90"], HUMAN_BASELINE["angle_deg_p90"]),
    ))
    add("| `butt`, median (% av bildhöjd) | {} | {} | {} |".format(
        fmt(overall["butt_pct_median"], 2, " %"),
        fmt(HUMAN_BASELINE["butt_pct_h_median"], 2, " %"),
        fmt_delta(overall["butt_pct_median"], HUMAN_BASELINE["butt_pct_h_median"]),
    ))
    add("| `hosel`, median (% av bildhöjd) | {} | {} | {} |".format(
        fmt(overall["hosel_pct_median"], 2, " %"),
        fmt(HUMAN_BASELINE["hosel_pct_h_median"], 2, " %"),
        fmt_delta(overall["hosel_pct_median"], HUMAN_BASELINE["hosel_pct_h_median"]),
    ))
    add("")
    add(
        "Vinkeln är huvudsiffran. Ett fel *längs* skaftet kostar ingenting, samma fel "
        "*tvärs* skaftet kostar en regel."
    )
    add("")

    add("## 2. Totalt, per punkt")
    add("")
    add("| Punkt | n | Median px | Median %H | p90 %H |")
    add("|---|---:|---:|---:|---:|")
    for name in KEYPOINT_NAMES:
        add("| `{}` | {} | {} | {} | {} |".format(
            name,
            overall[name + "_n"],
            fmt(overall[name + "_px_median"], 1),
            fmt(overall[name + "_pct_median"], 2),
            fmt(overall[name + "_pct_p90"], 2),
        ))
    add("")
    add(
        "Två enheter därför att setet blandar upplösningar (720×818 och 1080×1920) — "
        "samma pixelavvikelse är olika stora fel i olika frames. Läs den normaliserade "
        "siffran; px står kvar för att det är vad man ser när man öppnar framen igen."
    )
    add("")

    add("## 3. Per `phase`, `view` och `blur`")
    add("")
    for field in GROUP_FIELDS:
        add("### `{}`".format(field))
        add("")
        add("| {} | frames | Vinkel median | Vinkel p90 | `butt` %H | `hosel` %H |".format(field))
        add("|---|---:|---:|---:|---:|---:|")
        buckets = result["groups"][field]
        for key in sorted(buckets, key=lambda k: (-buckets[k].frames, k)):
            summary = buckets[key].summary()
            add("| {} | {} | {} | {} | {} | {} |".format(
                key,
                summary["frames"],
                fmt(summary["angle_median"], 2),
                fmt(summary["angle_p90"], 2),
                fmt(summary["butt_pct_median"], 2),
                fmt(summary["hosel_pct_median"], 2),
            ))
        add("")

    add("## 4. Synlighet: modellen mot annotatören")
    add("")
    add(
        "En punkt räknas som predicerad när dess keypoint-konfidens når `--kpt-conf` "
        "({}). En punkt räknas som satt av annotatören när `v>=1`, aldrig på "
        "koordinaten — CVAT lämnar kvar spökkoordinater för `outside`-punkter.".format(
            args.kpt_conf
        )
    )
    add("")
    add("| Punkt | Annotatör `outside`, modell predicerar | Annotatör satt, modell saknar |")
    add("|---|---:|---:|")
    for name in KEYPOINT_NAMES:
        flags = result["per_point_flags"][name]
        outside = flags["annotator_outside"]
        placed = flags["annotator_placed"]
        add("| `{}` | {} / {} ({}) | {} / {} ({}) |".format(
            name,
            flags["annotator_outside_model_predicted"], outside,
            "{:.0f} %".format(100.0 * flags["annotator_outside_model_predicted"] / outside)
            if outside else "--",
            flags["annotator_placed_model_missing"], placed,
            "{:.0f} %".format(100.0 * flags["annotator_placed_model_missing"] / placed)
            if placed else "--",
        ))
    add("")
    add(
        "En modell som predicerar en punkt annotatören flaggade `outside` är inte "
        "nödvändigtvis fel — `outside` betyder att *annotatören* inte kunde sluta sig "
        "till läget. Talet är där för att göra avvikelsen synlig, inte för att straffa "
        "den; det finns ingen sanning att mäta mot på de framesen."
    )
    add("")

    if result["no_shaft_frames"]:
        add("### `no_shaft`-frames (negativa exempel)")
        add("")
        add("{} frames, modellen predicerade minst en punkt på {} av dem.".format(
            result["no_shaft_frames"], result["no_shaft_fired"]
        ))
        add("")

    if result["undetected_frames"]:
        add("### Frames utan detektion alls")
        add("")
        add("{} frames: {}".format(
            len(result["undetected_frames"]), ", ".join(
                "`{}`".format(f) for f in result["undetected_frames"][:30]
            )
        ))
        add("")

    add("## 5. Största vinkelavvikelser")
    add("")
    add("| Frame | Vinkel | `phase` | `view` | `blur` |")
    add("|---|---:|---|---|---|")
    with_angle = [r for r in result["rows"] if r["angle"] is not None]
    for row in sorted(with_angle, key=lambda r: -r["angle"])[:15]:
        add("| `{}` | {} | {} | {} | {} |".format(
            row["frame_id"], fmt(row["angle"], 2), row["phase"], row["view"], row["blur"]
        ))
    add("")

    return "\n".join(lines) + "\n"


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--weights", type=Path, required=True, help="model weights (.pt or .onnx)")
    parser.add_argument(
        "--annotations",
        type=Path,
        default=DEFAULT_ANNOTATIONS,
        help="CVAT COCO Keypoints export of the calibration set (default: %(default)s)",
    )
    parser.add_argument(
        "--images",
        type=Path,
        default=DEFAULT_IMAGES,
        help="calibration ZIP holding frames/ and manifest.json (default: %(default)s)",
    )
    parser.add_argument(
        "--phase-corrected",
        type=Path,
        default=None,
        help="optional phase-corrected.json; otherwise phase comes from the annotation "
        "attributes, then the manifest",
    )
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument(
        "--conf", type=float, default=0.25, help="detection confidence (default: %(default)s)"
    )
    parser.add_argument(
        "--kpt-conf",
        type=float,
        default=0.5,
        help="keypoint confidence at or above which the model counts as having placed "
        "that point (default: %(default)s)",
    )
    parser.add_argument("--device", default="0")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="read the inputs, verify the visibility coding, report coverage, and exit "
        "without loading the model",
    )
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    notes = []

    for path in (args.annotations, args.images):
        if not path.is_file():
            raise SystemExit("missing input: {}".format(path))

    coco = read_coco(args.annotations)
    for warning in verify_visibility_coding(coco):
        notes.append("Synlighetskodning: {}".format(warning))
    if not notes:
        notes.append(
            "Synlighetskodning verifierad mot filen: värdemängden {0,1,2}, "
            "`num_keypoints` stämmer med antalet `v>0`, och `v=1` förekommer."
        )

    export = parse_export(coco)
    if export.duplicate_annotations:
        notes.append(
            "{} frame(s) bär mer än ett `shaft`-objekt; den med flest satta punkter "
            "behålls: {}".format(
                len(export.duplicate_annotations), ", ".join(sorted(export.duplicate_annotations))
            )
        )

    images = load_images(args.images)
    try:
        manifest = read_manifest(args.images)
    except ShaftDataError:
        manifest = {}
        notes.append("Ingen `manifest.json` i bildarkivet — fas tas från annoteringen.")

    phase_lookup = {}
    if args.phase_corrected and args.phase_corrected.is_file():
        phase_lookup = read_phase_corrected(args.phase_corrected)
        notes.append("Fas fran `{}` ({} frames).".format(args.phase_corrected, len(phase_lookup)))

    print("Annotations: {} frames".format(len(export.frames)))
    print("Images     : {} frames".format(len(images)))
    print("Overlap    : {} frames".format(len(set(export.frames) & set(images))))
    only_annotated = sorted(set(export.frames) - set(images))
    if only_annotated:
        notes.append(
            "{} annoterade frames saknar bild i `{}`: {}".format(
                len(only_annotated), args.images.name, ", ".join(only_annotated[:10])
            )
        )

    if args.dry_run:
        for note in notes:
            print("- {}".format(note))
        print("\n--dry-run: model not loaded, no report written.")
        return 0

    if not args.weights.is_file():
        raise SystemExit("weights not found: {}".format(args.weights))

    from ultralytics import YOLO

    model = YOLO(str(args.weights))
    result = evaluate(model, export.frames, images, phase_lookup, manifest, args)
    notes.extend(
        "Bild saknas för annoterad frame `{}`.".format(frame_id)
        for frame_id in result["missing_images"][:10]
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render_report(result, args, notes), encoding="utf-8")

    overall = result["overall"].summary()
    print()
    print("Angle median : {} (humans {:.2f})".format(
        fmt(overall["angle_median"], 2), HUMAN_BASELINE["angle_deg_median"]
    ))
    print("butt  %H med : {} (humans {:.2f})".format(
        fmt(overall["butt_pct_median"], 2), HUMAN_BASELINE["butt_pct_h_median"]
    ))
    print("hosel %H med : {} (humans {:.2f})".format(
        fmt(overall["hosel_pct_median"], 2), HUMAN_BASELINE["hosel_pct_h_median"]
    ))
    print("Report       : {}".format(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
