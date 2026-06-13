#!/usr/bin/env python3
"""
create_quote_video.py
Creates a stylish quote video: background footage + music + modern typography card overlay.
Usage: python3 create_quote_video.py <quote_text> <bg_video_url> <music_url> <output_path> [aspect_ratio] [language]
"""
import sys
import os
import subprocess
import tempfile
import shutil
import urllib.request
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR     = os.path.join(SCRIPT_DIR, "fonts")
FONT_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# ── Per-script font map ─────────────────────────────────────────────────────────
FONT_MAP = {
    "arabic":     os.path.join(FONTS_DIR, "NotoSansArabic-Bold.ttf"),   # Arabic, Urdu, Persian
    "devanagari": os.path.join(FONTS_DIR, "NotoSerifDevanagari-Bold.ttf"),  # Hindi
    "latin":      os.path.join(FONTS_DIR, "Montserrat-Bold.ttf"),       # English + European
    "cjk":        os.path.join(FONTS_DIR, "NotoSansJP-Regular.otf"),    # Japanese/Chinese/Korean
    "default":    os.path.join(FONTS_DIR, "NotoSansJP-Regular.otf"),    # Fallback (covers most)
}


def detect_script(text: str) -> str:
    """Return dominant Unicode script category for font selection."""
    arabic     = sum(1 for c in text if "\u0600" <= c <= "\u06FF")  # Arabic/Urdu
    devanagari = sum(1 for c in text if "\u0900" <= c <= "\u097F")  # Hindi
    cjk        = sum(1 for c in text if "\u4E00" <= c <= "\u9FFF")  # CJK
    latin      = sum(1 for c in text if c.isascii() and c.isalpha())
    scores = {"arabic": arabic, "devanagari": devanagari, "cjk": cjk, "latin": latin}
    dominant = max(scores, key=scores.get)
    return dominant if scores[dominant] > 0 else "default"


def get_font(size: int, script: str = "default") -> ImageFont.FreeTypeFont:
    path = FONT_MAP.get(script, FONT_MAP["default"])
    if not os.path.exists(path):
        path = FONT_MAP["default"]
    if not os.path.exists(path):
        path = FONT_FALLBACK
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        try:
            return ImageFont.truetype(FONT_FALLBACK, size)
        except Exception:
            return ImageFont.load_default()


def dl(url: str, dest: str, timeout: int = 60):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer":    "https://mixkit.co/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)


def wrap_lines(text: str, font: ImageFont.FreeTypeFont,
               max_width: int, draw: ImageDraw.ImageDraw) -> list[str]:
    """Word-wrap text to fit max_width pixels."""
    words  = text.split()
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        test = " ".join(current + [word])
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines or [text]


# ── Card Overlay ───────────────────────────────────────────────────────────────

# Color palette — dark card + gold accents + white text
CARD_BG      = (8,  12,  24, 210)   # near-black, 82 % opaque
GOLD         = (255, 193,  7, 255)  # amber / gold
GOLD_DIM     = (255, 193,  7, 180)
WHITE        = (255, 255, 255, 250)
SHADOW       = (0,   0,   0,  160)
ACCENT_LINE  = (255, 193,  7, 220)


def draw_rounded_rect(draw: ImageDraw.ImageDraw, xy: tuple,
                      radius: int, fill: tuple):
    x0, y0, x1, y1 = xy
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.ellipse([x0, y0, x0 + 2*radius, y0 + 2*radius], fill=fill)
    draw.ellipse([x1 - 2*radius, y0, x1, y0 + 2*radius], fill=fill)
    draw.ellipse([x0, y1 - 2*radius, x0 + 2*radius, y1], fill=fill)
    draw.ellipse([x1 - 2*radius, y1 - 2*radius, x1, y1], fill=fill)


