#!/usr/bin/env python3
"""
create_clip.py — Cut a clip, crop, burn captions → ready-to-download MP4.

Optimized for speed: ultrafast preset, no OpenCV, center crop only.

JSON input:
  input_video   : str  — path to source video
  output_path   : str  — output MP4 path
  start_time    : str  — e.g. "00:01:23"
  end_time      : str  — e.g. "00:02:45"
  aspect_ratio  : str  — "9:16" | "1:1" | "16:9"
  caption_style : str  — style name
  hook          : str  — short hook text
  captions      : list — [{start: float, end: float, text: str}]
"""

import sys, json, subprocess, os

def time_to_seconds(t: str) -> float:
    parts = t.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])

def seconds_to_srt(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    ms = int((sec - int(sec)) * 1000)
    return f"{h:02d}:{m:02d}:{int(sec):02d},{ms:03d}"

def make_srt(captions: list, hook: str, clip_duration: float) -> str:
    entries, idx = [], 1
    if hook:
        hook_end = min(3.0, clip_duration * 0.20)
        entries.append(f"{idx}\n{seconds_to_srt(0.0)} --> {seconds_to_srt(hook_end)}\n{hook}\n")
        idx += 1
    for cap in captions:
        s = max(0.0, float(cap.get("start", 0)))
        e = min(float(cap.get("end", s + 4)), clip_duration)
        if e <= s: continue
        text = str(cap.get("text", "")).strip()
        if not text: continue
        words = text.split()
        lines, cur = [], []
        for w in words:
            cur.append(w)
            if len(" ".join(cur)) > 42:
                lines.append(" ".join(cur[:-1]))
                cur = [w]
        if cur: lines.append(" ".join(cur))
        entries.append(f"{idx}\n{seconds_to_srt(s)} --> {seconds_to_srt(e)}\n{chr(10).join(lines[:3])}\n")
        idx += 1
    return "\n".join(entries)

CAPTION_STYLES = {
    "Bold Yellow":   "Fontsize=28,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,Outline=3,Shadow=1,Alignment=2",
    "White Outline": "Fontsize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Bold=1,Outline=3,Alignment=2",
    "Minimal":       "Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,Alignment=2",
    "Cinematic":     "Fontsize=26,PrimaryColour=&H00FFFFFF,BackColour=&HAA000000,Bold=1,BorderStyle=4,Alignment=2",
    "Neon":          "Fontsize=28,PrimaryColour=&H0088FF00,OutlineColour=&H0088FF00,Bold=1,Outline=3,Shadow=1,Alignment=2",
    "Fire":          "Fontsize=28,PrimaryColour=&H000045FF,OutlineColour=&H000000CC,Bold=1,Outline=3,Alignment=2",
}

ASPECT_CONFIGS = {
    "9:16":  (1080, 1920),
    "1:1":   (1080, 1080),
    "16:9":  (1920, 1080),
}

def probe_dimensions(path: str):
    r = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json", path,
    ], capture_output=True, text=True)
    d = json.loads(r.stdout)
    return d["streams"][0]["width"], d["streams"][0]["height"]

def run(data: dict):
    input_video   = data["input_video"]
    output_path   = data["output_path"]
    start_time    = data["start_time"]
    end_time      = data["end_time"]
    aspect_ratio  = data.get("aspect_ratio", "9:16")
    caption_style = data.get("caption_style", "Bold Yellow")
    hook          = data.get("hook", "")
    captions      = data.get("captions", [])

    start_sec     = time_to_seconds(start_time)
    end_sec       = time_to_seconds(end_time)
    clip_duration = max(1.0, end_sec - start_sec)

    target_w, target_h = ASPECT_CONFIGS.get(aspect_ratio, (1080, 1920))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tmp_dir = os.path.dirname(output_path)

    # ── Step 1: Fast cut (stream copy first for speed, then re-encode) ─────────
    raw_clip = os.path.join(tmp_dir, "raw.mp4")
    subprocess.run([
        "ffmpeg", "-y",
        "-ss", str(start_sec),   # seek BEFORE -i for speed
        "-to", str(end_sec),
        "-i", input_video,
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast",  # fastest encoding
        "-crf", "26",
        "-avoid_negative_ts", "1",
        "-threads", "0",         # use all CPU cores
        raw_clip,
    ], check=True, capture_output=True)

    # ── Step 2: Probe dimensions ───────────────────────────────────────────────
    src_w, src_h = probe_dimensions(raw_clip)

    # ── Step 3: Center crop to aspect ratio (no OpenCV for speed) ─────────────
    cropped = os.path.join(tmp_dir, "cropped.mp4")
    scale   = min(src_w / target_w, src_h / target_h)
    crop_w  = int(target_w * scale)
    crop_h  = int(target_h * scale)
    x = (src_w - crop_w) // 2
    y = max(0, int(src_h * 0.10))   # slightly above center (face-friendly default)
    x = max(0, min(x, src_w - crop_w))
    y = max(0, min(y, src_h - crop_h))

    subprocess.run([
        "ffmpeg", "-y",
        "-i", raw_clip,
        "-vf", f"crop={crop_w}:{crop_h}:{x}:{y},scale={target_w}:{target_h}:flags=bilinear",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26",
        "-threads", "0",
        cropped,
    ], check=True, capture_output=True)

    # ── Step 4: Generate SRT ───────────────────────────────────────────────────
    srt_path = os.path.join(tmp_dir, "captions.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(make_srt(captions, hook, clip_duration))

    # ── Step 5: Burn captions ──────────────────────────────────────────────────
    style    = CAPTION_STYLES.get(caption_style, CAPTION_STYLES["Bold Yellow"])
    safe_srt = srt_path.replace("\\", "/").replace(":", "\\:")

    subprocess.run([
        "ffmpeg", "-y",
        "-i", cropped,
        "-vf", f"subtitles={safe_srt}:force_style='{style}'",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26",
        "-threads", "0",
        output_path,
    ], check=True, capture_output=True)

    for f in [raw_clip, cropped, srt_path]:
        try: os.remove(f)
        except: pass

    size_mb = round(os.path.getsize(output_path) / 1024 / 1024, 2)
    print(json.dumps({"ok": True, "output": output_path, "size_mb": size_mb,
                      "duration_sec": round(clip_duration, 1)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: create_clip.py '<json>'"}))
        sys.exit(1)
    try:
        run(json.loads(sys.argv[1]))
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode()[-600:] if e.stderr else str(e)
        print(json.dumps({"error": f"FFmpeg error: {err}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
