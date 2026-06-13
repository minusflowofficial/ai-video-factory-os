#!/usr/bin/env python3
"""
create_quote_video.py
Usage: python3 create_quote_video.py <quote_text> <bg_video_url> <music_url> <output_path> [aspect_ratio]
Creates a stylish quote video with background footage, music, and centered text.
"""
import sys
import os
import subprocess
import tempfile
import textwrap
import shutil
import urllib.request


def dl(url: str, dest: str, timeout: int = 45):
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
        print("Usage: create_quote_video.py <quote> <bg_url> <music_url> <output> [aspect]", file=sys.stderr)
        sys.exit(1)

    quote     = sys.argv[1]
    bg_url    = sys.argv[2]
    music_url = sys.argv[3]
    output    = sys.argv[4]
    aspect    = sys.argv[5] if len(sys.argv) > 5 else "9:16"

    if aspect == "9:16":
        w, h = 720, 1280
    elif aspect == "1:1":
        w, h = 720, 720
    else:
        w, h = 1280, 720

    duration  = 30
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font_size = max(40, int(w * 0.065))
    # Narrower wrap for portrait, wider for landscape
    chars_per_line = 22 if w <= 720 else 38

    tmp_dir   = tempfile.mkdtemp(prefix="qvid_")
    tmp_video = os.path.join(tmp_dir, "bg.mp4")
    tmp_music = os.path.join(tmp_dir, "music.mp3")

    try:
        # Download assets
        dl(bg_url,    tmp_video)
        dl(music_url, tmp_music)

        # Wrap text — FFmpeg drawtext uses \n for newlines
        lines   = textwrap.wrap(quote, chars_per_line)
        wrapped = "\\n".join(lines)
        esc     = esc_drawtext(wrapped)

        # Video filter: scale/crop → dark vignette → quote text (shadow layer + main layer)
        vf = (
            f"scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},"
            # Darken edges for readability (box blur trick via colorchannelmixer not needed; use eq)
            f"eq=brightness=-0.18:saturation=0.8,"
            # Shadow layer (black, offset 4px)
            f"drawtext="
            f"fontfile={font_path}:"
            f"text='{esc}':"
            f"fontsize={font_size}:"
            f"fontcolor=black:"
            f"x=(w-tw)/2+4:"
            f"y=(h-th)/2+4:"
            f"line_spacing=14,"
            # Box + main text (golden yellow, white border via two passes)
            f"drawtext="
            f"fontfile={font_path}:"
            f"text='{esc}':"
            f"fontsize={font_size}:"
            f"fontcolor=0xFFD700:"
            f"x=(w-tw)/2:"
            f"y=(h-th)/2:"
            f"box=1:"
            f"boxcolor=0x0d0d0d@0.72:"
            f"boxborderw=28:"
            f"line_spacing=14"
        )

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", tmp_video,
            "-stream_loop", "-1", "-i", tmp_music,
            "-t", str(duration),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "26",
            "-c:a", "aac", "-b:a", "128k",
            "-map", "0:v", "-map", "1:a",
            "-shortest",
            output,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=150)
        if result.returncode != 0:
            print(result.stderr[-2000:], file=sys.stderr)
            sys.exit(1)

        print(f"OK:{output}")

    except Exception as e:
        print(f"ERROR:{e}", file=sys.stderr)
        sys.exit(1)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
