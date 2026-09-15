#!/usr/bin/env python3
"""Tests for training/measure_blade_stability.py.

    py -3.11 -m unittest discover -s training -t training

`unittest` and the stdlib only, same reason as test_shaft_schema.py and
test_prelabel_batch.py: training/requirements.txt pins a training toolchain, and a test
framework is not one.

WHAT IS WORTH TESTING HERE. The script's output is a handful of medians, and a median is
the perfect place to hide a mistake: it comes out looking like a number either way. So
what is pinned is the arithmetic whose failure would be invisible in the report.

  PER SECOND, NOT PER FRAME. The frames are sampled roughly one per swing per batch, so
  consecutive frames are anywhere from 0.1 s to several seconds apart. A rate that
  forgot to divide by dt would still produce a plausible table -- and would rank the
  swings by how sparsely they happened to be sampled.

  THE WRAP. 179 degrees to -179 degrees is a 2-degree move, not 358. Getting this wrong
  turns the quietest pair in the set into the loudest, and does it only near the wrap,
  which is exactly where nobody looks.

  THE 90-DEGREE TEST. It is the whole toe/heel-swap detector. Boundary included:
  strictly greater, so an honest 90-degree rotation is not counted as a swap.

  THE GROUPING. Frames of one swing arrive from three different archives in no
  particular order. If the grouping keyed on the frame id, or forgot to sort on tSec,
  every pair afterwards would be between unrelated frames -- and the report would look
  entirely normal.
"""
from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import measure_blade_stability as M
import shaft_coco as S


def frame(frame_id="c_s00_f00", clip="001.mp4", swing=0, t=0.0, view="dtl", blur="none"):
    return M.Frame(
        frame_id=frame_id,
        clip_name=clip,
        swing_index=swing,
        t_sec=t,
        archive=Path("batch.zip"),
        entry="frames/{}.jpg".format(frame_id),
        view=view,
        blur=blur,
    )


def sample(t, shaft, blade, **kwargs):
    """A frame that cleared the four-point gate, with both angles set by hand."""
    return M.Sample(frame=frame(t=t, **kwargs), angles={"shaft": shaft, "blade": blade})


def points(butt=1.0, hosel=1.0, toe=1.0, heel=1.0):
    """Predicted keypoints as `predict_frame` returns them: `(x, y, conf)` per point.

    Coordinates are placeholders; the confidences are what these tests are about.
    """
    confidences = {"butt": butt, "hosel": hosel, "toe": toe, "heel": heel}
    return [(10.0 * i, 20.0 * i, confidences[name])
            for i, name in enumerate(S.KEYPOINT_NAMES, 1)]


def batch_zip(path: Path, records, with_images=True) -> Path:
    """A minimal batch archive: `frames/<id>.jpg` plus `manifest.json`."""
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("manifest.json", json.dumps({"frames": records}))
        if with_images:
            for record in records:
                z.writestr("frames/{}.jpg".format(record["id"]), b"not-a-real-jpeg")
    return path


def record(frame_id, clip, swing, t):
    return {"id": frame_id, "clipName": clip, "swingIndex": swing, "tSec": t}


def coco_zip(path: Path, frames) -> Path:
    """A CVAT COCO export carrying only what this script reads: view, blur, no_shaft."""
    images, annotations = [], []
    for index, (frame_id, attrs) in enumerate(frames.items(), 1):
        images.append({"id": index, "file_name": "frames/{}.jpg".format(frame_id),
                       "width": 1080, "height": 1920})
        annotations.append({"id": index, "image_id": index, "category_id": 1,
                            "keypoints": [1, 1, 2] * 4, "num_keypoints": 4,
                            "attributes": attrs})
    doc = {"categories": [{"id": 1, "name": "shaft",
                           "keypoints": list(S.KEYPOINT_NAMES)}],
           "images": images, "annotations": annotations}
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("annotations/person_keypoints_default.json", json.dumps(doc))
    return path


