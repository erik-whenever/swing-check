#!/usr/bin/env python
"""Does the blade angle carry signal, or is it noise?

    py -3.11 training/measure_blade_stability.py
    py -3.11 training/measure_blade_stability.py --weights public/models/shaft-v2.onnx
    py -3.11 training/measure_blade_stability.py --dry-run

THERE IS NO FACIT TO MEASURE AGAINST. The calibration set -- the permanent evalset
`evaluate.py` runs on -- was annotated in the two-point schema, so it carries a human
floor for the shaft angle and none at all for the blade angle
(docs/shaft/annotation-spec.md -> *Kalibreringsutfall 2026-09*). Building one means a
second calibration pass in the four-point schema. Until that exists, accuracy is not
measurable; STABILITY is, and it is measurable on unannotated frames.

THE ARGUMENT. `heel`->`toe` is a physical line on a rigid body. Through a swing it
rotates smoothly, the way `butt`->`hosel` does. If the model's blade angle wanders
frame to frame by an order of magnitude more than its shaft angle does over the SAME
frames, the wandering is the model guessing, not the club moving. So every number below
is reported twice: once for the blade, once for the shaft beside it. The shaft column is
not decoration -- it is the yardstick, and the blade number means nothing without it.

WHAT A 90-DEGREE JUMP MEANS. `heel` and `toe` are the two ends of one short line. Swap
them and the angle moves ~180 degrees, so a jump past 90 is the signature of the model
putting toe where heel was. That is exactly the failure that cost `shaft-v1` its face-on
frames on `butt`/`hosel` (training/README.md -> *Levererande modell*), and the sole
points are a far easier place to make it: the line is shorter, and end-on it is not a
line at all -- which is why the spec makes both points `outside` there.

THE FRAMES ARE NOT ADJACENT VIDEO FRAMES, and this is the measurement's main caveat.
Each training batch samples roughly ONE frame per swing out of the ~20 the extractor
picked, so a swing only has a series at all because all three batches are read together.
The gaps that produces are real seconds -- median ~0.3 s, tail past 1 s -- and a club
rotates a long way in 0.3 s. Hence: rates are per SECOND, never per frame; `--max-gap-sec`
drops pairs too far apart to say anything; and the shaft column absorbs whatever the
sampling does, because it is subject to precisely the same gaps.

MEASURED ONLY WHERE ALL FOUR POINTS ARE PREDICTED. A frame enters the series when butt,
hosel, toe and heel all clear `--kpt-conf`. Both angles are then read off the same
frames, which is what makes the comparison a comparison. The share of frames that clears
that bar is reported first and is itself an answer: a model that rarely places toe and
heel has no blade angle to be stable or unstable about.
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import (  # noqa: E402
    angle_deg,
    angle_difference,
    fmt,
    median,
    percentile,
    predict_frame,
)
from shaft_coco import (  # noqa: E402
    KEYPOINT_NAMES,
    SHAFT_POINTS,
    SOLE_POINTS,
    ShaftDataError,
    frame_id_from_file_name,
    parse_export,
    read_coco,
    read_manifest,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
TRAINING_DATA = REPO_ROOT / "data" / "shaft" / "training"

#: All three batches by default, and that is not a convenience. One batch holds about one
#: frame per swing; the series exists only across batches. See the module docstring.
DEFAULT_BATCHES = tuple(
    TRAINING_DATA / name / "batch.zip" for name in ("batch-01", "batch-02", "batch-03")
)
DEFAULT_WEIGHTS = REPO_ROOT / "training" / "runs" / "shaft-v3" / "weights" / "best.pt"
DEFAULT_OUT = REPO_ROOT / "training" / "blade-stability.md"

#: Past this, `heel` and `toe` have changed places. Not a tunable: it follows from the
#: two points being the ends of one line, so a swap is a ~180 degree move and anything
#: past the halfway mark is closer to a swap than to a rotation.
FLIP_DEG = 90.0

#: Consecutive frames further apart than this say nothing about stability -- a club can
#: legitimately be anywhere after a second. The pairs dropped are counted in the report.
DEFAULT_MAX_GAP_SEC = 1.0

#: The two directed vectors, same definition and same order as `evaluate.py` -- one
#: place decides what "the blade angle" is, and it is the annotation spec via that file.
ANGLES = (
    ("shaft", SHAFT_POINTS[0], SHAFT_POINTS[1]),   # butt -> hosel
    ("blade", SOLE_POINTS[1], SOLE_POINTS[0]),     # heel -> toe
)

GROUP_FIELDS = ("view", "blur")

_ANNOTATED_RE = re.compile(r"^annotated-v(\d+)\.zip$", re.IGNORECASE)


# -----------------------------------------------------------------------------
# Inputs
# -----------------------------------------------------------------------------


@dataclass
class Frame:
    """One frame of one swing, located in whichever batch ZIP holds its JPEG."""

    frame_id: str
    clip_name: str
    swing_index: int
    t_sec: float
    archive: Path
    entry: str
    view: str = ""
    blur: str = ""

    @property
    def swing_key(self) -> tuple:
        """Swings are identified by clip and index, NOT by the frame id's hash prefix.

        Two batches draw from the same pool of clips, so the frames of one swing are
        spread across archives; keying on the manifest's own `clipName`/`swingIndex` is
        what puts them back together.
        """
        return (self.clip_name, self.swing_index)


@dataclass
class Swing:
    clip_name: str
    swing_index: int
    frames: list = field(default_factory=list)

    @property
    def key(self) -> tuple:
        return (self.clip_name, self.swing_index)


class FrameStore:
    """Reads frame JPEGs out of several batch ZIPs, one frame at a time.

    Not a dict of bytes: the three batches are ~200 MB of JPEG and there is no reason to
    hold them all in memory when the model consumes them one by one.
    """

    def __init__(self):
        self._open: dict = {}

    def read(self, frame: Frame) -> bytes:
        zf = self._open.get(frame.archive)
        if zf is None:
            zf = self._open[frame.archive] = zipfile.ZipFile(frame.archive)
        return zf.read(frame.entry)

    def close(self) -> None:
        for zf in self._open.values():
            zf.close()
        self._open.clear()


def index_images(batch_zip: Path) -> dict:
    """{frameId: entry name} for the JPEGs in one batch ZIP."""
    out = {}
    with zipfile.ZipFile(batch_zip) as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            if name.lower().endswith((".jpg", ".jpeg")):
                out[frame_id_from_file_name(name)] = name
    return out


def discover_annotations(batch_zip: Path):
    """The newest `annotated-vN.zip` beside a batch ZIP, or None.

    `view` and `blur` are annotator attributes and live nowhere else -- the manifest does
    not carry them. They are read here for BUCKETING ONLY; no annotated coordinate is
    used by this script, which is the whole point of a measurement that needs no facit.
    """
    best = None
    best_version = -1
    for path in sorted(batch_zip.parent.glob("annotated-v*.zip")):
        match = _ANNOTATED_RE.match(path.name)
        if match and int(match.group(1)) > best_version:
            best, best_version = path, int(match.group(1))
    return best


def read_frame_meta(annotation_zips) -> tuple:
    """{frameId: (view, blur)} plus the set of frames flagged `no_shaft`."""
    meta: dict = {}
    no_shaft: set = set()
    for path in annotation_zips:
        export = parse_export(read_coco(path))
        for frame_id, ann in export.frames.items():
            meta[frame_id] = (ann.view or "", ann.blur or "")
            if ann.no_shaft:
                no_shaft.add(frame_id)
    return meta, no_shaft


def collect_frames(batch_zips, meta=None, no_shaft=None) -> tuple:
    """Read the manifests and return `(frames, notes)`.

    A frame id seen in two batches is kept once -- batch building excludes previously
    used ids, so a repeat is a bug somewhere upstream and is reported rather than
    silently doubled into the series.
    """
    meta = meta or {}
    no_shaft = no_shaft or set()
    frames: dict = {}
    duplicates: list = []
    skipped_no_shaft = 0
    notes: list = []

    for batch_zip in batch_zips:
        images = index_images(batch_zip)
        manifest = read_manifest(batch_zip)
        missing_image = 0
        for frame_id, record in manifest.items():
            if frame_id in no_shaft:
                skipped_no_shaft += 1
                continue
            entry = images.get(frame_id)
            if entry is None:
                missing_image += 1
                continue
            if frame_id in frames:
                duplicates.append(frame_id)
                continue
            clip_name = record.get("clipName")
            swing_index = record.get("swingIndex")
            t_sec = record.get("tSec")
            if clip_name is None or swing_index is None or t_sec is None:
                raise ShaftDataError(
                    "manifest record {} in {} lacks clipName/swingIndex/tSec".format(
                        frame_id, batch_zip
                    )
                )
            view, blur = meta.get(frame_id, ("", ""))
            frames[frame_id] = Frame(
                frame_id=frame_id,
                clip_name=str(clip_name),
                swing_index=int(swing_index),
                t_sec=float(t_sec),
                archive=batch_zip,
                entry=entry,
                view=view,
                blur=blur,
            )
        if missing_image:
            notes.append(
                "{} frames i `{}`:s manifest saknar JPEG i arkivet.".format(
                    missing_image, batch_zip.name
                )
            )

    if duplicates:
        notes.append(
            "{} frame-id förekommer i mer än en batch och räknas en gång: {}".format(
                len(duplicates), ", ".join("`{}`".format(f) for f in sorted(duplicates)[:10])
            )
        )
    if skipped_no_shaft:
        notes.append(
            "{} frames är flaggade `no_shaft` av annotatören och utelämnas — där finns "
            "ingen klubba att vara stabil om.".format(skipped_no_shaft)
        )
    return list(frames.values()), notes


def group_swings(frames) -> list:
    """Frames grouped by `(clipName, swingIndex)`, each swing sorted by `tSec`.

    Swings are returned in a deterministic order (clip, then index) so two runs over the
    same input produce the same report.
    """
    buckets: dict = defaultdict(list)
    for frame in frames:
        buckets[frame.swing_key].append(frame)
    swings = []
    for (clip_name, swing_index) in sorted(buckets):
        ordered = sorted(
            buckets[(clip_name, swing_index)], key=lambda f: (f.t_sec, f.frame_id)
        )
        swings.append(Swing(clip_name=clip_name, swing_index=swing_index, frames=ordered))
    return swings


# -----------------------------------------------------------------------------
# Per-frame measurement
# -----------------------------------------------------------------------------


def point_present(points, name: str, kpt_conf: float) -> bool:
    """True when the model placed this point at or above the keypoint threshold.

    A two-point checkpoint pads toe and heel with confidence 0 (`evaluate.predict_frame`),
    so it fails this test rather than reporting a point at the origin.
    """
    if points is None:
        return False
    return points[KEYPOINT_NAMES.index(name)][2] >= kpt_conf


def points_present(points, names, kpt_conf: float) -> bool:
    return all(point_present(points, name, kpt_conf) for name in names)


def frame_complete(points, kpt_conf: float) -> bool:
    """All four points placed. The gate for entering the series -- see the docstring."""
    return points_present(points, KEYPOINT_NAMES, kpt_conf)


def predicted_angle(points, name_from: str, name_to: str):
    """Direction of one predicted vector, or None when the prediction is missing."""
    if points is None:
        return None
    index_from = KEYPOINT_NAMES.index(name_from)
    index_to = KEYPOINT_NAMES.index(name_to)
    return angle_deg(
        (points[index_from][0], points[index_from][1]),
        (points[index_to][0], points[index_to][1]),
    )


@dataclass
class Sample:
    """One frame that cleared the four-point gate, with both angles read off it."""

    frame: Frame
    angles: dict


@dataclass
class Pair:
    """Two consecutive samples of one swing, and the rate between them."""

    swing_key: tuple
    from_frame: Frame
    to_frame: Frame
    dt: float
    delta: dict          # {label: |change| in degrees, wrapped to [0, 180]}
    rate: dict           # {label: degrees per second}

    def flipped(self, label: str) -> bool:
        return self.delta[label] > FLIP_DEG

    def bucket(self, field_name: str) -> str:
        """The pair's `view`/`blur` bucket -- only when both frames agree on it.

        A pair straddling two values belongs to neither, and putting it in one of them
        would quietly attribute a rate to a condition half of it was not measured under.
        """
        a = getattr(self.from_frame, field_name) or "(osatt)"
        b = getattr(self.to_frame, field_name) or "(osatt)"
        return a if a == b else "(blandad)"


def consecutive_pairs(samples, max_gap_sec: float) -> tuple:
    """Rates between consecutive samples of ONE swing.

    Returns `(pairs, dropped_gap, dropped_dt)`. Pairs are formed between consecutive
    MEASURED samples, so a frame the model could not complete widens the gap rather than
    breaking the series -- and the widened gap is then tested against `max_gap_sec` like
    any other. Non-positive `dt` (two frames stamped at the same time) cannot carry a
    rate at all and is dropped separately, because dividing by it is the one thing that
    would turn a data problem into a spectacular number.
    """
    pairs = []
    dropped_gap = 0
    dropped_dt = 0
    for first, second in zip(samples, samples[1:]):
        dt = second.frame.t_sec - first.frame.t_sec
        if dt <= 0:
            dropped_dt += 1
            continue
        if max_gap_sec and dt > max_gap_sec:
            dropped_gap += 1
            continue
        delta = {
            label: angle_difference(second.angles[label], first.angles[label])
            for label, _f, _t in ANGLES
        }
        pairs.append(
            Pair(
                swing_key=first.frame.swing_key,
                from_frame=first.frame,
                to_frame=second.frame,
                dt=dt,
                delta=delta,
                rate={label: value / dt for label, value in delta.items()},
            )
        )
    return pairs, dropped_gap, dropped_dt


# -----------------------------------------------------------------------------
# Aggregation
# -----------------------------------------------------------------------------


def summarise(pairs) -> dict:
    """Median, p90 and flip share per angle over a set of pairs."""
    out = {"pairs": len(pairs)}
    for label, _f, _t in ANGLES:
        rates = [p.rate[label] for p in pairs]
        flips = sum(1 for p in pairs if p.flipped(label))
        out[label + "_median"] = median(rates)
        out[label + "_p90"] = percentile(rates, 0.90)
        out[label + "_flips"] = flips
        out[label + "_flip_share"] = (flips / len(pairs)) if pairs else None
    blade, shaft = out["blade_median"], out["shaft_median"]
    out["median_ratio"] = (blade / shaft) if (blade is not None and shaft) else None
    return out


def swing_instability(pairs) -> dict:
    """How unstable one swing's blade angle is, for ranking.

    The median over the swing's own pairs, not the max: with two or three pairs a single
    bad frame would otherwise decide the whole ordering. The max rides along in the table
    so a swing ranked on a quiet median with one violent pair is still visible.
    """
    rates = [p.rate["blade"] for p in pairs]
    return {
        "pairs": len(pairs),
        "blade_median": median(rates),
        "blade_max": max(rates) if rates else None,
        "shaft_median": median([p.rate["shaft"] for p in pairs]),
        "blade_flips": sum(1 for p in pairs if p.flipped("blade")),
        "shaft_flips": sum(1 for p in pairs if p.flipped("shaft")),
    }


def rank_swings(per_swing, limit: int = 10) -> list:
    """The `limit` swings with the least stable blade angle, worst first."""
    scored = [(key, swing_instability(pairs)) for key, pairs in per_swing.items() if pairs]
    scored.sort(key=lambda item: (-item[1]["blade_median"], -item[1]["blade_max"], item[0]))
    return scored[:limit]


# -----------------------------------------------------------------------------
# The run
# -----------------------------------------------------------------------------


def measure(model, swings, store, args) -> dict:
    """Run the model over every frame and build the pair series, swing by swing."""
    coverage = Counter()
    point_hits = Counter()
    per_swing: dict = {}
    all_pairs: list = []
    dropped_gap = 0
    dropped_dt = 0
    gaps: list = []

    for swing in swings:
        samples = []
        for frame in swing.frames:
            coverage["frames"] += 1
            points, _box_conf = predict_frame(model, store.read(frame), args)
            if points is None:
                coverage["no_detection"] += 1
                continue
            coverage["detected"] += 1
            for name in KEYPOINT_NAMES:
                if point_present(points, name, args.kpt_conf):
                    point_hits[name] += 1
            if points_present(points, SHAFT_POINTS, args.kpt_conf):
                coverage["shaft_pair"] += 1
            if not frame_complete(points, args.kpt_conf):
                continue
            coverage["complete"] += 1
            samples.append(
                Sample(
                    frame=frame,
                    angles={
                        label: predicted_angle(points, name_from, name_to)
                        for label, name_from, name_to in ANGLES
                    },
                )
            )

        pairs, gap_drops, dt_drops = consecutive_pairs(samples, args.max_gap_sec)
        dropped_gap += gap_drops
        dropped_dt += dt_drops
        gaps.extend(p.dt for p in pairs)
        per_swing[swing.key] = pairs
        all_pairs.extend(pairs)

    return {
        "coverage": coverage,
        "point_hits": point_hits,
        "per_swing": per_swing,
        "pairs": all_pairs,
        "dropped_gap": dropped_gap,
        "dropped_dt": dropped_dt,
        "gaps": gaps,
        "swings_with_pairs": sum(1 for pairs in per_swing.values() if pairs),
    }


# -----------------------------------------------------------------------------
# Report
# -----------------------------------------------------------------------------


def share(numerator: int, denominator: int) -> str:
    if not denominator:
        return "--"
    return "{:.0f} %".format(100.0 * numerator / denominator)


def render_report(result, swings, args, notes) -> str:
    coverage = result["coverage"]
    overall = summarise(result["pairs"])
    gaps = result["gaps"]
    lines = []
    add = lines.append

    add("# Bladvinkelns stabilitet över en sving")
    add("")
    add("Genererad {} av `training/measure_blade_stability.py`.".format(
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ))
    add("")
    add("| | |")
    add("|---|---|")
    add("| Vikter | `{}` |".format(args.weights))
    add("| Batchar | {} |".format(
        ", ".join("`{}`".format(b.parent.name) for b in args.batches)))
    add("| `imgsz` | {} |".format(args.imgsz))
    add("| Detektionströskel (`--conf`) | {} |".format(args.conf))
    add("| Punktströskel (`--kpt-conf`) | {} |".format(args.kpt_conf))
    add("| Största tillåtna tidssteg (`--max-gap-sec`) | {} s |".format(args.max_gap_sec))
    add("| Svingar | {} |".format(len(swings)))
    add("| Frames | {} |".format(coverage["frames"]))
    add("")

    if notes:
        add("## 0. Anmärkningar")
        add("")
        for note in notes:
            add("- {}".format(note))
        add("")

    add("## 1. Vad som mäts, och varför just detta")
    add("")
    add(
        "**Det finns inget facit.** Kalibreringssetet — det permanenta evalsetet i "
        "`evaluate.py` — annoterades i tvåpunktsschemat och bär ett människogolv för "
        "skaftvinkeln men **inget för bladvinkeln**. Tills ett fyrapunktspass finns går "
        "träffsäkerheten inte att mäta. **Stabiliteten går**, och den kräver inga "
        "annoteringar alls."
    )
    add("")
    add(
        "**Skaftvinkeln är måttstocken, inte utsmyckning.** `heel→toe` sitter på samma "
        "stela kropp som `butt→hosel` och roterar lika jämnt genom svingen. Varje tal "
        "nedan står därför i par: bladets siffra bredvid skaftets, mätt på **samma "
        "frames**. Ligger bladet i samma storleksordning som skaftet bär det troligen "
        "signal; ligger det en storleksordning över är det modellen som gissar."
    )
    add("")
    add(
        "**Ett hopp över {:.0f}° betyder att `toe` och `heel` bytt plats.** De är två "
        "ändar på en kort linje — en omkastning flyttar vinkeln ~180°, så allt bortom "
        "halvvägs ligger närmare en omkastning än en rotation.".format(FLIP_DEG)
    )
    add("")

    add("## 2. Täckning — predicerar modellen alla fyra punkterna?")
    add("")
    add("| | Frames | Andel |")
    add("|---|---:|---:|")
    add("| Frames totalt | {} | |".format(coverage["frames"]))
    add("| Detektion alls | {} | {} |".format(
        coverage["detected"], share(coverage["detected"], coverage["frames"])))
    add("| `butt`+`hosel` över tröskeln | {} | {} |".format(
        coverage["shaft_pair"], share(coverage["shaft_pair"], coverage["frames"])))
    add("| **Alla fyra över tröskeln (mätmängden)** | **{}** | **{}** |".format(
        coverage["complete"], share(coverage["complete"], coverage["frames"])))
    add("")
    add("| Punkt | Predicerad på | Andel |")
    add("|---|---:|---:|")
    for name in KEYPOINT_NAMES:
        add("| `{}` | {} | {} |".format(
            name, result["point_hits"][name],
            share(result["point_hits"][name], coverage["frames"])))
    add("")
    add(
        "**Den fetstilta raden är förutsättningen för allt nedanför.** Predicerar "
        "modellen sällan `toe` och `heel` är det svaret i sig: då finns ingen bladvinkel "
        "att vara stabil eller instabil om, och resten av rapporten mäter en delmängd som "
        "kan vara godtyckligt lättare än setet."
    )
    add("")

    add("## 3. Tidssteg mellan konsekutiva frames")
    add("")
    add("| Mått | Värde |")
    add("|---|---:|")
    add("| Mätta par | {} |".format(len(gaps)))
    add("| Svingar med minst ett par | {} av {} |".format(
        result["swings_with_pairs"], len(swings)))
    add("| Tidssteg, median | {} |".format(fmt(median(gaps), 3, " s")))
    add("| Tidssteg, p90 | {} |".format(fmt(percentile(gaps, 0.90), 3, " s")))
    add("| Par förkastade, tidssteg > {} s | {} |".format(
        args.max_gap_sec, result["dropped_gap"]))
    add("| Par förkastade, tidssteg ≤ 0 | {} |".format(result["dropped_dt"]))
    add("")
    add(
        "**Detta är mätningens huvudreservation.** Frames:en är inte grannbilder i video "
        "— varje batch drar ungefär *en* frame per sving ur de ~20 extraktorn valde, och "
        "en sving har en serie alls bara för att alla tre batchar läses ihop. "
        "Mellanrummen är riktiga sekunder, och en klubba hinner långt på en tredjedels "
        "sekund. Därför mäts allt **per sekund**, aldrig per frame — och därför står "
        "skaftkolumnen bredvid: den bär exakt samma glesa sampling."
    )
    add("")

    add("## 4. Vinkeländring per sekund")
    add("")
    add("| Mått | Bladvinkel | Skaftvinkel | Kvot blad/skaft |")
    add("|---|---:|---:|---:|")
    add("| Median \\|Δv/Δt\\| | {} | {} | {} |".format(
        fmt(overall["blade_median"], 1, " °/s"), fmt(overall["shaft_median"], 1, " °/s"),
        fmt(overall["median_ratio"], 2, "×")))
    add("| p90 \\|Δv/Δt\\| | {} | {} | -- |".format(
        fmt(overall["blade_p90"], 1, " °/s"), fmt(overall["shaft_p90"], 1, " °/s")))
    add("| Par med hopp > {:.0f}° | {} ({}) | {} ({}) | -- |".format(
        FLIP_DEG,
        overall["blade_flips"], share(overall["blade_flips"], overall["pairs"]),
        overall["shaft_flips"], share(overall["shaft_flips"], overall["pairs"])))
    add("")
    add(
        "Kvoten är talet att läsa. Nära 1 betyder att bladvinkeln rör sig som "
        "skaftvinkeln gör, alltså som en fysisk linje på samma klubba. Storleksordningar "
        "över betyder att den rör sig som brus."
    )
    add("")
    add(
        "**Skaftets hoppandel är inte noll och ska inte vara det.** Med tidssteg runt "
        "{} roterar en klubba verkligt mer än {:.0f}° i nedsvinget. Skaftkolumnen säger "
        "alltså hur stor del av bladets hopp som den glesa samplingen ensam förklarar; "
        "det som ligger däröver är omkastningar.".format(
            fmt(median(gaps), 2, " s"), FLIP_DEG)
    )
    add("")

    add("## 5. Per `view` och `blur`")
    add("")
    for field_name in GROUP_FIELDS:
        add("### `{}`".format(field_name))
        add("")
        buckets: dict = defaultdict(list)
        for pair in result["pairs"]:
            buckets[pair.bucket(field_name)].append(pair)
        if not buckets:
            add("Inga par att dela upp.")
            add("")
            continue
        add("| {} | Par | Blad median | Blad p90 | Skaft median | Kvot | Blad > {:.0f}° | "
            "Skaft > {:.0f}° |".format(field_name, FLIP_DEG, FLIP_DEG))
        add("|---|---:|---:|---:|---:|---:|---:|---:|")
        for key in sorted(buckets, key=lambda k: (-len(buckets[k]), k)):
            summary = summarise(buckets[key])
            add("| {} | {} | {} | {} | {} | {} | {} | {} |".format(
                key, summary["pairs"],
                fmt(summary["blade_median"], 1), fmt(summary["blade_p90"], 1),
                fmt(summary["shaft_median"], 1), fmt(summary["median_ratio"], 2, "×"),
                share(summary["blade_flips"], summary["pairs"]),
                share(summary["shaft_flips"], summary["pairs"])))
        add("")
    add(
        "`view` och `blur` är annotatörens attribut och finns bara i "
        "`annotated-v*.zip` — de läses **enbart** för den här uppdelningen. Ingen "
        "annoterad koordinat rör mätningen. `(osatt)` är en frame utan annotering, "
        "`(blandad)` ett par vars två frames bär olika värde."
    )
    add("")

    add("## 6. De tio svingarna med mest ostabil bladvinkel")
    add("")
    worst = rank_swings(result["per_swing"], limit=10)
    if not worst:
        add("Inga svingar med mätbara par.")
        add("")
    else:
        add("| # | `clipName` | `swingIndex` | Par | Blad median | Blad max | "
            "Skaft median | Hopp blad/skaft |")
        add("|---:|---|---:|---:|---:|---:|---:|---:|")
        for position, ((clip_name, swing_index), stats) in enumerate(worst, 1):
            add("| {} | `{}` | {} | {} | {} | {} | {} | {}/{} |".format(
                position, clip_name, swing_index, stats["pairs"],
                fmt(stats["blade_median"], 1, " °/s"), fmt(stats["blade_max"], 1, " °/s"),
                fmt(stats["shaft_median"], 1, " °/s"),
                stats["blade_flips"], stats["shaft_flips"]))
        add("")
        add(
            "Öppna klippet i `data/shaft/clips/<clipName>` och spola till svingen. "
            "Rangordningen går på svingens **median**, inte dess max — med två eller tre "
            "par skulle en enda dålig frame annars avgöra hela listan; maxkolumnen står "
            "kvar så att en sving med lugn median och ett våldsamt par ändå syns."
        )
        add("")
        add("Frames per sving i listan:")
        add("")
        for (clip_name, swing_index), _stats in worst:
            frame_ids = []
            for pair in result["per_swing"][(clip_name, swing_index)]:
                if not frame_ids:
                    frame_ids.append(pair.from_frame.frame_id)
                frame_ids.append(pair.to_frame.frame_id)
            add("- `{}` s{:02d}: {}".format(
                clip_name, swing_index, ", ".join("`{}`".format(f) for f in frame_ids)))
        add("")

    add("## 7. Hur siffran ska läsas")
    add("")
    add(
        "Stabilitet är **inte** träffsäkerhet. En modell som sätter `toe` och `heel` "
        "konsekvent på fel ställe — spegelvänt, eller på kronan i stället för solan — är "
        "perfekt stabil och ändå fel. Måttet kan alltså **frikänna** bladvinkeln från "
        "anklagelsen brus, men det kan inte döma den rätt. Den frågan avgörs av ett "
        "kalibreringspass i fyrapunktsschemat (annotation-spec.md → *Kalibreringsutfall "
        "2026-09*), och tills det finns är det här det bästa som går att mäta."
    )
    add("")
    add(
        "Åt andra hållet är utslaget skarpt: ligger bladets median storleksordningar "
        "över skaftets, eller hoppar den >{:.0f}° på frames där skaftet inte gör det, är "
        "bladvinkeln brus — och det svaret behöver inget facit.".format(FLIP_DEG)
    )
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
    parser.add_argument(
        "--weights",
        type=Path,
        default=DEFAULT_WEIGHTS,
        help="model weights, .pt or .onnx (default: %(default)s)",
    )
    parser.add_argument(
        "--batches",
        type=Path,
        nargs="+",
        default=list(DEFAULT_BATCHES),
        help="dataset ZIPs holding frames/ and manifest.json. All three by default: one "
        "batch carries about one frame per swing, so the series exists only across them",
    )
    parser.add_argument(
        "--annotations",
        type=Path,
        nargs="*",
        default=None,
        help="CVAT exports supplying `view`/`blur` for the breakdown. Defaults to the "
        "newest annotated-v*.zip beside each batch; pass none to skip the breakdown",
    )
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument(
        "--conf", type=float, default=0.25, help="detection confidence (default: %(default)s)"
    )
    parser.add_argument(
        "--kpt-conf",
        type=float,
        default=0.5,
        help="keypoint confidence at or above which a point counts as predicted; all "
        "four must clear it for a frame to enter the series (default: %(default)s)",
    )
    parser.add_argument(
        "--max-gap-sec",
        type=float,
        default=DEFAULT_MAX_GAP_SEC,
        help="drop consecutive pairs further apart than this; 0 keeps every pair "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--max-swings",
        type=int,
        default=0,
        help="measure only the first N swings -- a smoke run, not a measurement",
    )
    parser.add_argument("--device", default="0")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="read the manifests, group the swings, report the time steps and exit "
        "without loading the model",
    )
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    notes = []

    for path in args.batches:
        if not path.is_file():
            raise SystemExit("missing batch ZIP: {}".format(path))

    if args.annotations is None:
        annotation_zips = [p for p in (discover_annotations(b) for b in args.batches) if p]
    else:
        annotation_zips = list(args.annotations)
    for path in annotation_zips:
        if not path.is_file():
            raise SystemExit("missing annotation ZIP: {}".format(path))
    if annotation_zips:
        notes.append("`view`/`blur` från {}.".format(
            ", ".join("`{}/{}`".format(p.parent.name, p.name) for p in annotation_zips)))
    else:
        notes.append("Inga annoteringar lästa — uppdelningen per `view`/`blur` blir tom.")

    meta, no_shaft = read_frame_meta(annotation_zips)
    frames, collect_notes = collect_frames(args.batches, meta, no_shaft)
    notes.extend(collect_notes)
    swings = group_swings(frames)
    if args.max_swings:
        swings = swings[: args.max_swings]
        notes.append(
            "**Rökprov:** `--max-swings {}` — bara de första svingarna mättes. Detta är "
            "inte en mätning av setet.".format(args.max_swings)
        )

    unannotated = sum(1 for f in frames if not f.view)
    if unannotated:
        notes.append("{} av {} frames saknar `view`/`blur`.".format(unannotated, len(frames)))

    sizes = Counter(len(s.frames) for s in swings)
    single = sum(n for size, n in sizes.items() if size < 2)
    if single:
        notes.append(
            "{} svingar bär bara en frame och kan inte bidra med något par.".format(single))

    raw_gaps = []
    for swing in swings:
        raw_gaps.extend(b.t_sec - a.t_sec for a, b in zip(swing.frames, swing.frames[1:]))

    print("Batches   : {}".format(", ".join(b.parent.name for b in args.batches)))
    print("Frames    : {}".format(len(frames)))
    print("Swings    : {} (frames per swing: {})".format(
        len(swings),
        ", ".join("{}x{}".format(n, size) for size, n in sorted(sizes.items()))))
    print("Gaps      : median {} s, p90 {} s over {} pairs".format(
        fmt(median(raw_gaps), 3), fmt(percentile(raw_gaps, 0.90), 3), len(raw_gaps)))

    if args.dry_run:
        for note in notes:
            print("- {}".format(note))
        print("\n--dry-run: model not loaded, no report written.")
        return 0

    if not args.weights.is_file():
        raise SystemExit(
            "weights not found: {}\nTrain a four-point model first (training/train.py "
            "--name shaft-v3), or pass --weights.".format(args.weights)
        )

    from ultralytics import YOLO

    model = YOLO(str(args.weights))
    store = FrameStore()
    try:
        result = measure(model, swings, store, args)
    finally:
        store.close()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render_report(result, swings, args, notes), encoding="utf-8")

    coverage = result["coverage"]
    overall = summarise(result["pairs"])
    print()
    print("All four points  : {} / {} frames ({})".format(
        coverage["complete"], coverage["frames"],
        share(coverage["complete"], coverage["frames"])))
    for name in SOLE_POINTS:
        print("  {:<15}: {}".format(
            name, share(result["point_hits"][name], coverage["frames"])))
    print("Measured pairs   : {} over {} swings".format(
        overall["pairs"], result["swings_with_pairs"]))
    print("Blade |dv/dt|    : median {} p90 {}".format(
        fmt(overall["blade_median"], 1, " deg/s"), fmt(overall["blade_p90"], 1, " deg/s")))
    print("Shaft |dv/dt|    : median {} p90 {}".format(
        fmt(overall["shaft_median"], 1, " deg/s"), fmt(overall["shaft_p90"], 1, " deg/s")))
    print("Ratio blade/shaft: {}".format(fmt(overall["median_ratio"], 2)))
    print("Jumps > {:.0f} deg   : blade {}  shaft {}".format(
        FLIP_DEG,
        share(overall["blade_flips"], overall["pairs"]),
        share(overall["shaft_flips"], overall["pairs"])))
    print("Report           : {}".format(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
