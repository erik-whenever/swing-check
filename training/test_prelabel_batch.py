#!/usr/bin/env python3
"""Tests for training/prelabel_batch.py.

    py -3.11 -m unittest discover -s training -t .

`unittest` rather than pytest: training/requirements.txt exists to pin a training
toolchain, and adding a test framework to it would mean everyone who wants to train has
to install one. Everything here runs on the stdlib plus what the script already needs.

WHAT IS WORTH TESTING HERE. Two things, and they are not the obvious ones:

  THE VIEW GATE. It is the only thing standing between the annotator and a batch of
  confidently wrong, back-to-front pre-labels. Its logic is small and its failure is
  invisible in the output — the XML looks exactly the same either way — so it is tested
  from every direction, including the pathological inputs (a swing with no annotation, a
  swing two annotators disagree about, an id that carries no swing index).

  THE COORDINATE TRANSFORM. It is a second implementation of geometry that already
  exists in TypeScript (src/lib/shaft/letterbox.ts). Two implementations of one
  transform drift, and the drift is silent: coordinates stay plausible and move by the
  padding width. The numbers here are pinned against the three frames S-11 verified in
  BOTH environments, so a drift in either fails a test rather than a batch.
"""
from __future__ import annotations

import io
import json
import math
import unittest
import zipfile
from pathlib import Path

import numpy as np

import prelabel_batch as P

ROOT = Path(__file__).resolve().parent.parent


def coco_zip(path: Path, frames: dict[str, str]) -> Path:
    """A minimal CVAT COCO Keypoints export: `{frame id: view}`."""
    doc = {
        'categories': [{'id': 1, 'name': 'shaft', 'keypoints': ['butt', 'hosel']}],
        'images': [{'id': i, 'file_name': f'frames/{fid}.jpg', 'width': 720, 'height': 1280}
                   for i, fid in enumerate(frames, 1)],
        'annotations': [{'id': i, 'image_id': i, 'category_id': 1, 'keypoints': [1, 1, 2, 2, 2, 2],
                         'num_keypoints': 2, 'attributes': {'view': view}}
                        for i, view in enumerate(frames.values(), 1)],
    }
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('annotations/person_keypoints_default.json', json.dumps(doc))
    return path


def raw_output(entries, num_anchors=8):
    """An (11, N) model output built by hand, so the channel layout is asserted and not
    inherited. `entries` is `{anchor: (conf, box, butt, butt_v, hosel, hosel_v)}`."""
    raw = np.zeros((11, num_anchors), np.float32)
    for i, (conf, box, butt, butt_v, hosel, hosel_v) in entries.items():
        raw[0:4, i] = box
        raw[4, i] = conf
        raw[5:7, i] = butt
        raw[7, i] = butt_v
        raw[8:10, i] = hosel
        raw[10, i] = hosel_v
    return raw


class SwingOf(unittest.TestCase):
    def test_strips_the_frame_index_and_keeps_everything_else(self):
        self.assertEqual(P.swing_of('001-d15a2abb_s00_f06'), '001-d15a2abb_s00')
        self.assertEqual(P.swing_of('img-5426-7dc54153_s01_f03'), 'img-5426-7dc54153_s01')

    def test_two_swings_of_one_clip_are_two_swings(self):
        self.assertNotEqual(P.swing_of('072-69d3f247_s00_f01'), P.swing_of('072-69d3f247_s02_f06'))

    def test_a_clip_slug_containing_f_digits_is_not_mistaken_for_the_suffix(self):
        self.assertEqual(P.swing_of('f12-abc_s03_f07'), 'f12-abc_s03')

    def test_refuses_an_id_with_no_frame_index_rather_than_inventing_a_swing(self):
        with self.assertRaises(ValueError):
            P.swing_of('not-an-extractor-id')


