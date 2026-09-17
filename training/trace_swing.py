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

MANY CLIPS, AND THE QUESTION THAT NEEDS THEM. One clip showed a pattern -- on
`002.mp4` the blade angle is smooth while the club sits still and turns to hash the
moment the head moves -- and one clip cannot tell whether that pattern is the model or
that clip. `--clips` runs the same per-frame trace over several clips (files, or a
directory) and writes ONE cross-clip report, `training/blade-usability.md`, which asks
what PREDICTS the hash. Single-clip mode is unchanged: one clip in, one plot and one CSV
out, no report.

THE TWO CANDIDATE PREDICTORS ARE NOT EQUALLY USEFUL. If the swing phase predicts it,
the blade angle is usable in the quiet parts of a swing and nowhere else, and nothing in
the model fixes that. If the model's own confidence on toe/heel predicts it, a
confidence gate is enough -- the model already knows when it is guessing, and the reader
only has to find the bar. So every table below is cut by confidence FIRST, then by phase
and by blur, and the recommendation at the end is a number: the toe/heel confidence at
which the blade angle moves no faster than the shaft angle does, and the share of frames
that clears it.

THE SHAFT COLUMN IS THE YARDSTICK, not decoration -- the same argument
`measure_blade_stability.py` is built on. `butt`->`hosel` and `heel`->`toe` sit on one
rigid body, so over the same two frames they rotate by comparable amounts; a blade that
moves an order of magnitude faster is the model guessing, not the club turning. Every
cross-clip row therefore reports both angles over the SAME steps: a step enters the
tables only when both angles are present at both of its endpoints.

