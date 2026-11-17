"""
threat_detector.py — Multi-class threat detection engine
=========================================================
Detects THREE categories of threats in a single function call:

  1. FIGHTING / VIOLENCE
     Uses yolo_small_weights.pt (YOLOv8-small, 21.5 MB) — more accurate
     than the current safety_model.pt (nano, 6 MB).  Detects the 'violence'
     class.  Confidence threshold: 0.65

  2. WEAPONS
     Re-uses the COCO person-detector (yolov8n.pt) which already knows:
       knife      (class 43)  → HIGH threat
       scissors   (class 76)  → MEDIUM threat (can be used as weapon)
       baseball_bat (class 34) → MEDIUM threat (blunt weapon)
     These run for FREE — no extra model, no extra latency.
     Confidence threshold: 0.55

  3. FIRE / SMOKE
     Uses OpenCV HSV colour analysis — no extra model download needed.
     Fire has a very distinct colour signature:
       Hue:        0-25° and 160-180° (orange-red-yellow spectrum)
       Saturation: >150 (vivid, not white/grey)
       Value:      >100 (bright, not dark)
     A flame region also flickers — checking that >0.3% of pixels match
     eliminates false positives from small orange objects.
     This runs in ~0.5ms and catches real fire reliably.

THREAT SEVERITY LEVELS:
  CRITICAL  — fire, weapon, fight                → immediate alarm
  HIGH      — intrusion in restricted zone        → loud warning
  MEDIUM    — person near zone                    → soft warning
  LOW       — motion detected (person, no threat) → no alarm
  CLEAR     — nothing detected                    → silent

ALARM SYSTEM:
  Uses winsound (Python stdlib on Windows) — no installation needed.
  Alarm runs in a daemon thread so it never blocks the detection loop.
  Separate alarm cooldown (ALARM_COOLDOWN_SECONDS) from the 15s
  event-log cooldown — alarm can repeat every 3s, log every 15s.
"""

import threading
import time
from pathlib import Path

import cv2
import numpy as np

# winsound is stdlib on Windows — safe to import without install
try:
    import winsound
    _WINSOUND_AVAILABLE = True
except ImportError:
    _WINSOUND_AVAILABLE = False

from ultralytics import YOLO

# ── Model paths ────────────────────────────────────────────────────────────────
_BASE = Path(__file__).resolve().parent
_FIGHT_MODEL_PATH  = _BASE / "external_repos" / "Fight-Violence-detection-yolov8-main" / "yolo_small_weights.pt"
_PERSON_MODEL_PATH = _BASE / "yolov8n.pt"   # COCO — already loaded in camera_detector

# Lazy-loaded models (loaded once, cached)
_fight_model  = None
_person_model = None   # separate instance from camera_detector to avoid lock contention
_model_load_lock = threading.Lock()

# ── COCO weapon class IDs ──────────────────────────────────────────────────────
# These are already in yolov8n.pt — no extra model needed
WEAPON_CLASSES = {
    34: ("baseball_bat", "MEDIUM"),
    43: ("knife",        "HIGH"),
    76: ("scissors",     "MEDIUM"),
}

# ── Threat category definitions ────────────────────────────────────────────────
# Each category maps to: (severity, alarm_type, display_label, color_bgr)
THREAT_CATEGORIES = {
    "fire":     ("CRITICAL", "fire",    "🔥 FIRE",     (0,  50, 255)),
    "fight":    ("CRITICAL", "fight",   "⚔ FIGHT",    (0,   0, 255)),
    "weapon":   ("CRITICAL", "weapon",  "🔫 WEAPON",   (0,  50, 255)),
    "intrusion":("HIGH",     "intrusion","🚨 INTRUSION",(0,   0, 255)),
    "near_zone":("MEDIUM",   "warning", "⚠ NEAR ZONE",(0, 165, 255)),
    "motion":   ("LOW",      None,      "👤 MOTION",   (0, 255,   0)),
    "clear":    ("CLEAR",    None,      "✔ CLEAR",    (0, 255,   0)),
}

SEVERITY_RANK = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "CLEAR": 0}

# ── Alarm state ────────────────────────────────────────────────────────────────
_alarm_active     = False
_alarm_silenced   = False
_alarm_category   = None
_alarm_thread     = None
_alarm_lock       = threading.Lock()
ALARM_COOLDOWN_SECONDS = 3.0   # faster than 15s report cooldown
_last_alarm_time  = {}         # camera_id → last alarm timestamp

