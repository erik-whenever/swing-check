"""Shared readers for the shaft dataset's CVAT COCO Keypoints exports.

WHY THIS MODULE EXISTS. `prepare_dataset.py` and `evaluate.py` must agree, to the
letter, on one thing: *when is a keypoint placed?* The answer is the COCO visibility
flag, never the coordinate -- CVAT keeps the last dragged position of an `outside`
point in the export, so a reader that tests the coordinate counts ghost points
(docs/shaft/annotation-spec.md -> *Synlighetsflaggan avgor, aldrig koordinaten*).
Two copies of that rule would eventually drift, and the drift would surface as an
eval number that is quietly wrong rather than as an error. So it lives here once.

THE SECOND THING THEY MUST AGREE ON is how many keypoints there are. The schema is four
(butt, hosel, toe, heel) but batch-01, batch-02 and both calibration passes were
annotated with two, and those exports are still read. `_points_of` therefore pads a short
keypoint list with v=0 -- an absent toe/heel is `outside`, which is exactly what the spec
says an unplaceable point is, not a parse error. `export_keypoint_names` reports what a
given export actually carried so a run can say so out loud instead of guessing.
"""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# CVAT's COCO Keypoints 1.0 export puts the annotations here regardless of task name.
COCO_ENTRY_CANDIDATES = (
    "annotations/person_keypoints_default.json",
    "annotations/instances_default.json",
)

MANIFEST_ENTRY = "manifest.json"

#: Keypoint order is fixed by the annotation spec, and fixed everywhere: CVAT sublabels,
#: COCO keypoint list, YOLO label columns, ONNX channels.
KEYPOINT_NAMES = ("butt", "hosel", "toe", "heel")

#: The two shaft points. `butt` -> `hosel` is the directed vector the shaft angle is read
#: off, and it is the pair the 2-point era measured -- so it is named rather than assumed
#: to be "the first two".
SHAFT_POINTS = ("butt", "hosel")

#: The two sole points. `heel` -> `toe` is the directed vector the BLADE angle is read
#: off. Absent from every export written before 2026-09.
SOLE_POINTS = ("toe", "heel")

#: What a pre-4-point export carries. Not a supported schema to write, only one to read.
LEGACY_KEYPOINT_NAMES = ("butt", "hosel")

#: Visibility flags as CVAT writes them: outside -> 0, occluded -> 1, visible -> 2.
V_OUTSIDE, V_OCCLUDED, V_VISIBLE = 0, 1, 2

PHASES = ("idle", "address", "backswing", "top", "downswing", "impact", "through", "finish")

_FRAME_SUFFIX_RE = re.compile(r"_f\d+$")


class ShaftDataError(RuntimeError):
    """Raised when an input archive is not shaped the way the spec says it is."""


# -----------------------------------------------------------------------------
# ZIP plumbing
# -----------------------------------------------------------------------------


def _normalise(name: str) -> str:
    return name.replace("\\", "/")


def read_zip_entry(zf: zipfile.ZipFile, wanted: str) -> bytes:
    """Read one entry, tolerating backslash-separated names in the archive."""
    target = _normalise(wanted)
    for info in zf.infolist():
        if _normalise(info.filename) == target:
            return zf.read(info)
    raise ShaftDataError("entry {!r} not found in {}".format(wanted, zf.filename))


def read_coco(coco_zip: Path) -> dict:
    """Load the COCO Keypoints document out of a CVAT export ZIP."""
    with zipfile.ZipFile(coco_zip) as zf:
        names = {_normalise(i.filename) for i in zf.infolist()}
        for candidate in COCO_ENTRY_CANDIDATES:
            if candidate in names:
                return json.loads(read_zip_entry(zf, candidate).decode("utf-8"))
        annotation_jsons = sorted(
            n for n in names if n.startswith("annotations/") and n.endswith(".json")
        )
        if len(annotation_jsons) == 1:
            return json.loads(read_zip_entry(zf, annotation_jsons[0]).decode("utf-8"))
    raise ShaftDataError(
        "{} holds no recognisable COCO annotations file (looked for {})".format(
            coco_zip, ", ".join(COCO_ENTRY_CANDIDATES)
        )
    )


