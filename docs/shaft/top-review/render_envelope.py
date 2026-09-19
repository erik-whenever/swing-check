# ONE-OFF, READ-ONLY on the repo (S-34): write one image file per envelope frame of ONE swing,
# so a human can look at the clip instead of reading labels about it.
#
#   <venv>/python.exe docs/shaft/top-review/render_envelope.py S32-084 data/shaft/top-round/054-inspekt
#
# It decodes the source clip with the SAME loop build_round.py:extract uses (same
# CAP_PROP_POS_MSEC seek, same [start, finish] test, same frame ordering), so frame 017 here is
# the frame the annotators saw as 17 -- checked against the registry's frameTimes rather than
# assumed, and it STOPS if the two do not line up.
#
# Differences from build_round.py, both deliberate: native resolution (not MAX_LONG_SIDE 1280)
# and quality 95, because this is for looking closely, not for a blind round; and the file name
# carries the frame index and the timestamp.
#
# NOTHING IS MARKED ON THE IMAGES. No box, no arrow, no chosen frame: the point is to let
# someone look without being told where to look. The facts that are known -- the two
# annotators' intervals, the control key, the CVAT export frames and their phase labels --
# go in RUTOR.txt beside the images, as a list, with no verdict attached.
#
# Writes ONLY under the given out dir (gitignored: .gitignore line 37, `data/shaft/*`).
# No production code, no threshold, no estimator.
import argparse
import json
from pathlib import Path

import cv2

ap = argparse.ArgumentParser()
ap.add_argument('swingId')
ap.add_argument('out', type=Path)
ap.add_argument('--registry', type=Path,
                default=Path('data/shaft/top-round/registry/registry.json'))
ap.add_argument('--answers', type=Path, nargs='+',
                default=[Path('data/shaft/top-round/svar-erik.json'),
                         Path('data/shaft/top-round/svar-lisa.json'),
                         Path('data/shaft/top-round/svar-erik-pass2.json')])
ap.add_argument('--quality', type=int, default=95)
args = ap.parse_args()

reg = json.loads(args.registry.read_text(encoding='utf-8'))
sw = next((s for s in reg['swings'] if s['id'] == args.swingId), None)
if sw is None:
    raise SystemExit('no swing %s in the registry' % args.swingId)

clip = Path('data/shaft/clips') / sw['clip']
if not clip.exists():
    raise SystemExit('source clip missing: %s' % clip)

start, finish = sw['env']
cap = cv2.VideoCapture(str(clip))
cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
frames = []
while True:
    ok, bgr = cap.read()
    if not ok:
        break
    t = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000
    if t > finish + 1e-3:
        break
    if t < start - 1e-3:
        continue
    frames.append((round(t, 4), bgr))
cap.release()

# The frames written here must be the frames the annotators indexed, or every number in the
# text file below points at the wrong picture. Checked, not assumed.
times = sw['frameTimes']
if len(frames) != len(times) or any(abs(a - b) > 1e-3 for (a, _), b in zip(frames, times)):
    raise SystemExit('decoded %d frames, registry has %d, and the timestamps differ -- the '
                     'decode is not reproducing the round' % (len(frames), len(times)))

args.out.mkdir(parents=True, exist_ok=True)
for i, (t, bgr) in enumerate(frames, start=1):
    cv2.imwrite(str(args.out / ('f%03d_t%.3fs.jpg' % (i, t))), bgr,
                [int(cv2.IMWRITE_JPEG_QUALITY), args.quality])

# -- the facts beside the pictures, no verdict --------------------------------
step = (times[-1] - times[0]) / (len(times) - 1) if len(times) > 1 else 1 / 30
ans = {}
for p in args.answers:
    d = json.loads(p.read_text(encoding='utf-8'))
    row = next((r for r in d['answers'] if r['id'] == args.swingId), None)
    if row:
        ans[d['annotator'] + ' (' + p.stem + ')'] = row

L = []
L.append('%s -- %s, envelope %.3f-%.3f s, %d bildrutor, %.1f fps, %s'
         % (sw['id'], sw['clip'], start, finish, len(times), sw['fps'],
            'slow-mo' if sw['slowmo'] else 'normal takt'))
L.append('kalla: %s, vy %s, nedslag %s'
         % (sw['source'], sw['viewBucket'],
            ('%.3f s' % sw['impact']) if sw['impact'] else 'saknas',))
L.append('klippet bar %d svingar i rundan: %s'
         % (sum(1 for s in reg['swings'] if s['clip'] == sw['clip']),
            ', '.join('%s (envelope %.3f-%.3f s)' % (s['id'], s['env'][0], s['env'][1])
                      for s in reg['swings'] if s['clip'] == sw['clip'])))
L.append('')
L.append('Bildfilerna ar envelopens rutor i ordning, otextade och i klippets egen upplosning.')
L.append('Ingenting ar markerat i bild. Nedan star bara vad som ar registrerat om svingen.')
L.append('')
L.append('-- vad bedomarna svarade (rutnummer = filnamnets fNNN) --')
for name, row in ans.items():
    if row.get('unsure'):
        L.append('  %-28s osaker%s' % (name, (' -- "%s"' % row['note']) if row.get('note') else ''))
        continue
    L.append('  %-28s rutor %d-%d  (%.3f-%.3f s)%s'
             % (name, row['first'], row['last'], times[row['first'] - 1], times[row['last'] - 1],
                (' -- "%s"' % row['note']) if row.get('note') else ''))
if sw['control']:
    ci = sw['control']
    off = (ci['tSec'] - times[0]) / step + 1
    L.append('')
    L.append('-- kontrollens facit --')
    L.append('  %s @ %.3f s  -> ligger vid ruta %.1f i den har numreringen'
             % (ci['frame'].split('_')[-1], ci['tSec'], off))
    L.append('  kalla: %s' % ', '.join(ci['sources']))
L.append('')
L.append('-- exportens bildrutor (det glesa rutnat CVAT annoterades pa) --')
for f in sorted(sw['exportFrames'], key=lambda f: f['tSec']):
    lab = sw['annotatedPhases'].get(f['id'])
    L.append('  %-4s @ %7.3f s  -> ruta %5.1f  manifestfas=%-10s %s'
             % (f['id'].split('_')[-1], f['tSec'], (f['tSec'] - times[0]) / step + 1,
                f['phase'],
                ('CVAT-etikett=%s' % lab['phase']) if lab else '(ingen CVAT-etikett)'))
if sw['annotatorDisagreements']:
    L.append('  CVAT-annotatorerna ar oense om: %s'
             % ', '.join('%s %s' % (d['frame'].split('_')[-1], '/'.join(d['phases']))
                         for d in sw['annotatorDisagreements']))
L.append('')
L.append('-- alla rutor och deras tider --')
for i, t in enumerate(times, start=1):
    L.append('  f%03d  %.4f s' % (i, t))
(args.out / 'RUTOR.txt').write_text('\n'.join(L) + '\n', encoding='utf-8')

print('%d bildrutor + RUTOR.txt -> %s' % (len(frames), args.out))