def create_overlay(quote: str, author: str, w: int, h: int) -> Image.Image:
    """
    Returns a transparent RGBA image (w×h) with a centered quote card.
    Design: rounded dark card · big gold " " · white body text · gold divider · amber author line.
    Font is chosen automatically by detecting the dominant script in the quote text.
    """
    img  = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── Auto-detect script for language-matched font ───────────────────────────
    script = detect_script(quote + " " + author)

    # ── Font sizes ─────────────────────────────────────────────────────────────
    ref          = min(w, h)
    qmark_size   = max(100, int(ref * 0.10))   # decorative " "
    body_size    = max(40,  int(ref * 0.048))  # quote body
    author_size  = max(28,  int(ref * 0.030))  # author / attribution

    font_qmark  = get_font(qmark_size, "latin")   # curly quote always looks best in Latin font
    font_body   = get_font(body_size,  script)
    font_author = get_font(author_size, script)

    # ── Safe margins & card width ──────────────────────────────────────────────
    side_mg  = int(w * 0.08)                   # 8 % each side
    card_w   = w - 2 * side_mg
    inner_mg = int(w * 0.055)                  # inner horizontal padding
    text_w   = card_w - 2 * inner_mg

    # ── Wrap text ──────────────────────────────────────────────────────────────
    lines     = wrap_lines(quote, font_body, text_w, draw)
    line_gap  = int(body_size * 0.40)
    line_step = body_size + line_gap

    # ── Measure total card height ──────────────────────────────────────────────
    qmark_h      = qmark_size + int(qmark_size * 0.10)
    body_h       = len(lines) * line_step
    divider_h    = int(ref * 0.025)
    author_h     = (author_size + int(author_size * 0.4)) if author else 0
    pad_v        = int(h * 0.045)

    card_h  = pad_v + qmark_h + body_h + divider_h + author_h + pad_v
    card_x  = side_mg
    card_y  = (h - card_h) // 2

    # ── Draw card background (rounded rect on separate layer, then paste) ──────
    card_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cd         = ImageDraw.Draw(card_layer)
    radius     = int(ref * 0.022)
    draw_rounded_rect(cd,
                      (card_x, card_y, card_x + card_w, card_y + card_h),
                      radius, CARD_BG)

    # Gold top + bottom border strips
    strip_h = max(5, int(ref * 0.005))
    cd.rectangle([(card_x + radius, card_y),
                  (card_x + card_w - radius, card_y + strip_h)],
                 fill=GOLD)
    cd.rectangle([(card_x + radius, card_y + card_h - strip_h),
                  (card_x + card_w - radius, card_y + card_h)],
                 fill=GOLD)

    img = Image.alpha_composite(img, card_layer)
    draw = ImageDraw.Draw(img)

    # ── Decorative opening quote mark ──────────────────────────────────────────
    qmark   = "\u201c"
    qm_bbox = draw.textbbox((0, 0), qmark, font=font_qmark)
    qm_w    = qm_bbox[2] - qm_bbox[0]
    qm_x    = card_x + (card_w - qm_w) // 2
    qm_y    = card_y + pad_v - int(qmark_size * 0.05)
    draw.text((qm_x, qm_y), qmark, font=font_qmark, fill=GOLD_DIM)

    # ── Quote body lines ────────────────────────────────────────────────────────
    ty = card_y + pad_v + qmark_h - int(body_size * 0.30)
    for line in lines:
        lb   = draw.textbbox((0, 0), line, font=font_body)
        lw   = lb[2] - lb[0]
        tx   = card_x + (card_w - lw) // 2
        # shadow
        draw.text((tx + 2, ty + 2), line, font=font_body, fill=SHADOW)
        # main text
        draw.text((tx,     ty    ), line, font=font_body, fill=WHITE)
        ty += line_step

    # ── Gold divider line ───────────────────────────────────────────────────────
    ty        += int(line_gap * 0.8)
    div_len    = int(card_w * 0.38)
    div_x      = card_x + (card_w - div_len) // 2
    div_thick  = max(2, int(ref * 0.003))
    draw.rectangle([(div_x, ty), (div_x + div_len, ty + div_thick)],
                   fill=ACCENT_LINE)
    ty += div_thick + int(ref * 0.015)

    # ── Author / attribution ────────────────────────────────────────────────────
    if author:
        atext = f"\u2014 {author}"
        ab    = draw.textbbox((0, 0), atext, font=font_author)
        aw    = ab[2] - ab[0]
        ax    = card_x + (card_w - aw) // 2
        draw.text((ax + 1, ty + 1), atext, font=font_author, fill=SHADOW)
        draw.text((ax,     ty    ), atext, font=font_author, fill=GOLD)

    return img


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 5:
        print("Usage: create_quote_video.py <quote> <bg_url> <music_url> <output> [aspect] [language]",
              file=sys.stderr)
        sys.exit(1)

    quote     = sys.argv[1]
    bg_url    = sys.argv[2]
    music_url = sys.argv[3]
    output    = sys.argv[4]
    aspect    = sys.argv[5] if len(sys.argv) > 5 else "9:16"
    # language  = sys.argv[6] if len(sys.argv) > 6 else "English"  # reserved

    if aspect == "9:16":
        w, h = 1080, 1920
    elif aspect == "1:1":
        w, h = 1080, 1080
    else:
        w, h = 1920, 1080

    duration = 30

    # Split "Quote text - Author Name" if present
    author = ""
    if " - " in quote:
        parts  = quote.rsplit(" - ", 1)
        quote  = parts[0].strip()
        author = parts[1].strip()

    tmp_dir     = tempfile.mkdtemp(prefix="qvid_")
    tmp_video   = os.path.join(tmp_dir, "bg.mp4")
    tmp_music   = os.path.join(tmp_dir, "music.mp3")
    tmp_overlay = os.path.join(tmp_dir, "overlay.png")

    try:
        print("Downloading bg video…", file=sys.stderr)
        dl(bg_url,    tmp_video)
        print("Downloading music…",   file=sys.stderr)
        dl(music_url, tmp_music)

        print("Creating quote card overlay…", file=sys.stderr)
        overlay = create_overlay(quote, author, w, h)
        overlay.save(tmp_overlay, "PNG")

        # ── FFmpeg: bg video (darkened) + PNG overlay + looped music ────────────
        filter_complex = (
            f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},"
            f"eq=brightness=-0.18:saturation=0.72[bg];"
            f"[bg][1:v]overlay=0:0:format=auto,format=yuv420p[out]"
        )

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", tmp_video,
            "-i", tmp_overlay,
            "-stream_loop", "-1", "-i", tmp_music,
            "-t", str(duration),
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-map", "2:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            output,
        ]

        print("Running FFmpeg…", file=sys.stderr)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            print(f"FFmpeg stderr:\n{result.stderr[-4000:]}", file=sys.stderr)
            sys.exit(1)

        size_mb = round(os.path.getsize(output) / 1024 / 1024, 2)
        print(f"OK:{output}:{size_mb}MB")

    except urllib.request.URLError as e:
        print(f"Download failed: {e}", file=sys.stderr)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print("FFmpeg timed out (180s)", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        import traceback
        print(f"ERROR: {e}\n{traceback.format_exc()}", file=sys.stderr)
        sys.exit(1)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
