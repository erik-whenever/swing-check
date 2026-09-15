"""Unit tests for training/trace_swing.py.

    py -3.11 -m unittest discover -s training -t training

Everything here is the pure half of the script -- the wrap arithmetic, the per-pair
thresholds, the coverage counting, the CSV shape, and for the cross-clip report the
bucketing and the aggregation that the recommendation is computed from. No model is
loaded and no video is decoded, so the suite runs without weights and without a GPU.
"""

from __future__ import annotations

import sys
import tempfile
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



# -----------------------------------------------------------------------------
# The cross-clip report: buckets and aggregation
# -----------------------------------------------------------------------------


def measured(t, shaft, blade, conf=0.5, phase="top", blur="none"):
    """One frame carrying the given angles, with toe and heel at `conf`."""
    return T.Traced(
        index=int(t * 100),
        t_sec=t,
        points=points(toe=conf, heel=conf),
        box_conf=0.8,
        angles={"shaft": shaft, "blade": blade},
        phase=phase,
        blur=blur,
    )


def one_step(blade_delta, shaft_delta, dt=0.1, conf=(0.5, 0.5), phase=("top", "top"),
             blur=("none", "none")):
    """A single paired step with the given change in each angle."""
    frames = [
        measured(0.0, 0.0, 0.0, conf=conf[0], phase=phase[0], blur=blur[0]),
        measured(dt, shaft_delta, blade_delta, conf=conf[1], phase=phase[1],
                 blur=blur[1]),
    ]
    steps, _gap, _dt = T.paired_steps(frames, "clip.mp4", 1.0)
    return steps[0]


class ConfBuckets(unittest.TestCase):
    def test_a_confidence_lands_in_exactly_one_bucket(self):
        self.assertAlmostEqual(T.conf_bucket(0.1), 0.1)
        self.assertAlmostEqual(T.conf_bucket(0.15), 0.1)
        self.assertAlmostEqual(T.conf_bucket(0.2), 0.2)   # the edge belongs upwards
        self.assertAlmostEqual(T.conf_bucket(0.89), 0.8)
        self.assertAlmostEqual(T.conf_bucket(0.9), 0.9)

    def test_one_is_the_top_bucket_and_not_a_bucket_of_its_own(self):
        self.assertAlmostEqual(T.conf_bucket(1.0), 0.9)
        self.assertAlmostEqual(T.conf_bucket(1.2), 0.9)

    def test_below_the_first_edge_is_not_a_bucket(self):
        self.assertIsNone(T.conf_bucket(0.0999))
        self.assertIsNone(T.conf_bucket(0.0))

    def test_no_value_is_not_a_bucket(self):
        self.assertIsNone(T.conf_bucket(None))

    def test_every_tenth_is_covered_and_none_twice(self):
        """Nine edges, nine buckets, and nothing in [0.1, 1.0] falls outside them."""
        self.assertEqual(len(T.CONF_EDGES), 9)
        seen = {T.conf_bucket(0.1 + 0.001 * i) for i in range(901)}
        self.assertEqual(seen, set(T.CONF_EDGES))

    def test_the_label_names_the_span(self):
        self.assertEqual(T.conf_bucket_label(0.4), "0.4-0.5")
        self.assertIn("<", T.conf_bucket_label(None))


class StepBuckets(unittest.TestCase):
    def test_the_weakest_endpoint_decides_the_confidence(self):
        """A threshold means every frame used clears it -- so the worse end governs."""
        step = one_step(1.0, 1.0, conf=(0.9, 0.3))
        self.assertAlmostEqual(step.blade_conf, 0.3)

    def test_a_step_whose_ends_agree_gets_that_bucket(self):
        self.assertEqual(one_step(1.0, 1.0, phase=("top", "top")).bucket("phase"), "top")

    def test_a_step_straddling_two_values_belongs_to_neither(self):
        step = one_step(1.0, 1.0, phase=("top", "downswing"))
        self.assertEqual(step.bucket("phase"), T.BUCKET_MIXED)

    def test_the_same_rule_holds_for_blur(self):
        self.assertEqual(
            one_step(1.0, 1.0, blur=("none", "severe")).bucket("blur"), T.BUCKET_MIXED)

    def test_a_swap_sized_change_is_flagged_per_angle(self):
        step = one_step(175.0, 1.0)
        self.assertTrue(step.flipped("blade"))
        self.assertFalse(step.flipped("shaft"))