class TestAngleGate(unittest.TestCase):
    """Which frames are allowed to carry an angle at all."""

    def test_all_four_points_required(self):
        self.assertTrue(M.frame_complete(points(), 0.5))

    def test_a_missing_sole_point_fails_the_gate(self):
        self.assertFalse(M.frame_complete(points(toe=0.4), 0.5))
        self.assertFalse(M.frame_complete(points(heel=0.0), 0.5))

    def test_threshold_is_inclusive(self):
        # `evaluate.py` counts a point as predicted at or above --kpt-conf; the two
        # scripts must not disagree about the same number.
        self.assertTrue(M.point_present(points(toe=0.5), "toe", 0.5))
        self.assertFalse(M.point_present(points(toe=0.499), "toe", 0.5))

    def test_two_point_model_never_clears_the_gate(self):
        # predict_frame pads a 2-point checkpoint's toe/heel with confidence 0. That
        # must read as "no blade angle", never as a point at the origin.
        two_point = points(toe=0.0, heel=0.0)
        self.assertFalse(M.frame_complete(two_point, 0.5))
        self.assertTrue(M.points_present(two_point, S.SHAFT_POINTS, 0.5))

    def test_no_detection_is_not_complete(self):
        self.assertFalse(M.frame_complete(None, 0.5))
        self.assertFalse(M.point_present(None, "butt", 0.5))

    def test_angle_is_read_off_the_named_points_not_positions(self):
        # butt (10, 20) -> hosel (20, 40): straight down-right at atan2(20, 10).
        placed = [(10.0, 20.0, 1.0), (20.0, 40.0, 1.0), (0.0, 0.0, 1.0), (10.0, 0.0, 1.0)]
        self.assertAlmostEqual(M.predicted_angle(placed, "butt", "hosel"), 63.434, places=2)
        # heel (10, 0) -> toe (0, 0): straight left, 180 degrees.
        self.assertAlmostEqual(abs(M.predicted_angle(placed, "heel", "toe")), 180.0, places=6)

    def test_angles_constant_matches_evaluate(self):
        # One definition of "the blade angle", and it lives in evaluate.py.
        self.assertEqual(M.ANGLES[0], ("shaft", "butt", "hosel"))
        self.assertEqual(M.ANGLES[1], ("blade", "heel", "toe"))


class TestConsecutivePairs(unittest.TestCase):
    """Rates between consecutive samples: the arithmetic the whole report rests on."""

    def test_rate_is_per_second_not_per_frame(self):
        samples = [sample(0.0, 0.0, 0.0), sample(0.5, 10.0, 20.0)]
        pairs, _gap, _dt = M.consecutive_pairs(samples, 1.0)
        self.assertEqual(len(pairs), 1)
        self.assertAlmostEqual(pairs[0].delta["shaft"], 10.0)
        self.assertAlmostEqual(pairs[0].rate["shaft"], 20.0)   # 10 deg over 0.5 s
        self.assertAlmostEqual(pairs[0].rate["blade"], 40.0)

    def test_equal_change_over_unequal_time_gives_unequal_rates(self):
        # The reason the unit is per second: two pairs that moved the same number of
        # degrees are NOT equally unstable if one took four times as long.
        quick, _g, _d = M.consecutive_pairs([sample(0.0, 0, 0), sample(0.1, 0, 12)], 1.0)
        slow, _g, _d = M.consecutive_pairs([sample(0.0, 0, 0), sample(0.4, 0, 12)], 1.0)
        self.assertAlmostEqual(quick[0].rate["blade"], 120.0)
        self.assertAlmostEqual(slow[0].rate["blade"], 30.0)

    def test_change_wraps_at_180(self):
        # 179 -> -179 is a 2 degree move, not 358.
        pairs, _g, _d = M.consecutive_pairs(
            [sample(0.0, 179.0, 179.0), sample(1.0, -179.0, -179.0)], 2.0)
        self.assertAlmostEqual(pairs[0].delta["blade"], 2.0)
        self.assertFalse(pairs[0].flipped("blade"))

    def test_series_is_chained_not_all_pairs(self):
        samples = [sample(0.0, 0, 0), sample(0.2, 0, 0), sample(0.4, 0, 0)]
        pairs, _g, _d = M.consecutive_pairs(samples, 1.0)
        self.assertEqual(len(pairs), 2)
        self.assertAlmostEqual(pairs[0].dt, 0.2)
        self.assertAlmostEqual(pairs[1].dt, 0.2)

    def test_gap_beyond_max_is_dropped_and_counted(self):
        samples = [sample(0.0, 0, 0), sample(3.0, 0, 90.0), sample(3.2, 0, 90.0)]
        pairs, dropped_gap, dropped_dt = M.consecutive_pairs(samples, 1.0)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(dropped_gap, 1)
        self.assertEqual(dropped_dt, 0)

    def test_zero_max_gap_keeps_everything(self):
        samples = [sample(0.0, 0, 0), sample(9.0, 0, 0)]
        pairs, dropped_gap, _dt = M.consecutive_pairs(samples, 0)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(dropped_gap, 0)

    def test_non_positive_dt_is_dropped_never_divided_by(self):
        # Two frames stamped at the same time cannot carry a rate; dividing would
        # produce an infinity that then poisons every median downstream.
        samples = [sample(1.0, 0, 0), sample(1.0, 0, 30.0)]
        pairs, dropped_gap, dropped_dt = M.consecutive_pairs(samples, 1.0)
        self.assertEqual(pairs, [])
        self.assertEqual((dropped_gap, dropped_dt), (0, 1))

    def test_single_sample_yields_no_pairs(self):
        self.assertEqual(M.consecutive_pairs([sample(0.0, 0, 0)], 1.0)[0], [])
        self.assertEqual(M.consecutive_pairs([], 1.0)[0], [])


