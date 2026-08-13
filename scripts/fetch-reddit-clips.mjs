// Build a clip list from r/GolfSwing for the shaft-annotation dataset
// (docs/shaft/annotation-spec.md → Verktyget). Run with:
//
//   node scripts/fetch-reddit-clips.mjs [--sort top|new|hot] [--time all|year|month]
//                                       [--pages N] [--out data/shaft/urls.txt]
//
// It walks Reddit's PUBLIC JSON listing (no auth, no API key) page by page and keeps
// only NATIVE Reddit video posts — the ones yt-dlp can pull directly. Crossposts,
// external links (YouTube etc.), images and removed posts are dropped: they either
// can't be fetched the same way or aren't video at all.
//
// TWO outputs, both inside data/shaft/ (the gitignored dataset dir — the script refuses
// to write anywhere else):
//   urls.txt      one permalink per line, ready for `yt-dlp -a`.
//   sources.json  per post {id, permalink, title, created_utc, duration}, so a frame in
//                 the manifest can be traced back to the Reddit thread it came from.
//
// RATE LIMITS. Reddit's public JSON is unauthenticated and rate-limited; the script
// sleeps at least 2 s between requests and ABORTS on a 429 rather than hammering.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
// The one directory this script is allowed to write to (gitignored, holds no PII in the
// list itself but downloaded clips are person-identifiable — see the spec's Persondata).
const DATA_DIR = resolve(REPO_ROOT, 'data', 'shaft');

// Descriptive UA so Reddit can attribute (and throttle) us honestly. A generic or absent
// UA is the fast path to a 429/403 on the public endpoint.
const USER_AGENT =
  'SwingCheck-dataset-builder/1.0 (shaft-annotation clip list; contact: erik@whenever.se)';

const MIN_REQUEST_INTERVAL_MS = 2_000; // Reddit rate-limit courtesy floor.
const PAGE_LIMIT = 100; // Reddit's max page size.

const VALID_SORTS = ['top', 'new', 'hot'];
const VALID_TIMES = ['all', 'year', 'month'];

function parseArgs(argv) {
  const opts = { sort: 'top', time: 'year', pages: 5, out: join('data', 'shaft', 'urls.txt') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case '--sort':
        opts.sort = takeValue();
        break;
      case '--time':
        opts.time = takeValue();
        break;
      case '--pages':
        opts.pages = Number(takeValue());
        break;
      case '--out':
        opts.out = takeValue();
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function validate(opts) {
  if (!VALID_SORTS.includes(opts.sort)) {
    throw new Error(`--sort must be one of ${VALID_SORTS.join('|')} (got "${opts.sort}")`);
  }
  if (!VALID_TIMES.includes(opts.time)) {
    throw new Error(`--time must be one of ${VALID_TIMES.join('|')} (got "${opts.time}")`);
  }
  if (!Number.isInteger(opts.pages) || opts.pages < 1) {
    throw new Error(`--pages must be a positive integer (got "${opts.pages}")`);
  }
}

/** Resolve --out and refuse anything outside data/shaft/. Returns absolute paths. */
function resolveOutputs(out) {
  const outFile = isAbsolute(out) ? resolve(out) : resolve(REPO_ROOT, out);
  const rel = relative(DATA_DIR, outFile);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `--out must be inside data/shaft/ (got "${out}" → ${outFile}). ` +
        'The script only writes to the gitignored dataset directory.',
    );
  }
  // sources.json lives beside urls.txt so the two always travel together.
  const sourcesFile = resolve(dirname(outFile), 'sources.json');
  return { outFile, sourcesFile };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One page of the listing. Aborts the whole run on a 429. */
async function fetchPage(sort, time, after) {
  const url = new URL(`https://www.reddit.com/r/GolfSwing/${sort}.json`);
  url.searchParams.set('limit', String(PAGE_LIMIT));
  url.searchParams.set('raw_json', '1'); // un-escape &amp; etc. in returned strings.
  if (sort === 'top') url.searchParams.set('t', time); // `t` only applies to top.
  if (after) url.searchParams.set('after', after);

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 429) {
    throw new Error('Reddit returned 429 Too Many Requests — aborting. Try again later.');
  }
  if (!res.ok) {
    throw new Error(`Listing fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Keep only native Reddit video. Drops crossposts (the video lives on the parent),
 * external links, images and removed/deleted posts.
 */
function isNativeVideo(post) {
  if (post.crosspost_parent || Array.isArray(post.crosspost_parent_list)) return false;
  if (post.removed_by_category || post.author === '[deleted]') return false;
  const reasonRemoved = post.selftext === '[removed]' || post.selftext === '[deleted]';
  if (reasonRemoved) return false;
  return post.is_video === true && Boolean(post.media?.reddit_video);
}

function toSource(post) {
  return {
    id: post.id,
    permalink: `https://www.reddit.com${post.permalink}`,
    title: post.title,
    created_utc: post.created_utc,
    // reddit_video carries the duration in whole seconds; absent on rare edge posts.
    duration: post.media?.reddit_video?.duration ?? null,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'Usage: node scripts/fetch-reddit-clips.mjs ' +
        '[--sort top|new|hot] [--time all|year|month] [--pages N] [--out data/shaft/urls.txt]',
    );
    return;
  }
  validate(opts);
  const { outFile, sourcesFile } = resolveOutputs(opts.out);

  console.log(
    `Fetching r/GolfSwing · sort=${opts.sort}` +
      `${opts.sort === 'top' ? ` t=${opts.time}` : ''} · up to ${opts.pages} page(s)`,
  );

  const sources = [];
  const seen = new Set(); // Reddit can repeat a post across page boundaries; dedupe by id.
  let after = null;
  let lastRequestAt = 0;

  for (let page = 0; page < opts.pages; page++) {
    // Rate limit: at least MIN_REQUEST_INTERVAL_MS between requests.
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const json = await fetchPage(opts.sort, opts.time, after);
    const children = json?.data?.children ?? [];
    let kept = 0;
    for (const child of children) {
      const post = child?.data;
      if (!post || seen.has(post.id)) continue;
      seen.add(post.id);
      if (!isNativeVideo(post)) continue;
      sources.push(toSource(post));
      kept++;
    }
    console.log(
      `  page ${page + 1}/${opts.pages}: ${children.length} posts, ${kept} native video`,
    );

    after = json?.data?.after ?? null;
    if (!after) {
      console.log('  no further pages (end of listing).');
      break;
    }
  }

  await mkdir(dirname(outFile), { recursive: true });
  const urls = sources.map((s) => s.permalink).join('\n');
  await writeFile(outFile, urls ? `${urls}\n` : '', 'utf8');
  await writeFile(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`, 'utf8');

  console.log(
    `\n✓ ${sources.length} clip(s) → ${relative(REPO_ROOT, outFile)} and ` +
      `${relative(REPO_ROOT, sourcesFile)}`,
  );
  if (sources.length === 0) {
    console.log('  (no native-video posts matched — nothing to download.)');
  } else {
    console.log(
      `  Next: yt-dlp.exe -f bv -a "${relative(REPO_ROOT, outFile)}" -o "%(id)s.mp4"`,
    );
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