def read_manifest(batch_zip: Path) -> dict:
    """Read `manifest.json` from a batch/calibration ZIP as {frameId: record}."""
    with zipfile.ZipFile(batch_zip) as zf:
        manifest = json.loads(read_zip_entry(zf, MANIFEST_ENTRY).decode("utf-8"))
    frames = manifest.get("frames") or []
    return {f["id"]: f for f in frames if f.get("id")}


def frame_id_from_file_name(file_name: str) -> str:
    """`frames/001-d15a2abb_s00_f06.jpg` -> `001-d15a2abb_s00_f06`."""
    base = _normalise(str(file_name)).rsplit("/", 1)[-1]
    return re.sub(r"\.jpe?g$", "", base, flags=re.IGNORECASE)


def swing_key(frame_id: str) -> str:
    """Group key for all frames out of the same swing (`..._s00_f03` -> `..._s00`).

    Used to keep a train/val split from putting two frames of one swing on both
    sides of it -- frames from one swing are near-duplicates, and a split that
    straddles a swing measures memorisation.
    """
    return _FRAME_SUFFIX_RE.sub("", frame_id)


# -----------------------------------------------------------------------------
# Annotation records
# -----------------------------------------------------------------------------


@dataclass
class Point:
    """One annotated keypoint. `placed` is decided by `v`, never by x/y."""

    x: float
    y: float
    v: int

    @property
    def placed(self) -> bool:
        return self.v >= V_OCCLUDED


@dataclass
class FrameAnnotation:
    frame_id: str
    width: int
    height: int
    file_name: str
    points: list
    no_shaft: bool = False
    view: str = ""
    blur: str = ""
    phase: str = ""
    extra_annotations: int = 0  # duplicate shaft objects on this image that we dropped

    @property
    def placed_points(self) -> list:
        return [p for p in self.points if p.placed]

    @property
    def n_placed(self) -> int:
        """0..4. Not a boolean any more: the schema has four points and a frame may carry
        any number of them (grip behind a shoulder, head out of frame, sole seen end-on)."""
        return len(self.placed_points)

    def point(self, name: str):
        """The named keypoint. Use this, not `points[0]`."""
        return point_by_name(self.points, name)

    def placed_all(self, *names: str) -> bool:
        """True when every named point is placed. `placed_all(*SHAFT_POINTS)` is the
        precondition for a shaft angle; `placed_all(*SOLE_POINTS)` for a blade angle."""
        return all(self.point(name).placed for name in names)


@dataclass
class ParsedExport:
    frames: dict = field(default_factory=dict)
    images_without_shaft: list = field(default_factory=list)
    duplicate_annotations: list = field(default_factory=list)


def _points_of(ann: dict) -> list:
    """Always `len(KEYPOINT_NAMES)` points, in spec order.

    A short list is PADDED WITH v=0, never rejected: a two-point export from batch-01 or
    a calibration pass is a valid four-point annotation whose toe and heel nobody placed,
    and `v=0` is precisely how the spec records a point that could not be placed
    (docs/shaft/annotation-spec.md -> *Bakatkompatibilitet*). A longer list is truncated
    for the same reason in reverse -- reading the first four keeps the fixed order
    meaningful if a future schema appends points.
    """
    flat = list(ann.get("keypoints") or [])
    n = len(KEYPOINT_NAMES)
    if len(flat) < 3 * n:
        flat += [0.0] * (3 * n - len(flat))
    points = []
    for i in range(n):
        x, y, v = flat[3 * i], flat[3 * i + 1], flat[3 * i + 2]
        points.append(Point(float(x), float(y), int(v)))
    return points