class PairedSteps(unittest.TestCase):
    def frames(self, specs):
        return [measured(t, shaft, blade) for t, shaft, blade in specs]

    def test_rates_are_per_second_and_read_off_the_same_two_frames(self):
        steps, _gap, _dt = T.paired_steps(
            self.frames([(0.0, 0.0, 0.0), (0.1, 1.0, 3.0)]), "c.mp4", 1.0)
        self.assertEqual(len(steps), 1)
        self.assertAlmostEqual(steps[0].rate["shaft"], 10.0)
        self.assertAlmostEqual(steps[0].rate["blade"], 30.0)

    def test_a_frame_missing_one_angle_widens_the_step(self):
        """Not breaks it -- the same rule the single-angle series uses."""
        frames = self.frames([(0.0, 0.0, 0.0), (0.1, 5.0, 5.0), (0.2, 2.0, 6.0)])
        frames[1].angles["blade"] = None
        steps, _gap, _dt = T.paired_steps(frames, "c.mp4", 1.0)
        self.assertEqual(len(steps), 1)
        self.assertAlmostEqual(steps[0].dt, 0.2)
        self.assertAlmostEqual(steps[0].rate["blade"], 30.0)

    def test_a_widened_step_is_still_tested_against_the_gap(self):
        frames = self.frames([(0.0, 0.0, 0.0), (0.1, 5.0, 5.0), (0.2, 2.0, 6.0)])
        frames[1].angles["shaft"] = None
        steps, dropped_gap, _dt = T.paired_steps(frames, "c.mp4", 0.15)
        self.assertEqual(steps, [])
        self.assertEqual(dropped_gap, 1)

    def test_non_positive_dt_is_dropped_separately(self):
        frames = self.frames([(0.0, 0.0, 0.0), (0.0, 5.0, 5.0)])
        steps, dropped_gap, dropped_dt = T.paired_steps(frames, "c.mp4", 1.0)
        self.assertEqual((len(steps), dropped_gap, dropped_dt), (0, 0, 1))

    def test_the_rate_is_wrap_correct(self):
        steps, _gap, _dt = T.paired_steps(
            self.frames([(0.0, 179.0, 179.0), (0.1, -179.0, -179.0)]), "c.mp4", 1.0)
        self.assertAlmostEqual(steps[0].delta["blade"], 2.0)


class Summarise(unittest.TestCase):
    def steps(self, blade_rates, shaft_rates):
        return [one_step(blade * 0.1, shaft * 0.1)
                for blade, shaft in zip(blade_rates, shaft_rates)]

    def test_medians_p90_and_the_ratio(self):
        row = T.summarise(self.steps([10.0, 20.0, 30.0], [5.0, 10.0, 15.0]))
        self.assertEqual(row["steps"], 3)
        self.assertAlmostEqual(row["blade_median"], 20.0)
        self.assertAlmostEqual(row["shaft_median"], 10.0)
        self.assertAlmostEqual(row["ratio"], 2.0)

    def test_the_ratio_is_blade_over_shaft_on_the_same_steps(self):
        row = T.summarise(self.steps([10.0], [20.0]))
        self.assertAlmostEqual(row["ratio"], 0.5)

    def test_an_empty_set_reports_nothing_rather_than_zero(self):
        row = T.summarise([])
        self.assertEqual(row["steps"], 0)
        self.assertIsNone(row["blade_median"])
        self.assertIsNone(row["ratio"])

    def test_a_motionless_shaft_gives_no_ratio_instead_of_infinity(self):
        row = T.summarise(self.steps([10.0], [0.0]))
        self.assertAlmostEqual(row["shaft_median"], 0.0)
        self.assertIsNone(row["ratio"])

    def test_swaps_are_counted_per_angle_with_their_share(self):
        steps = [one_step(175.0, 1.0), one_step(1.0, 1.0)]
        row = T.summarise(steps)
        self.assertEqual(row["blade_flips"], 1)
        self.assertEqual(row["shaft_flips"], 0)
        self.assertAlmostEqual(row["blade_flip_share"], 0.5)


