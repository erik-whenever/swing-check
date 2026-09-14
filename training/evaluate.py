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

TWO ANGLES, NOT ONE. `butt`->`hosel` is the shaft angle; `heel`->`toe` is the BLADE
angle, and it is reported beside the shaft angle rather than folded into it. They are
different measurements of different things -- a shaft can be in the right plane with the
blade wide open -- and averaging them would hide exactly the error each is there to
catch. Each is computed only on frames where its own two points are placed, so a
two-point export simply reports no blade angle instead of reporting a wrong one.
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
    SHAFT_POINTS,
    SOLE_POINTS,
    ShaftDataError,
    export_keypoint_names,
    frame_id_from_file_name,
    keypoint_schema_note,
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
#:
#: MEASURED IN THE 2-POINT SCHEMA. The calibration set predates toe/heel, so there is no
#: human floor for the blade angle or for the sole points. Those rows print "--" rather
#: than borrowing the shaft numbers: an unmeasured floor is not a floor of zero, and a
#: comparison against a number from a different measurement is worse than no comparison.
HUMAN_BASELINE = {
    "shaft_angle_deg_median": 0.3,
    "shaft_angle_deg_p90": 1.3,
    "blade_angle_deg_median": None,
    "blade_angle_deg_p90": None,
    "butt_pct_h_median": 0.17,
    "hosel_pct_h_median": 0.13,
    "toe_pct_h_median": None,
    "heel_pct_h_median": None,
}

GROUP_FIELDS = ("phase", "view", "blur")

#: The two directed vectors the report measures, `(label, from point, to point)`.
#: Order matters and is never folded at 90 degrees -- see `angle_difference`.
ANGLES = (
    ("shaft", SHAFT_POINTS[0], SHAFT_POINTS[1]),       # butt -> hosel
    ("blade", SOLE_POINTS[1], SOLE_POINTS[0]),         # heel -> toe
)


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
    """Direction of a from -> to vector, in degrees."""
    return math.degrees(math.atan2(p_to[1] - p_from[1], p_to[0] - p_from[0]))