def point_by_name(points: list, name: str):
    """One point out of a spec-ordered list, addressed by name rather than by index.

    Index arithmetic on a list whose length just changed is the mistake this exists to
    make impossible.
    """
    return points[KEYPOINT_NAMES.index(name)]


def _enclosing_area(points: list) -> float:
    placed = [p for p in points if p.placed]
    if len(placed) < 2:
        return 0.0
    xs = [p.x for p in placed]
    ys = [p.y for p in placed]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def _annotation_rank(ann: dict) -> tuple:
    """Sort key picking which annotation to keep when an image carries several.

    Most placed points wins; then the larger enclosing rectangle; then the lowest
    annotation id, so the choice is deterministic. Duplicates happen for real -- two
    of batch-01's 146 frames carry a second, accidental `shaft` object -- and the
    partially drawn one is the one to throw away.
    """
    points = _points_of(ann)
    n_placed = sum(1 for p in points if p.placed)
    return (-n_placed, -_enclosing_area(points), ann.get("id", 0))


def parse_export(coco: dict, category: str = "shaft") -> ParsedExport:
    """Turn a COCO document into one `FrameAnnotation` per image.

    Attributes (`view`, `blur`, `phase`, `no_shaft`) are read off the kept shaft
    annotation, which is where CVAT puts them for this label schema.
    """
    cats = {c["name"]: c["id"] for c in coco.get("categories", [])}
    if category not in cats:
        raise ShaftDataError(
            "no {!r} category in export (found: {})".format(
                category, ", ".join(sorted(cats)) or "none"
            )
        )
    cat_id = cats[category]

    images = {img["id"]: img for img in coco.get("images", [])}
    by_image: dict = {}
    for ann in coco.get("annotations", []):
        if ann.get("category_id") == cat_id:
            by_image.setdefault(ann["image_id"], []).append(ann)

    out = ParsedExport()
    for image_id, img in images.items():
        frame_id = frame_id_from_file_name(img["file_name"])
        anns = by_image.get(image_id, [])
        if not anns:
            out.images_without_shaft.append(frame_id)
            continue

        keep = sorted(anns, key=_annotation_rank)[0]
        if len(anns) > 1:
            out.duplicate_annotations.append(frame_id)

        attrs = keep.get("attributes") or {}
        out.frames[frame_id] = FrameAnnotation(
            frame_id=frame_id,
            width=int(img["width"]),
            height=int(img["height"]),
            file_name=_normalise(img["file_name"]),
            points=_points_of(keep),
            no_shaft=bool(attrs.get("no_shaft", False)),
            view=str(attrs.get("view", "") or ""),
            blur=str(attrs.get("blur", "") or ""),
            phase=str(attrs.get("phase", "") or ""),
            extra_annotations=len(anns) - 1,
        )
    return out


def export_keypoint_names(coco: dict, category: str = "shaft") -> tuple:
    """The keypoint names the export itself declares, in its own order.

    COCO carries the schema on the category, so an export says for itself whether it is a
    four-point or a legacy two-point file. Read it rather than inferring from the length
    of the first `keypoints` list -- a frame with nothing placed is still full-length.
    Returns `()` when the category declares none (some CVAT versions omit the field).
    """
    for cat in coco.get("categories", []):
        if cat.get("name") == category:
            return tuple(str(k) for k in (cat.get("keypoints") or []))
    return ()


