/**
 * Dynamic Mixkit search — scrapes public HTML pages to find video/music IDs
 * relevant to any keyword, verifies they're downloadable, and caches results.
 *
 * No API key needed. Works by parsing Mixkit's CDN asset URLs embedded in
 * their category/search HTML pages.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  expires: number;
}

// ---------------------------------------------------------------------------
// In-memory cache (1 hour TTL)
// ---------------------------------------------------------------------------
const videoCache  = new Map<string, CacheEntry<number[]>>();
const musicCache  = new Map<string, CacheEntry<string[]>>();
const CACHE_TTL   = 60 * 60 * 1_000; // 1 hour

// ---------------------------------------------------------------------------
// Fallback pools — used when scraping or verification yields nothing
// ---------------------------------------------------------------------------
const FALLBACK_VIDEO_IDS = [
  2213, 1090, 4075, 4119, 1564, 1610, 26108, 2408, 18310, 18312,
  1120, 1122, 1487, 1489, 4021, 2523, 2586, 2867, 4007, 4013,
];
const FALLBACK_MUSIC_URLS = [
  "https://assets.mixkit.co/music/872/872.mp3",
  "https://assets.mixkit.co/music/738/738.mp3",
  "https://assets.mixkit.co/music/740/740.mp3",
  "https://assets.mixkit.co/music/873/873.mp3",
  "https://assets.mixkit.co/music/741/741.mp3",
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const UA      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const REFERER = "https://mixkit.co/";

function toSlug(kw: string): string {
  return kw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Referer": REFERER },
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? res.text() : "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Parallel HEAD verification — only keeps IDs/URLs that actually return 200
// ---------------------------------------------------------------------------
async function verifyVideoIds(ids: number[], need: number): Promise<number[]> {
  const checks = ids.slice(0, need * 5).map(async id => {
    try {
      const r = await fetch(
        `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
        { method: "HEAD", headers: { "User-Agent": UA, "Referer": REFERER }, signal: AbortSignal.timeout(5_000) },
      );
      return r.ok ? id : null;
    } catch {
      return null;
    }
  });
  const results = await Promise.all(checks);
  return (results.filter(Boolean) as number[]).slice(0, need);
}

async function verifyMusicUrls(urls: string[], need: number): Promise<string[]> {
  const checks = urls.slice(0, need * 4).map(async url => {
    try {
      const r = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": UA, "Referer": REFERER },
        signal: AbortSignal.timeout(5_000),
      });
      return r.ok ? url : null;
    } catch {
      return null;
    }
  });
  const results = await Promise.all(checks);
  return (results.filter(Boolean) as string[]).slice(0, need);
}

// ---------------------------------------------------------------------------
// Parse video IDs from Mixkit HTML
// ---------------------------------------------------------------------------
function parseVideoIds(html: string): number[] {
  const seen = new Set<number>();
  for (const m of html.matchAll(/assets\.mixkit\.co\/videos\/(\d+)/g)) {
    seen.add(parseInt(m[1], 10));
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Parse music MP3 URLs from Mixkit HTML
// ---------------------------------------------------------------------------
function parseMusicUrls(html: string): string[] {
  const seen = new Set<string>();
  for (const m of html.matchAll(/"(https:\/\/assets\.mixkit\.co\/music\/\d+\/\d+\.mp3)"/g)) {
    seen.add(m[1]);
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Public: search videos by keyword list — returns verified Mixkit video IDs
// ---------------------------------------------------------------------------
export async function searchMixkitVideos(keywords: string[], count: number): Promise<number[]> {
  const candidateSet = new Set<number>();

  // Scrape each keyword page (parallel for speed)
  const scrapes = keywords.slice(0, 5).map(async kw => {
    const slug = toSlug(kw);
    if (!slug) return;

    const cached = videoCache.get(slug);
    if (cached && cached.expires > Date.now()) {
      cached.data.forEach(id => candidateSet.add(id));
      return;
    }

    // Try category page first, then a broader search path
    const [html1, html2] = await Promise.all([
      fetchHtml(`https://mixkit.co/free-stock-video/${slug}/`),
      fetchHtml(`https://mixkit.co/free-stock-video/${slug}/?page=2`),
    ]);

    const ids = [...new Set([...parseVideoIds(html1), ...parseVideoIds(html2)])];
    videoCache.set(slug, { data: ids, expires: Date.now() + CACHE_TTL });
    ids.forEach(id => candidateSet.add(id));
  });

  await Promise.all(scrapes);

  // If we still don't have enough candidates, scrape the first keyword's parent category
  if (candidateSet.size < count * 2 && keywords.length > 0) {
    const slug = toSlug(keywords[0]);
    const html = await fetchHtml(`https://mixkit.co/free-stock-video/${slug.split("-")[0]}/`);
    parseVideoIds(html).forEach(id => candidateSet.add(id));
  }

  // Add fallback IDs to the pool so we always have candidates
  FALLBACK_VIDEO_IDS.forEach(id => candidateSet.add(id));

  const candidates = [...candidateSet];
  const verified   = await verifyVideoIds(candidates, count);

  // Ultimate safety net: if verification fails entirely, return unverified fallbacks
  if (verified.length === 0) return FALLBACK_VIDEO_IDS.slice(0, count);
  if (verified.length < count) {
    // Pad with fallbacks not already in verified set
    const verSet = new Set(verified);
    for (const id of FALLBACK_VIDEO_IDS) {
      if (verified.length >= count) break;
      if (!verSet.has(id)) verified.push(id);
    }
  }

  return verified;
}

// ---------------------------------------------------------------------------
// Public: search music by keyword list — returns a single verified MP3 URL
// ---------------------------------------------------------------------------
export async function searchMixkitMusic(keywords: string[]): Promise<string> {
  const candidateUrls: string[] = [];

  for (const kw of keywords.slice(0, 4)) {
    const slug = toSlug(kw);
    if (!slug) continue;

    const cached = musicCache.get(slug);
    if (cached && cached.expires > Date.now()) {
      candidateUrls.push(...cached.data);
      continue;
    }

    const html = await fetchHtml(`https://mixkit.co/free-stock-music/${slug}/`);
    const urls = parseMusicUrls(html);
    musicCache.set(slug, { data: urls, expires: Date.now() + CACHE_TTL });
    candidateUrls.push(...urls);
  }

  // Deduplicate
  const unique = [...new Set(candidateUrls)];

  if (unique.length > 0) {
    const verified = await verifyMusicUrls(unique, 3);
    if (verified.length > 0) {
      // Return a random one for variety
      return verified[Math.floor(Math.random() * verified.length)];
    }
  }

  // Fallback: one of the known-good tracks
  return FALLBACK_MUSIC_URLS[Math.floor(Math.random() * FALLBACK_MUSIC_URLS.length)];
}

// ---------------------------------------------------------------------------
// Public: search SFX — Mixkit SFX CDN is gated (403), so we return null
// and let the caller synthesize SFX via ffmpeg aevalsrc
// ---------------------------------------------------------------------------
export async function searchMixkitSfx(_keywords: string[]): Promise<string | null> {
  return null; // Mixkit SFX requires login; caller uses synthetic aevalsrc instead
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------
export function clearMixkitCache(): void {
  videoCache.clear();
  musicCache.clear();
}
