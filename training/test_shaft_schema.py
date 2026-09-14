#!/usr/bin/env python3
"""Tests for the four-point keypoint schema (butt, hosel, toe, heel).

    py -3.11 -m unittest discover -s training -t training

`unittest` and the stdlib only, same reason as test_prelabel_batch.py: training/
requirements.txt pins a training toolchain, and a test framework is not one.

WHAT IS WORTH TESTING HERE. The schema change from two points to four is the kind that
cannot be corrected after the fact -- a dataset built with the columns in the wrong
order, or with a legacy export silently dropped, is not distinguishable later from one
built right. So the things pinned are the ones whose failure is invisible:

  THE ORDER. butt, hosel, toe, heel, everywhere. Points are read POSITIONALLY out of
  the COCO keypoints array and written positionally into the YOLO label line, so the
  order is the whole contract and nothing in the data would complain if it slipped.

  BACKWARD COMPATIBILITY. batch-01 and batch-02 carry two keypoints. They must read as
  four-point annotations whose toe and heel are `outside` -- not as errors, and not as
  points at the origin, which would train the model toward (0, 0).

  THE PLACED-POINT SPECTRUM. "One point placed" used to be the only degenerate case.
  Now a frame carries anywhere from one to four, and the box rule has to follow the
  points that are actually there rather than assume a shaft.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import evaluate as E  # noqa: E402
import export_onnx as X  # noqa: E402
import prepare_dataset as D  # noqa: E402
import shaft_coco as S  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def coco_doc(keypoints, names=S.KEYPOINT_NAMES, attributes=None, width=720, height=1280):
    """A one-image COCO Keypoints document carrying `keypoints` as a flat list."""
    return {
        'categories': [{'id': 1, 'name': 'shaft', 'keypoints': list(names)}],
        'images': [{'id': 1, 'file_name': 'frames/a_s00_f01.jpg',
                    'width': width, 'height': height}],
        'annotations': [{
            'id': 1, 'image_id': 1, 'category_id': 1,
            'keypoints': list(keypoints),
            'num_keypoints': sum(1 for v in keypoints[2::3] if v > 0),
            'attributes': attributes or {},
        }],
    }


class Order(unittest.TestCase):
    def test_the_spec_order_is_butt_hosel_toe_heel(self):
        self.assertEqual(S.KEYPOINT_NAMES, ('butt', 'hosel', 'toe', 'heel'))

    def test_the_shaft_pair_and_the_sole_pair_name_the_right_points(self):
        self.assertEqual(S.SHAFT_POINTS, ('butt', 'hosel'))
        self.assertEqual(S.SOLE_POINTS, ('toe', 'heel'))

    def test_the_cvat_label_file_declares_the_same_sublabels_in_the_same_order(self):
        """cvat-labels.json is the repo's copy of a schema that lives in CVAT's database.
        It cannot enforce anything, so the least it can do is not disagree with the code."""
        import json
        schema = json.loads(
            (ROOT / 'docs' / 'shaft' / 'cvat-labels.json').read_text(encoding='utf-8')
        )
        shaft = next(label for label in schema if label['name'] == 'shaft')
        names = tuple(sub['name'] for sub in shaft['sublabels'])
        self.assertEqual(names, S.KEYPOINT_NAMES)

    def test_every_sublabel_has_a_node_in_the_skeleton_svg(self):
        import json
        schema = json.loads(
            (ROOT / 'docs' / 'shaft' / 'cvat-labels.json').read_text(encoding='utf-8')
        )
        shaft = next(label for label in schema if label['name'] == 'shaft')
        for name in S.KEYPOINT_NAMES:
            self.assertIn('data-label-name="{}"'.format(name), shaft['svg'])

    def test_points_are_read_positionally_in_that_order(self):
        flat = [10, 11, 2, 20, 21, 2, 30, 31, 2, 40, 41, 2]
        export = S.parse_export(coco_doc(flat))
        ann = export.frames['a_s00_f01']
        self.assertEqual([(p.x, p.y) for p in ann.points],
                         [(10, 11), (20, 21), (30, 31), (40, 41)])
        self.assertEqual((ann.point('toe').x, ann.point('toe').y), (30, 31))
        self.assertEqual((ann.point('heel').x, ann.point('heel').y), (40, 41))


class LegacyExports(unittest.TestCase):
    """batch-01, batch-02 and both calibration passes carry two keypoints."""

    LEGACY = [10, 11, 2, 20, 21, 1]

    def test_a_two_point_export_reads_as_four_points(self):
        ann = S.parse_export(coco_doc(self.LEGACY, names=S.LEGACY_KEYPOINT_NAMES)) \
            .frames['a_s00_f01']
        self.assertEqual(len(ann.points), 4)

    def test_the_missing_sole_points_are_outside_not_placed_at_the_origin(self):
        ann = S.parse_export(coco_doc(self.LEGACY, names=S.LEGACY_KEYPOINT_NAMES)) \
            .frames['a_s00_f01']
        for name in S.SOLE_POINTS:
            point = ann.point(name)
            self.assertEqual(point.v, S.V_OUTSIDE)
            self.assertFalse(point.placed)
        self.assertEqual(ann.n_placed, 2)

    def test_the_shaft_points_survive_unchanged(self):
        ann = S.parse_export(coco_doc(self.LEGACY, names=S.LEGACY_KEYPOINT_NAMES)) \
            .frames['a_s00_f01']
        self.assertTrue(ann.placed_all(*S.SHAFT_POINTS))
        self.assertFalse(ann.placed_all(*S.SOLE_POINTS))
        self.assertEqual((ann.point('butt').x, ann.point('hosel').y), (10, 21))

    def test_the_visibility_check_does_not_trip_on_the_padded_points(self):
        """num_keypoints counts v>0, and the padding is v=0, so the two must still agree."""
        warnings = S.verify_visibility_coding(coco_doc(self.LEGACY,
                                                       names=S.LEGACY_KEYPOINT_NAMES))
        self.assertNotIn('num_keypoints', ' '.join(warnings))

    def test_the_schema_note_says_which_export_it_read(self):
        self.assertIn('legacy 2-point', S.keypoint_schema_note(S.LEGACY_KEYPOINT_NAMES))
        self.assertIn('4-point', S.keypoint_schema_note(S.KEYPOINT_NAMES))

    def test_an_out_of_order_export_is_called_out_rather_than_read_quietly(self):
        note = S.keypoint_schema_note(('hosel', 'butt', 'toe', 'heel'))
        self.assertIn('UNEXPECTED', note)

    def test_export_keypoint_names_reads_the_category_not_the_first_annotation(self):
        doc = coco_doc([0] * 12)  # nothing placed, but the category still declares four
        self.assertEqual(S.export_keypoint_names(doc), S.KEYPOINT_NAMES)


class LabelLine(unittest.TestCase):
    def points(self, *visibilities):
        return [S.Point(10.0 * (i + 1), 20.0 * (i + 1), v)
                for i, v in enumerate(visibilities)]

    def test_writes_one_triplet_per_keypoint_in_order(self):
        line = D.label_line((0, 0, 100, 200), self.points(2, 2, 2, 2), 100, 200)
        fields = line.split()
        self.assertEqual(len(fields), 5 + 3 * len(S.KEYPOINT_NAMES))
        self.assertEqual(fields[5:8], ['0.100000', '0.100000', '2'])
        self.assertEqual(fields[8:11], ['0.200000', '0.200000', '2'])
        self.assertEqual(fields[11:14], ['0.300000', '0.300000', '2'])
        self.assertEqual(fields[14:17], ['0.400000', '0.400000', '2'])

    def test_an_unplaced_point_is_zeroed_never_written_as_its_ghost_coordinate(self):
        line = D.label_line((0, 0, 100, 200), self.points(2, 2, 0, 0), 100, 200)
        fields = line.split()
        self.assertEqual(fields[11:17], ['0.000000', '0.000000', '0',
                                         '0.000000', '0.000000', '0'])

    def test_a_legacy_frame_and_a_four_point_frame_produce_the_same_column_count(self):
        legacy = D.label_line((0, 0, 100, 200), self.points(2, 2, 0, 0), 100, 200)
        full = D.label_line((0, 0, 100, 200), self.points(2, 2, 2, 2), 100, 200)
        self.assertEqual(len(legacy.split()), len(full.split()))


class BoxRule(unittest.TestCase):
    """One placed point has no rectangle; two or more do, whichever two they are."""

    def point(self, x, y):
        return S.Point(float(x), float(y), 2)

    def test_encloses_every_placed_point_not_just_the_shaft(self):
        points = [self.point(100, 100), self.point(100, 500), self.point(300, 520)]
        x0, y0, x1, y1 = D.enclosing_box(points, 0.0, 0.0, 1000, 1000)
        self.assertEqual((x0, y0, x1, y1), (100, 100, 300, 520))

    def test_two_sole_points_alone_give_the_sole_s_own_box(self):
        """Not a mistake to fix: the box has to describe what this frame annotates."""
        points = [self.point(300, 500), self.point(340, 512)]
        x0, y0, x1, y1 = D.enclosing_box(points, 0.0, 0.0, 1000, 1000)
        self.assertEqual((x0, y0, x1, y1), (300, 500, 340, 512))

    def test_the_min_pad_floor_still_rescues_a_degenerate_rectangle(self):
        points = [self.point(500, 100), self.point(500, 900)]  # exactly vertical
        x0, _y0, x1, _y1 = D.enclosing_box(points, 0.0, 0.01, 1000, 1000)
        self.assertGreater(x1 - x0, 0)

    def test_the_median_side_is_measured_on_butt_hosel_over_both_schemas(self):
        def record(*visibilities):
            points = [S.Point(0.0, 0.0, visibilities[0]), S.Point(0.0, 100.0, visibilities[1]),
                      S.Point(0.0, 0.0, visibilities[2]), S.Point(0.0, 0.0, visibilities[3])]
            ann = S.FrameAnnotation('f', 100, 1000, 'f.jpg', points)
            return {'ann': ann}

        # A legacy frame (toe/heel outside) and a full one contribute identically.
        self.assertAlmostEqual(D.median_shaft_side([record(2, 2, 0, 0)]), 0.1)
        self.assertAlmostEqual(D.median_shaft_side([record(2, 2, 2, 2)]), 0.1)
        # A frame missing a shaft point contributes nothing rather than a wrong length.
        self.assertEqual(D.median_shaft_side([record(2, 0, 2, 2)]), 0.0)


class DataYaml(unittest.TestCase):
    def read(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            D.write_data_yaml(out, None)
            return (out / 'data.yaml').read_text(encoding='utf-8')

    def test_declares_four_keypoints_of_three_values(self):
        self.assertIn('kpt_shape: [4, 3]', self.read())

    def test_flip_idx_is_the_identity_over_all_four(self):
        self.assertIn('flip_idx: [0, 1, 2, 3]', self.read())

    def test_records_the_keypoint_order_for_whoever_opens_the_file(self):
        self.assertIn('butt, hosel, toe, heel', self.read())


class Angles(unittest.TestCase):
    def test_shaft_and_blade_are_two_separate_measurements(self):
        labels = [label for label, _f, _t in E.ANGLES]
        self.assertEqual(labels, ['shaft', 'blade'])

    def test_the_shaft_vector_is_butt_to_hosel_and_the_blade_vector_heel_to_toe(self):
        self.assertEqual(E.ANGLES[0][1:], ('butt', 'hosel'))
        self.assertEqual(E.ANGLES[1][1:], ('heel', 'toe'))

    def test_swapped_ends_read_as_180_degrees_not_as_zero(self):
        """Not folded at 90: that is the failure that cost shaft-v1 its face-on frames,
        and it is exactly as possible on the sole as on the shaft."""
        forward = E.angle_deg((0, 0), (10, 0))
        backward = E.angle_deg((10, 0), (0, 0))
        self.assertAlmostEqual(E.angle_difference(forward, backward), 180.0)

    def test_a_bucket_keeps_the_two_angles_apart(self):
        bucket = E.Bucket()
        bucket.add_angle('shaft', 1.0)
        bucket.add_angle('shaft', 3.0)
        summary = bucket.summary()
        self.assertEqual(summary['shaft_angle_n'], 2)
        self.assertAlmostEqual(summary['shaft_angle_median'], 2.0)
        # No blade angle was added, so it is absent -- not zero.
        self.assertEqual(summary['blade_angle_n'], 0)
        self.assertIsNone(summary['blade_angle_median'])

    def test_a_bucket_carries_a_slot_for_every_keypoint(self):
        summary = E.Bucket().summary()
        for name in S.KEYPOINT_NAMES:
            self.assertIn(name + '_n', summary)
            self.assertIn(name + '_pct_median', summary)

    def test_there_is_no_human_baseline_for_the_blade_angle(self):
        """The calibration set was annotated in the 2-point schema. An unmeasured floor
        must print as absent, never as zero."""
        self.assertIsNone(E.HUMAN_BASELINE['blade_angle_deg_median'])
        self.assertIsNone(E.HUMAN_BASELINE['toe_pct_h_median'])
        self.assertEqual(E.HUMAN_BASELINE['shaft_angle_deg_median'], 0.3)
        self.assertEqual(E.fmt(None), '--')


class OnnxChannels(unittest.TestCase):
    def test_the_four_point_schema_is_seventeen_channels(self):
        self.assertEqual(X.EXPECTED_CHANNELS, 17)
        self.assertIn('4-point', X.describe_channels(17))

    def test_the_legacy_schema_is_eleven_and_is_named_not_rejected(self):
        self.assertEqual(X.LEGACY_CHANNELS, 11)
        self.assertIn('legacy 2-point', X.describe_channels(11))

    def test_anything_else_is_unrecognised(self):
        self.assertIn('UNRECOGNISED', X.describe_channels(14))

    def test_the_channel_count_follows_the_keypoint_list(self):
        self.assertEqual(
            X.EXPECTED_CHANNELS,
            X.BOX_CHANNELS + X.CHANNELS_PER_KEYPOINT * len(S.KEYPOINT_NAMES),
        )


if __name__ == '__main__':
    unittest.main()