PHASE COMES FROM THE MANIFESTS, NOT FROM A SECOND POSE RUN. `data/shaft/training/*/
batch.zip` already carries, per sampled frame, the envelope `[start, finish]` and the
impact time of the swing that frame came from -- measured once, by production's own pose
chain. Those times are read back and every traced frame of that clip is placed in them.
Only `start`, `impact` and `finish` are real measurements: the TOP is not in the
manifest, so the backswing/downswing boundary is the typical-swing shape ported from
`src/lib/dataset/datasetPhase.ts`, stretched onto the two anchored intervals. A clip
with no manifest entry gets no phase at all rather than a guessed one, and the report
says how many frames that was.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
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
    DEFAULT_BATCHES,
    DEFAULT_MAX_GAP_SEC,
    DEFAULT_WEIGHTS,
    FLIP_DEG,
    collect_frames,
    discover_annotations,
    point_present,
    predicted_angle,
    read_frame_meta,
)
from shaft_coco import (  # noqa: E402
    KEYPOINT_NAMES,
    SHAFT_POINTS,
    SOLE_POINTS,
    read_manifest,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "training"

#: The clubhead is the hard half of the schema and the thresholds say so. See the module
#: docstring: one shared 0.5 admitted no blade angle whatsoever.
DEFAULT_KPT_CONF_SHAFT = 0.5
DEFAULT_KPT_CONF_BLADE = 0.1

DEFAULT_USABILITY_OUT = REPO_ROOT / "training" / "blade-usability.md"

#: Video extensions `--clips <directory>` picks up. Case-insensitive: the own-camera
#: clips are `.MOV`/`.MP4` and the scraped ones `.mp4`.
VIDEO_SUFFIXES = (".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm")

#: Confidence buckets, as the lower edges of nine tenths: 0.1--0.2 up to 0.9--1.0.
#: Nothing below 0.1 is bucketed, because nothing below 0.1 has a blade angle to bucket
#: -- that is the floor `--kpt-conf-blade` admits points at, and a frame under it carries
#: no measurement at all rather than a bad one.
CONF_EDGES = tuple(round(0.1 * i, 1) for i in range(1, 10))

#: "Comparable to the shaft" for the recommendation: the blade's median rate over a set
#: of steps divided by the shaft's median rate over THE SAME steps. 1.0 would mean the
#: two angles wander equally; the slack above it is deliberate and small, and the report
#: prints the sweep so a reader can move the line and see what it costs.
COMPARABLE_RATIO = 1.5
#: A ratio computed from a handful of steps is noise. A threshold backed by fewer than
#: this many steps is reported but never recommended.
MIN_STEPS_FOR_RECOMMENDATION = 30
#: Share of steps that may be `toe`/`heel` swaps (> `FLIP_DEG`) for a threshold to count
#: as having stopped them. Not the same bar as `COMPARABLE_RATIO` and not a substitute
#: for it: a swap-free blade angle can still wander twice as fast as the shaft.
MAX_FLIP_SHARE = 0.01

#: Phase shape when the manifest gives no top -- ported verbatim from
#: `src/lib/dataset/datasetPhase.ts` -> FALLBACK_BOUNDS, which is what wrote the `phase`
#: field in these same manifests. Fractions of the envelope, cumulative.
PHASE_BOUNDS = (
    (0.03, "address"),
    (0.45, "backswing"),
    (0.52, "top"),
    (0.68, "downswing"),
    (0.73, "impact"),
    (0.90, "through"),
    (1.01, "finish"),
)
PHASE_ORDER = tuple(phase for _until, phase in PHASE_BOUNDS)
#: The centre of the fractional impact band above, and therefore the fraction the real
#: impact time is pinned to when the manifest carries one. Derived, never typed twice.
IMPACT_FRACTION = (0.68 + 0.73) / 2.0

#: Half-width of the `address` and `impact` point windows. The envelope landmarks were
#: located by pose sampling at 15 fps, so nothing about them is sharper than one such
#: sample -- claiming otherwise would put a 30 fps frame in a phase on 33 ms of evidence
#: the phase never had.
POINT_TOL_SEC = 1.0 / 15.0
#: How far outside its own envelope a frame may sit and still belong to that swing.
#: Beyond it the frame is between swings, which is a fact about the clip and is reported
#: as its own bucket rather than folded into `address` or `finish`.
ENVELOPE_EDGE_TOL_SEC = 0.25

#: How far from an annotated frame a `blur` label is allowed to reach. A blur label
#: describes ONE image, and motion blur changes within a tenth of a second at impact, so
#: this window is short on purpose: +-0.10 s is +-3 frames at 30 fps. Widening it would
#: buy steps by inventing labels.
DEFAULT_BLUR_WINDOW_SEC = 0.10

#: Bucket names for "we have no label here", kept distinct from a real label so no table
#: row ever quietly means two different things.
PHASE_UNKNOWN = "(inget manifest)"
PHASE_OUTSIDE = "(utanför sving)"
BLUR_NO_LABEL = "(ingen etikett nära)"
BUCKET_MIXED = "(blandad)"
BUCKET_UNSET = "(osatt)"

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
    #: Swing phase from the manifests, or one of the two "no phase" markers. Never
    #: derived from the trace itself: reading the phase off how fast the shaft angle
    #: moves and then reporting that the blade is worse in the fast phases would be a
    #: circle, not a finding.
    phase: str = PHASE_UNKNOWN
    #: `blur` from the annotated frames within the blur window, or a marker.
    blur: str = BLUR_NO_LABEL
    #: {label: (deg/s, dt)} against the previous frame carrying that angle -- written by
    #: `attach_rates`, kept per angle because the two angles drop out on different frames
    #: and therefore look back different distances.
    rates: dict = field(default_factory=dict)

    @property
    def detected(self) -> bool:
        return self.points is not None

    def keypoint_conf(self, name: str):
        """The model's confidence on one keypoint, or None when nothing was detected."""
        if self.points is None:
            return None
        return self.points[KEYPOINT_NAMES.index(name)][2]

    @property
    def blade_conf(self):
        """min(toe, heel) -- the weaker of the two points the blade angle stands on.

        The minimum and not the mean: the angle is a line through both points, so it is
        only as good as the point the model is least sure of. A mean would let a
        confident toe carry a heel the model has no idea about.
        """
        return self._pair_conf(SOLE_POINTS)

    @property
    def shaft_conf(self):
        """min(butt, hosel) -- the same rule for the yardstick."""
        return self._pair_conf(SHAFT_POINTS)

    def _pair_conf(self, names):
        if self.points is None:
            return None
        return min(self.keypoint_conf(name) for name in names)


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
# Swing phase, read back from the training manifests
# -----------------------------------------------------------------------------


def warp_fraction(f: float, start: float, finish: float, impact) -> float:
    """A fraction of the typical swing shape, placed on THIS swing's real times.

    With no impact the shape is simply stretched over `[start, finish]`, exactly as
    `datasetPhase.ts` does when the envelope carried no confident impact. With an impact
    the interval is stretched in two pieces instead, pinned at the fraction the shape
    itself puts impact at (`IMPACT_FRACTION`), so the impact bucket lands on the impact
    that was MEASURED rather than on 70 % of the way through. The backswing/downswing
    boundary keeps its proportion inside the stretched piece -- it is the one boundary
    with no measurement behind it anywhere, since the manifest carries no top.
    """
    span = finish - start
    if impact is None or not (start < impact < finish):
        return start + f * span
    if f <= IMPACT_FRACTION:
        return start + (f / IMPACT_FRACTION) * (impact - start)
    return impact + ((f - IMPACT_FRACTION) / (1.0 - IMPACT_FRACTION)) * (finish - impact)


def phase_bounds(start: float, finish: float, impact) -> list:
    """`[(t_until, phase)]` for one swing -- the shape above, resolved to seconds."""
    return [
        (warp_fraction(until, start, finish, impact), phase)
        for until, phase in PHASE_BOUNDS
    ]


@dataclass
class SwingWindow:
    """One swing's envelope, as the dataset manifest recorded it."""

    clip_name: str
    swing_index: int
    start_sec: float
    finish_sec: float
    #: Seconds, or None when the envelope carried no confident impact (ADR-002: impact
    #: is polish, never load-bearing -- and a clipped tail never gets one at all).
    impact_sec: object = None
    batch: str = ""
    bounds: list = field(default_factory=list)

    def __post_init__(self):
        self.bounds = phase_bounds(self.start_sec, self.finish_sec, self.impact_sec)

    @property
    def valid(self) -> bool:
        return self.finish_sec > self.start_sec

    def covers(self, t_sec: float) -> bool:
        return (
            self.start_sec - ENVELOPE_EDGE_TOL_SEC
            <= t_sec
            <= self.finish_sec + ENVELOPE_EDGE_TOL_SEC
        )

    def distance(self, t_sec: float) -> float:
        """Seconds from `t_sec` to this envelope, 0 inside it -- for picking a window."""
        if t_sec < self.start_sec:
            return self.start_sec - t_sec
        if t_sec > self.finish_sec:
            return t_sec - self.finish_sec
        return 0.0

    def phase_at(self, t_sec: float) -> str:
        """The phase this window puts `t_sec` in. Assumes `covers(t_sec)`."""
        if t_sec <= self.start_sec + POINT_TOL_SEC:
            return "address"
        if self.impact_sec is not None and abs(t_sec - self.impact_sec) <= POINT_TOL_SEC:
            return "impact"
        for until, phase in self.bounds:
            if t_sec < until:
                return phase
        return PHASE_ORDER[-1]


def _window_matches(window: SwingWindow, start: float, finish: float, impact) -> bool:
    same_impact = (window.impact_sec is None) == (impact is None) and (
        impact is None or abs(window.impact_sec - impact) < 1e-6
    )
    return (
        abs(window.start_sec - start) < 1e-6
        and abs(window.finish_sec - finish) < 1e-6
        and same_impact
    )


def read_swing_windows(batch_zips) -> tuple:
    """`({clipName: [SwingWindow]}, notes)` from the batch manifests.

    Every frame of a batch repeats its swing's envelope, and a swing may be sampled by
    more than one batch, so the same window is read many times. It is stored once and a
    DISAGREEMENT is counted rather than resolved: two batches describing one swing
    differently would mean the extractor's envelope moved between exports, which is a
    fact about the dataset and not something this script should quietly pick a side in.
    """
    windows: dict = {}
    notes: list = []
    conflicts = 0
    degenerate = 0

    for batch_zip in batch_zips:
        manifest = read_manifest(batch_zip)
        for record in manifest.values():
            clip_name = record.get("clipName")
            swing_index = record.get("swingIndex")
            envelope = record.get("envelopeSec")
            if clip_name is None or swing_index is None:
                continue
            if not envelope or len(envelope) != 2:
                continue
            start, finish = float(envelope[0]), float(envelope[1])
            impact = record.get("impactSec")
            impact = None if impact is None else float(impact)
            if finish <= start:
                degenerate += 1
                continue
            by_clip = windows.setdefault(str(clip_name), {})
            key = int(swing_index)
            existing = by_clip.get(key)
            if existing is None:
                by_clip[key] = SwingWindow(
                    clip_name=str(clip_name),
                    swing_index=key,
                    start_sec=start,
                    finish_sec=finish,
                    impact_sec=impact,
                    batch=batch_zip.parent.name,
                )
            elif not _window_matches(existing, start, finish, impact):
                conflicts += 1

    if conflicts:
        notes.append(
            "{} manifestposter beskriver en sving vars envelope redan lasts, med andra "
            "tider. Den forst lasta behalls; avvikelsen raknas men doljs inte.".format(
                conflicts
            )
        )
    if degenerate:
        notes.append(
            "{} manifestposter bar en envelope utan varaktighet och hoppades over."
            .format(degenerate)
        )
    return (
        {clip: [w for _i, w in sorted(by_clip.items())]
         for clip, by_clip in windows.items()},
        notes,
    )


def manifest_records(batch_zips):
    """Every manifest record of every batch, flat. One place reads the manifests."""
    for batch_zip in batch_zips:
        for record in read_manifest(batch_zip).values():
            yield record


def phase_agreement(records, windows) -> dict:
    """How often this port agrees with the `phase` the manifest itself carries.

    The manifest's own `phase` was written by `datasetPhase.ts` at export time, WITH the
    top available -- it came out of the live envelope object, which carries `topSec`.
    This port only gets `[start, finish]` and the impact back, so the backswing/top/
    downswing boundaries are the typical-swing shape rather than that swing's own top.
    Running the two against each other on the ~650 sampled frames turns that caveat from
    a disclaimer into a number, and shows WHERE the port differs rather than by how much
    in the abstract.

    Only frames the manifests sampled can be checked: they are the only ones anybody ever
    computed a phase for. It is a check on the derivation, not on the traced clips.
    """
    total = 0
    agree = 0
    confusion: Counter = Counter()
    for record in records:
        clip_name = record.get("clipName")
        t_sec = record.get("tSec")
        phase = record.get("phase")
        if not clip_name or t_sec is None or not phase:
            continue
        mine = phase_at(float(t_sec), windows.get(str(clip_name).lower()))
        total += 1
        if mine == phase:
            agree += 1
        else:
            confusion[(phase, mine)] += 1
    return {"frames": total, "agree": agree, "confusion": confusion}


def phase_at(t_sec: float, clip_windows) -> str:
    """The phase of one traced frame, given that clip's windows.

    `clip_windows` is None for a clip no batch ever sampled -- there is no envelope for
    it anywhere, so the frame gets `PHASE_UNKNOWN` and the report counts it. A frame that
    falls between two envelopes gets `PHASE_OUTSIDE`: the clip is running, but no swing
    is, and calling that `address` or `finish` would put minutes of a player standing
    around into a swing phase.
    """
    if not clip_windows:
        return PHASE_UNKNOWN
    covering = [w for w in clip_windows if w.valid and w.covers(t_sec)]
    if not covering:
        return PHASE_OUTSIDE
    return min(covering, key=lambda w: w.distance(t_sec)).phase_at(t_sec)


# -----------------------------------------------------------------------------
# `view` / `blur`, read back from the annotation exports
# -----------------------------------------------------------------------------


class FrameLabels:
    """The annotators' `view`/`blur` per clip, addressed by time.

    Read exactly the way `measure_blade_stability.py` reads them -- newest
    `annotated-v*.zip` beside each batch -- so the two reports bucket on the same labels.
    Nothing here reads an annotated COORDINATE: there is still no four-point facit, and
    this script does not pretend otherwise.
    """

    def __init__(self, frames):
        self._by_clip: dict = {}
        for frame in frames:
            self._by_clip.setdefault(frame.clip_name, []).append(frame)
        for items in self._by_clip.values():
            items.sort(key=lambda f: f.t_sec)

    def clips(self) -> list:
        return sorted(self._by_clip)

    def frames_for(self, clip_name: str) -> list:
        return self._by_clip.get(clip_name, [])

    def counts(self, clip_name: str, attribute: str) -> Counter:
        return Counter(
            getattr(f, attribute) or BUCKET_UNSET for f in self.frames_for(clip_name)
        )

    def blur_at(self, clip_name: str, t_sec: float, window_sec: float) -> str:
        """The `blur` label in force at `t_sec`, or a marker saying there is none.

        A label reaches `window_sec` in each direction and no further (see the constant).
        Two annotated frames inside the same window that disagree give `BUCKET_MIXED` --
        blur changing within a tenth of a second is exactly what blur does around impact,
        and picking the nearer label would hide that rather than report it.
        """
        near = [
            f for f in self.frames_for(clip_name) if abs(f.t_sec - t_sec) <= window_sec
        ]
        if not near:
            return BLUR_NO_LABEL
        labels = {f.blur or BUCKET_UNSET for f in near}
        if len(labels) == 1:
            return next(iter(labels))
        return BUCKET_MIXED


# -----------------------------------------------------------------------------
# Steps: one pair of frames, both angles
# -----------------------------------------------------------------------------


@dataclass
class Step:
    """Two consecutive frames that BOTH carry BOTH angles, and the rates between them.

    Both angles on the same two frames is the whole comparison. A blade step measured
    over frames where the shaft angle was missing would have no yardstick beside it, so
    those are counted and dropped rather than kept one-sided.
    """

    clip_name: str
    from_frame: Traced
    to_frame: Traced
    dt: float
    delta: dict          # {label: |change| in degrees, wrapped to [0, 180]}
    rate: dict           # {label: degrees per second}

    def flipped(self, label: str) -> bool:
        return self.delta[label] > FLIP_DEG

    @property
    def blade_conf(self) -> float:
        """The weakest toe/heel confidence anywhere in the pair.

        A threshold means "every frame used clears it", so a step is admitted at the
        confidence of its worst endpoint. Bucketing on the second frame alone would let
        a step be attributed to a confidence one of its two frames never had.
        """
        return min(self.from_frame.blade_conf, self.to_frame.blade_conf)

    @property
    def shaft_conf(self) -> float:
        return min(self.from_frame.shaft_conf, self.to_frame.shaft_conf)

    def bucket(self, attribute: str) -> str:
        """The step's `phase`/`blur` bucket -- only when both frames agree on it.

        Same rule as `measure_blade_stability.Pair.bucket`: a step straddling two values
        belongs to neither, and putting it in one would attribute a rate to a condition
        half of it was not measured under.
        """
        a = getattr(self.from_frame, attribute)
        b = getattr(self.to_frame, attribute)
        return a if a == b else BUCKET_MIXED


def attach_rates(traced) -> None:
    """Write each frame's per-angle rate against the previous frame carrying that angle.

    This is the CSV's view, and it is deliberately UNFILTERED: every frame with a
    predecessor gets a rate however wide the hole before it, and the step's own `dt`
    rides along in the next column so a reader can filter it themselves. The aggregated
    tables apply `--max-gap-sec` instead; raw data that has already been filtered cannot
    be unfiltered.
    """
    previous: dict = {}
    for item in traced:
        for label, _from, _to in ANGLES:
            value = item.angles.get(label)
            if value is None:
                continue
            last = previous.get(label)
            if last is not None:
                dt = item.t_sec - last.t_sec
                if dt > 0:
                    item.rates[label] = (
                        angle_difference(value, last.angles[label]) / dt,
                        dt,
                    )
            previous[label] = item


def paired_steps(traced, clip_name: str, max_gap_sec: float) -> tuple:
    """`(steps, dropped_gap, dropped_dt)` over frames carrying BOTH angles.

    The series every cross-clip table is built on. Consecutive here means consecutive
    within the subsequence of complete frames, so a frame that lost one of its angles
    widens the step instead of ending the series -- the same rule `step_rates` uses for
    one angle, applied to the pair. Non-positive `dt` is dropped separately: dividing by
    it is the one data problem that turns into a spectacular number rather than a missing
    one.
    """
    complete = [
        item for item in traced
        if all(item.angles.get(label) is not None for label, _f, _t in ANGLES)
    ]
    steps = []
    dropped_gap = 0
    dropped_dt = 0
    for first, second in zip(complete, complete[1:]):
        dt = second.t_sec - first.t_sec
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
        steps.append(
            Step(
                clip_name=clip_name,
                from_frame=first,
                to_frame=second,
                dt=dt,
                delta=delta,
                rate={label: value / dt for label, value in delta.items()},
            )
        )
    return steps, dropped_gap, dropped_dt


# -----------------------------------------------------------------------------
# Buckets and aggregation
# -----------------------------------------------------------------------------


def conf_bucket(value):
    """The lower edge of the tenth `value` falls in, or None when there is no value.

    Half-open upwards (`0.2` belongs to 0.2--0.3, not to 0.1--0.2) so a confidence sits
    in exactly one bucket, with one exception at the top: 1.0 belongs to 0.9--1.0,
    because a bucket holding exactly 1.0 alone would be an artefact of the arithmetic
    rather than a category anybody wants to read.
    """
    if value is None:
        return None
    if value < CONF_EDGES[0]:
        return None
    if value >= 1.0:
        return CONF_EDGES[-1]
    return max(edge for edge in CONF_EDGES if value >= edge)


def conf_bucket_label(edge) -> str:
    if edge is None:
        return "< {:.1f}".format(CONF_EDGES[0])
    return "{:.1f}-{:.1f}".format(edge, edge + 0.1)


def summarise(steps) -> dict:
    """Median, p90 and swap count per angle over a set of steps, plus the ratio.

    `ratio` is the blade median over the shaft median on the SAME steps -- the one number
    the whole report turns on. It is None when the set is empty or the shaft did not move
    at all over it: a zero denominator would make the ratio infinite, which says nothing.
    """
    out = {"steps": len(steps)}
    for label, _f, _t in ANGLES:
        rates = [s.rate[label] for s in steps]
        flips = sum(1 for s in steps if s.flipped(label))
        out[label + "_median"] = median(rates)
        out[label + "_p90"] = percentile(rates, 0.90)
        out[label + "_flips"] = flips
        out[label + "_flip_share"] = (flips / len(steps)) if steps else None
    blade, shaft = out["blade_median"], out["shaft_median"]
    out["ratio"] = (blade / shaft) if (blade is not None and shaft) else None
    return out


def group_steps(steps, key) -> dict:
    """{bucket: [step]} -- a plain grouping, so every table is built the same way."""
    out: dict = {}
    for step in steps:
        out.setdefault(key(step), []).append(step)
    return out


def ordered_buckets(groups, preferred) -> list:
    """`preferred` first and in that order, then whatever else turned up, sorted.

    Keeps `address, backswing, ... finish` in swing order and `none, mild, severe` in
    severity order, while never dropping a bucket the data produced and the list did not
    anticipate.
    """
    rest = sorted(key for key in groups if key not in preferred)
    return [key for key in preferred if key in groups] + rest


def in_swing_frame(frame) -> bool:
    """True when this frame sits inside some swing envelope.

    Judged per FRAME and not on the step's phase bucket: two frames either side of a
    phase boundary bucket as `(blandad)`, and a step from backswing to top is as much
    inside a swing as one entirely within the backswing.
    """
    return frame.phase in PHASE_ORDER


def in_swing_step(step) -> bool:
    return in_swing_frame(step.from_frame) and in_swing_frame(step.to_frame)


def threshold_rows(steps, frames) -> list:
    """One row per candidate toe/heel threshold: what it costs and what it buys.

    The frame share is counted over EVERY decoded frame, not over the frames that already
    carry a blade angle. The question is what fraction of a clip survives the gate, and a
    share of an already-filtered set would flatter it.
    """
    total = len(frames)
    detected = sum(1 for f in frames if f.detected)
    rows = []
    for edge in CONF_EDGES:
        kept = [s for s in steps if s.blade_conf >= edge]
        clearing = sum(
            1 for f in frames if f.blade_conf is not None and f.blade_conf >= edge
        )
        row = summarise(kept)
        row["threshold"] = edge
        row["frames"] = clearing
        row["frame_share"] = (clearing / total) if total else None
        row["detected_share"] = (clearing / detected) if detected else None
        rows.append(row)
    return rows


def strictest_supported(rows, min_steps: int = MIN_STEPS_FOR_RECOMMENDATION):
    """The highest threshold still backed by enough steps to cut a table by, or None.

    Used for the "does the phase effect survive a confidence gate?" cross-cut when no
    threshold is recommendable. That question has to be answerable even -- especially --
    when the answer to the threshold question is no, and asking it at the strictest gate
    the data supports is the fairest test confidence gets.
    """
    supported = [row for row in rows if row["steps"] >= min_steps]
    return supported[-1] if supported else None


def lowest_flip_free(rows, max_flip_share: float = MAX_FLIP_SHARE,
                     min_steps: int = MIN_STEPS_FOR_RECOMMENDATION):
    """The lowest threshold at which `toe`/`heel` swaps all but stop, or None.

    A second question, and a cheaper one to answer yes to. A swap is not noise that
    averages out -- it is the blade angle pointing the wrong way by half a turn, the
    failure that cost `shaft-v1` its face-on frames -- so a gate that removes swaps is
    worth something even when the median rate stays above the shaft's. The two answers
    are reported side by side and never merged: "usable" and "not catastrophically
    wrong" are different claims.
    """
    for row in rows:
        if row["steps"] < min_steps or row["blade_flip_share"] is None:
            continue
        if row["blade_flip_share"] <= max_flip_share:
            return row
    return None


def recommend(rows, comparable_ratio: float = COMPARABLE_RATIO,
              min_steps: int = MIN_STEPS_FOR_RECOMMENDATION):
    """The lowest threshold whose blade/shaft ratio clears the bar, or None.

    Lowest, not best: every tenth of confidence costs frames, so the useful answer is the
    cheapest threshold that works rather than the one with the prettiest ratio. A row
    resting on fewer than `min_steps` steps is skipped instead of recommended -- a ratio
    from a handful of pairs is noise, and a recommendation is a number somebody will
    write into a gate.
    """
    for row in rows:
        if row["steps"] < min_steps or row["ratio"] is None:
            continue
        if row["ratio"] <= comparable_ratio:
            return row
    return None


# -----------------------------------------------------------------------------
# Output
# -----------------------------------------------------------------------------


def csv_rows(traced, unwrapped: dict):
    """Header row, then one row per DECODED frame -- holes included, as empty fields.

    Four kinds of column, in this order: where the frame is (`frame`, `t_sec`, `phase`,
    `blur`), what the model saw (`detected`, `box_conf`, the twelve point columns), what
    each angle was (`*_angle_deg`, `*_angle_unwrapped_deg`) and how fast it was moving
    (`*_rate_deg_s` against the previous frame carrying that angle, with that step's own
    `*_step_sec` beside it so a wide step is never mistaken for a fast one). The two
    `*_conf_min` columns are the weaker point of each pair -- derived, but derived the
    same way everything downstream buckets on, so the CSV and the report cannot drift.
    """
    header = ["frame", "t_sec", "phase", "blur", "detected", "box_conf"]
    for name in KEYPOINT_NAMES:
        header += [name + "_x", name + "_y", name + "_conf"]
    for label, _from, _to in ANGLES:
        header += [
            label + "_angle_deg",
            label + "_angle_unwrapped_deg",
            label + "_rate_deg_s",
            label + "_step_sec",
        ]
    header += ["shaft_conf_min", "blade_conf_min"]
    yield header

    for position, item in enumerate(traced):
        row = [
            item.index,
            "{:.4f}".format(item.t_sec),
            item.phase,
            item.blur,
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
            rate = item.rates.get(label)
            row += [
                "" if raw is None else "{:.3f}".format(raw),
                "" if lifted is None else "{:.3f}".format(lifted),
                "" if rate is None else "{:.2f}".format(rate[0]),
                "" if rate is None else "{:.4f}".format(rate[1]),
            ]
        row += [
            "" if item.shaft_conf is None else "{:.4f}".format(item.shaft_conf),
            "" if item.blade_conf is None else "{:.4f}".format(item.blade_conf),
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


def fmt_share(value) -> str:
    """A fraction as a whole percent, or a dash when there is no fraction to show.

    The only place a percentage is formatted. Everything that shows one goes through
    here, so a share in the console and the same share in the report cannot round
    differently.
    """
    if value is None:
        return "--"
    return "{:.0f} %".format(100.0 * value)


def pct(numerator: int, denominator: int) -> str:
    return fmt_share((numerator / denominator) if denominator else None)


def share(numerator: int, denominator: int) -> str:
    """`12 (40 %)` -- the count first, because the count is the evidence."""
    if not denominator:
        return "--"
    return "{} ({})".format(numerator, pct(numerator, denominator))


# -----------------------------------------------------------------------------
# One clip, every frame
# -----------------------------------------------------------------------------


def trace(model, clip: Path, args, context=None) -> tuple:
    """Run the model over every frame of the clip. Returns `(traced, time_source)`.

    `context` carries the manifest windows and the annotation labels; without one every
    frame keeps the "no phase, no label" markers, which is what a run with no batch ZIPs
    on disk must look like -- empty, and saying so.
    """
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
    windows = context.windows_for(clip) if context else None
    traced = []
    for position, (index, points, box_conf) in enumerate(pending):
        t_sec = times[position]
        traced.append(
            Traced(
                index=index,
                t_sec=t_sec,
                points=points,
                box_conf=box_conf,
                angles=frame_angles(points, gates),
                phase=phase_at(t_sec, windows) if context else PHASE_UNKNOWN,
                blur=context.blur_at(clip, t_sec) if context else BLUR_NO_LABEL,
            )
        )
    attach_rates(traced)
    return traced, source


# -----------------------------------------------------------------------------
# The cross-clip report
# -----------------------------------------------------------------------------


@dataclass
class TraceContext:
    """Everything read off disk once and reused for every clip of a run."""

    windows: dict = field(default_factory=dict)
    labels: object = None
    blur_window_sec: float = DEFAULT_BLUR_WINDOW_SEC
    notes: list = field(default_factory=list)
    batches: list = field(default_factory=list)
    annotations: list = field(default_factory=list)

    def windows_for(self, clip: Path):
        """The manifest windows for this clip, matched on FILE NAME.

        The manifest records `clipName` -- `002.mp4`, `IMG_5427.MP4` -- and the clip on
        disk may sit in any directory, so the name is the join key and the match is
        case-insensitive because the own-camera clips are `.MP4` and the scraped ones
        `.mp4`.
        """
        return self.windows.get(clip.name.lower())

    def blur_at(self, clip: Path, t_sec: float) -> str:
        if self.labels is None:
            return BLUR_NO_LABEL
        return self.labels.blur_at(clip.name.lower(), t_sec, self.blur_window_sec)


@dataclass
class ClipTrace:
    """One clip's traced frames plus everything derived from them."""

    path: Path
    traced: list
    time_source: str
    steps: list
    dropped_gap: int
    dropped_dt: int
    csv_path: Path
    png_path: object = None

    @property
    def name(self) -> str:
        return self.path.name


def build_context(args) -> TraceContext:
    """Read the manifests and the annotation exports once, for every clip of the run.

    Missing batch ZIPs are a NOTE, never an exit. The phase and blur cuts are two of the
    report's five sections; a machine with no dataset on disk should still be able to
    trace a clip and get its angles, with the missing halves declared rather than faked.
    """
    context = TraceContext(blur_window_sec=args.blur_window_sec)
    batches = [path for path in args.batches if path.is_file()]
    missing = [path for path in args.batches if not path.is_file()]
    context.batches = batches
    if missing:
        context.notes.append(
            "Saknade batch-ZIP:ar: {} — svingfasen kan inte härledas för klipp som bara "
            "finns där.".format(", ".join("`{}`".format(p) for p in missing))
        )
    if not batches:
        context.notes.append(
            "**Inga manifest lästa** — ingen bildruta får en svingfas, och avsnittet per "
            "fas är tomt."
        )
        return context

    windows, window_notes = read_swing_windows(batches)
    context.windows = {clip.lower(): items for clip, items in windows.items()}
    context.notes.extend(window_notes)

    if args.annotations is None:
        annotation_zips = [p for p in (discover_annotations(b) for b in batches) if p]
    else:
        annotation_zips = [p for p in args.annotations if p.is_file()]
    context.annotations = annotation_zips
    if not annotation_zips:
        context.notes.append(
            "**Inga annoteringar lästa** — uppdelningen per `blur` blir tom."
        )
        return context

    meta, no_shaft = read_frame_meta(annotation_zips)
    frames, collect_notes = collect_frames(batches, meta, no_shaft)
    for frame in frames:
        frame.clip_name = frame.clip_name.lower()
    context.labels = FrameLabels(frames)
    context.notes.extend(collect_notes)
    context.notes.append(
        "`view`/`blur` från {}.".format(
            ", ".join("`{}/{}`".format(p.parent.name, p.name) for p in annotation_zips)
        )
    )
    return context


def resolve_clips(args) -> list:
    """The clips to trace, from `--clips` (files or directories) or the positional one.

    A directory is expanded to the video files directly inside it, sorted, so a run over
    a folder is reproducible and its order is the order of the report. Recursion is
    deliberately not implemented: `data/shaft/clips/` has a subdirectory of its own
    material, and sweeping it in silently would change what a run means.
    """
    if args.clip is not None:
        return [args.clip]
    out = []
    for entry in args.clips:
        if entry.is_dir():
            found = sorted(
                child for child in entry.iterdir()
                if child.is_file() and child.suffix.lower() in VIDEO_SUFFIXES
            )
            if not found:
                raise SystemExit("no video files in {}".format(entry))
            out.extend(found)
        elif entry.is_file():
            out.append(entry)
        else:
            raise SystemExit("missing clip: {}".format(entry))
    seen = set()
    unique = []
    for item in out:
        key = item.resolve()
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def run_clip(model, clip: Path, args, context: TraceContext) -> ClipTrace:
    """Trace one clip and write its CSV (and its plot, unless `--no-plots`)."""
    gates = thresholds(args.kpt_conf_shaft, args.kpt_conf_blade)
    traced, time_source = trace(model, clip, args, context)
    unwrapped = {
        label: unwrap([item.angles.get(label) for item in traced])
        for label, _from, _to in ANGLES
    }
    csv_path = args.out_dir / "trace-{}.csv".format(clip.stem)
    write_csv(csv_path, traced, unwrapped)
    png_path = None
    if not args.no_plots:
        png_path = args.out_dir / "trace-{}.png".format(clip.stem)
        write_plot(png_path, traced, unwrapped, clip.name, gates)
    steps, dropped_gap, dropped_dt = paired_steps(traced, clip.name, args.max_gap_sec)
    return ClipTrace(
        path=clip,
        traced=traced,
        time_source=time_source,
        steps=steps,
        dropped_gap=dropped_gap,
        dropped_dt=dropped_dt,
        csv_path=csv_path,
        png_path=png_path,
    )


def rate_cells(row: dict) -> list:
    """The five numbers every aggregated row shows, in one place so they cannot drift."""
    return [
        str(row["steps"]),
        fmt(row["blade_median"], 1),
        fmt(row["blade_p90"], 1),
        fmt(row["shaft_median"], 1),
        fmt(row["shaft_p90"], 1),
        fmt(row["ratio"], 2),
        "{} ({})".format(row["blade_flips"], pct(row["blade_flips"], row["steps"])),
    ]


RATE_HEADER = (
    "| {} | Steg | Blad median | Blad p90 | Skaft median | Skaft p90 | Kvot blad/skaft "
    "| Blad-hopp > 90° |"
)
RATE_RULE = "|---|---:|---:|---:|---:|---:|---:|---:|"


def rate_table(add, first_column: str, rows) -> None:
    """`rows` is `[(label, summary)]` -- the same table shape for every cut."""
    add(RATE_HEADER.format(first_column))
    add(RATE_RULE)
    for label, row in rows:
        add("| {} | {} |".format(label, " | ".join(rate_cells(row))))
    add("")
    add("Alla hastigheter i °/s.")
    add("")


def render_usability(clip_traces, args, context, selection_note) -> str:
    steps = [step for clip in clip_traces for step in clip.steps]
    frames = [item for clip in clip_traces for item in clip.traced]
    overall = summarise(steps)
    rows = threshold_rows(steps, frames)
    chosen = recommend(rows)
    inside_steps = [s for s in steps if in_swing_step(s)]
    inside_frames = [f for f in frames if in_swing_frame(f)]
    inside_rows = threshold_rows(inside_steps, inside_frames)
    inside_chosen = recommend(inside_rows)

    lines = []
    add = lines.append

    add("# Var är bladvinkeln användbar?")
    add("")
    add("Genererad {} av `training/trace_swing.py --clips`.".format(
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")))
    add("")
    add("| | |")
    add("|---|---|")
    add("| Vikter | `{}` |".format(args.weights))
    add("| Klipp | {} |".format(len(clip_traces)))
    add("| Bildrutor | {} |".format(len(frames)))
    add("| `imgsz` | {} |".format(args.imgsz))
    add("| Detektionströskel (`--conf`) | {} |".format(args.conf))
    add("| Punktströsklar | skaft {} · blad {} |".format(
        args.kpt_conf_shaft, args.kpt_conf_blade))
    add("| Största tillåtna tidssteg (`--max-gap-sec`) | {} s |".format(args.max_gap_sec))
    add("| Blur-etikettens räckvidd (`--blur-window-sec`) | ±{} s |".format(
        args.blur_window_sec))
    add("| Manifest | {} |".format(
        ", ".join("`{}`".format(p.parent.name) for p in context.batches) or "inga"))
    add("")

    add("## 1. Frågan, och varför den ställs så här")
    add("")
    add(
        "På `002.mp4` är bladvinkeln slät medan klubban står still och taggig så snart "
        "huvudet rör sig. **Ett klipp kan inte skilja ett mönster hos modellen från ett "
        "mönster hos klippet**, och två förklaringar leder åt helt olika håll: är det "
        "**svingfasen** som styr är bladvinkeln användbar i svingens lugna delar och "
        "ingen annanstans, och ingen tröskel i världen ändrar det. Är det **modellens "
        "egen konfidens på `toe`/`heel`** som styr räcker en konfidensgrind — modellen "
        "vet då själv när den gissar."
    )
    add("")
    add(
        "**Skaftvinkeln är måttstocken i varje tabell.** `butt→hosel` och `heel→toe` "
        "sitter på samma stela kropp; över samma två bildrutor roterar de jämförbart "
        "mycket. En bladvinkel som rör sig en tiopotens snabbare är modellen som gissar, "
        "inte klubban som vänder. Därför mäts båda vinklarna **på samma steg**: ett steg "
        "kommer med i tabellerna bara när båda vinklarna finns i båda ändar."
    )
    add("")
    add(
        "**Det finns fortfarande inget facit för bladvinkeln** — kalibreringssetet är "
        "annoterat i tvåpunktsschemat. Det här mäter alltså inte träffsäkerhet utan "
        "rörlighet, precis som `measure_blade_stability.py`, men vid ~0,033 s i stället "
        "för ~0,3 s."
    )
    add("")

    add("## 2. Urvalet av klipp")
    add("")
    if selection_note:
        add(selection_note.strip())
        add("")
    add("| Klipp | Bildrutor | Detektion | Skaftvinkel | Bladvinkel | Båda "
        "| Svingar i manifest | `view` (annoterat) | `blur` (annoterat) |")
    add("|---|---:|---:|---:|---:|---:|---:|---|---|")
    for clip in clip_traces:
        total = len(clip.traced)
        detected = sum(1 for f in clip.traced if f.detected)
        shaft = sum(1 for f in clip.traced if f.angles.get("shaft") is not None)
        blade = sum(1 for f in clip.traced if f.angles.get("blade") is not None)
        both = sum(
            1 for f in clip.traced
            if f.angles.get("shaft") is not None and f.angles.get("blade") is not None
        )
        windows = context.windows_for(clip.path) or []
        labels = context.labels
        key = clip.name.lower()
        view_mix = labels.counts(key, "view") if labels else Counter()
        blur_mix = labels.counts(key, "blur") if labels else Counter()
        add("| `{}` | {} | {} | {} | {} | {} | {} | {} | {} |".format(
            clip.name, total, pct(detected, total), pct(shaft, total),
            pct(blade, total), pct(both, total), len(windows),
            mix(view_mix), mix(blur_mix)))
    add("")
    add(
        "`view`/`blur` är annotatörernas etiketter på de **enstaka** bildrutor ur klippet "
        "som dragits in i en träningsbatch — de beskriver klippet, de täcker det inte."
    )
    add("")
    add("### Höll mönstret från `002.mp4` i de andra nio?")
    add("")
    add(
        "Ett klipp per rad, och kvoten i två kolumner: inuti svingarna och mellan dem. "
        "Det är den uppdelning frågan föddes ur — bladvinkeln såg lugn ut medan klubban "
        "stod still och taggig när huvudet rörde sig."
    )
    add("")
    add("| Klipp | Steg i sving | Blad median | Skaft median | Kvot i sving "
        "| Kvot mellan svingar | Blad-hopp > 90° |")
    add("|---|---:|---:|---:|---:|---:|---:|")
    for clip in clip_traces:
        inside_clip = summarise([s for s in clip.steps if in_swing_step(s)])
        outside_clip = summarise([s for s in clip.steps if not in_swing_step(s)])
        add("| `{}` | {} | {} | {} | {} | {} | {} |".format(
            clip.name, inside_clip["steps"], fmt(inside_clip["blade_median"], 1),
            fmt(inside_clip["shaft_median"], 1), fmt(inside_clip["ratio"], 2),
            fmt(outside_clip["ratio"], 2),
            "{} ({})".format(inside_clip["blade_flips"],
                             pct(inside_clip["blade_flips"], inside_clip["steps"]))))
    add("")
    add("Medianerna är °/s. Ett klipp utan manifestpost har inga steg i sving alls.")
    add("")

    if context.notes:
        add("## 3. Anmärkningar")
        add("")
        for note in context.notes:
            add("- {}".format(note))
        add("")
    else:
        add("## 3. Anmärkningar")
        add("")
        add("- Inga.")
        add("")

    add("## 4. Bladvinkelns rörlighet mot modellens konfidens på `toe`/`heel`")
    add("")
    add(
        "Hinken bestäms av **den svagaste av `toe` och `heel` i stegets båda ändar** — en "
        "vinkel är inte bättre än sin sämsta punkt, och en tröskel betyder att *varje* "
        "bildruta som används klarar den."
    )
    add("")
    groups = group_steps(steps, lambda s: conf_bucket(s.blade_conf))
    rate_table(add, "toe/heel-konfidens", [
        (conf_bucket_label(edge), summarise(groups[edge]))
        for edge in sorted(k for k in groups if k is not None)
    ])
    add(
        "Totalt över alla hinkar: {} steg, blad median {} °/s mot skaft {} °/s "
        "(kvot {}).".format(
            overall["steps"], fmt(overall["blade_median"], 1),
            fmt(overall["shaft_median"], 1), fmt(overall["ratio"], 2))
    )
    add("")
    blade_confs = [f.blade_conf for f in frames if f.angles.get("blade") is not None]
    shaft_confs = [f.shaft_conf for f in frames if f.angles.get("shaft") is not None]
    add(
        "**Hur mycket spann finns det att gradera på?** Över de {} bildrutor som bär en "
        "bladvinkel ligger min(`toe`, `heel`) på median {}, p90 {}, max {} — mot "
        "skaftets min(`butt`, `hosel`) median {}, p90 {}, max {} över dess {} "
        "bildrutor. Hinkar ovanför bladets spann står tomma därför att modellen aldrig "
        "är så säker på klubbhuvudet, inte därför att urvalet saknar sådana bildrutor."
        .format(
            len(blade_confs), fmt(median(blade_confs), 2),
            fmt(percentile(blade_confs, 0.90), 2),
            fmt(max(blade_confs), 2) if blade_confs else "--",
            fmt(median(shaft_confs), 2), fmt(percentile(shaft_confs, 0.90), 2),
            fmt(max(shaft_confs), 2) if shaft_confs else "--", len(shaft_confs))
    )
    add("")

    add("## 5. Samma sak per svingfas")
    add("")
    add(
        "Fasen kommer ur `envelopeSec`/`impactSec` i batchmanifesten — production-pose "
        "körd en gång, aldrig om. **`start`, `impact` och `finish` är mätta; toppen är "
        "det inte** (manifestet bär ingen), så gränsen backsving/nedsving är "
        "typsvingens proportion ur `datasetPhase.ts` utsträckt över de mätta tiderna. "
        "Läs fasraderna som grova hinkar, inte som en fasdetektor."
    )
    add("")
    by_phase = group_steps(steps, lambda s: s.bucket("phase"))
    rate_table(add, "Fas", [
        (key, summarise(by_phase[key]))
        for key in ordered_buckets(by_phase, PHASE_ORDER)
    ])

    inside = summarise([s for s in steps if in_swing_step(s)])
    outside = summarise([s for s in steps if not in_swing_step(s)])
    add(
        "**Klippen är mest stillestånd.** {} av {} steg ligger inuti en envelope, {} "
        "mellan svingarna. Inom svingen rör sig bladet {} °/s mot skaftets {} °/s "
        "(kvot {}); mellan svingarna {} mot {} (kvot {}). Att kvoten är HÖGRE när "
        "klubban står still är väntat och värt att läsa rätt: nämnaren krymper — "
        "skaftet står stilla — medan bladets brusgolv ligger kvar."
        .format(inside["steps"], len(steps), outside["steps"],
                fmt(inside["blade_median"], 1), fmt(inside["shaft_median"], 1),
                fmt(inside["ratio"], 2), fmt(outside["blade_median"], 1),
                fmt(outside["shaft_median"], 1), fmt(outside["ratio"], 2))
    )
    add("")

    if context.batches:
        check = phase_agreement(manifest_records(context.batches), context.windows)
        add("### Hur bra är härledningen? Mätt, inte påstått")
        add("")
        add(
            "Manifestet bär redan en `phase` per sampel, skriven av `datasetPhase.ts` "
            "vid exporten **med toppen tillgänglig**. Den här porten får bara "
            "`[start, finish]` och impact tillbaka. Körda mot varandra på manifestens "
            "egna {} bildrutor håller de med varandra i **{} ({})**.".format(
                check["frames"], check["agree"],
                pct(check["agree"], check["frames"]))
        )
        add("")
        if check["confusion"]:
            add("| Manifestets fas | Den här porten | Bildrutor |")
            add("|---|---|---:|")
            for (theirs, mine), count in check["confusion"].most_common():
                add("| {} | {} | {} |".format(theirs, mine, count))
            add("")
            add(
                "Läs tabellen som var osäkerheten sitter: den gräns porten saknar är "
                "toppen, och avvikelserna hamnar där toppen hade avgjort."
            )
            add("")

    gate = chosen or strictest_supported(rows)
    if gate:
        gated = [s for s in steps if s.blade_conf >= gate["threshold"]]
        by_phase_gated = group_steps(gated, lambda s: s.bucket("phase"))
        add("### Samma uppdelning efter en konfidensgrind på {:.1f}".format(
            gate["threshold"]))
        add("")
        add(
            "Om fasen fortfarande styr efter grinden är konfidensen inte hela svaret; "
            "faller skillnaden ihop är den det.{}".format(
                "" if chosen else
                " Ingen tröskel når ända fram (avsnitt 7), så grinden här är den "
                "strängaste som fortfarande bär {} steg — det hårdaste prov "
                "konfidensen kan få av det här materialet.".format(
                    MIN_STEPS_FOR_RECOMMENDATION))
        )
        add("")
        rate_table(add, "Fas", [
            (key, summarise(by_phase_gated[key]))
            for key in ordered_buckets(by_phase_gated, PHASE_ORDER)
        ])

    add("## 6. Samma sak per `blur`")
    add("")
    add(
        "Etiketten sitter på **en** annoterad bildruta och sträcker sig ±{} s därifrån, "
        "inte längre: rörelseoskärpa ändras inom en tiondels sekund kring träffen, och "
        "ett bredare fönster hade köpt steg genom att hitta på etiketter. Steg där två "
        "etiketter inom fönstret säger olika saker hamnar i `{}`.".format(
            args.blur_window_sec, BUCKET_MIXED)
    )
    add("")
    by_blur = group_steps(steps, lambda s: s.bucket("blur"))
    rate_table(add, "`blur`", [
        (key, summarise(by_blur[key]))
        for key in ordered_buckets(by_blur, ("none", "mild", "severe"))
    ])

    add("## 7. Var ska gränsen gå?")
    add("")
    add(
        "Varje rad är *alla* steg där båda ändar klarar tröskeln. **Andelen bildrutor** "
        "räknas mot samtliga avkodade bildrutor i de {} klippen, inte mot dem som redan "
        "har en bladvinkel — frågan är vad som återstår av ett klipp efter grinden."
        .format(len(clip_traces))
    )
    add("")
    add("| Tröskel | Steg | Blad median | Skaft median | Kvot | Blad-hopp > 90° "
        "| Bildrutor över tröskeln | Andel av alla | Andel av detekterade |")
    add("|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for row in rows:
        add("| {:.1f} | {} | {} | {} | {} | {} | {} | {} | {} |".format(
            row["threshold"], row["steps"], fmt(row["blade_median"], 1),
            fmt(row["shaft_median"], 1), fmt(row["ratio"], 2),
            "{} ({})".format(row["blade_flips"], fmt_share(row["blade_flip_share"])),
            row["frames"], fmt_share(row["frame_share"]),
            fmt_share(row["detected_share"])))
    add("")
    if chosen:
        add(
            "**Rekommendation: `--kpt-conf-blade {:.1f}`.** Där är bladvinkelns median "
            "{} °/s mot skaftets {} °/s — kvot **{}**, alltså inom den gräns rapporten "
            "räknar som jämförbar ({:.1f}). Det klarar **{} av {} bildrutor ({})**, "
            "eller {} av dem där modellen alls hittade klubban. Underlaget är {} steg."
            .format(
                chosen["threshold"], fmt(chosen["blade_median"], 1),
                fmt(chosen["shaft_median"], 1), fmt(chosen["ratio"], 2),
                COMPARABLE_RATIO, chosen["frames"], len(frames),
                fmt_share(chosen["frame_share"]),
                fmt_share(chosen["detected_share"]), chosen["steps"])
        )
    else:
        add(
            "**Ingen tröskel klarar gränsen.** Ingen rad ovan når kvot ≤ {:.1f} med minst "
            "{} steg bakom sig. Bladvinkeln blir alltså inte jämförbar med skaftvinkeln "
            "någonstans på konfidensskalan i det här materialet, och en konfidensgrind är "
            "därmed inte det som saknas."
            .format(COMPARABLE_RATIO, MIN_STEPS_FOR_RECOMMENDATION)
        )
    add("")
    add("### Samma svep, men bara på steg inuti en sving")
    add("")
    add(
        "Grinden ska bära i en sving, inte i pausen mellan två. Här räknas andelen mot "
        "de {} bildrutor som ligger inom en envelope."
        .format(sum(1 for f in frames if in_swing_frame(f)))
    )
    add("")
    add("| Tröskel | Steg | Blad median | Skaft median | Kvot | Blad-hopp > 90° "
        "| Bildrutor över tröskeln | Andel av bildrutorna i sving |")
    add("|---:|---:|---:|---:|---:|---:|---:|---:|")
    for row in inside_rows:
        add("| {:.1f} | {} | {} | {} | {} | {} | {} | {} |".format(
            row["threshold"], row["steps"], fmt(row["blade_median"], 1),
            fmt(row["shaft_median"], 1), fmt(row["ratio"], 2),
            "{} ({})".format(row["blade_flips"], fmt_share(row["blade_flip_share"])),
            row["frames"], fmt_share(row["frame_share"])))
    add("")
    if inside_chosen:
        add(
            "**Inom en sving räcker `--kpt-conf-blade {:.1f}`** — kvot {} på {} steg, "
            "{} av bildrutorna i sving.".format(
                inside_chosen["threshold"], fmt(inside_chosen["ratio"], 2),
                inside_chosen["steps"], fmt_share(inside_chosen["frame_share"]))
        )
    else:
        add(
            "**Inte heller inom en sving finns en tröskel som klarar kvotgränsen.** "
            "Konfidensgrinden räddas alltså inte av att stillestånden räknas bort."
        )
    add("")
    add("")
    add("### Den andra frågan: var slutar `toe` och `heel` byta plats?")
    add("")
    add(
        "Ett hopp över 90° är ingen brusnivå som jämnar ut sig — det är bladvinkeln "
        "vänd ett halvt varv, samma fel som kostade `shaft-v1` dess face_on-bildrutor. "
        "En grind som stoppar omkastningarna är därför värd något även om medianen "
        "stannar över skaftets, och de två svaren hålls isär."
    )
    add("")
    flip_gate = lowest_flip_free(inside_rows)
    if flip_gate:
        add(
            "**Inom en sving faller omkastningarna under {} vid `--kpt-conf-blade "
            "{:.1f}`** — {} av {} steg, mot {} i den lägsta hinken. Kvoten där är "
            "fortfarande {}, alltså *inte* jämförbar med skaftet: grinden gör "
            "bladvinkeln mindre farlig, inte användbar."
            .format(fmt_share(MAX_FLIP_SHARE), flip_gate["threshold"],
                    flip_gate["blade_flips"], flip_gate["steps"],
                    fmt_share(inside_rows[0]["blade_flip_share"]),
                    fmt(flip_gate["ratio"], 2))
        )
    else:
        add(
            "**Ingen tröskel stoppar omkastningarna heller** (gränsen: högst {} av "
            "stegen, minst {} steg bakom sig)."
            .format(fmt_share(MAX_FLIP_SHARE), MIN_STEPS_FOR_RECOMMENDATION)
        )
    add("")
    add(
        "Båda gränserna ({:.1f} för kvoten, {} för omkastningarna) är val, inte "
        "mätningar. Svepen står kvar i sin helhet just därför: flytta linjen och läs av "
        "vad den kostar i bildrutor.".format(COMPARABLE_RATIO, fmt_share(MAX_FLIP_SHARE))
    )
    add("")

    add("## 8. Vad som inte mäts här")
    add("")
    add(
        "- **Träffsäkerhet.** Utan fyrapunktsfacit går bara rörlighet att mäta. En "
        "bladvinkel kan vara fullkomligt stabil och konsekvent fel."
    )
    add(
        "- **Steg utan båda vinklarna.** {} steg förkastades för lucka > {} s och {} för "
        "tidssteg ≤ 0. Bildrutor där bara den ena vinkeln fanns bildar inget steg alls."
        .format(sum(c.dropped_gap for c in clip_traces), args.max_gap_sec,
                sum(c.dropped_dt for c in clip_traces))
    )
    add(
        "- **Bildrutor utan fas.** {} av {} bildrutor ligger i klipp utan manifestpost "
        "och {} mellan två svingar i ett klipp som har det."
        .format(sum(1 for f in frames if f.phase == PHASE_UNKNOWN), len(frames),
                sum(1 for f in frames if f.phase == PHASE_OUTSIDE))
    )
    add("")
    return "\n".join(lines) + "\n"


def mix(counter) -> str:
    """`{"dtl": 3, "face_on": 1}` -> "dtl 3 · face_on 1", or a dash."""
    if not counter:
        return "--"
    return " · ".join(
        "{} {}".format(key, count) for key, count in sorted(counter.items())
    )


# -----------------------------------------------------------------------------
# Driver
# -----------------------------------------------------------------------------


def print_clip_summary(clip: ClipTrace, args, gates: dict) -> None:
    """The single-clip console report -- unchanged in shape, printed per clip."""
    traced = clip.traced
    stats = coverage(traced, gates)
    frames = stats["frames"]
    steps = {label: step_rates(traced, label, args.max_gap_sec)
             for label, _from, _to in ANGLES}
    dts = [b.t_sec - a.t_sec for a, b in zip(traced, traced[1:])]

    print()
    print("Bildrutor        : {}".format(frames))
    print("Tidsaxel         : {}".format(clip.time_source))
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
    if clip.png_path:
        print("Graf             : {}".format(clip.png_path))
    print("Rådata           : {}".format(clip.csv_path))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "clip",
        type=Path,
        nargs="?",
        help="one video file to trace, e.g. data/shaft/clips/002.mp4",
    )
    parser.add_argument(
        "--clips",
        type=Path,
        nargs="+",
        default=None,
        metavar="PATH",
        help="several video files, or a directory of them, traced in one run. Each clip "
        "still gets its own CSV and plot; in addition the run writes the cross-clip "
        "report --usability-out. Mutually exclusive with the positional clip",
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
        help="stop after N frames PER CLIP -- a smoke run, not a trace",
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
    parser.add_argument(
        "--no-plots",
        action="store_true",
        help="skip the per-clip PNG. The CSV is always written -- it is the measurement",
    )
    parser.add_argument(
        "--batches",
        type=Path,
        nargs="+",
        default=list(DEFAULT_BATCHES),
        help="batch ZIPs whose manifests carry the swing envelopes the phase is derived "
        "from (default: all three)",
    )
    parser.add_argument(
        "--annotations",
        type=Path,
        nargs="+",
        default=None,
        help="annotation exports to read `blur` from (default: the newest "
        "annotated-v*.zip beside each batch)",
    )
    parser.add_argument(
        "--blur-window-sec",
        type=float,
        default=DEFAULT_BLUR_WINDOW_SEC,
        help="how far from its own annotated frame a `blur` label reaches "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--usability-out",
        type=Path,
        default=DEFAULT_USABILITY_OUT,
        help="the cross-clip report, written in --clips mode only "
        "(default: %(default)s)",
    )
    parser.add_argument(
        "--selection-note",
        type=Path,
        default=None,
        help="markdown file quoted verbatim into the report as the reason THESE clips "
        "were chosen. A selection nobody can retrace is a selection nobody can argue "
        "with",
    )
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    if (args.clip is None) == (args.clips is None):
        raise SystemExit("pass either one clip or --clips, not both and not neither")

    clips = resolve_clips(args)
    for clip in clips:
        if not clip.is_file():
            raise SystemExit("missing clip: {}".format(clip))
    if not args.weights.is_file():
        raise SystemExit(
            "weights not found: {}\nTrain a four-point model first (training/train.py "
            "--name shaft-v3), or pass --weights.".format(args.weights)
        )

    selection_note = ""
    if args.selection_note is not None:
        if not args.selection_note.is_file():
            raise SystemExit("missing selection note: {}".format(args.selection_note))
        selection_note = args.selection_note.read_text(encoding="utf-8")

    from ultralytics import YOLO

    gates = thresholds(args.kpt_conf_shaft, args.kpt_conf_blade)
    context = build_context(args)

    print("Klipp     : {}".format(
        clips[0] if len(clips) == 1 else "{} st".format(len(clips))))
    print("Vikter    : {}".format(args.weights))
    print("Trösklar  : skaft {:.2f} · blad {:.2f}".format(
        args.kpt_conf_shaft, args.kpt_conf_blade))
    for note in context.notes:
        print("Not       : {}".format(note))
    print()

    model = YOLO(str(args.weights))
    clip_traces = []
    for position, clip in enumerate(clips, start=1):
        if len(clips) > 1:
            print("[{}/{}] {}".format(position, len(clips), clip.name), flush=True)
        clip_traces.append(run_clip(model, clip, args, context))

    if args.clip is not None:
        print_clip_summary(clip_traces[0], args, gates)
        return 0

    args.usability_out.parent.mkdir(parents=True, exist_ok=True)
    args.usability_out.write_text(
        render_usability(clip_traces, args, context, selection_note), encoding="utf-8"
    )

    steps = [step for clip in clip_traces for step in clip.steps]
    frames = [item for clip in clip_traces for item in clip.traced]
    overall = summarise(steps)
    rows = threshold_rows(steps, frames)
    chosen = recommend(rows)
    inside = summarise([s for s in steps if in_swing_step(s)])

    print()
    print("Klipp            : {}".format(len(clip_traces)))
    print("Bildrutor        : {}".format(len(frames)))
    print("Steg (båda vinklarna, båda ändar): {}".format(overall["steps"]))
    print("  därav i sving  : {} (blad {} · skaft {} · kvot {})".format(
        inside["steps"], fmt(inside["blade_median"], 1, " °/s"),
        fmt(inside["shaft_median"], 1, " °/s"), fmt(inside["ratio"], 2)))
    print("Blad |Δv/Δt|     : median {} p90 {}".format(
        fmt(overall["blade_median"], 1, " °/s"), fmt(overall["blade_p90"], 1, " °/s")))
    print("Skaft |Δv/Δt|    : median {} p90 {}".format(
        fmt(overall["shaft_median"], 1, " °/s"), fmt(overall["shaft_p90"], 1, " °/s")))
    print("Kvot blad/skaft  : {}".format(fmt(overall["ratio"], 2)))
    print()
    print("Konfidenssvep (tröskel: kvot, andel av bildrutorna):")
    for row in rows:
        print("  {:.1f} : kvot {:>6}  steg {:>6}  bildrutor {:>6} ({})".format(
            row["threshold"], fmt(row["ratio"], 2), row["steps"], row["frames"],
            fmt_share(row["frame_share"])))
    print()
    if chosen:
        print("Rekommenderad gräns: --kpt-conf-blade {:.1f} (kvot {}, {} av bildrutorna)"
              .format(chosen["threshold"], fmt(chosen["ratio"], 2),
                      fmt_share(chosen["frame_share"])))
    else:
        print("Ingen tröskel når kvot <= {:.1f} med minst {} steg bakom sig."
              .format(COMPARABLE_RATIO, MIN_STEPS_FOR_RECOMMENDATION))
    print("Rapport          : {}".format(args.usability_out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