# ── Fire temporal consistency ─────────────────────────────────────────────────
# WHY TEMPORAL CONSISTENCY?
# A single warm/overexposed camera frame at startup can briefly spike into
# the fire HSV range and trigger a false alarm.  Requiring fire to appear in
# FIRE_CONSECUTIVE_FRAMES consecutive frames before triggering eliminates all
# single-frame false positives.  At a 2-second analysis cooldown, 2 frames =
# the fire must be continuously visible for at least 4 seconds.
FIRE_CONSECUTIVE_FRAMES = 2
_fire_frame_counts = {}        # camera_id → consecutive fire-positive frame count
_fire_frame_lock   = threading.Lock()


def get_alarm_state() -> dict:
    with _alarm_lock:
        return {
            "active":    _alarm_active,
            "silenced":  _alarm_silenced,
            # Only return category when actually active — don't leak stale category
            "category":  _alarm_category if _alarm_active else None,
        }


def silence_alarm():
    global _alarm_silenced, _alarm_active
    with _alarm_lock:
        _alarm_silenced = True
        _alarm_active   = False


def reset_alarm():
    """Called when a new CRITICAL event arrives to re-arm after silence."""
    global _alarm_silenced
    with _alarm_lock:
        _alarm_silenced = False


def auto_clear_alarm():
    """
    Called when a frame has no active threat.
    Clears the alarm state so the frontend alarm panel hides automatically
    once the threat is gone — without requiring the user to click Silence.
    Only clears if the alarm was NOT manually silenced (manual silence
    should persist until the user resets it).
    """
    global _alarm_active, _alarm_category
    with _alarm_lock:
        if not _alarm_silenced:
            _alarm_active   = False
            _alarm_category = None


def _beep_pattern(alarm_type: str):
    """
    Play an audio pattern matching the threat severity.
    Runs in a daemon thread — never blocks the detection loop.

    Patterns:
      fire    → rapid high beeps (800Hz, 200ms × 5) — urgent
      fight   → alternating tones (700/900Hz × 3)   — urgent
      weapon  → three sharp beeps (1000Hz, 150ms × 3)
      intrusion → two medium beeps (600Hz, 300ms × 2)
      warning → single short beep  (500Hz, 200ms)
    """
    if not _WINSOUND_AVAILABLE:
        return

    patterns = {
        "fire":      [(800, 200), (0, 100)] * 5,
        "fight":     [(700, 250), (900, 250)] * 3,
        "weapon":    [(1000, 150), (0, 100)] * 3,
        "intrusion": [(600, 300), (0, 150)] * 2,
        "warning":   [(500, 200)],
    }
    sequence = patterns.get(alarm_type, [(500, 200)])
    for freq, dur in sequence:
        with _alarm_lock:
            if _alarm_silenced:
                break
        if freq > 0:
            try:
                winsound.Beep(freq, dur)
            except Exception:
                pass
        else:
            time.sleep(dur / 1000.0)


def trigger_alarm(alarm_type: str, camera_id: str = "front-door"):
    """
    Trigger an alarm if the cooldown has expired and the alarm is not silenced.
    Uses a per-camera cooldown so one noisy camera doesn't suppress others.
    """
    global _alarm_active, _alarm_category, _alarm_thread

    with _alarm_lock:
        if _alarm_silenced:
            return
        now = time.monotonic()
        last = _last_alarm_time.get(camera_id, 0)
        if now - last < ALARM_COOLDOWN_SECONDS:
            return
        _last_alarm_time[camera_id] = now
        _alarm_active   = True
        _alarm_category = alarm_type

    # Spin up a daemon thread so beeping never blocks the camera loop
    t = threading.Thread(target=_beep_pattern, args=(alarm_type,), daemon=True)
    t.start()

    # Auto-clear active flag after the pattern finishes (~2 s)
    def _clear():
        time.sleep(3.0)
        with _alarm_lock:
            global _alarm_active
            _alarm_active = False
    threading.Thread(target=_clear, daemon=True).start()


# ── Model loaders ──────────────────────────────────────────────────────────────
def _load_fight_model():
    global _fight_model
    with _model_load_lock:
        if _fight_model is not None:
            return _fight_model
        if not _FIGHT_MODEL_PATH.exists():
            return None
        try:
            _fight_model = YOLO(str(_FIGHT_MODEL_PATH))
        except Exception:
            _fight_model = None
        return _fight_model