def angle_difference(a: float, b: float) -> float:
    """Absolute difference wrapped to [0, 180].

    Deliberately NOT folded at 90 degrees: both vectors are directed because the points
    are ordered, so swapped endpoints must show up as ~180 degrees rather than being
    quietly absorbed as 0. That is the failure mode that cost shaft-v1 its face-on
    frames, and it is exactly as possible on heel->toe as on butt->hosel.
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
    keypoint in `KEYPOINT_NAMES` order, or `(None, 0.0)` when nothing was detected.

    A model with FEWER keypoints than the schema is padded with `(0, 0, 0)`, so a
    two-point checkpoint (shaft-v2 and everything before it) evaluates cleanly against a
    four-point annotation set: its toe and heel score 0, fall below `--kpt-conf`, and are
    counted as "model missing" rather than as predictions at the origin.
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
        #: One list per entry in ANGLES -- shaft and blade are accumulated separately and
        #: never merged. A bucket can hold many shaft angles and no blade angles at all.
        self.angles = {label: [] for label, _from, _to in ANGLES}
        self.frames = 0

    def add_point(self, name: str, px: float, pct: float) -> None:
        self.point_px[name].append(px)
        self.point_pct[name].append(pct)

    def add_angle(self, label: str, difference: float) -> None:
        self.angles[label].append(difference)

    def summary(self) -> dict:
        out = {"frames": self.frames}
        for label in self.angles:
            values = self.angles[label]
            out[label + "_angle_n"] = len(values)
            out[label + "_angle_median"] = median(values)
            out[label + "_angle_p90"] = percentile(values, 0.90)
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

        row = {"frame_id": frame_id, "phase": labels["phase"], "view": labels["view"],
               "blur": labels["blur"], "box_conf": box_conf}

        # Each vector is measured only where BOTH its own endpoints exist on both sides.
        # Gating the shaft angle on toe/heel would have thrown away every frame of every
        # legacy export; gating the blade angle on butt/hosel would hide a sole the model
        # found on a frame whose grip it did not.
        for label, name_from, name_to in ANGLES:
            row[label + "_angle"] = None
            index_from = KEYPOINT_NAMES.index(name_from)
            index_to = KEYPOINT_NAMES.index(name_to)

            if not ann.placed_all(name_from, name_to):
                continue
            if predicted is None:
                continue
            if min(predicted[index_from][2], predicted[index_to][2]) < args.kpt_conf:
                continue

            annotated_angle = angle_deg(
                (ann.point(name_from).x, ann.point(name_from).y),
                (ann.point(name_to).x, ann.point(name_to).y),
            )
            predicted_angle = angle_deg(
                (predicted[index_from][0], predicted[index_from][1]),
                (predicted[index_to][0], predicted[index_to][1]),
            )
            difference = angle_difference(predicted_angle, annotated_angle)
            overall.add_angle(label, difference)
            for field in GROUP_FIELDS:
                groups[field][labels[field]].add_angle(label, difference)
            row[label + "_angle"] = difference

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
    add("| Mått | n | Modell | Människor | Differens |")
    add("|---|---:|---:|---:|---:|")
    for label, title in (("shaft", "Skaftvinkel"), ("blade", "Bladvinkel")):
        for stat, stat_title in (("median", "median"), ("p90", "p90")):
            key = "{}_angle_{}".format(label, stat)
            human = HUMAN_BASELINE["{}_angle_deg_{}".format(label, stat)]
            add("| {}, {} | {} | {} | {} | {} |".format(
                title, stat_title,
                overall["{}_angle_n".format(label)],
                fmt(overall[key], 2, "°"), fmt(human, 2, "°"),
                fmt_delta(overall[key], human),
            ))
    for name in KEYPOINT_NAMES:
        human = HUMAN_BASELINE.get(name + "_pct_h_median")
        add("| `{}`, median (% av bildhöjd) | {} | {} | {} | {} |".format(
            name,
            overall[name + "_n"],
            fmt(overall[name + "_pct_median"], 2, " %"),
            fmt(human, 2, " %"),
            fmt_delta(overall[name + "_pct_median"], human),
        ))
    add("")
    add(
        "**Skaftvinkeln** (`butt→hosel`) är huvudsiffran. Ett fel *längs* skaftet kostar "
        "ingenting, samma fel *tvärs* skaftet kostar en regel."
    )
    add("")
    add(
        "**Bladvinkeln** (`heel→toe`) är ett eget mått vid sidan av, inte en del av "
        "skaftvinkeln: ett skaft kan ligga i rätt plan med bladet vidöppet. Den mäts bara "
        "på frames där både `heel` och `toe` är satta av annotatören *och* predicerade av "
        "modellen — ett tomt värde betyder att ingen sådan frame fanns, inte att felet var "
        "noll. Människokolumnen är tom av samma skäl: kalibreringssetet annoterades i "
        "tvåpunktsschemat och bär inget golv för bladvinkeln."
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
        "`n` är antalet frames där annotatören satt punkten **och** modellen predicerade "
        "den — inte antalet frames. En tvåpunktsmodell mot ett fyrapunktsfacit ger "
        "`n = 0` på `toe` och `heel`; det syns här och i avsnitt 4."
    )
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
        header = "| {} | frames | Skaftvinkel median | Skaftvinkel p90 | Bladvinkel median".format(field)
        header += "".join(" | `{}` %H".format(name) for name in KEYPOINT_NAMES) + " |"
        add(header)
        add("|---|---:|---:|---:|---:|" + "---:|" * len(KEYPOINT_NAMES))
        buckets = result["groups"][field]
        for key in sorted(buckets, key=lambda k: (-buckets[k].frames, k)):
            summary = buckets[key].summary()
            cells = [
                key,
                str(summary["frames"]),
                fmt(summary["shaft_angle_median"], 2),
                fmt(summary["shaft_angle_p90"], 2),
                fmt(summary["blade_angle_median"], 2),
            ]
            cells += [fmt(summary[name + "_pct_median"], 2) for name in KEYPOINT_NAMES]
            add("| " + " | ".join(cells) + " |")
        add("")

    add("## 4. Synlighet: modellen mot annotatören")
    add("")
    add(
        "En punkt räknas som predicerad när dess keypoint-konfidens når `--kpt-conf` "
        "({}). En punkt räknas som satt av annotatören när `v>=1`, aldrig på "
        "koordinaten — CVAT lämnar kvar spökkoordinater för `outside`-punkter. "
        "Tabellen har en rad per punkt i schemat ({}); en modell som saknar en punkt "
        "helt — en tvåpunktsmodell mot ett fyrapunktsfacit — hamnar i kolumnen "
        "*annotatör satt, modell saknar*, inte i vinkelstatistiken.".format(
            args.kpt_conf, ", ".join("`{}`".format(n) for n in KEYPOINT_NAMES)
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
    for label, name_from, name_to in ANGLES:
        key = label + "_angle"
        title = "Skaftvinkel" if label == "shaft" else "Bladvinkel"
        add("### {} (`{}→{}`)".format(title, name_from, name_to))
        add("")
        with_angle = [r for r in result["rows"] if r[key] is not None]
        if not with_angle:
            add(
                "Inga frames där både annotatören och modellen satte `{}` och `{}`.".format(
                    name_from, name_to
                )
            )
            add("")
            continue
        add("| Frame | Avvikelse | `phase` | `view` | `blur` |")
        add("|---|---:|---|---|---|")
        for row in sorted(with_angle, key=lambda r: -r[key])[:15]:
            add("| `{}` | {} | {} | {} | {} |".format(
                row["frame_id"], fmt(row[key], 2, "°"),
                row["phase"], row["view"], row["blur"],
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
    notes.append("Keypoint-schema i annoteringarna: {}".format(
        keypoint_schema_note(export_keypoint_names(coco))
    ))
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
    for label, title in (("shaft", "Shaft angle"), ("blade", "Blade angle")):
        print("{:<12} median : {} over {} frames (humans {})".format(
            title,
            fmt(overall[label + "_angle_median"], 2),
            overall[label + "_angle_n"],
            fmt(HUMAN_BASELINE[label + "_angle_deg_median"], 2),
        ))
    for name in KEYPOINT_NAMES:
        print("{:<12} %H med : {} over {} frames (humans {})".format(
            name,
            fmt(overall[name + "_pct_median"], 2),
            overall[name + "_n"],
            fmt(HUMAN_BASELINE.get(name + "_pct_h_median"), 2),
        ))
    print("Report              : {}".format(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
