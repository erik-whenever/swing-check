#!/usr/bin/env python3
"""Pre-label a training batch with the shipped detector and write a CVAT-importable XML.

WHAT THIS IS FOR. The annotator places four points per frame (butt, hosel, toe, heel).
The shipped detector is a TWO-point model, so it can only offer the first two -- see
"WHAT THIS SCRIPT DOES NOT SET" below. Where the detector is already right to within a
couple of degrees, adopting its guess is cheaper than drawing from scratch — and where it is WRONG IN A PARTICULAR WAY, adopting it is more
expensive than drawing from scratch, because a plausible-looking shaft that points the
wrong way is a correction you have to notice before you can make it.

So the whole design question is: which frames may be pre-labelled?

THE FAILURE MODE, MEASURED. shaft-v1 sometimes returns `butt` and `hosel` swapped —
the shaft direction reversed ~180°. On the calibration set (97 frames, the permanent
eval set) that happened twice, and both times on a frame at least one annotator called
`face_on`:

    view bucket (per erik)   pre-labelled   median angle error   swaps >90°
    dtl                            50             2.6°              0
    face_on                         4           158.6°              2

158.6° is the number in the eval report. The mechanism is foreshortening: seen from
face-on the shaft frequently points towards or away from the camera, the two ends are
a few pixels apart in projection, and nothing in the image says which end is the grip.

THAT WAS v1. shaft-v2 IS MEASURED DIFFERENTLY, SO THE GATE MOVED. Re-running
`evaluate.py` on `shaft-v2.onnx` over the same 97 frames (CPU/ONNX, 2026-09-14):

    view      frames   median angle error   worst deviation   swaps >90°
    dtl           85          1.03°             14.33°            0
    face_on       10          3.78°              4.08°            0
    other          1        178.61°            178.61°            1

The swap is gone from `face_on` — and note the shape of what is left: the worst
`face_on` deviation (4.08°) is SMALLER than the four worst `dtl` deviations (14.33°,
13.02°, 11.93°, 11.46°). The single catastrophic frame in the set is `other`, not
`face_on`. So the gate now admits `face_on` and still refuses `other`, which is the
population where the one remaining swap actually lives.

What did NOT improve is coverage: `face_on` is 6/10 frames with no detection at all
(60 %, against 13 % for `dtl`). Loosening the gate therefore buys fewer pre-labels than
the frame count suggests — most of the newly admitted frames fall out at `no-detection`,
which is the safe failure. The report prints both numbers.

TWO HEURISTICS WERE TRIED AND BOTH FAILED. They are recorded here because the obvious
next person will try them again:

  1. "Skip frames whose predicted shaft is too short relative to the subject."
     It does not work. Ground-truth shaft length as a fraction of image height is
     0.032–0.313 for `dtl` and 0.116–0.239 for `face_on` — the face-on range sits
     entirely INSIDE the dtl range, so no threshold separates them. Worse, the two
     swapped frames had predicted lengths of 0.168 H and 0.261 H (long, and normal),
     while the two SHORTEST predictions in the set (0.054 H, 0.084 H) were accurate to
     13.7° and 2.5°. A length gate would throw away good pre-labels and keep both bad
     ones. Both swaps also had box confidence ~0.73 and keypoint scores ~1.00, so no
     confidence threshold catches them either.

  2. "Flag a frame whose angle disagrees with the other frames of the same swing."
     It does not work, for a reason that is obvious afterwards: the shaft sweeps
     through most of a circle during a swing, so sibling frames from other phases have
     no common direction to be an outlier against. Measured over the 55 calibration
     frames with ground truth: 0 swaps caught, 2 missed, 24 false alarms.

WHAT DOES WORK: DERIVE THE VIEW PER SWING, FROM ANNOTATIONS THAT ALREADY EXIST.
`view` is a property of the camera, and the camera does not move during a swing. Every
frame already annotated (batch-01 + both calibration passes) carries an annotator's
`view`, and a frame id encodes its swing (`<slug>-<hash>_sNN_fNN`), so an annotated
frame labels its whole swing. A frame is pre-labelled only when every annotated view of
its swing is one the gate allows. That is the population where the measured swap count
is zero — `{dtl}` for v1, `{dtl, face_on}` for v2 (see the table above).

  NOT per CLIP. Clips do change angle between swings — `072.mp4` (s00 dtl, s02
  face_on), `IMG_5426.MP4` (s00 dtl, s01 face_on) and `IMG_5428.MP4` are annotated
  proof of it. A clip-level lookup would cover ~4 % more of batch-02 and would quietly
  pre-label the face-on swings of exactly those clips.

  UNANIMITY, not majority — but unanimity *within the allowed set*. Where erik and lisa
  disagreed about `view` on the same frame, it was 4 times out of 4 erik `face_on` /
  lisa `dtl` — one-directional, the same shape as the `occluded`/`visible` disagreement
  in the spec. Under v1's `{dtl}` gate a disputed swing was blocked, which cost a
  handful of pre-labels and removed the frame that produced the 160.6° swap. Under
  `{dtl, face_on}` such a swing passes, because both of the views in dispute are now
  admissible and the dispute is no longer a question the gate needs answered. An
  `other` anywhere in the swing still blocks it.

A swing with no annotated frame at all is NOT pre-labelled. That is the conservative
direction on purpose: no view evidence is not evidence of dtl.

WHAT THIS SCRIPT DOES NOT SET. `view` and `blur` are the annotator's, and the spec's
whole point is that they are judged, not inherited. `phase` is not pre-filled either —
prefill is disabled project-wide because the derivation was ~50 % wrong (F5). The
skeleton is emitted with no attributes at all, so CVAT applies the label defaults and
every attribute is still an unanswered question when the annotator opens the frame.

TOE AND HEEL ARE NOT PRE-LABELLED. The shipped model predates the four-point schema and
emits two keypoints; there is nothing to pre-label them with, and inventing a sole from a
shaft direction would be a guess wearing a measurement's clothes. They are written into
every skeleton as `outside="1"` so the object carries all four sublabels the task's label
schema declares — an unplaceable point is `outside`, which is exactly what the spec says
(annotation-spec.md → *Punktflaggor*). The annotator places them from nothing. When a
four-point checkpoint exists, `SOLE_POINTS` here is where it plugs in.

Usage:
  py -3.11 training/prelabel_batch.py --batch data/shaft/training/batch-03/batch.zip
  py -3.11 training/prelabel_batch.py --batch … --dry-run        # reports, writes nothing
  py -3.11 training/prelabel_batch.py --batch … --view-gate swing  # v1's strict dtl-only gate
  py -3.11 training/prelabel_batch.py --batch … --view-gate off    # measures what the gate costs
"""
from __future__ import annotations