class Grouping(unittest.TestCase):
    def test_groups_keep_every_step(self):
        steps = [one_step(1.0, 1.0, phase=("top", "top")),
                 one_step(1.0, 1.0, phase=("impact", "impact"))]
        groups = T.group_steps(steps, lambda s: s.bucket("phase"))
        self.assertEqual(sorted(groups), ["impact", "top"])
        self.assertEqual(sum(len(v) for v in groups.values()), 2)

    def test_preferred_order_first_then_the_rest_sorted(self):
        groups = {"severe": [], "none": [], "(blandad)": [], "mild": []}
        self.assertEqual(
            T.ordered_buckets(groups, ("none", "mild", "severe")),
            ["none", "mild", "severe", "(blandad)"],
        )

    def test_a_bucket_the_list_did_not_anticipate_is_never_dropped(self):
        groups = {"surprise": [], "none": []}
        self.assertIn("surprise", T.ordered_buckets(groups, ("none", "mild")))

    def test_a_preferred_bucket_with_no_steps_is_not_invented(self):
        self.assertEqual(T.ordered_buckets({"none": []}, ("none", "mild")), ["none"])


class ThresholdSweep(unittest.TestCase):
    def setUp(self):
        # A quiet blade at high confidence, a wild one at low -- two steps each, so the
        # MEDIAN moves when the gate drops the wild pair. One of anything cannot.
        self.steps = [
            one_step(0.5, 0.5, conf=(0.8, 0.8)),
            one_step(0.4, 0.5, conf=(0.9, 0.9)),
            one_step(50.0, 0.5, conf=(0.2, 0.2)),
            one_step(60.0, 0.5, conf=(0.3, 0.3)),
        ]
        self.frames = [
            measured(0.0, 0.0, 0.0, conf=0.8),
            measured(0.1, 0.0, 0.0, conf=0.9),
            measured(0.2, 0.0, 0.0, conf=0.2),
            T.Traced(index=3, t_sec=0.3, points=None, box_conf=0.0,
                     angles={"shaft": None, "blade": None}),
        ]

    def row(self, rows, threshold):
        return next(r for r in rows if abs(r["threshold"] - threshold) < 1e-9)

    def test_one_row_per_edge(self):
        rows = T.threshold_rows(self.steps, self.frames)
        self.assertEqual(len(rows), len(T.CONF_EDGES))

    def test_raising_the_threshold_drops_the_steps_below_it(self):
        rows = T.threshold_rows(self.steps, self.frames)
        self.assertEqual(self.row(rows, 0.1)["steps"], 4)
        self.assertEqual(self.row(rows, 0.5)["steps"], 2)
        self.assertEqual(self.row(rows, 0.9)["steps"], 1)

    def test_the_frame_share_is_counted_over_every_decoded_frame(self):
        """Including the one with no detection -- that is what the gate costs."""
        rows = T.threshold_rows(self.steps, self.frames)
        row = self.row(rows, 0.5)
        self.assertEqual(row["frames"], 2)
        self.assertAlmostEqual(row["frame_share"], 0.5)          # 2 of 4 decoded
        self.assertAlmostEqual(row["detected_share"], 2 / 3)     # 2 of 3 detected

    def test_the_ratio_improves_once_the_wild_step_is_gated_out(self):
        rows = T.threshold_rows(self.steps, self.frames)
        self.assertGreater(self.row(rows, 0.1)["ratio"], 10.0)
        self.assertLess(self.row(rows, 0.5)["ratio"], 1.5)


