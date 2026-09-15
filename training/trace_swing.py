#!/usr/bin/env python
"""Does the blade angle follow a path, or does it jump? Ask every frame, not every 10th.

    py -3.11 training/trace_swing.py data/shaft/clips/002.mp4
    py -3.11 training/trace_swing.py data/shaft/clips/002.mp4 --kpt-conf-blade 0.05
    py -3.11 training/trace_swing.py data/shaft/clips/002.mp4 --max-frames 60

WHY THE DENSE TIME STEP IS THE WHOLE POINT. `measure_blade_stability.py` measures the
same two angles, but only on the frames the training batches sampled -- roughly one per
swing per batch, median gap ~0.3 s. A club rotates a long way in 0.3 s, so that script
can only report a RATE and let the shaft column absorb the sampling. It cannot show a
SHAPE. At 30 fps the step is ~0.033 s, an order of magnitude finer, and at that spacing
the difference between "the club is rotating" and "the model is guessing" is visible to
the eye: a rotation draws a smooth ramp, a guess draws hash.

TWO THRESHOLDS, NOT ONE, and that is a finding rather than a convenience. The model is
systematically less sure about the clubhead than about the shaft: at the single
`--kpt-conf 0.5` that `measure_blade_stability.py` applies to all four points, toe and
heel cleared it on 0 % of frames -- no blade angle at all -- while 0.1 cleared 80 %.
Forcing one threshold over both pairs therefore does not make the measurement stricter,
it makes it empty. So `--kpt-conf-shaft` (0.5) gates butt/hosel and `--kpt-conf-blade`
(0.1) gates toe/heel, each angle is admitted on its own two points, and the coverage of
all four is printed so the reader can see what each bar bought. A blade angle read at
0.1 is a weak claim, and the trace exists precisely to judge how weak.

GAPS ARE DATA. A frame the model cannot complete leaves a hole -- in the CSV as empty
fields, in the plot as a break in the line plus a mark on the axis. Nothing is
interpolated across it. An interpolated blade angle would draw exactly the smooth curve
this script is trying to test for, which is the one lie that would make the output
worthless.

THE WRAP. `atan2` returns (-180, 180], so a club rotating steadily through that seam
drops 360 degrees in one frame and the raw series shows a cliff where the motion is
smooth. The CSV keeps the raw wrapped value; the PLOT shows the series UNWRAPPED
(`unwrap` below): each step between consecutive measured frames is taken the short way
round (`signed_angle_delta`, the signed twin of `evaluate.angle_difference`) and
accumulated, so a wrap passage is drawn as the straight line it is and the y-axis leaves
+-180 behind. Two consequences worth stating. First, a genuine toe/heel SWAP is a real
~180 degree move; the short way round cannot disambiguate its sign, but its magnitude
survives unwrapping and still draws as a cliff -- so swaps stay visible, and they are
counted separately at `FLIP_DEG`. Second, across a gap the short-way-round assumption is
a guess about frames nobody measured: the line is broken there, but the running offset
carries over, so a segment after a long hole may sit a whole turn from where it belongs.
The rate statistics never touch the unwrapped series -- they use `angle_difference` on
the raw values, which is wrap-correct by construction.
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import (  # noqa: E402
    angle_difference,
    fmt,
    median,
    percentile,
    predict_frame,
)
from measure_blade_stability import (  # noqa: E402
    ANGLES,
    DEFAULT_MAX_GAP_SEC,
    DEFAULT_WEIGHTS,
    FLIP_DEG,
    point_present,
    predicted_angle,
)
from shaft_coco import KEYPOINT_NAMES, SHAFT_POINTS, SOLE_POINTS  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "training"

#: The clubhead is the hard half of the schema and the thresholds say so. See the module
#: docstring: one shared 0.5 admitted no blade angle whatsoever.
DEFAULT_KPT_CONF_SHAFT = 0.5
DEFAULT_KPT_CONF_BLADE = 0.1

#: Chart surface, ink and the two categorical hues in fixed slot order -- shaft is slot
#: one, blade is slot two, and they keep those hues in both panels. Checked for
#: colour-vision separation rather than picked by eye: the pair sits at dE 24.7 under
#: protanopia and 33.6 for normal vision against this surface.
INK = "#0b0b0b"
INK_MUTED = "#898781"
SURFACE = "#fcfcfb"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
SHAFT_COLOR = "#2a78d6"
BLADE_COLOR = "#eb6834"
#: Reserved for the two absence marks, and used for nothing else.
MISSING_COLOR = "#d03b3b"
NO_DETECTION_COLOR = "#c3c2b7"


# -----------------------------------------------------------------------------
# Angles on the circle
# -----------------------------------------------------------------------------


def signed_angle_delta(a: float, b: float) -> float:
    """`b - a` taken the short way round the circle, in [-180, 180].

    The signed twin of `evaluate.angle_difference`, whose absolute value it equals by
    construction -- the two must never disagree, or the plotted series and the reported
    rates would describe different motions. Exactly half a turn resolves to -180, which
    is arbitrary and unavoidable: at 180 degrees there is no short way round.
    """
    return (b - a + 180.0) % 360.0 - 180.0


def unwrap(values):
    """Lift a wrapped angle series onto a continuous one; `None` stays `None`.

    Each measured value is placed one short-way-round step from the previous MEASURED
    value, so the series never falls 360 degrees where the club merely passed the seam.
    Holes keep their holes -- no value is invented for them -- but the running offset
    carries across, which is the guess the module docstring flags.
    """
    out = []
    offset = 0.0
    previous = None
    for value in values:
        if value is None:
            out.append(None)
            continue
        if previous is not None:
            offset += signed_angle_delta(previous, value) - (value - previous)
        out.append(value + offset)
        previous = value
    return out


# -----------------------------------------------------------------------------
# Frames
# -----------------------------------------------------------------------------


@dataclass
class Traced:
    """One decoded video frame and whatever the model made of it."""

    index: int
    t_sec: float
    #: `[(x, y, conf)] * 4` in `KEYPOINT_NAMES` order, or None when nothing was detected.
    points: list
    box_conf: float
    #: {label: degrees or None} -- None when this angle's own two points did not clear.
    angles: dict

    @property
    def detected(self) -> bool:
        return self.points is not None


def thresholds(kpt_conf_shaft: float, kpt_conf_blade: float) -> dict:
    """{keypoint: the threshold that keypoint is judged by}."""
    return {
        name: (kpt_conf_shaft if name in SHAFT_POINTS else kpt_conf_blade)
        for name in KEYPOINT_NAMES
    }


def frame_angles(points, gates: dict) -> dict:
    """Both angles off one prediction, each admitted on its OWN two points.

    An angle is a property of its own pair, so a missing toe must not cost the shaft its
    reading -- which is what the single four-point gate in `measure_blade_stability.py`
    does, and part of why that gate reported no blade angles at all at 0.5.
    """
    out = {}
    for label, name_from, name_to in ANGLES:
        ok = all(point_present(points, name, gates[name]) for name in (name_from, name_to))
        out[label] = predicted_angle(points, name_from, name_to) if ok else None
    return out


def decode(path: Path, max_frames: int = 0):
    """Yield `(index, pos_sec, fps, jpeg_bytes)` for every frame of a clip, in order.

    TIMESTAMPS COME FROM THE CONTAINER when it will give them. Phone clips are often
    variable frame rate, so `index / fps` is a guess there, while `CAP_PROP_POS_MSEC` is
    the frame's own presentation time. Read it AFTER the grab, not before: before the
    grab the property still holds the PREVIOUS frame's time, which is a one-frame shift
    that looks entirely plausible on a plot. Both are yielded and `resolve_times` picks;
    which one was used is printed rather than left to be inferred from the x-axis.

    JPEG, not the raw array, because `evaluate.predict_frame` takes encoded bytes -- and
    that function IS the letterbox: it hands Ultralytics a BGR array at `--imgsz` and
    lets its own `LetterBox` do the padding, identically to every other measurement in
    this directory. Re-encoding also puts each frame through the same lossy step the
    training frames went through, so the model sees the kind of image it was trained on.
    """
    import cv2

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise SystemExit("could not open clip: {}".format(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        index = 0
        while True:
            if max_frames and index >= max_frames:
                break
            ok, bgr = capture.read()
            if not ok:
                break
            pos_msec = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0.0)
            ok, buffer = cv2.imencode(".jpg", bgr)
            if not ok:
                raise SystemExit("cv2.imencode failed on frame {}".format(index))
            yield index, pos_msec / 1000.0, fps, buffer.tobytes()
            index += 1
    finally:
        capture.release()


def resolve_times(raw_times, fps: float) -> tuple:
    """Container timestamps when they are usable, `index / fps` when they are not.

    Returns `(times, source)`. "Usable" means strictly increasing: a repeated or falling
    timestamp hands the rate statistics a zero or negative `dt`, and dividing by that is
    the one data problem that turns into a spectacular number rather than a missing one.
    """
    usable = len(raw_times) > 1 and all(b > a for a, b in zip(raw_times, raw_times[1:]))
    if usable:
        return list(raw_times), "container (CAP_PROP_POS_MSEC)"
    if fps > 0:
        return [i / fps for i in range(len(raw_times))], "index / fps ({:.3f})".format(fps)
    raise SystemExit(
        "clip carries neither increasing timestamps nor a frame rate; there is nothing "
        "to plot against time"
    )


# -----------------------------------------------------------------------------
# Statistics
# -----------------------------------------------------------------------------


def coverage(traced, gates: dict) -> dict:
    """How often each point, and then each angle, was actually available."""
    out = {
        "frames": len(traced),
        "detected": sum(1 for item in traced if item.detected),
        "points": {name: 0 for name in KEYPOINT_NAMES},
        "angles": {label: 0 for label, _from, _to in ANGLES},
        "all_four": 0,
    }
    for item in traced:
        for name in KEYPOINT_NAMES:
            if point_present(item.points, name, gates[name]):
                out["points"][name] += 1
        if all(point_present(item.points, name, gates[name]) for name in KEYPOINT_NAMES):
            out["all_four"] += 1
        for label in out["angles"]:
            if item.angles.get(label) is not None:
                out["angles"][label] += 1
    return out


def step_rates(traced, label: str, max_gap_sec: float) -> dict:
    """|d angle / dt| between consecutive frames that BOTH carry this angle.

    Computed on the raw wrapped values through `angle_difference`, never on the unwrapped
    plotting series: unwrapping carries an assumption across holes, and a statistic must
    not inherit it. A frame the model could not complete widens the step rather than
    breaking the series, and the widened step is then tested against `max_gap_sec` like
    any other -- so `--max-gap-sec 0.2` at 30 fps is how to ask for rates measured only
    across small holes.
    """
    values = []
    deltas = []
    dropped_gap = 0
    dropped_dt = 0
    previous = None
    for item in traced:
        if item.angles.get(label) is None:
            continue
        if previous is not None:
            dt = item.t_sec - previous.t_sec
            if dt <= 0:
                dropped_dt += 1
            elif max_gap_sec and dt > max_gap_sec:
                dropped_gap += 1
            else:
                delta = angle_difference(item.angles[label], previous.angles[label])
                deltas.append(delta)
                values.append(delta / dt)
        previous = item
    return {
        "steps": len(values),
        "median": median(values),
        "p90": percentile(values, 0.90),
        "median_step_deg": median(deltas),
        "flips": sum(1 for d in deltas if d > FLIP_DEG),
        "dropped_gap": dropped_gap,
        "dropped_dt": dropped_dt,
    }


def runs_of_missing(traced, predicate) -> list:
    """Contiguous `(t_start, t_end)` spans where `predicate` holds, for shading.

    Spans rather than per-frame marks: at 30 fps a two-second hole is 60 marks, and 60
    marks drawn beside each other read as one solid block whose length is guesswork.
    """
    spans = []
    start = None
    end = None
    for item in traced:
        if predicate(item):
            if start is None:
                start = item.t_sec
            end = item.t_sec
        elif start is not None:
            spans.append((start, end))
            start = None
    if start is not None:
        spans.append((start, end))
    return spans


# -----------------------------------------------------------------------------
# Output
# -----------------------------------------------------------------------------


def csv_rows(traced, unwrapped: dict):
    """Header row, then one row per DECODED frame -- holes included, as empty fields."""
    header = ["frame", "t_sec", "detected", "box_conf"]
    for name in KEYPOINT_NAMES:
        header += [name + "_x", name + "_y", name + "_conf"]
    for label, _from, _to in ANGLES:
        header += [label + "_angle_deg", label + "_angle_unwrapped_deg"]
    yield header

    for position, item in enumerate(traced):
        row = [
            item.index,
            "{:.4f}".format(item.t_sec),
            1 if item.detected else 0,
            "{:.4f}".format(item.box_conf) if item.detected else "",
        ]
        for i in range(len(KEYPOINT_NAMES)):
            if item.points is None:
                row += ["", "", ""]
            else:
                x, y, conf = item.points[i]
                row += ["{:.2f}".format(x), "{:.2f}".format(y), "{:.4f}".format(conf)]
        for label, _from, _to in ANGLES:
            raw = item.angles.get(label)
            lifted = unwrapped[label][position]
            row += [
                "" if raw is None else "{:.3f}".format(raw),
                "" if lifted is None else "{:.3f}".format(lifted),
            ]
        yield row


def write_csv(path: Path, traced, unwrapped: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerows(csv_rows(traced, unwrapped))


def _style_axes(ax) -> None:
    ax.set_facecolor(SURFACE)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(AXIS)
    ax.tick_params(colors=INK_MUTED, labelsize=9)


def write_plot(path: Path, traced, unwrapped: dict, clip_name: str, gates: dict) -> None:
    """Two stacked panels, one angle each, sharing the time axis.

    NOT two lines on twin y-scales in one panel. The angles are separate measurements of
    separate pairs, admitted at separate thresholds, with separate holes; overlaying them
    on two scales lets the eye read a crossing or a convergence into what is only a
    choice of axis limits. Stacked and sharing x, the same instant is the same column and
    nothing else is implied.
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    times = [item.t_sec for item in traced]
    no_detection = runs_of_missing(traced, lambda item: not item.detected)

    figure, axes = plt.subplots(2, 1, figsize=(13, 7.5), sharex=True, dpi=150)
    figure.patch.set_facecolor(SURFACE)

    panels = (
        (axes[0], "shaft", SHAFT_COLOR, "Skaftvinkel  butt → hosel", SHAFT_POINTS[0]),
        (axes[1], "blade", BLADE_COLOR, "Bladvinkel  heel → toe", SOLE_POINTS[0]),
    )

    for ax, label, color, title, gate_point in panels:
        _style_axes(ax)
        for start, end in no_detection:
            ax.axvspan(start, end, color=NO_DETECTION_COLOR, alpha=0.35, linewidth=0)

        series = [float("nan") if value is None else value for value in unwrapped[label]]
        ax.plot(times, series, color=color, linewidth=2.0, solid_capstyle="round")

        if all(value is None for value in unwrapped[label]):
            # An empty panel still gets ticks, and matplotlib invents a +-0.05 scale for
            # them. Degrees that were never measured must not be printed on an axis.
            ax.set_yticks([])
            ax.text(
                0.5, 0.55, "ingen vinkel över tröskeln i någon bildruta",
                transform=ax.transAxes, ha="center", va="center",
                color=INK_MUTED, fontsize=11,
            )

        # Detected, but this angle's own points fell short: a different absence from the
        # grey bands, and the one the thresholds are answerable for.
        below = [item.t_sec for item in traced
                 if item.detected and item.angles.get(label) is None]
        if below:
            ax.plot(
                below, [0.02] * len(below), "|",
                color=MISSING_COLOR, markersize=7, markeredgewidth=1.2,
                transform=ax.get_xaxis_transform(),
            )

        ax.set_title(
            "{}   (tröskel {:.2f})".format(title, gates[gate_point]),
            color=INK, fontsize=12, loc="left", pad=10,
        )
        ax.set_ylabel("grader, uppvecklad", color=INK_MUTED, fontsize=9)

    axes[1].set_xlabel("sekunder", color=INK_MUTED, fontsize=9)
    if len(times) > 1:
        axes[1].set_xlim(times[0], times[-1])

    handles = [
        Patch(facecolor=NO_DETECTION_COLOR, alpha=0.35,
              label="ingen detektion i bildrutan"),
        Line2D([0], [0], color=MISSING_COLOR, linestyle="none", marker="|", markersize=7,
               markeredgewidth=1.2, label="detektion, men punkten under tröskeln"),
    ]
    figure.legend(
        handles=handles, loc="lower left", bbox_to_anchor=(0.06, 0.005), frameon=False,
        fontsize=9, labelcolor=INK_MUTED, ncols=2,
    )

    figure.suptitle(
        "{} — vinklar per bildruta".format(clip_name),
        color=INK, fontsize=15, x=0.06, ha="left", y=0.975,
    )
    figure.text(
        0.06, 0.935,
        "Kurvorna är uppvecklade: varje steg tas kortaste vägen runt cirkeln och "
        "summeras, så en passage genom ±180° ritas rak i stället för som ett "
        "360°-fall.\nLuckor bryts, aldrig interpoleras — och uppvecklingen "
        "för offseten över dem, så ett segment efter en lång lucka kan ligga ett helt "
        "varv fel. CSV:n bär rådata ovecklad.",
        color=INK_MUTED, fontsize=9, ha="left", va="top", linespacing=1.5,
    )

    figure.tight_layout(rect=(0.0, 0.045, 1.0, 0.9))
    path.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(path, facecolor=SURFACE)
    plt.close(figure)