import argparse
import io
import json
import math
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# The only directory this script may write into — same guard, and the same reason, as
# scripts/build-training-batch.mjs.
WRITE_ROOT = ROOT / 'data' / 'shaft'

# The SHIPPED model — same file `src/lib/shaft/shaftDetector.ts` → `MODEL_FILE` names, so
# a pre-label is the same guess the app would make. Pointing this at anything else means
# the annotator corrects a model nobody runs.
DEFAULT_MODEL = ROOT / 'public' / 'models' / 'shaft-v2.onnx'

# NOT the default, and not used by this script: the model the S-11 web/Python geometry
# numbers were recorded against. `test_prelabel_batch.py` pins `preprocess` +
# `model_to_image` to the pixel against it, and those coordinates are v1's. The constant
# lives here so the test names a model rather than re-deriving a path, and so that
# swapping the shipped model never silently re-pins the parity test.
GEOMETRY_REFERENCE_MODEL = ROOT / 'public' / 'models' / 'shaft-v1.onnx'
LABELS_FILE = ROOT / 'docs' / 'shaft' / 'cvat-labels.json'

# Thresholds. The same values src/lib/shaft/shaftPostprocess.ts uses in the web app, so
# a frame pre-labelled here is a frame the app would also have reported.
DEFAULT_CONF = 0.25
DEFAULT_KEYPOINT = 0.5

# Ultralytics' letterbox pad grey. Not black: 114 is what the model trained on.
PAD_VALUE = 114

# A shaft shorter than this fraction of the image height is a degenerate object, not a
# pre-label — two points a few pixels apart draw as a dot and say nothing about
# direction. This is NOT the length heuristic rejected in the header: that one tried to
# infer the VIEW from length, which the data refuses. This is only a floor against a
# collapsed object, set an order of magnitude below the shortest correct prediction
# observed (0.054 H). It is expected to fire on nothing; the report says whether it did.
MIN_SHAFT_FRACTION = 0.01

# Keypoint schema, mirrored from training/shaft_coco.py rather than retyped -- this
# script writes the sublabel names CVAT will match against, and a typo here is a skeleton
# CVAT silently refuses.
SHAFT_POINTS = ('butt', 'hosel')
SOLE_POINTS = ('toe', 'heel')

SKIP_REASONS = [
    'view-blocked',
    'view-unknown',
    'no-detection',
    'keypoint-below-threshold',
    'degenerate-shaft',
]

# A swing's view bucket, derived from every annotated view any annotator gave any of its
# frames. `dtl` and `face_on` are the unanimous-within-the-set cases; a swing carrying
# `other` anywhere lands in `other`, and one with no annotated frame at all in `unknown`.
VIEW_BUCKETS = ('dtl', 'face_on', 'other', 'unknown')

