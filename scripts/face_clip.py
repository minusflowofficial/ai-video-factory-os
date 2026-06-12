#!/usr/bin/env python3
"""
Face-centered video clipper with OpenCV face detection.

Usage:
  python3 face_clip.py <input_video> <start_time> <end_time> <output_path> [aspect_ratio]

  aspect_ratio: "9:16" (default, portrait) | "1:1" | "16:9"
  start_time / end_time: "HH:MM:SS" or "MM:SS" or seconds as float string

Outputs JSON result to stdout.
"""

import sys
import os
import cv2
import subprocess
import json
import math


def ts_to_sec(ts: str) -> float:
    """Convert HH:MM:SS or MM:SS timestamp to seconds."""
    ts = ts.strip()
    parts = ts.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        return float(parts[0])
    except ValueError:
        return 0.0


def sec_to_hms(secs: float) -> str:
    """Convert seconds to HH:MM:SS.mmm string for ffmpeg."""
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def detect_face_center(video_path: str, start_sec: float, end_sec: float, max_samples: int = 15):
    """
    Sample frames from [start_sec, end_sec] in video_path.
    Returns (cx_pct, cy_pct, vid_w, vid_h) where cx/cy are [0..1] fractions.
    If no face found, returns (None, None, vid_w, vid_h).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None, None, 0, 0

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    vid_w  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    vid_h  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    start_frame = max(0, int(start_sec * fps))
    end_frame   = min(total - 1, int(end_sec * fps))
    span        = max(end_frame - start_frame, 1)

    face_centers = []
    for i in range(max_samples):
        frame_idx = start_frame + int(i * span / max_samples)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        small  = cv2.resize(frame, (frame.shape[1] // 2, frame.shape[0] // 2))
        gray   = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        faces  = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30)
        )

        for (x, y, w, h) in faces:
            # Scale back to full-res coordinates
            cx = (x * 2 + w) / vid_w
            cy = (y * 2 + h) / vid_h
            face_centers.append((cx, cy))

    cap.release()

    if not face_centers:
        return None, None, vid_w, vid_h

    avg_cx = sum(c[0] for c in face_centers) / len(face_centers)
    avg_cy = sum(c[1] for c in face_centers) / len(face_centers)
    return avg_cx, avg_cy, vid_w, vid_h


def build_crop_filter(cx_pct, cy_pct, vid_w, vid_h, out_w, out_h):
    """
    Return an ffmpeg vf filter string that scales the input and crops
    to (out_w x out_h) centering on the detected face.
    """
    if cx_pct is None or vid_w == 0 or vid_h == 0:
        # Center crop fallback
        return (
            f"scale=-2:{out_h},"
            f"crop={out_w}:{out_h}:(iw-{out_w})/2:(ih-{out_h})/2,"
            f"setsar=1"
        )

    # Scale so the HEIGHT fills out_h (may overshoot width — then crop)
    scale_factor = out_h / vid_h
    scaled_w     = vid_w * scale_factor

    # Face x in scaled coordinates
    face_x_scaled = cx_pct * scaled_w

    # Crop x: center on face, clamped so crop stays within frame
    crop_x = face_x_scaled - out_w / 2
    crop_x = max(0.0, min(crop_x, scaled_w - out_w))
    crop_x = int(round(crop_x))

    # Face y in scaled coordinates (keep vertical center near face center)
    face_y_scaled = cy_pct * out_h
    crop_y = face_y_scaled - out_h / 2
    crop_y = max(0.0, min(crop_y, out_h - out_h))  # always 0 for height-fitted scale
    crop_y = int(round(crop_y))

    return (
        f"scale=-2:{out_h},"
        f"crop={out_w}:{out_h}:{crop_x}:{crop_y},"
        f"setsar=1"
    )


def clip_video(input_path, start_time, end_time, output_path, aspect_ratio="9:16"):
    start_sec = ts_to_sec(start_time)
    end_sec   = ts_to_sec(end_time)
    duration  = max(end_sec - start_sec, 0.5)

    # Output dimensions
    AR_MAP = {
        "9:16":  (720,  1280),
        "1:1":   (720,  720),
        "16:9":  (1280, 720),
    }
    out_w, out_h = AR_MAP.get(aspect_ratio, (720, 1280))

    # Detect face in source video
    cx_pct, cy_pct, vid_w, vid_h = detect_face_center(input_path, start_sec, end_sec)
    face_detected = cx_pct is not None

    vf = build_crop_filter(cx_pct, cy_pct, vid_w, vid_h, out_w, out_h)

    cmd = [
        "ffmpeg", "-y",
        "-ss", sec_to_hms(start_sec),
        "-i", input_path,
        "-t", f"{duration:.3f}",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        sys.exit(1)

    print(json.dumps({
        "success":      True,
        "outputPath":   output_path,
        "faceDetected": face_detected,
        "faceCenterX":  round(cx_pct, 3) if cx_pct else None,
        "faceCenterY":  round(cy_pct, 3) if cy_pct else None,
        "duration":     round(duration, 2),
        "aspectRatio":  aspect_ratio,
        "outputSize":   f"{out_w}x{out_h}",
    }))


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(
            "Usage: python3 face_clip.py <input_video> <start_time> <end_time>"
            " <output_path> [aspect_ratio]",
            file=sys.stderr,
        )
        sys.exit(1)

    clip_video(
        input_path   = sys.argv[1],
        start_time   = sys.argv[2],
        end_time     = sys.argv[3],
        output_path  = sys.argv[4],
        aspect_ratio = sys.argv[5] if len(sys.argv) > 5 else "9:16",
    )