def share(numerator: int, denominator: int) -> str:
    if not denominator:
        return "--"
    return "{} ({:.0f} %)".format(numerator, 100.0 * numerator / denominator)


# -----------------------------------------------------------------------------
# Driver
# -----------------------------------------------------------------------------


def trace(model, clip: Path, args) -> tuple:
    """Run the model over every frame of the clip. Returns `(traced, time_source)`."""
    gates = thresholds(args.kpt_conf_shaft, args.kpt_conf_blade)
    raw_times = []
    fps = 0.0
    pending = []
    for index, pos_sec, frame_fps, jpeg in decode(clip, args.max_frames):
        fps = frame_fps or fps
        raw_times.append(pos_sec)
        points, box_conf = predict_frame(model, jpeg, args)
        pending.append((index, points, box_conf))
        if args.progress and index and index % args.progress == 0:
            print("  bildruta {}…".format(index), flush=True)

    if not pending:
        raise SystemExit("no frames decoded from {}".format(clip))

    times, source = resolve_times(raw_times, fps)
    traced = [
        Traced(
            index=index,
            t_sec=times[position],
            points=points,
            box_conf=box_conf,
            angles=frame_angles(points, gates),
        )
        for position, (index, points, box_conf) in enumerate(pending)
    ]
    return traced, source


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "clip", type=Path, help="video file to trace, e.g. data/shaft/clips/002.mp4"
    )
    parser.add_argument(
        "--weights",
        type=Path,
        default=DEFAULT_WEIGHTS,
        help="model weights, .pt or .onnx (default: %(default)s)",
    )
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument(
        "--conf", type=float, default=0.25, help="detection confidence (default: %(default)s)"
    )
    parser.add_argument(
        "--kpt-conf-shaft",
        type=float,
        default=DEFAULT_KPT_CONF_SHAFT,
        help="keypoint confidence butt and hosel must clear for a shaft angle "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--kpt-conf-blade",
        type=float,
        default=DEFAULT_KPT_CONF_BLADE,
        help="keypoint confidence toe and heel must clear for a blade angle. Lower than "
        "the shaft's on purpose -- the model is systematically less sure about the "
        "clubhead, and 0.5 admitted no blade angle at all (default: %(default)s)",
    )
    parser.add_argument(
        "--max-gap-sec",
        type=float,
        default=DEFAULT_MAX_GAP_SEC,
        help="drop rate steps spanning a hole longer than this; 0 keeps every step "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="stop after N frames -- a smoke run, not a trace",
    )
    parser.add_argument(
        "--progress", type=int, default=50, help="print every Nth frame index; 0 is quiet"
    )
    parser.add_argument("--device", default="0")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="where trace-<clip>.png and trace-<clip>.csv are written "
        "(default: %(default)s)",
    )
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    if not args.clip.is_file():
        raise SystemExit("missing clip: {}".format(args.clip))
    if not args.weights.is_file():
        raise SystemExit(
            "weights not found: {}\nTrain a four-point model first (training/train.py "
            "--name shaft-v3), or pass --weights.".format(args.weights)
        )

    from ultralytics import YOLO

    gates = thresholds(args.kpt_conf_shaft, args.kpt_conf_blade)

    print("Klipp     : {}".format(args.clip))
    print("Vikter    : {}".format(args.weights))
    print("Trösklar  : skaft {:.2f} · blad {:.2f}".format(
        args.kpt_conf_shaft, args.kpt_conf_blade))
    print()

    model = YOLO(str(args.weights))
    traced, time_source = trace(model, args.clip, args)

    unwrapped = {
        label: unwrap([item.angles.get(label) for item in traced])
        for label, _from, _to in ANGLES
    }

    png = args.out_dir / "trace-{}.png".format(args.clip.stem)
    csv_path = args.out_dir / "trace-{}.csv".format(args.clip.stem)
    write_csv(csv_path, traced, unwrapped)
    write_plot(png, traced, unwrapped, args.clip.name, gates)

    stats = coverage(traced, gates)
    frames = stats["frames"]
    steps = {label: step_rates(traced, label, args.max_gap_sec)
             for label, _from, _to in ANGLES}
    dts = [b.t_sec - a.t_sec for a, b in zip(traced, traced[1:])]

    print()
    print("Bildrutor        : {}".format(frames))
    print("Tidsaxel         : {}".format(time_source))
    print("Tidssteg (median): {}".format(fmt(median(dts), 4, " s")))
    print("Med detektion    : {}".format(share(stats["detected"], frames)))
    print("Täckning per punkt (vid respektive tröskel):")
    for name in KEYPOINT_NAMES:
        print("  {:<6} @ {:.2f} : {}".format(
            name, gates[name], share(stats["points"][name], frames)))
    print("  alla fyra      : {}".format(share(stats["all_four"], frames)))
    print("Vinkel tillgänglig:")
    for label, _from, _to in ANGLES:
        print("  {:<6}         : {}".format(label, share(stats["angles"][label], frames)))
    print()
    print("|Δvinkel/Δt| mellan angränsande mätta bildrutor "
          "(steg över {:.2f} s förkastade):".format(args.max_gap_sec))
    for label, _from, _to in ANGLES:
        row = steps[label]
        print("  {:<6}: median {:>10}  p90 {:>10}  ({} steg, mediansteg {})".format(
            label,
            fmt(row["median"], 1, " °/s"),
            fmt(row["p90"], 1, " °/s"),
            row["steps"],
            fmt(row["median_step_deg"], 2, " °"),
        ))
    for label, _from, _to in ANGLES:
        row = steps[label]
        print("  {:<6}: hopp > {:.0f}° {} · förkastade {} lucka / {} dt<=0".format(
            label, FLIP_DEG, share(row["flips"], row["steps"]),
            row["dropped_gap"], row["dropped_dt"]))
    print()
    print("Graf             : {}".format(png))
    print("Rådata           : {}".format(csv_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
