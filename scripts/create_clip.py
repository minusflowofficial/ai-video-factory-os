#!/usr/bin/env python3
"""
create_clip.py — Cut, crop, burn captions → ready MP4.

Caption approach:
  - ASS format with explicit PlayResX/Y so font sizes are PIXEL-ACCURATE.
  - Hook title: large bold text at TOP (Alignment=8) for first 3 s.
  - Body captions: 2-3 word bubbles at BOTTOM (Alignment=2) synced to voice.
  - MarginV keeps every line safely inside the frame.
"""

import sys, json, subprocess, os

# ── Helpers ────────────────────────────────────────────────────────────────────

def time_to_seconds(t: str) -> float:
    parts = t.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])

def ass_ts(s: float) -> str:
    """Seconds → ASS timestamp  H:MM:SS.cc"""
    s = max(0.0, s)
    h  = int(s // 3600)
    m  = int((s % 3600) // 60)
    sc = s % 60
    cs = int(round((sc - int(sc)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{int(sc):02d}.{cs:02d}"

# ── ASS color: &HAABBGGRR ──────────────────────────────────────────────────────
# style → (primaryColour, outlineColour, outline_px, backColour, borderStyle)
STYLE_DEFS = {
    "Bold Yellow":   ("&H0000FFFF", "&H00000000", 5, "&H00000000", 1),
    "White Outline": ("&H00FFFFFF", "&H00000000", 4, "&H00000000", 1),
    "Minimal":       ("&H00FFFFFF", "&H00000000", 2, "&H00000000", 1),
    "Cinematic":     ("&H00FFFFFF", "&H00000000", 3, "&HAA000000", 3),
    "Neon":          ("&H0000FF88", "&H00000000", 4, "&H00000000", 1),
    "Fire":          ("&H000045FF", "&H000000AA", 5, "&H00000000", 1),
}

ASPECT_CONFIGS = {
    "9:16":  (1080, 1920),
    "1:1":   (1080, 1080),
    "16:9":  (1920, 1080),
}

# ── ASS file builder ───────────────────────────────────────────────────────────

def make_ass(captions: list, hook: str, clip_duration: float,
             target_w: int, target_h: int, cap_style: str) -> str:
    # Font sizes relative to resolution so they always fit inside frame
    ref      = min(target_w, target_h)          # reference dimension
    hook_fs  = max(44, int(ref * 0.068))        # ~6.8% of ref  (big, readable)
    cap_fs   = max(36, int(ref * 0.052))        # ~5.2% of ref  (comfortable)
    top_mg   = max(40,  int(target_h * 0.035))  # 3.5% from top edge
    bot_mg   = max(80,  int(target_h * 0.06))   # 6%   from bottom edge

    pri, out_c, outline_w, back, bstyle = STYLE_DEFS.get(
        cap_style, STYLE_DEFS["Bold Yellow"]
    )
    shadow = 1 if bstyle == 1 else 0

    header = f"""\
[Script Info]
ScriptType: v4.00+
PlayResX: {target_w}
PlayResY: {target_h}
ScaledBorderAndShadow: yes
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HookTop,Arial,{hook_fs},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,5,1,8,50,50,{top_mg},1
Style: Caption,Arial,{cap_fs},{pri},&H000000FF,{out_c},{back},1,0,0,0,100,100,0,0,{bstyle},{outline_w},{shadow},2,50,50,{bot_mg},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events = []

    # Hook at top — show for first 3 s or 20% of clip
    if hook:
        hook_end = min(3.5, clip_duration * 0.20)
        safe_hook = hook.replace("\n", " ").replace(",", "，")
        events.append(
            f"Dialogue: 0,{ass_ts(0)},{ass_ts(hook_end)},HookTop,,0,0,0,,{safe_hook}"
        )

    # Body captions — break into 3-word bubbles
    for cap in captions:
        s    = max(0.0, float(cap.get("start", 0)))
        e    = min(float(cap.get("end", s + 4)), clip_duration)
        text = str(cap.get("text", "")).strip()
        if not text or e <= s:
            continue

        words = text.split()
        if not words:
            continue

        chunk_size = 3
        chunks = [" ".join(words[i:i+chunk_size])
                  for i in range(0, len(words), chunk_size)]

        seg_dur    = e - s
        chunk_dur  = seg_dur / max(1, len(chunks))

        for i, chunk in enumerate(chunks):
            cs = s + i * chunk_dur
            ce = s + (i + 1) * chunk_dur
            # Uppercase for bold-impact styles
            display = chunk.upper() if cap_style in ("Bold Yellow", "Fire") else chunk
            safe    = display.replace(",", "，")
            events.append(
                f"Dialogue: 0,{ass_ts(cs)},{ass_ts(ce)},Caption,,0,0,0,,{safe}"
            )

    return header + "\n".join(events)


# ── ffprobe ────────────────────────────────────────────────────────────────────

def probe_dimensions(path: str):
    r = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json", path,
    ], capture_output=True, text=True)
    d = json.loads(r.stdout)
    return d["streams"][0]["width"], d["streams"][0]["height"]


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run(data: dict):
    input_video   = data["input_video"]
    output_path   = data["output_path"]
    start_time    = data["start_time"]
    end_time      = data["end_time"]
    aspect_ratio  = data.get("aspect_ratio",  "9:16")
    caption_style = data.get("caption_style", "Bold Yellow")
    hook          = data.get("hook",          "")
    captions      = data.get("captions",      [])

    start_sec     = time_to_seconds(start_time)
    end_sec       = time_to_seconds(end_time)
    clip_duration = max(1.0, end_sec - start_sec)

    target_w, target_h = ASPECT_CONFIGS.get(aspect_ratio, (1080, 1920))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tmp_dir = os.path.dirname(output_path)

    # ── 1: Fast cut ────────────────────────────────────────────────────────────
    raw_clip = os.path.join(tmp_dir, "raw.mp4")
    subprocess.run([
        "ffmpeg", "-y",
        "-ss", str(start_sec), "-to", str(end_sec),
        "-i", input_video,
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26",
        "-avoid_negative_ts", "1", "-threads", "0",
        raw_clip,
    ], check=True, capture_output=True)

    # ── 2: Probe dimensions ────────────────────────────────────────────────────
    src_w, src_h = probe_dimensions(raw_clip)

    # ── 3: Crop + scale to target aspect ratio ─────────────────────────────────
    cropped = os.path.join(tmp_dir, "cropped.mp4")
    scale   = min(src_w / target_w, src_h / target_h)
    crop_w  = int(target_w * scale)
    crop_h  = int(target_h * scale)
    cx      = (src_w - crop_w) // 2
    cy      = max(0, int(src_h * 0.10))
    cx      = max(0, min(cx, src_w - crop_w))
    cy      = max(0, min(cy, src_h - crop_h))

    subprocess.run([
        "ffmpeg", "-y",
        "-i", raw_clip,
        "-vf", f"crop={crop_w}:{crop_h}:{cx}:{cy},scale={target_w}:{target_h}:flags=bilinear",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26", "-threads", "0",
        cropped,
    ], check=True, capture_output=True)

    # ── 4: Write ASS captions ──────────────────────────────────────────────────
    ass_path = os.path.join(tmp_dir, "captions.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(make_ass(captions, hook, clip_duration,
                         target_w, target_h, caption_style))

    # ── 5: Burn captions via subtitles filter ──────────────────────────────────
    # Escape colons in path for ffmpeg filter syntax (Windows-safe too)
    safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")

    subprocess.run([
        "ffmpeg", "-y",
        "-i", cropped,
        "-vf", f"subtitles={safe_ass}",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26", "-threads", "0",
        output_path,
    ], check=True, capture_output=True)

    for f in [raw_clip, cropped, ass_path]:
        try:
            os.remove(f)
        except Exception:
            pass

    size_mb = round(os.path.getsize(output_path) / 1024 / 1024, 2)
    print(json.dumps({
        "ok":           True,
        "output":       output_path,
        "size_mb":      size_mb,
        "duration_sec": round(clip_duration, 1),
    }))


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: create_clip.py '<json>'"}))
        sys.exit(1)
    try:
        run(json.loads(sys.argv[1]))
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode()[-800:] if e.stderr else str(e)
        print(json.dumps({"error": f"FFmpeg error: {err}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