class FlipFreeThreshold(unittest.TestCase):
    def rows(self, pairs):
        """`pairs` is [(threshold, flip_share, steps)]."""
        return [{"threshold": t, "blade_flip_share": f, "steps": n, "ratio": 9.0}
                for t, f, n in pairs]

    def test_picks_the_lowest_threshold_where_swaps_stop(self):
        rows = self.rows([(0.1, 0.05, 100), (0.2, 0.02, 100), (0.3, 0.004, 100)])
        self.assertAlmostEqual(T.lowest_flip_free(rows)["threshold"], 0.3)

    def test_a_thin_row_is_not_evidence_that_swaps_stopped(self):
        rows = self.rows([(0.2, 0.0, 3), (0.3, 0.005, 100)])
        self.assertAlmostEqual(T.lowest_flip_free(rows)["threshold"], 0.3)

    def test_no_threshold_stops_them(self):
        self.assertIsNone(T.lowest_flip_free(self.rows([(0.1, 0.2, 100)])))

    def test_it_is_a_separate_question_from_the_rate(self):
        """A swap-free gate can still sit far above the shaft in median rate."""
        rows = self.rows([(0.3, 0.0, 100)])
        self.assertIsNotNone(T.lowest_flip_free(rows))
        self.assertIsNone(T.recommend(rows))


class InSwing(unittest.TestCase):
    def step(self, first, second):
        return one_step(1.0, 1.0, phase=(first, second))

    def test_a_step_across_a_phase_boundary_is_still_inside_the_swing(self):
        """It buckets as mixed, which is not the same as being outside a swing."""
        step = self.step("backswing", "top")
        self.assertEqual(step.bucket("phase"), T.BUCKET_MIXED)
        self.assertTrue(T.in_swing_step(step))

    def test_between_two_swings_is_outside(self):
        self.assertFalse(T.in_swing_step(self.step(T.PHASE_OUTSIDE, T.PHASE_OUTSIDE)))

    def test_a_clip_with_no_manifest_is_outside(self):
        self.assertFalse(T.in_swing_step(self.step(T.PHASE_UNKNOWN, T.PHASE_UNKNOWN)))

    def test_one_end_outside_is_enough_to_exclude_the_step(self):
        self.assertFalse(T.in_swing_step(self.step("finish", T.PHASE_OUTSIDE)))


class Recommendation(unittest.TestCase):
    def rows(self, pairs):
        """`pairs` is [(threshold, ratio, steps)] -- the only fields `recommend` reads."""
        return [{"threshold": t, "ratio": r, "steps": n} for t, r, n in pairs]

    def test_picks_the_lowest_threshold_that_clears_the_bar(self):
        rows = self.rows([(0.1, 5.0, 100), (0.2, 1.4, 100), (0.3, 1.1, 100)])
        self.assertAlmostEqual(T.recommend(rows)["threshold"], 0.2)

    def test_a_row_with_too_few_steps_is_never_recommended(self):
        rows = self.rows([(0.2, 1.0, 5), (0.3, 1.4, 100)])
        self.assertAlmostEqual(T.recommend(rows)["threshold"], 0.3)

    def test_no_row_clears_the_bar(self):
        self.assertIsNone(T.recommend(self.rows([(0.1, 9.0, 100), (0.2, 4.0, 100)])))

    def test_a_missing_ratio_is_not_a_pass(self):
        self.assertIsNone(T.recommend(self.rows([(0.1, None, 100)])))

    def test_the_strictest_supported_gate_exists_even_when_nothing_is_recommended(self):
        rows = self.rows([(0.1, 9.0, 100), (0.2, 8.0, 50), (0.3, 4.0, 5)])
        self.assertIsNone(T.recommend(rows))
        self.assertAlmostEqual(T.strictest_supported(rows)["threshold"], 0.2)

    def test_nothing_is_supported_when_every_row_is_thin(self):
        self.assertIsNone(T.strictest_supported(self.rows([(0.1, 2.0, 3)])))

    def test_the_bar_is_a_parameter_the_report_can_move(self):
        rows = self.rows([(0.1, 1.9, 100), (0.2, 1.4, 100)])
        self.assertAlmostEqual(T.recommend(rows, comparable_ratio=2.0)["threshold"], 0.1)


