#!/usr/bin/env python3
"""
create_clip.py — Cut a clip from a video, apply face-centered crop,
                 burn captions, and output a ready-to-download MP4.

Usage:
  python3 create_clip.py '<json_input>'

JSON input fields:
  input_video   : str  — path to source video file
  output_path   : str  — path for output MP4
  start_time    : str  — e.g. "00:01:23"
  end_time      : str  — e.g. "00:02:45"
  aspect_ratio  : str  — "9:16" | "1:1" | "16:9"
  caption_style : str  — "Bold Yellow" | "White Outline" | "Minimal" | "Cinematic" | "Neon" | "Fire"
  hook          : str  — short hook text to display
  captions      : list — [{start: float, end: float, text: str}] (relative secs from clip start)
"""

import sys, json, subprocess, os, tempfile, math

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
    entries = []
    idx = 1

    # Hook at very beginning (first 3 seconds or 20% of clip, whichever shorter)
    hook_end = min(3.0, clip_duration * 0.20)
    if hook:
        entries.append(f"{idx}\n{seconds_to_srt(0.0)} --> {seconds_to_srt(hook_end)}\n{hook}\n")
        idx += 1

    for cap in captions:
        s = max(0.0, float(cap.get("start", 0)))
        e = min(float(cap.get("end", s + 4)), clip_duration)
        if e <= s:
            continue
        text = str(cap.get("text", "")).strip()
        if not text:
            continue
        # Wrap long lines
        words = text.split()
        lines, cur = [], []
        for w in words:
            cur.append(w)
            if len(" ".join(cur)) > 42:
                lines.append(" ".join(cur[:-1]))
                cur = [w]
        if cur:
            lines.append(" ".join(cur))
        wrapped = "\n".join(lines[:3])  # max 3 lines
        entries.append(f"{idx}\n{seconds_to_srt(s)} --> {seconds_to_srt(e)}\n{wrapped}\n")
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

def detect_face_crop(input_path, target_w, target_h, start_sec):
    """Sample a frame, detect face, return (x, y, w, h) crop params."""
    try:
        import cv2
        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_idx = int(start_sec * fps) + int(fps * 1.5)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return None

        src_h, src_w = frame.shape[:2]
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

        # Compute scale to fit target into source
        scale = min(src_w / target_w, src_h / target_h)
        crop_w = int(target_w * scale)
        crop_h = int(target_h * scale)

        if len(faces) > 0:
            fx, fy, fw, fh = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
            face_cx = fx + fw // 2
            face_cy = fy + fh // 2
            cx = max(crop_w // 2, min(src_w - crop_w // 2, face_cx))
            cy = max(crop_h // 2, min(src_h - crop_h // 2, face_cy))
        else:
            cx, cy = src_w // 2, src_h // 2

        x = cx - crop_w // 2
        y = cy - crop_h // 2
        return (x, y, crop_w, crop_h, src_w, src_h)
    except Exception:
        return None

def run(data):
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
    tmp_dir = os.path.dirname(output_path)
    os.makedirs(tmp_dir, exist_ok=True)

    # ── Step 1: Cut raw clip ─────────────────────────────────────────────────
    raw_clip = os.path.join(tmp_dir, "raw.mp4")
    subprocess.run([
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-to", str(end_sec),
        "-i", input_video,
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "fast", "-crf", "23",
        "-avoid_negative_ts", "1",
        raw_clip,
    ], check=True, capture_output=True)

    # ── Step 2: Probe dimensions of raw clip ─────────────────────────────────
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json", raw_clip,
    ], capture_output=True, text=True)
    probe_data = json.loads(probe.stdout)
    src_w = probe_data["streams"][0]["width"]
    src_h = probe_data["streams"][0]["height"]

    # ── Step 3: Crop to aspect ratio (face-centered if possible) ────────────
    cropped = os.path.join(tmp_dir, "cropped.mp4")
    scale   = min(src_w / target_w, src_h / target_h)
    crop_w  = int(target_w * scale)
    crop_h  = int(target_h * scale)

    face_info = detect_face_crop(raw_clip, target_w, target_h, 0)
    if face_info:
        x, y, crop_w, crop_h, _, _ = face_info
    else:
        x = (src_w - crop_w) // 2
        y = max(0, int(src_h * 0.10))  # slightly above center

    x = max(0, min(x, src_w - crop_w))
    y = max(0, min(y, src_h - crop_h))

    subprocess.run([
        "ffmpeg", "-y",
        "-i", raw_clip,
        "-vf", f"crop={crop_w}:{crop_h}:{x}:{y},scale={target_w}:{target_h}:flags=lanczos",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "fast", "-crf", "22",
        cropped,
    ], check=True, capture_output=True)

    # ── Step 4: Generate SRT captions ────────────────────────────────────────
    srt_path = os.path.join(tmp_dir, "captions.srt")
    srt_content = make_srt(captions, hook, clip_duration)
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)

    # ── Step 5: Burn captions ─────────────────────────────────────────────────
    style = CAPTION_STYLES.get(caption_style, CAPTION_STYLES["Bold Yellow"])
    # Escape path for FFmpeg filtergraph
    safe_srt = srt_path.replace("\\", "/").replace(":", "\\:")

    subprocess.run([
        "ffmpeg", "-y",
        "-i", cropped,
        "-vf", f"subtitles={safe_srt}:force_style='{style}'",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "fast", "-crf", "22",
        output_path,
    ], check=True, capture_output=True)

    # Cleanup intermediates
    for f in [raw_clip, cropped, srt_path]:
        try: os.remove(f)
        except: pass

    size_mb = round(os.path.getsize(output_path) / 1024 / 1024, 2)
    print(json.dumps({"ok": True, "output": output_path, "size_mb": size_mb,
                      "aspect_ratio": aspect_ratio, "caption_style": caption_style,
                      "duration_sec": round(clip_duration, 1)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: create_clip.py '<json>'"}))
        sys.exit(1)
    try:
        run(json.loads(sys.argv[1]))
    except subprocess.CalledProcessError as e:
        print(json.dumps({"error": f"FFmpeg error: {e.stderr.decode()[-500:] if e.stderr else str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