class ViewGate(unittest.TestCase):
    """The gate itself: which swings count as provably `dtl`."""

    def setUp(self):
        self.tmp = Path(self.enterContext(__import__('tempfile').TemporaryDirectory()))

    def views_for(self, *exports):
        views, _ = P.build_swing_views(list(exports))
        return views

    def test_one_annotated_frame_labels_its_whole_swing(self):
        z = coco_zip(self.tmp / 'a.zip', {'clip-aaaa_s00_f03': 'dtl'})
        self.assertEqual(self.views_for(z)['clip-aaaa_s00'], {'dtl'})

    def test_two_annotators_of_the_same_frame_both_count(self):
        a = coco_zip(self.tmp / 'erik.zip', {'clip-aaaa_s00_f03': 'face_on'})
        b = coco_zip(self.tmp / 'lisa.zip', {'clip-aaaa_s00_f03': 'dtl'})
        # A disputed swing is NOT unanimously dtl, which is what makes it skippable.
        self.assertEqual(self.views_for(a, b)['clip-aaaa_s00'], {'dtl', 'face_on'})

    def test_a_face_on_swing_does_not_contaminate_its_dtl_sibling_swing(self):
        z = coco_zip(self.tmp / 'a.zip', {'clip-aaaa_s00_f01': 'dtl', 'clip-aaaa_s02_f06': 'face_on'})
        views = self.views_for(z)
        self.assertEqual(views['clip-aaaa_s00'], {'dtl'})
        self.assertEqual(views['clip-aaaa_s02'], {'face_on'})

    def test_a_swing_with_no_annotation_is_absent_not_empty(self):
        z = coco_zip(self.tmp / 'a.zip', {'clip-aaaa_s00_f01': 'dtl'})
        self.assertIsNone(self.views_for(z).get('clip-bbbb_s00'))

    def test_counts_annotated_frames_per_export_for_the_report(self):
        a = coco_zip(self.tmp / 'a.zip', {'x_s00_f01': 'dtl', 'x_s01_f01': 'dtl'})
        _, per_export = P.build_swing_views([a])
        self.assertEqual(list(per_export.values()), [2])

    def test_ignores_ids_that_are_not_extractor_ids_instead_of_crashing(self):
        z = coco_zip(self.tmp / 'a.zip', {'some-other-dataset-image': 'dtl', 'x_s00_f01': 'dtl'})
        self.assertEqual(set(self.views_for(z)), {'x_s00'})


class Letterbox(unittest.TestCase):
    """Mirrors src/lib/shaft/letterbox.test.ts — same cases, same expectations."""

    def test_portrait_fits_the_height_and_pads_the_sides(self):
        scale, pad_x, pad_y, draw_w, draw_h = P.compute_letterbox(1080, 1920, 960)
        self.assertAlmostEqual(scale, 0.5)
        self.assertEqual((draw_w, draw_h), (540, 960))
        self.assertEqual((pad_x, pad_y), (210, 0))

    def test_square_needs_no_padding(self):
        _, pad_x, pad_y, draw_w, draw_h = P.compute_letterbox(500, 500, 960)
        self.assertEqual((pad_x, pad_y, draw_w, draw_h), (0, 0, 960, 960))

    def test_pad_is_never_negative_zero(self):
        _, pad_x, pad_y, _, _ = P.compute_letterbox(960, 960, 960)
        self.assertEqual(str(pad_x), '0')
        self.assertEqual(str(pad_y), '0')

    def test_round_trip_returns_the_original_point(self):
        scale, pad_x, pad_y, _, _ = P.compute_letterbox(720, 818, 960)
        for x, y in [(0, 0), (719, 817), (249.5, 434.25)]:
            mx, my = x * scale + pad_x, y * scale + pad_y
            back = P.model_to_image(scale, pad_x, pad_y, mx, my)
            self.assertAlmostEqual(back[0], x, places=6)
            self.assertAlmostEqual(back[1], y, places=6)

    def test_forgetting_the_padding_would_be_wrong_by_the_pad_width(self):
        """The specific bug this transform exists to prevent: scale-only inverse."""
        scale, pad_x, _, _, _ = P.compute_letterbox(1080, 1920, 960)
        model_x = 500.0
        correct = P.model_to_image(scale, pad_x, 0, model_x, 0)[0]
        scale_only = model_x / scale
        self.assertGreater(abs(correct - scale_only), 400)

    def test_angle_survives_the_transform(self):
        """Uniform scale + translation preserves direction — the number the rules use."""
        scale, pad_x, pad_y, _, _ = P.compute_letterbox(1080, 1920, 960)
        a, b = (100.0, 200.0), (400.0, 900.0)
        img = [P.model_to_image(scale, pad_x, pad_y, *p) for p in (a, b)]
        self.assertAlmostEqual(
            math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])),
            math.degrees(math.atan2(img[1][1] - img[0][1], img[1][0] - img[0][0])),
            places=9,
        )

    def test_rejects_a_zero_sized_image(self):
        with self.assertRaises(ValueError):
            P.compute_letterbox(0, 100, 960)