class TestFlipDetection(unittest.TestCase):
    """The toe/heel-swap detector."""

    def test_a_swap_reads_as_a_flip(self):
        pairs, _g, _d = M.consecutive_pairs(
            [sample(0.0, 10.0, 10.0), sample(0.2, 12.0, -170.0)], 1.0)
        self.assertTrue(pairs[0].flipped("blade"))
        self.assertFalse(pairs[0].flipped("shaft"))
        self.assertAlmostEqual(pairs[0].delta["blade"], 180.0)

    def test_boundary_is_strictly_greater(self):
        # An honest 90 degree rotation is a rotation, not a swap.
        exact, _g, _d = M.consecutive_pairs([sample(0.0, 0, 0.0), sample(0.2, 0, 90.0)], 1.0)
        past, _g, _d = M.consecutive_pairs([sample(0.0, 0, 0.0), sample(0.2, 0, 90.1)], 1.0)
        self.assertFalse(exact[0].flipped("blade"))
        self.assertTrue(past[0].flipped("blade"))

    def test_flip_is_independent_of_the_time_step(self):
        # The flip test is on the raw change, not the rate: a 180 degree move is a swap
        # whether it took 0.1 s or 0.9 s.
        for dt in (0.1, 0.9):
            pairs, _g, _d = M.consecutive_pairs(
                [sample(0.0, 0, 0.0), sample(dt, 0, 180.0)], 1.0)
            self.assertTrue(pairs[0].flipped("blade"))


class TestSummarise(unittest.TestCase):

    def test_medians_p90_and_flip_shares(self):
        samples = [sample(0.0, 0.0, 0.0), sample(1.0, 10.0, 100.0),
                   sample(2.0, 20.0, 110.0), sample(3.0, 30.0, 300.0)]
        pairs, _g, _d = M.consecutive_pairs(samples, 2.0)
        summary = M.summarise(pairs)
        self.assertEqual(summary["pairs"], 3)
        self.assertAlmostEqual(summary["shaft_median"], 10.0)
        self.assertAlmostEqual(summary["blade_median"], 100.0)
        self.assertEqual(summary["blade_flips"], 2)   # 0->100 and 110->300 (=170)
        self.assertEqual(summary["shaft_flips"], 0)
        self.assertAlmostEqual(summary["blade_flip_share"], 2.0 / 3.0)
        self.assertAlmostEqual(summary["median_ratio"], 10.0)

    def test_empty_summary_is_none_not_zero(self):
        # A bucket with no pairs has no median. Zero would read as "perfectly stable".
        summary = M.summarise([])
        self.assertEqual(summary["pairs"], 0)
        self.assertIsNone(summary["blade_median"])
        self.assertIsNone(summary["blade_flip_share"])
        self.assertIsNone(summary["median_ratio"])

    def test_ratio_is_none_when_the_yardstick_is_zero(self):
        # A perfectly still shaft cannot be divided by; the blade number is then
        # unreadable, and "--" says so where a ZeroDivisionError would crash the run.
        pairs, _g, _d = M.consecutive_pairs([sample(0.0, 5.0, 5.0), sample(1.0, 5.0, 40.0)], 2.0)
        summary = M.summarise(pairs)
        self.assertAlmostEqual(summary["shaft_median"], 0.0)
        self.assertIsNone(summary["median_ratio"])