def keypoint_schema_note(names) -> str:
    """One line describing how an export's keypoint schema lines up with the spec's.

    The point is that a legacy export is READ, not rejected, and that the run says so
    rather than quietly producing a dataset with two dead columns nobody ordered.
    """
    names = tuple(names)
    if not names:
        return (
            "export declares no keypoint names; assuming spec order {}".format(
                "/".join(KEYPOINT_NAMES)
            )
        )
    if names == KEYPOINT_NAMES:
        return "4-point schema ({})".format("/".join(names))
    if names == LEGACY_KEYPOINT_NAMES:
        return (
            "legacy 2-point schema ({}); {} read as outside".format(
                "/".join(names), "/".join(SOLE_POINTS)
            )
        )
    if names == KEYPOINT_NAMES[: len(names)]:
        return (
            "{}-point export ({}); the missing {} read as outside".format(
                len(names),
                "/".join(names),
                "/".join(KEYPOINT_NAMES[len(names):]),
            )
        )
    return (
        "UNEXPECTED keypoint order {} -- the spec's order is {}; points are read "
        "POSITIONALLY, so this export is mislabelled unless the order is fixed".format(
            "/".join(names), "/".join(KEYPOINT_NAMES)
        )
    )


def verify_visibility_coding(coco: dict, category: str = "shaft") -> list:
    """Sanity-check the outside/occluded/visible -> 0/1/2 mapping against the file.

    The mapping is an assumption about someone else's exporter, so it gets checked
    rather than trusted (the same three checks as `scripts/measure-calibration.mjs`).
    Returns a list of human-readable warnings; empty means all three held.
    """
    warnings: list = []
    cats = {c["name"]: c["id"] for c in coco.get("categories", [])}
    cat_id = cats.get(category)
    anns = [a for a in coco.get("annotations", []) if a.get("category_id") == cat_id]
    if not anns:
        return ["no {!r} annotations to verify".format(category)]

    seen_v: set = set()
    num_kp_mismatch = 0
    for ann in anns:
        points = _points_of(ann)
        seen_v.update(p.v for p in points)
        declared = ann.get("num_keypoints")
        if declared is not None and int(declared) != sum(1 for p in points if p.v > 0):
            num_kp_mismatch += 1

    stray = seen_v - {V_OUTSIDE, V_OCCLUDED, V_VISIBLE}
    if stray:
        warnings.append("unexpected visibility values present: {}".format(sorted(stray)))
    if num_kp_mismatch:
        warnings.append(
            "num_keypoints disagrees with the count of v>0 points on {}/{} annotations".format(
                num_kp_mismatch, len(anns)
            )
        )
    if V_OCCLUDED not in seen_v:
        warnings.append(
            "no v=1 anywhere in this export, so occluded->1 is UNCONFIRMED, not confirmed"
        )
    return warnings


# -----------------------------------------------------------------------------
# Phase
# -----------------------------------------------------------------------------


def read_phase_corrected(path: Path) -> dict:
    """Read `phase-corrected.json` as {frameId: annotated phase}.

    That file is authoritative per `scripts/reconcile-phase.mjs`; the manifest's
    derived value was wrong on ~50 % of batch-01.
    """
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    out: dict = {}
    for frame_id, rec in (doc.get("frames") or {}).items():
        annotated = (rec or {}).get("annotated")
        if isinstance(annotated, str) and annotated.strip():
            out[frame_id] = annotated.strip()
    return out


def resolve_phase(
    frame_id: str,
    corrected: dict,
    annotation_phase: str = "",
    manifest: dict = None,
) -> tuple:
    """Return `(phase, source)` using the spec's precedence.

    phase-corrected.json first, then the value the annotator set in CVAT, then the
    manifest's derived value. Phase is never trained against -- it rides along in a
    sidecar so the evaluation can bucket by it.
    """
    if frame_id in corrected:
        return corrected[frame_id], "phase-corrected"
    if annotation_phase:
        return annotation_phase, "annotation"
    record = (manifest or {}).get(frame_id) or {}
    derived = record.get("phase")
    if isinstance(derived, str) and derived.strip():
        return derived.strip(), "manifest"
    return "", "missing"


def read_reserved_ids(path: Path) -> set:
    """Read the evalset reservation list -- ids that must never reach training."""
    text = Path(path).read_text(encoding="utf-8")
    return {
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