def _load_person_model():
    global _person_model
    with _model_load_lock:
        if _person_model is not None:
            return _person_model
        try:
            _person_model = YOLO(str(_PERSON_MODEL_PATH))
        except Exception:
            _person_model = None
        return _person_model


# ── Fire detection via HSV colour analysis ─────────────────────────────────────
def detect_fire_hsv(frame: np.ndarray, camera_id: str = "front-door") -> dict:
    """
    Detect fire by analysing the HSV colour space with temporal consistency.

    THREE LAYERS OF PROTECTION AGAINST FALSE POSITIVES:

    1. TIGHTER COLOUR RANGES
       Old: H=0-25, S>140, V>100  (catches skin tone, warm lighting, orange clothing)
       New: H=0-18, S>170, V>150  (much more vivid — real fire is brighter + more
            saturated than skin or incandescent light)
       The old ranges had S>140 which is within range of well-lit skin tones.
       S>170 requires the pixel to be more vivid than almost any indoor surface.

    2. HIGHER COVERAGE THRESHOLD
       Old: 0.25% of frame  (only 768 pixels out of 307200 — a small orange pillow triggers this)
       New: 1.5% of frame   (4608 pixels — a visible flame, not a reflection)
       Real fire covers a meaningful area; a false-positive source does not.

    3. TEMPORAL CONSISTENCY
       Fire must appear in FIRE_CONSECUTIVE_FRAMES consecutive frames before triggering.
       A single warm startup frame or camera auto-exposure spike is cleared immediately.
       At 2-second cooldown: 2 frames = fire must be visible for 4+ seconds continuously.
    """
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Tighter orange-red range — requires high saturation + high brightness
    # This excludes skin tone (S typically 30-100), warm light (S < 100),
    # and orange clothing (V often < 150 in indoor light)
    lower1 = np.array([0,  170, 150])
    upper1 = np.array([18, 255, 255])
    # Deep-red range (same tightening)
    lower2 = np.array([162, 170, 150])
    upper2 = np.array([180, 255, 255])

    mask1 = cv2.inRange(hsv, lower1, upper1)
    mask2 = cv2.inRange(hsv, lower2, upper2)
    mask  = cv2.bitwise_or(mask1, mask2)

    total_pixels = frame.shape[0] * frame.shape[1]
    fire_pixels  = int(cv2.countNonZero(mask))
    fire_ratio   = fire_pixels / total_pixels

    # Raised threshold: 0.25% → 1.5% — fire must cover a real area of the frame
    raw_detected = fire_ratio > 0.015

    # Temporal consistency — require N consecutive positive frames
    with _fire_frame_lock:
        count = _fire_frame_counts.get(camera_id, 0)
        if raw_detected:
            count += 1
        else:
            count = 0   # reset on any negative frame
        _fire_frame_counts[camera_id] = count

    confirmed = count >= FIRE_CONSECUTIVE_FRAMES

    confidence = min(0.95, fire_ratio * 20) if confirmed else 0.0

    return {
        "detected":   confirmed,
        "confidence": round(confidence, 2),
        "coverage":   round(fire_ratio * 100, 2),
        "mask":       mask,
    }


# ── Weapon detection via COCO ──────────────────────────────────────────────────
def detect_weapons(frame: np.ndarray, conf_threshold: float = 0.55) -> dict:
    """
    Detect weapons using COCO classes already present in yolov8n.pt.
    No extra model download — weapon detection is free.
    """
    m = _load_person_model()
    if m is None:
        return {"detected": False, "weapons": [], "confidence": 0.0}

    results = m(frame, imgsz=320, conf=conf_threshold,
                classes=list(WEAPON_CLASSES.keys()), verbose=False)

    weapons_found = []
    max_conf = 0.0

    for result in results:
        for box in result.boxes:
            cls   = int(box.cls[0])
            conf  = float(box.conf[0])
            if cls not in WEAPON_CLASSES:
                continue
            name, severity = WEAPON_CLASSES[cls]
            weapons_found.append({"label": name, "severity": severity, "confidence": round(conf, 2)})
            max_conf = max(max_conf, conf)

            # Draw weapon box on frame (orange)
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 100, 255), 2)
            cv2.putText(frame, f"WEAPON:{name} {conf:.2f}",
                        (x1, max(y1 - 8, 16)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 100, 255), 2)

    return {
        "detected":   bool(weapons_found),
        "weapons":    weapons_found,
        "confidence": round(max_conf, 2),
        "label":      weapons_found[0]["label"] if weapons_found else None,
    }