class TestSwingRanking(unittest.TestCase):

    def test_ranked_by_median_worst_first(self):
        def swing_pairs(rates):
            samples = [sample(0.0, 0.0, 0.0)]
            angle = 0.0
            for index, rate in enumerate(rates, 1):
                angle += rate * 0.1
                samples.append(sample(0.1 * index, 0.0, angle))
            return M.consecutive_pairs(samples, 1.0)[0]

        per_swing = {
            ("a.mp4", 0): swing_pairs([10.0, 10.0]),
            ("b.mp4", 1): swing_pairs([500.0, 400.0]),
            ("c.mp4", 0): swing_pairs([100.0, 90.0]),
            ("d.mp4", 0): [],
        }
        ranked = M.rank_swings(per_swing, limit=10)
        self.assertEqual([key for key, _stats in ranked],
                         [("b.mp4", 1), ("c.mp4", 0), ("a.mp4", 0)])
        self.assertEqual(ranked[0][1]["pairs"], 2)

    def test_limit_is_respected(self):
        per_swing = {
            ("{}.mp4".format(i), 0): M.consecutive_pairs(
                [sample(0.0, 0, 0.0), sample(0.1, 0, float(i))], 1.0)[0]
            for i in range(1, 21)
        }
        self.assertEqual(len(M.rank_swings(per_swing, limit=10)), 10)

    def test_swings_without_pairs_are_absent_not_zero(self):
        # A swing that contributed nothing must not rank as the most stable one --
        # it was never measured.
        self.assertEqual(M.rank_swings({("a.mp4", 0): []}), [])


class TestBucketing(unittest.TestCase):

    def test_pair_takes_the_value_both_frames_agree_on(self):
        pairs, _g, _d = M.consecutive_pairs(
            [sample(0.0, 0, 0, view="face_on"), sample(0.2, 0, 0, view="face_on")], 1.0)
        self.assertEqual(pairs[0].bucket("view"), "face_on")

    def test_a_straddling_pair_belongs_to_neither_bucket(self):
        pairs, _g, _d = M.consecutive_pairs(
            [sample(0.0, 0, 0, blur="none"), sample(0.2, 0, 0, blur="severe")], 1.0)
        self.assertEqual(pairs[0].bucket("blur"), "(blandad)")

    def test_unannotated_frames_bucket_as_unset(self):
        pairs, _g, _d = M.consecutive_pairs(
            [sample(0.0, 0, 0, view=""), sample(0.2, 0, 0, view="")], 1.0)
        self.assertEqual(pairs[0].bucket("view"), "(osatt)")


class TestGrouping(unittest.TestCase):
    """Putting one swing's frames back together out of three archives."""

    def test_grouped_by_clip_and_swing_index_and_sorted_by_time(self):
        frames = [
            frame("x_s01_f09", clip="001.mp4", swing=1, t=9.0),
            frame("y_s00_f01", clip="001.mp4", swing=0, t=1.0),
            frame("z_s00_f00", clip="001.mp4", swing=0, t=0.5),
            frame("w_s00_f00", clip="002.mp4", swing=0, t=0.1),
        ]
        swings = M.group_swings(frames)
        self.assertEqual([s.key for s in swings],
                         [("001.mp4", 0), ("001.mp4", 1), ("002.mp4", 0)])
        self.assertEqual([f.t_sec for f in swings[0].frames], [0.5, 1.0])

    def test_same_clip_different_swing_index_are_different_swings(self):
        frames = [frame("a", clip="001.mp4", swing=0, t=1.0),
                  frame("b", clip="001.mp4", swing=1, t=2.0)]
        self.assertEqual(len(M.group_swings(frames)), 2)

    def test_frame_id_hash_does_not_split_a_swing(self):
        # The ids of one swing's frames differ in their hash prefix across batches;
        # grouping on the id would leave every swing a singleton and the report empty.
        frames = [frame("001-aaaa_s00_f02", clip="001.mp4", swing=0, t=1.0),
                  frame("001-bbbb_s00_f07", clip="001.mp4", swing=0, t=2.0)]
        swings = M.group_swings(frames)
        self.assertEqual(len(swings), 1)
        self.assertEqual(len(swings[0].frames), 2)