#: Which buckets each `--view-gate` mode pre-labels. The mode names are the gate, not a
#: description of it: `swing` is v1's measured-safe population (`{dtl}`), `swing+face_on`
#: is v2's (see the table in the module docstring), `off` gates on nothing.
#:
#: `unknown` is admitted only by `off`, and deliberately: no view evidence is not
#: evidence of an allowed view, in either gate.
GATE_BUCKETS = {
    'swing': frozenset({'dtl'}),
    'swing+face_on': frozenset({'dtl', 'face_on'}),
    'off': frozenset(VIEW_BUCKETS),
}
DEFAULT_VIEW_GATE = 'swing+face_on'

# ─────────────────────────────────────────────────────────────────────────────
# View derivation
# ─────────────────────────────────────────────────────────────────────────────

FRAME_ID_RE = re.compile(r'^(?P<swing>.+)_f\d+$')


def rel_to_root(path: Path) -> str:
    """A path for printing: repo-relative when it is inside the repo, absolute otherwise.

    `--annotated` may legitimately point outside the repo (an export that has not been
    filed yet), and a report line is not worth an exception.
    """
    try:
        return str(path.resolve().relative_to(ROOT)).replace('\\', '/')
    except ValueError:
        return str(path)


def swing_of(frame_id: str) -> str:
    """The swing a frame id belongs to: everything before the `_fNN` suffix.

    Derived from the id rather than looked up in a manifest because the id is
    self-describing by construction (annotation-spec.md → *ZIP-innehåll*): the slug and
    filename hash identify the clip, `_sNN` the swing within it. One fewer file that has
    to be present and consistent for the view gate to be right.
    """
    m = FRAME_ID_RE.match(frame_id)
    if not m:
        raise ValueError(f'frame id does not carry a swing index: {frame_id!r}')
    return m.group('swing')


def read_coco_views(path: Path) -> dict[str, str]:
    """`{frame id: view}` from one CVAT COCO Keypoints export (annotations only)."""
    with zipfile.ZipFile(path) as z:
        name = next((n for n in z.namelist() if n.endswith('.json')), None)
        if name is None:
            raise ValueError(f'{path}: no JSON annotation file in the archive')
        doc = json.loads(z.read(name))
    shaft_ids = {c['id'] for c in doc.get('categories', []) if c.get('name') == 'shaft'}
    images = {i['id']: i for i in doc.get('images', [])}
    out: dict[str, str] = {}
    for ann in doc.get('annotations', []):
        if ann.get('category_id') not in shaft_ids:
            continue
        image = images.get(ann['image_id'])
        if image is None:
            continue
        frame_id = re.sub(r'^.*/|\.jpg$', '', image['file_name'])
        view = (ann.get('attributes') or {}).get('view')
        if view:
            out[frame_id] = view
    return out


def find_annotation_exports(explicit: list[Path]) -> list[Path]:
    """Every human-annotated export we can learn a `view` from.

    Auto-discovered rather than listed, for the same reason the batch draw
    auto-discovers `ids.txt`: a source that has to be remembered is a source that gets
    forgotten, and a forgotten one here does not fail — it silently shrinks the set of
    swings we can prove are `dtl`, which shows up as fewer pre-labels and no error.

    Superseded exports (`annotated-v1.zip` next to `annotated-v2.zip`) are read too, and
    deliberately so: views are UNIONed, so a view that a later pass corrected still
    disqualifies its swing. Both directions of that correction land on "not unanimously
    dtl", which is the safe side of the gate.
    """
    if explicit:
        return explicit
    found: list[Path] = []
    for pattern in ('calibration/*.zip', 'training/*/annotated*.zip'):
        for path in sorted(WRITE_ROOT.glob(pattern)):
            if path.name == 'calibration.zip':
                continue  # images + manifest, no annotations
            found.append(path)
    return found


def view_bucket(views: set[str] | None) -> str:
    """Which `VIEW_BUCKETS` bucket a swing falls in, given every view annotators gave it.

    `None` (no annotated frame at all) is `unknown`, not `dtl`: absence of view evidence
    is not evidence of a view, and the gate must never read it as one.

    The two admissible buckets are defined by SUBSET, not equality — `{dtl}` and
    `{dtl, face_on}` both land in a bucket the `swing+face_on` gate admits, so a swing
    two annotators disagreed about (always erik `face_on` / lisa `dtl`, 4 of 4) is no
    longer blocked by a dispute whose both answers are now allowed. Anything containing
    `other` is `other`, whatever else it contains: `other` is the one view where v2's
    remaining >90° swap actually lives.
    """
    if views is None:
        return 'unknown'
    if views <= {'dtl'}:
        return 'dtl'
    if views <= {'dtl', 'face_on'}:
        return 'face_on'
    return 'other'


