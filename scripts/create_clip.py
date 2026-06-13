#!/usr/bin/env python3
"""
create_clip.py — Cut, crop, burn captions → ready MP4.

Features:
  - Face detection (OpenCV) → smart crop center on face
  - Multi-face-cluster detection: if faces appear in 2 distinct horizontal
    zones (left/right for 9:16 source), generates TWO separate crop outputs
    each following one cluster
  - ASS captions: hook title at TOP, 3-word bubbles at BOTTOM
  - Sizes are pixel-accurate (PlayResX/Y = actual video resolution)
"""

import sys, json, subprocess, os, pathlib

# Directory containing bundled fonts (NotoSansCJKjp-Regular.otf for CJK support)
FONTS_DIR = str(pathlib.Path(__file__).parent / "fonts")

try:
    import cv2
    CV2_OK = True
except ImportError:
    CV2_OK = False

# ── Helpers ────────────────────────────────────────────────────────────────────

def time_to_seconds(t: str) -> float:
    parts = t.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])

def ass_ts(s: float) -> str:
    s = max(0.0, s)
    h  = int(s // 3600)
    m  = int((s % 3600) // 60)
    sc = s % 60
    cs = min(99, int(round((sc - int(sc)) * 100)))
    return f"{h}:{m:02d}:{int(sc):02d}.{cs:02d}"

# ── ASS color &HAABBGGRR ───────────────────────────────────────────────────────
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

# ── Face detection ─────────────────────────────────────────────────────────────

def detect_face_clusters(video_path: str, num_samples: int = 10):
    """
    Sample frames, run face detection, return a list of (cx, cy) face centres.
    Returns (centres_list, src_w, src_h).
    Falls back to empty list if cv2 unavailable or detection fails.
    """
    if not CV2_OK:
        return [], 0, 0
    try:
        cap    = cv2.VideoCapture(video_path)
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        src_w  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        src_h  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)

        centres = []
        sample_indices = [int(total * i / num_samples) for i in range(1, num_samples)]

        for fidx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, fidx)
            ret, frame = cap.read()
            if not ret:
                continue
            small = cv2.resize(frame, (320, int(frame.shape[0] * 320 / frame.shape[1])))
            gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            scale_x = src_w / small.shape[1]
            scale_y = src_h / small.shape[0]
            faces = cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=4, minSize=(20, 20)
            )
            for (fx, fy, fw, fh) in faces:
                cx = int((fx + fw / 2) * scale_x)
                cy = int((fy + fh / 2) * scale_y)
                centres.append((cx, cy))

        cap.release()
        return centres, src_w, src_h
    except Exception:
        return [], 0, 0


def cluster_centres(centres, src_w):
    """
    Partition face centres into left/right clusters based on the frame midpoint.
    Returns (left_centres, right_centres).
    """
    mid   = src_w / 2
    left  = [(cx, cy) for cx, cy in centres if cx < mid]
    right = [(cx, cy) for cx, cy in centres if cx >= mid]
    return left, right


def avg_point(pts):
    if not pts:
        return None
    return (int(sum(p[0] for p in pts) / len(pts)),
            int(sum(p[1] for p in pts) / len(pts)))


def clamp_crop(cx_desired, cy_desired, src_w, src_h, crop_w, crop_h):
    """Centre the crop on (cx_desired, cy_desired) then clamp to frame bounds."""
    x = cx_desired - crop_w // 2
    y = cy_desired - crop_h // 2
    x = max(0, min(x, src_w - crop_w))
    y = max(0, min(y, src_h - crop_h))
    return x, y


# ── ASS subtitle builder ───────────────────────────────────────────────────────

def make_ass(captions, hook, clip_duration, target_w, target_h, cap_style):
    ref     = min(target_w, target_h)
    hook_fs = max(44, int(ref * 0.068))
    cap_fs  = max(36, int(ref * 0.052))
    top_mg  = max(40, int(target_h * 0.035))
    bot_mg  = max(80, int(target_h * 0.060))

    pri, out_c, outline_w, back, bstyle = STYLE_DEFS.get(
        cap_style, STYLE_DEFS["Bold Yellow"]
    )
    shadow = 1 if bstyle == 1 else 0

    header = (
        f"[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {target_w}\nPlayResY: {target_h}\n"
        f"ScaledBorderAndShadow: yes\nWrapStyle: 1\n\n"
        f"[V4+ Styles]\n"
        f"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        f"OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        f"ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        f"Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: HookTop,Noto Sans CJK JP,{hook_fs},&H00FFFFFF,&H000000FF,&H00000000,"
        f"&H00000000,1,0,0,0,100,100,1,0,1,5,1,8,50,50,{top_mg},1\n"
        f"Style: Caption,Noto Sans CJK JP,{cap_fs},{pri},&H000000FF,{out_c},{back},"
        f"1,0,0,0,100,100,0,0,{bstyle},{outline_w},{shadow},2,50,50,{bot_mg},1\n\n"
        f"[Events]\n"
        f"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events = []
    if hook:
        hook_end  = min(3.5, clip_duration * 0.20)
        safe_hook = hook.replace("\n", " ").replace(",", "，")
        events.append(f"Dialogue: 0,{ass_ts(0)},{ass_ts(hook_end)},HookTop,,0,0,0,,{safe_hook}")

    for cap in captions:
        s    = max(0.0, float(cap.get("start", 0)))
        e    = min(float(cap.get("end",   s + 4)), clip_duration)
        text = str(cap.get("text", "")).strip()
        if not text or e <= s:
            continue
        words  = text.split()
        chunks = [" ".join(words[i:i+3]) for i in range(0, len(words), 3)]
        dur    = (e - s) / max(1, len(chunks))
        for i, chunk in enumerate(chunks):
            cs = s + i * dur
            ce = s + (i + 1) * dur
            display = chunk.upper() if cap_style in ("Bold Yellow", "Fire") else chunk
            events.append(
                f"Dialogue: 0,{ass_ts(cs)},{ass_ts(ce)},Caption,,0,0,0,,{display.replace(',','，')}"
            )

    return header + "\n".join(events)


# ── ffprobe ────────────────────────────────────────────────────────────────────

def probe_dimensions(path: str):
    r = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", path,
    ], capture_output=True, text=True)
    d = json.loads(r.stdout)
    return d["streams"][0]["width"], d["streams"][0]["height"]