# -----------------------------------------------------------------------------
# Phase, from the manifests
# -----------------------------------------------------------------------------


class WarpFraction(unittest.TestCase):
    def test_without_an_impact_the_shape_is_simply_stretched(self):
        self.assertAlmostEqual(T.warp_fraction(0.5, 10.0, 20.0, None), 15.0)

    def test_an_impact_pins_the_shape_to_the_time_that_was_measured(self):
        """The fractional impact band must land on the real impact, not on 70 %."""
        self.assertAlmostEqual(
            T.warp_fraction(T.IMPACT_FRACTION, 0.0, 10.0, 3.0), 3.0)

    def test_the_ends_stay_the_ends(self):
        self.assertAlmostEqual(T.warp_fraction(0.0, 2.0, 6.0, 5.0), 2.0)
        self.assertAlmostEqual(T.warp_fraction(1.0, 2.0, 6.0, 5.0), 6.0)

    def test_an_impact_outside_the_envelope_is_ignored_rather_than_trusted(self):
        self.assertAlmostEqual(T.warp_fraction(0.5, 10.0, 20.0, 99.0), 15.0)

    def test_the_boundaries_come_out_in_swing_order(self):
        bounds = T.phase_bounds(0.0, 10.0, 7.05)
        times = [t for t, _phase in bounds]
        self.assertEqual(times, sorted(times))
        self.assertEqual([p for _t, p in bounds], list(T.PHASE_ORDER))


class PhaseAt(unittest.TestCase):
    def window(self, start=10.0, finish=12.0, impact=11.5, index=0):
        return T.SwingWindow(clip_name="c.mp4", swing_index=index, start_sec=start,
                             finish_sec=finish, impact_sec=impact)

    def test_no_manifest_for_the_clip_means_no_phase_at_all(self):
        self.assertEqual(T.phase_at(5.0, None), T.PHASE_UNKNOWN)
        self.assertEqual(T.phase_at(5.0, []), T.PHASE_UNKNOWN)

    def test_between_two_swings_is_its_own_bucket(self):
        windows = [self.window(), self.window(start=20.0, finish=22.0, impact=21.5,
                                              index=1)]
        self.assertEqual(T.phase_at(16.0, windows), T.PHASE_OUTSIDE)

    def test_the_envelope_start_is_address(self):
        self.assertEqual(T.phase_at(10.01, [self.window()]), "address")

    def test_the_measured_impact_is_impact(self):
        self.assertEqual(T.phase_at(11.5, [self.window()]), "impact")

    def test_just_before_the_start_still_belongs_to_that_swing(self):
        self.assertEqual(T.phase_at(9.9, [self.window()]), "address")

    def test_far_before_the_start_does_not(self):
        self.assertEqual(T.phase_at(9.0, [self.window()]), T.PHASE_OUTSIDE)

    def test_the_end_of_the_envelope_is_the_finish(self):
        self.assertEqual(T.phase_at(11.99, [self.window()]), "finish")

    def test_a_frame_inside_one_of_two_envelopes_uses_that_one(self):
        windows = [self.window(), self.window(start=20.0, finish=22.0, impact=21.5,
                                              index=1)]
        self.assertEqual(T.phase_at(21.5, windows), "impact")

    def test_every_phase_the_shape_defines_is_reachable(self):
        window = self.window(start=0.0, finish=10.0, impact=7.05)
        seen = {T.phase_at(t / 100.0, [window]) for t in range(0, 1001)}
        for phase in T.PHASE_ORDER:
            self.assertIn(phase, seen, msg=phase)