class TestCollectFrames(unittest.TestCase):
    """Reading the manifests out of real ZIPs."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_frames_merge_across_batches_into_one_swing(self):
        a = batch_zip(self.tmp / "a.zip", [record("f1", "001.mp4", 0, 1.0)])
        b = batch_zip(self.tmp / "b.zip", [record("f2", "001.mp4", 0, 1.3)])
        frames, _notes = M.collect_frames([a, b])
        swings = M.group_swings(frames)
        self.assertEqual(len(swings), 1)
        self.assertEqual([f.frame_id for f in swings[0].frames], ["f1", "f2"])
        self.assertEqual([f.archive.name for f in swings[0].frames], ["a.zip", "b.zip"])

    def test_a_repeated_id_is_counted_once_and_reported(self):
        a = batch_zip(self.tmp / "a.zip", [record("f1", "001.mp4", 0, 1.0)])
        b = batch_zip(self.tmp / "b.zip", [record("f1", "001.mp4", 0, 1.0)])
        frames, notes = M.collect_frames([a, b])
        self.assertEqual(len(frames), 1)
        self.assertTrue(any("mer än en batch" in note for note in notes))

    def test_no_shaft_frames_are_excluded_and_reported(self):
        a = batch_zip(self.tmp / "a.zip",
                      [record("f1", "001.mp4", 0, 1.0), record("f2", "001.mp4", 0, 1.2)])
        frames, notes = M.collect_frames([a], no_shaft={"f2"})
        self.assertEqual([f.frame_id for f in frames], ["f1"])
        self.assertTrue(any("no_shaft" in note for note in notes))

    def test_manifest_entry_without_an_image_is_skipped(self):
        a = batch_zip(self.tmp / "a.zip", [record("f1", "001.mp4", 0, 1.0)],
                      with_images=False)
        frames, notes = M.collect_frames([a])
        self.assertEqual(frames, [])
        self.assertTrue(any("saknar JPEG" in note for note in notes))

    def test_missing_manifest_field_raises_rather_than_guesses(self):
        broken = {"id": "f1", "clipName": "001.mp4", "swingIndex": 0}  # no tSec
        a = batch_zip(self.tmp / "a.zip", [broken])
        with self.assertRaises(S.ShaftDataError):
            M.collect_frames([a])

    def test_view_and_blur_ride_along_from_the_annotation_export(self):
        a = batch_zip(self.tmp / "a.zip", [record("f1", "001.mp4", 0, 1.0)])
        meta = {"f1": ("face_on", "severe")}
        frames, _notes = M.collect_frames([a], meta=meta)
        self.assertEqual((frames[0].view, frames[0].blur), ("face_on", "severe"))


class TestAnnotationSidecar(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_newest_annotated_version_wins(self):
        for name in ("annotated-v1.zip", "annotated-v2.zip", "annotated-v10.zip"):
            (self.tmp / name).write_bytes(b"")
        found = M.discover_annotations(self.tmp / "batch.zip")
        self.assertEqual(found.name, "annotated-v10.zip")

    def test_no_sidecar_is_none_not_an_error(self):
        self.assertIsNone(M.discover_annotations(self.tmp / "batch.zip"))

    def test_view_blur_and_no_shaft_are_read(self):
        path = coco_zip(self.tmp / "annotated-v1.zip", {
            "f1": {"view": "dtl", "blur": "none", "no_shaft": False},
            "f2": {"view": "face_on", "blur": "severe", "no_shaft": True},
        })
        meta, no_shaft = M.read_frame_meta([path])
        self.assertEqual(meta["f1"], ("dtl", "none"))
        self.assertEqual(meta["f2"], ("face_on", "severe"))
        self.assertEqual(no_shaft, {"f2"})


if __name__ == "__main__":
    unittest.main()