class SelectBest(unittest.TestCase):
    """Pins the channel layout and the threshold semantics against hand-built tensors."""

    def test_reads_each_channel_from_the_documented_index(self):
        raw = raw_output({3: (0.9, (100, 200, 40, 60), (10, 20), 0.8, (30, 40), 0.7)})
        best = P.select_best(raw, 0.25)
        self.assertAlmostEqual(best['conf'], 0.9, places=6)
        self.assertEqual(best['butt'], (10.0, 20.0))
        self.assertAlmostEqual(best['butt_score'], 0.8, places=6)
        self.assertEqual(best['hosel'], (30.0, 40.0))
        self.assertAlmostEqual(best['hosel_score'], 0.7, places=6)

    def test_returns_none_when_nothing_clears_the_confidence_threshold(self):
        self.assertIsNone(P.select_best(raw_output({1: (0.24, (1, 1, 2, 2), (0, 0), 1, (1, 1), 1)}), 0.25))

    def test_the_threshold_is_inclusive_at_the_boundary(self):
        raw = raw_output({1: (0.25, (1, 1, 2, 2), (0, 0), 1, (1, 1), 1)})
        self.assertIsNotNone(P.select_best(raw, 0.25))

    def test_picks_the_highest_confidence_detection(self):
        raw = raw_output({
            1: (0.4, (100, 100, 10, 10), (1, 1), 1, (2, 2), 1),
            5: (0.8, (500, 500, 10, 10), (3, 3), 1, (4, 4), 1),
        })
        self.assertEqual(P.select_best(raw, 0.25)['butt'], (3.0, 3.0))

    def test_nms_collapses_two_boxes_on_the_same_club(self):
        raw = raw_output({
            1: (0.8, (100, 100, 40, 40), (1, 1), 1, (2, 2), 1),
            2: (0.7, (102, 102, 40, 40), (9, 9), 1, (8, 8), 1),
        })
        self.assertEqual(P.select_best(raw, 0.25)['detections'], 1)

    def test_nms_keeps_a_second_golfer_elsewhere_in_the_frame(self):
        raw = raw_output({
            1: (0.8, (100, 100, 40, 40), (1, 1), 1, (2, 2), 1),
            2: (0.7, (800, 800, 40, 40), (9, 9), 1, (8, 8), 1),
        })
        self.assertEqual(P.select_best(raw, 0.25)['detections'], 2)


class PrelabelXml(unittest.TestCase):
    PRE = {'butt': (10.5, 20.25), 'hosel': (30.0, 40.0), 'conf': 0.9}

    def test_emits_a_skeleton_with_both_sublabels_in_butt_hosel_order(self):
        xml = P.prelabel_xml([{'id': 'a_s00_f01', 'phase': 'top', 'width': 720, 'height': 1280,
                               'prelabel': self.PRE}])
        self.assertIn('<skeleton label="shaft" source="manual" z_order="0">', xml)
        self.assertIn('<points label="butt" occluded="0" source="manual" outside="0" '
                      'points="10.50,20.25">', xml)
        self.assertIn('<points label="hosel" occluded="0" source="manual" outside="0" '
                      'points="30.00,40.00">', xml)
        self.assertLess(xml.index('label="butt"'), xml.index('label="hosel"'))

    def test_sets_no_attributes_at_all_on_the_skeleton(self):
        """view, blur, phase and no_shaft are the annotator's — CVAT applies the defaults."""
        xml = P.prelabel_xml([{'id': 'a_s00_f01', 'phase': 'top', 'prelabel': self.PRE}])
        body = xml[xml.index('<image'):]
        self.assertNotIn('<attribute', body)

    def test_a_skipped_frame_gets_an_image_element_and_no_object(self):
        xml = P.prelabel_xml([
            {'id': 'a_s00_f01', 'phase': 'top', 'reason': 'no-detection', 'width': 720, 'height': 1280},
            {'id': 'b_s00_f01', 'phase': 'top', 'prelabel': self.PRE},
        ])
        self.assertIn('<image id="0" name="frames/a_s00_f01.jpg" width="720" height="1280"/>', xml)
        self.assertEqual(xml.count('<skeleton'), 1)

    def test_image_ids_run_from_zero_in_the_given_order(self):
        xml = P.prelabel_xml([{'id': f'f{i}_s00_f00', 'phase': 'top'} for i in range(5)])
        self.assertEqual([m for m in range(5)],
                         [int(s.split('"')[1]) for s in xml.split('<image id=')[1:]])

    def test_name_prefix_matches_the_batch_zip_layout_and_can_be_dropped(self):
        frames = [{'id': 'a_s00_f01', 'phase': 'top'}]
        self.assertIn('name="frames/a_s00_f01.jpg"', P.prelabel_xml(frames))
        self.assertIn('name="a_s00_f01.jpg"', P.prelabel_xml(frames, name_prefix=''))

    def test_escapes_xml_metacharacters_rather_than_emitting_broken_markup(self):
        """Asserted by parsing, not by string match: `quoteattr` may legitimately switch
        to single quotes for a value containing a double quote, and both spellings are
        correct. What must hold is that the name survives the round trip intact."""
        from xml.etree import ElementTree
        name = 'a&b<c>"d_s00_f01'
        root = ElementTree.fromstring(P.prelabel_xml([{'id': name, 'phase': 'top'}]))
        self.assertEqual(root.find('image').get('name'), f'frames/{name}.jpg')

    def test_declares_the_shaft_skeleton_and_its_two_sublabels_in_meta(self):
        xml = P.prelabel_xml([{'id': 'a_s00_f01', 'phase': 'top'}])
        self.assertIn('<type>skeleton</type>', xml)
        self.assertIn('<parent>shaft</parent>', xml)
        for sublabel in ('butt', 'hosel'):
            self.assertIn(f'<name>{sublabel}</name>', xml)

    def test_meta_matches_the_committed_label_schema(self):
        """The sublabel names in the XML must be the ones the annotator's task has."""
        schema = json.loads(P.LABELS_FILE.read_text(encoding='utf-8'))
        shaft = next(l for l in schema if l['name'] == 'shaft')
        xml = P.prelabel_xml([])
        for attribute in shaft['attributes']:
            self.assertIn(f'<name>{attribute["name"]}</name>', xml)

    def test_is_well_formed_xml(self):
        from xml.etree import ElementTree
        xml = P.prelabel_xml([
            {'id': 'a_s00_f01', 'phase': 'top', 'width': 1, 'height': 2, 'prelabel': self.PRE},
            {'id': 'b&c_s00_f01', 'phase': 'top', 'reason': 'no-detection'},
        ])
        root = ElementTree.fromstring(xml)
        self.assertEqual(len(root.findall('image')), 2)
        self.assertEqual(len(root.findall('image/skeleton/points')), 2)