def build_swing_views(exports: list[Path]) -> tuple[dict[str, set[str]], dict[str, int]]:
    """`{swing key: {every view any annotator gave any frame of that swing}}`."""
    views: dict[str, set[str]] = defaultdict(set)
    per_export: dict[str, int] = {}
    for path in exports:
        frames = read_coco_views(path)
        per_export[rel_to_root(path)] = len(frames)
        for frame_id, view in frames.items():
            try:
                views[swing_of(frame_id)].add(view)
            except ValueError:
                continue  # not an extractor id; not ours to interpret
    return views, per_export


# ─────────────────────────────────────────────────────────────────────────────
# Inference — mirrors src/lib/shaft/{letterbox,shaftPostprocess}.ts
# ─────────────────────────────────────────────────────────────────────────────
#
# The web app runs the same model through the same geometry in TypeScript. Two
# implementations of one transform is the classic place a chain drifts, so the numbers
# below are pinned against the three frames S-11 verified in both environments
# (docs/BACKLOG.md → S-11), and `test_prelabel_batch.py` re-checks them.


def compute_letterbox(src_w: int, src_h: int, size: int):
    """Ultralytics `LetterBox(scaleup=True, center=True)`, including its `round(pad-0.1)`."""
    if src_w <= 0 or src_h <= 0:
        raise ValueError(f'invalid source size {src_w}x{src_h}')
    scale = min(size / src_w, size / src_h)
    draw_w, draw_h = round(src_w * scale), round(src_h * scale)
    pad_x = max(0, round((size - draw_w) / 2 - 0.1))
    pad_y = max(0, round((size - draw_h) / 2 - 0.1))
    return scale, pad_x, pad_y, draw_w, draw_h


def model_to_image(scale: float, pad_x: int, pad_y: int, x: float, y: float):
    """Model pixel → source pixel. Forgetting the padding gives coordinates that are
    plausible, stable, and wrong by the pad width."""
    return (x - pad_x) / scale, (y - pad_y) / scale


def preprocess(image: np.ndarray, size: int) -> tuple[np.ndarray, float, int, int]:
    scale, pad_x, pad_y, draw_w, draw_h = compute_letterbox(image.shape[1], image.shape[0], size)
    canvas = np.full((size, size, 3), PAD_VALUE, np.uint8)
    canvas[pad_y:pad_y + draw_h, pad_x:pad_x + draw_w] = cv2.resize(
        image, (draw_w, draw_h), interpolation=cv2.INTER_LINEAR
    )
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return np.transpose(rgb, (2, 0, 1))[None], scale, pad_x, pad_y


def iou(a, b) -> float:
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    overlap = w * h
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - overlap
    return overlap / union if union > 0 else 0.0


