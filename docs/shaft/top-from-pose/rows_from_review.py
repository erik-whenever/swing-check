# SPIKE, READ-ONLY (S-31): rebuild the two small inputs the analysis needs.
#   python docs/shaft/top-from-pose/rows_from_review.py <export_manifests.json> <review_rows.json>
# Writes export_manifests.json first if it does not exist (same shape S-27's run_detector.py
# emitted: one entry per export zip, with its manifest.json verbatim), then joins
# docs/shaft/phase-audit/review.md's 32 judged rows onto it and flags which have a local clip.
import json, re, sys, zipfile
from pathlib import Path

man_path, rows_path = Path(sys.argv[1]), Path(sys.argv[2])
if not man_path.exists():
    meta = [dict(export=z.name, manifest=json.loads(zipfile.ZipFile(z).read('manifest.json')))
            for z in sorted(Path('data/shaft/exports').glob('*.zip'))]
    man_path.parent.mkdir(parents=True, exist_ok=True)
    json.dump(meta, open(man_path, 'w'))

frames = {f['id']: f for e in json.load(open(man_path)) for f in e['manifest']['frames']}
local = {p.name for p in Path('data/shaft/clips').rglob('*') if p.is_file()}

rows = []
for line in open('docs/shaft/phase-audit/review.md', encoding='utf-8'):
    m = re.match(r'\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|', line)
    if not m:
        continue
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    r = dict(n=int(m.group(1)), fid=m.group(2), ans=cells[5], star=cells[6])
    f = frames.get(r['fid'])
    if f:
        r.update(clip=f['clipName'], sw=f['id'].rsplit('_f', 1)[0], t=f['tSec'],
                 env=f['envelopeSec'], impact=f['impactSec'], src=f['source'],
                 slowmo=f.get('slowmo'), gate=f.get('gate'), local=f['clipName'] in local)
    rows.append(r)

json.dump(rows, open(rows_path, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"{len(rows)} bedomda rader, {sum(1 for r in rows if r.get('local'))} med lokal kallvideo, "
      f"{len({r['clip'] for r in rows if r.get('local')})} distinkta klipp, "
      f"{len({r['sw'] for r in rows if r.get('local')})} distinkta svingar")
