"""Unit tests for training/trace_swing.py.

    py -3.11 -m unittest discover -s training -t training

Everything here is the pure half of the script -- the wrap arithmetic, the per-pair
thresholds, the coverage counting and the CSV shape. No model is loaded and no video is
decoded, so the suite runs without weights and without a GPU.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import trace_swing as T  # noqa: E402
from evaluate import angle_difference  # noqa: E402
from shaft_coco import KEYPOINT_NAMES  # noqa: E402


def points(butt=0.9, hosel=0.9, toe=0.2, heel=0.2, coords=None):
    """Four keypoints with the given confidences; coordinates default to a plain cross."""
    default = {"butt": (0.0, 0.0), "hosel": (10.0, 0.0), "toe": (10.0, 10.0),
               "heel": (10.0, 0.0)}
    coords = coords or default
    confidences = {"butt": butt, "hosel": hosel, "toe": toe, "heel": heel}
    return [(coords[name][0], coords[name][1], confidences[name]) for name in KEYPOINT_NAMES]


def traced(index, t, pts, gates, box_conf=0.8):
    return T.Traced(
        index=index, t_sec=t, points=pts, box_conf=box_conf,
        angles=T.frame_angles(pts, gates),
    )


GATES = T.thresholds(0.5, 0.1)


class SignedAngleDelta(unittest.TestCase):
    def test_is_the_signed_twin_of_angle_difference(self):
        """The plotted series and the reported rates must describe the same motion."""
        for a in range(-180, 181, 7):
            for b in range(-180, 181, 11):
                self.assertAlmostEqual(
                    abs(T.signed_angle_delta(float(a), float(b))),
                    angle_difference(float(a), float(b)),
                    places=9,
                    msg="a={} b={}".format(a, b),
                )

    def test_takes_the_short_way_round_the_seam(self):
        self.assertAlmostEqual(T.signed_angle_delta(179.0, -179.0), 2.0)
        self.assertAlmostEqual(T.signed_angle_delta(-179.0, 179.0), -2.0)

    def test_half_a_turn_resolves_to_minus_180(self):
        self.assertAlmostEqual(T.signed_angle_delta(0.0, 180.0), -180.0)


class Unwrap(unittest.TestCase):
    def test_a_steady_rotation_through_the_seam_is_a_straight_ramp(self):
        raw = [170.0, 175.0, 180.0, -175.0, -170.0]  # +5 deg per step, across the seam
        lifted = T.unwrap(raw)
        steps = [b - a for a, b in zip(lifted, lifted[1:])]
        for step in steps:
            self.assertAlmostEqual(step, 5.0)

    def test_leaves_an_unwrapped_series_alone(self):
        self.assertEqual(T.unwrap([0.0, 10.0, 20.0]), [0.0, 10.0, 20.0])

    def test_holes_stay_holes_and_are_not_interpolated(self):
        self.assertEqual(T.unwrap([10.0, None, None, 20.0]), [10.0, None, None, 20.0])

    def test_the_offset_carries_across_a_hole(self):
        """Documented behaviour, not an accident -- see the module docstring."""
        lifted = T.unwrap([175.0, None, -175.0])
        self.assertAlmostEqual(lifted[2], 185.0)

    def test_a_180_degree_swap_survives_as_a_cliff(self):
        lifted = T.unwrap([0.0, 180.0, 0.0])
        self.assertAlmostEqual(abs(lifted[1] - lifted[0]), 180.0)

    def test_empty_and_all_missing(self):
        self.assertEqual(T.unwrap([]), [])
        self.assertEqual(T.unwrap([None, None]), [None, None])


class Thresholds(unittest.TestCase):
    def test_shaft_points_and_sole_points_get_their_own_bar(self):
        gates = T.thresholds(0.5, 0.1)
        self.assertEqual(gates["butt"], 0.5)
        self.assertEqual(gates["hosel"], 0.5)
        self.assertEqual(gates["toe"], 0.1)
        self.assertEqual(gates["heel"], 0.1)


class FrameAngles(unittest.TestCase):
    def test_each_angle_is_admitted_on_its_own_two_points(self):
        """A clubhead below the shaft bar must not cost the shaft its reading."""
        angles = T.frame_angles(points(butt=0.9, hosel=0.9, toe=0.2, heel=0.2), GATES)
        self.assertIsNotNone(angles["shaft"])
        self.assertIsNotNone(angles["blade"])

    def test_a_sole_point_under_its_own_bar_drops_only_the_blade(self):
        angles = T.frame_angles(points(toe=0.05), GATES)
        self.assertIsNotNone(angles["shaft"])
        self.assertIsNone(angles["blade"])

    def test_a_shaft_point_under_its_own_bar_drops_only_the_shaft(self):
        angles = T.frame_angles(points(hosel=0.4), GATES)
        self.assertIsNone(angles["shaft"])
        self.assertIsNotNone(angles["blade"])

    def test_no_detection_gives_neither_angle(self):
        angles = T.frame_angles(None, GATES)
        self.assertIsNone(angles["shaft"])
        self.assertIsNone(angles["blade"])

    def test_one_shared_high_bar_is_what_empties_the_blade(self):
        """The finding the two thresholds exist for, pinned as a test."""
        strict = T.thresholds(0.5, 0.5)
        angles = T.frame_angles(points(toe=0.2, heel=0.2), strict)
        self.assertIsNotNone(angles["shaft"])
        self.assertIsNone(angles["blade"])


class Coverage(unittest.TestCase):
    def setUp(self):
        self.frames = [
            traced(0, 0.0, points(), GATES),
            traced(1, 0.1, points(toe=0.05), GATES),
            traced(2, 0.2, None, GATES, box_conf=0.0),
        ]

    def test_counts_frames_detections_points_and_angles(self):
        stats = T.coverage(self.frames, GATES)
        self.assertEqual(stats["frames"], 3)
        self.assertEqual(stats["detected"], 2)
        self.assertEqual(stats["points"]["butt"], 2)
        self.assertEqual(stats["points"]["toe"], 1)
        self.assertEqual(stats["all_four"], 1)
        self.assertEqual(stats["angles"]["shaft"], 2)
        self.assertEqual(stats["angles"]["blade"], 1)


class StepRates(unittest.TestCase):
    def series(self, values, dt=0.1):
        """Frames whose shaft angle takes the given values, `dt` apart."""
        out = []
        for i, value in enumerate(values):
            pts = None if value is None else points()
            item = T.Traced(index=i, t_sec=i * dt, points=pts, box_conf=0.8,
                            angles={"shaft": value, "blade": None})
            out.append(item)
        return out

    def test_rate_is_per_second_not_per_frame(self):
        row = T.step_rates(self.series([0.0, 3.0, 6.0], dt=0.1), "shaft", 1.0)
        self.assertEqual(row["steps"], 2)
        self.assertAlmostEqual(row["median"], 30.0)
        self.assertAlmostEqual(row["median_step_deg"], 3.0)

    def test_a_hole_widens_the_step_rather_than_breaking_the_series(self):
        row = T.step_rates(self.series([0.0, None, 6.0], dt=0.1), "shaft", 1.0)
        self.assertEqual(row["steps"], 1)
        self.assertAlmostEqual(row["median"], 30.0)  # 6 deg over 0.2 s

    def test_a_hole_wider_than_max_gap_is_dropped(self):
        row = T.step_rates(self.series([0.0, None, 6.0], dt=0.1), "shaft", 0.15)
        self.assertEqual(row["steps"], 0)
        self.assertEqual(row["dropped_gap"], 1)
        self.assertIsNone(row["median"])

    def test_zero_max_gap_keeps_every_step(self):
        row = T.step_rates(self.series([0.0, None, 6.0], dt=0.1), "shaft", 0.0)
        self.assertEqual(row["steps"], 1)

    def test_non_positive_dt_is_dropped_separately(self):
        frames = self.series([0.0, 3.0])
        frames[1].t_sec = frames[0].t_sec
        row = T.step_rates(frames, "shaft", 1.0)
        self.assertEqual(row["steps"], 0)
        self.assertEqual(row["dropped_dt"], 1)

    def test_the_rate_is_wrap_correct(self):
        """179 -> -179 is 2 degrees, not 358."""
        row = T.step_rates(self.series([179.0, -179.0], dt=0.1), "shaft", 1.0)
        self.assertAlmostEqual(row["median_step_deg"], 2.0)

    def test_a_swap_sized_jump_is_counted(self):
        row = T.step_rates(self.series([0.0, 175.0], dt=0.1), "shaft", 1.0)
        self.assertEqual(row["flips"], 1)


class RunsOfMissing(unittest.TestCase):
    def frames(self, flags):
        return [traced(i, i * 0.1, None if flag else points(), GATES)
                for i, flag in enumerate(flags)]

    def test_contiguous_spans(self):
        spans = T.runs_of_missing(self.frames([0, 1, 1, 0, 1, 0]),
                                  lambda item: not item.detected)
        self.assertEqual(len(spans), 2)
        self.assertAlmostEqual(spans[0][0], 0.1)
        self.assertAlmostEqual(spans[0][1], 0.2)
        self.assertAlmostEqual(spans[1][0], 0.4)

    def test_a_run_reaching_the_end_is_closed(self):
        spans = T.runs_of_missing(self.frames([0, 1, 1]), lambda item: not item.detected)
        self.assertEqual(len(spans), 1)
        self.assertAlmostEqual(spans[0][1], 0.2)

    def test_nothing_missing(self):
        self.assertEqual(
            T.runs_of_missing(self.frames([0, 0]), lambda item: not item.detected), [])


class ResolveTimes(unittest.TestCase):
    def test_increasing_container_timestamps_are_used(self):
        times, source = T.resolve_times([0.0, 0.033, 0.066], 30.0)
        self.assertEqual(times, [0.0, 0.033, 0.066])
        self.assertIn("container", source)

    def test_all_zero_timestamps_fall_back_to_the_frame_rate(self):
        times, source = T.resolve_times([0.0, 0.0, 0.0], 30.0)
        self.assertAlmostEqual(times[1], 1 / 30.0)
        self.assertIn("index / fps", source)

    def test_a_falling_timestamp_falls_back_too(self):
        _times, source = T.resolve_times([0.0, 0.2, 0.1], 25.0)
        self.assertIn("index / fps", source)

    def test_no_timestamps_and_no_frame_rate_is_fatal(self):
        with self.assertRaises(SystemExit):
            T.resolve_times([0.0, 0.0], 0.0)


class CsvRows(unittest.TestCase):
    def setUp(self):
        self.frames = [
            traced(0, 0.0, points(), GATES),
            traced(1, 0.1, None, GATES, box_conf=0.0),
        ]
        self.unwrapped = {
            label: T.unwrap([item.angles.get(label) for item in self.frames])
            for label in ("shaft", "blade")
        }
        self.rows = list(T.csv_rows(self.frames, self.unwrapped))

    def test_one_row_per_decoded_frame_plus_a_header(self):
        self.assertEqual(len(self.rows), 3)

    def test_header_names_every_point_and_both_angles(self):
        header = self.rows[0]
        for name in KEYPOINT_NAMES:
            self.assertIn(name + "_conf", header)
        self.assertIn("shaft_angle_deg", header)
        self.assertIn("blade_angle_unwrapped_deg", header)

    def test_a_missing_frame_is_blank_fields_not_zeros(self):
        header = self.rows[0]
        row = self.rows[2]
        self.assertEqual(row[header.index("detected")], 0)
        for column in ("box_conf", "butt_x", "toe_conf", "shaft_angle_deg"):
            self.assertEqual(row[header.index(column)], "")


if __name__ == "__main__":
    unittest.main()