class PhaseAgreement(unittest.TestCase):
    """The port is checked against the phase the manifest itself carries."""

    def setUp(self):
        self.windows = {
            "c.mp4": [T.SwingWindow(clip_name="c.mp4", swing_index=0, start_sec=0.0,
                                    finish_sec=10.0, impact_sec=7.05)]
        }

    def record(self, t_sec, phase, clip="c.mp4"):
        return {"clipName": clip, "tSec": t_sec, "phase": phase}

    def test_counts_agreements_and_names_the_disagreements(self):
        result = T.phase_agreement(
            [self.record(0.01, "address"), self.record(5.0, "finish")], self.windows)
        self.assertEqual(result["frames"], 2)
        self.assertEqual(result["agree"], 1)
        self.assertEqual(list(result["confusion"]), [("finish", "top")])

    def test_a_record_without_a_phase_is_not_scored(self):
        result = T.phase_agreement(
            [self.record(0.01, ""), {"clipName": "c.mp4", "tSec": 1.0}], self.windows)
        self.assertEqual(result["frames"], 0)

    def test_a_clip_with_no_window_scores_as_no_phase(self):
        result = T.phase_agreement(
            [self.record(1.0, "address", clip="other.mp4")], self.windows)
        self.assertEqual(result["agree"], 0)
        self.assertEqual(list(result["confusion"]), [("address", T.PHASE_UNKNOWN)])

    def test_the_clip_name_is_matched_case_insensitively(self):
        result = T.phase_agreement(
            [self.record(0.01, "address", clip="C.MP4")], self.windows)
        self.assertEqual(result["agree"], 1)


class BlurLabels(unittest.TestCase):
    class Frame:
        def __init__(self, clip_name, t_sec, view, blur):
            self.clip_name = clip_name
            self.t_sec = t_sec
            self.view = view
            self.blur = blur

    def labels(self, *specs):
        return T.FrameLabels([self.Frame(*spec) for spec in specs])

    def test_a_label_reaches_its_window_and_no_further(self):
        labels = self.labels(("c.mp4", 5.0, "dtl", "severe"))
        self.assertEqual(labels.blur_at("c.mp4", 5.05, 0.1), "severe")
        self.assertEqual(labels.blur_at("c.mp4", 5.2, 0.1), T.BLUR_NO_LABEL)

    def test_two_labels_disagreeing_inside_one_window_is_reported_not_resolved(self):
        labels = self.labels(("c.mp4", 5.0, "dtl", "severe"),
                             ("c.mp4", 5.05, "dtl", "none"))
        self.assertEqual(labels.blur_at("c.mp4", 5.02, 0.1), T.BUCKET_MIXED)

    def test_an_unlabelled_clip_has_no_labels(self):
        labels = self.labels(("other.mp4", 5.0, "dtl", "none"))
        self.assertEqual(labels.blur_at("c.mp4", 5.0, 0.1), T.BLUR_NO_LABEL)

    def test_counts_per_attribute_fill_the_selection_table(self):
        labels = self.labels(("c.mp4", 1.0, "dtl", "none"),
                             ("c.mp4", 2.0, "face_on", "none"))
        self.assertEqual(dict(labels.counts("c.mp4", "view")), {"dtl": 1, "face_on": 1})
        self.assertEqual(dict(labels.counts("c.mp4", "blur")), {"none": 2})

    def test_an_empty_attribute_is_marked_rather_than_counted_as_a_value(self):
        labels = self.labels(("c.mp4", 1.0, "", ""))
        self.assertEqual(dict(labels.counts("c.mp4", "view")), {T.BUCKET_UNSET: 1})


# -----------------------------------------------------------------------------
# Per-frame extras
# -----------------------------------------------------------------------------


class PairConfidence(unittest.TestCase):
    def test_the_weaker_point_of_each_pair_is_the_frames_confidence(self):
        item = traced(0, 0.0, points(butt=0.9, hosel=0.6, toe=0.4, heel=0.2), GATES)
        self.assertAlmostEqual(item.blade_conf, 0.2)
        self.assertAlmostEqual(item.shaft_conf, 0.6)

    def test_no_detection_has_no_confidence_rather_than_zero(self):
        item = traced(0, 0.0, None, GATES)
        self.assertIsNone(item.blade_conf)
        self.assertIsNone(item.shaft_conf)