class PinnedAgainstTheWebApp(unittest.TestCase):
    """End-to-end against the three frames S-11 verified in Python AND the browser.

    Skipped when the model or the calibration set is absent — both are gitignored
    personal data and neither is present on a fresh clone. When they ARE present this is
    the test that catches a drift between this script and src/lib/shaft/.
    """

    CASES = {
        # frame id: (conf, butt, hosel) as recorded in docs/BACKLOG.md → S-11
        '002-2415a710_s00_f02': (0.769, (249, 434), (181, 375)),
        '008-b8e78a8a_s00_f05': (0.260, (704, 565), (602, 547)),
    }
    NO_DETECTION = '006-48f0d1f4_s00_f03'

    @classmethod
    def setUpClass(cls):
        cls.calibration = ROOT / 'data' / 'shaft' / 'calibration' / 'calibration.zip'
        if not P.DEFAULT_MODEL.exists() or not cls.calibration.exists():
            raise unittest.SkipTest('model or calibration set not present (gitignored)')
        import onnxruntime as ort
        cls.session = ort.InferenceSession(str(P.DEFAULT_MODEL), providers=['CPUExecutionProvider'])
        cls.imgsz = cls.session.get_inputs()[0].shape[2]

    def run_frame(self, frame_id):
        import cv2
        with zipfile.ZipFile(self.calibration) as z:
            data = z.read(f'frames/{frame_id}.jpg')
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        tensor, scale, pad_x, pad_y = P.preprocess(image, self.imgsz)
        raw = self.session.run(None, {self.session.get_inputs()[0].name: tensor})[0][0]
        best = P.select_best(raw, P.DEFAULT_CONF)
        if best is None:
            return None
        return best, (scale, pad_x, pad_y)

    def test_reproduces_the_verified_coordinates_to_the_pixel(self):
        for frame_id, (conf, butt, hosel) in self.CASES.items():
            with self.subTest(frame_id):
                best, t = self.run_frame(frame_id)
                self.assertAlmostEqual(best['conf'], conf, places=3)
                for name, expected in (('butt', butt), ('hosel', hosel)):
                    got = P.model_to_image(*t, *best[name])
                    self.assertAlmostEqual(got[0], expected[0], delta=1)
                    self.assertAlmostEqual(got[1], expected[1], delta=1)

    def test_reproduces_the_verified_non_detection(self):
        self.assertIsNone(self.run_frame(self.NO_DETECTION))


if __name__ == '__main__':
    unittest.main()
