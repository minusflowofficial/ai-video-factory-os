#!/usr/bin/env python3
"""
create_clip.py — Cut, crop, burn captions → ready MP4.

Features:
  - Face detection (OpenCV) → smart crop center on face
  - Multi-face-cluster detection: if faces appear in 2 distinct horizontal
    zones (left/right for 9:16 source), generates TWO separate crop outputs
    each following one cluster
  - ASS captions: hook title at TOP, 2-word bubbles at BOTTOM
  - Sizes are pixel-accurate (PlayResX/Y = actual video resolution)
  - Optional SFX: synthetic chime mixed in at clip start
  - show_hook flag: skip burning the hook title overlay when False
  - hook_full_duration: when True, hook title shows for the entire clip
"""

import sys, json, subprocess, os, pathlib

# Directory containing bundled fonts (NotoSansJP-Regular.otf for CJK support)
FONTS_DIR = str(pathlib.Path(__file__).parent / "fonts")

try:
    import cv2
    CV2_OK = True
except ImportError:
    CV2_OK = False

try:
    import mediapipe as mp
    MEDIAPIPE_OK = True
except ImportError:
    MEDIAPIPE_OK = False

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

# ── ASS color tags (&HAABBGGRR — AA=00 opaque, BB/GG/RR = blue/green/red) ────────
# Base = white.  Every 3rd word globally gets one accent colour (Red → Yellow → Green).
# Black thick outline makes every colour pop on any background.
_WHITE   = "c&H00FFFFFF&"   # white — base for most words
_ACCENTS = [
    "c&H000000FF&",  # Red
    "c&H0000FFFF&",  # Yellow
    "c&H0000FF00&",  # Green
]


def colorize_words(text: str, start_idx: int) -> str:
    """
    White base with selective accent pop.
    Every 3rd word (using global start_idx) gets Red / Yellow / Green;
    the rest stay white.  Thick black outline makes every colour readable.
    """
    words  = text.split()
    parts  = []
    # how many accent colours have already been emitted before this chunk
    accent = sum(1 for j in range(start_idx) if j % 3 == 2)
    for i, word in enumerate(words):
        if (start_idx + i) % 3 == 2:
            c      = _ACCENTS[accent % len(_ACCENTS)]
            accent += 1
        else:
            c = _WHITE
        parts.append("{\\%s}%s" % (c, word))
    return " ".join(parts) if parts else text

ASPECT_CONFIGS = {
    "9:16":  (1080, 1920),
    "1:1":   (1080, 1080),
    "16:9":  (1920, 1080),
}

# ── Face detection ─────────────────────────────────────────────────────────────

def detect_face_clusters(video_path: str, num_samples: int = 12):
    """
    Detect face centres using MediaPipe (preferred, deep-learning accuracy)
    with OpenCV Haar-cascade as fallback.
    Returns (centres, src_w, src_h).
    """
    if not CV2_OK:
        return [], 0, 0
    try:
        cap   = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        centres        = []
        sample_indices = [int(total * i / (num_samples + 1)) for i in range(1, num_samples + 1)]

        if MEDIAPIPE_OK:
            mp_face = mp.solutions.face_detection
            with mp_face.FaceDetection(model_selection=1,
                                       min_detection_confidence=0.35) as detector:
                for fidx in sample_indices:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, fidx)
                    ret, frame = cap.read()
                    if not ret:
                        continue
                    rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = detector.process(rgb)
                    if results.detections:
                        for det in results.detections:
                            bb = det.location_data.relative_bounding_box
                            rx = max(0.0, min(1.0, bb.xmin + bb.width  / 2))
                            ry = max(0.0, min(1.0, bb.ymin + bb.height / 2))
                            centres.append((int(rx * src_w), int(ry * src_h)))
        else:
            # OpenCV Haar cascade fallback
            cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            for fidx in sample_indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, fidx)
                ret, frame = cap.read()
                if not ret:
                    continue
                small   = cv2.resize(frame, (320, int(frame.shape[0] * 320 / frame.shape[1])))
                gray    = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                scale_x = src_w / small.shape[1]
                scale_y = src_h / small.shape[0]
                faces   = cascade.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=4, minSize=(20, 20)
                )
                for (fx, fy, fw, fh) in faces:
                    centres.append((int((fx + fw / 2) * scale_x),
                                    int((fy + fh / 2) * scale_y)))

        cap.release()
        return centres, src_w, src_h
    except Exception:
        return [], 0, 0


def cluster_centres(centres, src_w):
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
    x = cx_desired - crop_w // 2
    y = cy_desired - crop_h // 2
    x = max(0, min(x, src_w - crop_w))
    y = max(0, min(y, src_h - crop_h))
    return x, y