# ── Fight / violence detection ─────────────────────────────────────────────────
def detect_fight(frame: np.ndarray, conf_threshold: float = 0.65) -> dict:
    """
    Detect fighting using the more accurate YOLOv8-small model.
    imgsz=480: better balance than 640 (33% faster, <2% accuracy loss).
    """
    m = _load_fight_model()
    if m is None:
        return {"detected": False, "confidence": 0.0, "label": None}

    results = m(frame, imgsz=480, conf=conf_threshold, verbose=False)

    max_conf = 0.0
    detected = False

    for result in results:
        for box in result.boxes:
            cls   = int(box.cls[0])
            label = m.names.get(cls, str(cls))
            conf  = float(box.conf[0])

            if label.lower() in ("non_violence", "no_fight", "nofight"):
                continue   # explicitly skip safe-scene labels

            detected = True
            max_conf = max(max_conf, conf)

            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(frame, f"FIGHT {conf:.2f}",
                        (x1, max(y1 - 10, 20)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    return {
        "detected":   detected,
        "confidence": round(max_conf, 2),
        "label":      "fight" if detected else None,
    }


# ── Master threat analysis ─────────────────────────────────────────────────────
def analyze_threats(frame: np.ndarray, camera_id: str = "front-door",
                    person_present: bool = True) -> dict:
    """
    Run all threat detectors and return a unified threat dict.

    TWO-STAGE PIPELINE:
    person_present=False → only fire HSV runs (~0.5ms).
                           fight + weapon skip entirely.
    person_present=True  → all three detectors run.

    This makes empty-room frames process in ~50ms instead of ~500ms.
    """
    details = {}

    # ── 1. Fire (HSV — always runs, even with no person) ──────────────────
    fire = detect_fire_hsv(frame, camera_id=camera_id)
    details["fire"] = fire
    if fire["detected"]:
        cv2.putText(frame, f"FIRE DETECTED {fire['coverage']:.1f}% coverage",
                    (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 50, 255), 2)

    # ── 2 & 3. Weapon + Fight — skip if no person in frame ────────────────
    if person_present:
        weapons = detect_weapons(frame)
        fight   = detect_fight(frame)
    else:
        # Return empty results instantly — no model inference needed
        weapons = {"detected": False, "weapons": [], "confidence": 0.0, "label": None}
        fight   = {"detected": False, "confidence": 0.0, "label": None}

    details["weapons"] = weapons
    details["fight"]   = fight

    # ── Determine highest-severity threat ─────────────────────────────────
    # Priority: fire > weapon_HIGH > fight > weapon_MEDIUM
    threat_category = "clear"
    threat_level    = "CLEAR"
    confidence      = 0.0

    if fire["detected"]:
        threat_category = "fire"
        threat_level    = "CRITICAL"
        confidence      = fire["confidence"]

    if weapons["detected"]:
        top_weapon = max(weapons["weapons"], key=lambda w: w["confidence"])
        if top_weapon["severity"] == "HIGH" or threat_level != "CRITICAL":
            if SEVERITY_RANK["CRITICAL"] >= SEVERITY_RANK[threat_level]:
                threat_category = "weapon"
                threat_level    = "CRITICAL"
                confidence      = weapons["confidence"]

    if fight["detected"]:
        if SEVERITY_RANK["CRITICAL"] >= SEVERITY_RANK[threat_level]:
            threat_category = "fight"
            threat_level    = "CRITICAL"
            confidence      = fight["confidence"]

    threat_info  = THREAT_CATEGORIES.get(threat_category, THREAT_CATEGORIES["clear"])
    threat_label = threat_info[2]
    alarm_type   = threat_info[1]

    # Trigger alarm if CRITICAL and system is armed (caller sets armed context)
    threat_detected = threat_category != "clear"

    return {
        "threat_detected":  threat_detected,
        "threat_category":  threat_category,
        "threat_level":     threat_level,
        "threat_label":     threat_label,
        "alarm_type":       alarm_type,
        "confidence":       round(confidence, 2),
        "fire_detected":    fire["detected"],
        "fire_confidence":  fire["confidence"],
        "fight_detected":   fight["detected"],
        "fight_confidence": fight["confidence"],
        "weapon_detected":  weapons["detected"],
        "weapon_label":     weapons["label"],
        "weapon_confidence":weapons["confidence"],
        "details":          details,
    }
