#!/usr/bin/env python3
"""
create_quote_video.py
Usage: python3 create_quote_video.py <quote_text> <bg_video_url> <music_url> <output_path> [aspect_ratio] [language]
Creates a stylish quote video with background footage, music, and centered text.
Supports all languages (CJK, Arabic, Latin) via Noto Sans CJK JP font.
"""
import sys
import os
import subprocess
import tempfile
import textwrap
import shutil
import urllib.request

SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
FONT_PATH_CJK  = os.path.join(SCRIPT_DIR, "fonts", "NotoSansJP-Regular.otf")
FONT_PATH_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def pick_font(language: str) -> str:
    """Use Noto CJK for all languages if available (covers CJK, Arabic, Latin)."""
    if os.path.exists(FONT_PATH_CJK):
        return FONT_PATH_CJK
    return FONT_PATH_LATIN


def dl(url: str, dest: str, timeout: int = 60):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://mixkit.co/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)


def esc_drawtext(text: str) -> str:
    return (text
        .replace("\\", "\\\\")
        .replace("'",  "\\'")
        .replace(":",  "\\:")
        .replace("[",  "\\[")
        .replace("]",  "\\]")
        .replace("%",  "\\%"))


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
    language  = sys.argv[6] if len(sys.argv) > 6 else "English"

    if aspect == "9:16":
        w, h = 1080, 1920
    elif aspect == "1:1":
        w, h = 1080, 1080
    else:
        w, h = 1920, 1080

    duration  = 30
    font_path = pick_font(language)
    font_size = max(48, int(min(w, h) * 0.060))

    # Narrower wrap for portrait, wider for landscape
    chars_per_line = 24 if w < h else 42

    tmp_dir   = tempfile.mkdtemp(prefix="qvid_")
    tmp_video = os.path.join(tmp_dir, "bg.mp4")
    tmp_music = os.path.join(tmp_dir, "music.mp3")

    try:
        # Download assets
        print(f"Downloading bg video from {bg_url[:60]}...", file=sys.stderr)
        dl(bg_url,    tmp_video)
        print(f"Downloading music from {music_url[:60]}...", file=sys.stderr)
        dl(music_url, tmp_music)

        # Wrap text — FFmpeg drawtext uses \n for newlines
        lines   = textwrap.wrap(quote, chars_per_line)
        wrapped = "\\n".join(lines)
        esc     = esc_drawtext(wrapped)

        line_spacing = max(10, int(font_size * 0.28))

        # Compute vertical centering offset: move text up slightly above true center
        # for visual balance (eye reads upper half first)
        y_offset = int(h * 0.06)

        # Video filter: scale/crop → darken → quote shadow + main text
        vf = (
            f"scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},"
            f"eq=brightness=-0.20:saturation=0.75,"
            # Drop shadow (offset 3px right, 3px down)
            f"drawtext="
            f"fontfile={font_path}:"
            f"text='{esc}':"
            f"fontsize={font_size}:"
            f"fontcolor=0x000000@0.85:"
            f"x=(w-tw)/2+3:"
            f"y=(h-th)/2-{y_offset}+3:"
            f"line_spacing={line_spacing},"
            # Dark semi-transparent backing box + golden main text
            f"drawtext="
            f"fontfile={font_path}:"
            f"text='{esc}':"
            f"fontsize={font_size}:"
            f"fontcolor=0xFFD700:"
            f"x=(w-tw)/2:"
            f"y=(h-th)/2-{y_offset}:"
            f"box=1:"
            f"boxcolor=0x0d0d0d@0.75:"
            f"boxborderw={max(20, int(font_size * 0.55))}:"
            f"line_spacing={line_spacing}"
        )

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", tmp_video,
            "-stream_loop", "-1", "-i", tmp_music,
            "-t", str(duration),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "24",
            "-c:a", "aac", "-b:a", "128k",
            "-map", "0:v", "-map", "1:a",
            "-shortest",
            output,
        ]

        print(f"Running FFmpeg...", file=sys.stderr)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            print(f"FFmpeg stderr: {result.stderr[-3000:]}", file=sys.stderr)
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