class AttachRates(unittest.TestCase):
    def series(self):
        frames = [measured(0.0, 0.0, 0.0), measured(0.1, 1.0, 2.0),
                  measured(0.2, 2.0, 4.0)]
        frames[1].angles["blade"] = None
        T.attach_rates(frames)
        return frames

    def test_each_angle_looks_back_to_the_last_frame_that_carried_it(self):
        frames = self.series()
        self.assertAlmostEqual(frames[2].rates["shaft"][0], 10.0)   # 1 deg / 0.1 s
        self.assertAlmostEqual(frames[2].rates["blade"][0], 20.0)   # 4 deg / 0.2 s

    def test_the_step_carries_its_own_dt_so_a_wide_step_is_visible(self):
        frames = self.series()
        self.assertAlmostEqual(frames[2].rates["shaft"][1], 0.1)
        self.assertAlmostEqual(frames[2].rates["blade"][1], 0.2)

    def test_the_first_frame_of_a_series_has_no_rate(self):
        self.assertEqual(self.series()[0].rates, {})

    def test_the_csv_view_is_unfiltered(self):
        """`--max-gap-sec` belongs to the tables; raw data that was filtered on the way
        in cannot be unfiltered afterwards."""
        frames = [measured(0.0, 0.0, 0.0), measured(9.0, 90.0, 90.0)]
        T.attach_rates(frames)
        self.assertIn("shaft", frames[1].rates)


class CsvExtraColumns(unittest.TestCase):
    def setUp(self):
        frames = [measured(0.0, 0.0, 0.0, phase="top", blur="mild"),
                  measured(0.1, 1.0, 2.0, phase="top", blur="mild")]
        T.attach_rates(frames)
        self.unwrapped = {
            label: T.unwrap([item.angles.get(label) for item in frames])
            for label in ("shaft", "blade")
        }
        self.rows = list(T.csv_rows(frames, self.unwrapped))

    def test_the_context_and_the_rates_are_columns(self):
        header = self.rows[0]
        for column in ("phase", "blur", "blade_conf_min", "shaft_conf_min",
                       "blade_rate_deg_s", "blade_step_sec"):
            self.assertIn(column, header)

    def test_they_carry_the_frames_own_values(self):
        header, _first, second = self.rows
        self.assertEqual(second[header.index("phase")], "top")
        self.assertEqual(second[header.index("blur")], "mild")
        self.assertEqual(second[header.index("blade_rate_deg_s")], "20.00")

    def test_a_frame_with_no_predecessor_leaves_the_rate_blank(self):
        header, first, _second = self.rows
        self.assertEqual(first[header.index("shaft_rate_deg_s")], "")


class ResolveClips(unittest.TestCase):
    class Args:
        def __init__(self, clip=None, clips=None):
            self.clip = clip
            self.clips = clips

    def test_the_positional_clip_is_the_whole_list(self):
        self.assertEqual(T.resolve_clips(self.Args(clip=Path("a.mp4"))),
                         [Path("a.mp4")])

    def test_a_directory_expands_to_its_video_files_sorted(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            for name in ("b.mp4", "a.MOV", "notes.txt"):
                (root / name).write_bytes(b"")
            (root / "nested").mkdir()
            (root / "nested" / "c.mp4").write_bytes(b"")
            found = T.resolve_clips(self.Args(clips=[root]))
        self.assertEqual([p.name for p in found], ["a.MOV", "b.mp4"])

    def test_a_clip_named_twice_is_traced_once(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "a.mp4").write_bytes(b"")
            found = T.resolve_clips(self.Args(clips=[root, root / "a.mp4"]))
        self.assertEqual(len(found), 1)

    def test_a_missing_path_is_fatal(self):
        with self.assertRaises(SystemExit):
            T.resolve_clips(self.Args(clips=[Path("no-such-file.mp4")]))


if __name__ == "__main__":
    unittest.main()
