import { Router, type IRouter } from "express";
import { Readable } from "stream";

const router: IRouter = Router();

const ALLOWED_PREFIXES = [
  "https://assets.mixkit.co/",
];

router.get("/proxy/media", async (req, res): Promise<void> => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    res.status(400).json({ error: "url param required" });
    return;
  }

  const allowed = ALLOWED_PREFIXES.some(p => rawUrl.startsWith(p));
  if (!allowed) {
    res.status(403).json({ error: "Domain not allowed" });
    return;
  }

  const dl = req.query.dl === "1";
  const range = req.headers.range;

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: "https://mixkit.co/",
  };
  if (range) upstreamHeaders["Range"] = range;

  try {
    const upstream = await fetch(rawUrl, { headers: upstreamHeaders });
    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status).json({ error: "Upstream error" });
      return;
    }

    const ct = upstream.headers.get("content-type") || "video/mp4";
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");

    res.status(range && cr ? 206 : 200);
    res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400");

    if (dl) {
      const fname = rawUrl.split("/").pop() || "media.mp4";
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    }
    if (cl) res.setHeader("Content-Length", cl);
    if (cr) res.setHeader("Content-Range", cr);

    // Stream body back to client
    // @ts-ignore — Node 18+ accepts web ReadableStream in fromWeb
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).json({ error: "Proxy failed" });
  }
});

export default router;
