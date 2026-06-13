---
name: Caption and clip rendering rules
description: Non-obvious decisions in create_clip.py that affect caption layout, face centering, and duration accuracy
---

## Caption font size
`cap_fs = max(24, int(ref * 0.030))` where `ref = min(target_w, target_h)`.
For 9:16 (1080px wide): 32px. For 16:9 (1080px tall): also 32px.
Hook title: `max(32, int(ref * 0.046))` — slightly larger than captions.

**Why:** Previous `ref * 0.052` → 56px caused captions to overflow horizontally past video edges.

## Caption chunk size
2-word chunks: `[" ".join(words[i:i+2]) for i in range(0, len(words), 2)]`

**Why:** 3-word chunks were too long; combined with large font caused horizontal overflow even with \an2 centering.

## Side margins (caption safe area)
`side_mg = max(50, int(target_w * 0.07))` applied as `MarginL` and `MarginR` in both Style definitions.
For 1080px wide: 75px each side → effective text area = 930px.

**Why:** MarginL=MarginR=0 combined with WrapStyle 0 let text overflow past frame edges. Margins constrain the libass text box.

## WrapStyle
`WrapStyle: 1` (end-of-line wrap) instead of 0 (smart wrap).

**Why:** WrapStyle 0 interfered with horizontal positioning when combined with \an2 override.

## Face detection fallback (no face detected)
```python
cx = (src_w - crop_w) // 2
cy = (src_h - crop_h) // 2
```
True center crop.

**Why:** Previous fallback used `cy = max(0, int(src_h * 0.10))` which cropped from 10% top, misframing center subjects.

## Actual rendered duration
`get_actual_duration(path)` uses ffprobe on the final output file and returns the real duration.
Returned as `duration_sec` in each output dict. Clipper route updates `jobClip.duration` with the real value.

**Why:** AI-suggested start/end times → keyframe snapping → actual render is shorter than requested. Displaying the AI estimate caused visible mismatches (e.g., "40s" badge on a 34s video).

## Hook full duration
`hook_full_duration` param in Python script + `hookFullDuration` in TS route.
When `True`: hook shows for `clip_duration`. When `False`: hook shows for `min(3.5, duration * 0.20)`.
Toggle in Clipper UI: "Start only" / "Full clip".