# ── Encode one crop ────────────────────────────────────────────────────────────

def encode_crop(raw_clip, out_path, cx, cy, crop_w, crop_h,
                target_w, target_h, ass_path, tmp_dir):
    """Crop + scale → burn ASS captions → output MP4."""
    cropped = out_path + "_tmp_crop.mp4"

    subprocess.run([
        "ffmpeg", "-y", "-i", raw_clip,
        "-vf",
        f"crop={crop_w}:{crop_h}:{cx}:{cy},scale={target_w}:{target_h}:flags=bilinear",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26", "-threads", "0",
        cropped,
    ], check=True, capture_output=True)

    safe_ass   = ass_path.replace("\\", "/").replace(":", "\\:")
    safe_fonts = FONTS_DIR.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    subprocess.run([
        "ffmpeg", "-y", "-i", cropped,
        "-vf", f"subtitles={safe_ass}:fontsdir={safe_fonts}",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "ultrafast", "-crf", "26", "-threads", "0",
        out_path,
    ], check=True, capture_output=True)

    try:
        os.remove(cropped)
    except Exception:
        pass


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
    base    = os.path.splitext(output_path)[0]

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

    # ── 3: Compute crop box ────────────────────────────────────────────────────
    scale  = min(src_w / target_w, src_h / target_h)
    crop_w = int(target_w * scale)
    crop_h = int(target_h * scale)

    # ── 4: Face detection → smart crop ────────────────────────────────────────
    centres, _, _ = detect_face_clusters(raw_clip, num_samples=10)

    # Decide whether we have 2 distinct face clusters (for 9:16 only)
    # Threshold: each cluster needs ≥2 detections & clusters are >25% of width apart
    split_output = False
    left_c, right_c = [], []

    if aspect_ratio == "9:16" and centres:
        left_c, right_c = cluster_centres(centres, src_w)
        left_avg  = avg_point(left_c)
        right_avg = avg_point(right_c)
        if (
            left_avg and right_avg
            and len(left_c) >= 2 and len(right_c) >= 2
            and abs(right_avg[0] - left_avg[0]) > src_w * 0.25
        ):
            split_output = True

    # ── 5: Write ASS captions file ─────────────────────────────────────────────
    ass_path = os.path.join(tmp_dir, "captions.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(make_ass(captions, hook, clip_duration,
                         target_w, target_h, caption_style))

    outputs = []

    if split_output:
        # ── Two crops: one per face cluster ──────────────────────────────────
        left_avg  = avg_point(left_c)
        right_avg = avg_point(right_c)

        for label, pt in [("A", left_avg), ("B", right_avg)]:
            face_cx, face_cy = pt
            # Vertically: keep face in upper-third of the 9:16 crop
            face_cy_adj = max(face_cy, int(crop_h * 0.30))
            cx, cy = clamp_crop(face_cx, face_cy_adj, src_w, src_h, crop_w, crop_h)
            out = f"{base}_{label}.mp4"
            encode_crop(raw_clip, out, cx, cy, crop_w, crop_h,
                        target_w, target_h, ass_path, tmp_dir)
            size_mb = round(os.path.getsize(out) / 1024 / 1024, 2)
            outputs.append({"output": out, "size_mb": size_mb,
                            "face_zone": "left" if label == "A" else "right"})
    else:
        # ── Single crop ───────────────────────────────────────────────────────
        if centres:
            all_avg = avg_point(centres)
            face_cx, face_cy = all_avg
            # For 9:16: keep face in upper half of the portrait crop
            if aspect_ratio == "9:16":
                face_cy = max(face_cy, int(crop_h * 0.30))
            cx, cy = clamp_crop(face_cx, face_cy, src_w, src_h, crop_w, crop_h)
        else:
            # Fallback: center crop, slightly above middle (face-friendly)
            cx = (src_w - crop_w) // 2
            cy = max(0, int(src_h * 0.10))
            cx = max(0, min(cx, src_w - crop_w))
            cy = max(0, min(cy, src_h - crop_h))

        encode_crop(raw_clip, output_path, cx, cy, crop_w, crop_h,
                    target_w, target_h, ass_path, tmp_dir)
        size_mb = round(os.path.getsize(output_path) / 1024 / 1024, 2)
        outputs.append({"output": output_path, "size_mb": size_mb,
                        "face_zone": "full"})

    # Cleanup
    for f in [raw_clip, ass_path]:
        try:
            os.remove(f)
        except Exception:
            pass

    print(json.dumps({
        "ok":           True,
        "outputs":      outputs,
        "duration_sec": round(clip_duration, 1),
        # backward-compat fields (first output)
        "output":       outputs[0]["output"],
        "size_mb":      outputs[0]["size_mb"],
    }))


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: create_clip.py '<json>'"}))
        sys.exit(1)
    try:
        run(json.loads(sys.argv[1]))
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode()[-900:] if e.stderr else str(e)
        print(json.dumps({"error": f"FFmpeg error: {err}"}))
        sys.exit(1)
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()[-600:]}))
        sys.exit(1)