# ── Get actual rendered video duration via ffprobe ────────────────────────────

def get_actual_duration(path: str) -> float:
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ], capture_output=True, text=True)
        return round(float(r.stdout.strip()), 1)
    except Exception:
        return 0.0


# ── ASS subtitle builder ───────────────────────────────────────────────────────

def make_ass(captions, hook, clip_duration, target_w, target_h, cap_style,
             show_hook=True, hook_full_duration=False):
    ref     = min(target_w, target_h)
    hook_fs = max(32, int(ref * 0.046))
    cap_fs  = max(24, int(ref * 0.030))
    top_mg  = max(40,  int(target_h * 0.035))
    bot_mg  = max(60,  int(target_h * 0.050))
    # 20 % each side → text lives in the centre 60 % of the frame
    side_mg = max(50,  int(target_w * 0.20))

    # Outline always thick black regardless of chosen caption style
    out_c     = "&H00000000"
    outline_w = 5
    bstyle    = 1   # outline + shadow mode
    shadow    = 1

    # Two caption font styles that mix for a professional, dynamic look.
    # libass picks up fonts from fontsdir; glyphs for non-Latin scripts
    # fall back automatically to system fonts that carry them.
    cap_fs2 = max(22, int(ref * 0.028))   # Montserrat is slightly wider → smaller

    # WrapStyle 1 = end-of-line wrap, respects margins — most reliable with libass
    header = (
        f"[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {target_w}\nPlayResY: {target_h}\n"
        f"ScaledBorderAndShadow: yes\nWrapStyle: 1\n\n"
        f"[V4+ Styles]\n"
        f"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        f"OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        f"ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        f"Alignment, MarginL, MarginR, MarginV, Encoding\n"
        # Hook — top-centre, Oswald (tall + impactful for titles)
        f"Style: HookTop,Oswald,{hook_fs},&H00FFFFFF,&H000000FF,{out_c},"
        f"&H00000000,1,0,0,0,100,100,1,0,{bstyle},{outline_w},{shadow},8,{side_mg},{side_mg},{top_mg},1\n"
        # Caption A — bottom-centre, Oswald Bold (chunky, high impact)
        f"Style: Caption,Oswald,{cap_fs},&H00FFFFFF,&H000000FF,{out_c},"
        f"&H00000000,1,0,0,0,100,100,0,0,{bstyle},{outline_w},{shadow},2,{side_mg},{side_mg},{bot_mg},1\n"
        # Caption B — bottom-centre, Montserrat Bold (clean, modern contrast)
        f"Style: Caption2,Montserrat,{cap_fs2},&H00FFFFFF,&H000000FF,{out_c},"
        f"&H00000000,1,0,0,0,100,100,0,0,{bstyle},{outline_w},{shadow},2,{side_mg},{side_mg},{bot_mg},1\n\n"
        f"[Events]\n"
        f"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events        = []
    color_counter = 0    # global word counter for colour cycling
    chunk_counter = 0    # global chunk counter for font alternation

    # Hook / title — colorised, top-centre (Oswald via HookTop style)
    if hook and show_hook:
        hook_end  = clip_duration if hook_full_duration else min(3.5, clip_duration * 0.20)
        safe_hook = hook.replace("\n", " ").replace(",", "，")
        colored   = colorize_words(safe_hook, color_counter)
        color_counter += len(safe_hook.split())
        events.append(
            f"Dialogue: 0,{ass_ts(0)},{ass_ts(hook_end)},HookTop,,0,0,0,,{{\\an8}}{colored}"
        )

    # Caption chunks — colorised, bottom-centre, 2 words each
    # Alternates between Caption (Oswald) and Caption2 (Montserrat) every chunk
    for cap in captions:
        s    = max(0.0, float(cap.get("start", 0)))
        e    = min(float(cap.get("end", s + 4)), clip_duration)
        text = str(cap.get("text", "")).strip()
        if not text or e <= s:
            continue
        words  = text.split()
        chunks = [" ".join(words[i:i+2]) for i in range(0, len(words), 2)]
        dur    = (e - s) / max(1, len(chunks))
        for i, chunk in enumerate(chunks):
            cs      = s + i * dur
            ce      = s + (i + 1) * dur
            display = chunk.upper() if cap_style in ("Bold Yellow", "Fire") else chunk
            colored = colorize_words(display.replace(",", "，"), color_counter)
            color_counter += len(display.split())
            # alternate font style every chunk for mixed-font effect
            style   = "Caption" if chunk_counter % 2 == 0 else "Caption2"
            chunk_counter += 1
            events.append(
                f"Dialogue: 0,{ass_ts(cs)},{ass_ts(ce)},{style},,0,0,0,,{{\\an2}}{colored}"
            )

    return header + "\n".join(events)


# ── ffprobe dimensions ─────────────────────────────────────────────────────────

def probe_dimensions(path: str):
    r = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", path,
    ], capture_output=True, text=True)
    d = json.loads(r.stdout)
    return d["streams"][0]["width"], d["streams"][0]["height"]