def select_best(raw: np.ndarray, conf_threshold: float, iou_threshold: float = 0.45):
    """Highest-confidence detection after NMS, in model pixels, or None.

    Channel layout (training/README.md → *Utdataformat*): 0..3 box cx/cy/w/h, 4 conf,
    5..7 butt x/y/v, 8..10 hosel x/y/v. That is the LEGACY 2-point layout, which is what
    the shipped checkpoint emits; a four-point model would carry 11..16 as toe and heel.
    """
    conf = raw[4]
    idx = np.nonzero(conf >= conf_threshold)[0]
    if idx.size == 0:
        return None
    idx = idx[np.argsort(-conf[idx])]
    kept: list[int] = []
    boxes = {}
    for i in idx:
        cx, cy, w, h = raw[0, i], raw[1, i], raw[2, i], raw[3, i]
        box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
        if all(iou(boxes[k], box) <= iou_threshold for k in kept):
            kept.append(int(i))
            boxes[int(i)] = box
    best = kept[0]
    return dict(
        conf=float(raw[4, best]),
        butt=(float(raw[5, best]), float(raw[6, best])),
        butt_score=float(raw[7, best]),
        hosel=(float(raw[8, best]), float(raw[9, best])),
        hosel_score=float(raw[10, best]),
        detections=len(kept),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CVAT output
# ─────────────────────────────────────────────────────────────────────────────
#
# FORMAT: "CVAT for images 1.1", verified against CVAT's own documentation for the
# current self-hosted release (docs.cvat.ai → Dataset management → Formats → CVAT for
# image, and the same page's source in cvat-ai/cvat@develop), NOT assumed:
#
#   - `<skeleton label="…" source="…" z_order="…">` with nested
#     `<points label="…" occluded="0|1" source="…" outside="0|1" points="x,y">` is the
#     documented representation. Both the schema block and the worked example on that
#     page carry it.
#   - `<points label="…">` names the SUBLABEL — `butt`, `hosel`, `toe`, `heel`, written
#     in that order. The sole points carry `outside="1"`: the model has no opinion about
#     them, and CVAT's own representation of "point not placed" is the flag, not omission.
#   - The label schema cannot be created by importing the file: "Only label names can be
#     imported this way, colors, attributes, and skeleton labels must be defined
#     manually." So the `shaft` skeleton label must already exist on the task, with all
#     FOUR sublabels, entered by hand in CVAT's label constructor after
#     docs/shaft/cvat-labels.json. That file is the repo's copy; CVAT keeps the real one
#     in its database and never reads ours.
#   - COCO Keypoints 1.0 also imports skeletons and would have worked. CVAT-for-images
#     1.1 is chosen because it is CVAT's own lossless format, it carries the per-point
#     `outside` flag the spec's three-state visibility rule is built on, and the repo
#     already has a verified round trip through it (prefill-phase.xml, S-9).
#
# `source="manual"`, not `"auto"`. Both are documented values, and `auto` would be the
# semantically truer one — but it is the value this repo has never round-tripped, and a
# pre-label that CVAT accepts but files differently is exactly the silent failure the
# prefill-phase episode is remembered for. The ability to tell later which points came
# from the model does not depend on the flag: `prelabel.xml` is kept next to the batch,
# so diffing it against the returned export says precisely which points the annotator
# moved, and by how much.
#
# `occluded="0"` on every point, always. CVAT's `occluded` is one of the spec's three
# visibility states, and those are the annotator's judgement about what is visible in
# the image (annotation-spec.md → *Punktflaggor*). A keypoint score is not that
# judgement and must not be dressed up as one.


def skeleton_labels_meta() -> list[str]:
    """The `<labels>` block, built from docs/shaft/cvat-labels.json.

    Included because CVAT's own export includes it and matching the producer is the
    lowest-risk shape to hand an importer. It does NOT create anything: the label has to
    exist on the task already (see the note above). Built from the committed schema
    rather than typed out again so the sublabel names cannot drift away from the ones
    the annotator's task actually has.
    """
    schema = json.loads(LABELS_FILE.read_text(encoding='utf-8'))
    shaft = next((label for label in schema if label.get('name') == 'shaft'), None)
    if shaft is None:
        raise ValueError(f'{LABELS_FILE}: no "shaft" label')
    lines = ['      <labels>', '        <label>', f'          <name>{escape(shaft["name"])}</name>',
             '          <type>skeleton</type>', '          <attributes>']
    for attr in shaft.get('attributes', []):
        lines += [
            '            <attribute>',
            f'              <name>{escape(attr["name"])}</name>',
            f'              <mutable>{"True" if attr.get("mutable") else "False"}</mutable>',
            f'              <input_type>{escape(attr["input_type"])}</input_type>',
            f'              <default_value>{escape(str(attr.get("default_value", "")))}</default_value>',
            f'              <values>{"&#xA;".join(escape(str(v)) for v in attr.get("values", []))}</values>',
            '            </attribute>',
        ]
    lines += ['          </attributes>', f'          <svg>{escape(shaft.get("svg", ""))}</svg>',
              '        </label>']
    for sub in shaft.get('sublabels', []):
        lines += ['        <label>', f'          <name>{escape(sub["name"])}</name>',
                  '          <type>points</type>', '          <attributes>',
                  '          </attributes>', f'          <parent>{escape(shaft["name"])}</parent>',
                  '        </label>']
    lines.append('      </labels>')
    return lines


def prelabel_xml(frames: list[dict], name_prefix: str = 'frames/') -> str:
    """A "CVAT for images 1.1" document: every frame as an `<image>`, a `<skeleton>` on
    the ones that earned a pre-label.

    Every frame gets an element, including the skipped ones, so the `id` sequence is the
    task's own frame order. CVAT matches images by `name`, and the names here carry the
    `frames/` prefix to match `batch.zip` (CVAT keeps relative paths out of an uploaded
    archive). A task created from a directory of loose JPEGs sees bare `<id>.jpg` names
    instead — pass `--name-prefix ''` for that.
    """
    lines = ['<?xml version="1.0" encoding="utf-8"?>', '<annotations>', '  <version>1.1</version>',
             '  <meta>', '    <task>', f'      <size>{len(frames)}</size>',
             '      <mode>annotation</mode>']
    lines += skeleton_labels_meta()
    lines += ['    </task>', '  </meta>']

    for i, frame in enumerate(frames):
        name = f'{name_prefix}{frame["id"]}.jpg'
        attrs = f'id="{i}" name={quoteattr(name)}'
        if frame.get('width') and frame.get('height'):
            attrs += f' width="{frame["width"]}" height="{frame["height"]}"'
        pre = frame.get('prelabel')
        if not pre:
            lines.append(f'  <image {attrs}/>')
            continue
        lines.append(f'  <image {attrs}>')
        lines.append('    <skeleton label="shaft" source="manual" z_order="0">')
        for point_label in SHAFT_POINTS:
            x, y = pre[point_label]
            lines.append(
                f'      <points label="{point_label}" occluded="0" source="manual" '
                f'outside="0" points="{x:.2f},{y:.2f}">'
            )
            lines.append('      </points>')
        # The sole points: present so the skeleton carries every sublabel the task
        # declares, `outside` because the model has nothing to say about them.
        for point_label in SOLE_POINTS:
            lines.append(
                f'      <points label="{point_label}" occluded="0" source="manual" '
                f'outside="1" points="0.00,0.00">'
            )
            lines.append('      </points>')
        lines.append('    </skeleton>')
        lines.append('  </image>')

    lines += ['</annotations>', '']
    return '\n'.join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────────────────────

REASON_TEXT = {
    'view-blocked': 'Svingen bär en annoterad `view` som grinden inte släpper in. Med '
                    '`swing+face_on` betyder det att någon annotatör sagt `other`; med `swing` '
                    'räcker ett enda `face_on`.',
    'view-unknown': 'Ingen annoterad frame ur den svingen finns ännu, så vyn går inte att '
                    'belägga. Ingen vyevidens är inte evidens för en tillåten vy.',
    'no-detection': 'Ingen box över konfidenströskeln — modellen hittar ingen klubba.',
    'keypoint-below-threshold': 'Box funnen men minst en punkt under keypoint-tröskeln. '
                                'En ensam punkt går varken att längdkontrollera eller rikta.',
    'degenerate-shaft': 'Skaftpunkterna ligger så nära varandra att objektet ritas som en prick.',
}


def report_markdown(frames, ctx) -> str:
    total = len(frames)
    pre = [f for f in frames if f.get('prelabel')]
    skipped = [f for f in frames if not f.get('prelabel')]
    by_reason = Counter(f['reason'] for f in skipped)
    pct = lambda n: f'{n / max(1, total) * 100:.0f} %'

    L = [f'# Förhandsmärkning `{ctx["batch_name"]}` — rapport', '']
    L += ['Genererad av `training/prelabel_batch.py`. **Redigera inte för hand** — kör om skriptet.', '']
    L += [f'- Frames i batchen: **{total}**',
          f'- Förhandsmärkta: **{len(pre)}** ({pct(len(pre))})',
          f'- Hoppade över: **{len(skipped)}** ({pct(len(skipped))}) — annotatören ritar från noll där',
          f'- Modell: `{ctx["model"]}` · imgsz {ctx["imgsz"]} · conf ≥ {ctx["conf"]} · keypoint ≥ {ctx["keypoint"]}',
          f'- Vygrind: **{ctx["view_gate"]}**', '']

    L += ['## Varför en frame hoppades över', '', '| Skäl | Frames | Andel | Vad det betyder |',
          '|---|---:|---:|---|']
    for reason in SKIP_REASONS:
        n = by_reason.get(reason, 0)
        L.append(f'| `{reason}` | {n} | {pct(n)} | {REASON_TEXT[reason]} |')
    L += [f'| **Totalt** | **{len(skipped)}** | **{pct(len(skipped))}** | |', '']

    L += ['## Per fas', '', '| Fas | Frames | Förhandsmärkta | Andel |', '|---|---:|---:|---:|']
    phases = Counter(f['phase'] for f in frames)
    pre_phases = Counter(f['phase'] for f in pre)
    for phase, n in sorted(phases.items(), key=lambda kv: -kv[1]):
        got = pre_phases.get(phase, 0)
        L.append(f'| `{phase}` | {n} | {got} | {got / max(1, n) * 100:.0f} % |')
    L.append('')

    gate = ctx['view_gate']
    allowed = GATE_BUCKETS[gate]
    L += ['## Vygrinden', '',
          f'Grind: **`{gate}`** — en frame förhandsmärks bara när **varje redan annoterad vy ur',
          f'samma sving** ligger i {{{", ".join("`" + b + "`" for b in sorted(allowed))}}}.',
          'Kameran flyttar sig inte under en sving, så en annoterad frame etiketterar hela',
          'svingen; men den flyttar sig **mellan** svingar i samma klipp (`072.mp4`, `IMG_5426.MP4`,',
          '`IMG_5428.MP4` är annoterade bevis), så uppslagningen görs per sving och aldrig per klipp.',
          '', '| Vyunderlag | Svingar | Frames i batchen | Släpps in | Förhandsmärkta |',
          '|---|---:|---:|:--:|---:|']
    pre_by_bucket = Counter(f.get('view_bucket') for f in pre)
    for label, key in [('enhälligt `dtl`', 'dtl'), ('enhälligt sidled, någon `face_on`', 'face_on'),
                       ('någon `other`', 'other'), ('ingen annoterad frame', 'unknown')]:
        L.append(f'| {label} | {ctx["swings_by_view"].get(key, 0)} | '
                 f'{ctx["frames_by_view"].get(key, 0)} | {"ja" if key in allowed else "nej"} | '
                 f'{pre_by_bucket.get(key, 0)} |')

    # What the loosening actually bought. `face_on` is the bucket v1's gate refused and
    # v2's admits, so its two numbers ARE the delta -- no second pass needed.
    face_frames = ctx['frames_by_view'].get('face_on', 0)
    face_pre = pre_by_bucket.get('face_on', 0)
    L += ['']
    if gate == 'swing+face_on':
        strict_pre = len(pre) - face_pre
        gain = f'{face_pre / max(1, strict_pre) * 100:.0f} %'
        L += [f'**Vad lossningen gav.** `face_on`-hinken är precis den v1:s grind (`swing`) vägrade',
              f'och v2:s (`swing+face_on`) släpper in, så dess rader är skillnaden: **{face_frames} frames**',
              f'till i grinden, varav **{face_pre}** faktiskt blev förhandsmärkta. Mot `swing`-grindens',
              f'{strict_pre} är det **+{face_pre} ({gain})**.', '',
              f'Att {face_frames - face_pre} av de {face_frames} nya framesen ändå föll bort är väntat och',
              'ofarligt: `face_on` har 60 % frames utan detektion i kalibreringssetet (mot 13 % för',
              '`dtl`), så de flesta landar på `no-detection` — modellen avstår i stället för att gissa',
              'fel. Skälet att grinden kunde lossas är ett annat tal: v2:s värsta `face_on`-avvikelse',
              'är 4,08°, mindre än de fyra värsta `dtl`-avvikelserna (14,33°, 13,02°, 11,93°, 11,46°),',
              'och noll omkastningar >90°. v1 låg på 158,6° median där.', '']
    else:
        L += [f'> Grinden står på `{gate}`. `swing+face_on` är den mätta standarden för `shaft-v2`;',
              f'> `face_on`-hinken ({face_frames} frames här) är skillnaden mellan dem.', '']
    L += ['Vykällor som lästes:', '']
    for path, n in ctx['view_sources'].items():
        L.append(f'- `{path}` — {n} annoterade frames')
    L.append('')

    L += ['## Vad annotatören ska veta', '',
          '- De förhandsmärkta punkterna är **modellens gissning**, inte en facit. Flytta dem fritt;',
          '  `shaft-v2`:s medianfel på kalibreringssetet är 1,03° på `dtl` och 3,78° på `face_on`,',
          '  men svansen går till ~14°.',
          '- **`view`, `blur`, `phase` och `no_shaft` är osatta** och ska sättas som vanligt. Att en',
          '  frame är förhandsmärkt säger ingenting om vilken vy den har — bara att svingen den kom',
          '  ur redan är annoterad som en vy grinden släpper in, någon annanstans.',
          '- **`toe` och `heel` är inte förhandsmärkta.** Modellen är tvåpunkts och har ingen',
          '  åsikt om solan; de ligger som `outside` i skelettet och ska placeras från noll.',
          '- **Punktflaggorna är osatta** (skaftpunkterna ligger som `visible`). Modellens',
          '  keypoint-score är inte specens synlighetsbedömning; sätt `occluded`/`outside` själv',
          '  enligt *Punktflaggor* i specen.',
          '- En frame **utan** objekt är inte ett påstående om att där inte finns någon klubba — se',
          '  skältabellen ovan. Rita som vanligt.', '']
    return '\n'.join(L) + '\n'


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def assert_inside_data_shaft(target: Path) -> Path:
    resolved = target.resolve()
    if WRITE_ROOT.resolve() not in resolved.parents and resolved != WRITE_ROOT.resolve():
        raise SystemExit(f'refusing to write outside data/shaft/: {resolved}')
    return resolved


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--batch', required=True, type=Path, help='the batch ZIP to pre-label')
    ap.add_argument('--model', type=Path, default=DEFAULT_MODEL)
    ap.add_argument('--out', type=Path, default=None, help='output dir (default: the batch ZIP\'s dir)')
    ap.add_argument('--conf', type=float, default=DEFAULT_CONF)
    ap.add_argument('--keypoint', type=float, default=DEFAULT_KEYPOINT)
    ap.add_argument('--annotated', type=Path, action='append', default=[],
                    help='CVAT COCO export to read views from (repeatable; default: auto-discover)')
    ap.add_argument('--view-gate', choices=list(GATE_BUCKETS), default=DEFAULT_VIEW_GATE,
                    help='"off" pre-labels every detection — for measuring what the gate costs, '
                         'never for a batch that is going to be annotated')
    ap.add_argument('--name-prefix', default='frames/',
                    help='prefix on image names in the XML; "" for a task made from loose JPEGs')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)

    if not args.batch.exists():
        print(f'No such batch: {args.batch}', file=sys.stderr)
        return 1
    if not args.model.exists():
        print(f'No such model: {args.model}\nExport it with training/export_onnx.py.', file=sys.stderr)
        return 1

    out_dir = args.out or args.batch.parent
    batch_name = out_dir.name

    with zipfile.ZipFile(args.batch) as batch_zip:
        manifest = json.loads(batch_zip.read('manifest.json'))
        frames = [dict(id=f['id'], phase=f.get('phase', 'unknown')) for f in manifest['frames']]

        exports = find_annotation_exports([p if p.is_absolute() else ROOT / p for p in args.annotated])
        swing_views, view_sources = build_swing_views(exports)
        if args.view_gate != 'off' and not swing_views:
            print('No annotated exports found — the view gate has nothing to stand on and every\n'
                  'frame would be skipped. Point --annotated at a CVAT COCO export, or run with\n'
                  '--view-gate off if you have decided to pre-label blind.', file=sys.stderr)
            return 1
        print(f'Views from {len(exports)} export(s): {len(swing_views)} swing(s) with a view')

        session = ort.InferenceSession(str(args.model), providers=['CPUExecutionProvider'])
        imgsz = session.get_inputs()[0].shape[2]

        swings_by_view: Counter = Counter()
        frames_by_view: Counter = Counter()
        seen_swings: dict[str, str] = {}

        for n, frame in enumerate(frames, 1):
            swing = swing_of(frame['id'])
            bucket = view_bucket(swing_views.get(swing))
            frame['view_bucket'] = bucket
            frames_by_view[bucket] += 1
            if swing not in seen_swings:
                seen_swings[swing] = bucket
                swings_by_view[bucket] += 1

            if bucket not in GATE_BUCKETS[args.view_gate]:
                frame['reason'] = 'view-unknown' if bucket == 'unknown' else 'view-blocked'
                continue

            image = cv2.imdecode(
                np.frombuffer(batch_zip.read(f'frames/{frame["id"]}.jpg'), np.uint8), cv2.IMREAD_COLOR
            )
            frame['height'], frame['width'] = image.shape[0], image.shape[1]
            tensor, scale, pad_x, pad_y = preprocess(image, imgsz)
            raw = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]
            best = select_best(raw, args.conf)
            if best is None:
                frame['reason'] = 'no-detection'
                continue
            if best['butt_score'] < args.keypoint or best['hosel_score'] < args.keypoint:
                frame['reason'] = 'keypoint-below-threshold'
                continue
            butt = model_to_image(scale, pad_x, pad_y, *best['butt'])
            hosel = model_to_image(scale, pad_x, pad_y, *best['hosel'])
            if math.dist(butt, hosel) < MIN_SHAFT_FRACTION * frame['height']:
                frame['reason'] = 'degenerate-shaft'
                continue
            frame['prelabel'] = dict(butt=butt, hosel=hosel, conf=best['conf'])
            if n % 25 == 0 or n == len(frames):
                print(f'  {n}/{len(frames)} frames')

    # Sizes for the frames the gate never opened — the XML carries width/height per image.
    # Read from the JPEG header rather than decoding: the view gate exists precisely so
    # that most of the batch never goes through the model, and paying a full decode for
    # each of those just to fill in two integers would give that saving straight back.
    with zipfile.ZipFile(args.batch) as batch_zip:
        for frame in frames:
            if frame.get('width'):
                continue
            with Image.open(io.BytesIO(batch_zip.read(f'frames/{frame["id"]}.jpg'))) as image:
                frame['width'], frame['height'] = image.size

    pre = sum(1 for f in frames if f.get('prelabel'))
    print(f'\nPre-labelled {pre}/{len(frames)} frames.')
    for reason in SKIP_REASONS:
        n = sum(1 for f in frames if f.get('reason') == reason)
        if n:
            print(f'  skipped {n:4d}  {reason}')

    ctx = dict(batch_name=batch_name, model=rel_to_root(args.model),
               imgsz=imgsz, conf=args.conf, keypoint=args.keypoint, view_gate=args.view_gate,
               view_sources=view_sources, swings_by_view=swings_by_view, frames_by_view=frames_by_view)

    if args.dry_run:
        print('\n--dry-run: nothing written.')
        return 0

    xml_path = assert_inside_data_shaft(out_dir / 'prelabel.xml')
    report_path = assert_inside_data_shaft(out_dir / 'prelabel-report.md')
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    xml_path.write_text(prelabel_xml(frames, args.name_prefix), encoding='utf-8')
    report_path.write_text(report_markdown(frames, ctx), encoding='utf-8')
    print('\nWrote:')
    for path in (xml_path, report_path):
        print(f'  {path.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