# ── Encode one crop ────────────────────────────────────────────────────────────

def encode_crop(raw_clip, out_path, cx, cy, crop_w, crop_h,
                target_w, target_h, ass_path, tmp_dir, add_sfx=False):
    """Crop + scale → burn ASS captions (+ optional SFX chime) → output MP4."""
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

    if add_sfx:
        sfx_expr = (
            "sin(2*PI*880*t)*exp(-t*6)*0.40+"
            "sin(2*PI*1320*t)*exp(-t*12)*0.20"
        )
        fc = (
            f"[0:v]subtitles={safe_ass}:fontsdir={safe_fonts}[vout];"
            f"aevalsrc={sfx_expr}:c=mono:s=44100:d=0.6[sfx];"
            "[0:a][sfx]amix=inputs=2:duration=first:dropout_transition=0.2[aout]"
        )
        cmd = [
            "ffmpeg", "-y", "-i", cropped,
            "-filter_complex", fc,
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-c:a", "aac",
            "-preset", "ultrafast", "-crf", "26", "-threads", "0",
            out_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-i", cropped,
            "-vf", f"subtitles={safe_ass}:fontsdir={safe_fonts}",
            "-c:v", "libx264", "-c:a", "aac",
            "-preset", "ultrafast", "-crf", "26", "-threads", "0",
            out_path,
        ]

    subprocess.run(cmd, check=True, capture_output=True)

    try:
        os.remove(cropped)
    except Exception:
        pass


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run(data: dict):
    input_video        = data["input_video"]
    output_path        = data["output_path"]
    start_time         = data["start_time"]
    end_time           = data["end_time"]
    aspect_ratio       = data.get("aspect_ratio",       "9:16")
    caption_style      = data.get("caption_style",      "Bold Yellow")
    hook               = data.get("hook",               "")
    captions           = data.get("captions",           [])
    show_hook          = data.get("show_hook",          True)
    hook_full_duration = data.get("hook_full_duration", False)
    add_sfx            = data.get("add_sfx",            False)

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
                         target_w, target_h, caption_style,
                         show_hook=show_hook,
                         hook_full_duration=hook_full_duration))

    outputs = []

    if split_output:
        left_avg  = avg_point(left_c)
        right_avg = avg_point(right_c)

        for label, pt in [("A", left_avg), ("B", right_avg)]:
            face_cx, face_cy = pt
            face_cy_adj = max(face_cy, int(crop_h * 0.30))
            cx, cy = clamp_crop(face_cx, face_cy_adj, src_w, src_h, crop_w, crop_h)
            out = f"{base}_{label}.mp4"
            encode_crop(raw_clip, out, cx, cy, crop_w, crop_h,
                        target_w, target_h, ass_path, tmp_dir, add_sfx=add_sfx)
            actual_dur = get_actual_duration(out)
            size_mb    = round(os.path.getsize(out) / 1024 / 1024, 2)
            outputs.append({
                "output": out, "size_mb": size_mb,
                "face_zone": "left" if label == "A" else "right",
                "duration_sec": actual_dur,
            })
    else:
        if centres:
            all_avg = avg_point(centres)
            face_cx, face_cy = all_avg
            if aspect_ratio == "9:16":
                face_cy = max(face_cy, int(crop_h * 0.30))
            cx, cy = clamp_crop(face_cx, face_cy, src_w, src_h, crop_w, crop_h)
        else:
            # No face detected — use true centre crop so subject stays in frame
            cx = (src_w - crop_w) // 2
            cy = (src_h - crop_h) // 2
            cx = max(0, min(cx, src_w - crop_w))
            cy = max(0, min(cy, src_h - crop_h))

        encode_crop(raw_clip, output_path, cx, cy, crop_w, crop_h,
                    target_w, target_h, ass_path, tmp_dir, add_sfx=add_sfx)
        actual_dur = get_actual_duration(output_path)
        size_mb    = round(os.path.getsize(output_path) / 1024 / 1024, 2)
        outputs.append({
            "output": output_path, "size_mb": size_mb,
            "face_zone": "full",
            "duration_sec": actual_dur,
        })

    # Cleanup
    for f in [raw_clip, ass_path]:
        try:
            os.remove(f)
        except Exception:
            pass

    print(json.dumps({
        "ok":           True,
        "outputs":      outputs,
        "duration_sec": outputs[0]["duration_sec"],
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
